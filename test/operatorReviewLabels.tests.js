import {
  buildOperatorReviewLabel,
  buildOperatorReviewQueue,
  summarizeOperatorReviewLabels
} from "../src/runtime/operatorReviewLabels.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerOperatorReviewLabelsTests({ runCheck, assert }) {
  await runCheck("operator review label accepts valid label", async () => {
    const result = buildOperatorReviewLabel({
      target: { tradeId: "t1", symbol: "BTCUSDT" },
      label: "bad_exit",
      reviewer: "operator_a",
      confidence: 0.8,
      createdAt: "2026-05-06T12:00:00.000Z"
    });
    assert.equal(result.ok, true);
    assert.equal(result.record.label, "bad_exit");
    assert.equal(result.record.targetType, "trade");
    assert.equal(result.record.paperAnalyticsOnly, true);
    assert.equal(result.record.liveBehaviorChanged, false);
  });

  await runCheck("operator review label rejects invalid label", async () => {
    const result = buildOperatorReviewLabel({
      target: { tradeId: "t2" },
      label: "make_live_trade"
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_operator_review_label");
    assert.ok(result.allowedLabels.includes("bad_veto"));
  });

  await runCheck("operator review label summarizes persisted labels without trading impact", async () => {
    const first = buildOperatorReviewLabel({ target: { tradeId: "t3" }, label: "execution_drag" }).record;
    const second = buildOperatorReviewLabel({ target: { decisionId: "d1", type: "candidate" }, label: "bad_data" }).record;
    const summary = summarizeOperatorReviewLabels([first, second]);
    assert.equal(summary.count, 2);
    assert.equal(summary.byLabel.execution_drag, 1);
    assert.equal(summary.byTargetType.trade, 1);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("operator review label can attach to trade candidate or veto observation", async () => {
    const trade = buildOperatorReviewLabel({ target: { tradeId: "t4" }, label: "good_trade" });
    const candidate = buildOperatorReviewLabel({ target: { decisionId: "d2", type: "candidate" }, label: "bad_data" });
    const veto = buildOperatorReviewLabel({ target: { observationId: "v1", type: "veto_observation" }, label: "bad_veto" });
    assert.equal(trade.record.targetType, "trade");
    assert.equal(candidate.record.targetType, "candidate");
    assert.equal(veto.record.targetType, "veto_observation");
  });

  await runCheck("operator review labels remain diagnostics-only in live mode", async () => {
    const result = buildOperatorReviewLabel({
      botMode: "live",
      target: { tradeId: "live-t1", symbol: "ETHUSDT" },
      label: "manual_interference"
    });
    assert.equal(result.ok, true);
    assert.equal(result.record.diagnosticsOnly, true);
    assert.equal(result.record.liveBehaviorChanged, false);
  });

  await runCheck("operator review queue includes trades candidates and bad vetoes", async () => {
    const queue = buildOperatorReviewQueue({
      trades: [{ tradeId: "t5", symbol: "SOLUSDT", netPnlPct: -0.02, mfePct: 0.01, maePct: -0.03, executionDragBps: 25 }],
      candidates: [{ decisionId: "d3", symbol: "BNBUSDT", approved: false, reasons: ["data_quality_degraded"] }],
      vetoObservations: [{
        id: "v2",
        symbol: "XRPUSDT",
        vetoOutcome: { label: "bad_veto", confidence: 0.8 }
      }]
    });
    assert.equal(queue.status, "ready");
    assert.ok(queue.items.some((item) => item.targetType === "trade"));
    assert.ok(queue.items.some((item) => item.targetType === "candidate"));
    assert.ok(queue.items.some((item) => item.targetType === "veto_observation"));
  });

  await runCheck("operator review label dashboard fallback is safe", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.operatorReviewLabelSummary.status, "empty");
    const record = buildOperatorReviewLabel({ target: { tradeId: "t6" }, label: "bad_entry" }).record;
    const normalized = normalizeDashboardSnapshotPayload({
      operatorReviewLabelSummary: summarizeOperatorReviewLabels([record])
    });
    assert.equal(normalized.operatorReviewLabelSummary.count, 1);
    assert.equal(normalized.operatorReviewLabelSummary.byLabel.bad_entry, 1);
  });
}
