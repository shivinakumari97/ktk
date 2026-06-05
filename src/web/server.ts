import express from "express";
import { randomUUID } from "node:crypto";
import { getApp } from "../app.js";
import { runPipeline } from "../core/pipeline.js";
import { pollOnce } from "../scheduler/scheduler.js";
import type { ChannelConfig, SourceType, WatchlistConfig } from "../types.js";
import {
  dashboardView,
  deliveryView,
  sourcesView,
  watchlistView,
} from "./views.js";

/**
 * Dashboard + JSON API. Server-rendered HTML for v1 (no SPA build). The API
 * routes expose the same data for a richer UI later.
 */
export function createServer() {
  const appServer = express();
  appServer.use(express.urlencoded({ extended: true }));
  appServer.use(express.json());

  const { repos } = getApp();
  const lines = (s: unknown): string[] =>
    String(s ?? "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);

  // ── Dashboard: alert history ──
  appServer.get("/", (_req, res) => {
    const watchlist = repos.config.getWatchlist()!;
    res.send(dashboardView(repos.alerts.history(100), watchlist));
  });

  // ── Watchlist ──
  appServer.get("/watchlist", (_req, res) => {
    res.send(watchlistView(repos.config.getWatchlist()!));
  });
  appServer.post("/watchlist", (req, res) => {
    const b = req.body;
    const w: WatchlistConfig = {
      people: lines(b.people),
      topics: lines(b.topics),
      regions: lines(b.regions),
      minRelevanceScore: Math.max(0, Math.min(1, Number(b.minRelevanceScore) || 0)),
      quietHours: String(b.quietHours || "22:00-07:00"),
    };
    repos.config.setWatchlist(w);
    res.redirect("/watchlist");
  });

  // ── Delivery ──
  appServer.get("/delivery", (_req, res) => {
    res.send(deliveryView(repos.config.getDelivery()!));
  });
  appServer.post("/delivery", (req, res) => {
    const b = req.body;
    const count = Number(b.count) || 0;
    const channels: ChannelConfig[] = [];
    for (let i = 0; i < count; i++) {
      channels.push({
        channel: String(b[`channel_${i}`]),
        enabled: b[`enabled_${i}`] === "on",
        to: String(b[`to_${i}`] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        format: b[`format_${i}`] === "compact" ? "compact" : "full",
      });
    }
    repos.config.setDelivery({ channels });
    res.redirect("/delivery");
  });

  // ── Sources ──
  appServer.get("/sources", (_req, res) => {
    res.send(sourcesView(repos.sources.list()));
  });
  appServer.post("/sources", (req, res) => {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(req.body.config || "{}");
    } catch {
      return res.status(400).send("Invalid config JSON. <a href='/sources'>back</a>");
    }
    repos.sources.upsert({
      id: `${req.body.type}-${randomUUID().slice(0, 8)}`,
      type: req.body.type as SourceType,
      name: String(req.body.name || "Untitled"),
      config,
      enabled: true,
    });
    res.redirect("/sources");
  });
  appServer.post("/sources/:id/toggle", (req, res) => {
    const s = repos.sources.list().find((x) => x.id === req.params.id);
    if (s) repos.sources.setEnabled(s.id, !s.enabled);
    res.redirect("/sources");
  });
  appServer.post("/sources/:id/delete", (req, res) => {
    repos.sources.remove(req.params.id);
    res.redirect("/sources");
  });

  // ── Trigger a poll ──
  appServer.post("/run", async (_req, res) => {
    await pollOnce();
    res.redirect("/");
  });

  // ── JSON API ──
  appServer.get("/api/health", (_req, res) => res.json({ ok: true }));
  appServer.get("/api/alerts", (_req, res) => res.json(repos.alerts.history(200)));
  appServer.get("/api/watchlist", (_req, res) => res.json(repos.config.getWatchlist()));
  appServer.post("/api/run", async (_req, res) => {
    const { deps } = getApp();
    res.json(await runPipeline(deps));
  });

  return appServer;
}
