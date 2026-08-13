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

export async function runSafetyCheck(
  request: SafetyCheckLLMRequest
): Promise<SafetyCheckResult> {
  const provider = getLLMProvider();
  const llmResponse = await provider.runExtraction(request);

  const patient = extractionToPatientContext(llmResponse.patientFacts, request.presentation);

  const concerns: SafetyConcern[] = llmResponse.potentialConcerns.map((concern) => {
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

  return {
    patient,
    concerns,
    usedMockProvider: isUsingMockProvider(),
  };
}
