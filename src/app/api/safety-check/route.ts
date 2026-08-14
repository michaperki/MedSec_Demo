import { NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { extractPatientFacts, identifyAndScoreConcerns } from "@/lib/safety-check";
import { toConcernView } from "@/lib/api-types";
import { encodeEvent, type ErrorKind } from "@/lib/stream-events";

// A live run (extraction + concern identification, both real model calls)
// typically takes 15-30s. Give real headroom above that so a slow request
// never gets killed mid-flight.
export const maxDuration = 60;

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
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
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
      try {
        const { patient, extraction, usedMockProvider } = await extractPatientFacts(request);
        controller.enqueue(encodeEvent({ type: "facts", patient, usedMockProvider }));

        controller.enqueue(encodeEvent({ type: "stage", stage: "assembling" }));
        const concerns = await identifyAndScoreConcerns(request, extraction, patient);

        controller.enqueue(
          encodeEvent({ type: "concerns", concerns: concerns.map(toConcernView) })
        );
        controller.enqueue(encodeEvent({ type: "done" }));
      } catch (err) {
        console.error("Safety check failed:", err);
        controller.enqueue(encodeEvent({ type: "error", ...classifyError(err) }));
      } finally {
        controller.close();
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
