import type { Assessment, WatchlistConfig } from "../types.js";

/**
 * Decides whether an assessed item should be delivered now, queued, or dropped.
 * Pure functions — easy to unit test without a DB.
 */

export type Decision = "send" | "queue" | "drop";

export function decide(
  assessment: Assessment,
  watchlist: WatchlistConfig,
  now: Date,
  tz: string,
): { decision: Decision; reason: string } {
  if (!assessment.relevant || assessment.score < watchlist.minRelevanceScore) {
    return {
      decision: "drop",
      reason: `below threshold (${assessment.score.toFixed(2)} < ${watchlist.minRelevanceScore})`,
    };
  }
  if (inQuietHours(now, watchlist.quietHours, tz)) {
    return { decision: "queue", reason: "within quiet hours" };
  }
  return { decision: "send", reason: "qualifies" };
}

/** Current wall-clock minutes-since-midnight in the given IANA timezone. */
function minutesOfDay(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** Parse "HH:MM-HH:MM" (optionally with a trailing label like " IST") into minute bounds. */
export function parseQuietHours(spec: string): { start: number; end: number } | null {
  const m = spec.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return { start, end };
}

export function inQuietHours(now: Date, spec: string, tz: string): boolean {
  const bounds = parseQuietHours(spec);
  if (!bounds) return false;
  const cur = minutesOfDay(now, tz);
  const { start, end } = bounds;
  // Window that wraps past midnight (e.g. 22:00-07:00).
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}
