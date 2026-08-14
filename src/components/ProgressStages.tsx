export type PipelineStage = "extracting" | "matching" | "assembling";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "extracting", label: "Extracting clinical facts" },
  { key: "matching", label: "Matching decision rules" },
  { key: "assembling", label: "Assembling concerns" },
];

export function ProgressStages({ stage }: { stage: PipelineStage }) {
  const activeIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-lg border border-slate-200 bg-white">
      <ol className="space-y-2.5">
        {STAGES.map((s, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={s.key} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  state === "done"
                    ? "bg-emerald-500"
                    : state === "active"
                    ? "bg-slate-900"
                    : "bg-slate-200"
                }`}
              >
                {state === "active" && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                )}
              </span>
              <span
                className={
                  state === "pending"
                    ? "text-slate-400"
                    : state === "active"
                    ? "font-medium text-slate-900"
                    : "text-slate-500"
                }
              >
                {s.label}
                {state === "active" && "…"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
