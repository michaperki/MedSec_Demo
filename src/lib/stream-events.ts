import type { PatientContext } from "./patient";
import type { ConcernView } from "./api-types";

/**
 * NDJSON events streamed from /api/safety-check, one JSON object per line.
 * Each event corresponds to a real pipeline transition, not a timer — the
 * client's staged progress indicator is driven directly off these.
 */
export type SafetyCheckStreamEvent =
  | { type: "facts"; patient: PatientContext; usedMockProvider: boolean }
  | { type: "stage"; stage: "assembling" }
  | { type: "concerns"; concerns: ConcernView[] }
  | { type: "done" }
  | { type: "error"; message: string; kind: ErrorKind };

export type ErrorKind = "auth" | "timeout" | "refusal" | "unknown";

export function encodeEvent(event: SafetyCheckStreamEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + "\n");
}
