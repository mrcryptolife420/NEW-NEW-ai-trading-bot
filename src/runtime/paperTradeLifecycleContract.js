const HARD_SAFETY_REASONS = new Set([
  "exchange_safety_blocked",
  "exchange_truth_freeze",
  "reconcile_required",
  "manual_review_required",
  "manual_review",
  "unresolved_execution_intent",
  "protective_order_missing",
  "protection_missing",
  "live_readiness_blocked"
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length))];
}

function tradeIdOf(trade = {}) {
  return trade.id || trade.tradeId || trade.positionId || null;
}

function findTradeRecord(records = [], trade = {}) {
  const tradeId = tradeIdOf(trade);
  const symbol = trade.symbol || null;
  return asArray(records).some((item = {}) => {
    if (tradeId && [item.id, item.tradeId, item.positionId].includes(tradeId)) {
      return true;
    }
    return Boolean(symbol && item.symbol === symbol && item.brokerMode === "paper");
  });
}

function hasTradeQuality(trade = {}, dashboardSnapshot = {}) {
  return [
    trade.maximumFavorableExcursionPct,
    trade.maximumAdverseExcursionPct,
    trade.exitEfficiencyPct,
    trade.gaveBackPct,
    dashboardSnapshot?.report?.tradeQualitySummary?.averageExitEfficiencyPct
  ].some((value) => Number.isFinite(Number(value)));
}

export function buildPaperTradeLifecycleEvidence({
  mode = "paper",
  candidate = null,
  decision = null,
  entryAttempt = null,
  openedPosition = null,
  trade = null,
  readmodelSummary = null,
  dashboardSnapshot = null,
  brokersInstantiated = [],
  expectedClosedTrade = false
} = {}) {
  const resolvedDecision = decision || candidate?.decision || {};
  const reasonCodes = unique([
    ...asArray(resolvedDecision.reasons),
    ...asArray(resolvedDecision.blockerReasons),
    ...asArray(resolvedDecision.riskVerdict?.rejections).map((item) => item?.code),
    ...asArray(entryAttempt?.blockedReasons),
    ...asArray(entryAttempt?.entryErrors).map((item) => item?.code || item?.error)
  ]);
  const brokerModes = unique([
    ...asArray(brokersInstantiated),
    openedPosition?.brokerMode,
    trade?.brokerMode,
    entryAttempt?.brokerMode
  ]);
  const executionReached = Boolean(openedPosition || trade || entryAttempt?.openedPosition || entryAttempt?.status === "executed");
  const hardSafetyBlocked = reasonCodes.some((reason) => HARD_SAFETY_REASONS.has(reason));
  const modelConfidenceBlocked = reasonCodes.includes("model_confidence_too_low");
  const readmodelTrades = [
    ...asArray(readmodelSummary?.paperTrades),
    ...asArray(readmodelSummary?.trades),
    ...asArray(readmodelSummary?.recentTrades)
  ];
  const dashboardTrades = [
    ...asArray(dashboardSnapshot?.report?.recentTrades),
    ...asArray(dashboardSnapshot?.recentTrades)
  ];
  const issues = [];

  if (mode === "live" && executionReached) {
    issues.push("live_execution_not_allowed_in_contract");
  }
  if (brokerModes.some((brokerMode) => /live/i.test(brokerMode))) {
    issues.push("live_broker_instantiated");
  }
  if (hardSafetyBlocked && executionReached) {
    issues.push("hard_safety_bypassed");
  }
  if (modelConfidenceBlocked && executionReached) {
    issues.push("model_confidence_bypassed");
  }
  if (expectedClosedTrade && !trade) {
    issues.push("closed_trade_missing");
  }
  if (trade && trade.brokerMode !== "paper") {
    issues.push("closed_trade_not_paper");
  }

  return {
    status: issues.length ? "failed" : "passed",
    mode,
    paperOnly: mode === "paper",
    issues,
    reasonCodes,
    hardSafetyBlocked,
    modelConfidenceBlocked,
    liveBrokerInstantiated: brokerModes.some((brokerMode) => /live/i.test(brokerMode)),
    stages: {
      candidateGenerated: Boolean(candidate?.symbol),
      riskAllowed: Boolean(resolvedDecision.allow || resolvedDecision.riskVerdict?.allowed),
      executionReached,
      paperPositionOpened: Boolean(openedPosition && openedPosition.brokerMode === "paper"),
      paperTradeClosed: Boolean(trade && trade.brokerMode === "paper"),
      readmodelLinked: Boolean(trade && findTradeRecord(readmodelTrades, trade)),
      dashboardLinked: Boolean(trade && findTradeRecord(dashboardTrades, trade)),
      tradeQualityUpdated: Boolean(trade && hasTradeQuality(trade, dashboardSnapshot))
    }
  };
}

export function assertPaperTradeLifecycleContract(input = {}) {
  const evidence = buildPaperTradeLifecycleEvidence(input);
  if (evidence.status !== "passed") {
    const error = new Error(`Paper trade lifecycle contract failed: ${evidence.issues.join(", ")}`);
    error.evidence = evidence;
    throw error;
  }
  return evidence;
}

