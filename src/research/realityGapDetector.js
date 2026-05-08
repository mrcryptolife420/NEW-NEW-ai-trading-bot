import { average, clamp01 } from "../utils/score.js";

export function detectRealityGap(context = {}) {
  const gaps = {
    fillGap: clamp01(context.paperExpectedFillLiveNoFill ?? context.fillGap ?? 0, 0),
    slippageGap: clamp01(context.liveSlippageHigher ?? context.slippageGap ?? 0, 0),
    replayPaperGap: clamp01(context.replayProfitablePaperNot ?? context.replayPaperGap ?? 0, 0),
    paperLiveGap: clamp01(context.paperProfitableLiveNot ?? context.paperLiveGap ?? 0, 0),
    neuralGap: clamp01(context.neuralReplayLiveGap ?? 0, 0),
    executionModelGap: clamp01(context.executionModelGap ?? 0, 0),
    spreadAssumptionGap: clamp01(context.spreadAssumptionGap ?? 0, 0),
    latencyAssumptionGap: clamp01(context.latencyAssumptionGap ?? 0, 0),
    makerFillAssumptionGap: clamp01(context.makerFillAssumptionGap ?? 0, 0),
    partialFillAssumptionGap: clamp01(context.partialFillAssumptionGap ?? 0, 0),
    stopLossSlippageGap: clamp01(context.stopLossSlippageGap ?? 0, 0),
    marketImpactGap: clamp01(context.marketImpactGap ?? 0, 0)
  };
  const score = clamp01(Math.max(average(Object.values(gaps), 0), Math.max(...Object.values(gaps)) * 0.85));
  return {
    score,
    gaps,
    status: score >= 0.75 ? "extreme_gap" : score >= 0.45 ? "high_gap" : score >= 0.2 ? "watch" : "aligned",
    livePromotionAllowed: score < 0.75,
    paperToLiveReadinessMultiplier: score >= 0.75 ? 0 : score >= 0.45 ? 0.35 : score >= 0.2 ? 0.75 : 1,
    autonomyMultiplier: score >= 0.75 ? 0 : score >= 0.45 ? 0.5 : 1
  };
}
