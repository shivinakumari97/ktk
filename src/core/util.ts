import { createHash } from "node:crypto";

/** Normalize a string for hashing/comparison: lowercase, collapse whitespace. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Stable content hash from url + title. Used as the primary dedup key. */
export function contentHash(url: string, title: string): string {
  return createHash("sha256")
    .update(normalize(url) + "\n" + normalize(title))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Cheap near-duplicate check: token Jaccard similarity of two titles.
 * Catches the same event reported by different outlets without embeddings.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalize(b).split(" ").filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
