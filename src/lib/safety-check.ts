import { emptyPatientContext, type PatientContext } from "./patient";
import { evaluateRule, getRule, type ClinicalRule, type RuleEvaluation } from "./rules";
import { getLLMProvider, isUsingMockProvider } from "./llm";
import type { Extraction, SafetyCheckLLMRequest } from "./llm";

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
  patient.symptoms = extraction.symptoms;
  patient.conditions = extraction.conditions;
  patient.medications = extraction.medications;
  patient.treatments = extraction.treatments;
  patient.history = extraction.history;

  patient.vitals = {
    heartRate: extraction.vitals.heartRate,
    systolicBP: extraction.vitals.systolicBP,
    diastolicBP: extraction.vitals.diastolicBP,
    respiratoryRate: extraction.vitals.respiratoryRate,
    temperature: extraction.vitals.temperature,
    oxygenSaturation: extraction.vitals.oxygenSaturation,
  };

  for (const lab of extraction.labs) {
    patient.labs[lab.name] = {
      value: lab.value,
      source: lab.source,
      evidence: lab.evidence,
      confidence: lab.confidence,
    };
  }

  for (const concept of extraction.concepts) {
    patient.concepts[concept.id] = {
      value: concept.value,
      source: concept.source,
      evidence: concept.evidence,
      confidence: concept.confidence,
    };
  }

  return patient;
}

/** Stage 1 — extraction only. Fast, small model; no clinical judgment. */
export async function extractPatientFacts(
  request: SafetyCheckLLMRequest
): Promise<{ patient: PatientContext; extraction: Extraction; usedMockProvider: boolean }> {
  const provider = getLLMProvider();
  const extraction = await provider.runExtraction(request);
  const patient = extractionToPatientContext(extraction, request.presentation);
  return { patient, extraction, usedMockProvider: isUsingMockProvider() };
}

/** Stage 2 — candidate concerns + rule suggestions, then deterministic local scoring. */
export async function identifyAndScoreConcerns(
  request: SafetyCheckLLMRequest,
  extraction: Extraction,
  patient: PatientContext
): Promise<SafetyConcern[]> {
  const provider = getLLMProvider();
  const concerns = await provider.identifyConcerns(request, extraction);

  return concerns.map((concern) => {
    const ruleApplications: RuleApplication[] = concern.suggestedRuleIds
      .map((id) => getRule(id))
      .filter((rule): rule is ClinicalRule => !!rule)
      .map((rule) => ({ rule, evaluation: evaluateRule(rule, patient) }));

    return {
      condition: concern.condition,
      reason: concern.reason,
      evidence: concern.evidence,
      ruleApplications,
      additionalMissingInformation: concern.additionalMissingInformation,
    };
  });
}

/** Full non-streaming pipeline — used by the fixture-generation script. */
export async function runSafetyCheck(
  request: SafetyCheckLLMRequest
): Promise<SafetyCheckResult> {
  const { patient, extraction, usedMockProvider } = await extractPatientFacts(request);
  const concerns = await identifyAndScoreConcerns(request, extraction, patient);
  return { patient, concerns, usedMockProvider };
}
