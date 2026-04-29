function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function average(values = [], fallback = 0) {
  const filtered = arr(values).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((total, value) => total + value, 0) / filtered.length : fallback;
}

function maxDrawdown(values = []) {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const value of values) {
    equity += Number(value || 0);
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak);
  }
  return Math.abs(maxDd);
}

function getSource(trade = {}) {
  return trade.brokerMode || trade.mode || trade.source || "unknown";
}

export function buildStrategyEvidenceScorecard({
  trades = [],
  source = "paper",
  strategyId = null,
  strategyFamily = null,
  regime = null,
  marketCondition = null,
  session = null,
  minSampleSize = 8
} = {}) {
  const scoped = arr(trades).filter((trade) => {
    if (!trade.exitAt && !trade.closedAt) return false;
    if (source && getSource(trade) !== source) return false;
    if (strategyId && (trade.strategyAtEntry || trade.strategyId) !== strategyId) return false;
    if (strategyFamily && (trade.strategyFamily || trade.setupFamily) !== strategyFamily) return false;
    if (regime && trade.regimeAtEntry !== regime) return false;
    if (marketCondition && (trade.marketConditionAtEntry || trade.conditionIdAtEntry) !== marketCondition) return false;
    if (session && trade.sessionAtEntry !== session) return false;
    return true;
  });
  const pnl = scoped.map((trade) => Number(trade.netPnlPct || 0));
  const wins = pnl.filter((value) => value > 0);
  const losses = pnl.filter((value) => value < 0);
  const grossWin = wins.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(losses.reduce((total, value) => total + value, 0));
  const sampleSize = scoped.length;
  const expectancyPct = average(pnl, 0);
  const avgMfePct = average(scoped.map((trade) => Number(trade.mfePct)), 0);
  const avgMaePct = average(scoped.map((trade) => Number(trade.maePct)), 0);
  const captureEfficiency = average(scoped.map((trade) => Number(trade.captureEfficiency)), 0);
  const executionDragBps = average(scoped.map((trade) => Number(trade.executionDragBps || trade.entryExecutionAttribution?.slippageDeltaBps)), 0);
  const badEntryRate = sampleSize ? scoped.filter((trade) => trade.autopsy?.primaryCause === "bad_entry" || trade.learningOutcome?.entryQuality === "weak").length / sampleSize : 0;
  const badExitRate = sampleSize ? scoped.filter((trade) => trade.autopsy?.primaryCause === "bad_exit" || ["late", "premature"].includes(trade.learningOutcome?.exitQuality)).length / sampleSize : 0;
  const confidence = Math.min(1, sampleSize / Math.max(minSampleSize * 2, 1));
  const recordQuality = average(scoped.map((trade) => Number(trade.recordQuality?.score || trade.recordQuality)), sampleSize ? 0.65 : 0);
  const status = sampleSize < minSampleSize
    ? "insufficient_sample"
    : expectancyPct > 0.004 && grossWin > grossLoss * 1.2
      ? "positive_edge"
      : expectancyPct > 0
        ? "weak_edge"
        : maxDrawdown(pnl) > 0.08 || expectancyPct < -0.004
          ? "dangerous"
          : "negative_edge";
  return {
    strategyId: strategyId || scoped[0]?.strategyAtEntry || scoped[0]?.strategyId || null,
    strategyFamily: strategyFamily || scoped[0]?.strategyFamily || scoped[0]?.setupFamily || null,
    regime: regime || scoped[0]?.regimeAtEntry || null,
    marketCondition: marketCondition || scoped[0]?.marketConditionAtEntry || scoped[0]?.conditionIdAtEntry || null,
    session: session || scoped[0]?.sessionAtEntry || null,
    source,
    sampleSize,
    winRate: num(sampleSize ? wins.length / sampleSize : 0, 4),
    avgWinPct: num(average(wins, 0), 4),
    avgLossPct: num(average(losses, 0), 4),
    profitFactor: num(grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0, 4),
    expectancyPct: num(expectancyPct, 4),
    maxDrawdownPct: num(maxDrawdown(pnl), 4),
    avgMfePct: num(avgMfePct, 4),
    avgMaePct: num(avgMaePct, 4),
    captureEfficiency: num(captureEfficiency, 4),
    executionDragBps: num(executionDragBps, 2),
    badEntryRate: num(badEntryRate, 4),
    badExitRate: num(badExitRate, 4),
    recordQuality: num(recordQuality, 4),
    confidence: num(confidence, 4),
    status
  };
}

export function buildStrategyEvidenceScorecards({
  trades = [],
  source = null,
  minSampleSize = 8
} = {}) {
  const groups = new Map();
  for (const trade of arr(trades)) {
    if (!trade.exitAt && !trade.closedAt) {
      continue;
    }
    const groupSource = getSource(trade);
    if (source && groupSource !== source) {
      continue;
    }
    const strategy = trade.strategyAtEntry || trade.strategy || {};
    const strategyId = typeof strategy === "object"
      ? strategy.strategy || strategy.id || trade.strategyId || trade.activeStrategy || "unknown"
      : strategy || trade.strategyId || "unknown";
    const strategyFamily = typeof strategy === "object"
      ? strategy.family || trade.strategyFamily || trade.setupFamily || "unknown"
      : trade.strategyFamily || trade.setupFamily || "unknown";
    const regime = trade.regimeAtEntry || trade.regime || "unknown";
    const marketCondition = trade.marketConditionAtEntry || trade.conditionIdAtEntry || "unknown";
    const session = trade.sessionAtEntry || trade.session || "unknown";
    const key = [groupSource, strategyId, strategyFamily, regime, marketCondition, session].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        source: groupSource,
        strategyId,
        strategyFamily,
        regime,
        marketCondition,
        session
      });
    }
  }
  return [...groups.values()].map((scope) => ({
    id: [
      scope.source,
      scope.strategyId,
      scope.strategyFamily,
      scope.regime,
      scope.marketCondition,
      scope.session
    ].join("|"),
    ...buildStrategyEvidenceScorecard({
      trades,
      ...scope,
      minSampleSize
    })
  }));
}
