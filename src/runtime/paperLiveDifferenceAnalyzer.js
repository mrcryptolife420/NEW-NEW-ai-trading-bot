export function analyzePaperLiveDifference({ paper = {}, live = {}, thresholds = {} } = {}) {
  const delta = {
    slippageBps: (Number(paper.slippageBps) || 0) - (Number(live.slippageBps) || 0),
    latencyMs: (Number(paper.latencyMs) || 0) - (Number(live.latencyMs) || 0),
    makerFillRatio: (Number(paper.makerFillRatio) || 0) - (Number(live.makerFillRatio) || 0),
    netPnlPct: (Number(paper.netPnlPct) || 0) - (Number(live.netPnlPct) || 0)
  };
  const tooOptimistic = delta.netPnlPct > (thresholds.maxPnlOptimismPct ?? 0.01) || delta.makerFillRatio > 0.2 || delta.slippageBps < -5;
  return {
    delta,
    overlyOptimisticPaper: tooOptimistic,
    livePromotionBlocked: tooOptimistic,
    recommendedCalibration: tooOptimistic ? "tighten_paper_cost_and_fill_assumptions" : "keep_current_assumptions"
  };
}
