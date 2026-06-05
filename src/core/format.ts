import type { Assessment, ChannelConfig } from "../types.js";

/**
 * Renders an Assessment into channel-appropriate text.
 *   full    — headline + key points + why-it-matters + link (WhatsApp default)
 *   compact — headline + why-it-matters + link (+ "reply for details") (SMS fallback)
 *
 * Per the spec, the message should carry the *substance*; "full" is the
 * intended experience and compact is the size-constrained fallback.
 */
export function formatAlert(a: Assessment, cfg: ChannelConfig): string {
  return cfg.format === "compact" ? compact(a) : full(a);
}

function full(a: Assessment): string {
  const points = a.keyPoints.map((p) => `• ${p}`).join("\n");
  return [
    `📰 ${a.headline}`,
    points,
    `Why it matters: ${a.whyItMatters}`,
    a.source,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function compact(a: Assessment): string {
  return [
    `📰 ${a.headline}`,
    a.whyItMatters,
    a.source,
    `(reply FULL for key points)`,
  ]
    .filter(Boolean)
    .join("\n");
}
