import type { Reference } from "@/lib/rules";

export function EvidenceReferences({ references }: { references: Reference[] }) {
  if (references.length === 0) return null;
  return (
    <details className="group mt-2 text-xs">
      <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700">
        Evidence &amp; references
      </summary>
      <ul className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-3 text-slate-500">
        {references.map((ref, i) => (
          <li key={i}>
            {ref.citation}
            {!ref.verified && (
              <span className="ml-1.5 text-amber-700">
                — placeholder reference, not yet manually verified
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
