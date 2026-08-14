import type { CriterionResult, Reference, ScoreBand } from "./rules";
import type { RuleApplication, SafetyCheckResult } from "./safety-check";
import type { Concern } from "./llm";

/** JSON-safe view of a rule criterion — no function fields. */
export interface CriterionView {
  id: string;
  label: string;
  points: number;
  requiresJudgment: boolean;
  result: CriterionResult;
}

export interface RuleView {
  id: string;
  name: string;
  purpose: string;
  references: Reference[];
  criteria: CriterionView[];
  knownScore: number;
  hasUnknowns: boolean;
  hasJudgmentCriteria: boolean;
  band?: ScoreBand;
  displayScore: string;
  missingInformation: string[];
}

export interface ConcernView {
  condition: string;
  reason: string;
  evidence: string[];
  ruleApplications: RuleView[];
  additionalMissingInformation: string[];
}

/** A concern's condition/reason/evidence, before its rule tables have joined. */
export interface ConcernShellView {
  condition: string;
  reason: string;
  evidence: string[];
  additionalMissingInformation: string[];
}

export function toConcernShellView(concern: Concern): ConcernShellView {
  return {
    condition: concern.condition,
    reason: concern.reason,
    evidence: concern.evidence,
    additionalMissingInformation: concern.additionalMissingInformation,
  };
}

export function toRuleViews(apps: RuleApplication[]): RuleView[] {
  return apps.map(toRuleView);
}

function toRuleView(app: RuleApplication): RuleView {
  const { rule, evaluation } = app;
  return {
    id: rule.id,
    name: rule.name,
    purpose: rule.purpose,
    references: rule.references,
    criteria: evaluation.criteria.map((c) => ({
      id: c.criterion.id,
      label: c.criterion.label,
      points: c.criterion.points,
      requiresJudgment: !!c.criterion.requiresJudgment,
      result: c.result,
    })),
    knownScore: evaluation.knownScore,
    hasUnknowns: evaluation.hasUnknowns,
    hasJudgmentCriteria: evaluation.hasJudgmentCriteria,
    band: evaluation.band,
    displayScore: evaluation.displayScore,
    missingInformation: evaluation.missingInformation,
  };
}

export function toConcernView(concern: SafetyCheckResult["concerns"][number]): ConcernView {
  return {
    condition: concern.condition,
    reason: concern.reason,
    evidence: concern.evidence,
    additionalMissingInformation: concern.additionalMissingInformation,
    ruleApplications: concern.ruleApplications.map(toRuleView),
  };
}
