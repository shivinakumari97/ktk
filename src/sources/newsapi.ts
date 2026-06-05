import { randomUUID } from "node:crypto";
import type { NewsItem, Source, SourceRecord } from "../types.js";
import { env } from "../config/env.js";
import { contentHash } from "../core/util.js";
import { fetchFullText } from "./fetch-article.js";

/**
 * NewsAPI.org source. Config: { query, language?, pageSize?, fetchFull? }.
 * NewsAPI returns truncated `content`, so we fetch the full article page for
 * each result (respecting that some publishers block scraping — we fall back to
 * the provided snippet on failure).
 *
 * Requires NEWSAPI_KEY; if absent the factory throws and the source is skipped.
 */
const ENDPOINT = "https://newsapi.org/v2/everything";

export class NewsApiSource implements Source {
  readonly type = "newsapi" as const;
  constructor(
    readonly id: string,
    private query: string,
    private language: string,
    private pageSize: number,
    private fetchFull: boolean,
  ) {}

  async fetch(since: Date): Promise<NewsItem[]> {
    const params = new URLSearchParams({
      q: this.query,
      language: this.language,
      sortBy: "publishedAt",
      pageSize: String(this.pageSize),
      from: since.toISOString(),
      apiKey: env.newsApiKey,
    });
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { "user-agent": "ktk-monitor/1.0" },
    });
    if (!res.ok) throw new Error(`NewsAPI ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { articles?: any[] };

    const out: NewsItem[] = [];
    for (const a of data.articles ?? []) {
      const url = a.url ?? "";
      const title = (a.title ?? "").trim();
      if (!url || !title) continue;
      const snippet = [a.description, a.content].filter(Boolean).join("\n");
      const body = this.fetchFull ? await fetchFullText(url, snippet) : snippet;
      out.push({
        id: randomUUID(),
        sourceId: this.id,
        title,
        body: body || title,
        url,
        publishedAt: a.publishedAt ?? new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        contentHash: contentHash(url, title),
        raw: { outlet: a.source?.name },
      });
    }
    return out;
  }
}

export const newsApiSourceFactory = (rec: SourceRecord): Source => {
  if (!env.newsApiKey) throw new Error("NEWSAPI_KEY not set");
  const query = String(rec.config.query ?? "");
  if (!query) throw new Error(`newsapi source ${rec.id} missing config.query`);
  return new NewsApiSource(
    rec.id,
    query,
    String(rec.config.language ?? "en"),
    Number(rec.config.pageSize ?? 20),
    rec.config.fetchFull !== false,
  );
};
