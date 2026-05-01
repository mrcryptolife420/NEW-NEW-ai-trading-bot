function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, safeNumber(value, min)));
}

function average(values = []) {
  const valid = values.map((value) => safeNumber(value, Number.NaN)).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function resolveCaptureEfficiency(trade = {}) {
  const mfePct = safeNumber(trade.mfePct, 0);
  const explicit = safeNumber(trade.captureEfficiency, Number.NaN);
  if (Number.isFinite(explicit)) return explicit;
  return mfePct > 0 ? Math.max(0, safeNumber(trade.netPnlPct, 0)) / Math.max(mfePct, 1e-9) : 0;
}

function resolveSlippageDeltaBps(trade = {}) {
  const entry = safeNumber(trade.entryExecutionAttribution?.slippageDeltaBps, Number.NaN);
  const exit = safeNumber(trade.exitExecutionAttribution?.slippageDeltaBps, Number.NaN);
  const direct = safeNumber(trade.slippageDeltaBps, Number.NaN);
  const values = [entry, exit, direct].filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function classifyTradeAutopsy(trade = {}) {
  const netPnlPct = safeNumber(trade.netPnlPct, 0);
  const mfePct = safeNumber(trade.mfePct, 0);
  const maePct = safeNumber(trade.maePct, 0);
  const captureEfficiency = resolveCaptureEfficiency(trade);
  const executionQualityScore = safeNumber(trade.executionQualityScore ?? trade.entryExecutionAttribution?.executionQualityScore, 0.7);
  const exitReason = `${trade.reason || trade.exitReason || ""}`.toLowerCase();
  const labels = new Set(Array.isArray(trade.reviewLabels) ? trade.reviewLabels : []);
  const causes = [];
  if (labels.has("bad_entry")) causes.push("bad_entry");
  if (labels.has("bad_exit")) causes.push("bad_exit");
  if (labels.has("execution_drag")) causes.push("execution_drag");
  if (executionQualityScore < 0.42 && netPnlPct <= 0) causes.push("execution_drag");
  if (mfePct >= 0.015 && netPnlPct < 0) causes.push("late_exit");
  if (netPnlPct >= 0 && mfePct >= 0.018 && captureEfficiency < 0.32) causes.push("premature_exit");
  if (mfePct < 0.004 && maePct <= -0.012 && netPnlPct < 0) causes.push("bad_entry");
  if (exitReason.includes("regime") || exitReason.includes("invalid")) causes.push("strategy_invalidated");
  if (trade.dataQuality?.stale || trade.recordQuality?.score < 0.45) causes.push("data_quality_failure");
  if (trade.positionSizePct > 0.2 && netPnlPct < 0) causes.push("risk_sizing_failure");
  const uniqueCauses = [...new Set(causes)];
  const classification = netPnlPct > 0 && !uniqueCauses.length
    ? "good_trade"
    : uniqueCauses[0] || "bad_entry";
  return {
    classification,
    primaryCause: classification === "good_trade" ? null : classification,
    causes: uniqueCauses,
    warnings: netPnlPct > 0 && captureEfficiency < 0.35 ? ["low_capture_efficiency"] : [],
    suggestedAction: classification === "good_trade"
      ? "keep_observing"
      : classification === "execution_drag"
        ? "review_execution_quality"
        : classification === "late_exit" || classification === "premature_exit"
          ? "review_exit_policy"
          : classification === "data_quality_failure"
            ? "review_data_sources"
            : "review_entry_filter"
  };
}

export function summarizeTradeAutopsies(trades = [], limit = 8) {
  const closed = (Array.isArray(trades) ? trades : []).filter((trade) => trade.exitAt || trade.closedAt);
  const annotated = closed.map((trade) => ({ trade, autopsy: classifyTradeAutopsy(trade) }));
  const lossCauses = new Map();
  for (const item of annotated) {
    if (safeNumber(item.trade.netPnlPct, 0) >= 0) continue;
    const key = item.autopsy.classification;
    lossCauses.set(key, (lossCauses.get(key) || 0) + 1);
  }
  const dominantLossCause = [...lossCauses.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
  return {
    worstRecentTrades: annotated
      .sort((left, right) => safeNumber(left.trade.netPnlPct, 0) - safeNumber(right.trade.netPnlPct, 0))
      .slice(0, limit)
      .map((item) => ({
        id: item.trade.id || null,
        symbol: item.trade.symbol || null,
        netPnlPct: safeNumber(item.trade.netPnlPct, 0),
        classification: item.autopsy.classification,
        suggestedAction: item.autopsy.suggestedAction
      })),
    dominantLossCause,
    repeatedStrategyFailurePattern: dominantLossCause && (lossCauses.get(dominantLossCause) || 0) >= 3
      ? dominantLossCause
      : null
  };
}

function summarizeClosedTradeForReview(trade = {}, extra = {}) {
  return {
    id: trade.id || null,
    symbol: trade.symbol || null,
    strategy: trade.strategyAtEntry || trade.entryRationale?.strategy?.activeStrategy || null,
    strategyFamily: trade.strategyFamily || trade.strategyAtEntry?.family || trade.entryRationale?.strategy?.family || null,
    regime: trade.regimeAtEntry || trade.entryRationale?.regimeSummary?.regime || null,
    session: trade.sessionAtEntry || trade.entryRationale?.session?.session || null,
    netPnlPct: safeNumber(trade.netPnlPct, 0),
    pnlQuote: safeNumber(trade.pnlQuote, 0),
    mfePct: safeNumber(trade.mfePct, 0),
    maePct: safeNumber(trade.maePct, 0),
    captureEfficiency: resolveCaptureEfficiency(trade),
    executionQualityScore: safeNumber(trade.executionQualityScore ?? trade.entryExecutionAttribution?.executionQualityScore, 0.7),
    slippageDeltaBps: resolveSlippageDeltaBps(trade),
    exitReason: trade.reason || trade.exitReason || null,
    ...extra
  };
}

export function buildExitRegretReview(trades = [], { limit = 8 } = {}) {
  const closed = (Array.isArray(trades) ? trades : []).filter((trade) => trade.exitAt || trade.closedAt);
  if (!closed.length) {
    return {
      status: "insufficient_sample",
      tradeCount: 0,
      avoidableLossCount: 0,
      lateExitCount: 0,
      prematureExitCount: 0,
      executionRegretCount: 0,
      averageMfePct: 0,
      averageMaePct: 0,
      averageCaptureEfficiency: 0,
      dominantExitIssue: null,
      biggestAvoidableLosses: [],
      lateExitCandidates: [],
      prematureExitWarnings: [],
      executionRegretExits: [],
      suggestedAction: "Collect more closed trades before changing exit behavior."
    };
  }

  const annotated = closed.map((trade) => {
    const netPnlPct = safeNumber(trade.netPnlPct, 0);
    const mfePct = safeNumber(trade.mfePct, 0);
    const maePct = safeNumber(trade.maePct, 0);
    const captureEfficiency = resolveCaptureEfficiency(trade);
    const executionQualityScore = safeNumber(trade.executionQualityScore ?? trade.entryExecutionAttribution?.executionQualityScore, 0.7);
    const slippageDeltaBps = resolveSlippageDeltaBps(trade);
    const lateExit = mfePct >= 0.012 && (netPnlPct <= 0 || captureEfficiency < 0.2);
    const prematureExit = netPnlPct > 0 && mfePct >= 0.018 && captureEfficiency < 0.35;
    const executionRegret = (executionQualityScore < 0.45 || slippageDeltaBps >= 5) && netPnlPct <= 0;
    const avoidableLoss = netPnlPct < 0 && (lateExit || executionRegret || (mfePct >= 0.008 && captureEfficiency < 0.15));
    const issues = [
      lateExit ? "late_exit" : null,
      prematureExit ? "premature_exit" : null,
      executionRegret ? "execution_regret" : null,
      avoidableLoss ? "avoidable_loss" : null
    ].filter(Boolean);
    return {
      trade,
      netPnlPct,
      mfePct,
      maePct,
      captureEfficiency,
      executionQualityScore,
      slippageDeltaBps,
      lateExit,
      prematureExit,
      executionRegret,
      avoidableLoss,
      issues
    };
  });

  const issueCounts = new Map();
  for (const item of annotated) {
    for (const issue of item.issues) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
    }
  }
  const dominantExitIssue = [...issueCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
  const avoidableLosses = annotated.filter((item) => item.avoidableLoss);
  const lateExits = annotated.filter((item) => item.lateExit);
  const prematureExits = annotated.filter((item) => item.prematureExit);
  const executionRegrets = annotated.filter((item) => item.executionRegret);
  const status = avoidableLosses.length >= 3 || lateExits.length >= 3 || executionRegrets.length >= 3
    ? "review_required"
    : closed.length < 5
      ? "insufficient_sample"
      : "monitor";

  return {
    status,
    tradeCount: closed.length,
    avoidableLossCount: avoidableLosses.length,
    lateExitCount: lateExits.length,
    prematureExitCount: prematureExits.length,
    executionRegretCount: executionRegrets.length,
    averageMfePct: average(annotated.map((item) => item.mfePct)),
    averageMaePct: average(annotated.map((item) => item.maePct)),
    averageCaptureEfficiency: average(annotated.map((item) => item.captureEfficiency)),
    dominantExitIssue,
    biggestAvoidableLosses: avoidableLosses
      .sort((left, right) => left.netPnlPct - right.netPnlPct)
      .slice(0, limit)
      .map((item) => summarizeClosedTradeForReview(item.trade, { issues: item.issues })),
    lateExitCandidates: lateExits
      .sort((left, right) => right.mfePct - left.mfePct || left.netPnlPct - right.netPnlPct)
      .slice(0, limit)
      .map((item) => summarizeClosedTradeForReview(item.trade, { issues: item.issues })),
    prematureExitWarnings: prematureExits
      .sort((left, right) => right.mfePct - left.mfePct)
      .slice(0, limit)
      .map((item) => summarizeClosedTradeForReview(item.trade, { issues: item.issues })),
    executionRegretExits: executionRegrets
      .sort((left, right) => right.slippageDeltaBps - left.slippageDeltaBps)
      .slice(0, limit)
      .map((item) => summarizeClosedTradeForReview(item.trade, { issues: item.issues })),
    suggestedAction: status === "review_required"
      ? "Review late exits, capture efficiency and execution drag before increasing allocation or adding entry relief."
      : "Keep monitoring exit regret; no behavior change is recommended from this sample alone."
  };
}

function resolveCurrentPrice(position = {}) {
  return safeNumber(
    position.currentPrice ?? position.markPrice ?? position.lastPrice ?? position.lastMarkPrice ?? position.entryRationale?.marketSnapshot?.lastPrice,
    safeNumber(position.entryPrice, 0)
  );
}

export function scoreOpenPositionExitDiagnostics(position = {}, { nowMs = Date.now(), maxHoldMinutes = 360 } = {}) {
  const entryPrice = safeNumber(position.entryPrice, 0);
  const currentPrice = resolveCurrentPrice(position);
  const quantity = safeNumber(position.quantity, 0);
  const notional = safeNumber(position.notional, quantity * currentPrice);
  const unrealizedPnlPct = entryPrice > 0 ? (currentPrice - entryPrice) / entryPrice : 0;
  const mfePct = safeNumber(position.mfePct ?? position.maxFavorableExcursionPct, Math.max(0, unrealizedPnlPct));
  const maePct = safeNumber(position.maePct ?? position.maxAdverseExcursionPct, Math.min(0, unrealizedPnlPct));
  const captureEfficiency = mfePct > 0 ? clamp(Math.max(0, unrealizedPnlPct) / Math.max(mfePct, 1e-9), 0, 2) : 0;
  const entryAtMs = position.entryAt ? new Date(position.entryAt).getTime() : Number.NaN;
  const holdMinutes = Number.isFinite(entryAtMs) ? Math.max(0, (nowMs - entryAtMs) / 60_000) : 0;
  const strategyFamily = position.strategyFamily || position.strategyAtEntry?.family || position.entryRationale?.strategy?.family || "unknown";
  const regime = position.currentRegime || position.regime || position.regimeAtEntry || position.entryRationale?.regimeSummary?.regime || "unknown";
  const entryRegime = position.regimeAtEntry || position.entryRationale?.regimeSummary?.regime || regime;
  const executionQualityScore = safeNumber(position.executionQualityScore ?? position.entryExecutionAttribution?.executionQualityScore, 0.7);
  const orderbookDeterioration = clamp(position.orderbookDeteriorationScore ?? position.orderbookDeterioration ?? 0, 0, 1);
  const regimeTransition = Boolean(position.regimeTransition || (entryRegime !== "unknown" && regime !== "unknown" && entryRegime !== regime));

  const invalidationScore = clamp(
    (unrealizedPnlPct <= -0.01 ? 0.35 : 0) +
    (maePct <= -0.018 ? 0.25 : 0) +
    (regimeTransition ? 0.2 : 0) +
    (position.strategyInvalidated ? 0.35 : 0) +
    orderbookDeterioration * 0.25
  );
  const profitProtectionScore = clamp(
    (mfePct >= 0.012 ? 0.3 : 0) +
    (captureEfficiency < 0.35 && mfePct >= 0.012 ? 0.35 : 0) +
    (unrealizedPnlPct > 0.004 ? 0.15 : 0)
  );
  const drawdownRiskScore = clamp(
    (unrealizedPnlPct <= -0.012 ? 0.35 : 0) +
    (maePct <= -0.02 ? 0.3 : 0) +
    orderbookDeterioration * 0.2
  );
  const timeDecayScore = clamp(holdMinutes / Math.max(1, maxHoldMinutes) - 0.65);
  const rangeBreakScore = clamp(
    (strategyFamily === "range_grid" && !["range", "quiet_range", "mean_reversion"].includes(`${regime}`) ? 0.45 : 0) +
    (position.rangeBreakDetected ? 0.4 : 0) +
    (regimeTransition && strategyFamily === "range_grid" ? 0.2 : 0)
  );
  const executionRegretScore = clamp(
    (executionQualityScore < 0.45 ? 0.4 : 0) +
    orderbookDeterioration * 0.35 +
    (safeNumber(position.executionPainScore, 0) > 0.65 ? 0.25 : 0)
  );
  const continuationScore = clamp(
    (unrealizedPnlPct > 0 ? 0.3 : 0) +
    (captureEfficiency >= 0.45 ? 0.25 : 0) +
    (invalidationScore < 0.25 ? 0.2 : 0) +
    (executionRegretScore < 0.25 ? 0.1 : 0) -
    rangeBreakScore * 0.35
  );

  let suggestedAction = "hold";
  if (position.manualReviewRequired || position.reconcileRequired) {
    suggestedAction = "exit_review";
  } else if (invalidationScore >= 0.75 || drawdownRiskScore >= 0.75 || rangeBreakScore >= 0.75) {
    suggestedAction = "exit_now_candidate";
  } else if (profitProtectionScore >= 0.65 && continuationScore < 0.55) {
    suggestedAction = "trim";
  } else if (profitProtectionScore >= 0.45 || invalidationScore >= 0.45 || timeDecayScore >= 0.5) {
    suggestedAction = "tighten_stop";
  }

  return {
    id: position.id || null,
    symbol: position.symbol || null,
    strategyFamily,
    regime,
    entryRegime,
    notional,
    unrealizedPnlPct,
    mfePct,
    maePct,
    captureEfficiency,
    holdMinutes,
    continuationScore,
    invalidationScore,
    profitProtectionScore,
    drawdownRiskScore,
    timeDecayScore,
    rangeBreakScore,
    executionRegretScore,
    suggestedAction
  };
}

export function buildOpenPositionExitReview(openPositions = [], options = {}) {
  const positions = (Array.isArray(openPositions) ? openPositions : [])
    .map((position) => scoreOpenPositionExitDiagnostics(position, options))
    .sort((left, right) =>
      right.invalidationScore + right.drawdownRiskScore + right.rangeBreakScore + right.executionRegretScore -
      (left.invalidationScore + left.drawdownRiskScore + left.rangeBreakScore + left.executionRegretScore)
    );
  const actionCounts = positions.reduce((counts, position) => {
    counts[position.suggestedAction] = (counts[position.suggestedAction] || 0) + 1;
    return counts;
  }, {});
  const dominantAction = Object.entries(actionCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
  return {
    status: positions.length ? "ready" : "empty",
    positionCount: positions.length,
    actionCounts,
    dominantAction,
    highestRiskPosition: positions[0] || null,
    positions,
    suggestedAction: dominantAction === "exit_now_candidate" || dominantAction === "exit_review"
      ? "Review highest-risk open position before allowing new allocation."
      : dominantAction === "trim" || dominantAction === "tighten_stop"
        ? "Review profit protection and stop posture for open positions."
        : "No open-position exit action is suggested from diagnostics alone."
  };
}
