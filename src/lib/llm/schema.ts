import { z } from "zod";
import { CONCEPT_IDS } from "../concepts";
import { LAB_NAMES } from "../concepts";

const FactSource = z.enum(["explicit", "inferred"]);

function fact<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    source: FactSource,
    evidence: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  });
}

const StringFact = fact(z.string());
const NumberFact = fact(z.number());
const BooleanFact = fact(z.boolean());

const ConceptIdEnum = z.enum(CONCEPT_IDS);
const LabNameEnum = z.enum(LAB_NAMES);

export const ExtractionSchema = z.object({
  demographics: z
    .object({
      age: z.number().min(0).max(130).optional(),
      sex: z.string().optional(),
    })
    .default({}),
  cancerDiagnosis: StringFact.optional(),
  activeTreatment: StringFact.optional(),
  symptoms: z.array(StringFact).default([]),
  conditions: z.array(StringFact).default([]),
  medications: z.array(StringFact).default([]),
  treatments: z.array(StringFact).default([]),
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
  history: z.array(StringFact).default([]),
  concepts: z
    .array(z.object({ id: ConceptIdEnum }).merge(BooleanFact))
    .default([]),
});

export const ConcernSchema = z.object({
  condition: z.string(),
  reason: z.string().max(240),
  evidence: z.array(z.string().max(60)).max(6).default([]),
  suggestedRuleIds: z.array(z.string()).default([]),
  additionalMissingInformation: z.array(z.string().max(80)).max(5).default([]),
});

export const ConcernsResponseSchema = z.object({
  potentialConcerns: z.array(ConcernSchema).default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Concern = z.infer<typeof ConcernSchema>;
export type ConcernsResponse = z.infer<typeof ConcernsResponseSchema>;
