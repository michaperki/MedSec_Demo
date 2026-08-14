import { NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { runSafetyCheckPipeline } from "@/lib/safety-check";
import { toConcernShellView, toRuleViews } from "@/lib/api-types";
import { encodeEvent, type ErrorKind } from "@/lib/stream-events";

// 300s is the highest maxDuration every Vercel plan (including Hobby)
// accepts with Fluid Compute — see the DEADLINE_MS race below for the
// actual ceiling we hold ourselves to, well inside this.
export const maxDuration = 300;

// The pipeline races against this and always emits a terminal `error` event
// and closes the stream if it's exceeded — the client must never be left
// with an open connection and no terminal event. Comfortably below
// maxDuration so we always get to respond gracefully instead of the
// platform killing the function out from under us.
const DEADLINE_MS = 50_000;

const RequestSchema = z.object({
  presentation: z.string().min(1, "Presentation text is required."),
  structuredFields: z
    .object({
      age: z.number().optional(),
      sex: z.string().optional(),
      cancerDiagnosis: z.string().optional(),
      activeTreatment: z.string().optional(),
      medications: z.string().optional(),
      vitals: z.string().optional(),
      recentLabs: z.string().optional(),
      symptoms: z.string().optional(),
    })
    .optional(),
});

function classifyError(err: unknown): { message: string; kind: ErrorKind } {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return {
      message: "The AI service isn't configured correctly. This is a setup problem, not something retrying will fix.",
      kind: "auth",
    };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return { message: "The request timed out. Try again — it usually goes through on retry.", kind: "timeout" };
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return { message: "The AI service is temporarily busy. Wait a moment and try again.", kind: "timeout" };
  }
  if (err instanceof Error && err.message.includes("declined to process")) {
    return { message: err.message, kind: "refusal" };
  }
  return { message: "Something went wrong running the safety check. Try again.", kind: "unknown" };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be valid JSON." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request.", details: parsed.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const request = parsed.data;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      const abortController = new AbortController();
      let closed = false;

      function sendTerminal(event: { type: "done" } | { type: "error"; message: string; kind: ErrorKind }) {
        if (closed) return;
        closed = true;
        controller.enqueue(encodeEvent(event));
        controller.close();
      }

      const pipeline = runSafetyCheckPipeline(request, abortController.signal);
      // Held across loop iterations so a timeout tick never issues a second
      // concurrent .next() call while the first is still outstanding.
      let pendingNext = pipeline.next();

      try {
        while (true) {
          const remaining = DEADLINE_MS - (Date.now() - startedAt);
          if (remaining <= 0) {
            abortController.abort();
            console.error(`Safety check exceeded ${DEADLINE_MS}ms deadline; aborting.`);
            sendTerminal({
              type: "error",
              message: "This is taking longer than expected and was stopped. Try again.",
              kind: "timeout",
            });
            return;
          }

          const timeout = new Promise<"timeout">((resolve) => {
            setTimeout(() => resolve("timeout"), remaining);
          });
          const result = await Promise.race([pendingNext, timeout]);

          if (result === "timeout") {
            continue; // pendingNext is still outstanding; loop re-checks remaining above
          }
          if (result.done) {
            sendTerminal({ type: "done" });
            return;
          }

          pendingNext = pipeline.next();
          const event = result.value;
          switch (event.type) {
            case "facts":
              controller.enqueue(
                encodeEvent({ type: "facts", patient: event.patient, usedMockProvider: event.usedMockProvider })
              );
              break;
            case "concern":
              controller.enqueue(
                encodeEvent({ type: "concern", index: event.index, concern: toConcernShellView(event.concern) })
              );
              break;
            case "concernRules":
              controller.enqueue(
                encodeEvent({
                  type: "concernRules",
                  index: event.index,
                  ruleApplications: toRuleViews(event.ruleApplications),
                })
              );
              break;
            case "timing":
              console.log(
                `[safety-check timing] stage=${event.timing.stage} model=${event.timing.model} ` +
                  `durationMs=${Math.round(event.timing.durationMs)} inputTokens=${event.timing.inputTokens ?? "?"} ` +
                  `outputTokens=${event.timing.outputTokens ?? "?"}`
              );
              controller.enqueue(
                encodeEvent({
                  type: "timing",
                  stage: event.timing.stage,
                  model: event.timing.model,
                  durationMs: Math.round(event.timing.durationMs),
                  inputTokens: event.timing.inputTokens,
                  outputTokens: event.timing.outputTokens,
                })
              );
              break;
          }
        }
      } catch (err) {
        console.error("Safety check failed:", err);
        sendTerminal({ type: "error", ...classifyError(err) });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
