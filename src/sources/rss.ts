import { randomUUID } from "node:crypto";
import Parser from "rss-parser";
import type { NewsItem, Source, SourceRecord } from "../types.js";
import { contentHash } from "../core/util.js";
import { fetchFullText, htmlToText } from "./fetch-article.js";

/**
 * Generic RSS/Atom source. Config: { feedUrl, outlet?, fetchFull? }.
 * Because RSS usually carries only a summary, we fetch the article page to get
 * the real body (toggle with config.fetchFull, default true).
 */
const parser = new Parser({ timeout: 12_000 });

export class RssSource implements Source {
  readonly type = "rss" as const;
  constructor(
    readonly id: string,
    private feedUrl: string,
    private outlet: string,
    private fetchFull: boolean,
  ) {}

  async fetch(since: Date): Promise<NewsItem[]> {
    const feed = await parser.parseURL(this.feedUrl);
    const out: NewsItem[] = [];
    for (const entry of feed.items) {
      const url = entry.link ?? "";
      const title = entry.title?.trim() ?? "";
      if (!url || !title) continue;

      const published = entry.isoDate ? new Date(entry.isoDate) : new Date();
      if (published < since) continue;

      const snippet = htmlToText(
        entry.contentSnippet ?? (entry as any)["content:encoded"] ?? entry.content ?? "",
      );
      const body = this.fetchFull ? await fetchFullText(url, snippet) : snippet;

      out.push({
        id: randomUUID(),
        sourceId: this.id,
        title,
        body: body || title,
        url,
        publishedAt: published.toISOString(),
        fetchedAt: new Date().toISOString(),
        contentHash: contentHash(url, title),
        raw: { outlet: this.outlet, guid: entry.guid },
      });
    }
    return out;
  }
}

export const rssSourceFactory = (rec: SourceRecord): Source => {
  const feedUrl = String(rec.config.feedUrl ?? "");
  if (!feedUrl) throw new Error(`rss source ${rec.id} missing config.feedUrl`);
  const outlet = String(rec.config.outlet ?? rec.name);
  const fetchFull = rec.config.fetchFull !== false;
  return new RssSource(rec.id, feedUrl, outlet, fetchFull);
};
