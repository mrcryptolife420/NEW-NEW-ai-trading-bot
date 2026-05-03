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

function latestTimestamp(...values) {
  const sorted = values
    .flat()
    .map((value) => ({ value, ms: timestampMs(value) }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((a, b) => b.ms - a.ms);
  return sorted[0]?.value || null;
}

export function normalizeDashboardFreshness(snapshot = {}, now = new Date().toISOString(), config = {}) {
  const source = objectOrFallback(snapshot, {});
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
    ? "missing_snapshot_timestamp"
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
  const requested = arr(watchlist).map((symbol) => `${symbol}`.toUpperCase()).filter(Boolean);
  const snapshotMap = objectOrFallback(marketSnapshots, {});
  const readySymbols = Object.entries(snapshotMap)
    .filter(([, snapshot]) => objectOrFallback(snapshot, null))
    .map(([symbol]) => `${symbol}`.toUpperCase());
  const missingSymbols = requested.length
    ? requested.filter((symbol) => !readySymbols.includes(symbol))
    : [];
  const nowMs = timestampMs(now);
  const lastSuccessfulAggregationAt = latestTimestamp(
    runtimeState.lastAnalysisAt,
    runtimeState.marketData?.lastUpdatedAt,
    runtimeState.marketSnapshotsUpdatedAt,
    runtimeState.latestMarketSnapshotsUpdatedAt,
    ...Object.values(snapshotMap).map((snapshot) => snapshot?.updatedAt || snapshot?.at || snapshot?.timestamp)
  );
  const staleSources = [];
  if (!requested.length) staleSources.push("watchlist_empty");
  if (!readySymbols.length) staleSources.push("no_market_snapshots_ready");
  const aggregationAgeMs = ageMs(lastSuccessfulAggregationAt, nowMs);
  if (aggregationAgeMs == null || aggregationAgeMs > staleMs) staleSources.push("feed_aggregation_stale");
  if (budget.banActive || budget.backoffActive || budget.status === "blocked") staleSources.push("rest_budget_exhausted");
  if (streams.publicStreamConnected === false && streams.connectivityAuthoritative !== false) staleSources.push("public_stream_disconnected");
  const partial = requested.length > 0 && readySymbols.length > 0 && missingSymbols.length > 0;
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
    symbolsReady: readySymbols.length,
    missingSymbols: missingSymbols.slice(0, 24),
    staleSources: [...new Set(staleSources)],
    lastSuccessfulAggregationAt,
    ageMs: aggregationAgeMs
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
  const readmodelAt = readmodel.rebuiltAt || readmodel.lastRefreshAt || readmodel.lastCompletedAt || readmodel.generatedAt || null;
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
  const marketSnapshotsCount = countMarketSnapshots(runtime.latestMarketSnapshots || runtime.marketSnapshots || dashboard.marketSnapshots);
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
  if (!feedSummary && feed.staleSources?.length) staleSources.push(...feed.staleSources);
  if (!dashboardFreshness.fresh) staleSources.push(dashboardFreshness.staleReason);
  if (!readmodelFresh && readmodel.status) staleSources.push("readmodel_snapshot_stale");
  if (!frontendPolling.healthy) staleSources.push(frontendPolling.lastSnapshotError ? "dashboard_polling_error" : "dashboard_polling_stale");

  const uniqueBlockers = [...new Set(blockingReasons.filter(Boolean))];
  const uniqueStale = [...new Set(staleSources.filter(Boolean))];
  const botRunning = Boolean(runtime.lifecycle?.activeRun || runtime.running || dashboard.running);
  const cycleFresh = cycleAgeMs != null && cycleAgeMs <= cycleMaxAgeMs;
  const feedFresh = feed.status === "ready";
  const dashboardFresh = dashboardFreshness.fresh;
  const frontendPollingHealthy = frontendPolling.healthy;
  const hardBlocked = uniqueBlockers.includes("exchange_safety_blocked");
  const status = hardBlocked
    ? "blocked"
    : uniqueStale.length
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
    : uniqueStale.includes("feed_aggregation_stale") || uniqueStale.includes("no_market_snapshots_ready")
      ? "run_once_and_check_feed_sources"
      : uniqueBlockers.includes("no_decision_snapshot_created")
        ? "inspect_scan_cycle_and_candidate_generation"
        : uniqueStale.includes("readmodel_snapshot_stale")
          ? "run_readmodel_rebuild"
          : uniqueStale.includes("dashboard_polling_error") || uniqueStale.includes("dashboard_polling_stale")
            ? "restart_dashboard_or_check_frontend_polling"
            : "monitor_next_cycle";

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
