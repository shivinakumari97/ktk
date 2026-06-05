import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import type {
  Alert,
  Assessment,
  DeliveryConfig,
  NewsItem,
  SourceRecord,
  WatchlistConfig,
} from "../types.js";

/**
 * Repository layer. The rest of the app speaks domain objects; only this file
 * knows the SQL/column mapping. Swap the storage engine here.
 */

// ─── Sources ─────────────────────────────────────────────────────────────────

export class SourceRepo {
  constructor(private db: DB) {}

  upsert(rec: SourceRecord): void {
    this.db
      .prepare(
        `INSERT INTO sources (id, type, name, config, enabled)
         VALUES (@id, @type, @name, @config, @enabled)
         ON CONFLICT(id) DO UPDATE SET
           type=excluded.type, name=excluded.name,
           config=excluded.config, enabled=excluded.enabled`,
      )
      .run({
        id: rec.id,
        type: rec.type,
        name: rec.name,
        config: JSON.stringify(rec.config ?? {}),
        enabled: rec.enabled ? 1 : 0,
      });
  }

  listEnabled(): SourceRecord[] {
    return this.list().filter((s) => s.enabled);
  }

  list(): SourceRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sources ORDER BY name`).all() as any[];
    return rows.map(rowToSource);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db.prepare(`UPDATE sources SET enabled=? WHERE id=?`).run(enabled ? 1 : 0, id);
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM sources WHERE id=?`).run(id);
  }
}

function rowToSource(r: any): SourceRecord {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    config: JSON.parse(r.config || "{}"),
    enabled: !!r.enabled,
  };
}

// ─── News items ──────────────────────────────────────────────────────────────

export class NewsRepo {
  constructor(private db: DB) {}

  /** Insert, ignoring items whose contentHash already exists. Returns true if new. */
  insertIfNew(item: NewsItem): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO news_items
           (id, source_id, title, body, url, published_at, fetched_at, content_hash, raw)
         VALUES (@id,@sourceId,@title,@body,@url,@publishedAt,@fetchedAt,@contentHash,@raw)`,
      )
      .run({
        id: item.id,
        sourceId: item.sourceId,
        title: item.title,
        body: item.body,
        url: item.url,
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
        contentHash: item.contentHash,
        raw: item.raw === undefined ? null : JSON.stringify(item.raw),
      });
    return res.changes > 0;
  }

  hashExists(contentHash: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM news_items WHERE content_hash=? LIMIT 1`)
      .get(contentHash);
    return !!row;
  }

  get(id: string): NewsItem | undefined {
    const r = this.db.prepare(`SELECT * FROM news_items WHERE id=?`).get(id) as any;
    return r ? rowToNews(r) : undefined;
  }

  recentTitles(limit = 500): string[] {
    const rows = this.db
      .prepare(`SELECT title FROM news_items ORDER BY fetched_at DESC LIMIT ?`)
      .all(limit) as any[];
    return rows.map((r) => r.title);
  }
}

function rowToNews(r: any): NewsItem {
  return {
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    body: r.body,
    url: r.url,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    contentHash: r.content_hash,
    raw: r.raw ? JSON.parse(r.raw) : undefined,
  };
}

// ─── Assessments ─────────────────────────────────────────────────────────────

export class AssessmentRepo {
  constructor(private db: DB) {}

  save(a: Assessment): void {
    this.db
      .prepare(
        `INSERT INTO assessments
           (news_item_id, relevant, score, category, headline, key_points,
            why_it_matters, source, model, assessed_at)
         VALUES (@id,@relevant,@score,@category,@headline,@keyPoints,
                 @whyItMatters,@source,@model,@assessedAt)
         ON CONFLICT(news_item_id) DO UPDATE SET
           relevant=excluded.relevant, score=excluded.score, category=excluded.category,
           headline=excluded.headline, key_points=excluded.key_points,
           why_it_matters=excluded.why_it_matters, source=excluded.source,
           model=excluded.model, assessed_at=excluded.assessed_at`,
      )
      .run({
        id: a.newsItemId,
        relevant: a.relevant ? 1 : 0,
        score: a.score,
        category: a.category,
        headline: a.headline,
        keyPoints: JSON.stringify(a.keyPoints),
        whyItMatters: a.whyItMatters,
        source: a.source,
        model: a.model,
        assessedAt: a.assessedAt,
      });
  }

  get(newsItemId: string): Assessment | undefined {
    const r = this.db
      .prepare(`SELECT * FROM assessments WHERE news_item_id=?`)
      .get(newsItemId) as any;
    return r ? rowToAssessment(r) : undefined;
  }
}

function rowToAssessment(r: any): Assessment {
  return {
    newsItemId: r.news_item_id,
    relevant: !!r.relevant,
    score: r.score,
    category: r.category,
    headline: r.headline,
    keyPoints: JSON.parse(r.key_points || "[]"),
    whyItMatters: r.why_it_matters,
    source: r.source,
    model: r.model,
    assessedAt: r.assessed_at,
  };
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export class AlertRepo {
  constructor(private db: DB) {}

  create(a: Omit<Alert, "id" | "createdAt">): Alert {
    const full: Alert = { id: randomUUID(), createdAt: new Date().toISOString(), ...a };
    this.db
      .prepare(
        `INSERT INTO alerts (id, assessment_id, channel, status, detail, sent_at, created_at)
         VALUES (@id,@assessmentId,@channel,@status,@detail,@sentAt,@createdAt)`,
      )
      .run({
        id: full.id,
        assessmentId: full.assessmentId,
        channel: full.channel,
        status: full.status,
        detail: full.detail ?? null,
        sentAt: full.sentAt ?? null,
        createdAt: full.createdAt,
      });
    return full;
  }

  /** Has this assessment already been alerted on this channel? (extra dedup guard) */
  alreadySent(assessmentId: string, channel: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM alerts WHERE assessment_id=? AND channel=? AND status='sent' LIMIT 1`,
      )
      .get(assessmentId, channel);
    return !!row;
  }

  /** Joined history for the dashboard. */
  history(limit = 100): Array<Alert & { assessment: Assessment }> {
    const rows = this.db
      .prepare(
        `SELECT al.*, a.* FROM alerts al
         JOIN assessments a ON a.news_item_id = al.assessment_id
         ORDER BY al.created_at DESC LIMIT ?`,
      )
      .all(limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      assessmentId: r.assessment_id,
      channel: r.channel,
      status: r.status,
      detail: r.detail ?? undefined,
      sentAt: r.sent_at ?? undefined,
      createdAt: r.created_at,
      assessment: rowToAssessment(r),
    }));
  }
}

// ─── App config (watchlist + delivery) ───────────────────────────────────────

export class ConfigRepo {
  constructor(private db: DB) {}

  private read<T>(key: string): T | undefined {
    const r = this.db.prepare(`SELECT value FROM app_config WHERE key=?`).get(key) as any;
    return r ? (JSON.parse(r.value) as T) : undefined;
  }

  private write(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO app_config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      )
      .run(key, JSON.stringify(value));
  }

  getWatchlist(): WatchlistConfig | undefined {
    return this.read<WatchlistConfig>("watchlist");
  }
  setWatchlist(w: WatchlistConfig): void {
    this.write("watchlist", w);
  }

  getDelivery(): DeliveryConfig | undefined {
    return this.read<DeliveryConfig>("delivery");
  }
  setDelivery(d: DeliveryConfig): void {
    this.write("delivery", d);
  }
}

export interface Repos {
  sources: SourceRepo;
  news: NewsRepo;
  assessments: AssessmentRepo;
  alerts: AlertRepo;
  config: ConfigRepo;
}

export function makeRepos(db: DB): Repos {
  return {
    sources: new SourceRepo(db),
    news: new NewsRepo(db),
    assessments: new AssessmentRepo(db),
    alerts: new AlertRepo(db),
    config: new ConfigRepo(db),
  };
}
