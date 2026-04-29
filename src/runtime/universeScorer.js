function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function average(values = [], fallback = 0) {
  const filtered = arr(values).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((total, value) => total + value, 0) / filtered.length : fallback;
}

function buildTradeStats(symbol, journal = {}, sessionId = null) {
  const trades = arr(journal?.trades || []).filter((trade) => trade?.symbol === symbol);
  const scopedTrades = sessionId
    ? trades.filter((trade) => (trade.sessionAtEntry || trade.entryRationale?.sessionSummary?.session || null) === sessionId)
    : trades;
  const sourceTrades = scopedTrades.length ? scopedTrades : trades;
  const expectancy = average(sourceTrades.map((trade) => safeNumber(trade.pnlPct, safeNumber(trade.pnlQuote, 0) / Math.max(1, safeNumber(trade.totalCost, 0)))), 0);
  const fillQuality = average(sourceTrades.map((trade) =>
    clamp(
      0.5 +
      Math.max(0, 2 - safeNumber(trade.entryExecutionAttribution?.realizedSpreadBps, 0)) * 0.08 -
      Math.max(0, safeNumber(trade.entryExecutionAttribution?.slippageDeltaBps, 0)) * 0.04,
      0,
      1
    )
  ), 0.5);
  return {
    tradeCount: sourceTrades.length,
    paperExpectancyScore: clamp(0.5 + expectancy * 6, 0, 1),
    fillQualityScore: fillQuality
  };
}

function buildDecisionStats(symbol, runtime = {}) {
  const all = [...arr(runtime?.latestDecisions || []), ...arr(runtime?.latestBlockedSetups || [])]
    .filter((decision) => decision?.symbol === symbol);
  const blocked = all.filter((decision) => decision?.allow === false || arr(decision?.reasons || []).length);
  return {
    blockerNoisePenalty: clamp(blocked.length / Math.max(1, all.length) * 0.35, 0, 0.35),
    strategyFitDensity: clamp(average(all.map((decision) => safeNumber(decision?.strategySummary?.fitScore, safeNumber(decision?.strategy?.fitScore, 0.5))), 0.5), 0, 1)
  };
}

function buildTelemetryStats(symbol, runtime = {}) {
  const direct = runtime?.universeTelemetry?.[symbol] || runtime?.scannerSnapshot?.symbolTelemetry?.[symbol] || {};
  return {
    spreadStabilityScore: clamp(safeNumber(direct.spreadStabilityScore, 0.5), 0, 1),
    sessionExecutionQuality: clamp(safeNumber(direct.sessionExecutionQuality, 0.5), 0, 1)
  };
}

export function scoreUniverseEntries({
  entries = [],
  runtime = {},
  journal = {},
  sessionId = null
} = {}) {
  return arr(entries)
    .map((entry, index) => {
      const symbol = entry?.symbol || null;
      const tradeStats = buildTradeStats(symbol, journal, sessionId);
      const decisionStats = buildDecisionStats(symbol, runtime);
      const telemetryStats = buildTelemetryStats(symbol, runtime);
      const score = clamp(
        0.36 +
        telemetryStats.spreadStabilityScore * 0.18 +
        tradeStats.fillQualityScore * 0.16 +
        tradeStats.paperExpectancyScore * 0.18 +
        decisionStats.strategyFitDensity * 0.12 +
        telemetryStats.sessionExecutionQuality * 0.08 -
        decisionStats.blockerNoisePenalty * 0.5,
        0,
        1.4
      );
      return {
        ...entry,
        universeScore: num(score, 4),
        universeScoreDrivers: {
          spreadStabilityScore: num(telemetryStats.spreadStabilityScore, 4),
          fillQualityScore: num(tradeStats.fillQualityScore, 4),
          blockerNoisePenalty: num(decisionStats.blockerNoisePenalty, 4),
          strategyFitDensity: num(decisionStats.strategyFitDensity, 4),
          paperExpectancyScore: num(tradeStats.paperExpectancyScore, 4),
          sessionExecutionQuality: num(telemetryStats.sessionExecutionQuality, 4),
          tradeCount: tradeStats.tradeCount
        },
        _originalIndex: index
      };
    })
    .sort((left, right) =>
      safeNumber(right.universeScore, 0) - safeNumber(left.universeScore, 0) ||
      safeNumber(left.marketCapRank, 9999) - safeNumber(right.marketCapRank, 9999) ||
      safeNumber(left._originalIndex, 0) - safeNumber(right._originalIndex, 0))
    .map(({ _originalIndex, ...entry }) => entry);
}
