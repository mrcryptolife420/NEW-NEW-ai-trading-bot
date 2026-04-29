import { DataRecorder } from "../src/runtime/dataRecorder.js";
import { buildIncidentReplayPack } from "../src/runtime/incidentReplayLab.js";
import { ReplayLabService } from "../src/runtime/replayLabService.js";

export async function registerIncidentReplayLabTests({
  runCheck,
  assert,
  fs,
  os,
  path
}) {
  await runCheck("incident replay lab builds deterministic packs from recorded frames", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-incident-replay-"));
    const recorder = new DataRecorder({
      runtimeDir,
      config: { dataRecorderEnabled: true },
      logger: { warn() {}, info() {}, error() {} }
    });
    await recorder.init();
    const at = "2026-04-22T11:00:00.000Z";
    await recorder.recordCycle({
      at,
      mode: "paper",
      candidates: [],
      openedPosition: null,
      overview: { openPositions: 1, equity: 10000, quoteFree: 9500 }
    });
    await recorder.write("decisions", at, {
      frameType: "decision",
      at,
      symbol: "BTCUSDT",
      reasons: ["hard_inventory_conflict"],
      blockers: ["hard_inventory_conflict"]
    });
    await recorder.recordTrade({
      symbol: "BTCUSDT",
      entryAt: at,
      exitAt: at,
      pnlQuote: -12,
      netPnlPct: -0.01,
      brokerMode: "paper",
      entryRationale: {
        strategySummary: { family: "trend_following" },
        regimeSummary: { regime: "trend" }
      }
    });
    await recorder.recordNewsHistory({
      at,
      symbol: "BTCUSDT",
      summary: { dominantEventType: "exchange", coverage: 1 },
      items: [{ title: "Demo incident" }]
    });
    await recorder.recordContextHistory({
      at,
      symbol: "BTCUSDT",
      kind: "exchange_truth",
      summary: { issue: "hard_inventory_conflict" },
      items: [{ issue: "hard_inventory_conflict" }]
    });
    await recorder.recordSnapshotManifest({
      at,
      mode: "paper",
      overview: { equity: 10000, quoteFree: 9500, openPositions: 1 },
      ops: { readiness: { reasons: ["exchange_truth_freeze"] } },
      report: {}
    });

    const pack = await buildIncidentReplayPack({
      dataRecorder: recorder,
      symbol: "BTCUSDT",
      reason: "hard_inventory_conflict"
    });

    assert.equal(pack.symbol, "BTCUSDT");
    assert.equal(pack.reason, "hard_inventory_conflict");
    assert.ok(pack.timeline.length >= 1);
    assert.ok((pack.summary?.decisionCount || 0) >= 1);
    assert.ok(Object.keys(pack.buckets || {}).includes("decisions"));
  });

  await runCheck("incident replay lab includes reject-learning review and decision reconstruction", async () => {
    const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-incident-review-"));
    const recorder = new DataRecorder({
      runtimeDir,
      config: { dataRecorderEnabled: true },
      logger: { warn() {}, info() {}, error() {} }
    });
    await recorder.init();
    const rejectTimes = [
      "2026-04-22T10:00:00.000Z",
      "2026-04-22T10:05:00.000Z",
      "2026-04-22T10:10:00.000Z",
      "2026-04-22T10:15:00.000Z",
      "2026-04-22T10:20:00.000Z",
      "2026-04-22T10:25:00.000Z"
    ];
    const referencePrices = [100, 100.4, 100.8, 101.1, 101.6, 101.9];
    for (let index = 0; index < rejectTimes.length; index += 1) {
      await recorder.write("decisions", rejectTimes[index], {
        frameType: "decision",
        at: rejectTimes[index],
        symbol: "ETHUSDT",
        allow: false,
        rootBlocker: "meta_followthrough_caution",
        blockerStage: "governance",
        reasons: ["meta_followthrough_caution"],
        blockers: ["meta_followthrough_caution"],
        decisionScores: { edge: 0.71 - index * 0.01, permissioning: 0.41 + index * 0.01 },
        referencePrice: referencePrices[index],
        stopLossPct: 0.02
      });
    }
    const at2 = "2026-04-22T11:10:00.000Z";
    await recorder.write("decisions", at2, {
      frameType: "decision",
      at: at2,
      symbol: "ETHUSDT",
      allow: true,
      reasons: [],
      blockers: [],
      decisionScores: { edge: 0.74, permissioning: 0.62 },
      referencePrice: 104.5,
      stopLossPct: 0.02
    });
    await recorder.recordSnapshotManifest({
      at: at2,
      mode: "paper",
      overview: { equity: 10000, quoteFree: 9300, openPositions: 0 },
      ops: { readiness: { status: "ready" } },
      report: {}
    });

    const service = new ReplayLabService({
      config: { projectRoot: runtimeDir },
      dataRecorder: recorder
    });
    const result = await service.run({
      symbol: "ETHUSDT",
      reason: "meta_followthrough_caution"
    });

    assert.ok((result.rejectLearningReview?.decisions || []).length >= 2);
    assert.ok((result.rejectLearningReview?.blockerStats || []).length >= 1);
    assert.equal(result.rejectLearningReview.blockerStats[0].blocker, "meta_followthrough_caution");
    assert.ok((result.rejectLearningReview.blockerStats[0].averageMissedR || 0) > 0.7);
    assert.ok((result.rejectLearningReview.adaptiveCandidates || []).length >= 1);
    assert.equal(result.decisionReconstruction?.rootBlocker, "meta_followthrough_caution");
    assert.equal(result.decisionReconstruction?.blockerStage, "governance");
    assert.ok((result.summary?.topAdaptiveCandidates || []).length >= 1);
  });
}
