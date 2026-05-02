import { clamp } from "../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

export function estimateRiskOfRuin({
  winRate = 0,
  avgWinPct = 0,
  avgLossPct = 0,
  riskPerTrade = 0.01,
  tradeCount = 0,
  correlation = 0
} = {}) {
  if (tradeCount < 20) {
    return {
      status: "insufficient_sample",
      warning: "min_20_trades_required",
      tradeCount
    };
  }
  const lossRate = clamp(1 - safeNumber(winRate), 0, 1);
  const payoff = safeNumber(avgWinPct) / Math.max(Math.abs(safeNumber(avgLossPct)), 1e-9);
  const edge = safeNumber(winRate) * payoff - lossRate;
  const correlationPenalty = clamp(safeNumber(correlation), 0, 1);
  const risk = clamp(safeNumber(riskPerTrade), 0.001, 0.25);
  const baseDrawdownRisk = clamp(lossRate * risk * (1 + correlationPenalty * 0.75) * (edge < 0 ? 2.4 : 1.2 - Math.min(edge, 0.7) * 0.6), 0, 1);
  const probabilityDrawdown10 = clamp(baseDrawdownRisk * 7.5, 0, 1);
  const probabilityDrawdown25 = clamp(baseDrawdownRisk * 3.1, 0, 1);
  const expectedWorstLosingStreak = Math.ceil(Math.log(Math.max(1 / Math.max(tradeCount, 1), 1e-9)) / Math.log(Math.max(lossRate, 0.01)));
  const recommendedMaxRiskPerTrade = clamp(risk * (0.12 / Math.max(probabilityDrawdown25, 0.08)), 0.001, risk);
  return {
    status: probabilityDrawdown25 > 0.35 || edge < 0 ? "unsafe" : probabilityDrawdown10 > 0.35 ? "caution" : "acceptable",
    edge: num(edge),
    payoff: num(payoff),
    probabilityDrawdown10: num(probabilityDrawdown10),
    probabilityDrawdown25: num(probabilityDrawdown25),
    expectedWorstLosingStreak,
    recommendedMaxRiskPerTrade: num(recommendedMaxRiskPerTrade),
    inputs: {
      winRate: num(winRate),
      avgWinPct: num(avgWinPct),
      avgLossPct: num(avgLossPct),
      riskPerTrade: num(risk),
      tradeCount,
      correlation: num(correlation)
    }
  };
}
