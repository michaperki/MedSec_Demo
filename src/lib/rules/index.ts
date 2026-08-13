import { wellsPE, wellsDVT, perc } from "./pe-dvt";
import { heartScore } from "./cardiac";
import { qsofa, sirs, curb65, masccIndex, cisne } from "./infection";
import { correctedCalciumRule } from "./calculators";
import type { ClinicalRule } from "./types";

export const RULE_REGISTRY: ClinicalRule[] = [
  wellsPE,
  wellsDVT,
  perc,
  heartScore,
  qsofa,
  sirs,
  curb65,
  masccIndex,
  cisne,
  correctedCalciumRule,
];

export const RULES_BY_ID: Record<string, ClinicalRule> = Object.fromEntries(
  RULE_REGISTRY.map((r) => [r.id, r])
);

export function getRule(id: string): ClinicalRule | undefined {
  return RULES_BY_ID[id];
}

export * from "./types";
