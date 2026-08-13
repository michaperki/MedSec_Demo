import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CONCEPT_IDS, LAB_NAMES } from "../concepts";
import { RULE_REGISTRY } from "../rules";
import {
  SafetyCheckLLMResponseSchema,
  type SafetyCheckLLMResponse,
} from "./schema";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildUserPrompt,
  type LLMProvider,
  type SafetyCheckLLMRequest,
} from "./provider";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async runExtraction(
    request: SafetyCheckLLMRequest
  ): Promise<SafetyCheckLLMResponse> {
    const userPrompt = buildUserPrompt(
      request,
      CONCEPT_IDS,
      LAB_NAMES,
      RULE_REGISTRY.map((r) => ({ id: r.id, name: r.name, purpose: r.purpose }))
    );

    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: zodOutputFormat(SafetyCheckLLMResponseSchema),
      },
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        "The model declined to process this request. Try rephrasing the presentation, or contact support if this persists."
      );
    }

    if (!response.parsed_output) {
      throw new Error("Model response did not include parsed structured output.");
    }

    // Defense in depth: parse() already validates, but re-validate explicitly
    // so a malformed response fails safely with a clear error rather than
    // propagating a subtly-wrong shape into the rules engine.
    const result = SafetyCheckLLMResponseSchema.safeParse(response.parsed_output);
    if (!result.success) {
      throw new Error(
        "Model response failed schema validation: " + result.error.message
      );
    }

    return result.data;
  }
}
