import type { Assessor } from "../types.js";
import { env } from "../config/env.js";
import { LlmAssessor } from "./llm-assessor.js";
import { MockAssessor } from "./mock.js";

/**
 * Choose the assessor: real Claude assessor when ANTHROPIC_API_KEY is set,
 * otherwise the deterministic mock so the app runs with zero spend.
 */
export function buildAssessor(): Assessor {
  if (env.anthropicApiKey) return new LlmAssessor();
  console.warn("[assess] ANTHROPIC_API_KEY not set — using mock assessor.");
  return new MockAssessor();
}
