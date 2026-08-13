import type { ConceptId, LabName } from "../concepts";
import type { ClinicalFact, PatientContext } from "../patient";
import type { CriterionResult } from "./types";

/** Resolve a boolean concept fact — unknown means the extractor never reported it. */
export function fromConcept(
  patient: PatientContext,
  id: ConceptId,
  negate = false
): CriterionResult {
  const fact = patient.concepts[id];
  if (!fact) return { status: "unknown" };
  const value = negate ? !fact.value : fact.value;
  return {
    status: value ? "yes" : "no",
    detail: fact.evidence,
  };
}

/** Resolve a numeric vital/lab threshold. */
export function fromThreshold(
  fact: ClinicalFact<number> | undefined,
  test: (value: number) => boolean,
  format?: (value: number) => string
): CriterionResult {
  if (!fact || fact.value === undefined || fact.value === null) {
    return { status: "unknown" };
  }
  return {
    status: test(fact.value) ? "yes" : "no",
    detail: format ? format(fact.value) : String(fact.value),
  };
}

export function labFact(
  patient: PatientContext,
  name: LabName
): ClinicalFact<number> | undefined {
  return patient.labs[name];
}

export function ageThreshold(
  patient: PatientContext,
  test: (age: number) => boolean
): CriterionResult {
  const age = patient.demographics.age;
  if (age === undefined) return { status: "unknown" };
  return { status: test(age) ? "yes" : "no", detail: `${age} years` };
}
