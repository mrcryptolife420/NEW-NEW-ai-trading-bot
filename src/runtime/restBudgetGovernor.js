function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getCallerStats(rateLimitState = {}, caller = "") {
  const topRestCallers = rateLimitState?.topRestCallers || {};
  const exact = topRestCallers[caller];
  if (exact) {
    return {
      count: safeNumber(exact.count, 0),
      weight: safeNumber(exact.weight ?? exact.usedWeight, 0)
    };
  }
  const normalized = `${caller || ""}`.toLowerCase();
  const match = Object.entries(topRestCallers).find(([key]) => `${key || ""}`.toLowerCase() === normalized);
  if (!match) {
    return { count: 0, weight: 0 };
  }
  return {
    count: safeNumber(match[1]?.count, 0),
    weight: safeNumber(match[1]?.weight ?? match[1]?.usedWeight, 0)
  };
}

function resolveHotCallerThreshold(restClass, config = {}) {
  if (restClass === "public_market_depth") {
    return Math.max(0, safeNumber(config.restHotCallerDepthWeightThreshold, 5000));
  }
  if (restClass === "private_trade_history") {
    return Math.max(0, safeNumber(config.restHotCallerPrivateTradeWeightThreshold, 2000));
  }
  return 0;
}

export function getRequestWeightPressure(rateLimitState = {}, config = {}) {
  const warnThreshold = Math.max(100, safeNumber(config.requestWeightWarnThreshold1m, 4800));
  const usedWeight1m = safeNumber(rateLimitState?.usedWeight1m, 0);
  return {
    warnThreshold,
    usedWeight1m,
    pressure: warnThreshold > 0 ? usedWeight1m / warnThreshold : 0,
    banActive: Boolean(rateLimitState?.banActive),
    backoffActive: Boolean(rateLimitState?.backoffActive),
    warningActive: Boolean(rateLimitState?.warningActive)
  };
}

export function classifyRestCaller(caller = "") {
  const text = `${caller || ""}`.toLowerCase();
  if (/mytrades|recent_trades|trade_history|settle_.*trades/.test(text)) {
    return "private_trade_history";
  }
  if (/placeorder|cancelorder|cancelreplace|oco|protective|emergency|flatten|submit|settle_terminal_order/.test(text)) {
    return "critical_execution";
  }
  if (/reconcile|openorders|open_orders|account_info|account|orderlist|order_lists|getorder/.test(text)) {
    return "critical_reconcile";
  }
  if (/depth|orderbook|book_ticker|bookticker|deep_book/.test(text)) {
    return "public_market_depth";
  }
  if (/futures_public|fapi|futures\/data|openinterest|premiumindex|longshortratio|basis|funding/.test(text)) {
    return "public_derivatives_context";
  }
  if (/kline|ticker|market_snapshot|scanner|watchlist|exchange_info/.test(text)) {
    return "public_market_snapshot";
  }
  if (/dashboard|research|report|doctor|status/.test(text)) {
    return "operator_low_priority";
  }
  return "unknown";
}

function cacheRecommendationForCaller(caller = "", restClass = "unknown") {
  const text = `${caller || ""}`.toLowerCase();
  if (/exchange_info/.test(text)) {
    return {
      cacheKey: "exchange_info",
      action: "reuse_exchange_info_cache",
      coalesceWindowMs: 60_000,
      expectedImpact: "reduce_startup_and_symbol_rule_rest_repetition"
    };
  }
  if (/universe.*ticker|ticker_24hr/.test(text)) {
    return {
      cacheKey: "universe_ticker_24hr",
      action: "coalesce_universe_ticker_scan",
      coalesceWindowMs: 30_000,
      expectedImpact: "reduce_scanner_universe_rest_pressure"
    };
  }
  if (/deep_book|depth|orderbook|book_ticker|bookticker/.test(text)) {
    return {
      cacheKey: restClass === "public_market_depth" ? "market_depth_or_book_ticker" : "market_snapshot_book",
      action: "prefer_local_book_or_cached_book_ticker",
      coalesceWindowMs: 5_000,
      expectedImpact: "reduce_quality_quorum_degradation_from_depth_rest_pressure"
    };
  }
  if (/market_snapshot|kline|timeframe/.test(text)) {
    return {
      cacheKey: "market_snapshot_klines",
      action: "reuse_recent_market_snapshot_or_stream_klines",
      coalesceWindowMs: 15_000,
      expectedImpact: "reduce_repeated_snapshot_rest_calls"
    };
  }
  if (/futures_public|fapi|futures\/data|openinterest|premiumindex|longshortratio|basis|funding/.test(text)) {
    return {
      cacheKey: "futures_public_context",
      action: "cache_public_derivatives_context",
      coalesceWindowMs: 30_000,
      expectedImpact: "reduce_repeated_futures_context_rest_calls"
    };
  }
  return {
    cacheKey: restClass,
    action: "review_rest_call_frequency",
    coalesceWindowMs: 0,
    expectedImpact: "manual_review_required"
  };
}

function buildCacheTelemetry({ caller = "", value = {}, cacheRecommendation = {}, allowance = {} } = {}) {
  const recordedHits = safeNumber(value?.cacheHits ?? value?.hits, 0);
  const recordedMisses = safeNumber(value?.cacheMisses ?? value?.misses, 0);
  const coalesced = safeNumber(value?.coalescedCount ?? value?.coalesced, 0);
  const recordedFallbackCount = safeNumber(value?.fallbackCount ?? value?.fallbacks, 0);
  const legacyRestCount = safeNumber(value?.count, 0);
  const cacheable = safeNumber(cacheRecommendation.coalesceWindowMs, 0) > 0;
  const legacyWithoutCacheEvents = cacheable && recordedHits === 0 && recordedMisses === 0 && legacyRestCount > 0;
  const hits = recordedHits;
  const misses = legacyWithoutCacheEvents ? legacyRestCount : recordedMisses;
  const fallbackCount = legacyWithoutCacheEvents ? legacyRestCount : recordedFallbackCount;
  const totalCacheEvents = hits + misses;
  return {
    caller,
    cacheKey: cacheRecommendation.cacheKey || "unknown",
    ttlMs: safeNumber(value?.ttlMs ?? value?.cacheTtlMs ?? cacheRecommendation.coalesceWindowMs, 0),
    coalesceWindowMs: safeNumber(cacheRecommendation.coalesceWindowMs, 0),
    cacheHits: hits,
    cacheMisses: misses,
    cacheHitRatio: totalCacheEvents > 0 ? Number((hits / totalCacheEvents).toFixed(4)) : null,
    coalescedCount: coalesced,
    fallbackCount,
    fallbackReason: value?.fallbackReason || value?.reason || (legacyWithoutCacheEvents ? "legacy_rest_without_cache_event" : allowance.reason) || "not_recorded",
    telemetryStatus: legacyWithoutCacheEvents ? "legacy_rest_observed_without_cache_event" : totalCacheEvents > 0 || coalesced || fallbackCount ? "recorded" : "not_recorded",
    nextSafeAction: cacheRecommendation.action || "review_rest_call_frequency",
    diagnosticsOnly: true
  };
}

export function defaultPriorityForRestClass(restClass) {
  switch (restClass) {
    case "critical_execution":
    case "critical_reconcile":
      return "critical";
    case "private_trade_history":
      return "medium";
    case "public_market_depth":
      return "low";
    case "public_market_snapshot":
    case "public_derivatives_context":
      return "medium";
    case "operator_low_priority":
      return "low";
    default:
      return "medium";
  }
}

function streamReplacementAvailable(restClass, streamStatus = {}, caller = "") {
  if (restClass === "public_market_depth" || restClass === "public_market_snapshot") {
    return Boolean(streamStatus?.public?.connected ?? streamStatus?.publicStreamConnected ?? streamStatus?.connected);
  }
  if (restClass === "private_trade_history") {
    return Boolean(streamStatus?.userStreamConnected);
  }
  if (restClass === "critical_reconcile" && /openorders|open_orders|orderlist|order_lists|getorder/i.test(`${caller || ""}`)) {
    return Boolean(streamStatus?.userStreamConnected);
  }
  return false;
}

function nextSafeActionForCaller(restClass, allowance = {}, replacementAvailable = false) {
  if (!allowance.allow && restClass === "public_market_depth") {
    return replacementAvailable ? "use_local_book_or_public_stream" : "restore_public_stream_before_depth_rest";
  }
  if (!allowance.allow && restClass === "private_trade_history") {
    return replacementAvailable ? "use_user_stream_fills" : "restore_user_stream_then_retry_private_rest";
  }
  if (!allowance.allow) {
    return "defer_non_critical_rest_until_budget_recovers";
  }
  if (restClass === "critical_reconcile" && replacementAvailable) {
    return "use_user_stream_order_truth_and_reduce_rest_sanity";
  }
  return restClass === "critical_reconcile" || restClass === "critical_execution"
    ? "allowed_for_safety_or_execution"
    : "allowed_with_budget_watch";
}

function buildRequestBudgetSlo(topCallers = [], pressureState = {}) {
  const groups = [
    {
      id: "public_depth",
      label: "Public depth REST",
      classes: ["public_market_depth"],
      hotWeight: 5000,
      action: "use_local_book_or_public_stream"
    },
    {
      id: "private_trade_history",
      label: "Private trade-history REST",
      classes: ["private_trade_history"],
      hotWeight: 2000,
      action: "use_user_stream_fills"
    },
    {
      id: "private_order_truth",
      label: "Private open-order REST",
      classes: ["critical_reconcile"],
      callerPattern: /openorders|open_orders|orderlist|order_lists|getorder/i,
      hotWeight: 6000,
      action: "use_user_stream_order_truth_and_reduce_rest_sanity"
    },
    {
      id: "public_klines_tickers",
      label: "Public kline/ticker REST",
      classes: ["public_market_snapshot"],
      hotWeight: 2500,
      action: "use_stream_klines_and_cached_tickers"
    }
  ];
  return groups.map((group) => {
    const callers = topCallers.filter((caller) =>
      group.classes.includes(caller.restClass) &&
      (!group.callerPattern || group.callerPattern.test(caller.caller || ""))
    );
    const weight = callers.reduce((total, caller) => total + safeNumber(caller.weight, 0), 0);
    const count = callers.reduce((total, caller) => total + safeNumber(caller.count, 0), 0);
    const streamReplacementAvailableForGroup = callers.some((caller) => caller.streamReplacementAvailable);
    const hot = weight >= group.hotWeight || callers.some((caller) => caller.hot);
    const guarded = callers.some((caller) => caller.guarded);
    const pressure = group.hotWeight > 0 ? weight / group.hotWeight : 0;
    const status = pressureState.banActive
      ? "paused"
      : guarded
        ? "guarded"
        : hot
          ? "hot"
          : pressure >= 0.65
            ? "watch"
            : "ready";
    return {
      id: group.id,
      label: group.label,
      status,
      count,
      weight,
      hotWeight: group.hotWeight,
      pressure: Number.isFinite(pressure) ? Number(pressure.toFixed(4)) : 0,
      hot,
      guarded,
      streamReplacementAvailable: streamReplacementAvailableForGroup,
      nextSafeAction: status === "ready" ? "none" : group.action,
      topCallers: callers.slice(0, 4).map((caller) => ({
        caller: caller.caller,
        count: caller.count,
        weight: caller.weight,
        guarded: caller.guarded,
        nextSafeAction: caller.nextSafeAction
      }))
    };
  });
}

export function evaluateRestBudgetAllowance({
  caller = "",
  priority = null,
  rateLimitState = {},
  config = {},
  streamPrimary = false
} = {}) {
  const restClass = classifyRestCaller(caller);
  const effectivePriority = priority || defaultPriorityForRestClass(restClass);
  const pressureState = getRequestWeightPressure(rateLimitState, config);
  const { pressure, banActive, backoffActive, warningActive } = pressureState;
  const callerStats = getCallerStats(rateLimitState, caller);
  const hotCallerThreshold = resolveHotCallerThreshold(restClass, config);
  const hotCallerActive = hotCallerThreshold > 0 && callerStats.weight >= hotCallerThreshold;

  if (banActive) {
    return {
      allow: false,
      reason: "request_weight_ban_active",
      restClass,
      priority: effectivePriority,
      ...pressureState
    };
  }
  if (streamPrimary && restClass === "public_market_depth" && hotCallerActive) {
    return {
      allow: false,
      reason: "hot_public_depth_rest_suppressed",
      restClass,
      priority: effectivePriority,
      callerStats,
      hotCallerThreshold,
      ...pressureState
    };
  }
  if (streamPrimary && restClass === "private_trade_history" && hotCallerActive) {
    return {
      allow: false,
      reason: "hot_private_trade_history_rest_suppressed",
      restClass,
      priority: effectivePriority,
      callerStats,
      hotCallerThreshold,
      ...pressureState
    };
  }
  if (backoffActive && effectivePriority !== "critical") {
    return {
      allow: false,
      reason: "request_weight_backoff_active",
      restClass,
      priority: effectivePriority,
      ...pressureState
    };
  }
  if (streamPrimary && ["low", "medium"].includes(effectivePriority) && (warningActive || pressure >= 0.75)) {
    return {
      allow: false,
      reason: "stream_primary_rest_suppressed",
      restClass,
      priority: effectivePriority,
      ...pressureState
    };
  }
  if (effectivePriority === "low" && (warningActive || pressure >= 0.65)) {
    return {
      allow: false,
      reason: "low_priority_rest_budget_guard",
      restClass,
      priority: effectivePriority,
      ...pressureState
    };
  }
  if (effectivePriority === "medium" && (warningActive || pressure >= 0.85)) {
    return {
      allow: false,
      reason: "medium_priority_rest_budget_guard",
      restClass,
      priority: effectivePriority,
      ...pressureState
    };
  }
  return {
    allow: true,
    reason: "allowed",
    restClass,
    priority: effectivePriority,
    callerStats,
    hotCallerThreshold,
    ...pressureState
  };
}

export function buildRestBudgetGovernorSummary({ rateLimitState = {}, config = {}, streamStatus = {} } = {}) {
  const pressureState = getRequestWeightPressure(rateLimitState, config);
  const topRestCallers = rateLimitState?.topRestCallers || {};
  const topCallers = Object.entries(topRestCallers)
    .map(([caller, value]) => {
      const restClass = classifyRestCaller(caller);
      const priority = defaultPriorityForRestClass(restClass);
      const hotCallerThreshold = resolveHotCallerThreshold(restClass, config);
      const weight = safeNumber(value?.weight, 0);
      const streamReplacement = streamReplacementAvailable(restClass, streamStatus, caller);
      const cacheRecommendation = cacheRecommendationForCaller(caller, restClass);
      const allowance = evaluateRestBudgetAllowance({
        caller,
        priority,
        rateLimitState,
        config,
        streamPrimary: streamReplacement || ["public_market_depth", "private_trade_history"].includes(restClass)
      });
      const cacheTelemetry = buildCacheTelemetry({ caller, value, cacheRecommendation, allowance });
      return {
        caller,
        count: safeNumber(value?.count, 0),
        weight,
        restClass,
        callerFamily: cacheRecommendation.cacheKey,
        cacheRecommendation,
        cacheTelemetry,
        cacheHitRatio: cacheTelemetry.cacheHitRatio,
        cacheMisses: cacheTelemetry.cacheMisses,
        coalescedCount: cacheTelemetry.coalescedCount,
        fallbackReason: cacheTelemetry.fallbackReason,
        telemetryStatus: cacheTelemetry.telemetryStatus,
        priority,
        hotCallerThreshold,
        hot: hotCallerThreshold > 0 ? weight >= hotCallerThreshold : weight >= 1000,
        guarded: !allowance.allow,
        streamReplacementAvailable: streamReplacement,
        nextSafeAction: nextSafeActionForCaller(restClass, allowance, streamReplacement),
        allowance
      };
    })
    .sort((left, right) => (right.weight - left.weight) || (right.count - left.count))
    .slice(0, 12);
  const budgetSlo = buildRequestBudgetSlo(topCallers, pressureState);
  const cacheTelemetry = topCallers.map((caller) => caller.cacheTelemetry);
  const publicStreamConnected = Boolean(streamStatus?.public?.connected ?? streamStatus?.publicStreamConnected ?? streamStatus?.connected);
  const userStreamConnected = Boolean(streamStatus?.userStreamConnected);
  const guardedCallers = topCallers
    .map((caller) => ({
      ...caller,
      allowance: caller.allowance || evaluateRestBudgetAllowance({
        caller: caller.caller,
        priority: caller.priority,
        rateLimitState,
        config,
        streamPrimary: caller.streamReplacementAvailable || ["public_market_depth", "private_trade_history"].includes(caller.restClass)
      })
    }))
    .filter((caller) => !caller.allowance.allow);
  const status = pressureState.banActive
    ? "paused_rate_limit_ban"
    : guardedCallers.length
      ? "guarding"
      : pressureState.pressure >= 0.65 || pressureState.warningActive
        ? "watch"
        : "ready";
  return {
    status,
    generatedAt: new Date().toISOString(),
    ...pressureState,
    publicStreamConnected,
    userStreamConnected,
    topCallers,
    cacheTelemetry,
    budgetSlo,
    guardedCallers: guardedCallers.slice(0, 8),
    recommendedActions: [
      topCallers.some((item) => item.restClass === "private_trade_history")
        ? "Gebruik user-data stream als primaire fill/order bron; myTrades blijft alleen sanity/reconcile fallback."
        : null,
      topCallers.some((item) => item.restClass === "public_market_depth")
        ? "Gebruik public stream/local book als primaire depth bron; REST depth blijft onder budget guard."
        : null,
      topCallers.some((item) => item.cacheRecommendation?.action === "reuse_exchange_info_cache")
        ? "Herbruik exchange-info cache en coalesce startup/symbol-rule calls."
        : null,
      topCallers.some((item) => item.cacheRecommendation?.action === "coalesce_universe_ticker_scan")
        ? "Coalesce universe ticker scans; voer ticker_24hr niet per scanner-loop opnieuw uit."
        : null,
      topCallers.some((item) => item.cacheRecommendation?.action === "cache_public_derivatives_context")
        ? "Cache futures-public context snapshots; gebruik ze alleen als read-only sanity lane naast stream/readmodel data."
        : null,
      guardedCallers.some((item) => item.allowance?.reason === "hot_public_depth_rest_suppressed")
        ? "Depth REST caller is historisch te heet; laat streams/local book eerst herstellen voordat fallback terugkomt."
        : null,
      guardedCallers.some((item) => item.allowance?.reason === "hot_private_trade_history_rest_suppressed")
        ? "Trade-history REST caller is historisch te heet; vertrouw user-data events en gebruik myTrades alleen gericht."
        : null,
      guardedCallers.length
        ? "Niet-kritieke REST callers worden onder pressure automatisch uitgesteld."
        : null
    ].filter(Boolean)
  };
}
