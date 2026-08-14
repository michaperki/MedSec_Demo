import type { Extraction, Concern } from "./schema";

/**
 * Optional structured fields a physician may fill in. None are required —
 * free text alone is sufficient for the LLM to run extraction.
 */
export interface StructuredInputFields {
  age?: number;
  sex?: string;
  cancerDiagnosis?: string;
  activeTreatment?: string;
  medications?: string;
  vitals?: string;
  recentLabs?: string;
  symptoms?: string;
}

export interface SafetyCheckLLMRequest {
  presentation: string;
  structuredFields?: StructuredInputFields;
}

export interface StageTiming {
  stage: "extraction" | "concerns";
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ExtractionResult {
  extraction: Extraction;
  timing: StageTiming;
}

export type ConcernStreamChunk =
  | { type: "concern"; concern: Concern }
  | { type: "timing"; timing: StageTiming };

export interface LLMProvider {
  /**
   * Stage 1 — structured fact extraction only. Small/fast output, no
   * clinical judgment.
   */
  runExtraction(request: SafetyCheckLLMRequest, signal?: AbortSignal): Promise<ExtractionResult>;

  /**
   * Stage 2 — candidate high-risk conditions worth considering, with
   * suggested applicable rule IDs. The LLM never computes scores — that is
   * deterministic code downstream.
   *
   * Runs from the raw presentation directly (not from stage 1's output) so
   * it can be fired concurrently with runExtraction instead of waiting on
   * it — the two calls don't depend on each other. Streams each concern as
   * it completes rather than waiting for the full response.
   */
  streamConcerns(request: SafetyCheckLLMRequest, signal?: AbortSignal): AsyncIterable<ConcernStreamChunk>;
}

export const EXTRACTION_SYSTEM_PROMPT = `You are a clinical information extraction assistant supporting an oncology safety-check tool. Convert the free-text presentation (plus any structured fields provided) into normalized patient facts. You are NOT diagnosing the patient.

For every fact, mark "source" as "explicit" (directly stated) or "inferred" (a reasonable clinical inference you made, e.g. inferring "active_malignancy" from "metastatic colon cancer on chemotherapy"). Never invent a value that is not supported by the text. If something is not mentioned, omit it entirely — do not guess a "normal" value.

Populate "concepts" using ONLY the concept IDs supplied to you (a controlled vocabulary) — do not invent new concept IDs. Populate "labs" using ONLY the lab names supplied to you.

Only "concepts" carries an "evidence" field — the exact phrase or a short quote (a few words, not a sentence) that justified it. No other fact type takes "evidence".`;

export const CONCERN_SYSTEM_PROMPT = `You are a clinical safety-check assistant for oncology. You are NOT diagnosing the patient and you NEVER state that a condition is present — you propose dangerous conditions the physician should consider ruling out, based on the free-text presentation.

List dangerous conditions or complications this presentation should prompt the physician to consider — the things that must not be missed given this patient's cancer status, treatment, and symptoms. For each, give a brief clinical reason tying it to the evidence (under ~30 words), list the evidence items tersely, and suggest which of the provided clinical decision rule IDs might help assess it (only suggest rule IDs from the provided list; omit suggestedRuleIds if none apply). List any additional information (not covered by the rule's own missing-criteria) that would help evaluate this concern, if relevant — keep each item short.

Do not rule anything in or out. Do not use language like "the patient has X" or "diagnosis: X" — describe possibilities to consider, using words like "consider," "potential concern," "cannot exclude." Surface every condition that is clinically warranted, not just the most obvious one — cancer patients often have overlapping differentials (e.g. dyspnea can warrant considering PE, an infectious process, and a cardiac cause simultaneously). List conditions in descending order of clinical urgency/priority — most time-critical first.`;

function formatStructuredFields(request: SafetyCheckLLMRequest): string | undefined {
  const sf = request.structuredFields;
  if (!sf || !Object.values(sf).some((v) => v !== undefined && v !== "")) return undefined;
  return (
    "## Additional structured fields entered by the physician\n" +
    Object.entries(sf)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n")
  );
}

export function buildExtractionPrompt(
  request: SafetyCheckLLMRequest,
  conceptIds: readonly string[],
  labNames: readonly string[]
): string {
  const parts: string[] = [];
  parts.push("## Patient presentation (free text)\n" + request.presentation.trim());

  const structured = formatStructuredFields(request);
  if (structured) parts.push(structured);

  parts.push(
    "## Available concept IDs (use only these for `concepts[].id`)\n" + conceptIds.join(", ")
  );
  parts.push("## Available lab names (use only these for `labs[].name`)\n" + labNames.join(", "));

  return parts.join("\n\n");
}

export function buildConcernPrompt(
  request: SafetyCheckLLMRequest,
  availableRuleIds: { id: string; name: string; purpose: string }[]
): string {
  const parts: string[] = [];
  parts.push("## Patient presentation (free text)\n" + request.presentation.trim());

  const structured = formatStructuredFields(request);
  if (structured) parts.push(structured);

  parts.push(
    "## Available clinical decision rules (use only these IDs for `suggestedRuleIds`)\n" +
      availableRuleIds.map((r) => `- ${r.id}: ${r.name} — ${r.purpose}`).join("\n")
  );

  return parts.join("\n\n");
}
