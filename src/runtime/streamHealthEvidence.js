function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMs(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function ageMs(value, referenceMs) {
  const parsed = parseMs(value);
  return Number.isFinite(parsed) && Number.isFinite(referenceMs)
    ? Math.max(0, referenceMs - parsed)
    : null;
}

function unique(values) {
  return [...new Set(arrayOrEmpty(values).filter(Boolean))];
}

function fallbackEntriesFromState(state = {}, referenceNow = new Date().toISOString()) {
  const referenceMs = parseMs(referenceNow);
  return Object.entries(objectOrFallback(state, {}))
    .map(([key, value]) => ({
      key,
      kind: `${key}`.split(":")[0] || "unknown",
      symbol: `${key}`.split(":")[1] || null,
      reason: value?.reason || null,
      lastAt: value?.lastAt || null,
      ageMs: ageMs(value?.lastAt, referenceMs)
    }))
    .sort((left, right) => finite(left.ageMs, Infinity) - finite(right.ageMs, Infinity))
    .slice(0, 12);
}

function deriveLocalBook(streamStatus = {}) {
  const localBook = objectOrFallback(streamStatus.localBook, {});
  const syncedSymbols = finite(
    localBook.syncedSymbols ?? localBook.healthySymbols ?? streamStatus.localBookSyncedSymbols,
    0
  );
  const expectedSymbols = finite(
    localBook.expectedSymbols ?? localBook.symbolsExpected ?? streamStatus.localBookExpectedSymbols,
    syncedSymbols
  );
  const notReadySymbols = arrayOrEmpty(localBook.notReadySymbols || localBook.missingSymbols);
  return {
    syncedSymbols,
    expectedSymbols,
    notReadySymbols,
    streamPrimary: Boolean(localBook.streamPrimary ?? streamStatus.streamPrimary ?? syncedSymbols > 0)
  };
}

function computeStatus({
  banActive,
  publicAuthoritative,
  publicConnected,
  userStreamExpected,
  userStreamConnected,
  stalePublic,
  staleUser,
  pendingChunks,
  staleChunks,
  reconnectStorm,
  depthFallbacks,
  suppressedEntries,
  localBook,
  pressure,
  privateRestWeight
}) {
  if (banActive) return "paused_rate_limit_ban";
  if (userStreamExpected && !userStreamConnected && (staleUser || privateRestWeight > 0)) {
    return "private_stream_gap_using_rest";
  }
  if (reconnectStorm) return "reconnect_storm_degraded";
  if (publicAuthoritative && publicConnected && (staleChunks > 0 || stalePublic)) return "public_stream_stalled";
  if (pendingChunks > 0 || (!localBook.streamPrimary && localBook.expectedSymbols > 0)) {
    return "local_book_stream_not_ready";
  }
  if (pressure >= 0.8 || suppressedEntries.some((entry) => entry.kind === "depth")) {
    return "rest_pressure_guarded";
  }
  if (publicAuthoritative && !publicConnected && depthFallbacks.length) return "stream_gap_using_rest_fallback";
  if (depthFallbacks.length) return "watch";
  return "ready";
}

function recommendedActionFor(status) {
  switch (status) {
    case "paused_rate_limit_ban":
      return "wait_for_rest_budget_recovery";
    case "private_stream_gap_using_rest":
      return "restore_user_data_stream_keep_private_rest_sanity_only";
    case "reconnect_storm_degraded":
      return "let_stream_watchdog_stabilize_before_trusting_fallback_data";
    case "public_stream_stalled":
      return "restart_public_stream_or_wait_for_watchdog_recovery";
    case "local_book_stream_not_ready":
      return "wait_for_depth_stream_before_rest_depth_fallback";
    case "rest_pressure_guarded":
      return "prefer_streams_and_defer_non_critical_rest_fallbacks";
    case "stream_gap_using_rest_fallback":
      return "inspect_public_stream_connectivity";
    case "watch":
      return "monitor_rest_fallback_frequency";
    default:
      return "monitor";
  }
}

export function buildStreamHealthEvidence({
  streamStatus = {},
  userStreamStatus = {},
  requestBudget = {},
  restFallbackState = {},
  restFallbackSuppressedState = {},
  restBudgetGovernor = null,
  config = {},
  now = new Date().toISOString()
} = {}) {
  const streams = objectOrFallback(streamStatus, {});
  const userStream = objectOrFallback(userStreamStatus, {});
  const budget = objectOrFallback(requestBudget, {});
  const referenceMs = parseMs(now);
  const maxPublicAgeMs = Math.max(30_000, finite(config.streamHealthPublicStaleMs ?? config.apiDegradationStreamStaleMs, 180_000));
  const maxUserAgeMs = Math.max(30_000, finite(config.streamHealthUserStaleMs ?? config.apiDegradationUserStreamStaleMs, 180_000));
  const warnThreshold = Math.max(100, finite(config.requestWeightWarnThreshold1m, 4800));
  const usedWeight1m = finite(budget.usedWeight1m ?? budget.usedWeight ?? budget.weightUsed1m, 0);
  const pressure = usedWeight1m / warnThreshold;
  const publicConnected = Boolean(streams.public?.connected ?? streams.publicStreamConnected ?? streams.connected);
  const publicAuthoritative = streams.connectivityAuthoritative !== false;
  const publicAge = ageMs(streams.public?.lastMessageAt || streams.lastMessageAt || streams.updatedAt || streams.lastEventAt, referenceMs);
  const staleChunks = finite(streams.publicStreamStaleChunkCount ?? streams.public?.staleChunks, 0);
  const pendingChunks = finite(streams.publicStreamPendingChunkCount ?? streams.public?.pendingChunks, 0);
  const stalePublic = publicAge != null && publicAge > maxPublicAgeMs;
  const userStreamExpected = Boolean(
    streams.userStreamExpected ??
      userStream.expected ??
      (config.binanceApiKey && (config.botMode === "live" || config.paperExecutionVenue === "binance_demo_spot"))
  );
  const userStreamConnected = Boolean(userStream.connected ?? streams.userStreamConnected);
  const userAge = ageMs(userStream.lastMessageAt || userStream.updatedAt || streams.userStreamLastMessageAt, referenceMs);
  const staleUser = userStreamExpected && (userStream.status === "stale" || userStreamConnected === false || (userAge != null && userAge > maxUserAgeMs));
  const localBook = deriveLocalBook(streams);
  const fallbackEntries = fallbackEntriesFromState(restFallbackState, now);
  const suppressedEntries = fallbackEntriesFromState(restFallbackSuppressedState, now);
  const depthFallbacks = fallbackEntries.filter((entry) => entry.kind === "depth");
  const klineFallbacks = fallbackEntries.filter((entry) => entry.kind === "klines" || entry.kind === "kline");
  const reconnects = finite(streams.publicReconnectCount ?? streams.reconnectCount ?? streams.restartCount, 0);
  const reconnectWindowMs = finite(streams.publicReconnectWindowMs ?? streams.reconnectWindowMs, 300_000);
  const reconnectStorm = reconnects >= finite(config.streamHealthReconnectStormThreshold, 3) && reconnectWindowMs <= 600_000;
  const topRestCallers = objectOrFallback(budget.topRestCallers, {});
  const privateRestWeight = Object.entries(topRestCallers).reduce((total, [caller, value]) => (
    /openOrders|open_orders|openOrderList|open_order_list|account_info|\/api\/v3\/account/i.test(caller)
      ? total + finite(value?.weight, 0)
      : total
  ), 0);
  const status = computeStatus({
    banActive: Boolean(budget.banActive),
    publicAuthoritative,
    publicConnected,
    userStreamExpected,
    userStreamConnected,
    stalePublic,
    staleUser,
    pendingChunks,
    staleChunks,
    reconnectStorm,
    depthFallbacks,
    suppressedEntries,
    localBook,
    pressure,
    privateRestWeight
  });
  const reasons = [];
  const warnings = [];
  if (stalePublic) reasons.push("public_stream_stale");
  if (staleUser) reasons.push("user_stream_stale");
  if (pendingChunks > 0) reasons.push("public_stream_pending_chunks");
  if (staleChunks > 0) reasons.push("public_stream_stale_chunks");
  if (!localBook.streamPrimary && localBook.expectedSymbols > 0) reasons.push("local_book_depth_stream_not_ready");
  if (pressure >= 0.8) reasons.push("rest_budget_pressure");
  if (depthFallbacks.length) reasons.push("depth_rest_fallback_used");
  if (klineFallbacks.length) reasons.push("kline_rest_fallback_used");
  if (suppressedEntries.length) reasons.push("rest_fallback_suppressed");
  if (reconnectStorm) reasons.push("reconnect_storm");
  if (publicAge == null && Object.keys(streams).length) warnings.push("public_stream_timestamp_missing");
  if (userStreamExpected && userAge == null && (Object.keys(userStream).length || streams.userStreamConnected != null)) warnings.push("user_stream_timestamp_missing");
  if (!Object.keys(streams).length) warnings.push("stream_metadata_missing");

  const streamReplacementAvailable = {
    publicMarketData: publicConnected && !stalePublic,
    localOrderBook: localBook.streamPrimary && localBook.syncedSymbols > 0,
    userData: userStreamExpected ? userStreamConnected && !staleUser : false
  };
  const learningEvidenceEligible = ["ready", "watch"].includes(status) && !stalePublic && !staleUser;

  return {
    status,
    generatedAt: now,
    publicStreamConnected: publicConnected,
    publicStreamAuthoritative: publicAuthoritative,
    publicStreamAgeMs: publicAge,
    publicStreamStaleChunkCount: staleChunks,
    publicStreamPendingChunkCount: pendingChunks,
    userStreamExpected,
    userStreamConnected,
    userStreamAgeMs: userAge,
    localBookReady: localBook.streamPrimary && localBook.syncedSymbols > 0,
    localBookSyncedSymbols: localBook.syncedSymbols,
    localBookExpectedSymbols: localBook.expectedSymbols,
    localBookNotReadySymbols: localBook.notReadySymbols,
    usedWeight1m,
    pressure: Number.isFinite(pressure) ? Number(pressure.toFixed(4)) : 0,
    fallbackCount: fallbackEntries.length,
    depthFallbackCount: depthFallbacks.length,
    klineFallbackCount: klineFallbacks.length,
    suppressedFallbackCount: suppressedEntries.length,
    privateRestWeight,
    reconnectCount: reconnects,
    streamReplacementAvailable,
    recentFallbacks: fallbackEntries,
    recentSuppressedFallbacks: suppressedEntries,
    reasons: unique(reasons),
    warnings: unique(warnings),
    recommendedAction: recommendedActionFor(status),
    restBudgetGovernor: restBudgetGovernor || null,
    diagnosticsOnly: true,
    forceUnlock: false,
    liveSafetyUnchanged: true,
    learningEvidenceEligible
  };
}

export function annotatePaperCandidateStreamEvidence(candidate = {}, streamHealthSummary = {}) {
  const source = objectOrFallback(candidate, {});
  const stream = objectOrFallback(streamHealthSummary, {});
  return {
    ...source,
    streamHealth: {
      status: stream.status || "unknown",
      reasons: arrayOrEmpty(stream.reasons),
      usedRestFallback: finite(stream.fallbackCount, 0) > 0,
      depthRestFallbackUsed: finite(stream.depthFallbackCount, 0) > 0,
      klineRestFallbackUsed: finite(stream.klineFallbackCount, 0) > 0,
      suppressedFallbackCount: finite(stream.suppressedFallbackCount, 0),
      streamReplacementAvailable: objectOrFallback(stream.streamReplacementAvailable, {}),
      learningEvidenceEligible: Boolean(stream.learningEvidenceEligible),
      diagnosticsOnly: true,
      liveSafetyUnchanged: true
    }
  };
}
