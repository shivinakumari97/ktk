/**
 * Core domain types and the three pluggable interfaces that define the system:
 *   Source   — produces normalized NewsItems   (ingestion)
 *   Assessor — scores + extracts substance      (relevance/summarization)
 *   Notifier — delivers a formatted alert        (delivery)
 *
 * Nothing in here is Karnataka-specific. The domain lives entirely in the
 * watchlist config (people/topics/regions/threshold), which is data, not code.
 */

// ─── Persisted entities ──────────────────────────────────────────────────────

export type SourceType = "rss" | "newsapi" | "dipr" | "mock";

export interface SourceRecord {
  id: string;
  type: SourceType;
  name: string;
  /** Free-form per-source config (feed url, query, etc.). */
  config: Record<string, unknown>;
  enabled: boolean;
}

/** The common shape every Source normalizes its output into. */
export interface NewsItem {
  id: string;
  sourceId: string;
  title: string;
  /** Full article/release/transcript text where we could fetch it; else snippet. */
  body: string;
  url: string;
  publishedAt: string; // ISO 8601
  fetchedAt: string; // ISO 8601
  /** Stable hash of normalized title+url used for dedup. */
  contentHash: string;
  /** Original raw payload from the source, for debugging / re-processing. */
  raw?: unknown;
}

export interface Assessment {
  newsItemId: string;
  relevant: boolean;
  score: number; // 0..1
  category: string;
  headline: string;
  keyPoints: string[];
  whyItMatters: string;
  /** "outlet + url" per the spec. */
  source: string;
  model: string;
  assessedAt: string; // ISO 8601
}

export type AlertStatus = "sent" | "queued" | "failed" | "skipped";

export interface Alert {
  id: string;
  assessmentId: string;
  channel: string; // "sms" | "whatsapp" | ...
  status: AlertStatus;
  detail?: string; // provider message id or error
  sentAt?: string; // ISO 8601
  createdAt: string; // ISO 8601
}

// ─── Editable configuration ──────────────────────────────────────────────────

export interface WatchlistConfig {
  people: string[];
  topics: string[];
  regions: string[];
  minRelevanceScore: number; // 0..1
  /** "HH:MM-HH:MM" in the app timezone; queue (don't send) during this window. */
  quietHours: string;
}

/** Per-channel delivery behavior. SMS can be set to a compact fallback form. */
export interface ChannelConfig {
  channel: string;
  enabled: boolean;
  to: string[];
  /** "full" = headline+points+why+link; "compact" = headline+why+link only. */
  format: "full" | "compact";
}

export interface DeliveryConfig {
  channels: ChannelConfig[];
}

// ─── Pluggable interfaces ────────────────────────────────────────────────────

export interface Source {
  /** Stable id matching a SourceRecord. */
  readonly id: string;
  readonly type: SourceType;
  /** Return items published since `since`. Implementations normalize to NewsItem. */
  fetch(since: Date): Promise<NewsItem[]>;
}

/** Factory: builds a Source instance from its stored record. */
export type SourceFactory = (record: SourceRecord) => Source;

export interface Assessor {
  readonly name: string;
  assess(item: NewsItem, watchlist: WatchlistConfig): Promise<Assessment>;
}

/** What a Notifier receives — already rendered for a specific channel. */
export interface FormattedAlert {
  assessmentId: string;
  text: string;
  /** Useful for channels that support structured payloads later. */
  assessment: Assessment;
}

export interface SendResult {
  status: AlertStatus;
  detail?: string;
}

export interface Notifier {
  readonly channel: string;
  /** Whether real credentials are configured; false => mock/log mode. */
  readonly live: boolean;
  send(alert: FormattedAlert, cfg: ChannelConfig): Promise<SendResult>;
}
