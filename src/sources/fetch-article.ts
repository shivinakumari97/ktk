/**
 * Best-effort full-text fetcher. Sources often give only a snippet; downstream
 * extraction needs the real article/release/transcript text or keyPoints come
 * out hollow. This does a lightweight HTML→text reduction with no heavy deps.
 *
 * Intentionally conservative: on any failure it returns the fallback snippet so
 * the pipeline degrades gracefully rather than dropping the item.
 */
const UA = "ktk-monitor/1.0 (+political news monitor; respects robots/ToS)";
const TIMEOUT_MS = 12_000;
const MAX_CHARS = 16_000;

export async function fetchFullText(url: string, fallback = ""): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const html = await res.text();
    const text = htmlToText(html);
    return text.length > fallback.length ? text.slice(0, MAX_CHARS) : fallback;
  } catch {
    return fallback;
  }
}

/** Strip scripts/styles/tags and collapse whitespace. Good enough for LLM input. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
