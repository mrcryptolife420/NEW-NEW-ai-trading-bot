import {
  buildReplayRegressionFixture,
  compareReplayPackToFixture
} from "../src/runtime/incidentReplayLab.js";
import fs from "node:fs/promises";
import path from "node:path";

const FIXTURE_DIR = path.join(process.cwd(), "test", "fixtures", "replay");

function packFromGoldenFixture(fixture = {}) {
  return {
    incidentId: fixture.incidentId,
    status: "ready",
    symbol: fixture.symbol,
    reason: fixture.reason,
    summary: {
      cycleCount: 1,
      decisionCount: 1,
      tradeCount: 0,
      topDecisionReasons: [fixture.reason],
      topAdaptiveCandidates: []
    },
    decisionReconstruction: {
      rootBlocker: fixture.rootBlocker,
      blockerStage: fixture.blockerStage,
      decisionScores: {
        edge: fixture.finalEdge,
        permissioning: fixture.permissioningScore
      },
      threshold: fixture.threshold,
      thresholdEdge: fixture.finalEdge - fixture.threshold,
      expectedNetEdge: { expectancyScore: fixture.finalEdge }
    },
    timeline: []
  };
}

function regressionFixtureFromGoldenFixture(fixture = {}) {
  return {
    incidentId: fixture.incidentId,
    status: "ready",
    symbol: fixture.symbol,
    reason: fixture.reason,
    summary: {
      cycleCount: 1,
      decisionCount: 1,
      tradeCount: 0,
      topDecisionReasons: [fixture.reason],
      topAdaptiveCandidates: []
    },
    decisionReconstruction: {
      rootBlocker: fixture.rootBlocker,
      blockerStage: fixture.blockerStage,
      decisionScores: {
        edge: fixture.finalEdge,
        permissioning: fixture.permissioningScore
      },
      threshold: fixture.threshold,
      thresholdEdge: fixture.finalEdge - fixture.threshold,
      expectedNetEdge: { expectancyScore: fixture.finalEdge }
    }
  };
}

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

  await runCheck("golden replay fixtures are present and deterministic", async () => {
    const files = (await fs.readdir(FIXTURE_DIR)).filter((fileName) => fileName.endsWith(".json")).sort();
    assert.ok(files.length >= 2);
    for (const fileName of files) {
      const fixture = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, fileName), "utf8"));
      const pack = packFromGoldenFixture(fixture);
      const golden = regressionFixtureFromGoldenFixture(fixture);
      const comparison = compareReplayPackToFixture(pack, golden);
      assert.equal(comparison.deterministic, true);
      assert.equal(pack.decisionReconstruction.rootBlocker, fixture.expectedDiff.rootBlocker || fixture.rootBlocker);
    }
  });

  await runCheck("golden replay fixtures catch root blocker and final edge drift", async () => {
    const fixture = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, "exchange-truth-freeze.json"), "utf8"));
    const pack = packFromGoldenFixture(fixture);
    const golden = regressionFixtureFromGoldenFixture(fixture);
    const changed = compareReplayPackToFixture({
      ...pack,
      decisionReconstruction: {
        ...pack.decisionReconstruction,
        rootBlocker: "model_confidence_too_low",
        decisionScores: {
          ...pack.decisionReconstruction.decisionScores,
          edge: 0.51
        }
      }
    }, golden);
    assert.equal(changed.deterministic, false);
    assert.ok(changed.differences.includes("root_blocker_changed"));
    assert.ok(changed.differences.includes("final_edge_changed"));
  });
}
