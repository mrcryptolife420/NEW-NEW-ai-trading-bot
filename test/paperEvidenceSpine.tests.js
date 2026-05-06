import {
  buildPaperEvidencePacket,
  buildPaperEvidenceSpine,
  summarizePaperEvidenceSpine
} from "../src/runtime/paperEvidenceSpine.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function assertFiniteTree(assert, value, path = "value") {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${path} must be finite`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(assert, child, `${path}.${key}`);
  }
}

export async function registerPaperEvidenceSpineTests({ runCheck, assert }) {
  await runCheck("paper evidence spine links approved decision to paper trade", async () => {
    const packet = buildPaperEvidencePacket({
      decision: {
        decisionId: "d1",
        symbol: "BTCUSDT",
        approved: true,
        setupType: "trend_continuation",
        strategySummary: { family: "trend_following" }
      },
      trade: {
        id: "t1",
        decisionId: "d1",
        symbol: "BTCUSDT",
        pnlPct: 0.01,
        exitReason: "take_profit"
      },
      marketAfterExit: { maxFavorableMovePct: 0.014, maxAdverseMovePct: -0.002 }
    });

    assert.equal(packet.decisionId, "d1");
    assert.equal(packet.tradeId, "t1");
    assert.equal(packet.state, "trade_linked");
    assert.equal(packet.paperOnly, true);
    assert.equal(packet.liveBehaviorChanged, false);
    assert.equal(packet.evidenceLinks.hasTrade, true);
    assertFiniteTree(assert, packet);
  });

  await runCheck("paper evidence spine captures blocked setup without trade", async () => {
    const packet = buildPaperEvidencePacket({
      decision: {
        id: "blocked-1",
        symbol: "ETHUSDT",
        approved: false,
        rootBlocker: "model_confidence_too_low",
        reasons: ["model_confidence_too_low"],
        setupType: "breakout_retest"
      },
      futureMarketPath: {
        maxFavorableMovePct: 0.018,
        maxAdverseMovePct: -0.003,
        closeReturnPct: 0.014,
        horizonMinutes: 60
      }
    });

    assert.equal(packet.state, "blocked_setup");
    assert.equal(packet.rootBlocker, "model_confidence_too_low");
    assert.equal(packet.outcome.veto, "bad_veto");
    assert.equal(packet.evidenceLinks.hasFuturePath, true);
    assert.equal(packet.recommendedAction, "review_bad_veto_blocker_scope");
  });

  await runCheck("paper evidence spine marks approved decision with missing trade", async () => {
    const spine = buildPaperEvidenceSpine({
      decisions: [
        { id: "d2", symbol: "SOLUSDT", approved: true, setupType: "mean_reversion" }
      ],
      trades: []
    });

    assert.equal(spine.status, "ready");
    assert.equal(spine.packets[0].state, "approved_without_trade");
    assert.equal(spine.summary.missingLinks.trade, 1);
    assert.equal(spine.summary.paperOnly, true);
    assert.equal(spine.summary.liveBehaviorChanged, false);
  });

  await runCheck("paper evidence spine handles missing thesis and dashboard fallback", async () => {
    const packet = buildPaperEvidencePacket({
      decision: { id: "d3", symbol: "XRPUSDT" },
      candidate: {}
    });
    const summary = summarizePaperEvidenceSpine([packet]);
    const normalized = normalizeDashboardSnapshotPayload({
      learningAnalytics: { paperEvidenceSpineSummary: summary }
    });
    const fallback = normalizeDashboardSnapshotPayload({});

    assert.equal(packet.setupType, "trend_continuation");
    assert.equal(summary.count, 1);
    assert.equal(normalized.paperEvidenceSpineSummary.count, 1);
    assert.equal(fallback.paperEvidenceSpineSummary.status, "empty");
    assertFiniteTree(assert, summary);
  });
}
