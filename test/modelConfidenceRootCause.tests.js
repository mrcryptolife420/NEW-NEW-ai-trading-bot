import {
  buildModelConfidenceRootCause,
  summarizeModelConfidenceRootCauses
} from "../src/runtime/modelConfidenceRootCause.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerModelConfidenceRootCauseTests({ runCheck, assert }) {
  await runCheck("model confidence root cause explains missing and stale features", async () => {
    const result = buildModelConfidenceRootCause({
      candidate: {
        reasons: ["model_confidence_too_low"],
        probability: 0.42,
        threshold: 0.58,
        featureQuality: {
          missingFeatures: ["bookPressure"],
          staleFeatures: ["volumeZ"]
        }
      }
    });
    assert.equal(result.primaryDriver, "feature_quality_gap");
    assert.ok(result.drivers.some((driver) => driver.id === "model_probability_below_threshold"));
    assert.equal(result.diagnosticsOnly, true);
    assert.equal(result.liveThresholdReliefAllowed, false);
  });

  await runCheck("model confidence root cause explains calibration risk", async () => {
    const result = buildModelConfidenceRootCause({
      candidate: {
        reasons: ["model_confidence_too_low"],
        probability: 0.55,
        threshold: 0.6,
        calibration: {
          calibrationRisk: 0.18,
          sampleCount: 80,
          bucket: "0.5-0.6"
        }
      }
    });
    assert.equal(result.primaryDriver, "calibration_risk");
    assert.equal(result.drivers[0].evidence.bucket, "0.5-0.6");
  });

  await runCheck("model confidence root cause separates meta followthrough caution", async () => {
    const result = buildModelConfidenceRootCause({
      candidate: {
        reasons: ["meta_followthrough_caution", "model_confidence_too_low"],
        probability: 0.49,
        threshold: 0.57,
        metaGate: {
          status: "caution",
          reason: "followthrough_weak",
          followthroughScore: 0.22
        }
      }
    });
    assert.equal(result.separatedBlockers.metaFollowthrough, true);
    assert.equal(result.separatedBlockers.modelConfidence, true);
    assert.ok(result.drivers.some((driver) => driver.id === "meta_followthrough_caution"));
  });

  await runCheck("model confidence root cause unknown reason falls back safely", async () => {
    const result = buildModelConfidenceRootCause({
      candidate: {
        reasons: ["unknown_new_blocker"],
        probability: 0.7,
        threshold: 0.6
      }
    });
    assert.ok(result.warnings.includes("unknown_reason_code"));
    assert.equal(result.reasonCategories[0].category, "other");
    assert.equal(result.reasonCategories[0].severityLevel, 3);
  });

  await runCheck("positive confidence evidence never relaxes live gates", async () => {
    const result = buildModelConfidenceRootCause({
      botMode: "live",
      candidate: {
        reasons: [],
        probability: 0.75,
        threshold: 0.6,
        confidence: 0.8
      }
    });
    assert.equal(result.status, "watch");
    assert.equal(result.primaryDriver, "no_low_confidence_root_cause_detected");
    assert.equal(result.liveBehaviorChanged, false);
    assert.equal(result.liveThresholdReliefAllowed, false);
    assert.equal(result.paperOnly, false);
  });

  await runCheck("model confidence root cause summary and dashboard fallback are safe", async () => {
    const summary = summarizeModelConfidenceRootCauses([
      buildModelConfidenceRootCause({ candidate: { reasons: ["model_confidence_too_low"], probability: 0.3, threshold: 0.6 } }),
      buildModelConfidenceRootCause({ candidate: { reasons: ["meta_followthrough_caution"], metaGate: { reason: "followthrough_weak" } } })
    ]);
    assert.equal(summary.status, "ready");
    assert.equal(summary.count, 2);
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.modelConfidenceRootCauseSummary.status, "empty");
    const normalized = normalizeDashboardSnapshotPayload({ modelConfidenceRootCauseSummary: summary });
    assert.equal(normalized.modelConfidenceRootCauseSummary.count, 2);
  });
}
