import { randomUUID } from "node:crypto";
import { getDb } from "../db/db.js";
import { makeRepos } from "../db/repositories.js";
import { env } from "./env.js";
import type { DeliveryConfig, SourceRecord, WatchlistConfig } from "../types.js";

/**
 * Seeds initial config + sources if absent. Idempotent: existing config is left
 * untouched (edit via the dashboard). Run with `npm run seed`, and it also runs
 * automatically on first boot.
 */

export const DEFAULT_WATCHLIST: WatchlistConfig = {
  people: ["Chief Minister of Karnataka", "Deputy Chief Minister"],
  topics: [
    "cabinet reshuffle / minister appointment / resignation",
    "industrial & investment policy",
    "FDI / new factory / large investment announcement",
    "land allotment & SEZ",
    "incentives, subsidies, taxation affecting business",
  ],
  regions: ["Karnataka", "Bengaluru"],
  minRelevanceScore: 0.6,
  quietHours: "22:00-07:00",
};

export const DEFAULT_DELIVERY: DeliveryConfig = {
  channels: [
    // WhatsApp gets the full multi-point version (preferred per spec).
    { channel: "whatsapp", enabled: true, to: env.alertTo, format: "full" },
    // SMS is the compact fallback to stay within message limits.
    { channel: "sms", enabled: false, to: env.alertTo, format: "compact" },
  ],
};

function defaultSources(): SourceRecord[] {
  const sources: SourceRecord[] = [
    // Always-available offline demo source.
    { id: "mock-demo", type: "mock", name: "Demo (mock)", config: {}, enabled: true },
  ];

  // Seed RSS feeds from env, if provided.
  for (const url of env.rssFeeds) {
    sources.push({
      id: `rss-${randomUUID().slice(0, 8)}`,
      type: "rss",
      name: `RSS: ${hostOf(url)}`,
      config: { feedUrl: url, fetchFull: true },
      enabled: true,
    });
  }

  // Seed a NewsAPI source keyed to the watchlist if a key exists.
  if (env.newsApiKey) {
    sources.push({
      id: "newsapi-karnataka",
      type: "newsapi",
      name: "NewsAPI: Karnataka politics",
      config: {
        query:
          '(Karnataka OR Bengaluru) AND (minister OR cabinet OR "investment policy" OR FDI OR industrial)',
        language: "en",
        pageSize: 25,
      },
      enabled: true,
    });
  }

  return sources;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function seed(): void {
  const repos = makeRepos(getDb());
  if (!repos.config.getWatchlist()) repos.config.setWatchlist(DEFAULT_WATCHLIST);
  if (!repos.config.getDelivery()) repos.config.setDelivery(DEFAULT_DELIVERY);
  if (repos.sources.list().length === 0) {
    for (const s of defaultSources()) repos.sources.upsert(s);
  }
  console.log("[seed] config + sources ready.");
}

// Allow `npm run seed` to invoke directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}
