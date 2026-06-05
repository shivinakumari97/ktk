import { randomUUID } from "node:crypto";
import type { NewsItem, Source, SourceRecord } from "../types.js";
import { contentHash } from "../core/util.js";
import { fetchFullText, htmlToText } from "./fetch-article.js";

/**
 * Official press-release scraper for sites that publish a listing page of links
 * rather than a feed — e.g. Karnataka DIPR / CMO. Config:
 *   { listUrl, linkSelectorRegex?, base?, fetchFull? }
 *
 * Best-effort and deliberately generic: point it at any government listing page
 * and tune `linkSelectorRegex` to the anchors you want. If a real RSS feed
 * exists, prefer the `rss` source instead. Respect the site's robots.txt/ToS.
 */
export class DiprSource implements Source {
  readonly type = "dipr" as const;
  constructor(
    readonly id: string,
    private listUrl: string,
    private linkRegex: RegExp,
    private base: string,
    private fetchFull: boolean,
  ) {}

  async fetch(_since: Date): Promise<NewsItem[]> {
    const res = await fetch(this.listUrl, { headers: { "user-agent": "ktk-monitor/1.0" } });
    if (!res.ok) throw new Error(`DIPR ${res.status} fetching ${this.listUrl}`);
    const html = await res.text();

    const seen = new Set<string>();
    const links: Array<{ url: string; title: string }> = [];
    for (const m of html.matchAll(this.linkRegex)) {
      const href = m.groups?.href ?? m[1];
      const label = htmlToText(m.groups?.label ?? m[2] ?? "").trim();
      if (!href || !label) continue;
      const url = href.startsWith("http") ? href : new URL(href, this.base || this.listUrl).href;
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({ url, title: label });
    }

    const out: NewsItem[] = [];
    for (const { url, title } of links.slice(0, 25)) {
      const body = this.fetchFull ? await fetchFullText(url, title) : title;
      out.push({
        id: randomUUID(),
        sourceId: this.id,
        title,
        body: body || title,
        url,
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        contentHash: contentHash(url, title),
        raw: { official: true, listUrl: this.listUrl },
      });
    }
    return out;
  }
}

// Default: capture anchors whose text/href hints at a press release.
const DEFAULT_LINK_REGEX =
  /<a[^>]+href=["'](?<href>[^"']+)["'][^>]*>(?<label>[\s\S]*?)<\/a>/gi;

export const diprSourceFactory = (rec: SourceRecord): Source => {
  const listUrl = String(rec.config.listUrl ?? "");
  if (!listUrl) throw new Error(`dipr source ${rec.id} missing config.listUrl`);
  const linkRegex = rec.config.linkSelectorRegex
    ? new RegExp(String(rec.config.linkSelectorRegex), "gi")
    : DEFAULT_LINK_REGEX;
  return new DiprSource(
    rec.id,
    listUrl,
    linkRegex,
    String(rec.config.base ?? ""),
    rec.config.fetchFull !== false,
  );
};
