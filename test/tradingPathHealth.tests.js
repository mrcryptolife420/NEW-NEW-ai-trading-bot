import path from "node:path";
import {
  buildFeedAggregationSummary,
  buildTradingPathHealth,
  normalizeDashboardFreshness,
  normalizeFrontendPollingHealth
} from "../src/runtime/tradingPathHealth.js";
import {
  buildMarketSnapshotFlowDebug,
  compactMarketSnapshotMap,
  summarizeMarketSnapshotForRuntime
} from "../src/runtime/marketSnapshotFlowDebug.js";
import { StateStore } from "../src/storage/stateStore.js";

export async function registerTradingPathHealthTests({ runCheck, assert, fs, os, runCli }) {
  const now = "2026-05-03T12:00:00.000Z";

  await runCheck("trading path health reports active when cycle feed dashboard and readmodel are fresh", async () => {
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-03T11:59:00.000Z",
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } }
      },
      dashboardSnapshot: {
        generatedAt: "2026-05-03T11:59:50.000Z",
        overview: { lastCycleAt: "2026-05-03T11:59:00.000Z" },
        topDecisions: [{ symbol: "BTCUSDT" }]
      },
      feedSummary: {
        status: "ready",
        symbolsRequested: 1,
        symbolsReady: 1,
        missingSymbols: [],
        staleSources: [],
        lastSuccessfulAggregationAt: "2026-05-03T11:59:30.000Z"
      },
      readmodelSummary: { status: "ready", rebuiltAt: "2026-05-03T11:58:00.000Z" }
    });
    assert.equal(health.status, "active");
    assert.equal(health.blockingReasons.length, 0);
    assert.equal(health.nextAction, "monitor_next_cycle");
  });

  await runCheck("trading path health surfaces stale feed and missing decisions without claiming trade allowed", async () => {
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-03T11:50:00.000Z",
        latestMarketSnapshots: {}
      },
      dashboardSnapshot: { generatedAt: "2026-05-03T11:59:00.000Z", topDecisions: [] },
      feedSummary: {
        status: "stale",
        symbolsRequested: 4,
        symbolsReady: 0,
        missingSymbols: ["BTCUSDT"],
        staleSources: ["feed_aggregation_stale"],
        lastSuccessfulAggregationAt: "2026-05-03T11:40:00.000Z"
      },
      readmodelSummary: { status: "ready", rebuiltAt: "2026-05-03T11:58:00.000Z" }
    });
    assert.equal(health.status, "stale");
    assert.ok(health.blockingReasons.includes("no_recent_scan_cycle"));
    assert.ok(health.blockingReasons.includes("no_market_snapshots_ready"));
    assert.ok(health.blockingReasons.includes("no_decision_snapshot_created"));
    assert.equal(health.nextAction, "run_once_and_check_feed_sources");
  });

  await runCheck("exchange safety remains dominant over stale dashboard state", async () => {
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-03T11:59:00.000Z",
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } }
      },
      dashboardSnapshot: {
        generatedAt: "2026-05-03T11:59:50.000Z",
        topDecisions: [{ symbol: "BTCUSDT" }],
        exchangeSafety: { status: "blocked", entryBlocked: true }
      },
      feedSummary: { status: "ready", symbolsRequested: 1, symbolsReady: 1, missingSymbols: [], staleSources: [] },
      readmodelSummary: { status: "ready", rebuiltAt: "2026-05-03T11:58:00.000Z" }
    });
    assert.equal(health.status, "blocked");
    assert.ok(health.blockingReasons.includes("exchange_safety_blocked"));
    assert.equal(health.nextAction, "run_reconcile_plan_or_exchange_safety_status");
  });

  await runCheck("dashboard freshness handles fresh stale missing and rebuilt snapshots", async () => {
    const fresh = normalizeDashboardFreshness({ generatedAt: "2026-05-03T11:59:30.000Z" }, now, { dashboardSnapshotStaleMs: 120000 });
    const stale = normalizeDashboardFreshness({ generatedAt: "2026-05-03T11:50:00.000Z" }, now, { dashboardSnapshotStaleMs: 120000 });
    const missing = normalizeDashboardFreshness({}, now, {});
    const rebuilt = normalizeDashboardFreshness({
      snapshotMeta: {
        generatedAt: "2026-05-03T11:59:45.000Z",
        lastCycleAt: "2026-05-03T11:59:00.000Z"
      }
    }, now, {});
    assert.equal(fresh.fresh, true);
    assert.equal(stale.staleReason, "dashboard_snapshot_stale");
    assert.equal(missing.staleReason, "dashboard_snapshot_unavailable");
    assert.equal(rebuilt.fresh, true);
  });

  await runCheck("feed aggregation summary handles fresh partial empty watchlist and REST pressure", async () => {
    const fresh = buildFeedAggregationSummary({
      now,
      watchlist: ["BTCUSDT"],
      marketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } }
    });
    const partial = buildFeedAggregationSummary({
      now,
      watchlist: ["BTCUSDT", "ETHUSDT"],
      marketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } }
    });
    const empty = buildFeedAggregationSummary({ now, watchlist: [], marketSnapshots: {} });
    const budget = buildFeedAggregationSummary({
      now,
      watchlist: ["BTCUSDT"],
      marketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } },
      requestBudget: { banActive: true }
    });
    assert.equal(fresh.status, "ready");
    assert.equal(partial.status, "degraded");
    assert.ok(partial.missingSymbols.includes("ETHUSDT"));
    assert.equal(empty.status, "empty_watchlist");
    assert.ok(budget.staleSources.includes("rest_budget_exhausted"));
  });

  await runCheck("feed aggregation treats stopped one-shot stream disconnect as non-authoritative", async () => {
    const stopped = buildFeedAggregationSummary({
      now,
      runtimeState: {
        lifecycle: { activeRun: false },
        service: { watchdogStatus: "stopped", initMode: "full" },
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } }
      },
      watchlist: ["BTCUSDT"],
      streamStatus: { publicStreamConnected: false }
    });
    const liveLoop = buildFeedAggregationSummary({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        service: { watchdogStatus: "running", initMode: "full" },
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } }
      },
      watchlist: ["BTCUSDT"],
      streamStatus: { publicStreamConnected: false }
    });
    assert.equal(stopped.status, "ready");
    assert.equal(stopped.streamConnectivityAuthoritative, false);
    assert.equal(stopped.staleSources.includes("public_stream_disconnected"), false);
    assert.equal(liveLoop.streamConnectivityAuthoritative, true);
    assert.ok(liveLoop.staleSources.includes("public_stream_disconnected"));
    assert.equal(liveLoop.status, "degraded");
  });

  await runCheck("feed aggregation falls back to fresh decision snapshots when compact map is missing", async () => {
    const feed = buildFeedAggregationSummary({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-03T11:59:00.000Z",
        latestDecisions: [
          { symbol: "BTCUSDT", marketData: { status: "ready" }, orderBook: { spreadBps: 1 } },
          { symbol: "ETHUSDT", marketData: { status: "ready" }, strategy: { activeStrategy: "trend_following" } }
        ]
      },
      watchlist: ["BTCUSDT", "ETHUSDT"],
      marketSnapshots: {}
    });
    assert.equal(feed.status, "ready");
    assert.equal(feed.symbolsReady, 2);
    assert.equal(feed.snapshotSource, "decision_snapshot_fallback");
    assert.equal(feed.staleSources.includes("no_market_snapshots_ready"), false);

    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-03T11:59:00.000Z",
        latestDecisions: [
          { symbol: "BTCUSDT", marketData: { status: "ready" }, orderBook: { spreadBps: 1 } },
          { symbol: "ETHUSDT", marketData: { status: "ready" }, strategy: { activeStrategy: "trend_following" } }
        ]
      },
      dashboardSnapshot: { generatedAt: "2026-05-03T11:59:50.000Z", topDecisions: [{ symbol: "BTCUSDT" }] },
      feedSummary: feed,
      readmodelSummary: { status: "ready", rebuiltAt: "2026-05-03T11:58:00.000Z" }
    });
    assert.equal(health.marketSnapshotsCount, 2);
    assert.equal(health.blockingReasons.includes("no_market_snapshots_ready"), false);
  });

  await runCheck("dashboard-only staleness degrades observability without marking trading path stale", async () => {
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: false },
        service: { watchdogStatus: "stopped" },
        lastCycleAt: "2026-05-03T11:59:00.000Z",
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } },
        latestDecisions: [{ symbol: "BTCUSDT" }]
      },
      dashboardSnapshot: {},
      feedSummary: {
        status: "ready",
        symbolsRequested: 1,
        symbolsReady: 1,
        missingSymbols: [],
        staleSources: [],
        lastSuccessfulAggregationAt: "2026-05-03T11:59:30.000Z"
      },
      readmodelSummary: { status: "ready", rebuiltAt: "2026-05-03T11:00:00.000Z" }
    });
    assert.equal(health.status, "degraded");
    assert.deepEqual(health.blockingReasons, []);
    assert.ok(health.staleSources.includes("dashboard_snapshot_unavailable"));
    assert.ok(health.staleSources.includes("readmodel_snapshot_stale"));
    assert.equal(health.nextAction, "run_readmodel_rebuild");
  });

  await runCheck("missing dashboard snapshot reports explicit operator action", async () => {
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-03T11:59:00.000Z",
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } },
        latestDecisions: [{ symbol: "BTCUSDT", marketData: { status: "ready" } }]
      },
      dashboardSnapshot: {},
      feedSummary: {
        status: "ready",
        symbolsRequested: 1,
        symbolsReady: 1,
        missingSymbols: [],
        staleSources: [],
        lastSuccessfulAggregationAt: "2026-05-03T11:59:30.000Z"
      },
      readmodelSummary: { status: "ready", journalRefreshedAt: "2026-05-03T11:59:20.000Z" }
    });
    assert.equal(health.status, "degraded");
    assert.deepEqual(health.blockingReasons, []);
    assert.ok(health.staleSources.includes("dashboard_snapshot_unavailable"));
    assert.equal(health.nextAction, "start_dashboard_or_fetch_snapshot");
  });

  await runCheck("readmodel freshness uses latest journal refresh over older rebuild timestamp", async () => {
    const health = buildTradingPathHealth({
      now,
      runtimeState: {
        lifecycle: { activeRun: true },
        lastCycleAt: "2026-05-03T11:59:00.000Z",
        latestMarketSnapshots: { BTCUSDT: { updatedAt: "2026-05-03T11:59:30.000Z" } },
        latestDecisions: [{ symbol: "BTCUSDT", marketData: { status: "ready" } }]
      },
      dashboardSnapshot: { generatedAt: "2026-05-03T11:59:50.000Z", topDecisions: [{ symbol: "BTCUSDT" }] },
      feedSummary: {
        status: "ready",
        symbolsRequested: 1,
        symbolsReady: 1,
        missingSymbols: [],
        staleSources: [],
        lastSuccessfulAggregationAt: "2026-05-03T11:59:30.000Z"
      },
      readmodelSummary: {
        status: "ready",
        rebuiltAt: "2026-05-03T10:00:00.000Z",
        journalRefreshedAt: "2026-05-03T11:59:20.000Z"
      }
    });
    assert.equal(health.readmodelFresh, true);
    assert.equal(health.readmodelFreshness.lastUpdatedAt, "2026-05-03T11:59:20.000Z");
    assert.equal(health.staleSources.includes("readmodel_snapshot_stale"), false);
  });

  await runCheck("market snapshot flow debug compacts runtime snapshots without candle bloat", async () => {
    const compact = summarizeMarketSnapshotForRuntime({
      symbol: "BTCUSDT",
      candles: [{ close: 100 }, { close: 101 }],
      cachedAt: "2026-05-03T11:59:30.000Z",
      market: { close: 101, realizedVolPct: 0.02, volumeZ: 1.1 },
      book: { bid: 100.9, ask: 101.1, mid: 101, spreadBps: 1.98, depthConfidence: 0.72 },
      stream: { recentTradeCount: 12, latestBookTicker: { bid: 100.9, ask: 101.1 } }
    }, now);
    assert.equal(compact.symbol, "BTCUSDT");
    assert.equal(compact.candlesCount, 2);
    assert.equal(compact.hasBook, true);
    assert.equal(compact.book.mid, 101);
    assert.equal(compact.candles, undefined);

    const map = compactMarketSnapshotMap({
      BTCUSDT: {
        candles: [{ close: 100 }],
        cachedAt: "2026-05-03T11:59:30.000Z",
        book: { mid: 100 },
        market: { close: 100 }
      }
    }, now);
    assert.equal(Object.keys(map).length, 1);
    assert.equal(map.BTCUSDT.candlesCount, 1);
    assert.equal(map.BTCUSDT.candles, undefined);
  });

  await runCheck("market snapshot flow debug explains ready missing and prefetch failure states", async () => {
    const flow = buildMarketSnapshotFlowDebug({
      now,
      watchlist: ["BTCUSDT", "ETHUSDT"],
      symbolsRequested: ["BTCUSDT", "ETHUSDT"],
      deepScanSymbols: ["BTCUSDT"],
      localBookSymbols: ["BTCUSDT", "ETHUSDT"],
      snapshotMap: {
        BTCUSDT: {
          symbol: "BTCUSDT",
          cachedAt: "2026-05-03T11:59:30.000Z",
          book: { bid: 100, ask: 101, mid: 100.5 },
          market: { close: 100.5 }
        }
      },
      prefetchFailures: ["ETHUSDT"],
      candidates: [{ symbol: "BTCUSDT", marketSnapshot: { book: { mid: 100.5 } } }],
      marketCache: { BTCUSDT: { cachedAt: "2026-05-03T11:59:30.000Z" } }
    });
    assert.equal(flow.status, "degraded");
    assert.equal(flow.snapshotsReady, 1);
    assert.equal(flow.candidatesWithSnapshots, 1);
    assert.ok(flow.missingSymbols.includes("ETHUSDT"));
    assert.ok(flow.staleSources.includes("snapshot_prefetch_failures"));
    assert.equal(flow.nextAction, "monitor_next_cycle");
  });

  await runCheck("frontend polling error clears after a successful snapshot", async () => {
    const failed = normalizeFrontendPollingHealth({
      now,
      lastSnapshotError: "fetch_failed",
      lastSnapshotErrorAt: "2026-05-03T11:59:20.000Z",
      lastSuccessfulSnapshotAt: "2026-05-03T11:58:00.000Z",
      expectedIntervalMs: 10000
    });
    const recovered = normalizeFrontendPollingHealth({
      now,
      lastSnapshotError: "fetch_failed",
      lastSnapshotErrorAt: "2026-05-03T11:59:20.000Z",
      lastSuccessfulSnapshotAt: "2026-05-03T11:59:40.000Z",
      expectedIntervalMs: 10000
    });
    assert.equal(failed.healthy, false);
    assert.equal(failed.lastSnapshotError, "fetch_failed");
    assert.equal(recovered.lastSnapshotError, null);
    assert.equal(recovered.errorCleared, true);
  });

  await runCheck("trading-path debug CLI is read-only and graceful without dashboard snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trading-path-health-"));
    const runtimeDir = path.join(root, "runtime");
    const store = new StateStore(runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    runtime.lastCycleAt = "2026-05-03T11:58:00.000Z";
    runtime.latestMarketSnapshots = { BTCUSDT: { updatedAt: "2026-05-03T11:58:30.000Z" } };
    runtime.marketSnapshotFlowDebug = { status: "ready", snapshotsReady: 1, snapshotsPersisted: 1 };
    runtime.latestDecisions = [{ symbol: "BTCUSDT" }];
    await store.saveRuntime(runtime);
    const lines = [];
    const previousLog = console.log;
    console.log = (line) => lines.push(line);
    try {
      await runCli({
        command: "trading-path:debug",
        args: [],
        config: { runtimeDir, projectRoot: root, watchlist: ["BTCUSDT"], botMode: "paper" },
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        processState: {}
      });
    } finally {
      console.log = previousLog;
    }
    const output = JSON.parse(lines[0]);
    assert.equal(output.readOnly, true);
    assert.equal(output.safety, "diagnostic_only_no_entry_unlock");
    assert.equal(output.marketSnapshotFlowDebug.snapshotsReady, 1);
    assert.equal(typeof output.health.status, "string");
  });
}
