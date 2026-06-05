import { getDb } from "./db/db.js";
import { makeRepos, type Repos } from "./db/repositories.js";
import { buildSourceRegistry } from "./sources/index.js";
import { buildNotifierRegistry } from "./notify/index.js";
import { buildAssessor } from "./assess/index.js";
import { env } from "./config/env.js";
import { seed } from "./config/seed.js";
import type { PipelineDeps } from "./core/pipeline.js";

/**
 * Composition root: builds the fully-wired pipeline dependencies once and shares
 * them across the web server, scheduler, and one-shot worker. Real vs mock
 * implementations are chosen here based on which credentials are present.
 */
export interface App {
  repos: Repos;
  deps: PipelineDeps;
}

let app: App | null = null;

export function getApp(): App {
  if (app) return app;
  const db = getDb();
  seed(); // idempotent
  const repos = makeRepos(db);
  const deps: PipelineDeps = {
    repos,
    sources: buildSourceRegistry(),
    notifiers: buildNotifierRegistry(),
    assessor: buildAssessor(),
    tz: env.tz,
  };
  app = { repos, deps };
  return app;
}
