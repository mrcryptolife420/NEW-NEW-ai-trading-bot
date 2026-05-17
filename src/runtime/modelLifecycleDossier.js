function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, finite(value, min)));
}

function resolveGate(id, passed, detail = {}) {
  return {
    id,
    passed: Boolean(passed),
    status: passed ? "passed" : "blocked",
    detail
  };
}

function resolveLifecycleStatus({ rollbackWatch = {}, canaryGate = {}, proposals = [], evidenceScore = 0 } = {}) {
  const rollbackStatus = `${rollbackWatch.status || rollbackWatch.recommendedAction || ""}`.toLowerCase();
  const canaryStatus = `${canaryGate.status || canaryGate.state || ""}`.toLowerCase();
  if (rollbackStatus.includes("rollback") || rollbackWatch.rollbackRequired === true) return "rollback_required";
  if (canaryStatus.includes("blocked") || canaryGate.allowed === false) return "candidate";
  if (canaryStatus.includes("canary")) return "canary";
  if (canaryStatus.includes("promoted") || canaryStatus.includes("active")) return "promoted";
  if (arr(proposals).length) return evidenceScore >= 0.7 ? "shadow" : "candidate";
  return evidenceScore >= 0.72 ? "observing" : "observing";
}

export function buildCalibrationDriftLab({ calibration = {}, offlineTrainer = {}, nowIso = new Date().toISOString() } = {}) {
  const calibrationError = finite(calibration.calibrationError ?? calibration.expectedCalibrationError ?? calibration.error, 0);
  const bins = arr(calibration.bins || calibration.bucketSummaries || calibration.calibrationBins);
  const tradeCount = finite(calibration.tradeCount ?? offlineTrainer.tradeCount ?? offlineTrainer.retrainReadiness?.paper?.trades, 0);
  const freshnessScore = finite(offlineTrainer.retrainReadiness?.paper?.freshnessScore ?? offlineTrainer.freshnessScore, tradeCount ? 0.7 : 0);
  const driftReasons = [];
  if (tradeCount < 20) driftReasons.push("low_evidence");
  if (calibrationError >= 0.18) driftReasons.push("calibration_error_high");
  if (freshnessScore < 0.4) driftReasons.push("stale_evidence");
  const status = driftReasons.includes("calibration_error_high")
    ? "drift"
    : driftReasons.length
      ? "watch"
      : "calibrated";
  const recommendation = status === "drift"
    ? "restrict_promotion_and_retrain_paper"
    : status === "watch"
      ? "observe_only"
      : "eligible_for_shadow_evidence";
  return {
    status,
    generatedAt: nowIso,
    calibrationError,
    tradeCount,
    freshnessScore: Number(clamp(freshnessScore).toFixed(4)),
    bins: bins.slice(0, 12),
    driftReasons,
    recommendation,
    liveSafetyImpact: "negative_only"
  };
}

export function buildModelLifecycleDossier({
  id = "adaptive-runtime-model",
  mode = "paper",
  modelRegistry = {},
  calibration = {},
  deployment = {},
  offlineTrainer = {},
  onlineAdaptation = {},
  neuralRegistry = {},
  canaryGate = {},
  rollbackWatch = {},
  proposals = [],
  nowIso = new Date().toISOString()
} = {}) {
  const calibrationLab = buildCalibrationDriftLab({ calibration, offlineTrainer, nowIso });
  const snapshots = arr(modelRegistry.snapshots || modelRegistry.recentSnapshots || modelRegistry.items);
  const proposalList = arr(proposals.length ? proposals : neuralRegistry.proposals || neuralRegistry.items);
  const evidenceScore = clamp(
    finite(modelRegistry.readinessScore ?? modelRegistry.score, 0) * 0.28 +
      (calibrationLab.status === "calibrated" ? 0.24 : calibrationLab.status === "watch" ? 0.12 : 0.04) +
      finite(offlineTrainer.retrainReadiness?.paper?.readinessScore ?? offlineTrainer.readinessScore, 0) * 0.22 +
      finite(onlineAdaptation.healthScore ?? onlineAdaptation.score, 0.5) * 0.12 +
      (snapshots.length ? 0.08 : 0) +
      (proposalList.length ? 0.06 : 0),
    0,
    1
  );
  const gates = [
    resolveGate("calibration", calibrationLab.status !== "drift", calibrationLab),
    resolveGate("anti_overfit", canaryGate.antiOverfit?.passed !== false && canaryGate.antiOverfitPassed !== false, canaryGate.antiOverfit || {}),
    resolveGate("walk_forward", canaryGate.walkForward?.passed !== false && neuralRegistry.walkForward?.status !== "failed", canaryGate.walkForward || neuralRegistry.walkForward || {}),
    resolveGate("stress", canaryGate.stress?.passed !== false && neuralRegistry.stress?.status !== "failed", canaryGate.stress || neuralRegistry.stress || {}),
    resolveGate("rollback_ready", rollbackWatch.status !== "missing" && rollbackWatch.rollbackReady !== false, rollbackWatch)
  ];
  const status = resolveLifecycleStatus({ rollbackWatch, canaryGate, proposals: proposalList, evidenceScore });
  return {
    version: 1,
    id,
    status,
    generatedAt: nowIso,
    mode,
    evidenceScore: Number(evidenceScore.toFixed(4)),
    modelCard: {
      id,
      scope: deployment.scope || modelRegistry.scope || "global",
      activeVersion: deployment.version || modelRegistry.activeVersion || snapshots[0]?.id || null,
      evidenceWindow: offlineTrainer.retrainReadiness?.paper?.window || offlineTrainer.evidenceWindow || null,
      featureGroups: arr(offlineTrainer.featureUsefulnessGroups || offlineTrainer.featureGroups).slice(0, 8),
      regimeCoverage: offlineTrainer.regimeDeployment || offlineTrainer.regimeCoverage || {},
      calibrationStatus: calibrationLab.status,
      knownWeaknesses: [
        ...arr(calibrationLab.driftReasons),
        ...arr(offlineTrainer.featureCleanupPlan?.candidates).slice(0, 4).map((item) => item.feature || item.id || "feature_cleanup_candidate")
      ],
      allowedMode: mode === "live" ? "live_negative_only_until_promoted" : "paper_or_shadow",
      rollbackTrigger: rollbackWatch.trigger || rollbackWatch.reason || "calibration_or_canary_drift"
    },
    calibrationDrift: calibrationLab,
    gates,
    proposals: proposalList.slice(0, 12),
    snapshots: snapshots.slice(0, 8),
    rollbackWatch: obj(rollbackWatch),
    canaryGate: obj(canaryGate),
    operatorExplanation: gates.some((gate) => !gate.passed)
      ? `Model lifecycle is ${status}; blocked gate: ${gates.find((gate) => !gate.passed)?.id}.`
      : `Model lifecycle is ${status}; all required gates are currently passing.`,
    liveSafetyImpact: "negative_only"
  };
}

export function buildModelLifecycleBoard(dossiers = []) {
  const items = arr(dossiers);
  const rollbackRequired = items.filter((item) => item.status === "rollback_required");
  const blocked = items.filter((item) => arr(item.gates).some((gate) => !gate.passed));
  return {
    version: 1,
    status: rollbackRequired.length ? "rollback_required" : blocked.length ? "blocked" : items.length ? "ready" : "empty",
    count: items.length,
    rollbackRequired: rollbackRequired.map((item) => item.id),
    blocked: blocked.map((item) => ({ id: item.id, blockedGates: arr(item.gates).filter((gate) => !gate.passed).map((gate) => gate.id) })),
    items
  };
}

