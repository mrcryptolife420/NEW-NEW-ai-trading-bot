import { buildPaperNetEdgeCalibrationWorkbench } from "../src/runtime/paperNetEdgeCalibrationWorkbench.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerPaperNetEdgeCalibrationWorkbenchTests({ runCheck, assert }) {
  await runCheck("paper net-edge workbench lowers net edge under high fees", async () => {
    const summary = buildPaperNetEdgeCalibrationWorkbench({
      samples: [{
        id: "fee-1",
        symbol: "BTCUSDT",
        session: "eu",
        orderStyle: "market",
        realizedFeeBps: 32,
        realizedSlippageBps: 4,
        simulatedSlippageBps: 4,
        candidate: { expectedNetEdge: { grossEdgeBps: 40 } }
      }],
      config: { paperNetEdgeHighFeeBps: 18 }
    });
    assert.equal(summary.status, "warning");
    assert.equal(summary.groups[0].avgFeeBps, 32);
    assert.equal(summary.groups[0].avgNetEdgeBps, 1);
    assert.ok(summary.recommendations.includes("review_fee_model_or_symbol_fee_tier"));
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("paper net-edge workbench warns on slippage model mismatch", async () => {
    const summary = buildPaperNetEdgeCalibrationWorkbench({
      samples: [{
        id: "slip-1",
        symbol: "ETHUSDT",
        session: "us",
        orderStyle: "limit_ioc",
        realizedFeeBps: 10,
        realizedSlippageBps: 21,
        simulatedSlippageBps: 3,
        candidate: { expectedNetEdge: { grossEdgeBps: 50 } }
      }],
      config: { paperNetEdgeMaxSlippageErrorBps: 5 }
    });
    assert.equal(summary.groups[0].avgSlippageErrorBps, 18);
    assert.ok(summary.warnings.includes("slippage_model_underestimates_drag"));
    assert.ok(summary.recommendations.includes("raise_paper_slippage_assumption_for_scope"));
  });

  await runCheck("paper net-edge workbench lowers fill confidence on thin book", async () => {
    const summary = buildPaperNetEdgeCalibrationWorkbench({
      samples: [{
        id: "thin-1",
        symbol: "SOLUSDT",
        session: "asia",
        orderStyle: "maker_limit",
        notional: 1000,
        realizedFeeBps: 8,
        realizedSlippageBps: 2,
        spreadBps: 42,
        bookDepthUsd: 100,
        candleVolumeUsd: 120,
        volatilityPct: 0.07,
        candidate: { expectedNetEdge: { grossEdgeBps: 35 } }
      }],
      config: { paperNetEdgeMinFillConfidence: 0.7 }
    });
    assert.ok(summary.groups[0].avgFillConfidence < 0.7);
    assert.ok(summary.groups[0].warnings.includes("low_fill_confidence"));
    assert.ok(summary.recommendations.includes("reduce_paper_fill_confidence_or_prefer_safer_order_style"));
  });

  await runCheck("paper net-edge workbench live mode cannot lower thresholds", async () => {
    const summary = buildPaperNetEdgeCalibrationWorkbench({
      botMode: "live",
      samples: [{
        id: "live-positive",
        symbol: "BNBUSDT",
        session: "eu",
        orderStyle: "maker_limit",
        realizedFeeBps: 4,
        realizedSlippageBps: 0.5,
        simulatedSlippageBps: 1,
        candidate: { expectedNetEdge: { grossEdgeBps: 80 } }
      }]
    });
    assert.equal(summary.status, "ready");
    assert.equal(summary.diagnosticsOnly, true);
    assert.equal(summary.paperOnly, false);
    assert.equal(summary.liveThresholdReliefAllowed, false);
    assert.equal(summary.liveGateEnabled, false);
  });

  await runCheck("paper net-edge calibration dashboard fallback is safe", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.paperNetEdgeCalibrationSummary.status, "empty");
    const summary = buildPaperNetEdgeCalibrationWorkbench({
      samples: [{
        symbol: "XRPUSDT",
        session: "eu",
        orderStyle: "market",
        realizedFeeBps: 12,
        realizedSlippageBps: 2,
        simulatedSlippageBps: 2,
        candidate: { expectedNetEdge: { grossEdgeBps: 35 } }
      }]
    });
    const normalized = normalizeDashboardSnapshotPayload({ paperNetEdgeCalibrationSummary: summary });
    assert.equal(normalized.paperNetEdgeCalibrationSummary.sampleCount, 1);
    assert.equal(normalized.paperNetEdgeCalibrationSummary.liveThresholdReliefAllowed, false);
  });
}
