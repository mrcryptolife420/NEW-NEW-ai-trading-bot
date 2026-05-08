import { average, clamp01 } from "../utils/score.js";

const COMPONENTS = ["signal", "data", "execution", "riskReward", "liquidity", "regimeFit", "portfolioFit", "neuralAgreement", "costFee", "correlation", "session", "newsEventRisk", "positionProtection"];

export function buildTradeQualityScore(candidate = {}, { mode = "paper", fastExecution = false, neuralLiveAutonomy = false } = {}) {
  const components = Object.fromEntries(COMPONENTS.map((key) => [key, clamp01(candidate[key] ?? candidate[`${key}Quality`] ?? 0.5, 0.5)]));
  components.newsEventRisk = clamp01(candidate.newsEventRiskQuality ?? (1 - clamp01(candidate.newsEventRisk ?? 0, 0)), 0.5);
  const score = clamp01(average(Object.values(components), 0.5));
  const minimum = neuralLiveAutonomy ? 0.78 : fastExecution ? 0.72 : mode === "live" ? 0.68 : 0.45;
  const weakestComponent = Object.entries(components).sort((a, b) => a[1] - b[1])[0]?.[0] || null;
  return {
    score,
    label: score >= 0.8 ? "strong" : score >= minimum ? "acceptable" : "weak",
    minimum,
    weakestComponent,
    components,
    entriesAllowed: score >= minimum,
    blockReason: score >= minimum ? null : "trade_quality_below_minimum"
  };
}
