import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CONCEPT_IDS, LAB_NAMES } from "../concepts";
import { RULE_REGISTRY } from "../rules";
import { ExtractionSchema, ConcernSchema, ConcernsResponseSchema, type Concern } from "./schema";
import {
  EXTRACTION_SYSTEM_PROMPT,
  CONCERN_SYSTEM_PROMPT,
  buildExtractionPrompt,
  buildConcernPrompt,
  type ConcernStreamChunk,
  type ExtractionResult,
  type LLMProvider,
  type SafetyCheckLLMRequest,
  type StageTiming,
} from "./provider";
import { createJsonArrayElementParser } from "./json-stream-parser";

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

  async runExtraction(request: SafetyCheckLLMRequest, signal?: AbortSignal): Promise<ExtractionResult> {
    const userPrompt = buildExtractionPrompt(request, CONCEPT_IDS, LAB_NAMES);
    const start = performance.now();

    const response = await this.client.messages.parse(
      {
        model: EXTRACTION_MODEL,
        max_tokens: 1500,
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
      },
      { signal }
    );

    const timing: StageTiming = {
      stage: "extraction",
      model: EXTRACTION_MODEL,
      durationMs: performance.now() - start,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    };

    const refusal = refusalError(response);
    if (refusal) throw refusal;

    if (!response.parsed_output) {
      throw new Error("Model response did not include parsed structured output.");
    }

    const result = ExtractionSchema.safeParse(response.parsed_output);
    if (!result.success) {
      throw new Error("Extraction response failed schema validation: " + result.error.message);
    }
    return { extraction: result.data, timing };
  }

  async *streamConcerns(
    request: SafetyCheckLLMRequest,
    signal?: AbortSignal
  ): AsyncGenerator<ConcernStreamChunk> {
    const userPrompt = buildConcernPrompt(
      request,
      RULE_REGISTRY.map((r) => ({ id: r.id, name: r.name, purpose: r.purpose }))
    );
    const start = performance.now();

    // Deliberately the raw streaming API (create + stream:true), not the
    // `.stream()` convenience helper: with output_config.format set, that
    // helper eagerly re-parses the accumulated text as JSON on every delta
    // to populate `parsed_output`, and throws on the (expected, constant)
    // mid-object incomplete-JSON state instead of waiting for the message to
    // finish. We do our own incremental parsing (json-stream-parser) and
    // read usage/stop_reason off the raw message_start/message_delta events.
    const stream = await this.client.messages.create(
      {
        model: CONCERNS_MODEL,
        // Measured against the live API: a well-populated response (6+
        // concerns, each with rule suggestions and missing-info items) runs
        // ~1200-1900 output tokens; one run hit 2500/2500 (truncated,
        // silently dropping whatever concern was mid-flight when the cap
        // hit). 4000 leaves real headroom instead of a near-miss margin.
        max_tokens: 4000,
        stream: true,
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
      },
      { signal }
    );

    const parser = createJsonArrayElementParser<Concern>((value) => {
      const result = ConcernSchema.safeParse(value);
      return result.success ? result.data : undefined;
    });

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let stopReason: string | null = null;

    for await (const event of stream) {
      if (event.type === "message_start") {
        inputTokens = event.message.usage.input_tokens;
        outputTokens = event.message.usage.output_tokens;
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        for (const concern of parser.feed(event.delta.text)) {
          yield { type: "concern", concern };
        }
      } else if (event.type === "message_delta") {
        outputTokens = event.usage.output_tokens ?? outputTokens;
        stopReason = event.delta.stop_reason ?? stopReason;
      }
    }

    if (stopReason === "max_tokens") {
      // The response was truncated mid-generation — whatever concern object
      // was still open when the cap hit never closed, so it was silently
      // dropped by the incremental parser rather than emitted. Surfacing
      // this server-side is the only way to notice it happened.
      console.warn(
        `[anthropic-provider] concerns stage hit max_tokens (${outputTokens} tokens) — output was truncated, at least one concern may be missing.`
      );
    }

    const timing: StageTiming = {
      stage: "concerns",
      model: CONCERNS_MODEL,
      durationMs: performance.now() - start,
      inputTokens,
      outputTokens,
    };

    const refusal = refusalError({ stop_reason: stopReason });
    if (refusal) throw refusal;

    yield { type: "timing", timing };
  }
}
