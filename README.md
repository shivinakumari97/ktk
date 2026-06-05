# ktk — Political Event Monitor & Alert System

A pluggable engine that **monitors news, press releases, and public statements**,
runs each item through an LLM that **extracts the actual substance** (not a
teaser), and sends **relevance-scored alerts via SMS / WhatsApp**. The first
configured use case is **Karnataka state politics** — minister movements and
anything affecting the investment/business climate — but nothing about Karnataka
is baked into the architecture. It's all editable config.

The core promise: **reading the alert replaces reading the article or watching
the speech.** You only open the link for exact quotes or full context.

---

## How it works

```
Scheduler tick
   │
   ▼
[Ingest]   poll each enabled Source → NewsItem[]   (fetch full article text)
   │
   ▼
[Dedup]    exact contentHash + near-duplicate title similarity
   │
   ▼
[Assess]   LLM: NewsItem + Watchlist → {score, category, headline, keyPoints, whyItMatters}
   │
   ▼
[Gate]     score ≥ threshold?  inside quiet hours? → send | queue | drop
   │
   ▼
[Dispatch] fan out to enabled Notifiers (WhatsApp full / SMS compact)
   │
   ▼
[Store]    SQLite: NewsItem, Assessment, Alert
```

Three interfaces make it extensible — adding capability is a pure *addition*,
never a core edit:

| Interface | Add one by… | Lives in |
|---|---|---|
| `Source`   | writing a module + one `register()` line | `src/sources/` |
| `Assessor` | implementing `assess()` (swap model/prompt/scoring) | `src/assess/` |
| `Notifier` | writing a channel + one `register()` line | `src/notify/` |

"What I care about" (people, topics, regions, threshold, quiet hours) is **data
in the DB**, editable from the dashboard — not hardcoded.

---

## Quick start

```bash
npm install
cp .env.example .env        # optional — runs in mock mode with no keys
npm run dev                 # web dashboard + scheduler on http://localhost:3000
```

With **no API keys**, the app runs fully in **mock mode**: a demo source, a
deterministic keyword assessor, and notifiers that *log* what they would send.
You can exercise the entire pipeline with zero spend.

Other commands:

```bash
npm run worker      # run ONE polling cycle and exit (good for cron-from-outside)
npm run seed        # (re)seed default watchlist + sources (idempotent)
npm test            # pipeline tests with mock source + mock notifier
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/ ; then `npm run serve`
```

---

## Environment variables

See `.env.example` for the full list. Everything is optional; missing
credentials degrade to mock mode.

| Var | Purpose |
|---|---|
| `PORT` | dashboard/API port (default 3000) |
| `DATABASE_PATH` | SQLite file (`:memory:` for ephemeral) |
| `TZ` | IANA zone for quiet-hours math (default `Asia/Kolkata`) |
| `POLL_CRON` | polling schedule (default `*/15 * * * *`) |
| `SCHEDULER_ENABLED` | `false` = web only, no auto-polling |
| `ANTHROPIC_API_KEY` | enables the real LLM assessor (else mock) |
| `ASSESSOR_MODEL` | assessment model (default `claude-haiku-4-5`) |
| `NEWSAPI_KEY` | enables the NewsAPI source |
| `RSS_FEEDS` | comma-separated feed URLs to seed |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | enable real sends |
| `TWILIO_SMS_FROM` | SMS sender (E.164) |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender, e.g. `whatsapp:+14155238886` |
| `ALERT_TO` | destination number(s), comma-separated |

---

## Dashboard

- **Alerts** — history with relevance score, category, channel, and sent/queued/failed status.
- **Watchlist** — edit people / topics / regions, the `min_relevance_score`, and quiet hours.
- **Sources** — add/enable/disable/delete sources (with per-source JSON config).
- **Delivery** — per-channel recipients, enable/disable, and `full` vs `compact` format.
- **Run now** — trigger a poll on demand.

JSON API: `GET /api/health`, `GET /api/alerts`, `GET /api/watchlist`, `POST /api/run`.

---

## Adding a new source

1. Create `src/sources/my-source.ts` implementing `Source`:

   ```ts
   export class MySource implements Source {
     readonly type = "mysource" as const;   // add to SourceType in types.ts
     constructor(readonly id: string, /* …config… */) {}
     async fetch(since: Date): Promise<NewsItem[]> {
       // fetch, then normalize to NewsItem; fetch full article text where you only get a snippet
     }
   }
   export const mySourceFactory = (rec: SourceRecord): Source => new MySource(rec.id, /* … */);
   ```

2. Register it (one line) in `src/sources/index.ts`:

   ```ts
   .register("mysource", mySourceFactory)
   ```

3. Add a source row via the dashboard (type `mysource`, JSON config). Done — no
   core changes.

**Built-in sources:** `mock` (offline demo), `rss` (`{feedUrl, outlet?, fetchFull?}`),
`newsapi` (`{query, language?, pageSize?}`), `dipr` (official listing scraper:
`{listUrl, linkSelectorRegex?, base?}`). Each fetches the full article/release
page so the assessor works from real text, not a snippet. **Respect every
source's ToS and rate limits.**

## Adding a new notification channel

1. Create `src/notify/my-channel.ts` implementing `Notifier` (`channel`, `live`,
   `send()`).
2. Register it in `src/notify/index.ts`: `.register(new MyChannelNotifier())`.
3. Add it to the delivery config (seed default in `src/config/seed.ts`, or just
   add a channel row). Email / Telegram / push / Slack all slot in this way.

## Swapping the assessor

`Assessor` is one method. Replace the model/prompt by editing
`src/assess/prompt.ts` + `src/assess/llm-assessor.ts`, or write a new
implementation and return it from `src/assess/index.ts`. Ingestion and delivery
are untouched.

---

## Twilio / WhatsApp setup notes

- **SMS** works as soon as `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
  `TWILIO_SMS_FROM` are set. Because alerts are multi-point and long, SMS
  defaults to the **compact** format (headline + why-it-matters + link).
- **WhatsApp** is the preferred channel for the **full** multi-point alert, but
  proactive (business-initiated) messages have requirements:
  1. A **registered WhatsApp sender** (`TWILIO_WHATSAPP_FROM`) — the Twilio
     **sandbox** number works for testing.
  2. To message **outside the 24-hour customer-service window**, WhatsApp
     requires a **pre-approved message template**; free-form text is rejected.
     The current notifier sends free-form text (fine in sandbox / within 24h) and
     leaves template sending as a clearly marked stub (`contentSid` /
     `contentVariables`) in `src/notify/twilio-whatsapp.ts`.

Until Twilio is configured, both channels log what they *would* send and record
the alert as `skipped`.

---

## Data model

`Source` · `NewsItem` · `Assessment` · `Alert` · `WatchlistConfig` ·
`DeliveryConfig` — defined in `src/types.ts`, persisted via the repository layer
in `src/db/repositories.ts`. Storage is SQLite via `better-sqlite3`; all SQL is
confined to the repo layer, so moving to Postgres is a localized change.

---

## Project layout

```
src/
  types.ts          domain types + Source/Assessor/Notifier interfaces
  app.ts            composition root (wires real vs mock impls)
  config/           env loading, seed watchlist + sources
  db/               sqlite connection, migrations, repositories
  core/             registry, pipeline, dedup, gate, format, util
  sources/          mock, rss, newsapi, dipr, full-article fetcher
  assess/           llm-assessor, prompt, mock
  notify/           twilio-sms, twilio-whatsapp, mock
  scheduler/        cron poller + one-shot runner
  web/              express server + server-rendered dashboard
tests/              pipeline integration tests (mock source + notifier)
```

---

## Designed-for (not built yet)

More channels (email/Telegram/Slack/push), more domains beyond Karnataka,
embedding-based dedup/clustering, per-topic thresholds + digest mode, a
useful/not-useful feedback loop, and multi-user watchlists. The core is generic
enough that "Karnataka politics" is just the first configured use case. Social
(X/Twitter) and central press (PIB) are deliberately deferred — they carry
access/cost constraints; add them as `Source` modules when ready.
