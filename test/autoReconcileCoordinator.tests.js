import path from "node:path";
import {
  buildAutoReconcilePlan,
  buildExchangeSafetyStatus,
  evaluateExchangeSafetyUnlock,
  runAutoReconcilePlan
} from "../src/execution/autoReconcileCoordinator.js";
import { beginExecutionIntent } from "../src/execution/executionIntentLedger.js";

const baseConfig = {
  botMode: "paper",
  enableAutoReconcile: true,
  enableExchangeProtection: true,
  autoReconcileMinConfidence: 0.78,
  autoReconcileAllowFlatClose: true,
  autoReconcileAllowProtectiveRebuild: true,
  autoReconcileRequireFreshStreamOrRest: true,
  autoReconcileMaxActionsPerRun: 5,
  liveStopLimitBufferPct: 0.002
};

const symbolRules = {
  BTCUSDT: { baseAsset: "BTC", minQty: 0.00001, stepSize: 0.00001, minNotional: 10 },
  ETHUSDT: { baseAsset: "ETH", minQty: 0.0001, stepSize: 0.0001, minNotional: 10 }
};

function freshAccount(asset, total) {
  return {
    updatedAt: "2026-05-03T00:00:00.000Z",
    balances: [{ asset, free: total, locked: 0 }]
  };
}

export async function registerAutoReconcileCoordinatorTests({
  runCheck,
  assert,
  fs,
  os,
  runCli
}) {
  await runCheck("auto reconcile unlocks when there are no positions intents or critical alerts", async () => {
    const runtime = { openPositions: [] };
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      runtime,
      accountSnapshot: { updatedAt: "2026-05-03T00:00:00.000Z", balances: [] },
      userStreamSnapshot: { fresh: true }
    });
    const unlock = evaluateExchangeSafetyUnlock({ plan, runtime, alerts: [], positions: [] });
    assert.equal(plan.status, "nothing_to_do");
    assert.equal(plan.entryUnlockEligible, true);
    assert.equal(unlock.canUnlockEntries, true);
  });

  await runCheck("auto reconcile clears local reconcile flag when account and protection evidence match", async () => {
    const position = {
      id: "pos-1",
      symbol: "BTCUSDT",
      quantity: 0.01,
      reconcileRequired: true,
      lifecycleState: "reconcile_required"
    };
    const runtime = { openPositions: [position] };
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      runtime,
      positions: runtime.openPositions,
      accountSnapshot: freshAccount("BTC", 0.01),
      openOrderLists: [{ symbol: "BTCUSDT", orderListId: 123, listStatusType: "EXECUTING" }],
      userStreamSnapshot: { fresh: true },
      symbolRules
    });
    assert.equal(plan.status, "can_auto_fix");
    assert.equal(plan.actions[0].type, "clear_local_reconcile_flag");
    const result = await runAutoReconcilePlan({ runtime, plan, broker: {} });
    assert.equal(result.appliedCount >= 1, true);
    assert.equal(position.reconcileRequired, false);
    assert.equal(position.manualReviewRequired, false);
  });

  await runCheck("auto reconcile marks local position flat only with exchange-flat and sell evidence", async () => {
    const runtime = {
      openPositions: [{ id: "pos-2", symbol: "ETHUSDT", quantity: 0.4, reconcileRequired: true }]
    };
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      runtime,
      positions: runtime.openPositions,
      accountSnapshot: freshAccount("ETH", 0),
      recentTradesBySymbol: {
        ETHUSDT: [{ symbol: "ETHUSDT", side: "SELL", status: "FILLED", qty: 0.4 }]
      },
      userStreamSnapshot: { fresh: true },
      symbolRules
    });
    assert.equal(plan.actions.some((action) => action.type === "mark_position_flat_confirmed"), true);
    const result = await runAutoReconcilePlan({ runtime, plan, broker: {} });
    assert.equal(result.appliedCount >= 1, true);
    assert.equal(runtime.openPositions.length, 0);
    assert.equal(runtime.autoReconcileLocalClosures[0].symbol, "ETHUSDT");
  });

  await runCheck("auto reconcile plans protective rebuild only with valid OCO geometry", async () => {
    const position = {
      id: "pos-3",
      symbol: "BTCUSDT",
      quantity: 0.01,
      stopLossPrice: 95,
      takeProfitPrice: 110,
      lifecycleState: "protection_pending"
    };
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      positions: [position],
      accountSnapshot: freshAccount("BTC", 0.01),
      marketSnapshots: { BTCUSDT: { book: { mid: 100, bid: 99.9, ask: 100.1 } } },
      userStreamSnapshot: { fresh: true },
      symbolRules
    });
    assert.equal(plan.status, "needs_protective_rebuild");
    assert.equal(plan.actions[0].type, "rebuild_protective_order");
  });

  await runCheck("auto reconcile keeps invalid OCO geometry in manual review", async () => {
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      positions: [{
        id: "pos-4",
        symbol: "BTCUSDT",
        quantity: 0.01,
        stopLossPrice: 105,
        takeProfitPrice: 99,
        lifecycleState: "protection_pending"
      }],
      accountSnapshot: freshAccount("BTC", 0.01),
      marketSnapshots: { BTCUSDT: { book: { mid: 100, bid: 99.9, ask: 100.1 } } },
      userStreamSnapshot: { fresh: true },
      symbolRules
    });
    assert.equal(plan.status, "needs_manual_review");
    assert.equal(plan.manualReviewRequired, true);
    assert.ok(plan.blockingReasons.includes("BTCUSDT:protective_oco_geometry_invalid"));
  });

  await runCheck("auto reconcile does not unlock on REST user stream conflict", async () => {
    const runtime = { openPositions: [] };
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      runtime,
      accountSnapshot: freshAccount("BTC", 0.01),
      userStreamSnapshot: { fresh: true, balances: [{ asset: "BTC", free: 0, locked: 0 }] }
    });
    const unlock = evaluateExchangeSafetyUnlock({ plan, runtime, positions: [] });
    assert.equal(plan.manualReviewRequired, true);
    assert.equal(unlock.canUnlockEntries, false);
    assert.ok(unlock.stillBlockedReasons.includes("rest_user_stream_conflict"));
  });

  await runCheck("auto reconcile unlock evaluation blocks unresolved execution intents and critical alerts", async () => {
    const runtime = { openPositions: [] };
    beginExecutionIntent(runtime, { kind: "entry", symbol: "BTCUSDT", idempotencyKey: "entry" });
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      runtime,
      accountSnapshot: { updatedAt: "2026-05-03T00:00:00.000Z", balances: [] },
      userStreamSnapshot: { fresh: true }
    });
    const intentBlocked = evaluateExchangeSafetyUnlock({ plan, runtime });
    assert.equal(intentBlocked.canUnlockEntries, false);
    assert.ok(intentBlocked.stillBlockedReasons.includes("unresolved_execution_intent"));
    const alertBlocked = evaluateExchangeSafetyUnlock({ plan, runtime: { openPositions: [] }, alerts: [{ severity: "critical" }], intents: [] });
    assert.equal(alertBlocked.canUnlockEntries, false);
    assert.ok(alertBlocked.stillBlockedReasons.includes("critical_alert_active"));
  });

  await runCheck("auto reconcile requires minimum confidence and does not let paper bypass hard safety", async () => {
    const plan = buildAutoReconcilePlan({
      config: { ...baseConfig, botMode: "paper", autoReconcileMinConfidence: 0.1 },
      positions: [],
      accountSnapshot: { stale: true, balances: [] },
      userStreamSnapshot: { stale: true }
    });
    assert.equal(plan.status, "needs_manual_review");
    assert.ok(plan.blockingReasons.includes("auto_reconcile_confidence_below_minimum"));
    const unlock = evaluateExchangeSafetyUnlock({ plan, runtime: { openPositions: [] }, alerts: [{ severity: "critical" }], intents: [] });
    assert.equal(unlock.canUnlockEntries, false);
  });

  await runCheck("auto reconcile status summarizes next action and blocking positions", async () => {
    const runtime = {
      openPositions: [{ id: "pos-5", symbol: "BTCUSDT", quantity: 0.01, manualReviewRequired: true }]
    };
    const plan = buildAutoReconcilePlan({
      config: baseConfig,
      runtime,
      positions: runtime.openPositions,
      accountSnapshot: freshAccount("BTC", 0.01),
      userStreamSnapshot: { fresh: true },
      symbolRules
    });
    const unlock = evaluateExchangeSafetyUnlock({ plan, runtime });
    const status = buildExchangeSafetyStatus({ plan, unlock, runtime });
    assert.equal(status.entryBlocked, true);
    assert.equal(status.blockingPositions[0].symbol, "BTCUSDT");
    assert.equal(status.entryUnlockEligible, false);
  });

  await runCheck("auto reconcile CLI commands are safe and expose plan status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "auto-reconcile-cli-"));
    const runtimeDir = path.join(root, "runtime");
    const { StateStore } = await import("../src/storage/stateStore.js");
    const store = new StateStore(runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    runtime.openPositions = [{
      id: "pos-cli",
      symbol: "BTCUSDT",
      quantity: 0.01,
      reconcileRequired: true,
      lifecycleState: "reconcile_required"
    }];
    runtime.exchangeTruth = {
      accountSnapshot: freshAccount("BTC", 0.01),
      openOrderLists: [{ symbol: "BTCUSDT", orderListId: 77, listStatusType: "EXECUTING" }],
      recentTradesBySymbol: {}
    };
    runtime.userStreamSnapshot = { fresh: true };
    runtime.symbolRules = symbolRules;
    await store.saveRuntime(runtime);
    const config = { ...baseConfig, runtimeDir, projectRoot: root };
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    const lines = [];
    const previousLog = console.log;
    console.log = (line) => lines.push(line);
    try {
      await runCli({ command: "reconcile:plan", args: [], config, logger, processState: { exitCode: undefined } });
      await runCli({ command: "exchange-safety:status", args: [], config, logger, processState: { exitCode: undefined } });
    } finally {
      console.log = previousLog;
    }
    const planOutput = JSON.parse(lines[0]);
    const statusOutput = JSON.parse(lines[1]);
    assert.equal(planOutput.readOnly, true);
    assert.equal(planOutput.plan.status, "can_auto_fix");
    assert.equal(statusOutput.autoReconcileStatus, "can_auto_fix");
  });
}
