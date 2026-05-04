import { buildWalkForwardDeploymentReport } from "../src/research/walkForwardDeploymentReport.js";

function trades(count, pnl = 0.01) {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${index}`,
    netPnlPct: typeof pnl === "function" ? pnl(index) : pnl,
    entryAt: `2026-05-04T${String(index % 20).padStart(2, "0")}:00:00.000Z`,
    exitAt: `2026-05-04T${String((index % 20) + 1).padStart(2, "0")}:00:00.000Z`
  }));
}

export async function registerWalkForwardDeploymentReportTests({ runCheck, assert }) {
  await runCheck("walk-forward deployment report blocks missing backtest data", async () => {
    const report = buildWalkForwardDeploymentReport({});
    assert.equal(report.deploymentStatus, "not_ready");
    assert.ok(report.blockingReasons.includes("missing_backtest_data"));
    assert.equal(report.autoPromotesLive, false);
  });

  await runCheck("walk-forward deployment report blocks insufficient samples", async () => {
    const report = buildWalkForwardDeploymentReport({
      trades: trades(5, 0.02),
      config: { walkForwardDeploymentMinTrades: 20 }
    });
    assert.equal(report.deploymentStatus, "not_ready");
    assert.ok(report.blockingReasons.includes("insufficient_samples"));
  });

  await runCheck("walk-forward deployment report blocks weak regime split", async () => {
    const report = buildWalkForwardDeploymentReport({
      trades: trades(40, (index) => index % 2 === 0 ? 0.01 : -0.006),
      regimeBreakdown: {
        breakout: { tradeCount: 12, winRate: 0.33, profitFactor: 0.72, expectancy: -0.002 },
        trend: { tradeCount: 28, winRate: 0.58, profitFactor: 1.4, expectancy: 0.004 }
      },
      config: { walkForwardDeploymentMinTrades: 30 }
    });
    assert.equal(report.deploymentStatus, "blocked");
    assert.ok(report.blockingReasons.includes("weak_regime_split"));
    assert.equal(report.weakRegimes[0].id, "breakout");
  });

  await runCheck("walk-forward deployment report allows strong paper candidate only", async () => {
    const report = buildWalkForwardDeploymentReport({
      scope: "trend_following::btc_led_trend",
      trades: trades(45, (index) => index % 4 === 0 ? -0.004 : 0.01),
      regimeBreakdown: {
        trend: { tradeCount: 45, winRate: 0.72, profitFactor: 2.1, expectancy: 0.006 }
      },
      config: { walkForwardDeploymentMinTrades: 30, canaryMinSamples: 30 }
    });
    assert.equal(report.deploymentStatus, "paper_candidate");
    assert.equal(report.liveBehaviorChanged, false);
    assert.equal(report.canaryGate.autoPromotesLive, false);
  });

  await runCheck("walk-forward deployment report blocks failed anti-overfit", async () => {
    const report = buildWalkForwardDeploymentReport({
      trades: trades(45, 0.01),
      proposedChanges: [{ key: "model_threshold", delta: -0.02 }],
      calibration: { delta: 0.03 },
      config: { walkForwardDeploymentMinTrades: 30, antiOverfitMinSamples: 30 }
    });
    assert.equal(report.deploymentStatus, "blocked");
    assert.ok(report.blockingReasons.includes("anti_overfit_blocked"));
  });
}
