import { finiteNumber, stableId } from "../utils.js";

export function buildPositionOutcomeFeedback({ position = {}, trade = {}, neuralPrediction = {}, thesis = {} } = {}) {
  const actual = finiteNumber(trade.netPnlPct ?? trade.pnlPct, 0);
  const predicted = finiteNumber(neuralPrediction.expectedPnlPct ?? neuralPrediction.score, 0);
  const predictionError = actual - predicted;
  const losing = actual < 0;
  return {
    feedbackId: stableId("nr_feedback", [position.positionId, trade.tradeId, neuralPrediction.modelId]),
    tradeId: trade.tradeId || null,
    symbol: trade.symbol || position.symbol || "UNKNOWN",
    setupType: thesis.setupType || position.setupType || trade.setupType || "unknown",
    actualNetPnlPct: actual,
    predictedNetPnlPct: predicted,
    predictionError,
    learningWeight: Math.min(2, Math.max(0.25, Math.abs(predictionError) * 10 + (losing ? 0.5 : 0))),
    replayPriority: losing ? "high" : Math.abs(predictionError) > 0.01 ? "medium" : "low",
    recommendedLearningAction: losing ? "review_loss_case" : "retain_as_reference_case"
  };
}
