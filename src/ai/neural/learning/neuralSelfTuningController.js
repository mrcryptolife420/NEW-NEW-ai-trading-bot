import { finiteNumber } from "../utils.js";

const FORBIDDEN_PARAMS = new Set(["enableExchangeProtection", "liveTradingAcknowledged", "binanceApiKey", "binanceApiSecret"]);

export function applyNeuralTuningClamp({ proposal = {}, config = {}, botMode = "paper" } = {}) {
  const blockedChanges = [];
  const allowedChanges = {};
  for (const [key, value] of Object.entries(proposal.changes || {})) {
    if (FORBIDDEN_PARAMS.has(key)) {
      blockedChanges.push({ key, reason: "forbidden_safety_or_secret_param" });
      continue;
    }
    if (botMode === "live" && config.neuralSelfTuningPaperOnly !== false) {
      blockedChanges.push({ key, reason: "self_tuning_paper_only" });
      continue;
    }
    const maxDelta = key.toLowerCase().includes("threshold")
      ? finiteNumber(config.neuralMaxThresholdDelta, 0.03)
      : key.toLowerCase().includes("size") || key.toLowerCase().includes("risk")
        ? finiteNumber(config.neuralMaxSizeMultiplierDelta, 0.1)
        : Infinity;
    const current = finiteNumber(proposal.current?.[key], 0);
    const next = finiteNumber(value, current);
    allowedChanges[key] = Number.isFinite(maxDelta)
      ? Math.max(current - maxDelta, Math.min(current + maxDelta, next))
      : next;
  }
  return {
    status: blockedChanges.length && Object.keys(allowedChanges).length === 0 ? "blocked" : "clamped",
    allowedChanges,
    blockedChanges,
    rollbackCondition: proposal.rollbackCondition || "metric_degradation_or_safety_alert",
    livePromotionAllowed: false
  };
}
