import { buildFeatureGovernanceDecision } from "../src/runtime/featureGovernanceService.js";

export async function registerFeatureGovernanceTests({
  runCheck,
  assert
}) {
  await runCheck("feature governance resolves per-strategy subsets and shadow-disabled weak groups", async () => {
    const decision = buildFeatureGovernanceDecision({
      featureGovernance: {
        status: "ready",
        attribution: {
          topNegative: [
            { id: "queue_refresh_score", inverseActionability: 0.86, group: "execution" },
            { id: "supertrend_flip", inverseActionability: 0.52, group: "trend" }
          ]
        },
        pruning: {
          recommendations: [
            { id: "queue_refresh_score", action: "drop", group: "execution" }
          ]
        },
        parityAudit: {
          details: [
            { id: "queue_refresh_score", status: "misaligned", group: "execution" }
          ]
        }
      },
      strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
      regimeSummary: { regime: "trend" },
      rawFeatures: {
        queue_refresh_score: 0.9,
        supertrend_flip: 0.6,
        trend_quality: 0.7
      }
    });

    assert.ok(decision.featureSubset.includes("execution"));
    assert.ok(decision.featureSubset.includes("market_structure"));
    assert.ok(decision.shadowDisabledGroups.includes("execution"));
    assert.equal(decision.groupTrust[0].group, "execution");
  });
}
