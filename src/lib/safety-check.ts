import { emptyPatientContext, type PatientContext } from "./patient";
import { evaluateRule, getRule, type ClinicalRule, type RuleEvaluation } from "./rules";
import { getLLMProvider, isUsingMockProvider } from "./llm";
import type { Concern, Extraction, SafetyCheckLLMRequest, StageTiming } from "./llm";

export interface RuleApplication {
  rule: ClinicalRule;
  evaluation: RuleEvaluation;
}

export interface SafetyConcern {
  condition: string;
  reason: string;
  evidence: string[];
  ruleApplications: RuleApplication[];
  additionalMissingInformation: string[];
}

export interface SafetyCheckResult {
  patient: PatientContext;
  concerns: SafetyConcern[];
  usedMockProvider: boolean;
}

/**
 * Domain-level pipeline events — what actually happened, independent of how
 * it's transported. The HTTP route layer maps these to wire NDJSON events;
 * the fixture script drains them into a plain `SafetyCheckResult`.
 *
 * Extraction and concern identification run concurrently (see
 * runSafetyCheckPipeline below), so a `concern` can arrive before `facts` or
 * vice versa — `concernRules` always follows its `concern` once patient
 * facts are available, whichever order that ends up being.
 */
export type SafetyCheckPipelineEvent =
  | { type: "facts"; patient: PatientContext; usedMockProvider: boolean }
  | { type: "concern"; index: number; concern: Concern }
  | { type: "concernRules"; index: number; ruleApplications: RuleApplication[] }
  | { type: "timing"; timing: StageTiming };

function extractionToPatientContext(
  extraction: Extraction,
  rawPresentation: string
): PatientContext {
  const patient = emptyPatientContext(rawPresentation);

  patient.demographics = {
    age: extraction.demographics.age,
    sex: extraction.demographics.sex,
  };
  patient.cancerDiagnosis = extraction.cancerDiagnosis;
  patient.activeTreatment = extraction.activeTreatment;

  patient.vitals = {
    heartRate: extraction.vitals.heartRate,
    systolicBP: extraction.vitals.systolicBP,
    diastolicBP: extraction.vitals.diastolicBP,
    respiratoryRate: extraction.vitals.respiratoryRate,
    temperature: extraction.vitals.temperature,
    oxygenSaturation: extraction.vitals.oxygenSaturation,
  };

  for (const lab of extraction.labs) {
    patient.labs[lab.name] = { value: lab.value, source: lab.source };
  }

  for (const concept of extraction.concepts) {
    patient.concepts[concept.id] = {
      value: concept.value,
      source: concept.source,
      evidence: concept.evidence,
    };
  }

  return patient;
}

function computeRuleApplications(concern: Concern, patient: PatientContext): RuleApplication[] {
  return concern.suggestedRuleIds
    .map((id) => getRule(id))
    .filter((rule): rule is ClinicalRule => !!rule)
    .map((rule) => ({ rule, evaluation: evaluateRule(rule, patient) }));
}

/**
 * Runs extraction and concern identification concurrently and yields domain
 * events in arrival order as each piece completes. The two model calls
 * don't depend on each other, so total latency tracks the slower of the
 * two rather than their sum.
 *
 * A concern's rule tables need patient facts to score against, so whichever
 * of {facts, concern} arrives second triggers the `concernRules` event for
 * any concern still waiting on it.
 */
export async function* runSafetyCheckPipeline(
  request: SafetyCheckLLMRequest,
  signal?: AbortSignal
): AsyncGenerator<SafetyCheckPipelineEvent> {
  const provider = getLLMProvider();
  const usedMockProvider = isUsingMockProvider();

  const queue: SafetyCheckPipelineEvent[] = [];
  let wake: (() => void) | null = null;
  let settled = false;
  let failure: unknown = null;

  function push(event: SafetyCheckPipelineEvent) {
    queue.push(event);
    wake?.();
    wake = null;
  }

  let patient: PatientContext | undefined;
  const rulesPending = new Map<number, Concern>();

  async function runExtractionWorker() {
    const { extraction, timing } = await provider.runExtraction(request, signal);
    push({ type: "timing", timing });

    patient = extractionToPatientContext(extraction, request.presentation);
    push({ type: "facts", patient, usedMockProvider });

    for (const [index, concern] of rulesPending) {
      push({ type: "concernRules", index, ruleApplications: computeRuleApplications(concern, patient) });
    }
    rulesPending.clear();
  }

  async function runConcernsWorker() {
    let index = 0;
    for await (const chunk of provider.streamConcerns(request, signal)) {
      if (chunk.type === "timing") {
        push({ type: "timing", timing: chunk.timing });
        continue;
      }

      const i = index++;
      push({ type: "concern", index: i, concern: chunk.concern });

      if (patient) {
        push({ type: "concernRules", index: i, ruleApplications: computeRuleApplications(chunk.concern, patient) });
      } else {
        rulesPending.set(i, chunk.concern);
      }
    }
  }

  Promise.all([runExtractionWorker(), runConcernsWorker()])
    .then(() => {
      settled = true;
      wake?.();
      wake = null;
    })
    .catch((err) => {
      failure = err;
      settled = true;
      wake?.();
      wake = null;
    });

  while (true) {
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    if (failure) throw failure;
    if (settled) return;
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
}

/** Full non-streaming pipeline — used by the fixture-generation script. */
export async function runSafetyCheck(request: SafetyCheckLLMRequest): Promise<SafetyCheckResult> {
  let patient: PatientContext | undefined;
  let usedMockProvider = false;
  const concerns = new Map<number, SafetyConcern>();

  for await (const event of runSafetyCheckPipeline(request)) {
    switch (event.type) {
      case "facts":
        patient = event.patient;
        usedMockProvider = event.usedMockProvider;
        break;
      case "concern":
        concerns.set(event.index, {
          condition: event.concern.condition,
          reason: event.concern.reason,
          evidence: event.concern.evidence,
          additionalMissingInformation: event.concern.additionalMissingInformation,
          ruleApplications: [],
        });
        break;
      case "concernRules": {
        const c = concerns.get(event.index);
        if (c) c.ruleApplications = event.ruleApplications;
        break;
      }
      case "timing":
        break;
    }
  }

  if (!patient) {
    throw new Error("Safety check pipeline finished without an extraction result.");
  }

  return {
    patient,
    usedMockProvider,
    concerns: [...concerns.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c),
  };
}
