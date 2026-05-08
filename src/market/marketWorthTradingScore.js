import { average, clamp01 } from "../utils/score.js";

export function buildMarketWorthTradingScore(context = {}) {
  const components = {
    btcTrendHealth: clamp01(context.btcTrendHealth ?? context.trendHealth ?? 0.5, 0.5),
    ethTrendHealth: clamp01(context.ethTrendHealth ?? context.trendHealth ?? 0.5, 0.5),
    marketBreadth: clamp01(context.marketBreadth ?? 0.5, 0.5),
    volatilityCondition: clamp01(context.volatilityCondition ?? 0.5, 0.5),
    liquidityCondition: clamp01(context.liquidityCondition ?? context.liquidityScore ?? 0.5, 0.5),
    stablecoinStress: 1 - clamp01(context.stablecoinStress ?? 0, 0),
    newsEventRisk: 1 - clamp01(context.newsEventRisk ?? context.eventRisk ?? 0, 0),
    exchangeReliability: clamp01(context.exchangeReliability ?? 0.75, 0.75),
    correlationRisk: 1 - clamp01(context.correlationRisk ?? 0, 0),
    spreadRegime: 1 - clamp01(context.spreadRisk ?? context.spreadRegime ?? 0, 0),
    volumeParticipation: clamp01(context.volumeParticipation ?? 0.5, 0.5),
    fundingEventRisk: 1 - clamp01(context.fundingEventRisk ?? 0, 0),
    riskOnProxy: clamp01(context.riskOnProxy ?? 0.5, 0.5),
    altcoinStrength: clamp01(context.altcoinStrength ?? 0.5, 0.5),
    dataQuality: clamp01(context.dataQuality ?? context.dataQualityScore ?? 0.75, 0.75)
  };
  const score = clamp01(average(Object.values(components), 0.5));
  const status = score < 0.2 ? "do_not_trade" : score < 0.45 ? "defensive" : score < 0.7 ? "selective" : "good";
  return {
    score,
    status,
    components,
    riskMultiplier: status === "do_not_trade" ? 0 : status === "defensive" ? 0.35 : status === "selective" ? 0.7 : 1,
    entriesAllowed: status !== "do_not_trade",
    blockReason: status === "do_not_trade" ? "market_worth_trading_score_extremely_low" : null
  };
}
