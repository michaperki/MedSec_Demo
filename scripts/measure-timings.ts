/**
 * Measures per-stage timing against the live Anthropic API for the 5 demo
 * cases plus one free-text case. Run:
 *   env -u ANTHROPIC_API_KEY npx tsx --env-file=.env scripts/measure-timings.ts
 */
import { DEMO_CASES } from "../src/lib/demo-cases";
import { runSafetyCheckPipeline } from "../src/lib/safety-check";

const FREE_TEXT_CASE = {
  presentation:
    "58-year-old female with metastatic ovarian cancer on carboplatin, calls in with new fever to 38.7C and generalized fatigue since this morning. No cough, no dysuria. HR 108, BP 102/64.",
};

async function measure(label: string, request: { presentation: string; structuredFields?: object }) {
  const overallStart = performance.now();
  let firstEventMs: number | null = null;
  const concernArrivals: { ms: number; condition: string }[] = [];
  const timings: string[] = [];

  for await (const event of runSafetyCheckPipeline(request)) {
    if (firstEventMs === null) firstEventMs = performance.now() - overallStart;
    if (event.type === "concern") {
      concernArrivals.push({ ms: Math.round(performance.now() - overallStart), condition: event.concern.condition });
    }
    if (event.type === "timing") {
      timings.push(
        `${event.timing.stage} model=${event.timing.model} duration=${Math.round(event.timing.durationMs)}ms in=${event.timing.inputTokens ?? "?"} out=${event.timing.outputTokens ?? "?"}`
      );
    }
  }

  const totalMs = performance.now() - overallStart;
  console.log(`\n=== ${label} ===`);
  console.log(`first event at: ${Math.round(firstEventMs ?? 0)}ms`);
  console.log(`total pipeline duration: ${Math.round(totalMs)}ms`);
  for (const t of timings) console.log(`  ${t}`);
  console.log(`concerns (in arrival order):`);
  for (const c of concernArrivals) console.log(`  +${c.ms}ms  ${c.condition}`);
}

async function main() {
  for (const c of DEMO_CASES) {
    await measure(c.id, { presentation: c.todaysEncounter, structuredFields: c.structuredFields });
  }
  await measure("free-text-case", FREE_TEXT_CASE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
