import type { Assessor, Assessment, NewsItem, WatchlistConfig } from "../types.js";

/**
 * Deterministic, no-cost assessor for tests and offline runs. Scores by counting
 * watchlist topic/people/region keyword hits in the item, and synthesizes
 * keyPoints from the first sentences of the body. Good enough to exercise the
 * full pipeline (dedup → gate → notify) without an API key.
 */
export class MockAssessor implements Assessor {
  readonly name = "mock";

  async assess(item: NewsItem, w: WatchlistConfig): Promise<Assessment> {
    const hay = `${item.title}\n${item.body}`.toLowerCase();
    const terms = [...w.people, ...w.topics, ...w.regions]
      .flatMap((t) => t.toLowerCase().split(/[\/,&]/).map((s) => s.trim()))
      .filter((t) => t.length > 3);

    const hits = terms.filter((t) => hay.includes(t)).length;
    const score = Math.max(0, Math.min(1, hits / 5));

    const sentences = item.body
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 20)
      .slice(0, 5);

    return {
      newsItemId: item.id,
      relevant: score > 0,
      score,
      category: "mock-assessment",
      headline: item.title,
      keyPoints: sentences.length ? sentences : [item.title],
      whyItMatters: `Matched ${hits} watchlist term(s).`,
      source: `mock + ${item.url}`,
      model: "mock",
      assessedAt: new Date().toISOString(),
    };
  }
}
