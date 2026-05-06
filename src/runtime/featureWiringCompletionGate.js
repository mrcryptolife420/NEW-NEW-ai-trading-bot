import { normalizeFeatureActivationStage } from "./featureActivationGovernor.js";

const LIVE_STAGES = new Set(["canary", "limited_live", "normal_live"]);
const DEFAULT_WAIVERS = new Set([
  "enableCvdConfirmation",
  "enableLiquidationMagnetContext",
  "enablePriceActionStructure",
  "enableStrategyRouter",
  "enableTrailingProtection"
]);

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  const result = `${value ?? ""}`.trim();
  return result || fallback;
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function hasDashboardVisibility(feature = {}) {
  return arr(feature.dashboardRefs).length > 0 ||
    arr(feature.missingDashboardFields).length === 0 ||
    bool(feature.dashboardVisible) ||
    bool(feature.readModelVisible);
}

function hasTests(feature = {}) {
  return arr(feature.testRefs).length > 0 ||
    arr(feature.tests).length > 0 ||
    bool(feature.hasTests) ||
    bool(feature.testsPassed);
}

function inferStage(feature = {}) {
  return feature.activationStage ||
    feature.initialActivation ||
    feature.initialActivationStage ||
    feature.requestedStage ||
    feature.stage ||
    (feature.liveRisk ? "live_candidate" : null);
}

function inferPaperModeIntegration(feature = {}, stage = "diagnostics_only") {
  const explicit = text(feature.paperModeIntegration);
  if (explicit) return explicit;
  if (stage === "paper_only") return "required";
  if (stage === "shadow_only") return "shadow_only";
  return "not_required";
}

function normalizeGateStage(stage) {
  if (stage === "governance_only" || stage === "live_candidate") return stage;
  return normalizeFeatureActivationStage(stage || "diagnostics_only");
}

function waived(feature = {}, waiverSet = DEFAULT_WAIVERS) {
  const id = text(feature.id);
  if (waiverSet.has(id)) return true;
  return arr(feature.flags).some((flag) => waiverSet.has(text(flag.key || flag)));
}

function evaluateFeature(feature = {}, waiverSet = DEFAULT_WAIVERS) {
  const id = text(feature.id, "unknown_feature");
  const classifications = arr(feature.classifications);
  const status = text(feature.status || classifications[0], "unknown");
  const stageRaw = inferStage(feature);
  const stage = normalizeGateStage(stageRaw);
  const testsPresent = hasTests(feature);
  const dashboardVisible = hasDashboardVisibility(feature);
  const isWaived = waived(feature, waiverSet);
  const issues = [];
  const warnings = [];

  if (!stageRaw) {
    warnings.push("activation_stage_missing");
  }
  if (classifications.includes("config_only") && !isWaived) {
    issues.push("config_only_feature_without_waiver");
  }
  if (stage === "paper_only" && !testsPresent) {
    issues.push("paper_only_feature_missing_tests");
  }
  if (stage === "paper_only" && !dashboardVisible) {
    issues.push("paper_only_feature_missing_dashboard_or_readmodel_visibility");
  }
  if ((LIVE_STAGES.has(stage) || stage === "live_candidate") && !/review/i.test(text(feature.liveBehaviorPolicy))) {
    issues.push("live_impact_feature_missing_safety_review_policy");
  }
  if (classifications.includes("missing_tests") && !testsPresent) {
    warnings.push("audit_reports_missing_tests");
  }
  if (classifications.includes("missing_dashboard") && !dashboardVisible) {
    warnings.push("audit_reports_missing_dashboard_visibility");
  }
  if (classifications.includes("module_exists_but_unused")) {
    warnings.push("module_exists_but_not_wired");
  }
  if (isWaived) {
    warnings.push("documented_waiver_applied");
  }

  const gateStatus = issues.length ? "blocked" : warnings.length ? "warn" : "pass";
  return {
    id,
    gateStatus,
    activationStage: stage,
    paperModeIntegration: inferPaperModeIntegration(feature, stage),
    issues,
    warnings: [...new Set(warnings)],
    testsPresent,
    dashboardVisible,
    waived: isWaived,
    liveBehaviorPolicy: feature.liveBehaviorPolicy || "No live behavior change declared.",
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function buildFeatureWiringCompletionGate({
  audit = {},
  waivers = [],
  mode = "warn"
} = {}) {
  const waiverSet = new Set([...DEFAULT_WAIVERS, ...arr(waivers)]);
  const features = arr(audit.features);
  const items = features.map((feature) => evaluateFeature(feature, waiverSet));
  const blocked = items.filter((item) => item.gateStatus === "blocked");
  const warned = items.filter((item) => item.gateStatus === "warn");
  const status = blocked.length ? "blocked" : warned.length ? "warn" : "pass";
  return {
    status: mode === "warn" && status === "blocked" ? "warn" : status,
    strictStatus: status,
    mode,
    featureCount: items.length,
    blockedCount: blocked.length,
    warningCount: warned.length,
    passCount: items.filter((item) => item.gateStatus === "pass").length,
    items,
    waiverIds: [...waiverSet].sort(),
    recommendedAction: blocked.length
      ? "complete_or_waive_blocked_feature_wiring_before_behavior_activation"
      : warned.length
        ? "review_warned_feature_visibility_before_treating_as_complete"
        : "feature_wiring_completion_gate_passed",
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
