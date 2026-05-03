const STAGES = ["diagnostics_only", "shadow_only", "paper_only", "canary", "limited_live", "normal_live"];
const LIVE_STAGES = new Set(["canary", "limited_live", "normal_live"]);

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function text(value, fallback = "") {
  const result = `${value ?? ""}`.trim();
  return result || fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeFeatureActivationStage(stage, fallback = "diagnostics_only") {
  const normalized = text(stage, fallback).toLowerCase();
  return STAGES.includes(normalized) ? normalized : fallback;
}

function hasTests(feature = {}, evidence = {}) {
  return bool(feature.testsPassed) || bool(feature.hasTests) || bool(evidence.testsPassed) || bool(evidence.hasTests);
}

function fallbackSafe(feature = {}, evidence = {}) {
  return bool(feature.fallbackSafe) || bool(evidence.fallbackSafe);
}

function resolveBotMode(config = {}, runtimeState = {}) {
  return text(runtimeState.botMode || runtimeState.mode || config.botMode || config.BOT_MODE, "paper").toLowerCase();
}

function paperActivationExplicitlyAllowed(config = {}) {
  return bool(config.allowAutoPaperFeatureActivation) ||
    bool(config.enableFeaturePaperActivation) ||
    bool(config.featureActivationAllowPaper) ||
    bool(config.FEATURE_ACTIVATION_ALLOW_PAPER);
}

function liveActivationExplicitlyAllowed(config = {}) {
  return bool(config.allowLiveFeatureActivation) ||
    bool(config.featureActivationAllowLive) ||
    bool(config.FEATURE_ACTIVATION_ALLOW_LIVE);
}

function downgradeStage({ safe, tested, botMode, config }) {
  if (botMode === "paper" && paperActivationExplicitlyAllowed(config) && safe && tested) {
    return "paper_only";
  }
  return safe && tested ? "shadow_only" : "diagnostics_only";
}

export function buildFeatureActivationDecision({
  feature = {},
  requestedStage,
  evidence = {},
  config = {},
  runtimeState = {},
  antiOverfitReview = {},
  paperLiveParitySummary = {},
  safetyReview = {},
  canaryReview = {}
} = {}) {
  const featureId = text(feature.id || feature.name, "unknown_feature");
  const botMode = resolveBotMode(config, runtimeState);
  const requested = normalizeFeatureActivationStage(requestedStage || feature.requestedStage || feature.stage || config.defaultFeatureActivationStage);
  const safe = fallbackSafe(feature, evidence);
  const tested = hasTests(feature, evidence);
  const reasons = [];
  const warnings = [];
  const hardSafetyBypass = bool(feature.hardSafetyBypass) ||
    bool(feature.proposesHardSafetyBypass) ||
    bool(evidence.hardSafetyBypass);

  if (hardSafetyBypass) {
    reasons.push("hard_safety_bypass_forbidden");
  }
  if (!safe && requested !== "diagnostics_only") {
    reasons.push("feature_not_fallback_safe");
  }
  if (!tested && requested !== "diagnostics_only") {
    reasons.push("feature_missing_tests");
  }

  let effectiveStage = requested;
  if (hardSafetyBypass) {
    effectiveStage = "diagnostics_only";
  } else if (requested === "shadow_only") {
    effectiveStage = safe && tested ? "shadow_only" : "diagnostics_only";
  } else if (requested === "paper_only") {
    if (botMode !== "paper") reasons.push("paper_activation_requires_paper_bot_mode");
    if (!paperActivationExplicitlyAllowed(config)) reasons.push("paper_activation_requires_explicit_config");
    effectiveStage = botMode === "paper" && paperActivationExplicitlyAllowed(config) && safe && tested
      ? "paper_only"
      : safe && tested
        ? "shadow_only"
        : "diagnostics_only";
  } else if (LIVE_STAGES.has(requested)) {
    const antiBlocked = antiOverfitReview.status === "blocked" || arr(antiOverfitReview.reasons).length > 0;
    const parityBad = ["paper_too_optimistic", "insufficient_sample"].includes(paperLiveParitySummary.status);
    if (bool(feature.autoPromote) || bool(evidence.autoPromote)) reasons.push("automatic_live_promotion_forbidden");
    if (!liveActivationExplicitlyAllowed(config)) reasons.push("live_activation_requires_explicit_config");
    if (antiBlocked) reasons.push("anti_overfit_review_blocked");
    if (parityBad) reasons.push("paper_live_parity_not_ready");
    if (!bool(safetyReview.passed)) reasons.push("live_safety_review_required");
    if (!bool(canaryReview.passed)) reasons.push("canary_review_required");
    effectiveStage = safe &&
      tested &&
      liveActivationExplicitlyAllowed(config) &&
      !antiBlocked &&
      !parityBad &&
      bool(safetyReview.passed) &&
      bool(canaryReview.passed) &&
      !bool(feature.autoPromote) &&
      !bool(evidence.autoPromote)
        ? requested
        : downgradeStage({ safe, tested, botMode, config });
  }

  if (effectiveStage === "diagnostics_only") warnings.push("feature_has_no_trade_impact");
  if (effectiveStage === "shadow_only") warnings.push("feature_shadow_only_no_orders");
  if (effectiveStage === "paper_only") warnings.push("feature_paper_only_no_live_impact");
  if (LIVE_STAGES.has(effectiveStage)) warnings.push("feature_live_impact_requires_existing_live_risk_limits");

  return {
    featureId,
    requestedStage: requested,
    effectiveStage,
    status: reasons.length ? "restricted" : "allowed",
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
    diagnosticsOnly: effectiveStage === "diagnostics_only",
    shadowOnly: effectiveStage === "shadow_only",
    paperOnly: effectiveStage === "paper_only",
    paperImpactAllowed: effectiveStage === "paper_only" && botMode === "paper",
    liveImpactAllowed: LIVE_STAGES.has(effectiveStage),
    hardSafetyInvariant: {
      hardSafetyBypassAllowed: false,
      paperMayBypassHardSafety: false,
      automaticLivePromotionAllowed: false
    },
    evidence: {
      botMode,
      fallbackSafe: safe,
      testsPassed: tested,
      paperActivationExplicitlyAllowed: paperActivationExplicitlyAllowed(config),
      liveActivationExplicitlyAllowed: liveActivationExplicitlyAllowed(config)
    }
  };
}

export function summarizeFeatureActivationDecisions(decisions = []) {
  const items = arr(decisions);
  const countsByStage = Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  for (const item of items) {
    countsByStage[normalizeFeatureActivationStage(item.effectiveStage)] += 1;
  }
  return {
    status: items.some((item) => item.liveImpactAllowed) ? "live_review_required" : "safe",
    count: items.length,
    countsByStage,
    restrictedCount: items.filter((item) => item.status === "restricted").length,
    liveImpactCount: items.filter((item) => item.liveImpactAllowed).length,
    recommendedAction: items.some((item) => item.liveImpactAllowed)
      ? "verify_canary_safety_review_before_live_use"
      : "keep_new_features_diagnostics_shadow_or_paper_until_evidence_matures"
  };
}
