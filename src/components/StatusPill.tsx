import type { CriterionResult } from "@/lib/rules";

const STYLES: Record<CriterionResult["status"], string> = {
  yes: "bg-emerald-50 text-emerald-800 border-emerald-200",
  no: "bg-slate-100 text-slate-600 border-slate-200",
  unknown: "bg-amber-50 text-amber-800 border-amber-200",
  requires_judgment: "bg-violet-50 text-violet-800 border-violet-200",
};

const LABELS: Record<CriterionResult["status"], string> = {
  yes: "Yes",
  no: "No",
  unknown: "Unknown",
  requires_judgment: "Requires judgment",
};

export function StatusPill({ status }: { status: CriterionResult["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}

export function SourcePill({ source }: { source: "explicit" | "inferred" }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        source === "explicit"
          ? "text-slate-500"
          : "text-sky-700 bg-sky-50 border border-sky-200 rounded px-1"
      }`}
    >
      {source === "explicit" ? "" : "inferred"}
    </span>
  );
}
