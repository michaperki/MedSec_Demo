import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runSafetyCheck } from "@/lib/safety-check";
import { toApiResult } from "@/lib/api-types";

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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await runSafetyCheck(parsed.data);
    return NextResponse.json(toApiResult(result));
  } catch (err) {
    console.error("Safety check failed:", err);
    const message = err instanceof Error ? err.message : "Safety check failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
