import { estimateRiskOfRuin } from "../runtime/riskOfRuinSimulator.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, num(value, min)));
}

function finite(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function tradeReturn(trade = {}) {
  const direct = trade.netPnlPct ?? trade.pnlPct ?? trade.returnPct ?? trade.rMultiple;
  if (Number.isFinite(Number(direct))) {
    const parsed = Number(direct);
    return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
  }
  const pnl = num(trade.netPnlQuote ?? trade.pnlQuote ?? trade.realizedPnl, 0);
  const basis = Math.abs(num(trade.riskQuote ?? trade.entryNotional ?? trade.notional ?? trade.quoteQty, 0));
  return basis > 0 ? pnl / basis : 0;
}

function maxDrawdownFromReturns(returns = []) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity *= Math.max(0.01, 1 + num(value, 0));
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / Math.max(peak, 1e-9));
  }
  return maxDrawdown;
}

function longestLossStreak(returns = []) {
  let current = 0;
  let longest = 0;
  for (const value of returns) {
    if (num(value, 0) < 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function summarizeReturns(trades = []) {
  const returns = arr(trades).map(tradeReturn).filter((value) => Number.isFinite(value));
  const winners = returns.filter((value) => value > 0);
  const losers = returns.filter((value) => value < 0);
  const avgWinPct = winners.length ? winners.reduce((total, value) => total + value, 0) / winners.length : 0;
  const avgLossPct = losers.length ? Math.abs(losers.reduce((total, value) => total + value, 0) / losers.length) : 0;
  const mean = returns.length ? returns.reduce((total, value) => total + value, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / returns.length
    : 0;
  return {
    returns,
    tradeCount: returns.length,
    winRate: returns.length ? winners.length / returns.length : 0,
    avgWinPct,
    avgLossPct,
    expectancy: mean,
    volatility: Math.sqrt(Math.max(0, variance)),
    maxDrawdown: maxDrawdownFromReturns(returns),
    longestLossStreak: longestLossStreak(returns)
  };
}

function classifyRisk(score, warnings = []) {
  if (warnings.includes("insufficient_history")) {
    return "insufficient_sample";
  }
  if (score >= 0.78) {
    return "blocked";
  }
  if (score >= 0.58) {
    return "high";
  }
  if (score >= 0.35) {
    return "watch";
  }
  return "ok";
}

function actionForStatus(status, entryBlockEnabled) {
  if (status === "blocked") {
    return entryBlockEnabled ? "block_new_entries_until_risk_of_ruin_improves" : "reduce_size_and_require_operator_review";
  }
  if (status === "high") {
    return "reduce_new_risk_and_review_strategy_scope";
  }
  if (status === "watch") {
    return "monitor_drawdown_and_keep_size_conservative";
  }
  if (status === "insufficient_sample") {
    return "collect_more_closed_trade_samples";
  }
  return "monitor";
}

export function buildRiskOfRuinMonitor({
  trades = [],
  currentExposureFraction = 0,
  openPositions = [],
  portfolioScenarioStress = null,
  correlation = 0,
  config = {}
} = {}) {
  const summary = summarizeReturns(trades);
  const minTrades = Math.max(1, Math.round(num(config.riskOfRuinMinTrades, 20)));
  const riskPerTrade = clamp(config.riskOfRuinRiskPerTrade ?? config.maxPositionFraction ?? 0.01, 0.001, 0.25);
  const exposure = clamp(
    currentExposureFraction || arr(openPositions).reduce((total, position) => total + num(position.exposureFraction, 0), 0),
    0,
    2
  );
  const warnings = [];
  if (summary.tradeCount < minTrades) {
    warnings.push("insufficient_history");
  }
  if (summary.volatility >= num(config.riskOfRuinHighVariancePct, 0.045)) {
    warnings.push("high_variance_trade_distribution");
  }
  if (exposure >= num(config.riskOfRuinHighExposureFraction, 0.5)) {
    warnings.push("high_current_exposure");
  }
  const simulator = estimateRiskOfRuin({
    winRate: summary.winRate,
    avgWinPct: summary.avgWinPct,
    avgLossPct: summary.avgLossPct,
    riskPerTrade,
    tradeCount: summary.tradeCount,
    correlation
  });
  const scenarioDrawdown = num(portfolioScenarioStress?.estimatedDrawdownPct, 0);
  const drawdownRisk = Math.max(
    summary.maxDrawdown,
    scenarioDrawdown,
    num(simulator.probabilityDrawdown10, 0) * 0.1,
    num(simulator.probabilityDrawdown25, 0) * 0.25
  );
  const lossStreakRisk = clamp(
    Math.max(summary.longestLossStreak, num(simulator.expectedWorstLosingStreak, 0)) / Math.max(3, minTrades / 3),
    0,
    1
  );
  const expectancyPenalty = summary.expectancy < 0 ? clamp(Math.abs(summary.expectancy) * 28, 0.12, 0.4) : 0;
  const exposurePenalty = clamp(exposure * 0.35, 0, 0.35);
  const variancePenalty = clamp(summary.volatility * 5, 0, 0.25);
  const riskOfRuinScore = clamp(
    num(simulator.probabilityDrawdown25, 0) * 0.45 +
      drawdownRisk * 1.1 +
      lossStreakRisk * 0.18 +
      expectancyPenalty +
      exposurePenalty +
      variancePenalty,
    0,
    1
  );
  const status = classifyRisk(riskOfRuinScore, warnings);
  const recommendedSizeMultiplier = clamp(1 - riskOfRuinScore * 0.85, 0.1, 1);
  const entryBlockEnabled = Boolean(config.enableRiskOfRuinEntryBlock || config.riskOfRuinBlockEntries);

  return {
    status,
    riskOfRuinScore: finite(riskOfRuinScore),
    expectedDrawdown: finite(drawdownRisk),
    lossStreakRisk: finite(lossStreakRisk),
    recommendedSizeMultiplier: finite(recommendedSizeMultiplier, 3),
    warnings,
    recommendedAction: actionForStatus(status, entryBlockEnabled),
    entryGateRecommendation: status === "blocked" && entryBlockEnabled ? "block_new_entries" : "diagnostics_only",
    tradeDistribution: {
      tradeCount: summary.tradeCount,
      winRate: finite(summary.winRate),
      avgWinPct: finite(summary.avgWinPct),
      avgLossPct: finite(summary.avgLossPct),
      expectancy: finite(summary.expectancy),
      volatility: finite(summary.volatility),
      maxDrawdown: finite(summary.maxDrawdown),
      longestLossStreak: summary.longestLossStreak
    },
    simulator,
    exposure: {
      currentExposureFraction: finite(exposure),
      openPositionCount: arr(openPositions).length,
      scenarioEstimatedDrawdownPct: finite(scenarioDrawdown)
    },
    diagnosticsOnly: !entryBlockEnabled,
    autoIncreasesSize: false,
    liveSafetyUnchanged: true
  };
}
