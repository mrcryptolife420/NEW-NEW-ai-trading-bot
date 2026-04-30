import { AuditLogStore } from "../src/storage/auditLogStore.js";
import { ReadModelStore } from "../src/storage/readModelStore.js";
import { StateStore } from "../src/storage/stateStore.js";
import { PersistenceCoordinator } from "../src/runtime/persistenceCoordinator.js";
import { TradingBot } from "../src/runtime/tradingBot.js";
import { runMarketReplay } from "../src/runtime/marketReplayEngine.js";
import { buildMarketScannerUniverse, resolveScannerDeepBookPlan } from "../src/runtime/marketScanner.js";
import { buildPerformanceReport } from "../src/runtime/reportBuilder.js";
import {
  assertTradingBotServiceCoverage,
  buildTradingBotServiceMap
} from "../src/runtime/tradingBotDecomposition.js";
import {
  buildOperatorActionResult,
  buildOperatorRunbookForReason,
  buildStrategyLifecycleDiagnostics
} from "../src/runtime/operatorRunbookGenerator.js";

function buildCandles(count = 70) {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const openTime = start + index * 15 * 60_000;
    const open = 100 + index * 0.1;
    const close = open + (index % 2 === 0 ? 0.05 : -0.03);
    return {
      openTime,
      closeTime: openTime + 15 * 60_000 - 1,
      open,
      high: Math.max(open, close) + 0.2,
      low: Math.min(open, close) - 0.2,
      close,
      volume: 100 + index
    };
  });
}

export async function registerLargeFoundationsTests({
  runCheck,
  assert,
  fs,
  os,
  path,
  makeConfig
}) {
  await runCheck("sqlite read model rebuilds from journal and audit source files", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-readmodel-"));
    const stateStore = new StateStore(runtimeDir);
    await stateStore.init();
    await stateStore.saveJournal({
      trades: [
        {
          id: "trade-1",
          symbol: "BTCUSDT",
          brokerMode: "paper",
          entryAt: "2026-01-01T00:00:00.000Z",
          exitAt: "2026-01-01T01:00:00.000Z",
          pnlQuote: 12,
          netPnlPct: 0.03,
          strategyAtEntry: { strategy: "breakout", family: "breakout" },
          regimeAtEntry: "trend_up"
        }
      ],
      blockedSetups: [
        {
          decisionId: "decision-1",
          symbol: "ETHUSDT",
          at: "2026-01-01T02:00:00.000Z",
          reasons: ["exchange_safety_blocked", "model_confidence_too_low"],
          rootBlocker: "exchange_safety_blocked",
          blockerStage: "hard_safety"
        }
      ],
      events: [
        {
          at: "2026-01-01T02:05:00.000Z",
          type: "binance_request_weight_budget",
          requestWeight: {
            usedWeight1m: 123,
            usedWeight: 456,
            topRestCallers: {
              "spot:GET:/api/v3/ticker/bookTicker": {
                count: 3,
                endpoint: "GET /api/v3/ticker/bookTicker",
                scope: "spot"
              }
            }
          }
        }
      ]
    });
    const auditStore = new AuditLogStore(runtimeDir);
    await auditStore.append({
      id: "audit-1",
      at: "2026-01-01T02:00:01.000Z",
      type: "decision_blocked",
      symbol: "ETHUSDT",
      cycleId: "cycle-1",
      decisionId: "decision-1"
    });

    const readModel = new ReadModelStore({ runtimeDir });
    const status = await readModel.rebuildFromSources({ stateStore, auditStore });
    const dashboard = readModel.dashboardSummary();
    const decisionTrace = readModel.readDecisionTrace("decision-1");
    const cycleTrace = readModel.readCycleTrace("cycle-1");
    const symbolTrace = readModel.readSymbolTrace("ETHUSDT");
    readModel.close();

    assert.equal(status.tables.trades, 1);
    assert.equal(status.tables.decisions, 1);
    assert.equal(status.tables.blockers, 2);
    assert.equal(status.tables.auditEvents, 2);
    assert.equal(status.tables.scorecards, 1);
    assert.equal(dashboard.source, "sqlite_read_model");
    assert.equal(dashboard.topBlockers[0].reason, "exchange_safety_blocked");
    assert.equal(dashboard.requestBudget.status, "ready");
    assert.equal(dashboard.requestBudget.latestWeight1m, 123);
    assert.equal(dashboard.requestBudget.topCallers[0].caller, "spot:GET:/api/v3/ticker/bookTicker");
    assert.equal(decisionTrace.status, "ready");
    assert.equal(decisionTrace.blockers.length, 2);
    assert.equal(cycleTrace.decisionIds.includes("decision-1"), true);
    assert.equal(symbolTrace.decisions.length, 1);
  });

  await runCheck("sqlite read model can discard corrupt local cache and rebuild empty", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-readmodel-corrupt-"));
    await fs.mkdir(runtimeDir, { recursive: true });
    const dbPath = path.join(runtimeDir, "read-model.sqlite");
    await fs.writeFile(dbPath, "not a sqlite database", "utf8");
    const readModel = new ReadModelStore({ runtimeDir, dbPath });
    await readModel.init();
    const status = readModel.status();
    readModel.close();
    assert.equal(status.status, "ready");
    assert.equal(status.tables.trades, 0);
  });

  await runCheck("sqlite read model refreshes journal snapshots without dropping replay traces", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-readmodel-refresh-"));
    const readModel = new ReadModelStore({ runtimeDir });
    await readModel.init();
    readModel.upsertReplayTrace({ id: "replay-1", symbol: "BTCUSDT", at: "2026-01-01T00:00:00.000Z", status: "ready" });
    const status = readModel.refreshFromJournalSnapshot({
      journal: {
        trades: [{
          id: "trade-1",
          symbol: "BTCUSDT",
          brokerMode: "paper",
          entryAt: "2026-01-01T00:00:00.000Z",
          exitAt: "2026-01-01T01:00:00.000Z",
          pnlQuote: 5,
          netPnlPct: 0.01,
          strategyAtEntry: { strategy: "breakout", family: "breakout" }
        }]
      }
    });
    const dashboard = readModel.dashboardSummary();
    readModel.close();
    assert.equal(status.tables.trades, 1);
    assert.equal(status.tables.replayTraces, 1);
    assert.ok(status.journalRefreshedAt);
    assert.equal(dashboard.latestReplay.id, "replay-1");
  });

  await runCheck("operator runbooks and strategy lifecycle diagnostics are action-oriented", async () => {
    const runbook = buildOperatorRunbookForReason("exchange_safety_blocked");
    const lifecycle = buildStrategyLifecycleDiagnostics([
      { strategyId: "range_grid", status: "dangerous" },
      { strategyId: "breakout", status: "positive_edge" }
    ]);
    assert.equal(runbook.severity, "negative");
    assert.ok(runbook.forbiddenActions.includes("force_live_entry"));
    assert.equal(runbook.actionLinks[0].command, "npm run status");
    assert.equal(lifecycle.status, "review_required");
    assert.equal(lifecycle.dangerousCount, 1);
  });

  await runCheck("operator action result exposes preflight denials and root blocker delta", async () => {
    const denied = buildOperatorActionResult({
      action: "resolve_flat_close",
      target: "BTCUSDT",
      allowed: true,
      preflightChecks: [{ id: "venue_flat", passed: false }],
      denialReasons: ["venue_not_flat"],
      rootBlockerBefore: "exchange_truth_freeze",
      rootBlockerAfter: "exchange_truth_freeze"
    });
    const allowed = buildOperatorActionResult({
      action: "force_reconcile",
      allowed: true,
      preflightChecks: [{ id: "safe_mode", passed: true }],
      changedState: { reconciled: true },
      rootBlockerBefore: "exchange_safety_blocked",
      rootBlockerAfter: null
    });
    assert.equal(denied.allowed, false);
    assert.ok(denied.denialReasons.includes("venue_not_flat"));
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.rootBlockerChanged, true);
    assert.equal(allowed.changedState.reconciled, true);
  });

  await runCheck("read model request-budget summary ranks callers by estimated weight", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-request-budget-"));
    const readModel = new ReadModelStore({ runtimeDir });
    await readModel.init();
    readModel.rebuild({
      journal: {},
      auditEvents: [{
        id: "budget-1",
        at: "2026-01-01T00:00:00.000Z",
        type: "binance_request_weight_budget",
        requestWeight: {
          usedWeight1m: 6100,
          totalRateLimitHits: 1,
          lastRateLimitStatus: 429,
          topRestCallers: {
            "scanner.depth": { count: 2, weight: 50 },
            "ticker.light": { count: 10, weight: 10 }
          }
        }
      }]
    });
    const summary = readModel.requestBudgetSummary();
    readModel.close();
    assert.equal(summary.status, "ready");
    assert.equal(summary.latestWeight1m, 6100);
    assert.equal(summary.pressureLevel, "critical");
    assert.equal(summary.rateLimitEvents, 1);
    assert.equal(summary.topCallers[0].caller, "scanner.depth");
    assert.equal(summary.topCallers[0].weight, 50);
    assert.equal(summary.criticalCallers[0].caller, "scanner.depth");
    assert.equal(summary.incidents.length, 1);
    assert.equal(summary.recommendedActions.some((action) => action.includes("depth")), true);
  });

  await runCheck("scanner deep-book enrichment backs off under request-weight pressure", async () => {
    const pressuredPlan = resolveScannerDeepBookPlan({
      client: {
        getRateLimitState() {
          return { usedWeight1m: 4500, warningActive: false };
        }
      },
      config: { scannerDeepBookSymbols: 20, requestWeightWarnThreshold1m: 4800 },
      rankedCount: 30
    });
    const normalPlan = resolveScannerDeepBookPlan({
      client: {
        getRateLimitState() {
          return { usedWeight1m: 1200, warningActive: false };
        }
      },
      config: { scannerDeepBookSymbols: 20, requestWeightWarnThreshold1m: 4800 },
      rankedCount: 30
    });
    assert.equal(pressuredPlan.limit, 0);
    assert.equal(pressuredPlan.reason, "request_weight_pressure");
    assert.equal(normalPlan.limit, 20);
    assert.equal(normalPlan.reason, "normal");
  });

  await runCheck("stream fallback health marks depth REST fallback as guarded under pressure", async () => {
    const fakeBot = {
      config: { requestWeightWarnThreshold1m: 4800 },
      runtime: {},
      restFallbackState: {
        "depth:BTCUSDT": {
          lastAt: "2026-01-01T00:00:00.000Z"
        }
      },
      client: {
        getRateLimitState() {
          return { usedWeight1m: 4200, banActive: false, backoffActive: false };
        }
      }
    };
    const summary = TradingBot.prototype.buildStreamFallbackHealth.call(fakeBot, {
      public: { connected: false },
      localBook: { healthySymbols: 0 }
    }, "2026-01-01T00:00:01.000Z");
    assert.equal(summary.status, "rest_pressure_guarded");
    assert.equal(summary.depthFallbackCount, 1);
    assert.equal(summary.recommendedAction.includes("streams"), true);
  });

  await runCheck("market scanner universe caches 24h ticker REST ranking", async () => {
    let publicCalls = 0;
    const client = {
      baseUrl: `scanner-cache-${Date.now()}`,
      async getExchangeInfo() {
        return {
          symbols: [
            { symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT", isSpotTradingAllowed: true },
            { symbol: "ETHUSDT", status: "TRADING", baseAsset: "ETH", quoteAsset: "USDT", isSpotTradingAllowed: true }
          ]
        };
      },
      async publicRequest(method, pathname, params, requestMeta = {}) {
        publicCalls += 1;
        assert.equal(method, "GET");
        assert.equal(pathname, "/api/v3/ticker/24hr");
        assert.equal(requestMeta.caller, "scanner.universe.ticker_24hr");
        return [
          {
            symbol: "BTCUSDT",
            quoteVolume: "25000000",
            volume: "500",
            count: "5000",
            lastPrice: "50000",
            weightedAvgPrice: "50000",
            bidPrice: "49999",
            askPrice: "50001",
            bidQty: "1.2",
            askQty: "1.1",
            priceChangePercent: "1.5"
          },
          {
            symbol: "ETHUSDT",
            quoteVolume: "22000000",
            volume: "10000",
            count: "4500",
            lastPrice: "3000",
            weightedAvgPrice: "3000",
            bidPrice: "2999.8",
            askPrice: "3000.2",
            bidQty: "8",
            askQty: "7",
            priceChangePercent: "0.8"
          }
        ];
      }
    };
    const config = makeConfig({
      scannerTicker24hCacheMs: 60_000,
      scannerMinQuoteVolumeUsd: 1,
      scannerMinTradeCount24h: 1,
      scannerMinDepthNotionalUsd: 1,
      scannerMaxSpreadBps: 100
    });

    const first = await buildMarketScannerUniverse({ client, config, quoteAsset: "USDT", maxUniverseSize: 10 });
    const second = await buildMarketScannerUniverse({ client, config, quoteAsset: "USDT", maxUniverseSize: 10 });

    assert.equal(publicCalls, 1);
    assert.equal(first.entries.length, 2);
    assert.equal(second.entries.length, 2);
    assert.equal(first.entries[0].symbol, "BTCUSDT");
  });

  await runCheck("performance report exposes range-grid damage review", async () => {
    const trades = Array.from({ length: 6 }, (_, index) => ({
      id: `range-grid-${index}`,
      symbol: index % 2 ? "ETHUSDT" : "BTCUSDT",
      brokerMode: "paper",
      tradingSource: "paper:internal",
      entryAt: `2026-01-01T0${index}:00:00.000Z`,
      exitAt: `2026-01-01T0${index}:30:00.000Z`,
      strategyAtEntry: { strategy: "range_grid_v2", family: "range_grid" },
      regimeAtEntry: index < 4 ? "breakout_release" : "range",
      reason: index < 4 ? "range_break_stop" : "stop_loss",
      pnlQuote: index < 5 ? -12 - index : 3,
      netPnlPct: index < 5 ? -0.012 - index * 0.001 : 0.004,
      mfePct: index < 5 ? 0.025 : 0.006,
      maePct: index < 5 ? -0.018 : -0.003,
      captureEfficiency: index < 5 ? 0.08 : 0.4
    }));
    const report = buildPerformanceReport({
      journal: { trades, scaleOuts: [], blockedSetups: [], researchRuns: [], equitySnapshots: [], events: [] },
      runtime: { openPositions: [] },
      config: makeConfig({ botMode: "paper", reportLookbackTrades: 20 }),
      now: new Date("2026-01-02T00:00:00.000Z")
    });

    assert.equal(report.rangeGridDamageReview.tradeCount, 6);
    assert.equal(report.rangeGridDamageReview.status, "review_required");
    assert.equal(report.rangeGridDamageReview.lateExitCount >= 2, true);
    assert.equal(report.rangeGridDamageReview.rangeBreakSuspectCount >= 4, true);
    assert.ok(report.rangeGridDamageReview.recommendedAction.includes("Review range-grid"));
  });

  await runCheck("persistence coordinator notifies read-model refresh hook after bundle save", async () => {
    let saved = false;
    let notifiedType = null;
    const coordinator = new PersistenceCoordinator({
      store: {
        async saveSnapshotBundle() {
          saved = true;
        }
      },
      afterPersist(payload) {
        notifiedType = payload.type;
      }
    });
    await coordinator.persistSnapshotBundle({ runtime: { ok: true }, journal: { trades: [] } });
    assert.equal(saved, true);
    assert.equal(notifiedType, "snapshot_bundle");
  });

  await runCheck("trading bot read-model refresh consumes persisted journal payload", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-readmodel-refresh-hook-"));
    let reportMarkedDirty = false;
    const fakeBot = {
      config: { runtimeDir, readModelRefreshMinIntervalMs: 1 },
      logger: { warn() {} },
      runtime: {},
      readModelRefreshState: null,
      markReportDirty() {
        reportMarkedDirty = true;
      }
    };
    const state = TradingBot.prototype.scheduleReadModelRefresh.call(fakeBot, {
      type: "snapshot_bundle",
      journal: {
        trades: [{
          id: "trade-1",
          symbol: "BTCUSDT",
          brokerMode: "paper",
          entryAt: "2026-01-01T00:00:00.000Z",
          exitAt: "2026-01-01T01:00:00.000Z",
          pnlQuote: 1.5,
          netPnlPct: 0.01,
          strategyAtEntry: { strategy: "breakout", family: "breakout" }
        }]
      }
    });
    await state.promise;

    assert.equal(fakeBot.runtime.readModelRefresh.status, "ready");
    assert.equal(fakeBot.runtime.readModelRefresh.reason, "snapshot_bundle");
    assert.equal(fakeBot.runtime.readModelRefresh.tables.trades, 1);
    assert.equal(reportMarkedDirty, true);
  });

  await runCheck("market replay safely returns empty-history without live orders", async () => {
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-market-replay-empty-"));
    const config = makeConfig({ historyDir, watchlist: ["BTCUSDT"], klineInterval: "15m" });
    const result = await runMarketReplay({ config, symbol: "BTCUSDT", from: "2026-01-01", to: "2026-01-02" });
    assert.equal(result.status, "empty_history");
    assert.equal(result.trace.diagnostics.noLiveOrders, true);
    assert.equal(result.historyReadiness.status, "degraded");
    assert.equal(result.historyActionPlan.status, "missing_history");
    assert.equal(result.historyActionPlan.blocking, true);
    assert.equal(result.historyActionPlan.backfillArgs.symbol, "BTCUSDT");
    assert.equal(result.historyActionPlan.steps[0].action, "backfill_local_history");
    assert.ok(result.historyActionPlan.recommendedCommand.includes("download-history"));
    assert.ok(result.warnings.some((item) => item.includes("No local candles")));
  });

  await runCheck("market replay is deterministic with the same local candles", async () => {
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-market-replay-"));
    const config = makeConfig({
      historyDir,
      watchlist: ["BTCUSDT"],
      klineInterval: "15m",
      modelThreshold: 0.99,
      minTradeUsdt: 1,
      paperFeeBps: 10,
      startingCash: 1000
    });
    const candles = buildCandles(75);
    const first = await runMarketReplay({ config, symbol: "BTCUSDT", candles });
    const second = await runMarketReplay({ config, symbol: "BTCUSDT", candles });
    assert.equal(first.status, "ready");
    assert.equal(second.status, "ready");
    assert.deepEqual(first.trace.summary, second.trace.summary);
    assert.equal(first.trace.diagnostics.noLiveOrders, true);
    assert.equal(first.trace.policyReplay.includesSignalRiskIntentExecution, true);
  });

  await runCheck("market replay can persist replay traces into the read model", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-market-replay-trace-"));
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-market-replay-history-"));
    const config = makeConfig({
      runtimeDir,
      historyDir,
      watchlist: ["BTCUSDT"],
      klineInterval: "15m",
      modelThreshold: 0.99,
      minTradeUsdt: 1,
      paperFeeBps: 10,
      startingCash: 1000
    });
    const result = await runMarketReplay({ config, symbol: "BTCUSDT", candles: buildCandles(70), persistTrace: true });
    const readModel = new ReadModelStore({ runtimeDir });
    await readModel.init();
    const status = readModel.status();
    const dashboard = readModel.dashboardSummary();
    readModel.close();
    assert.equal(result.status, "ready");
    assert.equal(status.tables.replayTraces, 1);
    assert.equal(dashboard.latestReplay.symbol, "BTCUSDT");
  });

  await runCheck("trading bot decomposition service map covers target services", async () => {
    const map = buildTradingBotServiceMap();
    const coverage = assertTradingBotServiceCoverage([
      "MarketDataCoordinator",
      "CandidateScanner",
      "DecisionEngine",
      "ExecutionCoordinator",
      "RuntimePersistenceService",
      "ReplayLabService",
      "DashboardReadModelService"
    ]);
    assert.equal(map.status, "decomposition_foundation_ready");
    assert.equal(coverage.ok, true);
    assert.equal(coverage.serviceCount >= 7, true);
  });
}
