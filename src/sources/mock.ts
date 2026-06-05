import { randomUUID } from "node:crypto";
import type { NewsItem, Source, SourceRecord } from "../types.js";
import { contentHash } from "../core/util.js";

/**
 * Deterministic in-memory source for tests and offline demos. Pass canned items
 * via the SourceRecord config (`config.items`), or it emits a default sample so
 * `npm run worker` does something without any API keys.
 */
export class MockSource implements Source {
  readonly type = "mock" as const;
  constructor(
    readonly id: string,
    private items: Array<Partial<NewsItem> & { title: string; url: string; body: string }>,
  ) {}

  async fetch(_since: Date): Promise<NewsItem[]> {
    const now = new Date().toISOString();
    return this.items.map((it) => ({
      id: it.id ?? randomUUID(),
      sourceId: this.id,
      title: it.title,
      body: it.body,
      url: it.url,
      publishedAt: it.publishedAt ?? now,
      fetchedAt: now,
      contentHash: it.contentHash ?? contentHash(it.url, it.title),
      raw: it.raw ?? { mock: true },
    }));
  }
}

const DEFAULT_ITEMS = [
  {
    title: "Karnataka CM announces new industrial policy with ₹5,000 crore incentives",
    url: "https://example.com/karnataka-industrial-policy",
    body:
      "The Chief Minister of Karnataka today unveiled a new industrial policy targeting " +
      "₹5,000 crore in investment incentives over five years. Key measures include a 25% " +
      "capital subsidy for new factories in tier-2 districts, fast-tracked land allotment " +
      "through a single-window SEZ clearance, and a 5-year tax holiday for electronics and " +
      "EV manufacturers. The Deputy CM said the state aims to attract ₹50,000 crore in FDI.",
  },
  {
    title: "Bengaluru weather: light showers expected over weekend",
    url: "https://example.com/bengaluru-weather",
    body: "The meteorological department forecasts light rain across Bengaluru this weekend.",
  },
];

export const mockSourceFactory = (rec: SourceRecord): Source => {
  const items = (rec.config.items as any[]) ?? DEFAULT_ITEMS;
  return new MockSource(rec.id, items);
};
