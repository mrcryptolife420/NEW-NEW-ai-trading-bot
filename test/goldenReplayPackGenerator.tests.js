import {
  buildGoldenReplayPackCandidates,
  compareGoldenReplayOutput,
  summarizeGoldenReplayPacks
} from "../src/runtime/goldenReplayPackGenerator.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerGoldenReplayPackGeneratorTests({ runCheck, assert }) {
  await runCheck("golden replay pack generator prioritizes bad veto and reconcile uncertainty", async () => {
    const result = buildGoldenReplayPackCandidates({
      samples: [
        { id: "weak", symbol: "SOLUSDT", probeScore: 0.3 },
        { id: "bad", symbol: "ETHUSDT", vetoOutcome: { label: "bad_veto" }, decision: { rootBlocker: "model_confidence_too_low" } },
        { id: "rec", symbol: "BTCUSDT", reconcileSummary: { manualReviewRequired: true }, decision: { rootBlocker: "exchange_truth_freeze" } }
      ],
      configHash: "cfg",
      dataHash: "data",
      seed: "seed",
      limit: 2
    });

    assert.equal(result.status, "ready");
    assert.equal(result.packCount, 2);
    assert.deepEqual(result.packs.map((pack) => pack.packType), ["reconcile_uncertainty", "bad_veto"]);
    assert.equal(result.liveBehaviorChanged, false);
    assert.equal(result.packs.every((pack) => pack.ciSafe && pack.paperOnly), true);
  });

  await runCheck("golden replay pack generator adds stable manifest metadata", async () => {
    const input = {
      samples: [{ id: "bad", symbol: "ETHUSDT", vetoOutcome: { label: "bad_veto" } }],
      configHash: "cfg",
      dataHash: "data",
      seed: "seed",
      createdAt: "2026-05-06T00:00:00.000Z"
    };
    const first = buildGoldenReplayPackCandidates(input);
    const second = buildGoldenReplayPackCandidates(input);

    assert.equal(first.packs[0].manifest.inputHash, second.packs[0].manifest.inputHash);
    assert.equal(first.packs[0].manifest.configHash, "cfg");
    assert.equal(first.packs[0].manifest.dataHash, "data");
    assert.equal(first.packs[0].manifest.seed, "seed");
  });

  await runCheck("golden replay pack comparison detects changed decision output", async () => {
    const result = buildGoldenReplayPackCandidates({
      samples: [{
        id: "freeze",
        symbol: "BTCUSDT",
        failureMode: "reconcile_uncertainty",
        decision: { rootBlocker: "exchange_truth_freeze", threshold: 0.7, finalEdge: 0.42 }
      }],
      configHash: "cfg",
      dataHash: "data"
    });
    const same = compareGoldenReplayOutput({ packCandidate: result.packs[0] });
    const changed = compareGoldenReplayOutput({
      packCandidate: result.packs[0],
      actualPack: {
        ...result.packs[0].pack,
        decisionReconstruction: {
          ...result.packs[0].pack.decisionReconstruction,
          rootBlocker: "model_confidence_too_low"
        }
      }
    });

    assert.equal(same.deterministic, true);
    assert.equal(changed.deterministic, false);
    assert.ok(changed.differences.includes("root_blocker_changed"));
  });

  await runCheck("golden replay pack generator treats missing samples as warning not crash", async () => {
    const result = buildGoldenReplayPackCandidates({ samples: [] });
    const comparison = compareGoldenReplayOutput({});

    assert.equal(result.status, "empty");
    assert.ok(result.warnings.includes("missing_samples"));
    assert.ok(result.warnings.includes("missing_config_hash"));
    assert.equal(comparison.deterministic, false);
    assert.ok(comparison.warnings.includes("missing_replay_pack_or_fixture"));
  });

  await runCheck("golden replay pack summary and dashboard fallback are safe", async () => {
    const result = buildGoldenReplayPackCandidates({
      samples: [{ id: "drag", symbol: "BNBUSDT", failureMode: "execution_drag" }],
      configHash: "cfg",
      dataHash: "data"
    });
    const summary = summarizeGoldenReplayPacks(result);
    const normalized = normalizeDashboardSnapshotPayload({ replay: { goldenReplayPackSummary: summary } });
    const fallback = normalizeDashboardSnapshotPayload({});

    assert.equal(summary.byType.execution_drag, 1);
    assert.equal(normalized.goldenReplayPackSummary.packCount, 1);
    assert.equal(fallback.goldenReplayPackSummary.status, "empty");
    assert.equal(fallback.goldenReplayPackSummary.liveBehaviorChanged, false);
  });
}
