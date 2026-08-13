import type { ClinicalRule, CriterionResult } from "./types";
import { labFact } from "./helpers";
import type { PatientContext } from "../patient";

/** Corrected calcium (mg/dL) = measured Ca + 0.8 * (4.0 - albumin g/dL). */
function correctedCalcium(patient: PatientContext): number | undefined {
  const ca = labFact(patient, "calcium")?.value;
  const albumin = labFact(patient, "albumin")?.value;
  if (ca === undefined || albumin === undefined) return undefined;
  return ca + 0.8 * (4.0 - albumin);
}

function tierCriterion(threshold: number): (patient: PatientContext) => CriterionResult {
  return (patient) => {
    const corrected = correctedCalcium(patient);
    if (corrected === undefined) return { status: "unknown" };
    return {
      status: corrected >= threshold ? "yes" : "no",
      detail: `corrected Ca ${corrected.toFixed(1)} mg/dL`,
    };
  };
}

export const correctedCalciumRule: ClinicalRule = {
  id: "corrected_calcium",
  name: "Albumin-Corrected Calcium",
  purpose:
    "Serum calcium is largely protein-bound; hypoalbuminemia (common in oncology patients) can mask true hypercalcemia unless corrected. Requires both a calcium and an albumin value — the app never estimates a missing one.",
  criteria: [
    { id: "mild", label: "Corrected calcium ≥ 10.5 mg/dL (mild hypercalcemia or higher)", points: 1, resolve: tierCriterion(10.5) },
    { id: "moderate", label: "Corrected calcium ≥ 12 mg/dL (moderate hypercalcemia or higher)", points: 1, resolve: tierCriterion(12) },
    { id: "severe", label: "Corrected calcium ≥ 14 mg/dL (severe / hypercalcemic crisis)", points: 1, resolve: tierCriterion(14) },
  ],
  interpretation: [
    { minScore: 0, maxScore: 0, label: "Normal", guidance: "Corrected calcium within normal range." },
    { minScore: 1, maxScore: 1, label: "Mild hypercalcemia", guidance: "10.5–11.9 mg/dL. Often manageable outpatient with hydration; correlate with symptoms." },
    { minScore: 2, maxScore: 2, label: "Moderate hypercalcemia", guidance: "12–13.9 mg/dL. Consider IV hydration ± bisphosphonate per severity and symptoms." },
    { minScore: 3, maxScore: 3, label: "Severe hypercalcemia / crisis", guidance: "≥14 mg/dL. Requires prompt treatment — IV hydration, calcitonin, bisphosphonate; evaluate for admission." },
  ],
  references: [
    {
      citation:
        "Payne RB, et al. Interpretation of serum calcium in patients with abnormal serum proteins. Br Med J. 1973;4(5893):643-646.",
      verified: false,
    },
  ],
};
