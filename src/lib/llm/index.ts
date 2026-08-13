import type { LLMProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { MockLLMProvider } from "./mock-provider";

let cached: LLMProvider | undefined;

/**
 * Selects the LLM backend behind a single abstraction: real Anthropic API
 * when a key is configured, deterministic mock extractor otherwise (or when
 * explicitly forced via LLM_PROVIDER=mock). Callers never branch on which
 * one is active.
 */
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;

  const forceMock = process.env.LLM_PROVIDER === "mock";
  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  cached = forceMock || !hasKey ? new MockLLMProvider() : new AnthropicProvider();
  return cached;
}

export function isUsingMockProvider(): boolean {
  return process.env.LLM_PROVIDER === "mock" || !process.env.ANTHROPIC_API_KEY;
}

export * from "./provider";
export * from "./schema";
