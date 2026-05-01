function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  if (/placeorder|cancelorder|cancelreplace|oco|protective|emergency|flatten|submit|settle_terminal_order/.test(text)) {
    return "critical_execution";
  }
  if (/reconcile|openorders|open_orders|account_info|account|orderlist|order_lists|getorder/.test(text)) {
    return "critical_reconcile";
  }
  if (/mytrades|recent_trades|trade_history|settle_.*trades/.test(text)) {
    return "private_trade_history";
  }
  if (/depth|orderbook|book_ticker|bookticker/.test(text)) {
    return "public_market_depth";
  }
  if (/kline|ticker|market_snapshot|scanner|watchlist|exchange_info/.test(text)) {
    return "public_market_snapshot";
  }
  if (/dashboard|research|report|doctor|status/.test(text)) {
    return "operator_low_priority";
  }
  return "unknown";
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
      return "medium";
    case "operator_low_priority":
      return "low";
    default:
      return "medium";
  }
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

  if (banActive) {
    return {
      allow: false,
      reason: "request_weight_ban_active",
      restClass,
      priority: effectivePriority,
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
    ...pressureState
  };
}

export function buildRestBudgetGovernorSummary({ rateLimitState = {}, config = {}, streamStatus = {} } = {}) {
  const pressureState = getRequestWeightPressure(rateLimitState, config);
  const topRestCallers = rateLimitState?.topRestCallers || {};
  const topCallers = Object.entries(topRestCallers)
    .map(([caller, value]) => ({
      caller,
      count: safeNumber(value?.count, 0),
      weight: safeNumber(value?.weight, 0),
      restClass: classifyRestCaller(caller),
      priority: defaultPriorityForRestClass(classifyRestCaller(caller))
    }))
    .sort((left, right) => (right.weight - left.weight) || (right.count - left.count))
    .slice(0, 12);
  const publicStreamConnected = Boolean(streamStatus?.public?.connected ?? streamStatus?.publicStreamConnected ?? streamStatus?.connected);
  const userStreamConnected = Boolean(streamStatus?.userStreamConnected);
  const guardedCallers = topCallers
    .map((caller) => ({
      ...caller,
      allowance: evaluateRestBudgetAllowance({
        caller: caller.caller,
        priority: caller.priority,
        rateLimitState,
        config,
        streamPrimary: ["public_market_depth", "private_trade_history"].includes(caller.restClass)
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
    guardedCallers: guardedCallers.slice(0, 8),
    recommendedActions: [
      topCallers.some((item) => item.restClass === "private_trade_history")
        ? "Gebruik user-data stream als primaire fill/order bron; myTrades blijft alleen sanity/reconcile fallback."
        : null,
      topCallers.some((item) => item.restClass === "public_market_depth")
        ? "Gebruik public stream/local book als primaire depth bron; REST depth blijft onder budget guard."
        : null,
      guardedCallers.length
        ? "Niet-kritieke REST callers worden onder pressure automatisch uitgesteld."
        : null
    ].filter(Boolean)
  };
}
