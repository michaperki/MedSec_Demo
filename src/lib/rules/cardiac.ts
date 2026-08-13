import type { ClinicalRule } from "./types";
import { ageThreshold, fromConcept } from "./helpers";

/**
 * HEART score, simplified: the standard rule scores History, ECG, and
 * Troponin on a 0/1/2 scale. This prototype's extraction layer only reports
 * boolean concept presence, so each of those three criteria collapses to a
 * 0-or-2 (present/absent) resolution rather than the full 3-tier definition.
 * History is always physician judgment — it cannot be safely inferred from
 * free text alone.
 */
export const heartScore: ClinicalRule = {
  id: "heart_score",
  name: "HEART Score for Major Cardiac Events",
  purpose:
    "Risk-stratifies patients with chest pain for 6-week risk of major adverse cardiac events (MACE).",
  criteria: [
    {
      id: "history",
      label: "History moderately-to-highly suspicious for ACS",
      points: 2,
      requiresJudgment: true,
      resolve: () => ({ status: "requires_judgment" }),
    },
    {
      id: "ecg",
      label: "ECG shows significant ST deviation (not from LBBB/LVH/digoxin)",
      points: 2,
      resolve: (p) => fromConcept(p, "ecg_ischemic_changes"),
    },
    {
      id: "age",
      label: "Age ≥ 65",
      points: 2,
      resolve: (p) => ageThreshold(p, (a) => a >= 65),
    },
    {
      id: "risk_factors",
      label:
        "≥3 CAD risk factors (HTN, hyperlipidemia, diabetes, obesity, smoking, family history) or known atherosclerotic disease",
      points: 2,
      resolve: (p) => {
        const known = fromConcept(p, "known_cad_or_atherosclerosis");
        if (known.status === "yes") return known;
        const flags: (keyof typeof p.concepts)[] = [
          "hypertension",
          "hyperlipidemia",
          "diabetes",
          "obesity",
          "smoking",
          "family_history_early_cad",
        ];
        const reported = flags.map((f) => p.concepts[f]);
        if (reported.every((f) => !f)) return { status: "unknown" };
        const count = reported.filter((f) => f?.value).length;
        const anyUnknown = reported.some((f) => !f);
        if (count >= 3) return { status: "yes", detail: `${count} risk factors` };
        if (!anyUnknown) return { status: "no", detail: `${count} risk factors` };
        return { status: "unknown" };
      },
    },
    {
      id: "troponin",
      label: "Troponin elevated (> 3x normal limit)",
      points: 2,
      resolve: (p) => fromConcept(p, "troponin_elevated"),
    },
  ],
  interpretation: [
    { minScore: 0, maxScore: 3, label: "Low risk", guidance: "~1-2% 6-week MACE risk. Consider early discharge with outpatient follow-up per local protocol." },
    { minScore: 4, maxScore: 6, label: "Moderate risk", guidance: "~12-17% 6-week MACE risk. Consider admission for observation and further workup." },
    { minScore: 7, maxScore: 10, label: "High risk", guidance: "~50-65% 6-week MACE risk. Early invasive strategy generally warranted." },
  ],
  references: [
    {
      citation:
        "Six AJ, Backus BE, Kelder JC. Chest pain in the emergency room: value of the HEART score. Neth Heart J. 2008;16(6):191-196.",
      verified: false,
    },
  ],
};
