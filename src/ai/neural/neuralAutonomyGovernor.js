import { asArray, clamp, finiteNumber, nowIso } from "./utils.js";

export const NeuralAutonomyLevel = Object.freeze({
  L0_DISABLED: 0,
  L1_DIAGNOSTIC: 1,
  L2_REPLAY: 2,
  L3_SHADOW: 3,
  L4_PAPER: 4,
  L5_PAPER_AUTOTUNE: 5,
  L6_LIVE_BOUNDED: 6,
  L7_LIVE_AUTONOMOUS: 7
});

export function normalizeNeuralAutonomyLevel(value) {
  const numeric = Math.trunc(finiteNumber(value, 0));
  return Math.min(NeuralAutonomyLevel.L7_LIVE_AUTONOMOUS, Math.max(NeuralAutonomyLevel.L0_DISABLED, numeric));
}

export function evaluateNeuralAutonomyGovernor({
  config = {},
  requestedLevel = config.neuralAutonomyLevel,
  botMode = config.botMode,
  hardBlockers = [],
  safetySnapshot = {},
  replayReadiness = {},
  paperReadiness = {},
  liveReadiness = {}
} = {}) {
  const level = normalizeNeuralAutonomyLevel(requestedLevel);
  const blockers = asArray(hardBlockers).map(String);
  const liveMode = botMode === "live";
  const hardSafetyBlocked = blockers.length > 0 || safetySnapshot.exchangeTruthFreeze === true || safetySnapshot.manualReviewRequired === true;
  const reasons = [];
  let effectiveLevel = config.neuralAutonomyEnabled === false ? 0 : level;

  if (hardSafetyBlocked) {
    effectiveLevel = Math.min(effectiveLevel, NeuralAutonomyLevel.L2_REPLAY);
    reasons.push("hard_safety_blocks_neural_trade_impact");
  }
  if (liveMode && effectiveLevel > NeuralAutonomyLevel.L5_PAPER_AUTOTUNE) {
    const liveAckOk = `${config.neuralLiveAutonomyAcknowledged || ""}` === "I_UNDERSTAND_NEURAL_LIVE_RISK";
    if (!config.neuralLiveAutonomyEnabled || !liveAckOk || liveReadiness.status !== "ready") {
      effectiveLevel = Math.min(effectiveLevel, NeuralAutonomyLevel.L5_PAPER_AUTOTUNE);
      reasons.push("live_neural_autonomy_not_approved");
    }
  }
  if (effectiveLevel >= NeuralAutonomyLevel.L4_PAPER && paperReadiness.status === "blocked") {
    effectiveLevel = NeuralAutonomyLevel.L3_SHADOW;
    reasons.push("paper_readiness_blocked");
  }
  if (effectiveLevel >= NeuralAutonomyLevel.L3_SHADOW && replayReadiness.status === "blocked") {
    effectiveLevel = NeuralAutonomyLevel.L2_REPLAY;
    reasons.push("replay_readiness_blocked");
  }

  return {
    requestedLevel: level,
    effectiveLevel,
    stage:
      effectiveLevel >= 6 ? "live_candidate" :
      effectiveLevel >= 4 ? "paper_only" :
      effectiveLevel >= 3 ? "shadow_only" :
      effectiveLevel >= 1 ? "diagnostics_only" : "disabled",
    canInfluenceLive: effectiveLevel >= NeuralAutonomyLevel.L6_LIVE_BOUNDED && !hardSafetyBlocked,
    canInfluencePaper: effectiveLevel >= NeuralAutonomyLevel.L4_PAPER && !hardSafetyBlocked,
    canPlaceOrdersDirectly: false,
    allowedScopes: {
      diagnostics: effectiveLevel >= 1,
      replay: effectiveLevel >= 2,
      shadow: effectiveLevel >= 3,
      paper: effectiveLevel >= 4 && !hardSafetyBlocked,
      live: effectiveLevel >= 6 && !hardSafetyBlocked
    },
    sizeMultiplierCap: effectiveLevel >= 6 ? clamp(config.neuralLiveAutonomyMaxPositionFraction ?? 0.03, 0, 0.05) : 0,
    reasons,
    hardSafetyBlocked,
    auditEvent: {
      type: "neural_autonomy_evaluated",
      createdAt: nowIso(),
      requestedLevel: level,
      effectiveLevel,
      reasons
    }
  };
}

export function buildNeuralAutonomyReport(input = {}) {
  const governance = evaluateNeuralAutonomyGovernor(input);
  return {
    status: governance.stage,
    governance,
    liveSafety: {
      directBrokerCallsAllowed: false,
      liveRequiresSeparateGate: true,
      automaticLivePromotionAllowed: false
    }
  };
}
