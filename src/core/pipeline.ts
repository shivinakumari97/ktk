import type { Assessor } from "../types.js";
import type { Repos } from "../db/repositories.js";
import type { NotifierRegistry, SourceRegistry } from "./registry.js";
import { Deduper } from "./dedup.js";
import { decide } from "./gate.js";
import { formatAlert } from "./format.js";

/**
 * The pipeline: ingest → dedup → assess → gate → dispatch → persist.
 *
 * It depends only on interfaces (Source/Assessor/Notifier) via the registries
 * and repos, so every stage is swappable and the whole thing is testable with
 * mocks (see tests/pipeline.test.ts).
 */

export interface PipelineDeps {
  repos: Repos;
  sources: SourceRegistry;
  notifiers: NotifierRegistry;
  assessor: Assessor;
  tz: string;
}

export interface RunStats {
  fetched: number;
  newItems: number;
  duplicates: number;
  assessed: number;
  sent: number;
  queued: number;
  dropped: number;
  failed: number;
}

export async function runPipeline(
  deps: PipelineDeps,
  opts: { since?: Date; now?: Date } = {},
): Promise<RunStats> {
  const { repos, sources, notifiers, assessor, tz } = deps;
  const now = opts.now ?? new Date();
  const since = opts.since ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const stats: RunStats = {
    fetched: 0,
    newItems: 0,
    duplicates: 0,
    assessed: 0,
    sent: 0,
    queued: 0,
    dropped: 0,
    failed: 0,
  };

  const watchlist = repos.config.getWatchlist();
  const delivery = repos.config.getDelivery();
  if (!watchlist || !delivery) {
    throw new Error("Config not seeded. Run `npm run seed` first.");
  }

  // 1. INGEST
  const liveSources = sources.build(repos.sources.listEnabled());
  const deduper = new Deduper(repos.news);

  for (const src of liveSources) {
    let items;
    try {
      items = await src.fetch(since);
    } catch (err) {
      console.warn(`[pipeline] source ${src.id} fetch failed:`, err);
      continue;
    }
    stats.fetched += items.length;

    for (const item of items) {
      // 2. DEDUP
      if (deduper.isDuplicate(item)) {
        stats.duplicates++;
        continue;
      }
      const isNew = repos.news.insertIfNew(item);
      if (!isNew) {
        stats.duplicates++;
        continue;
      }
      deduper.remember(item.title);
      stats.newItems++;

      // 3. ASSESS
      let assessment;
      try {
        assessment = await assessor.assess(item, watchlist);
      } catch (err) {
        console.warn(`[pipeline] assessment failed for ${item.id}:`, err);
        stats.failed++;
        continue;
      }
      repos.assessments.save(assessment);
      stats.assessed++;

      // 4. GATE
      const { decision, reason } = decide(assessment, watchlist, now, tz);
      if (decision === "drop") {
        stats.dropped++;
        continue;
      }

      // 5. DISPATCH (fan out to enabled channels)
      for (const channel of delivery.channels) {
        if (!channel.enabled || channel.to.length === 0) continue;
        const notifier = notifiers.get(channel.channel);
        if (!notifier) {
          console.warn(`[pipeline] no notifier for channel "${channel.channel}"`);
          continue;
        }
        if (repos.alerts.alreadySent(assessment.newsItemId, channel.channel)) continue;

        if (decision === "queue") {
          repos.alerts.create({
            assessmentId: assessment.newsItemId,
            channel: channel.channel,
            status: "queued",
            detail: reason,
          });
          stats.queued++;
          continue;
        }

        const text = formatAlert(assessment, channel);
        const result = await notifier.send(
          { assessmentId: assessment.newsItemId, text, assessment },
          channel,
        );
        repos.alerts.create({
          assessmentId: assessment.newsItemId,
          channel: channel.channel,
          status: result.status,
          detail: result.detail,
          sentAt: result.status === "sent" ? new Date().toISOString() : undefined,
        });
        if (result.status === "sent") stats.sent++;
        else if (result.status === "failed") stats.failed++;
      }
    }
  }

  return stats;
}
