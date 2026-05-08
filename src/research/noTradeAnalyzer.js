import { buildExecutionCostBreakdown } from "../execution/costModel.js";

export function analyzeNoTradeOutcome({ decision = {}, futurePath = {}, costs = {} } = {}) {
  const mfe = Number(futurePath.maxFavorableMovePct) || 0;
  const mae = Number(futurePath.maxAdverseMovePct) || 0;
  const net = buildExecutionCostBreakdown({ grossEdgePct: mfe, ...costs });
  let label = "neutral_skip";
  if (mae < -0.02 && mfe < 0.01) label = "avoided_loser";
  if (net.netExpectancyPct > 0.01 && mfe > Math.abs(mae) * 1.5) label = "missed_winner";
  if (decision.rootBlocker?.includes("data_quality")) label = net.netExpectancyPct <= 0 ? "data_quality_block_saved" : "unnecessary_caution";
  if (decision.rootBlocker?.includes("cost")) label = net.tradeAllowed ? "model_too_conservative" : "execution_cost_saved";
  return {
    decisionId: decision.decisionId || null,
    label,
    goodSkip: ["avoided_loser", "execution_cost_saved", "data_quality_block_saved"].includes(label),
    badSkip: ["missed_winner", "unnecessary_caution", "model_too_conservative"].includes(label),
    hypotheticalMfePct: mfe,
    hypotheticalMaePct: mae,
    netExpectancyPct: net.netExpectancyPct,
    addToReplayQueue: ["missed_winner", "model_too_conservative"].includes(label),
    livePromotionEvidence: false
  };
}
