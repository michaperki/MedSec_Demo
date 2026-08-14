"use client";

import { useState } from "react";
import { DEMO_CASES } from "@/lib/demo-cases";
import { DEMO_FIXTURES } from "@/lib/demo-fixtures";
import type { MockChartRecord } from "@/lib/data-provider";
import type { StructuredInputFields } from "@/lib/llm/provider";
import type { PatientContext } from "@/lib/patient";
import type { ConcernShellView, RuleView } from "@/lib/api-types";
import type { SafetyCheckStreamEvent, ErrorKind } from "@/lib/stream-events";
import { ChartPanel } from "@/components/ChartPanel";
import { ConcernCard } from "@/components/ConcernCard";
import { PatientFactsSummary } from "@/components/PatientFactsSummary";

type Status = "idle" | "running" | "error" | "done";

interface ConcernSlot {
  shell: ConcernShellView;
  /** null until concernRules lands — patient facts and this concern may arrive in either order. */
  ruleApplications: RuleView[] | null;
}

interface TimingEntry {
  stage: string;
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

const EXPANDED_COUNT = 2;
// Just above the server's own ~50s internal deadline — a safety net in case
// the server process dies without closing the stream gracefully.
const CLIENT_ABORT_MS = 55_000;

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
  const [patient, setPatient] = useState<PatientContext | null>(null);
  const [usedMockProvider, setUsedMockProvider] = useState(false);
  const [fromFixture, setFromFixture] = useState(false);
  const [concernSlots, setConcernSlots] = useState<ConcernSlot[]>([]);
  const [error, setError] = useState<{ message: string; kind: ErrorKind } | null>(null);
  const [timings, setTimings] = useState<TimingEntry[]>([]);

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
    setStatus("idle");
    setPatient(null);
    setConcernSlots([]);
    setError(null);
    setTimings([]);
  }

  async function runSafetyCheck() {
    setStatus("running");
    setError(null);
    setPatient(null);
    setUsedMockProvider(false);
    setFromFixture(false);
    setConcernSlots([]);
    setTimings([]);

    const fixture = isUneditedDemoCase ? DEMO_FIXTURES[selectedCase.id] : undefined;
    if (fixture) {
      setPatient(fixture.patient);
      setUsedMockProvider(fixture.usedMockProvider);
      setFromFixture(true);
      setConcernSlots(
        fixture.concerns.map((c) => ({
          shell: {
            condition: c.condition,
            reason: c.reason,
            evidence: c.evidence,
            additionalMissingInformation: c.additionalMissingInformation,
          },
          ruleApplications: c.ruleApplications,
        }))
      );
      setStatus("done");
      return;
    }

    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), CLIENT_ABORT_MS);
    let receivedTerminal = false;

    try {
      const res = await fetch("/api/safety-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentation, structuredFields }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Safety check failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
              setPatient(event.patient);
              setUsedMockProvider(event.usedMockProvider);
              break;
            case "concern":
              setConcernSlots((prev) => {
                const next = [...prev];
                next[event.index] = { shell: event.concern, ruleApplications: null };
                return next;
              });
              break;
            case "concernRules":
              setConcernSlots((prev) => {
                if (!prev[event.index]) return prev;
                const next = [...prev];
                next[event.index] = { ...next[event.index], ruleApplications: event.ruleApplications };
                return next;
              });
              break;
            case "timing":
              setTimings((prev) => [
                ...prev,
                {
                  stage: event.stage,
                  model: event.model,
                  durationMs: event.durationMs,
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                },
              ]);
              console.debug(
                `[safety-check] ${event.stage} — ${event.model} — ${event.durationMs}ms ` +
                  `(in=${event.inputTokens ?? "?"} out=${event.outputTokens ?? "?"})`
              );
              break;
            case "done":
              receivedTerminal = true;
              setStatus("done");
              break;
            case "error":
              receivedTerminal = true;
              setError({ message: event.message, kind: event.kind });
              setStatus("error");
              break;
          }
        }
      }

      // The server always sends `done` or `error` before closing the stream.
      // If neither arrived, the connection dropped mid-flight — that's an
      // error state, not "still loading forever".
      if (!receivedTerminal) {
        setError({
          message: "The connection closed before the safety check finished. Try again.",
          kind: "unknown",
        });
        setStatus("error");
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setError({
        message: aborted
          ? "This is taking longer than expected and was cancelled. Try again."
          : e instanceof Error
          ? e.message
          : "Something went wrong.",
        kind: aborted ? "timeout" : "unknown",
      });
      setStatus("error");
    } finally {
      clearTimeout(abortTimer);
    }
  }

  const loading = status === "running";
  const hasContent = !!patient || concernSlots.length > 0;
  const expanded = concernSlots.slice(0, EXPANDED_COUNT);
  const collapsed = concernSlots.slice(EXPANDED_COUNT);

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

          {loading && !hasContent && (
            <div className="flex h-64 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
              Starting analysis…
            </div>
          )}

          {hasContent && (
            <>
              {fromFixture && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Instant result from a precomputed fixture for this demo case. Edit the
                  presentation or structured fields to run a live check instead.
                </div>
              )}
              {usedMockProvider && (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  No ANTHROPIC_API_KEY configured — using the deterministic demo extractor
                  (keyword matching tuned to the demo cases), not a live model call.
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                {patient ? (
                  <PatientFactsSummary patient={patient} />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
                    Extracting clinical facts…
                  </div>
                )}
              </div>

              {concernSlots.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Potential high-risk conditions to consider
                  </h2>
                  <div className="space-y-4">
                    {expanded.map((slot, i) => (
                      <ConcernCard key={i} concern={slot.shell} ruleApplications={slot.ruleApplications} />
                    ))}
                  </div>

                  {collapsed.length > 0 && (
                    <details className="group mt-4">
                      <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
                        Other conditions considered ({collapsed.length})
                      </summary>
                      <div className="mt-3 space-y-4">
                        {collapsed.map((slot, i) => (
                          <ConcernCard key={i} concern={slot.shell} ruleApplications={slot.ruleApplications} />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {loading && (
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
                  {concernSlots.length === 0
                    ? "Identifying potential concerns…"
                    : "Checking for additional concerns…"}
                </p>
              )}

              {process.env.NODE_ENV !== "production" && timings.length > 0 && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer select-none hover:text-slate-600">
                    Timing (dev only)
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono">
                    {timings.map((t, i) => (
                      <li key={i}>
                        {t.stage} · {t.model} · {Math.round(t.durationMs)}ms · in={t.inputTokens ?? "?"}{" "}
                        out={t.outputTokens ?? "?"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
