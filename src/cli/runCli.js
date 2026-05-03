import { runBacktest } from "../runtime/backtestRunner.js";
import { runHistoryCommand } from "../runtime/marketHistory.js";
import { parseBacktestWalkForwardArgs, runBacktestWalkForward } from "../runtime/walkForwardBacktest.js";
import { buildFeatureAudit } from "../runtime/featureAudit.js";
import { parseMarketReplayArgs, runMarketReplay } from "../runtime/marketReplayEngine.js";
import { runReadModelCommand, runReadModelTraceCommand } from "../storage/readModelStore.js";
import { StateStore } from "../storage/stateStore.js";
import { TradingBot } from "../runtime/tradingBot.js";
import { BotManager } from "../runtime/botManager.js";
import { buildRestArchitectureAudit, scanRestCallers } from "../runtime/restArchitectureAudit.js";
import { buildExecutionIntentRows, buildExecutionIntentSummary } from "../execution/executionIntentView.js";
import {
  buildLearningFailureSummary,
  buildLearningPromotionSummary,
  buildLearningReplayPackSummary
} from "../runtime/learningAnalytics.js";
import { buildIncidentReport, summarizeIncidentReports, writeIncidentReport } from "../runtime/incidentReport.js";
import { buildPanicFlattenPlan } from "../runtime/panicFlattenPlan.js";
import { buildRecorderAuditSummary, buildStorageAuditSummary } from "../storage/storageAudit.js";
import { buildReplayPackManifest } from "../runtime/replayPackManifest.js";
import {
  buildAutoReconcilePlan,
  buildExchangeSafetyStatus,
  evaluateExchangeSafetyUnlock,
  runAutoReconcilePlan
} from "../execution/autoReconcileCoordinator.js";
import {
  buildPostReconcileProbationStatus,
  resolvePostReconcileProbationState
} from "../risk/postReconcileEntryLimits.js";
import {
  buildFeedAggregationSummary,
  buildTradingPathHealth,
  normalizeDashboardFreshness
} from "../runtime/tradingPathHealth.js";
import { buildCanaryReleaseGate, buildCanaryReleaseSummary } from "../runtime/canaryReleaseGate.js";
import { buildOperatorActionQueue } from "../runtime/operatorActionQueue.js";

function shouldUseReadOnlyInit(command) {
  return ["status", "doctor", "report", "learning", "replay"].includes(command);
}

const BOT_COMMANDS = new Set(["run", "once", "status", "doctor", "report", "learning", "research", "scan", "replay"]);
const DEFAULT_BOT_FACTORY = ({ config: cfg, logger: log }) => new TradingBot({ config: cfg, logger: log });
const DEFAULT_MANAGER_FACTORY = ({ projectRoot, logger: log }) => new BotManager({ projectRoot, logger: log });

async function runContinuousManagedBot({ config, logger, signalSource = process }) {
  const manager = new BotManager({ projectRoot: config.projectRoot, logger });
  let stopRequested = false;
  let stopWaiter = null;
  const signalHandlers = [];
  const requestStop = (reason = "signal") => {
    if (stopRequested) {
      return;
    }
    stopRequested = true;
    logger?.warn?.("Stopping managed run loop", { reason });
    if (stopWaiter) {
      const resolve = stopWaiter;
      stopWaiter = null;
      resolve();
    }
  };
  const installSignalHandlers = () => {
    if (!signalSource?.on || !signalSource?.off) {
      return;
    }
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => requestStop(signal);
      signalSource.on(signal, handler);
      signalHandlers.push([signal, handler]);
    }
  };
  const removeSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      signalSource.off(signal, handler);
    }
  };

  installSignalHandlers();
  try {
    await manager.init();
    await manager.start();
    while (!stopRequested) {
      await new Promise((resolve) => {
        stopWaiter = resolve;
      });
    }
  } finally {
    removeSignalHandlers();
    await manager.stop("cli_signal").catch(() => {});
  }
}

function markCommandSuccess(processState = null) {
  if (!processState || typeof processState !== "object" || !("exitCode" in processState)) {
    return;
  }
  processState.exitCode = 0;
}

function parseReplayArgs(args = []) {
  const options = {
    symbol: null,
    reason: null,
    fixturePath: null,
    writeFixture: false,
    fileName: null,
    fixtureDir: null
  };
  for (const arg of args || []) {
    const value = `${arg || ""}`;
    if (value.startsWith("--symbol=")) {
      options.symbol = value.slice("--symbol=".length).trim().toUpperCase() || null;
    } else if (value.startsWith("--reason=")) {
      options.reason = value.slice("--reason=".length).trim() || null;
    } else if (value.startsWith("--fixture=")) {
      options.fixturePath = value.slice("--fixture=".length).trim() || null;
    } else if (value === "--write-fixture") {
      options.writeFixture = true;
    } else if (value.startsWith("--file-name=")) {
      options.fileName = value.slice("--file-name=".length).trim() || null;
    } else if (value.startsWith("--fixture-dir=")) {
      options.fixtureDir = value.slice("--fixture-dir=".length).trim() || null;
    } else if (!options.symbol) {
      options.symbol = value.trim().toUpperCase() || null;
    } else if (!options.reason) {
      options.reason = value.trim() || null;
    }
  }
  return options;
}

function parseTraceValue(args = []) {
  return `${args?.[0] || ""}`.trim();
}

function buildAutoReconcileInputs({ config, runtime }) {
  const exchangeTruth = runtime.exchangeTruth || {};
  return {
    config,
    runtime,
    positions: runtime.openPositions || [],
    accountSnapshot: exchangeTruth.accountSnapshot || runtime.accountSnapshot || runtime.portfolio || {},
    openOrders: exchangeTruth.openOrders || runtime.openOrders || [],
    openOrderLists: exchangeTruth.openOrderLists || runtime.openOrderLists || [],
    recentTradesBySymbol: exchangeTruth.recentTradesBySymbol || runtime.recentTradesBySymbol || {},
    userStreamSnapshot: runtime.userStreamSnapshot || runtime.userDataStream || exchangeTruth.userStreamSnapshot || {},
    marketSnapshots: runtime.latestMarketSnapshots || runtime.marketSnapshots || {},
    symbolRules: runtime.symbolRules || config.symbolRules || {}
  };
}

function parseNamedArg(args = [], name, fallback = null) {
  const prefix = `--${name}=`;
  const directIndex = args.indexOf(`--${name}`);
  const direct = directIndex >= 0 ? args[directIndex + 1] : null;
  const inline = args.find((arg) => `${arg}`.startsWith(prefix));
  return inline ? `${inline}`.slice(prefix.length) : direct || fallback;
}

function listUnresolvedIntentObjects(runtime = {}) {
  const ledger = runtime.orderLifecycle?.executionIntentLedger || {};
  const unresolved = new Set(Array.isArray(ledger.unresolvedIntentIds) ? ledger.unresolvedIntentIds : []);
  return Object.values(ledger.intents || {}).filter((intent) => unresolved.has(intent.id));
}

export default async function runCli({
  command,
  args,
  config,
  logger,
  botFactory = DEFAULT_BOT_FACTORY,
  managerFactory = DEFAULT_MANAGER_FACTORY,
  dashboardFactory = async ({ projectRoot, logger: log, port }) => {
    const { startDashboardServer } = await import("../dashboard/server.js");
    return startDashboardServer({ projectRoot, logger: log, port });
  },
  signalSource = process,
  processState = process
}) {
  if (command === "dashboard") {
    const dashboard = await dashboardFactory({
      projectRoot: config.projectRoot,
      logger,
      port: config.dashboardPort
    });
    console.log(
      JSON.stringify(
        {
          command: "dashboard",
          url: dashboard.url,
          port: dashboard.port
        },
        null,
        2
      )
    );
    await (dashboard.waitUntilClosed || new Promise(() => {}));
    markCommandSuccess(processState);
    return;
  }

  if (command === "backtest") {
    const symbol = (args[0] || config.watchlist[0] || "BTCUSDT").toUpperCase();
    const result = await runBacktest({ config, logger, symbol });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "backtest:walkforward") {
    const result = await runBacktestWalkForward({
      config,
      logger,
      ...parseBacktestWalkForwardArgs(args, config)
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "feature:audit") {
    const result = await buildFeatureAudit({ config, projectRoot: config.projectRoot });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "canary:status") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const configuredItems = Array.isArray(runtime.canaryReleaseGates)
      ? runtime.canaryReleaseGates
      : Array.isArray(runtime.canary?.items)
        ? runtime.canary.items
        : [];
    const gates = configuredItems.length
      ? configuredItems.map((item) => buildCanaryReleaseGate({ config, ...item }))
      : [
          buildCanaryReleaseGate({
            scope: "global",
            requestedState: "shadow",
            currentState: "shadow",
            evidence: { source: "unknown" },
            config
          })
        ];
    const result = {
      readOnly: true,
      status: buildCanaryReleaseSummary(gates).status,
      summary: buildCanaryReleaseSummary(gates),
      gates
    };
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "actions:list") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const alerts = [
      ...(Array.isArray(runtime.alerts) ? runtime.alerts : []),
      ...(Array.isArray(runtime.operatorAlerts?.alerts) ? runtime.operatorAlerts.alerts : []),
      ...(Array.isArray(runtime.ops?.operatorAlerts?.alerts) ? runtime.ops.operatorAlerts.alerts : [])
    ];
    const existing = Array.isArray(runtime.operatorActionQueue?.items)
      ? runtime.operatorActionQueue.items
      : Array.isArray(runtime.operatorActionQueueSummary?.items)
        ? runtime.operatorActionQueueSummary.items
        : [];
    const queue = buildOperatorActionQueue({ alerts, existing, limit: config.operatorActionQueueMaxItems || 20 });
    console.log(JSON.stringify({ readOnly: true, ...queue }, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "readmodel:rebuild" || command === "readmodel:status" || command === "readmodel:dashboard" || command === "request-budget") {
    const result = await runReadModelCommand({
      config,
      logger,
      action: command === "readmodel:rebuild"
        ? "rebuild"
        : command === "readmodel:dashboard"
          ? "dashboard"
          : command === "request-budget"
            ? "request-budget"
            : "status"
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "trading-path:debug") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const readmodel = await runReadModelCommand({ config, logger, action: "dashboard" }).catch((error) => ({
      status: "unavailable",
      error: error?.message || "readmodel_dashboard_unavailable"
    }));
    const dashboardSnapshot = runtime.dashboardSnapshot || runtime.lastDashboardSnapshot || runtime.dashboard || {};
    const now = new Date().toISOString();
    const feedSummary = buildFeedAggregationSummary({
      runtimeState: runtime,
      watchlist: runtime.watchlist || config.watchlist || [],
      requestBudget: runtime.requestWeight || runtime.requestBudget || {},
      streamStatus: runtime.stream || runtime.streamStatus || {},
      now
    });
    const health = buildTradingPathHealth({
      runtimeState: runtime,
      dashboardSnapshot,
      feedSummary,
      readmodelSummary: readmodel.readModel || readmodel,
      scanSummary: runtime.signalFlow?.lastCycle || runtime.scanner || {},
      config,
      now
    });
    console.log(JSON.stringify({
      readOnly: true,
      generatedAt: now,
      health,
      botRunning: health.botRunning,
      lastCycleAt: health.lastCycleAt,
      feedFreshness: feedSummary,
      marketSnapshotFlowDebug: runtime.marketSnapshotFlowDebug || null,
      readmodelFreshness: health.readmodelFreshness,
      dashboardFreshness: normalizeDashboardFreshness(dashboardSnapshot, now, config),
      topDecisionsCount: health.topDecisionsCount,
      entryBlockedReasons: health.blockingReasons,
      staleSources: health.staleSources,
      nextAction: health.nextAction,
      safety: "diagnostic_only_no_entry_unlock"
    }, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "intents:list" || command === "intents:summary") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const result = command === "intents:list"
      ? {
          status: "ok",
          unresolvedOnly: true,
          intents: buildExecutionIntentRows(runtime, { unresolvedOnly: true })
        }
      : {
          status: "ok",
          ...buildExecutionIntentSummary(runtime)
        };
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "learning:failures" || command === "learning:promotion" || command === "learning:replay-packs") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const journal = await store.loadJournal();
    const result = command === "learning:failures"
      ? buildLearningFailureSummary({ journal, runtime, config })
      : command === "learning:promotion"
        ? buildLearningPromotionSummary({ journal, runtime, config })
        : buildLearningReplayPackSummary({ journal, runtime, config });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "incidents:create" || command === "incidents:summary") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    if (command === "incidents:summary") {
      const summary = await summarizeIncidentReports({ runtimeDir: config.runtimeDir });
      console.log(JSON.stringify(summary, null, 2));
      markCommandSuccess(processState);
      return;
    }
    const report = buildIncidentReport({
      type: parseNamedArg(args, "type", "manual_review"),
      severity: parseNamedArg(args, "severity", "medium"),
      configHash: config.configHash || null,
      runtimeState: runtime,
      alerts: runtime.alerts || runtime.ops?.alerts?.alerts || [],
      positions: runtime.openPositions || [],
      intents: listUnresolvedIntentObjects(runtime),
      reconcileSummary: runtime.exchangeSafety?.autoReconcileSummary || runtime.exchangeTruth || null,
      recentDecisions: runtime.latestDecisions || []
    });
    const written = await writeIncidentReport({ runtimeDir: config.runtimeDir, report });
    console.log(JSON.stringify({ status: "ok", report, written }, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "live:panic-plan") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const openOrders = [
      ...Object.values(runtime.orderLifecycle?.activeActions || {}),
      ...Object.values(runtime.orderLifecycle?.activeActionsPrevious || {})
    ].filter(Boolean);
    const result = buildPanicFlattenPlan({
      config,
      positions: runtime.openPositions || [],
      marketSnapshots: runtime.marketSnapshots || runtime.latestMarketSnapshots || {},
      symbolRules: runtime.symbolRules || {},
      openOrders
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "post-reconcile:status") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const status = buildPostReconcileProbationStatus({
      config,
      runtime,
      probationState: resolvePostReconcileProbationState(runtime),
      openPositions: runtime.openPositions || [],
      entriesThisCycle: runtime.postReconcileProbation?.entriesThisCycle || 0
    });
    console.log(JSON.stringify({
      readOnly: true,
      status,
      note: status.status === "active"
        ? "Post-reconcile probation limits new entries without forcing single-position mode."
        : "Post-reconcile probation is inactive; normal maxOpenPositions applies."
    }, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "reconcile:plan" || command === "reconcile:run" || command === "exchange-safety:status") {
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const plan = buildAutoReconcilePlan(buildAutoReconcileInputs({ config, runtime }));
    const unlock = evaluateExchangeSafetyUnlock({
      plan,
      runtime,
      alerts: runtime.alerts || runtime.ops?.alerts?.items || []
    });
    if (command === "exchange-safety:status") {
      console.log(JSON.stringify(buildExchangeSafetyStatus({ plan, unlock, runtime }), null, 2));
      markCommandSuccess(processState);
      return;
    }
    if (command === "reconcile:plan") {
      console.log(JSON.stringify({
        readOnly: true,
        plan,
        unlock
      }, null, 2));
      markCommandSuccess(processState);
      return;
    }
    const runResult = await runAutoReconcilePlan({
      runtime,
      plan,
      logger,
      broker: {
        clearPositionReconcileFlags(position, result = {}) {
          position.reconcileRequired = false;
          position.manualReviewRequired = false;
          position.lifecycleState = position.protectiveOrderListId ? "protected" : "open";
          position.lastAutoReconcileAction = result.reason || "cli_auto_reconcile_clear";
          position.lastAutoReconcileAt = new Date().toISOString();
        }
      }
    });
    await store.saveRuntime(runtime);
    console.log(JSON.stringify({
      dryRun: false,
      safety: "no_force_unlock_only_evidence_based_actions",
      planStatus: plan.status,
      unlock: evaluateExchangeSafetyUnlock({
        plan: buildAutoReconcilePlan(buildAutoReconcileInputs({ config, runtime })),
        runtime,
        alerts: runtime.alerts || runtime.ops?.alerts?.items || []
      }),
      result: runResult
    }, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "storage:audit" || command === "recorder:audit" || command === "replay:manifest") {
    if (command === "storage:audit") {
      const result = await buildStorageAuditSummary({ runtimeDir: config.runtimeDir });
      console.log(JSON.stringify(result, null, 2));
      markCommandSuccess(processState);
      return;
    }
    if (command === "recorder:audit") {
      const result = await buildRecorderAuditSummary({ runtimeDir: config.runtimeDir });
      console.log(JSON.stringify(result, null, 2));
      markCommandSuccess(processState);
      return;
    }
    const store = new StateStore(config.runtimeDir);
    await store.init();
    const runtime = await store.loadRuntime();
    const samples = [
      ...(runtime.latestDecisions || []),
      ...(runtime.latestBlockedSetups || [])
    ].slice(0, 24);
    const result = buildReplayPackManifest({
      packType: parseNamedArg(args, "type", "operator_review"),
      samples,
      configHash: config.configHash || null,
      dataHash: runtime.dataHash || runtime.marketHistory?.dataHash || null,
      seed: parseNamedArg(args, "seed", "operator")
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "rest:audit") {
    const requestBudget = await runReadModelCommand({ config, logger, action: "request-budget" }).catch((error) => ({
      status: "unavailable",
      error: error?.message || "request_budget_unavailable",
      topCallers: []
    }));
    const codeScan = await scanRestCallers({ projectRoot: config.projectRoot }).catch((error) => ({
      status: "unavailable",
      error: error?.message || "rest_code_scan_unavailable",
      callers: []
    }));
    const result = {
      ...buildRestArchitectureAudit({ config, requestBudget }),
      codeScan
    };
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "replay-decision" || command === "trace-cycle" || command === "trace-symbol") {
    const result = await runReadModelTraceCommand({
      config,
      logger,
      kind: command === "replay-decision" ? "decision" : command === "trace-cycle" ? "cycle" : "symbol",
      value: parseTraceValue(args)
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "replay:market") {
    const result = await runMarketReplay({
      config,
      logger,
      ...parseMarketReplayArgs(args, config),
      persistTrace: true
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "history") {
    const result = await runHistoryCommand({ config, logger, args });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "download-history") {
    const symbol = (args[0] || "BTCUSDT").toUpperCase();
    const interval = args[1] || "15m";
    const days = Number(args[2]) || 90;
    const {
      loadHistoricalKlines,
      summarizeHistoricalData
    } = await import("../market/historicalDataLoader.js");
    const historical = await loadHistoricalKlines(symbol, interval, days);
    const summary = summarizeHistoricalData({ [symbol]: historical });
    console.log(JSON.stringify(summary, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (!BOT_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  if (command === "run") {
    await runContinuousManagedBot({ config, logger, signalSource });
    return;
  }

  const useManagerForBotCommands = botFactory === DEFAULT_BOT_FACTORY;
  if (useManagerForBotCommands) {
    const manager = managerFactory({ projectRoot: config.projectRoot, logger });
    const managerReadOnly = shouldUseReadOnlyInit(command);
    await manager.init({
      command,
      readOnly: managerReadOnly,
      enableStreams: !managerReadOnly && command !== "scan"
    });
    try {
      if (command === "once") {
        const result = await manager.runCycleOnce();
        console.log(JSON.stringify(result.result, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "status") {
        const status = await manager.getStatus();
        console.log(JSON.stringify(status, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "doctor") {
        const doctor = await manager.getDoctor();
        console.log(JSON.stringify(doctor, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "report") {
        const report = await manager.getReport();
        console.log(JSON.stringify(report, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "learning") {
        const learning = await manager.getLearning();
        console.log(JSON.stringify(learning, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "research") {
        const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
        const research = await manager.runResearch(symbols);
        console.log(JSON.stringify(research.result, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "scan") {
        const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
        const scan = await manager.runMarketScan(symbols);
        console.log(JSON.stringify(scan.result, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "replay") {
        const replay = await manager.runIncidentReplay(parseReplayArgs(args));
        console.log(JSON.stringify(replay.result, null, 2));
        markCommandSuccess(processState);
        return;
      }
    } finally {
      await manager.stop("cli_command_complete").catch(() => {});
    }
  }

  const bot = botFactory({ config, logger });
  await bot.init({
    command,
    readOnly: shouldUseReadOnlyInit(command),
    enableStreams: !shouldUseReadOnlyInit(command) && command !== "scan"
  });

  try {
    if (command === "once") {
      const result = await bot.runCycle();
      console.log(JSON.stringify(result, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "status") {
      const status = await bot.getStatus();
      console.log(JSON.stringify(status, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "doctor") {
      const doctor = await bot.runDoctor();
      console.log(JSON.stringify(doctor, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "report") {
      const report = await bot.getReport();
      console.log(JSON.stringify(report, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "learning") {
      const learning = await bot.getAdaptiveLearningStatus();
      console.log(JSON.stringify(learning, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "research") {
      const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
      const research = await bot.runResearch({ symbols });
      console.log(JSON.stringify(research, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "scan") {
      const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
      const scan = await bot.runMarketScanner({ symbols });
      console.log(JSON.stringify(scan, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "replay") {
      const replay = await bot.runIncidentReplayLab(parseReplayArgs(args));
      console.log(JSON.stringify(replay, null, 2));
      markCommandSuccess(processState);
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } finally {
    await bot.close().catch(() => {});
  }
}
