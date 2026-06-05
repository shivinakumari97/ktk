import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../src/db/db.js";
import { makeRepos, type Repos } from "../src/db/repositories.js";
import { SourceRegistry, NotifierRegistry } from "../src/core/registry.js";
import { mockSourceFactory } from "../src/sources/mock.js";
import { MockAssessor } from "../src/assess/mock.js";
import { MockNotifier } from "../src/notify/mock.js";
import { runPipeline, type PipelineDeps } from "../src/core/pipeline.js";
import { decide, inQuietHours } from "../src/core/gate.js";
import { titleSimilarity } from "../src/core/util.js";
import type { WatchlistConfig } from "../src/types.js";

const WATCHLIST: WatchlistConfig = {
  people: ["Chief Minister of Karnataka", "Deputy Chief Minister"],
  topics: ["industrial & investment policy", "FDI / new factory", "incentives, subsidies, taxation"],
  regions: ["Karnataka", "Bengaluru"],
  minRelevanceScore: 0.3,
  quietHours: "22:00-07:00",
};

const ITEMS = [
  {
    title: "Karnataka CM unveils ₹5,000 crore industrial investment policy",
    url: "https://example.com/a",
    body:
      "The Chief Minister of Karnataka announced a new industrial policy with ₹5,000 crore in " +
      "incentives. It includes a 25% capital subsidy for factories and a 5-year tax holiday for " +
      "EV manufacturers in Bengaluru. The Deputy Chief Minister targeted ₹50,000 crore in FDI.",
  },
  {
    title: "Bengaluru weekend weather forecast: light showers likely",
    url: "https://example.com/b",
    body: "Light rain is expected across Bengaluru this weekend per the weather department.",
  },
];

function buildDeps(repos: Repos, notifier: MockNotifier, tz = "Asia/Kolkata"): PipelineDeps {
  const sources = new SourceRegistry().register("mock", mockSourceFactory);
  const notifiers = new NotifierRegistry().register(notifier);
  return { repos, sources, notifiers, assessor: new MockAssessor(), tz };
}

function seedConfig(repos: Repos, overrides: Partial<WatchlistConfig> = {}) {
  repos.config.setWatchlist({ ...WATCHLIST, ...overrides });
  repos.config.setDelivery({
    channels: [{ channel: "mock", enabled: true, to: ["+910000000000"], format: "full" }],
  });
  repos.sources.upsert({
    id: "mock-1",
    type: "mock",
    name: "Test source",
    config: { items: ITEMS },
    enabled: true,
  });
}

describe("pipeline", () => {
  let repos: Repos;
  let notifier: MockNotifier;

  beforeEach(() => {
    repos = makeRepos(makeTestDb());
    notifier = new MockNotifier();
    seedConfig(repos);
  });

  it("ingests, assesses, gates, and delivers the relevant item only", async () => {
    const now = new Date("2026-06-05T12:00:00+05:30"); // midday IST, not quiet hours
    const stats = await runPipeline(buildDeps(repos, notifier), { now });

    expect(stats.newItems).toBe(2);
    expect(stats.assessed).toBe(2);
    // Only the policy item clears the 0.3 threshold; weather is dropped.
    expect(stats.sent).toBe(1);
    expect(stats.dropped).toBe(1);

    expect(notifier.sent).toHaveLength(1);
    const text = notifier.sent[0]!.text;
    expect(text).toContain("industrial");
    expect(text).toContain("Why it matters");
    // Full format carries the key points as bullets.
    expect(text).toContain("•");
  });

  it("dedups identical items across runs (never alerts twice)", async () => {
    const now = new Date("2026-06-05T12:00:00+05:30");
    const deps = buildDeps(repos, notifier);
    await runPipeline(deps, { now });
    const second = await runPipeline(deps, { now });

    expect(second.newItems).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(notifier.sent).toHaveLength(1); // still just one delivery total
  });

  it("queues instead of sending during quiet hours", async () => {
    const now = new Date("2026-06-05T23:30:00+05:30"); // inside 22:00-07:00 IST
    const stats = await runPipeline(buildDeps(repos, notifier), { now });

    expect(stats.queued).toBe(1);
    expect(stats.sent).toBe(0);
    expect(notifier.sent).toHaveLength(0);
  });

  it("respects the relevance threshold", async () => {
    // Lowering the threshold lets the weaker (weather) item through too.
    repos.config.setWatchlist({ ...WATCHLIST, minRelevanceScore: 0.1 });
    const now = new Date("2026-06-05T12:00:00+05:30");
    const stats = await runPipeline(buildDeps(repos, notifier), { now });
    expect(stats.sent).toBe(2);
    expect(stats.dropped).toBe(0);
  });
});

describe("gate", () => {
  it("detects quiet hours across a midnight-wrapping window", () => {
    const tz = "Asia/Kolkata";
    expect(inQuietHours(new Date("2026-06-05T23:00:00+05:30"), "22:00-07:00", tz)).toBe(true);
    expect(inQuietHours(new Date("2026-06-05T06:00:00+05:30"), "22:00-07:00", tz)).toBe(true);
    expect(inQuietHours(new Date("2026-06-05T12:00:00+05:30"), "22:00-07:00", tz)).toBe(false);
  });

  it("drops below-threshold assessments", () => {
    const a = {
      newsItemId: "x", relevant: true, score: 0.2, category: "c", headline: "h",
      keyPoints: [], whyItMatters: "", source: "s", model: "m", assessedAt: "",
    };
    const { decision } = decide(a, WATCHLIST, new Date("2026-06-05T12:00:00+05:30"), "Asia/Kolkata");
    expect(decision).toBe("drop");
  });
});

describe("dedup similarity", () => {
  it("scores near-duplicate headlines high", () => {
    const s = titleSimilarity(
      "Karnataka CM announces new industrial investment policy",
      "Karnataka Chief Minister announces new industrial investment policy",
    );
    expect(s).toBeGreaterThan(0.6);
  });

  it("scores unrelated headlines low", () => {
    const s = titleSimilarity(
      "Karnataka CM announces industrial policy",
      "Bengaluru weather forecast light showers weekend",
    );
    expect(s).toBeLessThan(0.2);
  });
});
