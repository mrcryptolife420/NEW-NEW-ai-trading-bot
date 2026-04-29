import {
  buildReplayRegressionFixture,
  compareReplayPackToFixture
} from "../src/runtime/incidentReplayLab.js";

export async function registerReplayDeterminismTests({
  runCheck,
  assert
}) {
  await runCheck("replay fixtures stay deterministic and comparison reports policy diffs", async () => {
    const pack = {
      incidentId: "BTCUSDT::meta_gate_caution::2026-04-23T10:00:00",
      status: "ready",
      symbol: "BTCUSDT",
      reason: "meta_gate_caution",
      summary: {
        cycleCount: 2,
        decisionCount: 3,
        tradeCount: 0,
        topDecisionReasons: ["meta_gate_caution"],
        topAdaptiveCandidates: [{ blocker: "meta_gate_caution", confidence: 0.7 }]
      },
      decisionReconstruction: {
        rootBlocker: "meta_gate_caution",
        blockerStage: "governance_gate",
        decisionScores: { edge: 0.61, permissioning: 0.49 },
        threshold: 0.58,
        thresholdEdge: -0.01,
        expectedNetEdge: { expectancyScore: 0.57 }
      },
      timeline: []
    };
    const fixture = buildReplayRegressionFixture(pack);
    const same = compareReplayPackToFixture(pack, fixture);
    const changed = compareReplayPackToFixture({
      ...pack,
      decisionReconstruction: {
        ...pack.decisionReconstruction,
        decisionScores: { edge: 0.53, permissioning: 0.49 }
      }
    }, fixture);

    assert.equal(same.deterministic, true);
    assert.equal(changed.deterministic, false);
    assert.ok(changed.differences.includes("final_edge_changed"));
  });
}
