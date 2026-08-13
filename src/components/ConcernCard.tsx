import type { ConcernView } from "@/lib/api-types";
import { CriterionTable } from "./CriterionTable";
import { EvidenceReferences } from "./EvidenceReferences";

function bandTone(label: string | undefined): string {
  if (!label) return "text-slate-600";
  const l = label.toLowerCase();
  if (l.includes("high") || l.includes("severe") || l.includes("positive") || l.includes("crisis")) {
    return "text-rose-700";
  }
  if (l.includes("moderate") || l.includes("intermediate")) return "text-amber-700";
  return "text-slate-600";
}

export function ConcernCard({ concern }: { concern: ConcernView }) {
  const allMissing = Array.from(
    new Set([
      ...concern.additionalMissingInformation,
      ...concern.ruleApplications.flatMap((r) => r.missingInformation),
    ])
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h3 className="text-base font-semibold text-rose-800">{concern.condition}</h3>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Why this is relevant
          </h4>
          <p className="mt-1 text-sm text-slate-700">{concern.reason}</p>
          {concern.evidence.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {concern.evidence.map((e, i) => (
                <li
                  key={i}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                >
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>

        {concern.ruleApplications.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Applicable decision tools
            </h4>
            <div className="mt-2 space-y-4">
              {concern.ruleApplications.map((rule) => (
                <div key={rule.id} className="rounded-md border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-slate-800">{rule.name}</span>
                    <span className="text-xs text-slate-500">{rule.purpose}</span>
                  </div>

                  <div className="mt-2">
                    <CriterionTable rule={rule} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="text-slate-500">Current computable score:</span>
                    <span className="font-medium text-slate-800">{rule.displayScore}</span>
                    {rule.band && (
                      <span className={`font-semibold ${bandTone(rule.band.label)}`}>
                        — {rule.band.label}
                      </span>
                    )}
                  </div>
                  {rule.band && (
                    <p className="mt-0.5 text-xs text-slate-500">{rule.band.guidance}</p>
                  )}
                  {!rule.band && (
                    <p className="mt-0.5 text-xs text-amber-700">
                      Cannot calculate a final score or risk band — see missing information below.
                    </p>
                  )}

                  <EvidenceReferences references={rule.references} />
                </div>
              ))}
            </div>
          </div>
        )}

        {allMissing.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Missing information
            </h4>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
              {allMissing.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-600">?</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
