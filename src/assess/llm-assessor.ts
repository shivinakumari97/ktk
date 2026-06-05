import Anthropic from "@anthropic-ai/sdk";
import type { Assessor, Assessment, NewsItem, WatchlistConfig } from "../types.js";
import { env } from "../config/env.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

/**
 * Claude-backed assessor. Sends the full article text + watchlist and parses the
 * structured JSON. Model and token budget are configurable via env. This is the
 * swappable "relevance + summarization" stage — implement Assessor differently
 * to use another model or scoring approach.
 */
export class LlmAssessor implements Assessor {
  readonly name: string;
  private client: Anthropic;

  constructor(
    private model = env.assessorModel,
    private maxTokens = env.assessorMaxTokens,
  ) {
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
    this.name = `llm:${model}`;
  }

  async assess(item: NewsItem, watchlist: WatchlistConfig): Promise<Assessment> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(item, watchlist) }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseJson(text);
    return {
      newsItemId: item.id,
      relevant: !!parsed.relevant,
      score: clamp01(Number(parsed.score)),
      category: String(parsed.category ?? "uncategorized"),
      headline: String(parsed.headline ?? item.title),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
      whyItMatters: String(parsed.whyItMatters ?? ""),
      source: String(parsed.source ?? item.url),
      model: this.model,
      assessedAt: new Date().toISOString(),
    };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Tolerant JSON extraction — strips code fences and grabs the first {...} block. */
function parseJson(text: string): any {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Assessor returned non-JSON: ${text.slice(0, 200)}`);
  }
}
