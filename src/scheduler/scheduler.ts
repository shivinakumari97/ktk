import cron from "node-cron";
import { getApp } from "../app.js";
import { runPipeline } from "../core/pipeline.js";
import { env } from "../config/env.js";

/**
 * Cron-style poller. Runs the pipeline on POLL_CRON. A simple in-process lock
 * prevents overlapping runs if a poll takes longer than the interval.
 */
let running = false;

export async function pollOnce(): Promise<void> {
  if (running) {
    console.log("[scheduler] previous run still in progress; skipping tick.");
    return;
  }
  running = true;
  const started = Date.now();
  try {
    const { deps } = getApp();
    const stats = await runPipeline(deps);
    console.log(
      `[scheduler] run done in ${Date.now() - started}ms`,
      JSON.stringify(stats),
    );
  } catch (err) {
    console.error("[scheduler] run failed:", err);
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (!env.schedulerEnabled) {
    console.log("[scheduler] disabled (SCHEDULER_ENABLED=false).");
    return;
  }
  if (!cron.validate(env.pollCron)) {
    console.error(`[scheduler] invalid POLL_CRON "${env.pollCron}"; not starting.`);
    return;
  }
  console.log(`[scheduler] polling on "${env.pollCron}" (tz=${env.tz}).`);
  cron.schedule(env.pollCron, pollOnce, { timezone: env.tz });
}
