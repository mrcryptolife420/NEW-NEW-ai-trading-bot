function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function timestampMs(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function ageMs(value, nowMs) {
  const at = timestampMs(value);
  return Number.isFinite(at) && Number.isFinite(nowMs) ? Math.max(0, nowMs - at) : null;
}

function countMarketSnapshots(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function symbolsFromDecisionSnapshots(decisions = []) {
  return arr(decisions)
    .filter((decision) => {
      if (!decision?.symbol) return false;
      if (decision.marketData?.status === "missing" || decision.marketData?.status === "failed") return false;
      if (decision.dataQualitySummary?.status === "missing") return false;
      return Boolean(
        decision.marketData?.status === "ready" ||
        decision.orderBook ||
        decision.marketCondition ||
        decision.marketContext ||
        decision.regime ||
        decision.strategy
      );
    })
    .map((decision) => `${decision.symbol}`.toUpperCase())
    .filter(Boolean);
}

function latestTimestamp(...values) {
  const sorted = values
    .flat()
    .map((value) => ({ value, ms: timestampMs(value) }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((a, b) => b.ms - a.ms);
  return sorted[0]?.value || null;
}

function lower(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function isoFromMs(value) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

function futureRetrySummary(candidates = [], nowMs = Date.now()) {
  const normalized = arr(candidates)
    .map((item) => ({ ...item, ms: timestampMs(item?.at) }))
    .filter((item) => item.at && Number.isFinite(item.ms));
  const future = normalized
    .filter((item) => !Number.isFinite(nowMs) || item.ms > nowMs)
    .sort((left, right) => left.ms - right.ms)[0] || null;
  const stale = normalized
    .filter((item) => Number.isFinite(nowMs) && item.ms <= nowMs)
    .map((item) => item.source)
    .filter(Boolean);
  return {
    nextRetryAt: future?.at || null,
    nextRetrySource: future?.source || null,
    staleRetryWarnings: stale.length ? ["stale_retry_timestamp"] : [],
    staleRetrySources: [...new Set(stale)]
  };
}

function inferAffectedSubsystems({ blockers = [], staleSources = [] } = {}) {
  const values = [...blockers, ...staleSources].map((value) => lower(value));
  const subsystems = new Set();
  for (const value of values) {
    if (/rest_budget|api_degradation|market_snapshot|feed|data|price_sanity/.test(value)) subsystems.add("market_data");
    if (/stream/.test(value)) subsystems.add("streaming");
    if (/cycle|heartbeat|scan/.test(value)) subsystems.add("runtime_loop");
    if (/dashboard|polling/.test(value)) subsystems.add("dashboard");
    if (/readmodel|persistence|storage/.test(value)) subsystems.add("storage_readmodel");
    if (/exchange_safety|risk|governance|veto|preflight/.test(value)) subsystems.add("risk_execution_safety");
    if (/decision/.test(value)) subsystems.add("decision_pipeline");
  }
  return [...subsystems];
}

function inferIncidentRootCause({ blockers = [], staleSources = [], status = "unknown" } = {}) {
  const text = [...blockers, ...staleSources].join(" ").toLowerCase();
  if (!text && ["active", "degraded"].includes(status)) return null;
  if (/exchange_safety|risk|governance|veto|preflight/.test(text)) return "risk_block";
  if (/rest_budget|api_degradation|data|market_snapshot|feed|price_sanity/.test(text)) return "data_pressure";
  if (/stream/.test(text)) return "stream_stall";
  if (/cycle|heartbeat|scan/.test(text)) return "stale_cycle";
  if (/readmodel|persistence|storage/.test(text)) return "persistence_drift";
  if (/dashboard|polling/.test(text)) return "dashboard_drift";
  if (/decision/.test(text)) return "decision_pipeline_inactive";
  return "unknown";
}

function buildNoTradeSummary({ status, uniqueBlockers = [], uniqueStale = [], feed = {}, decisionFunnel = null, topDecisionsCount = 0, marketSnapshotsCount = 0 } = {}) {
  const categories = {};
  const note = (key) => {
    categories[key] = (categories[key] || 0) + 1;
  };
  if (!marketSnapshotsCount || uniqueStale.includes("no_market_snapshots_ready") || uniqueStale.includes("feed_aggregation_stale")) note("market_data");
  if (!topDecisionsCount || uniqueBlockers.includes("no_decision_snapshot_created")) note("candidate_generation");
  if (decisionFunnel?.firstBlockedStage) note(decisionFunnel.firstBlockedStage);
  if (uniqueBlockers.some((reason) => /risk|governance|exchange_safety|preflight/.test(`${reason}`))) note("risk_gate");
  if (uniqueBlockers.some((reason) => /exec|order|broker|intent|fill/.test(`${reason}`))) note("execution");
  if (uniqueStale.some((reason) => /readmodel|storage|persist|dashboard/.test(`${reason}`))) note("storage_dashboard");
  const primaryReason = decisionFunnel?.primaryReason || uniqueBlockers[0] || uniqueStale[0] || null;
  const primaryCategory = Object.entries(categories).sort((left, right) => right[1] - left[1])[0]?.[0] || (status === "active" ? "none" : "insufficient_evidence");
  return {
    status: status === "active" ? "clear" : primaryReason ? "explained" : "insufficient_evidence",
    primaryReason,
    primaryCategory,
    categories,
    decisionFunnelStatus: decisionFunnel?.status || "unavailable",
    feedStatus: feed.status || "unknown",
    nextSafeAction: decisionFunnel?.nextSafeAction || null,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

function isStreamConnectivityAuthoritative(runtimeState = {}, streamStatus = {}) {
  const runtime = objectOrFallback(runtimeState, {});
  const streams = objectOrFallback(streamStatus, {});
  if (streams.connectivityAuthoritative === false) return false;
  if (streams.publicStreamAuthoritative === false) return false;
  const service = objectOrFallback(runtime.service, {});
  const lifecycle = objectOrFallback(runtime.lifecycle, {});
  if (lower(service.initMode) === "read_only") return false;
  if (lifecycle.activeRun === false && ["stopped", "idle"].includes(lower(service.watchdogStatus))) {
    return false;
  }
  return true;
}

export function normalizeDashboardFreshness(snapshot = {}, now = new Date().toISOString(), config = {}) {
  const source = objectOrFallback(snapshot, {});
  const hasSnapshotPayload = Object.keys(source).length > 0;
  const nowMs = timestampMs(now);
  const maxAgeMs = Math.max(30_000, Number(config.dashboardSnapshotStaleMs || config.dashboardFreshnessStaleMs || 180_000));
  const lastUpdatedAt = latestTimestamp(
    source.generatedAt,
    source.snapshotMeta?.generatedAt,
    source.lastUpdatedAt,
    source.updatedAt
  );
  const dataUpdatedAt = latestTimestamp(
    source.snapshotMeta?.lastAnalysisAt,
    source.snapshotMeta?.lastCycleAt,
    source.overview?.lastAnalysisAt,
    source.overview?.lastCycleAt,
    source.ops?.dataFreshness?.lastAnalysisAt,
    source.ops?.dataFreshness?.lastCycleAt,
    source.lastAnalysisAt,
    source.lastCycleAt
  );
  const snapshotAgeMs = ageMs(lastUpdatedAt, nowMs);
  const dataAgeMs = ageMs(dataUpdatedAt, nowMs);
  const missingTimestamp = !lastUpdatedAt;
  const staleSnapshot = snapshotAgeMs != null && snapshotAgeMs > maxAgeMs;
  const staleData = dataAgeMs != null && dataAgeMs > maxAgeMs * 2;
  const staleReason = missingTimestamp
    ? (hasSnapshotPayload ? "missing_snapshot_timestamp" : "dashboard_snapshot_unavailable")
    : staleSnapshot
      ? "dashboard_snapshot_stale"
      : staleData
        ? "dashboard_data_stale"
        : null;
  return {
    fresh: !staleReason,
    ageMs: snapshotAgeMs,
    lastUpdatedAt,
    dataUpdatedAt,
    staleReason,
    maxAgeMs
  };
}

export function buildFeedAggregationSummary({
  runtimeState = {},
  watchlist = runtimeState.watchlist || runtimeState.watchlistSummary?.symbols || [],
  marketSnapshots = runtimeState.latestMarketSnapshots || runtimeState.marketSnapshots || {},
  requestBudget = runtimeState.requestWeight || runtimeState.requestBudget || {},
  streamStatus = runtimeState.stream || runtimeState.streamStatus || {},
  now = new Date().toISOString(),
  staleMs = 180_000
} = {}) {
  const budget = objectOrFallback(requestBudget, {});
  const streams = objectOrFallback(streamStatus, {});
  const streamConnectivityAuthoritative = isStreamConnectivityAuthoritative(runtimeState, streams);
  const requested = arr(watchlist).map((symbol) => `${symbol}`.toUpperCase()).filter(Boolean);
  const snapshotMap = objectOrFallback(marketSnapshots, {});
  const readySymbols = Object.entries(snapshotMap)
    .filter(([, snapshot]) => objectOrFallback(snapshot, null))
    .map(([symbol]) => `${symbol}`.toUpperCase());
  const decisionReadySymbols = readySymbols.length ? [] : symbolsFromDecisionSnapshots(runtimeState.latestDecisions || []);
  const effectiveReadySymbols = readySymbols.length ? readySymbols : decisionReadySymbols;
  const missingSymbols = requested.length
    ? requested.filter((symbol) => !effectiveReadySymbols.includes(symbol))
    : [];
  const nowMs = timestampMs(now);
  const lastSuccessfulAggregationAt = latestTimestamp(
    runtimeState.lastAnalysisAt,
    runtimeState.lastCycleAt,
    runtimeState.marketData?.lastUpdatedAt,
    runtimeState.marketSnapshotsUpdatedAt,
    runtimeState.latestMarketSnapshotsUpdatedAt,
    ...Object.values(snapshotMap).map((snapshot) => snapshot?.updatedAt || snapshot?.at || snapshot?.timestamp)
  );
  const staleSources = [];
  if (!requested.length) staleSources.push("watchlist_empty");
  if (!effectiveReadySymbols.length) staleSources.push("no_market_snapshots_ready");
  const aggregationAgeMs = ageMs(lastSuccessfulAggregationAt, nowMs);
  if (aggregationAgeMs == null || aggregationAgeMs > staleMs) staleSources.push("feed_aggregation_stale");
  if (budget.banActive || budget.backoffActive || budget.status === "blocked") staleSources.push("rest_budget_exhausted");
  if (streams.publicStreamConnected === false && streamConnectivityAuthoritative) staleSources.push("public_stream_disconnected");
  const partial = requested.length > 0 && effectiveReadySymbols.length > 0 && missingSymbols.length > 0;
  const status = staleSources.includes("watchlist_empty")
    ? "empty_watchlist"
    : staleSources.length && !readySymbols.length
      ? "stale"
      : partial || staleSources.length
        ? "degraded"
        : "ready";
  return {
    status,
    symbolsRequested: requested.length,
    symbolsReady: effectiveReadySymbols.length,
    missingSymbols: missingSymbols.slice(0, 24),
    staleSources: [...new Set(staleSources)],
    lastSuccessfulAggregationAt,
    ageMs: aggregationAgeMs,
    streamConnectivityAuthoritative,
    snapshotSource: readySymbols.length ? "runtime_market_snapshots" : (decisionReadySymbols.length ? "decision_snapshot_fallback" : "none")
  };
}

export function normalizeFrontendPollingHealth({
  lastSuccessfulSnapshotAt = null,
  lastSnapshotError = null,
  lastSnapshotErrorAt = null,
  expectedIntervalMs = 10_000,
  now = new Date().toISOString()
} = {}) {
  const nowMs = timestampMs(now);
  const successAgeMs = ageMs(lastSuccessfulSnapshotAt, nowMs);
  const errorMs = timestampMs(lastSnapshotErrorAt);
  const successMs = timestampMs(lastSuccessfulSnapshotAt);
  const errorCleared = Boolean(lastSnapshotError) && Number.isFinite(successMs) && (!Number.isFinite(errorMs) || successMs >= errorMs);
  const activeError = errorCleared ? null : lastSnapshotError;
  const stale = successAgeMs == null || successAgeMs > Math.max(30_000, expectedIntervalMs * 4);
  return {
    healthy: !activeError && !stale,
    expectedIntervalMs,
    lastSuccessfulSnapshotAt,
    lastSnapshotError: activeError,
    lastSnapshotErrorAt: activeError ? lastSnapshotErrorAt : null,
    snapshotAgeMs: successAgeMs,
    errorCleared
  };
}

export function buildTradingPathHealth({
  runtimeState = {},
  dashboardSnapshot = {},
  feedSummary = null,
  readmodelSummary = null,
  apiDegradationSummary = null,
  priceSanitySummary = null,
  scanSummary = null,
  now = new Date().toISOString(),
  config = {}
} = {}) {
  const runtime = objectOrFallback(runtimeState, {});
  const dashboard = objectOrFallback(dashboardSnapshot, {});
  const nowMs = timestampMs(now);
  const cycleAt = runtime.lastCycleAt || dashboard.snapshotMeta?.lastCycleAt || dashboard.overview?.lastCycleAt || null;
  const cycleAgeMs = ageMs(cycleAt, nowMs);
  const cycleMaxAgeMs = Math.max(60_000, Number(config.tradingPathCycleStaleMs || 300_000));
  const feed = feedSummary || buildFeedAggregationSummary({
    runtimeState: runtime,
    requestBudget: runtime.requestWeight || dashboard.requestWeight || {},
    streamStatus: runtime.stream || dashboard.stream || {},
    now,
    staleMs: Math.max(60_000, Number(config.tradingPathFeedStaleMs || 300_000))
  });
  const dashboardFreshness = normalizeDashboardFreshness(dashboard, now, config);
  const readmodel = objectOrFallback(readmodelSummary || dashboard.readModel || runtime.readModelRefresh, {});
  const apiDegradation = objectOrFallback(
    apiDegradationSummary || dashboard.apiDegradationSummary || runtime.apiDegradationSummary || runtime.ops?.apiDegradationSummary,
    { degradationLevel: "normal", blockedActions: [], reasons: [] }
  );
  const priceSanity = objectOrFallback(
    priceSanitySummary || dashboard.priceSanitySummary || dashboard.marketContext?.priceSanitySummary || runtime.priceSanitySummary || runtime.crossExchangeDivergenceSummary,
    { priceSanityStatus: "unknown", warnings: [], staleSources: [] }
  );
  const readmodelAt = latestTimestamp(
    readmodel.rebuiltAt,
    readmodel.journalRefreshedAt,
    readmodel.lastRefreshAt,
    readmodel.lastCompletedAt,
    readmodel.completedAt,
    readmodel.generatedAt
  );
  const readmodelAgeMs = ageMs(readmodelAt, nowMs);
  const readmodelFresh = readmodel.status === "ready" && (readmodelAgeMs == null || readmodelAgeMs <= Math.max(300_000, Number(config.tradingPathReadModelStaleMs || 900_000)));
  const frontendPolling = normalizeFrontendPollingHealth({
    lastSuccessfulSnapshotAt: dashboard.lastSuccessfulSnapshotAt || dashboardFreshness.lastUpdatedAt,
    lastSnapshotError: dashboard.lastSnapshotError || null,
    lastSnapshotErrorAt: dashboard.lastSnapshotErrorAt || null,
    expectedIntervalMs: Number(config.dashboardPollingIntervalMs || 10_000),
    now
  });
  const topDecisionsCount = arr(dashboard.topDecisions || runtime.latestDecisions || scanSummary?.topDecisions).length;
  const marketSnapshotsCount = countMarketSnapshots(runtime.latestMarketSnapshots || runtime.marketSnapshots || dashboard.marketSnapshots) || Number(feed.symbolsReady || 0);
  const decisionFunnel = runtime.signalFlow?.decisionFunnel ||
    runtime.signalFlow?.lastCycle?.decisionFunnel ||
    dashboard.ops?.signalFlow?.decisionFunnel ||
    dashboard.ops?.signalFlow?.lastCycle?.decisionFunnel ||
    dashboard.report?.decisionFunnel ||
    null;
  const blockingReasons = [];
  const staleSources = [];
  const exchangeSafety = dashboard.exchangeSafety || runtime.exchangeSafety || {};
  const riskLocks = dashboard.ops?.riskLocks || {};
  if (exchangeSafety.entryBlocked || exchangeSafety.status === "blocked" || riskLocks.exchangeTruthFreeze || riskLocks.exchangeSafetyGlobalFreeze) {
    blockingReasons.push("exchange_safety_blocked");
  }
  if (cycleAgeMs == null || cycleAgeMs > cycleMaxAgeMs) {
    staleSources.push("no_recent_scan_cycle");
    blockingReasons.push("no_recent_scan_cycle");
  }
  if (!feed.symbolsRequested) {
    staleSources.push("watchlist_empty");
    blockingReasons.push("watchlist_empty");
  }
  if (!marketSnapshotsCount) {
    staleSources.push("no_market_snapshots_ready");
    blockingReasons.push("no_market_snapshots_ready");
  }
  if (!topDecisionsCount) {
    blockingReasons.push("no_decision_snapshot_created");
  }
  if (feed.staleSources?.length) staleSources.push(...feed.staleSources);
  if (apiDegradation.degradationLevel && apiDegradation.degradationLevel !== "normal") {
    staleSources.push(`api_degradation_${apiDegradation.degradationLevel}`);
  }
  if (arr(apiDegradation.blockedActions).includes("open_new_entries")) {
    blockingReasons.push("api_degradation_blocks_entries");
  }
  if (["diverged", "stale"].includes(priceSanity.priceSanityStatus) || arr(priceSanity.warnings).includes("severe_cross_exchange_divergence")) {
    staleSources.push(`price_sanity_${priceSanity.priceSanityStatus || "degraded"}`);
    if (priceSanity.priceSanityStatus === "diverged") {
      blockingReasons.push("price_sanity_diverged");
    }
  }
  if (!dashboardFreshness.fresh) staleSources.push(dashboardFreshness.staleReason);
  if (!readmodelFresh && readmodel.status) staleSources.push("readmodel_snapshot_stale");
  if (!frontendPolling.healthy) staleSources.push(frontendPolling.lastSnapshotError ? "dashboard_polling_error" : "dashboard_polling_stale");

  const uniqueBlockers = [...new Set(blockingReasons.filter(Boolean))];
  const uniqueStale = [...new Set(staleSources.filter(Boolean))];
  const displayOnlyStaleSources = new Set([
    "dashboard_snapshot_unavailable",
    "missing_snapshot_timestamp",
    "dashboard_snapshot_stale",
    "dashboard_data_stale",
    "dashboard_polling_error",
    "dashboard_polling_stale",
    "readmodel_snapshot_stale"
  ]);
  const pathStaleSources = uniqueStale.filter((source) => !displayOnlyStaleSources.has(source));
  const botRunning = Boolean(runtime.lifecycle?.activeRun || runtime.running || dashboard.running);
  const cycleFresh = cycleAgeMs != null && cycleAgeMs <= cycleMaxAgeMs;
  const feedFresh = feed.status === "ready";
  const dashboardFresh = dashboardFreshness.fresh;
  const frontendPollingHealthy = frontendPolling.healthy;
  const hardBlocked = uniqueBlockers.includes("exchange_safety_blocked");
  const displayStaleSources = uniqueStale.filter((source) => displayOnlyStaleSources.has(source));
  const status = hardBlocked
    ? "blocked"
    : pathStaleSources.length
      ? "stale"
    : uniqueBlockers.length
      ? "inactive"
        : !botRunning && !cycleFresh
          ? "inactive"
          : feedFresh && dashboardFresh && readmodelFresh && frontendPollingHealthy
            ? "active"
            : "degraded";
  const nextAction = hardBlocked
    ? "run_reconcile_plan_or_exchange_safety_status"
    : uniqueStale.includes("rest_budget_exhausted") || uniqueStale.some((source) => `${source}`.startsWith("api_degradation_"))
      ? "wait_for_rest_budget_recovery_and_use_stream_cache_only"
      : uniqueStale.includes("feed_aggregation_stale") || uniqueStale.includes("no_market_snapshots_ready")
        ? "run_once_and_check_feed_sources"
        : uniqueBlockers.includes("no_decision_snapshot_created")
          ? "inspect_scan_cycle_and_candidate_generation"
          : uniqueStale.includes("readmodel_snapshot_stale")
            ? "run_readmodel_rebuild"
            : uniqueStale.includes("dashboard_snapshot_unavailable")
              ? "start_dashboard_or_fetch_snapshot"
              : uniqueStale.includes("dashboard_polling_error") || uniqueStale.includes("dashboard_polling_stale")
                ? "restart_dashboard_or_check_frontend_polling"
                : "monitor_next_cycle";
  const dashboardOperationalTruth = {
    status: displayStaleSources.length
      ? (botRunning || cycleFresh ? "backend_alive_dashboard_stale" : "dashboard_stale_backend_inactive")
      : "consistent",
    backendAlive: Boolean(botRunning || cycleFresh),
    cycleFresh,
    dashboardFresh,
    frontendPollingHealthy,
    staleDisplaySources: displayStaleSources,
    warning: displayStaleSources.length
      ? "Dashboard display state is stale or unavailable; use backend/readmodel/runtime truth before operator action."
      : null,
    nextSafeAction: displayStaleSources.length
      ? (displayStaleSources.includes("readmodel_snapshot_stale") ? "run_readmodel_rebuild" : "restart_dashboard_or_check_frontend_polling")
      : "none",
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
  const incidentRootCause = inferIncidentRootCause({ blockers: uniqueBlockers, staleSources: uniqueStale, status });
  const retrySummary = futureRetrySummary([
    { source: "runtime_service", at: runtime.service?.nextRetryAt },
    { source: "runtime_next_cycle", at: runtime.nextCycleAt },
    { source: "api_degradation", at: apiDegradation.nextRetryAt },
    { source: "rest_ban_pause", at: isoFromMs(runtime.requestWeight?.banUntil) }
  ], nowMs);
  const incidentRecovery = {
    status: incidentRootCause ? "incident" : "clear",
    rootCause: incidentRootCause,
    affectedSubsystems: inferAffectedSubsystems({ blockers: uniqueBlockers, staleSources: uniqueStale }),
    entriesPaused: uniqueBlockers.length > 0 || arr(apiDegradation.blockedActions).includes("open_new_entries"),
    nextRetryAt: retrySummary.nextRetryAt,
    nextRetrySource: retrySummary.nextRetrySource,
    staleRetryWarnings: retrySummary.staleRetryWarnings,
    staleRetrySources: retrySummary.staleRetrySources,
    staleSources: uniqueStale,
    blockingReasons: uniqueBlockers,
    safeNextAction: nextAction,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
  const noTradeSummary = buildNoTradeSummary({
    status,
    uniqueBlockers,
    uniqueStale,
    feed,
    decisionFunnel,
    topDecisionsCount,
    marketSnapshotsCount
  });

  return {
    status,
    botRunning,
    cycleFresh,
    feedFresh,
    readmodelFresh,
    dashboardFresh,
    frontendPollingHealthy,
    topDecisionsCount,
    marketSnapshotsCount,
    blockingReasons: uniqueBlockers,
    staleSources: uniqueStale,
    nextAction,
    lastCycleAt: cycleAt,
    cycleAgeMs,
    feedSummary: feed,
    decisionFunnel,
    noTradeSummary,
    apiDegradationSummary: apiDegradation,
    priceSanitySummary: priceSanity,
    dashboardOperationalTruth,
    incidentRecovery,
    dashboardFreshness,
    readmodelFreshness: {
      fresh: readmodelFresh,
      lastUpdatedAt: readmodelAt,
      ageMs: readmodelAgeMs,
      status: readmodel.status || "unknown"
    },
    frontendPolling
  };
}
