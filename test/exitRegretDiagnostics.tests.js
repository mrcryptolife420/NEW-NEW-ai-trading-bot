import { buildPerformanceReport } from "../src/runtime/reportBuilder.js";
import {
  buildExitRegretReview,
  buildOpenPositionExitReview,
  classifyTradeAutopsy
} from "../src/runtime/tradeAutopsy.js";
import { buildHistoryActionPlan } from "../src/runtime/marketReplayEngine.js";

export async function registerExitRegretDiagnosticsTests({ runCheck, assert, makeConfig }) {
  await runCheck("exit regret review flags high-MFE losing trades as late avoidable losses", async () => {
    const review = buildExitRegretReview([
      {
        id: "late-1",
        symbol: "BTCUSDT",
        exitAt: "2026-01-01T01:00:00.000Z",
        netPnlPct: -0.008,
        pnlQuote: -8,
        mfePct: 0.024,
        maePct: -0.011,
        captureEfficiency: 0.05,
        executionQualityScore: 0.8
      },
      {
        id: "late-2",
        symbol: "ETHUSDT",
        exitAt: "2026-01-01T02:00:00.000Z",
        netPnlPct: -0.006,
        pnlQuote: -6,
        mfePct: 0.018,
        maePct: -0.009,
        captureEfficiency: 0.02,
        executionQualityScore: 0.75
      },
      {
        id: "late-3",
        symbol: "SOLUSDT",
        exitAt: "2026-01-01T03:00:00.000Z",
        netPnlPct: -0.01,
        pnlQuote: -10,
        mfePct: 0.02,
        maePct: -0.012,
        captureEfficiency: 0.01,
        executionQualityScore: 0.72
      }
    ]);

    assert.equal(review.status, "review_required");
    assert.equal(review.lateExitCount, 3);
    assert.equal(review.avoidableLossCount, 3);
    assert.equal(review.dominantExitIssue, "late_exit");
    assert.equal(review.biggestAvoidableLosses[0].issues.includes("avoidable_loss"), true);
  });

  await runCheck("trade autopsy keeps positive low-capture exits as premature-exit warnings", async () => {
    const autopsy = classifyTradeAutopsy({
      id: "winner-low-capture",
      exitAt: "2026-01-01T01:00:00.000Z",
      netPnlPct: 0.004,
      mfePct: 0.026,
      captureEfficiency: 0.15,
      executionQualityScore: 0.8
    });

    assert.equal(autopsy.classification, "premature_exit");
    assert.equal(autopsy.warnings.includes("low_capture_efficiency"), true);
  });

  await runCheck("exit regret review separates execution drag from normal losing trades", async () => {
    const review = buildExitRegretReview([
      {
        id: "drag-1",
        symbol: "BNBUSDT",
        exitAt: "2026-01-01T01:00:00.000Z",
        netPnlPct: -0.003,
        pnlQuote: -3,
        mfePct: 0.002,
        maePct: -0.005,
        executionQualityScore: 0.3,
        entryExecutionAttribution: { slippageDeltaBps: 7 },
        exitExecutionAttribution: { slippageDeltaBps: 6 }
      }
    ]);

    assert.equal(review.executionRegretCount, 1);
    assert.equal(review.executionRegretExits[0].symbol, "BNBUSDT");
  });

  await runCheck("performance report exposes exit regret, autopsy and open-position exit diagnostics", async () => {
    const report = buildPerformanceReport({
      journal: {
        trades: [
          {
            id: "closed-1",
            symbol: "BTCUSDT",
            brokerMode: "paper",
            tradingSource: "paper:internal",
            entryAt: "2026-01-01T00:00:00.000Z",
            exitAt: "2026-01-01T01:00:00.000Z",
            netPnlPct: -0.009,
            pnlQuote: -9,
            mfePct: 0.022,
            maePct: -0.012,
            captureEfficiency: 0.04
          }
        ],
        scaleOuts: [],
        blockedSetups: [],
        researchRuns: [],
        equitySnapshots: [],
        events: []
      },
      runtime: {
        openPositions: [
          {
            id: "open-1",
            symbol: "ETHUSDT",
            brokerMode: "paper",
            tradingSource: "paper:internal",
            entryAt: "2026-01-01T00:00:00.000Z",
            entryPrice: 100,
            currentPrice: 97.5,
            quantity: 1,
            strategyFamily: "range_grid",
            regimeAtEntry: "range",
            currentRegime: "breakout_release",
            rangeBreakDetected: true
          }
        ]
      },
      config: makeConfig({ botMode: "paper", reportLookbackTrades: 20 }),
      now: new Date("2026-01-01T08:00:00.000Z")
    });

    assert.equal(report.postTradeAnalytics.exitRegret.avoidableLossCount, 1);
    assert.equal(report.postTradeAnalytics.tradeAutopsy.worstRecentTrades[0].classification, "late_exit");
    assert.equal(report.openPositionExitReview.positionCount, 1);
    assert.equal(report.openPositionExitReview.highestRiskPosition.suggestedAction, "exit_now_candidate");
  });

  await runCheck("history action plan is explicit about safe backfill and replay coverage gating", async () => {
    const plan = buildHistoryActionPlan({
      symbol: "BTCUSDT",
      interval: "15m",
      from: "2026-01-01",
      to: "2026-01-02",
      status: "missing_history"
    });

    assert.equal(plan.blocking, true);
    assert.equal(plan.autoBackfillPlan.placesOrders, false);
    assert.equal(plan.autoBackfillPlan.affectsTradingBehavior, false);
    assert.equal(plan.readinessGate.status, "blocked");
    assert.equal(plan.readinessGate.blocks.includes("strategy_promotion"), true);
    assert.equal(plan.nextSafeAction, "download_or_backfill_local_history_before_trusting_replay_scorecards");
  });
}
