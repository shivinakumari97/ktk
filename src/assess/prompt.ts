import type { NewsItem, WatchlistConfig } from "../types.js";

/**
 * The assessment prompt. Swapping prompt/model/scoring rules is isolated here +
 * llm-assessor.ts, with no impact on ingestion or delivery (per the spec's
 * "the relevance + summarization step is swappable").
 */
export function buildSystemPrompt(): string {
  return [
    "You are a news relevance and content-extraction engine for a political/business monitor.",
    "Given a news item and a watchlist, decide if it is relevant and extract its SUBSTANCE.",
    "",
    "The keyPoints are the core deliverable. They must be self-contained enough that the",
    "reader NEVER has to open the source. For a speech, extract what was actually said —",
    "positions taken, promises, figures, attacks. For a press release, extract the",
    "announcement and any policy or money specifics (who/what/when/how much).",
    "Use concrete numbers, names, and commitments from the text; do not pad with generic phrasing.",
    "",
    "Score relevance 0..1 against the watchlist. Be strict: tangential mentions score low.",
    "Respond with ONLY a JSON object, no markdown, matching exactly this schema:",
    `{
  "relevant": boolean,
  "score": number,            // 0..1
  "category": string,         // e.g. "minister reshuffle", "investment policy"
  "headline": string,         // one line: what happened
  "keyPoints": string[],      // 3-6 substantive bullets
  "whyItMatters": string,     // 1-2 sentences on investment/political impact
  "source": string            // "<outlet> + <url>"
}`,
  ].join("\n");
}

export function buildUserPrompt(item: NewsItem, w: WatchlistConfig): string {
  return [
    "WATCHLIST",
    `People: ${w.people.join("; ") || "(any)"}`,
    `Topics: ${w.topics.join("; ") || "(any)"}`,
    `Regions: ${w.regions.join("; ") || "(any)"}`,
    "",
    "NEWS ITEM",
    `Title: ${item.title}`,
    `URL: ${item.url}`,
    `Published: ${item.publishedAt}`,
    "Body:",
    item.body.slice(0, 14_000),
  ].join("\n");
}
