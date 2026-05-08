import { finiteNumber } from "../utils.js";

export function evaluateReplayPromotionGate({ arenaResult = {}, config = {}, datasetQuality = {}, calibration = {} } = {}) {
  const best = arenaResult.bestChallenger;
  const reasons = [];
  const minTrades = finiteNumber(config.neuralReplayMinTrades, 50);
  const minDelta = finiteNumber(config.neuralReplayMinBaselineDelta, 0.04);
  const maxDrawdown = finiteNumber(config.neuralReplayMaxDrawdownPct, 0.08);
  if (!best) reasons.push("no_challenger");
  const trades = best?.replay?.metrics?.trades ?? 0;
  const delta = best?.deltaAvgNetPnlPct ?? 0;
  const drawdown = best?.replay?.metrics?.maxDrawdownPct ?? 1;
  if (trades < minTrades) reasons.push("insufficient_replay_trades");
  if (delta < minDelta) reasons.push("baseline_delta_too_small");
  if (drawdown > maxDrawdown) reasons.push("drawdown_too_high");
  if (datasetQuality.status === "blocked") reasons.push("dataset_quality_blocked");
  if (finiteNumber(calibration.ece, 0) > finiteNumber(config.neuralReplayMaxEce, 0.12)) reasons.push("calibration_error_too_high");
  return {
    status: reasons.length === 0 ? "paper_candidate" : "not_ready",
    recommendedMaxStage: reasons.length === 0 ? "paper_only" : "shadow_only",
    livePromotionAllowed: false,
    reasons,
    evidence: { trades, deltaAvgNetPnlPct: delta, drawdown }
  };
}
