import type { ConceptId, LabName } from "./concepts";

export type FactSource = "explicit" | "inferred";

export interface ClinicalFact<T = unknown> {
  value: T;
  source: FactSource;
}

/**
 * A boolean concept fact carries `evidence` — the quoted phrase that
 * justified it — because it's shown as the criterion detail text in rule
 * tables (see `fromConcept` in rules/helpers.ts). Numeric/string facts don't
 * carry evidence: nothing in the UI renders it for them, so the extraction
 * schema doesn't ask the model to produce it.
 */
export interface ConceptFact extends ClinicalFact<boolean> {
  evidence?: string;
}

export interface PatientContext {
  demographics: {
    age?: number;
    sex?: string;
  };
  cancerDiagnosis?: ClinicalFact<string>;
  activeTreatment?: ClinicalFact<string>;
  vitals: {
    heartRate?: ClinicalFact<number>;
    systolicBP?: ClinicalFact<number>;
    diastolicBP?: ClinicalFact<number>;
    respiratoryRate?: ClinicalFact<number>;
    temperature?: ClinicalFact<number>;
    oxygenSaturation?: ClinicalFact<number>;
  };
  labs: Partial<Record<LabName, ClinicalFact<number>>>;
  /**
   * Normalized clinical concepts extracted from free text — the substrate
   * deterministic rule criteria resolve against. Never populate a concept
   * the source text does not support; "unknown" means absent from the model,
   * not the same as "no" clinically.
   */
  concepts: Partial<Record<ConceptId, ConceptFact>>;
  rawPresentation: string;
}

export function emptyPatientContext(rawPresentation = ""): PatientContext {
  return {
    demographics: {},
    vitals: {},
    labs: {},
    concepts: {},
    rawPresentation,
  };
}
