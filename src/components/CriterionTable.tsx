import type { RuleView } from "@/lib/api-types";
import { StatusPill } from "./StatusPill";

export function CriterionTable({ rule }: { rule: RuleView }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="bg-slate-50 text-slate-500">
            <th className="px-3 py-1.5 font-medium">Criterion</th>
            <th className="px-3 py-1.5 font-medium">Patient</th>
            <th className="px-3 py-1.5 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {rule.criteria.map((c) => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="px-3 py-1.5 text-slate-800">
                {c.label}
                {c.result.detail && (
                  <span className="ml-1.5 text-slate-400">({c.result.detail})</span>
                )}
              </td>
              <td className="px-3 py-1.5">
                <StatusPill status={c.result.status} />
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                {c.result.status === "yes" ? `+${c.points}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
