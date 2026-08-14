import type { PatientContext } from "./patient";
import type { ConcernShellView, RuleView } from "./api-types";

/**
 * NDJSON events streamed from /api/safety-check, one JSON object per line.
 * Extraction and concern identification run concurrently and concerns
 * stream in as the model produces them, so `concern` may arrive before or
 * after `facts` — `concernRules` always follows once both a concern and
 * patient facts are available, whichever order that happens to be.
 */
export type SafetyCheckStreamEvent =
  | { type: "facts"; patient: PatientContext; usedMockProvider: boolean }
  | { type: "concern"; index: number; concern: ConcernShellView }
  | { type: "concernRules"; index: number; ruleApplications: RuleView[] }
  | { type: "timing"; stage: string; model: string; durationMs: number; inputTokens?: number; outputTokens?: number }
  | { type: "done" }
  | { type: "error"; message: string; kind: ErrorKind };

export type ErrorKind = "auth" | "timeout" | "refusal" | "unknown";

export function encodeEvent(event: SafetyCheckStreamEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}
