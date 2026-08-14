import { z } from "zod";
import { CONCEPT_IDS } from "../concepts";
import { LAB_NAMES } from "../concepts";

// IMPORTANT: no .min()/.max() on strings, numbers, or arrays anywhere in
// these schemas. The Anthropic structured-output JSON Schema doesn't
// support those constraints — the SDK silently strips them from what's
// actually sent to the model (so the model is never told the limit) but
// still validates the response against the *full* zod schema afterward,
// which means a length cap here doesn't reduce output tokens and *can* hard
// -fail a perfectly reasonable response that happens to run slightly over.
// Terseness is a prompt instruction (see provider.ts), not a schema
// constraint — that's the only lever that's actually enforced.

const FactSource = z.enum(["explicit", "inferred"]);

// Bare fact — no `evidence`/`confidence`. Nothing in the UI renders either
// field for numeric or string facts, so the model isn't asked to produce
// them (pure output-token cost with no payoff).
function fact<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    source: FactSource,
  });
}

// Boolean concept facts are the one exception: `evidence` is shown as the
// criterion detail text in rule tables (see `fromConcept` in
// rules/helpers.ts), so it earns its output tokens.
const ConceptFact = z.object({
  value: z.boolean(),
  source: FactSource,
  evidence: z.string().optional(),
});

const StringFact = fact(z.string());
const NumberFact = fact(z.number());

const ConceptIdEnum = z.enum(CONCEPT_IDS);
const LabNameEnum = z.enum(LAB_NAMES);

export const ExtractionSchema = z.object({
  demographics: z
    .object({
      age: z.number().optional(),
      sex: z.string().optional(),
    })
    .default({}),
  cancerDiagnosis: StringFact.optional(),
  activeTreatment: StringFact.optional(),
  vitals: z
    .object({
      heartRate: NumberFact.optional(),
      systolicBP: NumberFact.optional(),
      diastolicBP: NumberFact.optional(),
      respiratoryRate: NumberFact.optional(),
      temperature: NumberFact.optional(),
      oxygenSaturation: NumberFact.optional(),
    })
    .default({}),
  labs: z.array(z.object({ name: LabNameEnum }).merge(NumberFact)).default([]),
  concepts: z
    .array(z.object({ id: ConceptIdEnum }).merge(ConceptFact))
    .default([]),
});

export const ConcernSchema = z.object({
  condition: z.string(),
  reason: z.string(),
  evidence: z.array(z.string()).default([]),
  suggestedRuleIds: z.array(z.string()).default([]),
  additionalMissingInformation: z.array(z.string()).default([]),
});

export const ConcernsResponseSchema = z.object({
  potentialConcerns: z.array(ConcernSchema).default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Concern = z.infer<typeof ConcernSchema>;
export type ConcernsResponse = z.infer<typeof ConcernsResponseSchema>;
