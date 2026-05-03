import { evaluateAntiOverfitGovernor } from "./antiOverfitGovernor.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, num(value, min)));
}

function resolveOutcome(sample = {}) {
  if (typeof sample.win === "boolean") {
    return sample.win ? 1 : 0;
  }
  if (typeof sample.outcome === "boolean") {
    return sample.outcome ? 1 : 0;
  }
  if (Number.isFinite(Number(sample.outcome))) {
    return clamp(sample.outcome, 0, 1);
  }
  if (Number.isFinite(Number(sample.labelScore))) {
    return clamp(sample.labelScore, 0, 1);
  }
  if (Number.isFinite(Number(sample.pnlQuote ?? sample.netPnlQuote ?? sample.pnl))) {
    return Number(sample.pnlQuote ?? sample.netPnlQuote ?? sample.pnl) > 0 ? 1 : 0;
  }
  if (Number.isFinite(Number(sample.netPnlPct))) {
    return Number(sample.netPnlPct) > 0 ? 1 : 0;
  }
  return null;
}

function resolveConfidence(sample = {}) {
  const value = sample.confidence ?? sample.modelConfidence ?? sample.probability ?? sample.predictedProbability;
  return Number.isFinite(Number(value)) ? clamp(value, 0, 1) : null;
}

function buildBucket(index, totalBuckets) {
  const lower = index / totalBuckets;
  const upper = (index + 1) / totalBuckets;
  return {
    index,
    lower,
    upper,
    sampleCount: 0,
    avgConfidence: 0,
    realizedWinRate: 0,
    calibrationError: 0,
    status: "empty"
  };
}

function classifyBucket({ sampleCount, avgConfidence, realizedWinRate, minBucketSamples, threshold }) {
  if (sampleCount <= 0) {
    return "empty";
  }
  if (sampleCount < minBucketSamples) {
    return "low_sample";
  }
  const error = avgConfidence - realizedWinRate;
  if (error > threshold) {
    return "overconfident";
  }
  if (error < -threshold) {
    return "underconfident";
  }
  return "calibrated";
}

function classifySummary({ sampleCount, minSamples, buckets, expectedCalibrationError, threshold }) {
  if (sampleCount <= 0) {
    return "empty";
  }
  if (sampleCount < minSamples) {
    return "low_sample";
  }
  const overconfident = buckets.some((bucket) => bucket.status === "overconfident");
  const underconfident = buckets.some((bucket) => bucket.status === "underconfident");
  if (overconfident && underconfident) {
    return "mixed";
  }
  if (overconfident) {
    return "overconfident";
  }
  if (underconfident) {
    return "underconfident";
  }
  return expectedCalibrationError > threshold ? "mixed" : "calibrated";
}

export function buildConfidenceCalibrationSummary({
  samples = [],
  bucketCount = 5,
  minSamples = 20,
  minBucketSamples = 3,
  errorThreshold = 0.12
} = {}) {
  const totalBuckets = Math.max(2, Math.min(20, Math.round(num(bucketCount, 5))));
  const buckets = Array.from({ length: totalBuckets }, (_, index) => buildBucket(index, totalBuckets));
  const normalized = arr(samples)
    .map((sample) => ({
      confidence: resolveConfidence(sample),
      outcome: resolveOutcome(sample)
    }))
    .filter((sample) => sample.confidence !== null && sample.outcome !== null);

  for (const sample of normalized) {
    const index = Math.min(totalBuckets - 1, Math.floor(sample.confidence * totalBuckets));
    const bucket = buckets[index];
    bucket.sampleCount += 1;
    bucket.avgConfidence += sample.confidence;
    bucket.realizedWinRate += sample.outcome;
  }

  for (const bucket of buckets) {
    if (bucket.sampleCount > 0) {
      bucket.avgConfidence = bucket.avgConfidence / bucket.sampleCount;
      bucket.realizedWinRate = bucket.realizedWinRate / bucket.sampleCount;
      bucket.calibrationError = bucket.avgConfidence - bucket.realizedWinRate;
    }
    bucket.status = classifyBucket({
      sampleCount: bucket.sampleCount,
      avgConfidence: bucket.avgConfidence,
      realizedWinRate: bucket.realizedWinRate,
      minBucketSamples,
      threshold: errorThreshold
    });
  }

  const sampleCount = normalized.length;
  const expectedCalibrationError = buckets.reduce(
    (total, bucket) => total + Math.abs(bucket.calibrationError) * (bucket.sampleCount / Math.max(sampleCount, 1)),
    0
  );
  const status = classifySummary({
    sampleCount,
    minSamples,
    buckets,
    expectedCalibrationError,
    threshold: errorThreshold
  });
  const warnings = [];
  if (status === "low_sample") {
    warnings.push("confidence_calibration_low_sample");
  }
  if (["overconfident", "underconfident", "mixed"].includes(status)) {
    warnings.push(`confidence_calibration_${status}`);
  }

  return {
    status,
    sampleCount,
    minSamples,
    expectedCalibrationError,
    buckets,
    warnings,
    promotionBlock: ["overconfident", "mixed", "low_sample"].includes(status),
    recommendedAction: warnings.length
      ? "keep_model_changes_shadow_or_paper_until_calibration_improves"
      : "calibration_ready_for_governance_review"
  };
}

export function evaluateConfidenceCalibrationPromotion({
  summary = {},
  proposedChanges = [{ key: "model_promotion", promoteTo: "live" }],
  config = {}
} = {}) {
  const calibrationDelta = ["overconfident", "mixed"].includes(summary.status)
    ? Math.max(num(summary.expectedCalibrationError, 0), 0.001)
    : 0;
  const review = evaluateAntiOverfitGovernor({
    proposedChanges,
    evidence: {
      sampleSize: num(summary.sampleCount, 0),
      calibrationDelta,
      source: "confidence_calibration",
      confidenceCalibrationStatus: summary.status || "unknown"
    },
    config
  });
  return {
    ...review,
    confidenceCalibrationStatus: summary.status || "unknown",
    calibrationPromotionBlocked: Boolean(summary.promotionBlock) || review.status === "blocked"
  };
}
