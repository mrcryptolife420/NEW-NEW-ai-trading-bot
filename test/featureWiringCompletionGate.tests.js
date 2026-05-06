import { buildFeatureWiringCompletionGate } from "../src/runtime/featureWiringCompletionGate.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerFeatureWiringCompletionGateTests({ runCheck, assert }) {
  await runCheck("feature wiring completion gate lets complete feature pass", async () => {
    const gate = buildFeatureWiringCompletionGate({
      audit: {
        features: [{
          id: "complete_feature",
          status: "complete",
          classifications: ["complete"],
          activationStage: "diagnostics_only",
          testRefs: ["test/complete.tests.js"],
          dashboardRefs: ["dashboardSummary"],
          liveBehaviorPolicy: "No live behavior change."
        }]
      }
    });

    assert.equal(gate.strictStatus, "pass");
    assert.equal(gate.items[0].gateStatus, "pass");
    assert.equal(gate.liveBehaviorChanged, false);
  });

  await runCheck("feature wiring completion gate respects explicit paper integration metadata", async () => {
    const gate = buildFeatureWiringCompletionGate({
      audit: {
        features: [{
          id: "paper_ready_feature",
          status: "complete",
          classifications: ["complete"],
          activationStage: "paper_only",
          paperModeIntegration: "paper_only",
          testRefs: ["test/paperReady.tests.js"],
          dashboardRefs: ["paperReadySummary"],
          liveBehaviorPolicy: "No live behavior change."
        }]
      }
    });

    assert.equal(gate.strictStatus, "pass");
    assert.equal(gate.items[0].activationStage, "paper_only");
    assert.equal(gate.items[0].paperModeIntegration, "paper_only");
    assert.deepEqual(gate.items[0].warnings, []);
  });

  await runCheck("feature wiring completion gate blocks config-only feature without waiver", async () => {
    const gate = buildFeatureWiringCompletionGate({
      audit: {
        features: [{
          id: "new_config_only_flag",
          status: "config_only",
          classifications: ["config_only"],
          activationStage: "diagnostics_only",
          flags: [{ key: "enableNewConfigOnlyFlag" }]
        }]
      },
      mode: "strict"
    });

    assert.equal(gate.status, "blocked");
    assert.ok(gate.items[0].issues.includes("config_only_feature_without_waiver"));
  });

  await runCheck("feature wiring completion gate accepts documented config placeholder waiver", async () => {
    const gate = buildFeatureWiringCompletionGate({
      audit: {
        features: [{
          id: "enableStrategyRouter",
          status: "config_only",
          classifications: ["config_only"],
          activationStage: "diagnostics_only",
          flags: [{ key: "enableStrategyRouter" }]
        }]
      }
    });

    assert.equal(gate.items[0].waived, true);
    assert.ok(gate.items[0].warnings.includes("documented_waiver_applied"));
    assert.equal(gate.items[0].issues.length, 0);
  });

  await runCheck("feature wiring completion gate rejects paper-only feature without tests", async () => {
    const gate = buildFeatureWiringCompletionGate({
      audit: {
        features: [{
          id: "paper_feature",
          status: "partial",
          classifications: ["missing_tests"],
          activationStage: "paper_only",
          dashboardRefs: ["paperFeatureSummary"]
        }]
      },
      mode: "strict"
    });

    assert.equal(gate.status, "blocked");
    assert.ok(gate.items[0].issues.includes("paper_only_feature_missing_tests"));
  });

  await runCheck("feature wiring completion gate rejects live-impact feature without safety review policy", async () => {
    const gate = buildFeatureWiringCompletionGate({
      audit: {
        features: [{
          id: "live_feature",
          status: "partial",
          classifications: ["live_risk_review_needed"],
          activationStage: "canary",
          testRefs: ["test/liveFeature.tests.js"],
          dashboardRefs: ["liveFeatureSummary"],
          liveBehaviorPolicy: "No policy declared."
        }]
      },
      mode: "strict"
    });

    assert.equal(gate.status, "blocked");
    assert.ok(gate.items[0].issues.includes("live_impact_feature_missing_safety_review_policy"));
  });

  await runCheck("feature wiring completion gate dashboard fallback is safe", async () => {
    const gate = buildFeatureWiringCompletionGate({
      audit: { features: [] }
    });
    const normalized = normalizeDashboardSnapshotPayload({ featureWiringCompletionSummary: gate });
    const fallback = normalizeDashboardSnapshotPayload({});

    assert.equal(normalized.featureWiringCompletionSummary.featureCount, 0);
    assert.equal(fallback.featureWiringCompletionSummary.status, "unavailable");
    assert.equal(fallback.featureWiringCompletionSummary.liveBehaviorChanged, false);
  });
}
