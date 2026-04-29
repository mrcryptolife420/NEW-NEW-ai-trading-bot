import { HARD_SAFETY_BLOCKERS } from "./hardSafetyPolicy.js";
import { buildSimplifiedConfidenceAdjudication } from "../confidenceAdjudication.js";

function safeValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeValue(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function classifyReasonCategory(reason = "") {
  if (!reason) {
    return "other";
  }
  if (reason.includes("confidence") || reason.includes("abstain") || reason.includes("quality")) {
    return "quality";
  }
  if (reason.includes("committee") || reason.includes("meta") || reason.includes("governor")) {
    return "governance";
  }
  if (reason.includes("volatility") || reason.includes("spread") || reason.includes("orderbook") || reason.includes("liquidity")) {
    return "execution";
  }
  if (reason.includes("news") || reason.includes("event") || reason.includes("calendar") || reason.includes("announcement")) {
    return "event";
  }
  if (reason.includes("portfolio") || reason.includes("exposure") || reason.includes("position") || reason.includes("trade_size")) {
    return "risk";
  }
  if (reason.includes("exchange_safety") || reason.includes("exchange_truth") || reason.includes("reconcile")) {
    return "safety";
  }
  if (reason.includes("regime") || reason.includes("trend") || reason.includes("breakout") || reason.includes("session")) {
    return "regime";
  }
  if (reason.startsWith("paper_learning_") || reason.includes("shadow")) {
    return "learning";
  }
  return "other";
}

function classifyPermissioningCategory(reason = "") {
  const category = classifyReasonCategory(reason);
  if (["governance", "event", "execution", "risk"].includes(category)) {
    return category;
  }
  if (category === "regime") {
    return "portfolio";
  }
  if (category === "safety") {
    return "safety";
  }
  return "other";
}

function classifyDecisionBoundaryPlane(reason = "") {
  if (!reason) {
    return "other";
  }
  if (reason.includes("meta_followthrough")) {
    return "alpha";
  }
  if (
    [
      "committee_veto",
      "committee_confidence_too_low",
      "committee_low_agreement",
      "meta_gate_caution",
      "meta_neural_caution",
      "trade_quality_caution",
      "event_risk_blocked",
      "calendar_risk_blocked",
      "announcement_risk_blocked",
      "entry_cooldown_active",
      "strategy_cooldown",
      "position_already_open",
      "max_open_positions_reached",
      "duplicate_trade_prevention",
      "pair_correlation_too_high",
      "self_heal_pause_entries",
      "capital_governor_blocked",
      "capital_governor_recovery",
      "trade_size_below_minimum",
      "trade_size_invalid",
      "execution_cost_budget_exceeded"
    ].includes(reason)
  ) {
    return "permissioning";
  }
  if (
    reason.includes("model") ||
    reason.includes("confidence") ||
    reason.includes("abstain") ||
    reason.includes("calibration") ||
    reason.includes("setup") ||
    reason.includes("strategy_fit") ||
    reason.includes("strategy_context") ||
    reason.includes("cross_timeframe") ||
    reason.includes("trade_quality") ||
    reason.includes("ambiguous_setup")
  ) {
    return "alpha";
  }
  if (
    reason.includes("session") ||
    reason.includes("cooldown") ||
    reason.includes("correlation") ||
    reason.includes("capital_governor") ||
    reason.includes("budget") ||
    reason.includes("trade_size") ||
    reason.includes("execution_cost") ||
    reason.includes("self_heal") ||
    reason.includes("position_") ||
    reason.includes("duplicate")
  ) {
    return "permissioning";
  }
  const category = classifyReasonCategory(reason);
  if (category === "quality") {
    return "alpha";
  }
  if (["governance", "event", "execution", "risk"].includes(category)) {
    return "permissioning";
  }
  return "other";
}

export function buildBlockerDecomposition(reasons = []) {
  const blockerSequence = [...new Set((reasons || []).filter(Boolean))];
  const redundantPairs = [
    ["committee_low_agreement", "committee_veto"],
    ["committee_low_agreement", "committee_confidence_too_low"],
    ["cross_timeframe_misalignment", "higher_tf_conflict"],
    ["model_confidence_too_low", "committee_confidence_too_low"]
  ];
  const redundantBlockers = blockerSequence.filter((reason) =>
    redundantPairs.some(([echo, root]) => reason === echo && blockerSequence.includes(root))
  );
  const rootBlocker = blockerSequence.find((reason) => !redundantBlockers.includes(reason)) || blockerSequence[0] || null;
  const hardSafetyRootActive = blockerSequence.some((reason) => HARD_SAFETY_BLOCKERS.has(reason));
  const downstreamBlockers = blockerSequence.filter((reason) =>
    (
      reason === "trade_size_below_minimum" &&
      blockerSequence.some((item) => item !== "trade_size_below_minimum")
    ) ||
    (
      hardSafetyRootActive &&
      ["trade_size_below_minimum", "model_confidence_too_low"].includes(reason)
    )
  );
  return {
    blockerSequence,
    rootBlocker,
    redundantBlockers,
    downstreamBlockers
  };
}

export function buildDecisionBoundarySummary({
  allow = false,
  reasons = [],
  score = {},
  adjudicatedProbability = null,
  alphaThreshold = 0,
  effectiveThreshold = 0,
  strategySummary = {},
  setupQuality = {},
  approvalReasons = [],
  lowConfidencePressure = {},
  probeAdmission = {}
} = {}) {
  const normalizedReasons = [...new Set((Array.isArray(reasons) ? reasons : []).filter(Boolean))];
  const effectiveProbability = Number.isFinite(adjudicatedProbability)
    ? safeValue(adjudicatedProbability, safeValue(score.probability, 0))
    : safeValue(score.probability, 0);
  const alphaReasons = normalizedReasons.filter((reason) => classifyDecisionBoundaryPlane(reason) === "alpha");
  const permissioningReasons = normalizedReasons.filter((reason) => classifyDecisionBoundaryPlane(reason) === "permissioning");
  const probeEligible = Boolean(probeAdmission?.eligible);
  const probeActivated = Boolean(probeAdmission?.activated);
  const alphaWantedTrade =
    Boolean(strategySummary.activeStrategy) &&
    !Boolean(score.shouldAbstain) &&
    effectiveProbability >= safeValue(alphaThreshold, 0) &&
    alphaReasons.length === 0;
  const alphaNearMiss =
    !alphaWantedTrade &&
    Boolean(strategySummary.activeStrategy) &&
    !Boolean(score.shouldAbstain) &&
    alphaReasons.length > 0 &&
    effectiveProbability >= safeValue(alphaThreshold, 0) - 0.03;
  const denialPlane = allow
    ? "none"
    : alphaWantedTrade && permissioningReasons.length
      ? "permissioning"
      : !alphaWantedTrade && !permissioningReasons.length
        ? "alpha"
        : !alphaWantedTrade && permissioningReasons.length
          ? "mixed"
          : !alphaWantedTrade
            ? "alpha"
            : "permissioning";
  const permissioningCategories = [...new Set(permissioningReasons.map(classifyPermissioningCategory))];
  const alphaStatus = alphaWantedTrade
    ? "wanted_trade"
    : !strategySummary.activeStrategy
      ? "no_setup"
      : alphaNearMiss
        ? "near_miss"
        : "rejected";
  const permissioningAllowed = allow || permissioningReasons.length === 0;
  const hardPermissioningBlock = permissioningReasons.some((reason) =>
    HARD_SAFETY_BLOCKERS.has(reason) ||
    [
      "exchange_truth_freeze",
      "exchange_safety_blocked",
      "exchange_safety_symbol_blocked",
      "reconcile_required",
      "lifecycle_attention_required",
      "operator_ack_required"
    ].includes(reason)
  );
  const softGovernanceBlocked =
    !allow &&
    !probeEligible &&
    Boolean(probeAdmission?.softBlockedOnly) &&
    permissioningReasons.length > 0 &&
    !hardPermissioningBlock;
  const permissioningStatus = probeActivated
    ? "probe_allowed"
    : probeEligible
      ? "probe_eligible_soft_blocked"
      : hardPermissioningBlock
        ? "hard_denied"
        : softGovernanceBlocked
          ? "soft_denied"
      : allow
        ? "allowed"
    : alphaWantedTrade && permissioningReasons.length
      ? "denied"
      : !alphaWantedTrade && permissioningReasons.length
        ? "mixed_denial"
        : "not_reached";
  return {
    alpha: {
      wantedTrade: alphaWantedTrade,
      status: alphaStatus,
      probability: num(effectiveProbability, 4),
      rawModelProbability: num(safeValue(score.probability, 0), 4),
      alphaThreshold: num(alphaThreshold, 4),
      effectiveThreshold: num(effectiveThreshold, 4),
      edgeToAlphaThreshold: num(effectiveProbability - safeValue(alphaThreshold, 0), 4),
      setupQualityScore: num(safeValue(setupQuality.score, 0), 4),
      setupQualityTier: setupQuality.tier || "weak",
      strategy: strategySummary.activeStrategy || null,
      family: strategySummary.family || null,
      primaryReason: alphaReasons[0] || null,
      reasons: alphaReasons,
      approvalReasons: (Array.isArray(approvalReasons) ? approvalReasons : []).slice(0, 4),
      lowConfidenceDriver: lowConfidencePressure.primaryDriver || null
    },
    permissioning: {
      allowed: permissioningAllowed,
      status: permissioningStatus,
      primaryReason: permissioningReasons[0] || null,
      reasons: permissioningReasons,
      categories: permissioningCategories,
      primaryCategory: permissioningCategories[0] || null
    },
    probe: {
      eligible: probeEligible,
      activated: probeActivated,
      status: probeActivated
        ? "activated"
        : probeAdmission?.probeRejectedReason
          ? "rejected_after_sizing"
        : probeEligible
          ? "eligible"
          : probeAdmission?.softBlockedOnly
            ? "soft_blocked"
            : "not_applicable",
      softBlockedOnly: Boolean(probeAdmission?.softBlockedOnly),
      primaryReason: probeAdmission?.rootBlocker || probeAdmission?.qualifyingReasons?.[0] || null,
      reasons: [...new Set(probeAdmission?.qualifyingReasons || [])],
      whyNoProbeAttempt: probeAdmission?.probeRejectedReason || probeAdmission?.whyNoProbeAttempt || null,
      rootBlocker: probeAdmission?.rootBlocker || null,
      downstreamBlockers: [...new Set(probeAdmission?.downstreamBlockers || [])],
      metaCautionOverrideEligible: Boolean(probeAdmission?.metaCautionOverrideEligible)
    },
    denialPlane,
    primaryReason: allow ? null : (permissioningReasons[0] || alphaReasons[0] || normalizedReasons[0] || null),
    primaryCategory: allow
      ? null
      : permissioningCategories[0] || (alphaReasons[0] ? "alpha" : null)
  };
}

export function buildConfidenceAdjudication({
  score = {},
  threshold = 0,
  baseThreshold = 0,
  alphaThreshold = 0,
  standardConfidenceThreshold = 0,
  lowConfidencePressure = {},
  setupQuality = {},
  signalQualitySummary = {},
  dataQualitySummary = {},
  confidenceBreakdown = {},
  timeframeSummary = {},
  marketStructureSummary = {},
  newsSummary = {},
  announcementSummary = {},
  reasons = [],
  policyProfile = null,
  botMode = "paper"
} = {}) {
  const blockerDecomposition = buildBlockerDecomposition(reasons);
  const blockerRedundancyScore = clamp(
    blockerDecomposition.redundantBlockers.length / Math.max(1, blockerDecomposition.blockerSequence.length),
    0,
    1
  );
  const simplified = buildSimplifiedConfidenceAdjudication({
    score,
    threshold,
    baseThreshold,
    alphaThreshold,
    lowConfidencePressure,
    setupQuality,
    signalQualitySummary,
    dataQualitySummary,
    confidenceBreakdown,
    reasons,
    policyProfile,
    botMode
  });
  const evidenceSupportScore = safeValue(simplified.confidenceEvidenceScore, 0);
  const hasHardRiskReason = (reasons || []).some((reason) => HARD_SAFETY_BLOCKERS.has(reason));
  const seriousContextRisk =
    safeValue(marketStructureSummary.riskScore, 0) >= 0.72 ||
    safeValue(newsSummary.riskScore, 0) >= 0.72 ||
    safeValue(announcementSummary.riskScore, 0) >= 0.72;
  const confidenceRecoveryEligible =
    simplified.confidenceRecoveryEligible &&
    !hasHardRiskReason &&
    !seriousContextRisk &&
    safeValue(confidenceBreakdown.executionConfidence, 0) >= 0.56 &&
    safeValue(dataQualitySummary.overallScore, 0) >= 0.54;
  const thresholdReliefEligible =
    confidenceRecoveryEligible &&
    (reasons.length === 0 || reasons.includes("model_confidence_too_low")) &&
    safeValue(simplified.finalProbability, safeValue(score.probability, 0)) >= safeValue(standardConfidenceThreshold, 0) - 0.08;
  const rawThresholdRelief = thresholdReliefEligible ? safeValue(simplified.thresholdRelief, 0) : 0;
  const adjudicatedProbability = confidenceRecoveryEligible && botMode === "paper"
    ? clamp(safeValue(simplified.adjudicatedProbability, safeValue(score.probability, 0)), 0, 1)
    : safeValue(score.probability, 0);
  return {
    ...simplified,
    rawProbability: num(safeValue(simplified.rawProbability, safeValue(score.rawProbability, safeValue(score.probability, 0))), 4),
    calibratedProbability: num(safeValue(simplified.calibratedProbability, safeValue(score.probability, 0)), 4),
    effectiveProbability: num(safeValue(simplified.finalProbability, safeValue(score.probability, 0)), 4),
    adjudicatedProbability: num(adjudicatedProbability, 4),
    confidenceEvidenceScore: num(evidenceSupportScore, 4),
    falseNegativeSuspicionScore: num(safeValue(simplified.falseNegativeSuspicionScore, 0), 4),
    blockerRedundancyScore: num(blockerRedundancyScore, 4),
    evidenceSupportScore: num(evidenceSupportScore, 4),
    lowConfidenceDriver: simplified.lowConfidenceDriver,
    confidenceRecoveryEligible,
    confidenceRecoveryReason: confidenceRecoveryEligible
      ? simplified.confidenceRecoveryReason
      : hasHardRiskReason
        ? "hard_safety_blocker_present"
        : seriousContextRisk
          ? "serious_context_risk"
          : "insufficient_evidence_support",
    thresholdReliefEligible,
    thresholdReliefReason: thresholdReliefEligible
      ? simplified.thresholdReliefReason
      : "threshold_relief_not_eligible",
    thresholdRelief: num(rawThresholdRelief, 4),
    blockerDecomposition
  };
}
