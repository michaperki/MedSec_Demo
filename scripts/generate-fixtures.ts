/**
 * Precomputes safety-check results for the 5 synthetic demo cases and
 * writes them to src/lib/fixtures/demo-results.json.
 *
 * Run: npx tsx --env-file=.env scripts/generate-fixtures.ts
 *
 * Requires ANTHROPIC_API_KEY (or LLM_PROVIDER=mock to regenerate against the
 * deterministic mock extractor instead — useful offline, but the mock
 * extractor's coverage is intentionally narrow; prefer the live key).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_CASES } from "../src/lib/demo-cases";
import { runSafetyCheck } from "../src/lib/safety-check";
import { toConcernView } from "../src/lib/api-types";
import type { DemoFixtureResult } from "../src/lib/demo-fixtures";

async function main() {
  const results: Record<string, DemoFixtureResult> = {};

  for (const demoCase of DEMO_CASES) {
    console.log(`Generating fixture for ${demoCase.id}...`);
    const result = await runSafetyCheck({
      presentation: demoCase.todaysEncounter,
      structuredFields: demoCase.structuredFields,
    });

    results[demoCase.id] = {
      patient: result.patient,
      concerns: result.concerns.map(toConcernView),
      usedMockProvider: result.usedMockProvider,
    };
  }

  const outPath = join(__dirname, "../src/lib/fixtures/demo-results.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
