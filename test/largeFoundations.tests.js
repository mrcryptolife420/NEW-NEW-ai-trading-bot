import { AuditLogStore } from "../src/storage/auditLogStore.js";
import { ReadModelStore } from "../src/storage/readModelStore.js";
import { StateStore } from "../src/storage/stateStore.js";
import { PersistenceCoordinator } from "../src/runtime/persistenceCoordinator.js";
import { runMarketReplay } from "../src/runtime/marketReplayEngine.js";
import {
  assertTradingBotServiceCoverage,
  buildTradingBotServiceMap
} from "../src/runtime/tradingBotDecomposition.js";
import { buildOperatorRunbookForReason, buildStrategyLifecycleDiagnostics } from "../src/runtime/operatorRunbookGenerator.js";

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

  await runCheck("market replay safely returns empty-history without live orders", async () => {
    const historyDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-market-replay-empty-"));
    const config = makeConfig({ historyDir, watchlist: ["BTCUSDT"], klineInterval: "15m" });
    const result = await runMarketReplay({ config, symbol: "BTCUSDT", from: "2026-01-01", to: "2026-01-02" });
    assert.equal(result.status, "empty_history");
    assert.equal(result.trace.diagnostics.noLiveOrders, true);
    assert.equal(result.historyReadiness.status, "degraded");
    assert.equal(result.historyActionPlan.status, "missing_history");
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
