function arr(value) {
  return Array.isArray(value) ? value : [];
}

function timestampMs(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function ageMs(value, now = new Date().toISOString()) {
  const at = timestampMs(value);
  const ref = timestampMs(now);
  return at != null && ref != null ? Math.max(0, ref - at) : null;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildFutureRetrySummary(candidates = [], now = new Date().toISOString()) {
  const nowMs = timestampMs(now);
  const normalized = arr(candidates)
    .map((item) => ({ ...item, ms: timestampMs(item?.at) }))
    .filter((item) => item.at && item.ms != null);
  const future = normalized
    .filter((item) => nowMs == null || item.ms > nowMs)
    .sort((left, right) => left.ms - right.ms)[0] || null;
  const stale = normalized
    .filter((item) => nowMs != null && item.ms <= nowMs)
    .map((item) => item.source)
    .filter(Boolean);
  return {
    nextRetryAt: future?.at || null,
    nextRetrySource: future?.source || null,
    staleRetryWarnings: stale.length ? ["stale_retry_timestamp"] : [],
    staleRetrySources: [...new Set(stale)]
  };
}

function collectEntryPauseReasons(runtime = {}, manager = {}) {
  const reasons = [
    ...(runtime.selfHealState?.pauseEntries ? ["self_heal_pause_entries"] : []),
    ...(runtime.selfHeal?.pauseEntries ? ["self_heal_pause_entries"] : []),
    ...(runtime.ops?.apiDegradationSummary?.blockedActions || []).includes("open_new_entries") ? ["api_degradation_blocks_entries"] : [],
    ...(runtime.entryBlockedReasons || []),
    ...(runtime.tradingPathHealth?.blockingReasons || []),
    ...(manager.readiness?.blockingReasons || [])
  ];
  return [...new Set(reasons.filter(Boolean))].slice(0, 12);
}

function classifyIncidentCause({ status, runtime = {}, entryPauseReasons = [], failureStreak = 0 } = {}) {
  const reasonText = entryPauseReasons.join(" ").toLowerCase();
  if (status === "heartbeat_active_cycle_stale") return "stale_cycle";
  if (status === "running_without_recent_heartbeat") return "heartbeat_miss";
  if (runtime.stream?.stale || runtime.streamStatus?.stale || /stream/.test(reasonText)) return "stream_stall";
  if (/self_heal_pause_entries|self_heal/.test(reasonText)) return "self_heal_pause";
  if (/unresolved_intent|intent/.test(reasonText)) return "unresolved_intent";
  if (/data|quorum|api_degradation|request|budget|pressure|ban|rate_limit|rest_budget|binance_rest/.test(reasonText)) return "data_pressure";
  if (/risk|governance|committee|veto|safety|preflight/.test(reasonText)) return "risk_block";
  if (failureStreak > 0) return "repeated_cycle_failure";
  if (status === "stale_or_stopped" || status === "stopped_after_recent_cycle") return "loop_stopped";
  return "unknown";
}

function buildNextSafeAction(rootCause) {
  if (!rootCause) return "none";
  if (rootCause === "stale_cycle" || rootCause === "heartbeat_miss") return "inspect_runtime_loop_and_restart_if_heartbeat_does_not_recover";
  if (rootCause === "stream_stall") return "verify_stream_health_before_allowing_rest_fallback_or_restart_streams";
  if (rootCause === "self_heal_pause") return "review_self_heal_reason_and_resume_entries_only_after_source_recovers";
  if (rootCause === "unresolved_intent") return "resolve_or_reconcile_open_intents_before_new_entries";
  if (rootCause === "data_pressure") return "reduce_rest_pressure_or_wait_for_budget_recovery_before_entries";
  if (rootCause === "risk_block") return "review_visible_risk_or_governance_blocker_without_weakening_live_safety";
  if (rootCause === "repeated_cycle_failure") return "inspect_last_cycle_error_and_keep_entries_paused_until_failures_stop";
  if (rootCause === "loop_stopped") return "start_bot_service_or_use_start_everything_after_preflight";
  return "inspect_trading_path_debug_and_runtime_logs";
}

export function touchRuntimeLiveness(runtime = {}, {
  phase = "unknown",
  status = "running",
  reason = null,
  error = null,
  at = new Date().toISOString()
} = {}) {
  const previous = runtime.liveness || {};
  const event = {
    at,
    phase,
    status,
    reason,
    error: error ? `${error.message || error}`.slice(0, 300) : null
  };
  runtime.liveness = {
    ...previous,
    lastHeartbeatAt: at,
    currentPhase: phase,
    status,
    reason,
    lastError: event.error,
    phases: {
      ...(previous.phases || {}),
      [phase]: { at, status, reason, error: event.error }
    },
    history: [event, ...arr(previous.history)].slice(0, 30),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
  return runtime.liveness;
}

export function buildRuntimeLivenessSummary({
  runtime = {},
  manager = {},
  config = {},
  now = new Date().toISOString()
} = {}) {
  const liveness = runtime.liveness || manager.liveness || {};
  const heartbeatAgeMs = ageMs(liveness.lastHeartbeatAt, now);
  const cycleAgeMs = ageMs(runtime.lastCycleAt, now);
  const intervalMs = Math.max(1_000, Number(config.tradingIntervalSeconds || 60) * 1000);
  const staleAfterMs = Math.max(60_000, Number(config.runtimeLivenessStaleMs || intervalMs * 3));
  const processRunning = ["run", "running"].includes(manager.runState) || runtime.lifecycle?.activeRun === true || runtime.run === true;
  const heartbeatFresh = heartbeatAgeMs != null && heartbeatAgeMs <= staleAfterMs;
  const cycleFresh = cycleAgeMs != null && cycleAgeMs <= Math.max(staleAfterMs, intervalMs * 4);
  const failureStreak = safeNumber(manager.consecutiveCycleFailures ?? manager.cycleFailureStreak ?? manager.failureStreak ?? runtime.consecutiveCycleFailures, 0);
  const entryPauseReasons = collectEntryPauseReasons(runtime, manager);
  const retrySummary = buildFutureRetrySummary([
    { source: "runtime_liveness_cycle_waiting", at: liveness.phases?.cycle_waiting?.at },
    { source: "runtime_next_cycle", at: runtime.nextCycleAt },
    { source: "manager_next_cycle", at: manager.nextCycleAt }
  ], now);
  const nextRetryAt = retrySummary.nextRetryAt;
  const status = processRunning && heartbeatFresh && cycleFresh
    ? "active"
    : processRunning && heartbeatFresh
      ? "heartbeat_active_cycle_stale"
      : processRunning
        ? "running_without_recent_heartbeat"
        : cycleFresh
          ? "stopped_after_recent_cycle"
          : "stale_or_stopped";
  const brokenPhase = status === "active"
    ? null
    : !heartbeatFresh
      ? "manager_or_loop_heartbeat"
      : !cycleFresh
        ? "cycle_completion"
        : "process_or_manager";
  const functionalStatus = status === "active" && !entryPauseReasons.length && failureStreak === 0
    ? "trading_functional"
    : status === "active"
      ? "running_with_entry_blocks"
      : processRunning
        ? "process_running_trading_not_functional"
        : "not_running";
  const incidentRootCause = functionalStatus === "trading_functional"
    ? null
    : classifyIncidentCause({ status, runtime, entryPauseReasons, failureStreak });
  const incidentSnapshot = {
    status: functionalStatus === "trading_functional" ? "clear" : "incident",
    functionalStatus,
    rootCause: incidentRootCause,
    processRunning,
    currentPhase: liveness.currentPhase || null,
    lastHeartbeatAt: liveness.lastHeartbeatAt || null,
    lastCompletedCycleAt: runtime.lastCycleAt || null,
    failureStreak,
    staleSource: brokenPhase,
    entriesPaused: entryPauseReasons.length > 0,
    entryPauseReasons,
    nextRetryAt,
    nextRetrySource: retrySummary.nextRetrySource,
    staleRetryWarnings: retrySummary.staleRetryWarnings,
    staleRetrySources: retrySummary.staleRetrySources,
    nextSafeAction: buildNextSafeAction(incidentRootCause),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
  return {
    status,
    functionalStatus,
    processRunning,
    currentPhase: liveness.currentPhase || null,
    lastHeartbeatAt: liveness.lastHeartbeatAt || null,
    heartbeatAgeMs,
    lastCycleAt: runtime.lastCycleAt || null,
    cycleAgeMs,
    staleAfterMs,
    brokenPhase,
    failureStreak,
    nextRetryAt,
    nextRetrySource: retrySummary.nextRetrySource,
    staleRetryWarnings: retrySummary.staleRetryWarnings,
    staleRetrySources: retrySummary.staleRetrySources,
    entriesPaused: entryPauseReasons.length > 0,
    entryPauseReasons,
    incidentSnapshot,
    lastError: liveness.lastError || manager.lastError?.message || null,
    phaseHistory: arr(liveness.history).slice(0, 10),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
