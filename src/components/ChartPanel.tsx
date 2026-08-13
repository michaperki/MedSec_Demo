"use client";

import { useState } from "react";
import type { MockChartRecord } from "@/lib/data-provider";

const TABS = ["Overview", "Recent Labs", "Medications", "Treatment", "Today's Encounter"] as const;
type Tab = (typeof TABS)[number];

export function ChartPanel({ patient }: { patient: MockChartRecord }) {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">
          {patient.name} · {patient.age} {patient.sex}
        </div>
        <div className="mt-0.5 text-sm text-slate-600">{patient.diagnosis}</div>
        <div className="text-xs text-slate-400">Current therapy: {patient.currentTherapy}</div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t px-2.5 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-slate-100 text-slate-900"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 text-sm text-slate-700">
        {tab === "Overview" && (
          <ul className="list-disc space-y-1 pl-4">
            {patient.overview.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        {tab === "Recent Labs" && (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 font-medium">Test</th>
                <th className="py-1 font-medium">Value</th>
                <th className="py-1 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {patient.recentLabs.map((lab, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 text-slate-600">{lab.name}</td>
                  <td
                    className={`py-1 font-medium ${
                      lab.flag === "critical"
                        ? "text-rose-700"
                        : lab.flag === "high" || lab.flag === "low"
                        ? "text-amber-700"
                        : "text-slate-800"
                    }`}
                  >
                    {lab.value}
                  </td>
                  <td className="py-1 text-slate-400">{lab.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "Medications" && (
          <ul className="list-disc space-y-1 pl-4">
            {patient.medications.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        {tab === "Treatment" && (
          <ul className="list-disc space-y-1 pl-4">
            {patient.treatmentHistory.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
        {tab === "Today's Encounter" && (
          <p className="text-slate-600 italic">
            {patient.todaysEncounter}
            <span className="mt-2 block not-italic text-xs text-slate-400">
              Editable in the Patient Presentation field below.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
