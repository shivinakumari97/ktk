import type {
  Alert,
  Assessment,
  DeliveryConfig,
  SourceRecord,
  WatchlistConfig,
} from "../types.js";

/** Minimal server-rendered HTML. No build step; keeps v1 lean. */

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ktk monitor</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 920px; margin: 0 auto; padding: 1.5rem; }
  nav a { margin-right: 1rem; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  .card { border: 1px solid #8884; border-radius: 8px; padding: 1rem; margin: .75rem 0; }
  .muted { color: #8889; } .pill { font-size: .8rem; padding: .1rem .5rem; border-radius: 99px; border: 1px solid #8886; }
  .sent { color: #2a8; } .queued { color: #c80; } .failed { color: #d44; } .skipped { color: #88a; }
  label { display: block; margin: .5rem 0 .2rem; font-weight: 600; }
  input, textarea, select { width: 100%; padding: .4rem; font: inherit; box-sizing: border-box; }
  textarea { min-height: 5rem; } button { padding: .5rem 1rem; font: inherit; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; } td, th { text-align: left; padding: .4rem; border-bottom: 1px solid #8883; }
  ul { margin: .3rem 0; padding-left: 1.2rem; }
  form.inline { display: inline; }
</style></head><body>
<nav><strong>ktk monitor</strong> &nbsp;
  <a href="/">Alerts</a><a href="/watchlist">Watchlist</a>
  <a href="/sources">Sources</a><a href="/delivery">Delivery</a>
  <form class="inline" method="post" action="/run"><button>Run now</button></form>
</nav>
<h1>${esc(title)}</h1>
${body}
</body></html>`;
}

export function dashboardView(
  history: Array<Alert & { assessment: Assessment }>,
  watchlist: WatchlistConfig,
): string {
  const rows = history.length
    ? history
        .map(
          (h) => `<div class="card">
        <div><span class="pill">${esc(h.assessment.category)}</span>
          <span class="pill">score ${h.assessment.score.toFixed(2)}</span>
          <span class="pill ${esc(h.status)}">${esc(h.channel)}: ${esc(h.status)}</span>
          <span class="muted"> ${esc(h.createdAt)}</span></div>
        <h3 style="margin:.4rem 0">${esc(h.assessment.headline)}</h3>
        <ul>${h.assessment.keyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        <div><em>Why it matters:</em> ${esc(h.assessment.whyItMatters)}</div>
        <div class="muted">${esc(h.assessment.source)}</div>
        ${h.detail ? `<div class="muted">↳ ${esc(h.detail)}</div>` : ""}
      </div>`,
        )
        .join("")
    : `<p class="muted">No alerts yet. Click <strong>Run now</strong> to poll sources.</p>`;

  return layout(
    "Alert history",
    `<p class="muted">Threshold ≥ ${watchlist.minRelevanceScore} · quiet hours ${esc(
      watchlist.quietHours,
    )}</p>${rows}`,
  );
}

export function watchlistView(w: WatchlistConfig): string {
  return layout(
    "Watchlist",
    `<form method="post" action="/watchlist">
      <label>People (one per line)</label>
      <textarea name="people">${esc(w.people.join("\n"))}</textarea>
      <label>Topics (one per line)</label>
      <textarea name="topics">${esc(w.topics.join("\n"))}</textarea>
      <label>Regions (one per line)</label>
      <textarea name="regions">${esc(w.regions.join("\n"))}</textarea>
      <label>Min relevance score (0–1)</label>
      <input name="minRelevanceScore" type="number" step="0.05" min="0" max="1" value="${w.minRelevanceScore}">
      <label>Quiet hours (HH:MM-HH:MM, app timezone)</label>
      <input name="quietHours" value="${esc(w.quietHours)}">
      <p><button>Save watchlist</button></p>
    </form>`,
  );
}

export function deliveryView(d: DeliveryConfig): string {
  const rows = d.channels
    .map(
      (c, i) => `<div class="card">
      <strong>${esc(c.channel)}</strong>
      <label><input type="checkbox" name="enabled_${i}" ${c.enabled ? "checked" : ""} style="width:auto"> enabled</label>
      <label>Recipients (comma-separated, E.164)</label>
      <input name="to_${i}" value="${esc(c.to.join(", "))}">
      <label>Format</label>
      <select name="format_${i}">
        <option value="full" ${c.format === "full" ? "selected" : ""}>full (headline + key points + why + link)</option>
        <option value="compact" ${c.format === "compact" ? "selected" : ""}>compact (headline + why + link)</option>
      </select>
      <input type="hidden" name="channel_${i}" value="${esc(c.channel)}">
    </div>`,
    )
    .join("");
  return layout(
    "Delivery channels",
    `<form method="post" action="/delivery">
      <input type="hidden" name="count" value="${d.channels.length}">
      ${rows}
      <p><button>Save delivery</button></p>
    </form>
    <p class="muted">WhatsApp proactive messages need a registered Twilio sender and an approved
    template for sends outside the 24-hour window. Without Twilio credentials, channels log to console.</p>`,
  );
}

export function sourcesView(sources: SourceRecord[]): string {
  const rows = sources
    .map(
      (s) => `<tr>
      <td>${esc(s.name)}</td><td><span class="pill">${esc(s.type)}</span></td>
      <td class="muted">${esc(JSON.stringify(s.config))}</td>
      <td>${s.enabled ? '<span class="sent">on</span>' : '<span class="muted">off</span>'}</td>
      <td>
        <form class="inline" method="post" action="/sources/${esc(s.id)}/toggle"><button>${s.enabled ? "Disable" : "Enable"}</button></form>
        <form class="inline" method="post" action="/sources/${esc(s.id)}/delete"><button>Delete</button></form>
      </td></tr>`,
    )
    .join("");
  return layout(
    "Sources",
    `<table><tr><th>Name</th><th>Type</th><th>Config</th><th>State</th><th></th></tr>${rows}</table>
    <h2>Add a source</h2>
    <form method="post" action="/sources">
      <label>Name</label><input name="name" required>
      <label>Type</label>
      <select name="type">
        <option value="rss">rss</option>
        <option value="newsapi">newsapi</option>
        <option value="dipr">dipr (official listing scraper)</option>
        <option value="mock">mock</option>
      </select>
      <label>Config (JSON) — e.g. {"feedUrl":"https://..."} for rss, {"query":"..."} for newsapi, {"listUrl":"https://..."} for dipr</label>
      <textarea name="config">{"feedUrl": "https://www.thehindu.com/news/national/karnataka/feeder/default.rss"}</textarea>
      <p><button>Add source</button></p>
    </form>`,
  );
}
