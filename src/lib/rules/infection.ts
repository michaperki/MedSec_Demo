import type { ClinicalRule } from "./types";
import { ageThreshold, fromConcept, fromThreshold, labFact } from "./helpers";

export const qsofa: ClinicalRule = {
  id: "qsofa",
  name: "qSOFA (Quick SOFA)",
  purpose:
    "Bedside prompt to identify patients with suspected infection at higher risk of poor outcome outside the ICU. Not a diagnostic test for sepsis.",
  criteria: [
    {
      id: "resp_rate",
      label: "Respiratory rate ≥ 22/min",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.respiratoryRate, (v) => v >= 22, (v) => `${v}/min`),
    },
    {
      id: "altered_mentation",
      label: "Altered mentation (GCS < 15)",
      points: 1,
      resolve: (p) => fromConcept(p, "altered_mental_status"),
    },
    {
      id: "sbp",
      label: "Systolic BP ≤ 100 mmHg",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.systolicBP, (v) => v <= 100, (v) => `${v} mmHg`),
    },
  ],
  interpretation: [
    { minScore: 0, maxScore: 1, label: "Low qSOFA", guidance: "Lower risk by qSOFA alone — continue standard sepsis workup as clinically indicated." },
    { minScore: 2, maxScore: 3, label: "High qSOFA", guidance: "Associated with greater risk of mortality/prolonged ICU stay — prompt further assessment for organ dysfunction and consider escalation of care." },
  ],
  references: [
    {
      citation:
        "Singer M, et al. The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). JAMA. 2016;315(8):801-810.",
      verified: false,
    },
  ],
};

export const sirs: ClinicalRule = {
  id: "sirs",
  name: "SIRS Criteria",
  purpose:
    "Historical criteria for systemic inflammatory response; still widely used as an early flag for possible sepsis, especially relevant given the differential of neutropenic fever.",
  criteria: [
    {
      id: "temperature",
      label: "Temperature > 38°C or < 36°C",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.temperature, (v) => v > 38 || v < 36, (v) => `${v}°C`),
    },
    {
      id: "heart_rate",
      label: "Heart rate > 90 bpm",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.heartRate, (v) => v > 90, (v) => `${v} bpm`),
    },
    {
      id: "resp_rate",
      label: "Respiratory rate > 20/min",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.respiratoryRate, (v) => v > 20, (v) => `${v}/min`),
    },
    {
      id: "wbc",
      label: "WBC > 12 or < 4 ×10⁹/L",
      points: 1,
      resolve: (p) => fromThreshold(labFact(p, "wbc"), (v) => v > 12 || v < 4, (v) => `${v} ×10⁹/L`),
    },
  ],
  interpretation: [
    { minScore: 0, maxScore: 1, label: "SIRS negative", guidance: "Fewer than 2 criteria met." },
    { minScore: 2, maxScore: 4, label: "SIRS positive", guidance: "≥2 criteria met — consistent with a systemic inflammatory response; correlate with suspected infection source." },
  ],
  references: [
    {
      citation:
        "Bone RC, et al. Definitions for sepsis and organ failure. Chest. 1992;101(6):1644-1655.",
      verified: false,
    },
  ],
};

export const curb65: ClinicalRule = {
  id: "curb65",
  name: "CURB-65",
  purpose: "Severity assessment for community-acquired pneumonia; useful if a pulmonary infiltrate/pneumonia is on the differential.",
  criteria: [
    {
      id: "confusion",
      label: "Confusion (new disorientation to person, place, or time)",
      points: 1,
      resolve: (p) => fromConcept(p, "altered_mental_status"),
    },
    {
      id: "urea",
      label: "BUN > 19 mg/dL (urea > 7 mmol/L)",
      points: 1,
      resolve: (p) => fromThreshold(labFact(p, "bun"), (v) => v > 19, (v) => `${v} mg/dL`),
    },
    {
      id: "resp_rate",
      label: "Respiratory rate ≥ 30/min",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.respiratoryRate, (v) => v >= 30, (v) => `${v}/min`),
    },
    {
      id: "blood_pressure",
      label: "SBP < 90 mmHg or DBP ≤ 60 mmHg",
      points: 1,
      resolve: (p) => {
        const sbp = p.vitals.systolicBP;
        const dbp = p.vitals.diastolicBP;
        if (sbp === undefined && dbp === undefined) return { status: "unknown" };
        const low = (sbp?.value !== undefined && sbp.value < 90) || (dbp?.value !== undefined && dbp.value <= 60);
        return { status: low ? "yes" : "no" };
      },
    },
    {
      id: "age",
      label: "Age ≥ 65",
      points: 1,
      resolve: (p) => ageThreshold(p, (a) => a >= 65),
    },
  ],
  interpretation: [
    { minScore: 0, maxScore: 1, label: "Low severity", guidance: "Consider outpatient management if otherwise stable." },
    { minScore: 2, maxScore: 2, label: "Moderate severity", guidance: "Consider short inpatient admission or closely supervised outpatient care." },
    { minScore: 3, maxScore: 5, label: "High severity", guidance: "Consider inpatient admission; scores 4-5 may warrant ICU assessment." },
  ],
  references: [
    {
      citation:
        "Lim WS, et al. Defining community acquired pneumonia severity on presentation to hospital. Thorax. 2003;58(5):377-382.",
      verified: false,
    },
  ],
};

/**
 * MASCC risk index, simplified: the original tool has a 3-tier "burden of
 * illness" item (none/mild=5, moderate=3, severe=0). This extraction layer
 * only captures a boolean "severe symptom burden" concept, so the criterion
 * below resolves to the full 5 points or 0 — the intermediate 3-point tier
 * is not represented. Higher total score = lower risk (opposite direction
 * from the other rules in this registry).
 */
export const masccIndex: ClinicalRule = {
  id: "mascc",
  name: "MASCC Risk Index (Febrile Neutropenia)",
  purpose:
    "Identifies febrile neutropenic patients at low risk of medical complications who may be candidates for less intensive management. Higher score = lower risk.",
  criteria: [
    {
      id: "symptom_burden",
      label: "No or mild symptoms",
      points: 5,
      resolve: (p) => fromConcept(p, "severe_symptom_burden", true),
    },
    {
      id: "no_hypotension",
      label: "No hypotension (SBP ≥ 90 mmHg)",
      points: 5,
      resolve: (p) => fromConcept(p, "hypotension", true),
    },
    {
      id: "no_copd",
      label: "No chronic obstructive pulmonary disease",
      points: 4,
      resolve: (p) => fromConcept(p, "copd", true),
    },
    {
      id: "no_prior_fungal",
      label: "Solid tumor, or hematologic malignancy with no previous fungal infection",
      points: 4,
      resolve: (p) => fromConcept(p, "prior_fungal_infection", true),
    },
    {
      id: "no_dehydration",
      label: "No dehydration requiring IV fluids",
      points: 3,
      resolve: (p) => fromConcept(p, "dehydration", true),
    },
    {
      id: "outpatient_status",
      label: "Outpatient status at onset of fever",
      points: 3,
      resolve: (p) => fromConcept(p, "outpatient_at_fever_onset"),
    },
    {
      id: "age",
      label: "Age < 60",
      points: 2,
      resolve: (p) => ageThreshold(p, (a) => a < 60),
    },
  ],
  interpretation: [
    { minScore: 21, maxScore: 26, label: "Low risk", guidance: "Score ≥21 — may be a candidate for outpatient or early step-down management per institutional protocol." },
    { minScore: 0, maxScore: 20, label: "High risk", guidance: "Score <21 — high risk of medical complications; standard inpatient management generally indicated." },
  ],
  references: [
    {
      citation:
        "Klastersky J, et al. The Multinational Association for Supportive Care in Cancer risk index. J Clin Oncol. 2000;18(16):3038-3051.",
      verified: false,
    },
  ],
};

export const cisne: ClinicalRule = {
  id: "cisne",
  name: "CISNE (Clinical Index of Stable Febrile Neutropenia)",
  purpose:
    "For apparently stable outpatients with solid tumors and chemotherapy-induced fever/neutropenia — identifies those still at risk of serious complications.",
  criteria: [
    {
      id: "ecog_ps",
      label: "ECOG performance status ≥ 2",
      points: 2,
      resolve: (p) => fromConcept(p, "poor_performance_status"),
    },
    {
      id: "copd",
      label: "COPD",
      points: 1,
      resolve: (p) => fromConcept(p, "copd"),
    },
    {
      id: "cardiovascular_disease",
      label: "Chronic cardiovascular disease",
      points: 1,
      resolve: (p) => fromConcept(p, "chronic_cardiovascular_disease"),
    },
    {
      id: "mucositis",
      label: "NCI mucositis grade ≥ 2",
      points: 1,
      resolve: (p) => fromConcept(p, "mucositis_grade_2_or_higher"),
    },
    {
      id: "monocytes",
      label: "Monocytes < 200/mm³",
      points: 1,
      resolve: (p) => fromThreshold(labFact(p, "monocytes"), (v) => v < 200, (v) => `${v}/mm³`),
    },
    {
      id: "stress_hyperglycemia",
      label: "Stress-induced hyperglycemia",
      points: 2,
      resolve: (p) => fromConcept(p, "stress_hyperglycemia"),
    },
  ],
  interpretation: [
    { minScore: 0, maxScore: 0, label: "Low risk", guidance: "Low risk of complications — may be a candidate for outpatient management per institutional protocol." },
    { minScore: 1, maxScore: 2, label: "Intermediate risk", guidance: "Intermediate risk — close observation generally warranted." },
    { minScore: 3, maxScore: 8, label: "High risk", guidance: "High risk of serious complications — inpatient management generally indicated." },
  ],
  references: [
    {
      citation:
        "Carmona-Bayonas A, et al. Prediction of serious complications in patients with seemingly stable febrile neutropenia. J Clin Oncol. 2015;33(5):465-471.",
      verified: false,
    },
  ],
};
