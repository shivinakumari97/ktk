import type { NewsRepo } from "../db/repositories.js";
import type { NewsItem } from "../types.js";
import { titleSimilarity } from "./util.js";

/**
 * Two-tier dedup:
 *   1. Exact: contentHash already in DB (handled by NewsRepo's UNIQUE column).
 *   2. Near-duplicate: title token-similarity against recent items, to suppress
 *      the same event reported across outlets within a polling window.
 *
 * Embedding-based clustering is a documented future extension; this keeps v1
 * dependency-free and cheap.
 */
const NEAR_DUP_THRESHOLD = 0.7;

export class Deduper {
  private recent: string[] = [];

  constructor(private news: NewsRepo) {
    this.recent = news.recentTitles();
  }

  /** True if `item` is a duplicate of something already seen. */
  isDuplicate(item: NewsItem): boolean {
    if (this.news.hashExists(item.contentHash)) return true;
    for (const title of this.recent) {
      if (titleSimilarity(item.title, title) >= NEAR_DUP_THRESHOLD) return true;
    }
    return false;
  }

  /** Record a title we've decided to keep, so later items in the same run dedup against it. */
  remember(title: string): void {
    this.recent.unshift(title);
    if (this.recent.length > 1000) this.recent.pop();
  }
}
