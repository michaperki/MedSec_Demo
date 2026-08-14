# AI Clinical Safety Check — Prototype

> **Prototype — for clinician evaluation only. Not for patient care.**

A physician safety-check layer for oncology: given a free-text patient presentation, it surfaces
dangerous conditions to consider, applicable validated clinical decision rules, what's already
known, and what's still missing — without ever inventing a value or asserting a diagnosis.

## Architecture

Extraction and concern identification are two independent model calls that run **concurrently**
(neither waits on the other's output) and stream results to the client as NDJSON as soon as
they're available, rather than the client waiting on one blocking response:

```
                    ┌─▶ Stage 1: extraction (small/fast model) ─▶ patient facts
                    │        (stream: "facts" event → WHAT WE KNOW panel)
Patient presentation┤
                    └─▶ Stage 2: candidate concerns (larger model, token-streamed,
                             concerns parsed out of the response incrementally)
                                 (stream: "concern" event per condition, as it completes)

              Once both a concern and patient facts exist ─▶ deterministic rule scoring
                                 (stream: "concernRules" event)                (code, not the LLM)
```

A concern's rule tables need patient facts to score against, so whichever of {a concern, patient
facts} lands second triggers that concern's `concernRules` event — the UI renders the concern's
condition/reason/evidence immediately and fills in its rule tables when they're ready, in whatever
order that happens to be. Measured against the live API (see `scripts/measure-timings.ts`): first
meaningful content in ~2-4s, full result in ~10-20s — comfortably inside the 50s deadline the
server holds itself to (see below).

- **`src/lib/rules/`** — ~10 clinical decision rules (Wells PE/DVT, PERC, HEART, qSOFA, SIRS,
  CURB-65, MASCC, CISNE, corrected calcium) as structured data + deterministic scoring code. The
  LLM never computes a score.
- **`src/lib/llm/`** — the LLM abstraction. `LLMProvider` splits into `runExtraction` (stage 1,
  non-streaming — output is small) and `streamConcerns` (stage 2, token-streamed; concern objects
  are pulled out of the growing JSON text incrementally by
  `src/lib/llm/json-stream-parser.ts` rather than waiting for the full response). Both calls work
  from the raw presentation directly so they can run concurrently. `AnthropicProvider` uses a
  smaller model for extraction and a larger one for concern identification (both configurable —
  see below), prompt caching on each call's static prefix, and reports per-call timing/token usage
  back through the pipeline. `MockLLMProvider` is a deterministic keyword-based extractor that
  makes the app fully runnable without an API key (used automatically when `ANTHROPIC_API_KEY` is
  unset).
  - The Zod schemas intentionally carry **no `.min()`/`.max()` constraints**: Anthropic's
    structured-output JSON Schema doesn't support them, so the SDK strips them from what's sent to
    the model (the model is never told the limit) but still validates the response against the
    *full* schema afterward — meaning a length cap doesn't save output tokens and can hard-fail an
    otherwise-fine response that happens to run over. Terseness is a prompt instruction instead.
- **`src/lib/patient.ts`** — the normalized `PatientContext` model. Every fact carries
  `source: "explicit" | "inferred"` — an inference is never silently promoted to a known fact.
  Only boolean concept facts carry `evidence` (shown as criterion detail text in rule tables) —
  every other extracted field the UI doesn't render was cut from the schema entirely.
- **`src/lib/data-provider.ts`** / **`demo-cases.ts`** — `PatientDataProvider` abstraction with a
  `MockPatientDataProvider` seeded with 5 synthetic cases. A future `FHIRPatientDataProvider`
  plugs into the same interface without touching the rules engine or UI.
- **`src/lib/demo-fixtures.ts`** / **`src/lib/fixtures/demo-results.json`** — precomputed results
  for the 5 demo cases, generated against the live API by `scripts/generate-fixtures.ts`. Selecting
  an *unedited* demo case renders instantly from here with no network call; any edit to the
  presentation or structured fields (or free-text input) always goes through the live streaming
  API — see `isUneditedDemoCase` in `src/app/page.tsx` for the exact rule.
- **`src/app/api/safety-check/route.ts`** — the only server route. Streams NDJSON events (`facts`,
  `concern`, `concernRules`, `timing`, then a terminal `done` or `error`) as the pipeline produces
  them. Races the whole pipeline against a 50s internal deadline — comfortably below `maxDuration`
  (300s, the highest value every Vercel plan including Hobby accepts) — and on timeout aborts the
  in-flight model calls (via `AbortSignal`, threaded through the provider calls) and always emits a
  terminal `error` event before closing the stream. The client mirrors this: `AbortController` with
  its own ~55s ceiling, and a stream that closes without a `done`/`error` event is treated as a
  connection error, never as "still loading".

## Running

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `ANTHROPIC_API_KEY` set, the app runs entirely on the
deterministic mock extractor — useful for demoing the 5 synthetic cases without any API cost, but
it only recognizes the phrasing used in those cases (and common synonyms), not open-ended text.

To use the real Claude API:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Optional: `ANTHROPIC_EXTRACTION_MODEL` (defaults to `claude-haiku-4-5`, stage 1),
`ANTHROPIC_CONCERNS_MODEL` (defaults to `claude-sonnet-5`, stage 2), `LLM_PROVIDER=mock` to force
the mock extractor even with a key set (useful for offline development/demos).

To regenerate the demo-case fixtures after a prompt or rule change:

```bash
npx tsx --env-file=.env scripts/generate-fixtures.ts
```

## What this is not

No real EHR integration, no real patient data, no autonomous diagnosis. It is a checklist layer:
it surfaces validated tools and missing information so a physician doesn't have to remember which
scoring system applies to the patient in front of them — it never decides anything on its own.
