import {
  buildConfidenceCalibrationSummary,
  evaluateConfidenceCalibrationPromotion
} from "../src/ai/confidenceCalibration.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function samples(count, confidence, winRate) {
  return Array.from({ length: count }, (_, index) => ({
    confidence,
    win: index < Math.round(count * winRate)
  }));
}

export async function registerConfidenceCalibrationTests({ runCheck, assert }) {
  await runCheck("confidence calibration monitor reports calibrated buckets", async () => {
    const summary = buildConfidenceCalibrationSummary({
      samples: samples(30, 0.62, 0.63),
      minSamples: 20,
      minBucketSamples: 3,
      errorThreshold: 0.12
    });
    assert.equal(summary.status, "calibrated");
    assert.equal(summary.promotionBlock, false);
    assert.ok(summary.expectedCalibrationError < 0.12);
  });

  await runCheck("confidence calibration monitor warns on overconfidence", async () => {
    const summary = buildConfidenceCalibrationSummary({
      samples: samples(30, 0.82, 0.4),
      minSamples: 20,
      minBucketSamples: 3,
      errorThreshold: 0.12
    });
    assert.equal(summary.status, "overconfident");
    assert.equal(summary.promotionBlock, true);
    assert.ok(summary.warnings.includes("confidence_calibration_overconfident"));
  });

  await runCheck("confidence calibration monitor warns on underconfidence", async () => {
    const summary = buildConfidenceCalibrationSummary({
      samples: samples(30, 0.35, 0.8),
      minSamples: 20,
      minBucketSamples: 3,
      errorThreshold: 0.12
    });
    assert.equal(summary.status, "underconfident");
    assert.equal(summary.promotionBlock, false);
    assert.ok(summary.warnings.includes("confidence_calibration_underconfident"));
  });

  await runCheck("confidence calibration monitor handles low sample cases safely", async () => {
    const summary = buildConfidenceCalibrationSummary({
      samples: samples(4, 0.9, 0.25),
      minSamples: 20
    });
    assert.equal(summary.status, "low_sample");
    assert.equal(summary.promotionBlock, true);
    assert.equal(Number.isFinite(summary.expectedCalibrationError), true);
  });

  await runCheck("confidence calibration promotion review blocks bad calibration via anti-overfit", async () => {
    const summary = buildConfidenceCalibrationSummary({
      samples: samples(30, 0.86, 0.3),
      minSamples: 20
    });
    const review = evaluateConfidenceCalibrationPromotion({
      summary,
      proposedChanges: [{ key: "model_promotion", promoteTo: "live" }],
      config: { antiOverfitMinSamples: 20 }
    });
    assert.equal(review.status, "blocked");
    assert.equal(review.calibrationPromotionBlocked, true);
    assert.ok(review.reasons.includes("parameter_promotion_calibration_worsened"));
  });

  await runCheck("dashboard normalizer keeps confidence calibration summary optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.confidenceCalibrationSummary.status, "unavailable");

    const nested = normalizeDashboardSnapshotPayload({
      learningAnalytics: {
        confidenceCalibrationSummary: { status: "overconfident", sampleCount: 24 }
      }
    });
    assert.equal(nested.confidenceCalibrationSummary.status, "overconfident");
    assert.equal(nested.confidenceCalibrationSummary.sampleCount, 24);
  });
}
