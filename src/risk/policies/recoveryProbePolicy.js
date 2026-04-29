import { HARD_SAFETY_BLOCKERS } from "./hardSafetyPolicy.js";

function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

const SOFT_RECOVERY_PROBE_BLOCKERS = new Set([
  "meta_gate_caution",
  "meta_neural_caution",
  "meta_followthrough_caution",
  "trade_quality_caution",
  "quality_quorum_degraded",
  "model_confidence_too_low",
  "capital_governor_blocked",
  "capital_governor_recovery",
  "trade_size_below_minimum"
]);

const HARD_RECOVERY_PROBE_BLOCKERS = new Set([
  "exchange_truth_freeze",
  "exchange_safety_blocked",
  "exchange_safety_symbol_blocked",
  "reconcile_required",
  "lifecycle_attention_required",
  "operator_ack_required",
  "position_already_open",
  "max_open_positions_reached",
  "quality_quorum_observe_only",
  "session_blocked",
  "drift_blocked"
]);

function canRelaxPaperSelfHeal(selfHealState = {}) {
  const issues = new Set(selfHealState.issues || []);
  return Boolean(selfHealState.learningAllowed) || !issues.has("health_circuit_open");
}

function isSoftPaperReason(reason = "", selfHealState = {}) {
  if (reason === "self_heal_pause_entries") {
    return canRelaxPaperSelfHeal(selfHealState);
  }
  return [
    "model_confidence_too_low",
    "model_uncertainty_abstain",
    "transformer_challenger_reject",
    "committee_veto",
    "committee_confidence_too_low",
    "committee_low_agreement",
    "strategy_fit_too_low",
    "strategy_context_mismatch",
    "orderbook_sell_pressure",
    "execution_cost_budget_exceeded",
    "strategy_cooldown",
    "strategy_budget_cooled",
    "family_budget_cooled",
    "cluster_budget_cooled",
    "regime_budget_cooled",
    "factor_budget_cooled",
    "daily_risk_budget_cooled",
    "regime_kill_switch_active",
    "portfolio_cvar_budget_cooled",
    "portfolio_loss_streak_guard",
    "symbol_loss_streak_guard",
    "capital_governor_blocked",
    "capital_governor_recovery",
    "trade_size_below_minimum",
    "entry_cooldown_active",
    "daily_entry_budget_reached",
    "weekend_high_risk_strategy_block",
    "ambiguous_setup_context"
  ].includes(reason);
}

function isMildPaperQualityReason(reason = "") {
  return [
    "local_book_quality_too_low",
    "quality_quorum_degraded"
  ].includes(reason);
}

function isHardStopReason(reason = "") {
  return HARD_SAFETY_BLOCKERS.has(reason) || HARD_RECOVERY_PROBE_BLOCKERS.has(reason);
}

function isAllowedSoftProbeReason(reason = "", selfHealState = {}, { allowModelConfidenceNearMiss = false } = {}) {
  if (SOFT_RECOVERY_PROBE_BLOCKERS.has(reason)) {
    return reason !== "model_confidence_too_low" || allowModelConfidenceNearMiss;
  }
  if (isMildPaperQualityReason(reason) || isSoftPaperReason(reason, selfHealState)) {
    return true;
  }
  return false;
}

function buildQualityScore({
  setupQuality = {},
  signalQualitySummary = {},
  dataQualitySummary = {},
  confidenceBreakdown = {},
  strategySummary = {},
  qualityQuorumSummary = {}
} = {}) {
  return clamp(
    safeValue(setupQuality.score, 0.54) * 0.26 +
      safeValue(signalQualitySummary.overallScore, 0.54) * 0.2 +
      safeValue(dataQualitySummary.overallScore, 0.54) * 0.16 +
      safeValue(confidenceBreakdown.overallConfidence, 0.52) * 0.12 +
      safeValue(confidenceBreakdown.executionConfidence, 0.52) * 0.08 +
      safeValue(strategySummary.fitScore, 0.52) * 0.1 +
      safeValue(strategySummary.confidence, 0.5) * 0.03 +
      safeValue(qualityQuorumSummary.quorumScore, 0.7) * 0.05,
    0,
    1
  );
}

function hasCompatibleOpenPositions(openPositionsInMode = [], { symbol = null, strategySummary = {}, regimeSummary = {} } = {}) {
  if (!openPositionsInMode.length) {
    return true;
  }
  const targetFamily = strategySummary.family || null;
  const targetRegime = regimeSummary.regime || null;
  return openPositionsInMode.every((position) => {
    if (position?.symbol === symbol) {
      return false;
    }
    const positionFamily =
      position?.strategyFamily ||
      position?.entryRationale?.strategySummary?.family ||
      position?.entryRationale?.strategy?.family ||
      null;
    const positionRegime =
      position?.regime ||
      position?.entryRationale?.regimeSummary?.regime ||
      null;
    return (!targetFamily || !positionFamily || positionFamily === targetFamily) &&
      (!targetRegime || !positionRegime || positionRegime === targetRegime);
  });
}

export function buildRecoveryProbePolicy({
  config = {},
  symbol = null,
  capitalGovernor = {},
  reasons = [],
  openPositionsInMode = [],
  canOpenAnotherPaperLearningPosition = false,
  score = {},
  threshold = 0,
  recoveryProbeProbabilityFloor = 0,
  setupQuality = {},
  signalQualitySummary = {},
  dataQualitySummary = {},
  confidenceBreakdown = {},
  lowConfidencePressure = {},
  qualityQuorumSummary = {},
  marketSnapshot = {},
  newsSummary = {},
  announcementSummary = {},
  calendarSummary = {},
  marketStructureSummary = {},
  volatilitySummary = {},
  sessionSummary = {},
  driftSummary = {},
  selfHealState = {},
  invalidQuoteAmount = false,
  strategySummary = {},
  regimeSummary = {},
  allow = false,
  minutesSincePortfolioTrade = Number.POSITIVE_INFINITY,
  cooldownMinutes = 0
} = {}) {
  const normalizedReasons = [...new Set((reasons || []).filter(Boolean))];
  const botMode = config.botMode || "paper";
  const paperVenue = `${config.paperExecutionVenue || ""}`.toLowerCase();
  const hardStopReasons = normalizedReasons.filter((reason) => isHardStopReason(reason));
  const modelConfidenceNearMissEligible =
    normalizedReasons.includes("model_confidence_too_low") &&
    safeValue(score.probability, 0) >= Math.max(safeValue(recoveryProbeProbabilityFloor, 0), safeValue(threshold, 0) - 0.035) &&
    safeValue(lowConfidencePressure.featureTrustPenalty, 0) <= 0.1 &&
    !safeValue(lowConfidencePressure.featureTrustHardRisk, false);
  const qualifyingReasons = normalizedReasons.filter((reason) =>
    isAllowedSoftProbeReason(reason, selfHealState, { allowModelConfidenceNearMiss: modelConfidenceNearMissEligible })
  );
  const softBlockedOnly = normalizedReasons.length > 0 && qualifyingReasons.length === normalizedReasons.length;
  const metaCautionOverrideEligible = qualifyingReasons.some((reason) =>
    ["meta_gate_caution", "meta_neural_caution", "meta_followthrough_caution", "trade_quality_caution"].includes(reason)
  );
  const compatibleOpenPositions = hasCompatibleOpenPositions(openPositionsInMode, {
    symbol,
    strategySummary,
    regimeSummary
  });
  const qualityScore = buildQualityScore({
    setupQuality,
    signalQualitySummary,
    dataQualitySummary,
    confidenceBreakdown,
    strategySummary,
    qualityQuorumSummary
  });
  const directQualitySufficient =
    qualityScore >= Math.max(0.56, safeValue(config.paperRecoveryProbeMinQualityScore, 0.58)) &&
    safeValue(signalQualitySummary.executionViability, 0.5) >= safeValue(config.paperRecoveryProbeMinExecutionViability, 0.5) &&
    safeValue(dataQualitySummary.overallScore, 0.5) >= safeValue(config.paperRecoveryProbeMinDataQuality, 0.5);
  const fallbackQualitySufficient =
    safeValue(strategySummary.fitScore, 0) >= 0.52 &&
    safeValue(strategySummary.confidence, 0) >= 0.42 &&
    safeValue(qualityQuorumSummary.quorumScore, 0) >= 0.82 &&
    safeValue(score.probability, 0) >= safeValue(recoveryProbeProbabilityFloor, 0);
  const qualitySufficient = directQualitySufficient || fallbackQualitySufficient;
  const marketHealthy =
    safeValue(marketSnapshot?.book?.bookPressure, 0) >= safeValue(config.paperRecoveryProbeMinBookPressure, -0.28) &&
    safeValue(marketSnapshot?.book?.spreadBps, 0) <= Math.min(safeValue(config.maxSpreadBps, 20) * 0.5, 10) &&
    safeValue(marketSnapshot?.market?.realizedVolPct, 0) <= safeValue(config.maxRealizedVolPct, 0.08) * 0.82 &&
    safeValue(newsSummary.riskScore, 0) <= 0.36 &&
    safeValue(announcementSummary.riskScore, 0) <= 0.24 &&
    safeValue(calendarSummary.riskScore, 0) <= 0.3 &&
    safeValue(marketStructureSummary.riskScore, 0) <= 0.36 &&
    safeValue(volatilitySummary.riskScore, 0) <= 0.76 &&
    !(sessionSummary.blockerReasons || []).length &&
    (!(driftSummary.blockerReasons || []).length || (driftSummary.blockerReasons || []).every((reason) => isMildPaperQualityReason(reason))) &&
    qualityQuorumSummary.observeOnly !== true;
  const cooldownSatisfied = !Number.isFinite(cooldownMinutes) || !Number.isFinite(minutesSincePortfolioTrade)
    ? true
    : minutesSincePortfolioTrade >= Math.max(0, cooldownMinutes);
  const eligible =
    !allow &&
    botMode === "paper" &&
    paperVenue === "binance_demo_spot" &&
    config.paperRecoveryProbeEnabled !== false &&
    capitalGovernor.allowProbeEntries === true &&
    !capitalGovernor.blocked &&
    !invalidQuoteAmount &&
    hardStopReasons.length === 0 &&
    canOpenAnotherPaperLearningPosition &&
    compatibleOpenPositions &&
    cooldownSatisfied &&
    softBlockedOnly &&
    qualitySufficient &&
    marketHealthy &&
    canRelaxPaperSelfHeal(selfHealState) &&
    safeValue(score.probability, 0) >= safeValue(recoveryProbeProbabilityFloor, 0);

  let whyNoProbeAttempt = null;
  if (eligible) {
    whyNoProbeAttempt = null;
  } else if (botMode !== "paper" || paperVenue !== "binance_demo_spot") {
    whyNoProbeAttempt = "probe_lane_requires_binance_demo_paper";
  } else if (config.paperRecoveryProbeEnabled === false) {
    whyNoProbeAttempt = "paper_recovery_probe_disabled";
  } else if (capitalGovernor.allowProbeEntries !== true) {
    whyNoProbeAttempt = "capital_governor_probe_not_allowed";
  } else if (capitalGovernor.blocked) {
    whyNoProbeAttempt = "capital_governor_blocked";
  } else if (hardStopReasons.length) {
    whyNoProbeAttempt = hardStopReasons[0];
  } else if (!compatibleOpenPositions) {
    whyNoProbeAttempt = "paper_probe_incompatible_open_positions";
  } else if (!cooldownSatisfied) {
    whyNoProbeAttempt = "paper_probe_cooldown_active";
  } else if (!softBlockedOnly) {
    whyNoProbeAttempt = "not_soft_blocked_only";
  } else if (!qualitySufficient) {
    whyNoProbeAttempt = "paper_probe_quality_too_low";
  } else if (!marketHealthy) {
    whyNoProbeAttempt = "paper_probe_market_context_unhealthy";
  } else if (!canRelaxPaperSelfHeal(selfHealState)) {
    whyNoProbeAttempt = "self_heal_hard_stop";
  } else if (!canOpenAnotherPaperLearningPosition) {
    whyNoProbeAttempt = "paper_probe_learning_slot_unavailable";
  } else {
    whyNoProbeAttempt = "paper_probe_probability_floor_missed";
  }

  return {
    active: false,
    probeOnlyActive: false,
    eligible,
    activated: false,
    paperRecoveryProbeEligible: eligible,
    probeEligibleSoftBlockedCandidate: eligible,
    probeSoftBlockers: qualifyingReasons,
    probeBlockerReasons: qualifyingReasons,
    qualifyingReasons,
    hardStopReasons,
    softBlockedOnly,
    modelConfidenceNearMissEligible,
    metaCautionOverrideEligible,
    compatibleOpenPositions,
    qualityScore: num(qualityScore, 4),
    qualitySufficient,
    fallbackQualitySufficient,
    marketHealthy,
    cooldownSatisfied,
    whyNoProbeAttempt,
    probeRejectedReason: eligible ? null : whyNoProbeAttempt,
    rootBlocker: normalizedReasons[0] || null,
    downstreamBlockers: normalizedReasons.filter((reason) => reason !== normalizedReasons[0]),
    capitalGovernorProbeState: capitalGovernor.allowProbeEntries ? "allowed" : "blocked"
  };
}

export function isRecoveryProbeSoftBlocker(reason = "", selfHealState = {}, options = {}) {
  return isAllowedSoftProbeReason(reason, selfHealState, options);
}
