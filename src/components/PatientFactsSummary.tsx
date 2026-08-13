import type { PatientContext } from "@/lib/patient";
import { LAB_LABELS } from "@/lib/concepts";
import { SourcePill } from "./StatusPill";

function Chip({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source?: "explicit" | "inferred";
}) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
      {source && <SourcePill source={source} />}
    </div>
  );
}

export function PatientFactsSummary({ patient }: { patient: PatientContext }) {
  const chips: React.ReactNode[] = [];

  if (patient.demographics.age !== undefined) {
    chips.push(<Chip key="age" label="Age" value={String(patient.demographics.age)} />);
  }
  if (patient.demographics.sex) {
    chips.push(<Chip key="sex" label="Sex" value={patient.demographics.sex} />);
  }
  if (patient.cancerDiagnosis) {
    chips.push(
      <Chip
        key="dx"
        label="Diagnosis"
        value={patient.cancerDiagnosis.value}
        source={patient.cancerDiagnosis.source}
      />
    );
  }
  if (patient.activeTreatment) {
    chips.push(
      <Chip
        key="tx"
        label="Treatment"
        value={patient.activeTreatment.value}
        source={patient.activeTreatment.source}
      />
    );
  }

  const vitalEntries: [string, { value: number; source: "explicit" | "inferred" } | undefined, string][] = [
    ["HR", patient.vitals.heartRate, "bpm"],
    ["BP", patient.vitals.systolicBP, "mmHg (sys)"],
    ["RR", patient.vitals.respiratoryRate, "/min"],
    ["Temp", patient.vitals.temperature, "°C"],
    ["SpO₂", patient.vitals.oxygenSaturation, "%"],
  ];
  for (const [label, fact, unit] of vitalEntries) {
    if (fact) {
      chips.push(
        <Chip key={label} label={label} value={`${fact.value} ${unit}`} source={fact.source} />
      );
    }
  }

  for (const [name, fact] of Object.entries(patient.labs)) {
    if (!fact) continue;
    chips.push(
      <Chip
        key={name}
        label={LAB_LABELS[name as keyof typeof LAB_LABELS] ?? name}
        value={String(fact.value)}
        source={fact.source}
      />
    );
  }

  if (chips.length === 0) return null;

  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        What we know
      </h4>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{chips}</div>
    </div>
  );
}
