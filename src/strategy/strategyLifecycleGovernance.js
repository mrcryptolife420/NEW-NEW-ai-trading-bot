function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalize(value, fallback = "unknown") {
  const text = `${value || ""}`.trim();
  return text || fallback;
}

function isRangeGridScope(scope = {}) {
  return normalize(scope.strategyFamily || scope.family || "").includes("range_grid")
    || normalize(scope.strategyId || scope.strategy || scope.activeStrategy || "").includes("range_grid");
}

export function classifyStrategyLifecycleStatus(card = {}, { minQuarantineSample = 7, minDegradeSample = 4 } = {}) {
  const sampleSize = safeNumber(card.sampleSize, 0);
  const confidence = safeNumber(card.confidence, 0);
  const expectancyPct = safeNumber(card.expectancyPct, 0);
  const status = normalize(card.status, "insufficient_sample");
  const highEvidence = sampleSize >= minQuarantineSample || confidence >= 0.65;
  if (["dangerous"].includes(status) && highEvidence) {
    return "paper_quarantined";
  }
  if (status === "negative_edge" && sampleSize >= minQuarantineSample && expectancyPct <= -0.0015) {
    return "paper_quarantined";
  }
  if (["dangerous", "negative_edge"].includes(status) && sampleSize >= minDegradeSample) {
    return "paper_degraded";
  }
  if (status === "positive_edge") {
    return "active";
  }
  return sampleSize ? "shadow_only" : "insufficient_evidence";
}

export function buildStrategyLifecycleGovernance(scorecards = [], options = {}) {
  const contexts = arr(scorecards)
    .filter(isRangeGridScope)
    .map((card) => {
      const lifecycleStatus = classifyStrategyLifecycleStatus(card, options);
      return {
        strategyId: card.strategyId || "range_grid_reversion",
        strategyFamily: card.strategyFamily || "range_grid",
        regime: card.regime || "unknown",
        marketCondition: card.marketCondition || "unknown",
        session: card.session || "unknown",
        source: card.source || "paper",
        sampleSize: safeNumber(card.sampleSize, 0),
        expectancyPct: safeNumber(card.expectancyPct, 0),
        confidence: safeNumber(card.confidence, 0),
        scorecardStatus: card.status || "unknown",
        lifecycleStatus,
        liveImpact: "none",
        allowedLane: lifecycleStatus === "paper_quarantined" ? "shadow_only" : lifecycleStatus === "paper_degraded" ? "reduced_paper" : "normal"
      };
    });
  return {
    status: contexts.some((item) => item.lifecycleStatus === "paper_quarantined")
      ? "paper_quarantine_active"
      : contexts.some((item) => item.lifecycleStatus === "paper_degraded")
        ? "paper_degraded"
        : contexts.length
          ? "observe"
          : "insufficient_evidence",
    contexts,
    quarantined: contexts.filter((item) => item.lifecycleStatus === "paper_quarantined"),
    degraded: contexts.filter((item) => item.lifecycleStatus === "paper_degraded"),
    shadowOnly: contexts.filter((item) => item.lifecycleStatus === "shadow_only")
  };
}

function tradeMatchesScope(trade = {}, scope = {}) {
  const strategy = trade.strategyAtEntry || trade.strategy || {};
  const tradeStrategyId = typeof strategy === "object"
    ? strategy.strategy || strategy.id || trade.strategyId || trade.activeStrategy
    : strategy || trade.strategyId;
  const tradeFamily = typeof strategy === "object"
    ? strategy.family || trade.strategyFamily || trade.setupFamily
    : trade.strategyFamily || trade.setupFamily;
  return normalize(tradeFamily) === normalize(scope.strategyFamily || scope.family)
    && normalize(tradeStrategyId) === normalize(scope.strategyId || scope.activeStrategy || scope.strategy)
    && normalize(trade.regimeAtEntry || trade.regime) === normalize(scope.regime)
    && normalize(trade.sessionAtEntry || trade.session) === normalize(scope.session);
}

export function resolveRangeGridLifecycleFromTrades({ trades = [], scope = {}, source = "paper" } = {}) {
  if (!isRangeGridScope(scope)) {
    return { lifecycleStatus: "active", sampleSize: 0, reason: "not_range_grid" };
  }
  const closed = arr(trades).filter((trade) => (trade.exitAt || trade.closedAt) && (trade.brokerMode || trade.mode || trade.source || "unknown") === source && tradeMatchesScope(trade, scope));
  const pnl = closed.map((trade) => safeNumber(trade.netPnlPct, 0));
  const sampleSize = closed.length;
  const expectancyPct = sampleSize ? pnl.reduce((total, value) => total + value, 0) / sampleSize : 0;
  const losses = pnl.filter((value) => value < 0).length;
  const status = sampleSize < 4
    ? "insufficient_sample"
    : expectancyPct <= -0.004 && sampleSize >= 7
      ? "dangerous"
      : expectancyPct < 0
        ? "negative_edge"
        : "observe";
  const lifecycleStatus = classifyStrategyLifecycleStatus({ sampleSize, expectancyPct, status, confidence: Math.min(1, sampleSize / 10) });
  return {
    lifecycleStatus,
    sampleSize,
    expectancyPct,
    lossRate: sampleSize ? losses / sampleSize : 0,
    reason: lifecycleStatus === "paper_quarantined"
      ? "range_grid_negative_expectancy_with_sufficient_evidence"
      : lifecycleStatus === "paper_degraded"
        ? "range_grid_negative_evidence_needs_more_samples"
        : "range_grid_evidence_not_binding"
  };
}
