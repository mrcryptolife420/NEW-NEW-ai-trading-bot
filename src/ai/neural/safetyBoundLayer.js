import { finiteNumber } from "./utils.js";

export const FORBIDDEN_NEURAL_KEYS = Object.freeze([
  "BOT_MODE",
  "LIVE_TRADING_ACKNOWLEDGED",
  "BINANCE_API_KEY",
  "BINANCE_API_SECRET",
  "OPENAI_API_KEY",
  "MAX_DAILY_DRAWDOWN",
  "MAX_TOTAL_EXPOSURE_FRACTION",
  "LIVE_POSITION_SIZE",
  "NEURAL_LIVE_AUTONOMY_ENABLED"
]);

export const DEFAULT_MUTATION_POLICY = Object.freeze({
  allowedMutations: [
    "threshold_adjustment",
    "feature_weight_adjustment",
    "strategy_weight_adjustment",
    "safe_gate_tighten",
    "safe_gate_relax_paper_only",
    "blocker_weight_adjustment",
    "symbol_quarantine",
    "strategy_quarantine",
    "model_candidate_promotion",
    "model_rollback"
  ],
  maxThresholdDelta: 0.02,
  maxSizeMultiplierDelta: 0.05,
  maxExposureDelta: 0,
  maxDrawdownDelta: 0.01,
  requiresReplay: true,
  requiresBacktest: true,
  requiresStress: true
});

export function applySafetyBounds(proposal = {}, { policy = {}, botMode = "paper", humanApproved = false } = {}) {
  const merged = { ...DEFAULT_MUTATION_POLICY, ...policy };
  const reasons = [];
  const key = `${proposal.change?.key || ""}`;
  const type = proposal.type || "unknown";
  const mode = proposal.scope?.mode || botMode;
  const delta = finiteNumber(proposal.change?.delta, finiteNumber(proposal.change?.to, 0) - finiteNumber(proposal.change?.from, 0));
  if (!merged.allowedMutations.includes(type)) reasons.push("mutation_type_not_allowed");
  if (FORBIDDEN_NEURAL_KEYS.includes(key)) reasons.push("forbidden_key_change");
  if (key.includes("API_KEY") || key.includes("SECRET")) reasons.push("secret_change_forbidden");
  if (key === "BOT_MODE" || proposal.change?.to === "live") reasons.push("bot_mode_change_forbidden");
  if (key === "LIVE_TRADING_ACKNOWLEDGED") reasons.push("live_ack_change_forbidden");
  if (mode === "live" && (type.includes("relax") || delta < 0) && !humanApproved) reasons.push("live_safety_relaxation_requires_human_review");
  if (type === "position_size_bias" && mode === "live" && delta > 0) reasons.push("live_position_size_increase_forbidden");
  if (Math.abs(delta) > finiteNumber(merged.maxThresholdDelta, 0.02) && key.toLowerCase().includes("threshold")) reasons.push("threshold_delta_exceeds_bound");
  if (Math.abs(delta) > finiteNumber(merged.maxSizeMultiplierDelta, 0.05) && key.toLowerCase().includes("size")) reasons.push("size_delta_exceeds_bound");
  if (finiteNumber(proposal.risk?.exposureDelta, 0) > finiteNumber(merged.maxExposureDelta, 0) && !humanApproved) reasons.push("exposure_increase_requires_human_review");
  if (finiteNumber(proposal.risk?.maxDrawdownDelta, 0) > finiteNumber(merged.maxDrawdownDelta, 0.01)) reasons.push("drawdown_delta_exceeds_bound");
  const allowed = reasons.length === 0;
  return {
    allowed,
    status: allowed ? "bounds_checked" : "rejected",
    reasons,
    proposal: {
      ...proposal,
      status: allowed ? "bounds_checked" : "rejected",
      stage: allowed ? "bounds_checked" : "rejected",
      rejectionReasons: reasons
    },
    auditEvent: {
      type: "neural_bounds_checked",
      proposalId: proposal.proposalId,
      allowed,
      reasons
    }
  };
}
