import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env.js";

/**
 * SQLite connection + schema bootstrap. All table access goes through the
 * repositories in repositories.ts, so moving to Postgres later means rewriting
 * one file, not chasing SQL across the codebase.
 */

export type DB = Database.Database;

let singleton: DB | null = null;

export function getDb(path = env.databasePath): DB {
  if (singleton) return singleton;
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  singleton = db;
  return db;
}

/** For tests: an isolated in-memory database, never cached. */
export function makeTestDb(): DB {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id        TEXT PRIMARY KEY,
      type      TEXT NOT NULL,
      name      TEXT NOT NULL,
      config    TEXT NOT NULL DEFAULT '{}',
      enabled   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id           TEXT PRIMARY KEY,
      source_id    TEXT NOT NULL,
      title        TEXT NOT NULL,
      body         TEXT NOT NULL,
      url          TEXT NOT NULL,
      published_at TEXT NOT NULL,
      fetched_at   TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      raw          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at);

    CREATE TABLE IF NOT EXISTS assessments (
      news_item_id   TEXT PRIMARY KEY,
      relevant       INTEGER NOT NULL,
      score          REAL NOT NULL,
      category       TEXT NOT NULL,
      headline       TEXT NOT NULL,
      key_points     TEXT NOT NULL,            -- JSON array
      why_it_matters TEXT NOT NULL,
      source         TEXT NOT NULL,
      model          TEXT NOT NULL,
      assessed_at    TEXT NOT NULL,
      FOREIGN KEY (news_item_id) REFERENCES news_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_assess_score ON assessments(score);

    CREATE TABLE IF NOT EXISTS alerts (
      id            TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      channel       TEXT NOT NULL,
      status        TEXT NOT NULL,
      detail        TEXT,
      sent_at       TEXT,
      created_at    TEXT NOT NULL,
      FOREIGN KEY (assessment_id) REFERENCES assessments(news_item_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);

    -- Single-row config tables keyed by a fixed id. Editable from the dashboard.
    CREATE TABLE IF NOT EXISTS app_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL                       -- JSON blob
    );
  `);
}
