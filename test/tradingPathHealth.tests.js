import path from "node:path";
import {
  buildFeedAggregationSummary,
  buildTradingPathHealth,
  normalizeDashboardFreshness,
  normalizeFrontendPollingHealth
} from "../src/runtime/tradingPathHealth.js";
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
    assert.equal(missing.staleReason, "missing_snapshot_timestamp");
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
    assert.equal(typeof output.health.status, "string");
  });
}
