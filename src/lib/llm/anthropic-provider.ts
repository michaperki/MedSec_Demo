import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CONCEPT_IDS, LAB_NAMES } from "../concepts";
import { RULE_REGISTRY } from "../rules";
import {
  ExtractionSchema,
  ConcernsResponseSchema,
  type Extraction,
  type Concern,
} from "./schema";
import {
  EXTRACTION_SYSTEM_PROMPT,
  CONCERN_SYSTEM_PROMPT,
  buildExtractionPrompt,
  buildConcernPrompt,
  type LLMProvider,
  type SafetyCheckLLMRequest,
} from "./provider";

// Extraction is small, well-bounded output — a fast/cheap model is plenty.
// Candidate identification needs broader clinical judgment, so it keeps the
// larger model by default. Both are config, not hardcoded call-site choices.
const EXTRACTION_MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL || "claude-haiku-4-5";
const CONCERNS_MODEL = process.env.ANTHROPIC_CONCERNS_MODEL || "claude-sonnet-5";

// The rule registry text is identical on every request — it's the expensive
// part of the concern-identification system prompt, so it's what gets cached.
const RULE_REGISTRY_BLOCK =
  "## Available clinical decision rules (use only these IDs for `suggestedRuleIds`)\n" +
  RULE_REGISTRY.map((r) => `- ${r.id}: ${r.name} — ${r.purpose}`).join("\n");

function refusalError(response: { stop_reason: string | null }): Error | null {
  if (response.stop_reason === "refusal") {
    return new Error(
      "The model declined to process this request. Try rephrasing the presentation, or contact support if this persists."
    );
  }
  return null;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async runExtraction(request: SafetyCheckLLMRequest): Promise<Extraction> {
    const userPrompt = buildExtractionPrompt(request, CONCEPT_IDS, LAB_NAMES);

    const response = await this.client.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: EXTRACTION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: zodOutputFormat(ExtractionSchema),
      },
    });

    const refusal = refusalError(response);
    if (refusal) throw refusal;

    if (!response.parsed_output) {
      throw new Error("Model response did not include parsed structured output.");
    }

    const result = ExtractionSchema.safeParse(response.parsed_output);
    if (!result.success) {
      throw new Error("Extraction response failed schema validation: " + result.error.message);
    }
    return result.data;
  }

  async identifyConcerns(
    request: SafetyCheckLLMRequest,
    extraction: Extraction
  ): Promise<Concern[]> {
    const userPrompt = buildConcernPrompt(
      request,
      extraction,
      RULE_REGISTRY.map((r) => ({ id: r.id, name: r.name, purpose: r.purpose }))
    );

    const response = await this.client.messages.parse({
      model: CONCERNS_MODEL,
      max_tokens: 3000,
      system: [
        { type: "text", text: CONCERN_SYSTEM_PROMPT },
        {
          type: "text",
          text: RULE_REGISTRY_BLOCK,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: zodOutputFormat(ConcernsResponseSchema),
      },
    });

    const refusal = refusalError(response);
    if (refusal) throw refusal;

    if (!response.parsed_output) {
      throw new Error("Model response did not include parsed structured output.");
    }

    const result = ConcernsResponseSchema.safeParse(response.parsed_output);
    if (!result.success) {
      throw new Error("Concerns response failed schema validation: " + result.error.message);
    }
    return result.data.potentialConcerns;
  }
}
