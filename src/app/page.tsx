"use client";

import { useState } from "react";
import { DEMO_CASES } from "@/lib/demo-cases";
import { DEMO_FIXTURES } from "@/lib/demo-fixtures";
import type { MockChartRecord } from "@/lib/data-provider";
import type { StructuredInputFields } from "@/lib/llm/provider";
import type { PatientContext } from "@/lib/patient";
import type { ConcernView } from "@/lib/api-types";
import type { SafetyCheckStreamEvent, ErrorKind } from "@/lib/stream-events";
import { ChartPanel } from "@/components/ChartPanel";
import { ConcernCard } from "@/components/ConcernCard";
import { PatientFactsSummary } from "@/components/PatientFactsSummary";
import { ProgressStages, type PipelineStage } from "@/components/ProgressStages";

type Status = "idle" | "loading" | "error" | "done";

interface ResultState {
  patient: PatientContext;
  concerns: ConcernView[];
  usedMockProvider: boolean;
  fromFixture: boolean;
}

const EXPANDED_COUNT = 2;

function fieldsEqual(a: StructuredInputFields, b: StructuredInputFields | undefined): boolean {
  const keys: (keyof StructuredInputFields)[] = [
    "age",
    "sex",
    "cancerDiagnosis",
    "activeTreatment",
    "medications",
    "vitals",
    "recentLabs",
    "symptoms",
  ];
  return keys.every((k) => (a[k] ?? "") === (b?.[k] ?? ""));
}

export default function Home() {
  const [selectedCase, setSelectedCase] = useState<MockChartRecord>(DEMO_CASES[0]);
  const [presentation, setPresentation] = useState(DEMO_CASES[0].todaysEncounter);
  const [structuredFields, setStructuredFields] = useState<StructuredInputFields>(
    DEMO_CASES[0].structuredFields ?? {}
  );
  const [showStructured, setShowStructured] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState<PipelineStage>("extracting");
  const [error, setError] = useState<{ message: string; kind: ErrorKind } | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  // True only when the current inputs exactly match a demo case as loaded —
  // this is what gates the instant-fixture path. Any edit routes through the
  // live streaming API instead.
  const isUneditedDemoCase =
    presentation === selectedCase.todaysEncounter &&
    fieldsEqual(structuredFields, selectedCase.structuredFields);

  function selectCase(record: MockChartRecord) {
    setSelectedCase(record);
    setPresentation(record.todaysEncounter);
    setStructuredFields(record.structuredFields ?? {});
    setResult(null);
    setError(null);
    setStatus("idle");
  }

  async function runSafetyCheck() {
    setStatus("loading");
    setStage("extracting");
    setError(null);
    setResult(null);

    const fixture = isUneditedDemoCase ? DEMO_FIXTURES[selectedCase.id] : undefined;
    if (fixture) {
      setResult({ ...fixture, fromFixture: true });
      setStatus("done");
      return;
    }

    try {
      const res = await fetch("/api/safety-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentation, structuredFields }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Safety check failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let patient: PatientContext | null = null;
      let usedMockProvider = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.trim()) continue;

          const event = JSON.parse(line) as SafetyCheckStreamEvent;
          switch (event.type) {
            case "facts":
              patient = event.patient;
              usedMockProvider = event.usedMockProvider;
              setStage("matching");
              break;
            case "stage":
              setStage(event.stage);
              break;
            case "concerns":
              if (patient) {
                setResult({
                  patient,
                  concerns: event.concerns,
                  usedMockProvider,
                  fromFixture: false,
                });
              }
              break;
            case "done":
              setStatus("done");
              break;
            case "error":
              setError({ message: event.message, kind: event.kind });
              setStatus("error");
              break;
          }
        }
      }
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Something went wrong.",
        kind: "unknown",
      });
      setStatus("error");
    }
  }

  const loading = status === "loading";
  const concerns = result?.concerns ?? [];
  const expanded = concerns.slice(0, EXPANDED_COUNT);
  const collapsed = concerns.slice(EXPANDED_COUNT);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900 border-b border-amber-200">
        Prototype — For clinician evaluation only. Not for patient care.
      </div>

      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-900">AI Clinical Safety Check</h1>
        <p className="text-xs text-slate-500">
          Surfaces validated clinical decision rules and missing information for a given
          presentation. Does not diagnose.
        </p>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div>
            <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Synthetic demo cases
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_CASES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCase(c)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedCase.id === c.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          <ChartPanel patient={selectedCase} />

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Patient presentation
            </label>
            <textarea
              value={presentation}
              onChange={(e) => setPresentation(e.target.value)}
              rows={7}
              className="mt-1.5 w-full resize-y rounded-md border border-slate-200 p-2.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
              placeholder="Describe the patient's current presentation in free text..."
            />

            <button
              onClick={() => setShowStructured((s) => !s)}
              className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              {showStructured ? "Hide" : "Show"} optional structured fields
            </button>

            {showStructured && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["age", "Age"],
                    ["sex", "Sex"],
                    ["cancerDiagnosis", "Cancer diagnosis"],
                    ["activeTreatment", "Active treatment"],
                    ["medications", "Medications"],
                    ["vitals", "Vitals"],
                    ["recentLabs", "Recent labs"],
                    ["symptoms", "Symptoms"],
                  ] as [keyof StructuredInputFields, string][]
                ).map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-slate-400">{label}</label>
                    <input
                      value={
                        structuredFields[key] === undefined ? "" : String(structuredFields[key])
                      }
                      onChange={(e) =>
                        setStructuredFields((prev) => ({
                          ...prev,
                          [key]: key === "age" ? Number(e.target.value) || undefined : e.target.value,
                        }))
                      }
                      className="rounded border border-slate-200 px-1.5 py-1 text-xs focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={runSafetyCheck}
              disabled={loading || presentation.trim().length === 0}
              className="mt-3 flex w-full flex-col items-center gap-0.5 rounded-md bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-80"
            >
              <span>{loading ? "Analyzing…" : "Run Safety Check"}</span>
              {loading && <span className="text-[11px] font-normal text-slate-300">typically 20–30 seconds</span>}
            </button>

            {error && (
              <div className="mt-2 rounded bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
                <p>{error.message}</p>
                <button
                  onClick={runSafetyCheck}
                  className="mt-1.5 font-semibold text-rose-800 underline underline-offset-2 hover:text-rose-900"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {status === "idle" && (
            <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center text-sm text-slate-400">
              <p>Run a safety check to see potential concerns, applicable</p>
              <p>decision rules, and missing information.</p>
            </div>
          )}

          {loading && <ProgressStages stage={stage} />}

          {result && (
            <>
              {result.fromFixture && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Instant result from a precomputed fixture for this demo case. Edit the
                  presentation or structured fields to run a live check instead.
                </div>
              )}
              {result.usedMockProvider && (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  No ANTHROPIC_API_KEY configured — using the deterministic demo extractor
                  (keyword matching tuned to the demo cases), not a live model call.
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <PatientFactsSummary patient={result.patient} />
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Potential high-risk conditions to consider
                </h2>
                <div className="space-y-4">
                  {expanded.map((concern, i) => (
                    <ConcernCard key={i} concern={concern} />
                  ))}
                </div>

                {collapsed.length > 0 && (
                  <details className="group mt-4">
                    <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
                      Other conditions considered ({collapsed.length})
                    </summary>
                    <div className="mt-3 space-y-4">
                      {collapsed.map((concern, i) => (
                        <ConcernCard key={i} concern={concern} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
