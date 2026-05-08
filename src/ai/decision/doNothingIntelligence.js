import { clamp01 } from "../../utils/score.js";

export function evaluateDoNothingIntelligence(context = {}) {
  const marketTooNoisy = clamp01(context.marketTooNoisy ?? context.noise ?? 0, 0);
  const riskNotWorthReward = clamp01(context.riskNotWorthReward ?? 0, 0);
  const liquidityNotWorthTrade = clamp01(context.liquidityNotWorthTrade ?? 0, 0);
  const executionCostTooHigh = clamp01(context.executionCostTooHigh ?? 0, 0);
  const marketWorthTradingScore = clamp01(context.marketWorthTradingScore ?? 0.5, 0.5);
  const doNothingScore = clamp01(Math.max(marketTooNoisy, riskNotWorthReward, liquidityNotWorthTrade, executionCostTooHigh, 1 - marketWorthTradingScore));
  const label = doNothingScore >= 0.8 ? "market_not_worth_trading" : doNothingScore >= 0.65 ? "risk_not_worth_reward" : "trade_decision_still_open";
  return {
    doNothingScore,
    marketDoNothingScore: doNothingScore,
    label,
    learningLabels: doNothingScore >= 0.65 ? ["correct_skip", "avoided_loss", label] : [],
    hardCaution: doNothingScore >= 0.65,
    canLowerRisk: true,
    canIncreaseRisk: false,
    liveOverride: false
  };
}
