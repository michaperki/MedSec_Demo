import type { ClinicalRule } from "./types";
import { ageThreshold, fromConcept, fromThreshold } from "./helpers";

export const wellsPE: ClinicalRule = {
  id: "wells_pe",
  name: "Wells' Criteria for Pulmonary Embolism",
  purpose:
    "Estimates pretest probability of PE to guide the need for D-dimer testing or imaging.",
  criteria: [
    {
      id: "dvt_signs",
      label: "Clinical signs and symptoms of DVT",
      points: 3,
      resolve: (p) => fromConcept(p, "dvt_signs"),
    },
    {
      id: "pe_most_likely",
      label: "PE is the #1 diagnosis, or equally likely",
      points: 3,
      requiresJudgment: true,
      resolve: () => ({ status: "requires_judgment" }),
    },
    {
      id: "heart_rate",
      label: "Heart rate > 100 bpm",
      points: 1.5,
      resolve: (p) =>
        fromThreshold(p.vitals.heartRate, (v) => v > 100, (v) => `${v} bpm`),
    },
    {
      id: "immobilization",
      label: "Immobilization ≥3 days or surgery in the previous 4 weeks",
      points: 1.5,
      resolve: (p) => fromConcept(p, "bedridden_or_immobilized"),
    },
    {
      id: "prior_vte",
      label: "Previous, objectively diagnosed PE or DVT",
      points: 1.5,
      resolve: (p) => fromConcept(p, "prior_vte"),
    },
    {
      id: "hemoptysis",
      label: "Hemoptysis",
      points: 1,
      resolve: (p) => fromConcept(p, "hemoptysis"),
    },
    {
      id: "malignancy",
      label: "Malignancy (treatment within 6 months, or palliative)",
      points: 1,
      resolve: (p) => fromConcept(p, "active_malignancy"),
    },
  ],
  interpretation: [
    { minScore: 0, maxScore: 1.5, label: "Low probability", guidance: "PE unlikely on clinical grounds alone." },
    { minScore: 2, maxScore: 6, label: "Moderate probability", guidance: "Further testing (D-dimer or imaging) generally indicated." },
    { minScore: 6.5, maxScore: 99, label: "High probability", guidance: "Imaging generally indicated; consider empiric anticoagulation while awaiting results per local protocol." },
  ],
  references: [
    {
      citation:
        "Wells PS, et al. Derivation of a simple clinical model to categorize patients probability of pulmonary embolism. Thromb Haemost. 2000;83(3):416-420.",
      verified: false,
    },
  ],
};

export const wellsDVT: ClinicalRule = {
  id: "wells_dvt",
  name: "Wells' Criteria for DVT",
  purpose: "Estimates pretest probability of lower-extremity deep vein thrombosis.",
  criteria: [
    {
      id: "active_cancer",
      label: "Active cancer (treatment within 6 months, or palliative)",
      points: 1,
      resolve: (p) => fromConcept(p, "active_malignancy"),
    },
    {
      id: "paralysis_immobilization",
      label: "Paralysis, paresis, or recent leg immobilization",
      points: 1,
      resolve: (p) => fromConcept(p, "leg_paralysis_or_immobilization"),
    },
    {
      id: "bedridden",
      label: "Bedridden ≥3 days, or major surgery within 12 weeks",
      points: 1,
      resolve: (p) => fromConcept(p, "bedridden_or_immobilized"),
    },
    {
      id: "deep_vein_tenderness",
      label: "Localized tenderness along the deep venous system",
      points: 1,
      resolve: (p) => fromConcept(p, "deep_vein_tenderness"),
    },
    {
      id: "entire_leg_swollen",
      label: "Entire leg swollen",
      points: 1,
      resolve: (p) => fromConcept(p, "entire_leg_swelling"),
    },
    {
      id: "calf_swelling",
      label: "Calf swelling >3 cm compared to the asymptomatic leg",
      points: 1,
      resolve: (p) => fromConcept(p, "calf_swelling_gt_3cm"),
    },
    {
      id: "pitting_edema",
      label: "Pitting edema confined to the symptomatic leg",
      points: 1,
      resolve: (p) => fromConcept(p, "unilateral_pitting_edema"),
    },
    {
      id: "collateral_veins",
      label: "Collateral (non-varicose) superficial veins",
      points: 1,
      resolve: (p) => fromConcept(p, "collateral_superficial_veins"),
    },
    {
      id: "prior_dvt",
      label: "Previously documented DVT",
      points: 1,
      resolve: (p) => fromConcept(p, "prior_vte"),
    },
    {
      id: "alternative_diagnosis",
      label: "Alternative diagnosis at least as likely as DVT",
      points: -2,
      requiresJudgment: true,
      resolve: () => ({ status: "requires_judgment" }),
    },
  ],
  interpretation: [
    { minScore: -2, maxScore: 0, label: "Low probability", guidance: "DVT unlikely on clinical grounds alone." },
    { minScore: 1, maxScore: 2, label: "Moderate probability", guidance: "Further testing (D-dimer or ultrasound) generally indicated." },
    { minScore: 3, maxScore: 99, label: "High probability", guidance: "Ultrasound generally indicated." },
  ],
  references: [
    {
      citation:
        "Wells PS, et al. Value of assessment of pretest probability of deep-vein thrombosis in clinical management. Lancet. 1997;350(9094):1795-1798.",
      verified: false,
    },
  ],
};

export const perc: ClinicalRule = {
  id: "perc",
  name: "PERC Rule (Pulmonary Embolism Rule-out Criteria)",
  purpose:
    "In patients already judged low pretest probability for PE, a fully negative PERC rules out PE without further testing. Not valid if pretest probability is not low.",
  criteria: [
    {
      id: "age",
      label: "Age ≥ 50",
      points: 1,
      resolve: (p) => ageThreshold(p, (a) => a >= 50),
    },
    {
      id: "heart_rate",
      label: "Heart rate ≥ 100 bpm",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.heartRate, (v) => v >= 100, (v) => `${v} bpm`),
    },
    {
      id: "spo2",
      label: "SpO₂ < 95% on room air",
      points: 1,
      resolve: (p) => fromThreshold(p.vitals.oxygenSaturation, (v) => v < 95, (v) => `${v}%`),
    },
    {
      id: "unilateral_leg_swelling",
      label: "Unilateral leg swelling",
      points: 1,
      resolve: (p) => fromConcept(p, "unilateral_leg_swelling"),
    },
    {
      id: "hemoptysis",
      label: "Hemoptysis",
      points: 1,
      resolve: (p) => fromConcept(p, "hemoptysis"),
    },
    {
      id: "recent_surgery_trauma",
      label: "Recent surgery or trauma requiring general anesthesia (≤4 weeks)",
      points: 1,
      resolve: (p) => fromConcept(p, "recent_surgery_or_trauma"),
    },
    {
      id: "prior_vte",
      label: "Prior PE or DVT",
      points: 1,
      resolve: (p) => fromConcept(p, "prior_vte"),
    },
    {
      id: "hormone_use",
      label: "Hormone use (oral contraceptives, HRT, or estrogenic hormones)",
      points: 1,
      resolve: (p) => fromConcept(p, "estrogen_use"),
    },
  ],
  interpretation: [
    { minScore: 0, maxScore: 0, label: "PERC negative", guidance: "If pretest probability is genuinely low, PE can be excluded without D-dimer or imaging." },
    { minScore: 1, maxScore: 99, label: "PERC positive", guidance: "Cannot rule out PE on PERC alone — proceed to D-dimer or imaging per pretest probability." },
  ],
  references: [
    {
      citation:
        "Kline JA, et al. Clinical criteria to prevent unnecessary diagnostic testing in emergency department patients with suspected pulmonary embolism. J Thromb Haemost. 2004;2(8):1247-1255.",
      verified: false,
    },
  ],
};
