function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(safeNumber(value, min), min), max);
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function resolveSetupIdentity({ entryRationale = {}, decision = {}, strategySummary = {}, position = {} } = {}) {
  const strategyId =
    position.strategyAtEntry ||
    strategySummary.activeStrategy ||
    decision.strategySummary?.activeStrategy ||
    entryRationale.strategy?.activeStrategy ||
    null;
  const setupFamily =
    position.strategyFamily ||
    strategySummary.family ||
    decision.strategySummary?.family ||
    entryRationale.strategy?.family ||
    null;
  const conditionId =
    position.marketConditionAtEntry ||
    position.conditionIdAtEntry ||
    entryRationale.marketCondition?.conditionId ||
    decision.entryDiagnostics?.marketCondition?.id ||
    null;
  const explicitSetupId =
    position.setupId ||
    entryRationale.setupId ||
    decision.setupId ||
    null;
  const setupId = explicitSetupId || [strategyId || "unknown_strategy", conditionId || "unknown_condition"].join("::");
  return {
    setupId,
    setupIdSource: explicitSetupId ? "explicit" : "composed_strategy_condition",
    setupFamily,
    conditionIdAtEntry: conditionId
  };
}

function classifySpreadRegime(spreadBps = Number.NaN) {
  if (!Number.isFinite(spreadBps)) {
    return "unknown";
  }
  if (spreadBps <= 1) {
    return "tight";
  }
  if (spreadBps <= 4) {
    return "normal";
  }
  if (spreadBps <= 12) {
    return "wide";
  }
  return "stressed";
}

function classifyOrderBookQuality(depthConfidence = Number.NaN, spreadBps = Number.NaN) {
  if (!Number.isFinite(depthConfidence) && !Number.isFinite(spreadBps)) {
    return "unknown";
  }
  if (safeNumber(depthConfidence, 0) >= 0.8 && safeNumber(spreadBps, 99) <= 1) {
    return "institutional";
  }
  if (safeNumber(depthConfidence, 0) >= 0.55 && safeNumber(spreadBps, 99) <= 4) {
    return "healthy";
  }
  if (safeNumber(depthConfidence, 0) >= 0.3 && safeNumber(spreadBps, 99) <= 12) {
    return "thin";
  }
  return "fragile";
}

export function buildLiquidityContextAtEntry({ entryRationale = {}, marketSnapshot = {}, entrySpreadBps = Number.NaN } = {}) {
  const orderBook = entryRationale.orderBook || {};
  const spreadBps = safeNumber(
    entryRationale.spreadBps,
    safeNumber(orderBook.spreadBps, safeNumber(entrySpreadBps, safeNumber(marketSnapshot?.book?.spreadBps, Number.NaN)))
  );
  const depthConfidence = safeNumber(
    orderBook.depthConfidence,
    safeNumber(marketSnapshot?.book?.depthConfidence, Number.NaN)
  );
  const queueImbalance = safeNumber(orderBook.queueImbalance, Number.NaN);
  return {
    spreadBps: Number.isFinite(spreadBps) ? num(spreadBps, 3) : null,
    depthConfidence: Number.isFinite(depthConfidence) ? num(depthConfidence) : null,
    queueImbalance: Number.isFinite(queueImbalance) ? num(queueImbalance) : null,
    spreadRegime: classifySpreadRegime(spreadBps),
    orderBookQualityBucket: classifyOrderBookQuality(depthConfidence, spreadBps)
  };
}

export function buildPortfolioOverlapAtEntry({ entryRationale = {}, decision = {}, position = {} } = {}) {
  const portfolio =
    position.portfolioOverlapAtEntry ||
    entryRationale.portfolio ||
    entryRationale.portfolioSummary ||
    decision.portfolioSummary ||
    {};
  const correlations = arr(portfolio.correlations || [])
    .slice(0, 4)
    .map((item) => ({
      symbol: item?.symbol || null,
      correlation: num(item?.correlation || 0, 4)
    }));
  return {
    sameClusterCount: safeNumber(portfolio.sameClusterCount, 0),
    sameSectorCount: safeNumber(portfolio.sameSectorCount, 0),
    sameFamilyCount: safeNumber(portfolio.sameFamilyCount, 0),
    sameRegimeCount: safeNumber(portfolio.sameRegimeCount, 0),
    sameStrategyCount: safeNumber(portfolio.sameStrategyCount, 0),
    maxCorrelation: num(portfolio.maxCorrelation || 0, 4),
    sizeMultiplier: num(portfolio.sizeMultiplier || 1, 4),
    reasons: arr(portfolio.reasons || []).slice(0, 6),
    hardReasons: arr(portfolio.hardReasons || []).slice(0, 6),
    correlations
  };
}

function resolveShockBucket(score = 0) {
  if (score >= 0.35) {
    return "shock";
  }
  if (score >= 0.18) {
    return "elevated";
  }
  if (score > 0) {
    return "watch";
  }
  return "calm";
}

export function buildEventShockContext({ newsSummary = {}, exchangeSummary = {}, calendarSummary = {}, marketStructureSummary = {}, dominantEventType = null } = {}) {
  const newsRisk = safeNumber(newsSummary.riskScore, 0);
  const announcementRisk = safeNumber(exchangeSummary.riskScore, 0);
  const calendarRisk = safeNumber(calendarSummary.riskScore, 0);
  const structureRisk = safeNumber(marketStructureSummary.riskScore, 0);
  const shockScore = Math.max(newsRisk, announcementRisk, calendarRisk, structureRisk);
  return {
    newsRisk: num(newsRisk),
    newsSentiment: num(newsSummary.sentimentScore || 0),
    newsCoverage: safeNumber(newsSummary.coverage, 0),
    announcementRisk: num(announcementRisk),
    announcementSentiment: num(exchangeSummary.sentimentScore || 0),
    announcementCoverage: safeNumber(exchangeSummary.coverage, 0),
    calendarRisk: num(calendarRisk),
    marketStructureRisk: num(structureRisk),
    dominantEventType:
      dominantEventType ||
      newsSummary.dominantEventType ||
      exchangeSummary.dominantEventType ||
      "general",
    shockScore: num(shockScore),
    shockBucket: resolveShockBucket(shockScore)
  };
}

export function buildStopPlanAtEntry({ entryPrice = 0, stopLossPrice = 0, takeProfitPrice = 0, trailingStopPct = 0, scaleOutTriggerPrice = 0, scaleOutFraction = 0 } = {}) {
  const base = Math.max(safeNumber(entryPrice, 0), 1e-9);
  const plannedStopDistancePct = stopLossPrice > 0 ? Math.max(0, (base - stopLossPrice) / base) : 0;
  const plannedTakeProfitDistancePct = takeProfitPrice > 0 ? Math.max(0, (takeProfitPrice - base) / base) : 0;
  const scaleOutTriggerPct = scaleOutTriggerPrice > 0 ? Math.max(0, (scaleOutTriggerPrice - base) / base) : 0;
  return {
    stopLossPrice: num(stopLossPrice, 6),
    takeProfitPrice: num(takeProfitPrice, 6),
    trailingStopPct: num(trailingStopPct),
    plannedStopDistancePct: num(plannedStopDistancePct),
    plannedTakeProfitDistancePct: num(plannedTakeProfitDistancePct),
    scaleOutTriggerPct: num(scaleOutTriggerPct),
    scaleOutFraction: num(scaleOutFraction)
  };
}

export function buildExitDiagnostics({
  position = {},
  exitPrice = 0,
  reason = null,
  exitSource = null,
  netPnlPct = 0,
  mfePct = 0,
  maePct = 0
} = {}) {
  const stopPlan = position.stopPlanAtEntry || buildStopPlanAtEntry(position);
  const entryPrice = Math.max(safeNumber(position.entryPrice, 0), 1e-9);
  const exitMovePct = exitPrice > 0 ? (exitPrice - entryPrice) / entryPrice : 0;
  const stopDistancePct = safeNumber(stopPlan.plannedStopDistancePct, 0);
  const takeProfitDistancePct = safeNumber(stopPlan.plannedTakeProfitDistancePct, 0);
  const lossPctAbs = Math.abs(Math.min(safeNumber(netPnlPct, 0), 0));
  const gainPct = Math.max(safeNumber(netPnlPct, 0), 0);
  return {
    reason: reason || null,
    exitSource: exitSource || null,
    exitMovePct: num(exitMovePct),
    stopDistancePct: num(stopDistancePct),
    takeProfitDistancePct: num(takeProfitDistancePct),
    stopDistanceUtilization: stopDistancePct > 0 ? num(lossPctAbs / stopDistancePct) : null,
    takeProfitUtilization: takeProfitDistancePct > 0 ? num(gainPct / takeProfitDistancePct) : null,
    mfeCaptureRatio: safeNumber(mfePct, 0) > 0 ? num(gainPct / Math.max(safeNumber(mfePct, 0), 1e-9)) : null,
    maeVsStopRatio: stopDistancePct > 0 ? num(Math.abs(Math.min(safeNumber(maePct, 0), 0)) / stopDistancePct) : null,
    closedByStop: ["stop_loss", "protective_stop", "protective_stop_loss", "trailing_stop"].includes(reason || ""),
    closedByTakeProfit: ["take_profit", "protective_take_profit", "grid_take_profit"].includes(reason || ""),
    lifecycleImpacted: Boolean(position.reconcileRequired || position.manualReviewRequired || `${exitSource || ""}`.includes("reconcile"))
  };
}

export function buildLifecycleOutcome({ position = {}, reason = null, exitSource = null } = {}) {
  const issueReason =
    position.reconcileReason ||
    position.lastAutoReconcileError ||
    position.lastManagementError ||
    null;
  const issueType = position.manualReviewRequired
    ? "manual_review"
    : position.reconcileRequired
      ? "reconcile_required"
      : issueReason
        ? "managed_warning"
        : null;
  return {
    operatorMode: position.operatorMode || "normal",
    lifecycleState: position.lifecycleState || null,
    manualReviewRequired: Boolean(position.manualReviewRequired),
    reconcileRequired: Boolean(position.reconcileRequired),
    protectiveOrderStatus: position.protectiveOrderStatus || null,
    autoReconcileDecision: position.autoReconcileDecision || null,
    reconcileReason: position.reconcileReason || null,
    lastAutoReconcileAction: position.lastAutoReconcileAction || null,
    hadLifecycleIssue: Boolean(issueType),
    issueType,
    issueReason,
    closedViaProtection:
      `${exitSource || ""}`.includes("protective") ||
      ["protective_stop", "protective_stop_loss", "protective_take_profit"].includes(reason || "")
  };
}
