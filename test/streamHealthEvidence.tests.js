import {
  annotatePaperCandidateStreamEvidence,
  buildStreamHealthEvidence
} from "../src/runtime/streamHealthEvidence.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

const now = "2026-05-05T12:00:00.000Z";

export async function registerStreamHealthEvidenceTests({ runCheck, assert }) {
  await runCheck("stream health evidence marks healthy streams ready", async () => {
    const summary = buildStreamHealthEvidence({
      now,
      streamStatus: {
        connected: true,
        lastMessageAt: "2026-05-05T11:59:50.000Z",
        localBook: { syncedSymbols: 4, expectedSymbols: 4, streamPrimary: true }
      },
      userStreamStatus: {
        expected: true,
        connected: true,
        lastMessageAt: "2026-05-05T11:59:55.000Z"
      },
      requestBudget: { usedWeight1m: 120, topRestCallers: {} },
      config: { requestWeightWarnThreshold1m: 1200 }
    });
    assert.equal(summary.status, "ready");
    assert.equal(summary.streamReplacementAvailable.publicMarketData, true);
    assert.equal(summary.streamReplacementAvailable.localOrderBook, true);
    assert.equal(summary.learningEvidenceEligible, true);
    assert.equal(summary.forceUnlock, false);
    assert.equal(summary.liveSafetyUnchanged, true);
  });

  await runCheck("stream health evidence flags stale user stream for live readiness diagnostics", async () => {
    const summary = buildStreamHealthEvidence({
      now,
      streamStatus: {
        connected: true,
        lastMessageAt: "2026-05-05T11:59:50.000Z",
        localBook: { syncedSymbols: 3, expectedSymbols: 3, streamPrimary: true }
      },
      userStreamStatus: {
        expected: true,
        connected: false,
        lastMessageAt: "2026-05-05T11:45:00.000Z"
      },
      requestBudget: {
        usedWeight1m: 200,
        topRestCallers: {
          "spot_private:GET /api/v3/openOrders": { weight: 40 }
        }
      },
      config: { streamHealthUserStaleMs: 120_000 }
    });
    assert.equal(summary.status, "private_stream_gap_using_rest");
    assert.ok(summary.reasons.includes("user_stream_stale"));
    assert.equal(summary.learningEvidenceEligible, false);
    assert.equal(summary.recommendedAction, "restore_user_data_stream_keep_private_rest_sanity_only");
  });

  await runCheck("stream health evidence explains local book stream not ready and guarded depth fallback", async () => {
    const summary = buildStreamHealthEvidence({
      now,
      streamStatus: {
        connected: true,
        lastMessageAt: "2026-05-05T11:59:55.000Z",
        localBook: {
          syncedSymbols: 0,
          expectedSymbols: 4,
          streamPrimary: false,
          notReadySymbols: ["ETHUSDT", "SOLUSDT"]
        }
      },
      restFallbackSuppressedState: {
        "depth:ETHUSDT": {
          reason: "local_book_depth_stream_not_ready",
          lastAt: "2026-05-05T11:59:58.000Z"
        }
      },
      requestBudget: { usedWeight1m: 122 }
    });
    assert.equal(summary.status, "local_book_stream_not_ready");
    assert.ok(summary.reasons.includes("local_book_depth_stream_not_ready"));
    assert.ok(summary.reasons.includes("rest_fallback_suppressed"));
    assert.equal(summary.suppressedFallbackCount, 1);
    assert.equal(summary.localBookNotReadySymbols.includes("ETHUSDT"), true);
  });

  await runCheck("stream health evidence marks reconnect storm degraded", async () => {
    const summary = buildStreamHealthEvidence({
      now,
      streamStatus: {
        connected: true,
        lastMessageAt: "2026-05-05T11:59:50.000Z",
        publicReconnectCount: 4,
        publicReconnectWindowMs: 120_000,
        localBook: { syncedSymbols: 2, expectedSymbols: 2, streamPrimary: true }
      },
      requestBudget: { usedWeight1m: 150 },
      config: { streamHealthReconnectStormThreshold: 3 }
    });
    assert.equal(summary.status, "reconnect_storm_degraded");
    assert.ok(summary.reasons.includes("reconnect_storm"));
    assert.equal(summary.learningEvidenceEligible, false);
  });

  await runCheck("stream health evidence is fallback-safe with missing metadata", async () => {
    const summary = buildStreamHealthEvidence({ now });
    assert.equal(summary.status, "ready");
    assert.ok(summary.warnings.includes("stream_metadata_missing"));
    assert.equal(Number.isFinite(summary.pressure), true);
    assert.equal(summary.recentFallbacks.length, 0);
  });

  await runCheck("paper candidate stream evidence records REST fallback without execution impact", async () => {
    const summary = buildStreamHealthEvidence({
      now,
      streamStatus: { connected: false },
      restFallbackState: { "depth:BTCUSDT": { lastAt: "2026-05-05T11:59:45.000Z" } }
    });
    const candidate = annotatePaperCandidateStreamEvidence({ symbol: "BTCUSDT" }, summary);
    assert.equal(candidate.streamHealth.usedRestFallback, true);
    assert.equal(candidate.streamHealth.depthRestFallbackUsed, true);
    assert.equal(candidate.streamHealth.diagnosticsOnly, true);
    assert.equal(candidate.streamHealth.liveSafetyUnchanged, true);
  });

  await runCheck("dashboard normalizer exposes stream health summary fallback", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.streamHealthSummary.status, "unknown");
    const normalized = normalizeDashboardSnapshotPayload({
      ops: {
        streamHealthSummary: {
          status: "rest_pressure_guarded",
          reasons: ["rest_budget_pressure"],
          streamReplacementAvailable: { publicMarketData: true }
        }
      }
    });
    assert.equal(normalized.streamHealthSummary.status, "rest_pressure_guarded");
    assert.equal(normalized.streamHealthSummary.streamReplacementAvailable.publicMarketData, true);
  });
}
