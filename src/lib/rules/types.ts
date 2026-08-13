import type { PatientContext } from "../patient";

export type CriterionStatus = "yes" | "no" | "unknown" | "requires_judgment";

export interface CriterionResult {
  status: CriterionStatus;
  /** Short human-readable note, e.g. the value that drove the resolution. */
  detail?: string;
}

export interface Criterion {
  id: string;
  label: string;
  /** Points added to the score when this criterion is met (0 for judgment-only items). */
  points: number;
  /** Deterministic resolver — the LLM is never asked to compute this. */
  resolve: (patient: PatientContext) => CriterionResult;
  /** True when a physician must assess this directly (score never auto-completes it). */
  requiresJudgment?: boolean;
}

export interface ScoreBand {
  minScore: number;
  maxScore: number;
  label: string;
  guidance: string;
}

export interface Reference {
  citation: string;
  url?: string;
  verified: boolean;
}

export interface ClinicalRule {
  id: string;
  name: string;
  purpose: string;
  criteria: Criterion[];
  interpretation: ScoreBand[];
  references: Reference[];
}

export interface CriterionEvaluation {
  criterion: Criterion;
  result: CriterionResult;
}

export interface RuleEvaluation {
  rule: ClinicalRule;
  criteria: CriterionEvaluation[];
  /** Sum of points for criteria resolved "yes". */
  knownScore: number;
  /** True if any criterion could not be resolved from available data. */
  hasUnknowns: boolean;
  /** True if any criterion requires direct physician assessment. */
  hasJudgmentCriteria: boolean;
  /** Populated only when every criterion resolved yes/no (fully computable). */
  band?: ScoreBand;
  /** Human-facing score string, e.g. "2.5" or "2.5 + criteria requiring physician judgment". */
  displayScore: string;
  missingInformation: string[];
}

export function evaluateRule(
  rule: ClinicalRule,
  patient: PatientContext
): RuleEvaluation {
  const criteria: CriterionEvaluation[] = rule.criteria.map((criterion) => ({
    criterion,
    result: criterion.resolve(patient),
  }));

  let knownScore = 0;
  let hasUnknowns = false;
  let hasJudgmentCriteria = false;
  const missingInformation: string[] = [];

  for (const { criterion, result } of criteria) {
    if (result.status === "yes") {
      knownScore += criterion.points;
    } else if (result.status === "unknown") {
      hasUnknowns = true;
      missingInformation.push(criterion.label);
    } else if (result.status === "requires_judgment") {
      hasJudgmentCriteria = true;
      missingInformation.push(criterion.label);
    }
  }

  const fullyComputable = !hasUnknowns && !hasJudgmentCriteria;
  const band = fullyComputable
    ? rule.interpretation.find(
        (b) => knownScore >= b.minScore && knownScore <= b.maxScore
      )
    : undefined;

  const scoreLabel = Number.isInteger(knownScore)
    ? String(knownScore)
    : knownScore.toFixed(1);

  let displayScore = scoreLabel;
  if (hasJudgmentCriteria && hasUnknowns) {
    displayScore = `${scoreLabel} + missing data + criteria requiring physician judgment`;
  } else if (hasJudgmentCriteria) {
    displayScore = `${scoreLabel} + criteria requiring physician judgment`;
  } else if (hasUnknowns) {
    displayScore = `${scoreLabel} + missing data — cannot calculate final score`;
  }

  return {
    rule,
    criteria,
    knownScore,
    hasUnknowns,
    hasJudgmentCriteria,
    band,
    displayScore,
    missingInformation,
  };
}
