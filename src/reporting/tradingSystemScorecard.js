import { average, clamp01 } from "../utils/score.js";

const MODULES = ["signal", "risk", "execution", "exit", "neural", "data", "portfolio", "liquidity", "cost", "operatorSafety", "realityGap", "positionProtection", "replayQuality", "paperLiveAlignment"];

export function buildTradingSystemScorecard(input = {}) {
  const scores = Object.fromEntries(MODULES.map((key) => [key, clamp01(input[key] ?? 0.5, 0.5)]));
  scores.realityGap = 1 - clamp01(input.realityGap ?? 0, 0);
  const entries = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  const weakestModule = entries[0]?.[0] || null;
  const strongestModule = entries[entries.length - 1]?.[0] || null;
  return {
    period: input.period || "daily",
    score: clamp01(average(Object.values(scores), 0.5)),
    scores,
    weakestModule,
    strongestModule,
    recommendedFix: weakestModule ? `review_${weakestModule}_controls` : "none",
    trend: input.previousScore == null ? "unknown" : average(Object.values(scores), 0.5) >= Number(input.previousScore) ? "improving" : "weakening",
    canPlaceOrders: false
  };
}
