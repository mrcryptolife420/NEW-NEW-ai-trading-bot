import { buildRiskOfRuinMonitor } from "../src/risk/riskOfRuin.js";

function trades(values) {
  return values.map((netPnlPct, index) => ({ id: `t${index}`, netPnlPct }));
}

export async function registerRiskOfRuinMonitorTests({ runCheck, assert }) {
  await runCheck("risk-of-ruin monitor handles empty history", async () => {
    const monitor = buildRiskOfRuinMonitor({});
    assert.equal(monitor.status, "insufficient_sample");
    assert.ok(monitor.warnings.includes("insufficient_history"));
    assert.equal(monitor.entryGateRecommendation, "diagnostics_only");
    assert.equal(monitor.autoIncreasesSize, false);
  });

  await runCheck("risk-of-ruin monitor keeps positive expectancy low risk", async () => {
    const sample = Array.from({ length: 36 }, (_, index) => (index % 4 === 0 ? -0.004 : 0.009));
    const monitor = buildRiskOfRuinMonitor({ trades: trades(sample), config: { riskOfRuinMinTrades: 20 } });
    assert.equal(monitor.status, "ok");
    assert.ok(monitor.riskOfRuinScore < 0.35);
    assert.equal(monitor.recommendedSizeMultiplier <= 1, true);
  });

  await runCheck("risk-of-ruin monitor escalates negative expectancy", async () => {
    const sample = Array.from({ length: 40 }, (_, index) => (index % 3 === 0 ? 0.004 : -0.012));
    const monitor = buildRiskOfRuinMonitor({
      trades: trades(sample),
      config: { riskOfRuinMinTrades: 20, enableRiskOfRuinEntryBlock: true }
    });
    assert.ok(["high", "blocked"].includes(monitor.status));
    assert.ok(monitor.riskOfRuinScore >= 0.58);
    assert.ok(monitor.recommendedSizeMultiplier < 1);
  });

  await runCheck("risk-of-ruin monitor warns on high variance distribution", async () => {
    const sample = Array.from({ length: 32 }, (_, index) => (index % 2 === 0 ? 0.07 : -0.06));
    const monitor = buildRiskOfRuinMonitor({ trades: trades(sample), config: { riskOfRuinHighVariancePct: 0.03 } });
    assert.ok(monitor.warnings.includes("high_variance_trade_distribution"));
    assert.ok(Number.isFinite(monitor.lossStreakRisk));
  });

  await runCheck("risk-of-ruin monitor accounts for high exposure and scenario stress", async () => {
    const sample = Array.from({ length: 35 }, (_, index) => (index % 3 === 0 ? -0.006 : 0.007));
    const monitor = buildRiskOfRuinMonitor({
      trades: trades(sample),
      currentExposureFraction: 0.72,
      portfolioScenarioStress: { estimatedDrawdownPct: 0.14 },
      config: { riskOfRuinHighExposureFraction: 0.5 }
    });
    assert.ok(monitor.warnings.includes("high_current_exposure"));
    assert.ok(monitor.expectedDrawdown >= 0.14);
    assert.ok(monitor.recommendedSizeMultiplier < 0.9);
  });

  await runCheck("risk-of-ruin monitor can recommend blocking only when configured", async () => {
    const sample = Array.from({ length: 45 }, (_, index) => (index % 5 === 0 ? 0.002 : -0.02));
    const diagnostics = buildRiskOfRuinMonitor({ trades: trades(sample) });
    const blocking = buildRiskOfRuinMonitor({
      trades: trades(sample),
      currentExposureFraction: 0.9,
      config: { enableRiskOfRuinEntryBlock: true }
    });
    assert.equal(diagnostics.entryGateRecommendation, "diagnostics_only");
    assert.equal(blocking.entryGateRecommendation, "block_new_entries");
    assert.equal(blocking.liveSafetyUnchanged, true);
  });
}
