# AI Clinical Safety Check — Prototype

> **Prototype — for clinician evaluation only. Not for patient care.**

A physician safety-check layer for oncology: given a free-text patient presentation, it surfaces
dangerous conditions to consider, applicable validated clinical decision rules, what's already
known, and what's still missing — without ever inventing a value or asserting a diagnosis.

## Architecture

```
Patient presentation → LLM structured extraction → Normalized patient facts
                                                          │
                                        ┌─────────────────┴─────────────────┐
                                        ▼                                   ▼
                              Candidate risks (LLM)              Rule matching (LLM suggests IDs)
                                        └─────────────────┬─────────────────┘
                                                           ▼
                                          Deterministic rule scoring (code, not the LLM)
                                                           ▼
                                                 Safety-check results → React UI
```

- **`src/lib/rules/`** — ~10 clinical decision rules (Wells PE/DVT, PERC, HEART, qSOFA, SIRS,
  CURB-65, MASCC, CISNE, corrected calcium) as structured data + deterministic scoring code. The
  LLM never computes a score.
- **`src/lib/llm/`** — the LLM abstraction. `AnthropicProvider` calls the Claude API with a
  Zod-validated structured output schema; `MockLLMProvider` is a deterministic keyword-based
  extractor that makes the app fully runnable without an API key (used automatically when
  `ANTHROPIC_API_KEY` is unset).
- **`src/lib/patient.ts`** — the normalized `PatientContext` model. Every fact carries
  `source: "explicit" | "inferred"` — an inference is never silently promoted to a known fact.
- **`src/lib/data-provider.ts`** / **`demo-cases.ts`** — `PatientDataProvider` abstraction with a
  `MockPatientDataProvider` seeded with 5 synthetic cases. A future `FHIRPatientDataProvider`
  plugs into the same interface without touching the rules engine or UI.
- **`src/app/api/safety-check/route.ts`** — the only server route; runs extraction → rule
  evaluation and returns a JSON-safe result.

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

Optional: `ANTHROPIC_MODEL` (defaults to `claude-opus-5`), `LLM_PROVIDER=mock` to force the mock
extractor even with a key set (useful for offline development/demos).

## What this is not

No real EHR integration, no real patient data, no autonomous diagnosis. It is a checklist layer:
it surfaces validated tools and missing information so a physician doesn't have to remember which
scoring system applies to the patient in front of them — it never decides anything on its own.
