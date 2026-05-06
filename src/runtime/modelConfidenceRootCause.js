import { getReasonDefinition } from "../risk/reasonRegistry.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function reasonCodes(candidate = {}) {
  return [
    candidate.rootBlocker,
    candidate.primaryRootBlocker,
    candidate.blockedReason,
    ...arr(candidate.reasons),
    ...arr(candidate.blockerReasons),
    ...arr(candidate.rejectionReasons)
  ].filter(Boolean).map((reason) => `${reason}`.toLowerCase());
}

function addDriver(drivers, id, weight, reason, evidence = {}) {
  drivers.push({
    id,
    weight: clamp(weight, 0, 1),
    reason,
    evidence: obj(evidence)
  });
}

export function buildModelConfidenceRootCause({
  candidate = {},
  decision = null,
  featureQuality = null,
  calibration = null,
  metaGate = null,
  dataQuality = null,
  execution = null,
  botMode = "paper"
} = {}) {
  const source = obj(decision || candidate);
  const features = obj(featureQuality || source.featureQuality || source.dataQuality || {});
  const quality = obj(dataQuality || source.dataQualityScore || source.dataQualitySummary || {});
  const calibrationSource = obj(calibration || source.calibration || source.confidenceCalibration || source.confidenceBreakdown?.calibration || {});
  const meta = obj(metaGate || source.metaGate || source.metaDecision || source.metaDecisionGate || {});
  const executionSource = obj(execution || source.execution || source.executionPlan || source.executionCost || {});
  const codes = reasonCodes({ ...candidate, ...source });
  const drivers = [];
  const warnings = [];
  const probability = clamp(source.probability ?? source.modelProbability ?? source.score?.probability, 0, 1);
  const confidence = clamp(source.confidence ?? source.modelConfidence ?? source.confidenceBreakdown?.modelConfidence, 0, 1);
  const threshold = clamp(source.threshold ?? source.effectiveThreshold ?? source.score?.threshold, 0, 1);

  const missingFeatures = arr(features.missingFeatures || features.missing || quality.missingFeatures);
  const staleFeatures = arr(features.staleFeatures || features.stale || quality.staleSources);
  if (missingFeatures.length || staleFeatures.length || ["degraded", "blocked", "stale"].includes(`${quality.status || ""}`)) {
    addDriver(drivers, "feature_quality_gap", 0.85, "missing_or_stale_features", {
      missingFeatures,
      staleFeatures,
      dataQualityStatus: quality.status || null
    });
  }
  const calibrationRisk = finite(calibrationSource.calibrationRisk ?? calibrationSource.error ?? calibrationSource.calibrationError, 0);
  const sampleCount = finite(calibrationSource.sampleCount ?? calibrationSource.samples, 0);
  if (calibrationRisk >= 0.12 || calibrationSource.status === "degraded" || (sampleCount > 0 && sampleCount < 30)) {
    addDriver(drivers, "calibration_risk", calibrationRisk >= 0.12 ? 0.8 : 0.55, "calibration_bucket_or_sample_risk", {
      calibrationRisk,
      sampleCount,
      bucket: calibrationSource.bucket || calibrationSource.calibrationBucket || null,
      status: calibrationSource.status || null
    });
  }
  const metaReason = `${meta.reason || meta.blocker || meta.status || ""}`.toLowerCase();
  if (codes.includes("meta_followthrough_caution") || metaReason.includes("follow")) {
    addDriver(drivers, "meta_followthrough_caution", 0.75, "weak_followthrough_evidence", {
      status: meta.status || null,
      reason: meta.reason || null,
      followthroughScore: meta.followthroughScore ?? null
    });
  }
  if (codes.includes("meta_neural_caution") || metaReason.includes("neural")) {
    addDriver(drivers, "meta_neural_caution", 0.55, "meta_neural_disagreement", {
      status: meta.status || null,
      reason: meta.reason || null
    });
  }
  const spreadBps = finite(executionSource.spreadBps ?? executionSource.expectedSpreadBps, 0);
  const slippageBps = finite(executionSource.expectedSlippageBps ?? executionSource.slippageBps, 0);
  if (spreadBps > 35 || slippageBps > 18 || executionSource.status === "degraded") {
    addDriver(drivers, "execution_friction", 0.5, "spread_or_slippage_reduces_confidence", {
      spreadBps,
      slippageBps,
      status: executionSource.status || null
    });
  }
  if (codes.includes("model_confidence_too_low") || confidence < threshold || probability < threshold) {
    addDriver(drivers, "model_probability_below_threshold", 0.7, "model_score_below_required_threshold", {
      probability,
      confidence,
      threshold,
      gap: Number((threshold - Math.max(probability, confidence)).toFixed(4))
    });
  }
  if (!drivers.length) {
    addDriver(drivers, "no_low_confidence_root_cause_detected", 0.1, "positive_or_insufficient_confidence_pressure", {
      probability,
      confidence,
      threshold
    });
  }

  const reasonDefinitions = codes.map((code) => getReasonDefinition(code));
  if (!codes.length) warnings.push("reason_codes_missing");
  if (reasonDefinitions.some((reason) => reason.category === "other")) warnings.push("unknown_reason_code");
  const topDrivers = drivers.sort((left, right) => right.weight - left.weight).slice(0, 6);
  return {
    status: topDrivers[0]?.id === "no_low_confidence_root_cause_detected" ? "watch" : "ready",
    primaryDriver: topDrivers[0]?.id || "unknown",
    drivers: topDrivers,
    reasonCategories: reasonDefinitions.map((reason) => ({
      code: reason.code,
      category: reason.category,
      severityLevel: reason.severityLevel,
      hardSafety: Boolean(reason.hardSafety)
    })),
    separatedBlockers: {
      modelConfidence: codes.includes("model_confidence_too_low"),
      metaFollowthrough: codes.includes("meta_followthrough_caution") || metaReason.includes("follow"),
      metaNeural: codes.includes("meta_neural_caution") || metaReason.includes("neural")
    },
    warnings,
    diagnosticsOnly: true,
    runtimeApplied: false,
    liveBehaviorChanged: false,
    liveThresholdReliefAllowed: false,
    paperOnly: `${botMode}`.toLowerCase() === "paper"
  };
}

export function summarizeModelConfidenceRootCauses(items = []) {
  const summaries = arr(items).map((item) => item?.primaryDriver ? item : buildModelConfidenceRootCause({ candidate: item }));
  const byDriver = {};
  for (const item of summaries) {
    const key = item.primaryDriver || "unknown";
    byDriver[key] = (byDriver[key] || 0) + 1;
  }
  return {
    status: summaries.length ? "ready" : "empty",
    count: summaries.length,
    byDriver,
    top: Object.entries(byDriver)
      .map(([driver, count]) => ({ driver, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
