import { buildDynamicExitLevels } from "../src/risk/dynamicExitLevels.js";

export async function registerDynamicExitLevelsTests({ runCheck, assert, makeConfig }) {
  await runCheck("dynamic exit levels widen breakout paper stops and enforce momentum target", async () => {
    const config = makeConfig({
      botMode: "paper",
      enableDynamicExitLevels: true,
      dynamicExitPaperOnly: true,
      stopLossPct: 0.018,
      takeProfitPct: 0.03,
      maxDynamicStopMultiplier: 2,
      minRiskReward: 1.4
    });
    const levels = buildDynamicExitLevels({
      config,
      botMode: "paper",
      entryPrice: 100,
      baseStopPct: 0.018,
      baseTakeProfitPct: 0.03,
      strategySummary: { family: "breakout", activeStrategy: "donchian_breakout" },
      marketSnapshot: {
        book: { spreadBps: 8, ask: 100 },
        market: {
          atrPct: 0.014,
          donchianLower: 97.6,
          donchianUpper: 106,
          vwapGapPct: 0.012,
          vwapUpperBandDistancePct: 0.018
        }
      }
    });

    assert.equal(levels.appliedMode, "paper_dynamic");
    assert.equal(levels.applied, true);
    assert.equal(levels.strategyProfile, "breakout");
    assert.equal(levels.effectiveStopPct > 0.018, true);
    assert.equal(levels.effectiveTakeProfitPct >= levels.effectiveStopPct * 1.4, true);
    assert.equal(levels.riskReward >= 1.4, true);
  });

  await runCheck("dynamic exit levels aim mean reversion targets around VWAP band with RR floor", async () => {
    const levels = buildDynamicExitLevels({
      config: makeConfig({
        botMode: "paper",
        enableDynamicExitLevels: true,
        minRiskReward: 1.25
      }),
      botMode: "paper",
      entryPrice: 100,
      baseStopPct: 0.018,
      baseTakeProfitPct: 0.032,
      strategySummary: { family: "mean_reversion", activeStrategy: "zscore_reversion" },
      marketSnapshot: {
        book: { spreadBps: 4, ask: 100 },
        market: {
          atrPct: 0.008,
          donchianLower: 98.7,
          vwapUpperBandDistancePct: 0.004,
          rangeTopDistancePct: 0.018
        }
      }
    });

    assert.equal(levels.strategyProfile, "mean_reversion");
    assert.equal(levels.targetSource, "vwap_band");
    assert.equal(levels.effectiveTakeProfitPct >= levels.effectiveStopPct * 1.25, true);
  });

  await runCheck("dynamic exit levels keep live fixed when paper-only mode is enabled", async () => {
    const levels = buildDynamicExitLevels({
      config: makeConfig({
        botMode: "live",
        enableDynamicExitLevels: true,
        dynamicExitPaperOnly: true,
        maxDynamicStopMultiplier: 2
      }),
      botMode: "live",
      entryPrice: 100,
      baseStopPct: 0.018,
      baseTakeProfitPct: 0.03,
      strategySummary: { family: "breakout", activeStrategy: "donchian_breakout" },
      marketSnapshot: {
        book: { spreadBps: 5, ask: 100 },
        market: { atrPct: 0.018, donchianLower: 96.8, donchianUpper: 108 }
      }
    });

    assert.equal(levels.appliedMode, "live_diagnostics_only");
    assert.equal(levels.applied, false);
    assert.equal(levels.effectiveStopPct, 0.018);
    assert.equal(levels.effectiveTakeProfitPct, 0.03);
    assert.equal(levels.suggestedStopPct > levels.effectiveStopPct, true);
  });

  await runCheck("dynamic exit levels can only tighten live stops when explicitly not paper-only", async () => {
    const levels = buildDynamicExitLevels({
      config: makeConfig({
        botMode: "live",
        enableDynamicExitLevels: true,
        dynamicExitPaperOnly: false,
        minRiskReward: 1.2
      }),
      botMode: "live",
      entryPrice: 100,
      baseStopPct: 0.025,
      baseTakeProfitPct: 0.04,
      strategySummary: { family: "range_grid", activeStrategy: "range_grid_reversion" },
      marketSnapshot: {
        book: { spreadBps: 3, ask: 100 },
        market: { atrPct: 0.004, donchianLower: 99.1, rangeTopDistancePct: 0.012 }
      }
    });

    assert.equal(levels.appliedMode, "live_conservative_tightening");
    assert.equal(levels.effectiveStopPct <= 0.025, true);
    assert.equal(levels.effectiveTakeProfitPct, 0.04);
    assert.equal(levels.suggestedTakeProfitPct >= levels.suggestedStopPct * 1.2, true);
  });
}
