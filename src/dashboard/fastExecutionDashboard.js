function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function text(value, fallback = "unknown") {
  const normalized = value == null ? "" : `${value}`.trim();
  return normalized || fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function latestItems(...sources) {
  return sources.flatMap((source) => arr(source)).slice(0, 20);
}

function action(name, { liveImpact = false, confirmationRequired = false, safetyImpact = "read_only", enabled = true } = {}) {
  return { name, liveImpact, confirmationRequired, safetyImpact, enabled };
}

export function buildFastExecutionDashboardSummary({ snapshot = {}, config = {}, now = new Date().toISOString() } = {}) {
  const safeConfig = config && typeof config === "object" ? config : {};
  const dashboard = snapshot.dashboard || {};
  const ops = dashboard.ops || {};
  const runtime = snapshot.runtime || snapshot.manager?.runtime || {};
  const fast = dashboard.fastExecution || runtime.fastExecution || {};
  const queue = firstDefined(fast.queue, dashboard.immediateEntryQueue, runtime.immediateEntryQueue, {});
  const latency = firstDefined(fast.latency, dashboard.latencySummary, runtime.latencySummary, {});
  const streamFreshness = firstDefined(fast.streamFreshness, dashboard.streamFreshness, dashboard.dataFreshnessSummary, ops.dataFreshness, {});
  const hotSymbols = firstDefined(fast.hotSymbols, dashboard.hotSymbols, runtime.hotSymbolLane?.hotSymbols, runtime.hotSymbols, []);
  const nearThreshold = firstDefined(fast.nearThreshold, dashboard.nearThreshold, runtime.nearThresholdWatchlist?.items, []);
  const liveObserve = firstDefined(fast.liveObserve, dashboard.liveFastObserve, runtime.liveFastObserve, {});
  const exitFastLane = firstDefined(fast.exitFastLane, dashboard.exitFastLane, runtime.exitFastLane, {});
  const decisions = latestItems(dashboard.topDecisions, dashboard.decisions, runtime.decisions, snapshot.decisions);
  const blockedEntries = decisions.filter((decision) => decision.approved === false || decision.allow === false || decision.rootBlocker || decision.blockedReason);
  const executionIntents = latestItems(dashboard.executionIntents, runtime.executionIntents, snapshot.executionIntents);
  const openPositions = latestItems(dashboard.openPositions, dashboard.positions, snapshot.positions, runtime.positions);
  const alerts = latestItems(ops.alerts?.alerts, dashboard.alerts?.items, snapshot.alerts);

  return {
    generatedAt: now,
    diagnosticsOnly: true,
    liveBehaviorChanged: false,
    config: {
      fastExecutionEnabled: safeConfig.fastExecutionEnabled === true,
      fastExecutionPaperOnly: safeConfig.fastExecutionPaperOnly !== false,
      liveFastObserveOnly: safeConfig.liveFastObserveOnly !== false,
      hotSymbolMax: finite(safeConfig.hotSymbolMax, 12),
      candidateTtlMs: finite(safeConfig.fastExecutionCandidateTtlMs, 5000)
    },
    panels: {
      overview: {
        available: true,
        mode: text(dashboard.overview?.mode || snapshot.manager?.currentMode || safeConfig.botMode, "paper"),
        runState: text(snapshot.manager?.runState || ops.service?.runState, "unknown")
      },
      tradingControl: {
        available: true,
        safeActions: [
          "start_bot",
          "stop_bot",
          "run_one_cycle",
          "refresh_analysis",
          "run_market_scan",
          "force_reconcile",
          "mark_position_reviewed",
          "acknowledge_alert",
          "resolve_alert",
          "pause_new_entries",
          "resume_new_entries",
          "disable_fast_execution",
          "enable_paper_fast_execution",
          "enable_probe_only",
          "disable_probe_only"
        ]
      },
      fastExecution: {
        available: true,
        queueSize: finite(queue.size, arr(queue.items).length),
        lastFastSignal: arr(queue.items)[0] || null,
        lastFastExecution: fast.lastFastExecution || null,
        fastBlockedReasons: arr(queue.items).map((item) => item.blockedReason).filter(Boolean).slice(0, 20),
        averageFastLatencyMs: finite(latency.averageFastLatencyMs ?? latency.averageMs, 0),
        p95FastLatencyMs: finite(latency.p95FastLatencyMs ?? latency.p95Ms, 0),
        streamFreshness,
        hotSymbols: arr(hotSymbols),
        nearThreshold: arr(nearThreshold),
        oneClickDisableAvailable: true
      },
      positions: {
        available: true,
        openPositions
      },
      tradeDebug: {
        available: true,
        latestSignals: decisions.slice(0, 20),
        blockedEntries: blockedEntries.slice(0, 20),
        fastQueueItems: arr(queue.items).slice(0, 20),
        executionIntents,
        rootBlockers: blockedEntries.map((item) => item.rootBlocker || item.blockedReason).filter(Boolean).slice(0, 20),
        filters: {
          symbol: true,
          blocker: true,
          mode: true
        }
      },
      alerts: {
        available: true,
        items: alerts
      },
      settings: {
        available: true,
        profile: text(safeConfig.configProfile || safeConfig.profile || "default", "default"),
        canPreviewProfile: true,
        canApplyProfileBlindly: false
      },
      logs: {
        available: true,
        items: latestItems(dashboard.logs, runtime.logs)
      },
      neuralAiStatus: {
        available: true,
        summary: firstDefined(dashboard.ai, dashboard.learning, runtime.ai, {})
      },
      dataFreshness: {
        available: true,
        summary: streamFreshness
      },
      liveFastObserve: {
        available: true,
        summary: liveObserve
      },
      exitFastLane: {
        available: true,
        summary: exitFastLane
      }
    },
    commandPalette: {
      available: true,
      actions: [
        action("start_bot"),
        action("stop_bot"),
        action("run_one_cycle"),
        action("refresh_analysis"),
        action("run_market_scan"),
        action("force_reconcile", { confirmationRequired: true, safetyImpact: "reconcile_only" }),
        action("mark_position_reviewed"),
        action("acknowledge_alert"),
        action("resolve_alert"),
        action("pause_new_entries", { confirmationRequired: true, safetyImpact: "stricter" }),
        action("resume_new_entries", { confirmationRequired: true, safetyImpact: "entry_permissioning" }),
        action("disable_fast_execution", { safetyImpact: "stricter" }),
        action("enable_paper_fast_execution", { confirmationRequired: true, safetyImpact: "paper_only" }),
        action("enable_probe_only", { confirmationRequired: true, safetyImpact: "paper_learning_only" }),
        action("disable_probe_only", { confirmationRequired: true, safetyImpact: "paper_learning_only" }),
        action("switch_to_live", { liveImpact: true, confirmationRequired: true, safetyImpact: "requires_live_ack", enabled: false }),
        action("enable_live_fast_execution", { liveImpact: true, confirmationRequired: true, safetyImpact: "requires_canary_review", enabled: false }),
        action("approve_neural_model_promotion", { liveImpact: true, confirmationRequired: true, safetyImpact: "requires_model_governance", enabled: false }),
        action("rollback_model", { liveImpact: true, confirmationRequired: true, safetyImpact: "stricter_or_recovery", enabled: false }),
        action("change_risk_limits", { liveImpact: true, confirmationRequired: true, safetyImpact: "risk_config_change", enabled: false }),
        action("change_max_exposure", { liveImpact: true, confirmationRequired: true, safetyImpact: "risk_config_change", enabled: false }),
        action("change_api_mode", { liveImpact: true, confirmationRequired: true, safetyImpact: "exchange_config_change", enabled: false }),
        action("panic_flatten_plan", { liveImpact: true, confirmationRequired: true, safetyImpact: "dry_run_plan" })
      ],
      audit: {
        auditIdReturnedAfterAction: true,
        everyActionLogged: true
      }
    },
    forbiddenActions: [
      "force_buy_without_risk_verdict",
      "force_sell_without_position_context",
      "override_exchange_freeze",
      "override_manual_review",
      "override_max_exposure",
      "enable_live_fast_execution_by_default"
    ]
  };
}
