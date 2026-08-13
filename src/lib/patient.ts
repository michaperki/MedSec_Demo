import type { ConceptId, LabName } from "./concepts";

export type FactSource = "explicit" | "inferred";

export interface ClinicalFact<T = unknown> {
  value: T;
  source: FactSource;
  evidence?: string;
  confidence?: number;
}

export interface PatientContext {
  demographics: {
    age?: number;
    sex?: string;
  };
  cancerDiagnosis?: ClinicalFact<string>;
  activeTreatment?: ClinicalFact<string>;
  conditions: ClinicalFact<string>[];
  symptoms: ClinicalFact<string>[];
  medications: ClinicalFact<string>[];
  treatments: ClinicalFact<string>[];
  vitals: {
    heartRate?: ClinicalFact<number>;
    systolicBP?: ClinicalFact<number>;
    diastolicBP?: ClinicalFact<number>;
    respiratoryRate?: ClinicalFact<number>;
    temperature?: ClinicalFact<number>;
    oxygenSaturation?: ClinicalFact<number>;
  };
  labs: Partial<Record<LabName, ClinicalFact<number>>>;
  history: ClinicalFact<string>[];
  /**
   * Normalized clinical concepts extracted from free text — the substrate
   * deterministic rule criteria resolve against. Never populate a concept
   * the source text does not support; "unknown" means absent from the model,
   * not the same as "no" clinically.
   */
  concepts: Partial<Record<ConceptId, ClinicalFact<boolean>>>;
  rawPresentation: string;
}

export function emptyPatientContext(rawPresentation = ""): PatientContext {
  return {
    demographics: {},
    conditions: [],
    symptoms: [],
    medications: [],
    treatments: [],
    vitals: {},
    labs: {},
    history: [],
    concepts: {},
    rawPresentation,
  };
}
