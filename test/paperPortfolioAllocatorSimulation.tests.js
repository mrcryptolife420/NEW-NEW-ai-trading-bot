import {
  simulatePaperPortfolioAllocation,
  summarizePaperAllocatorSimulation
} from "../src/runtime/paperPortfolioAllocatorSimulation.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function position(overrides = {}) {
  return {
    symbol: "ETHUSDT",
    notional: 100,
    strategyFamily: "trend",
    regime: "trend",
    cluster: "majors",
    ...overrides
  };
}

function candidate(overrides = {}) {
  return {
    symbol: "SOLUSDT",
    quoteAmount: 100,
    probability: 0.7,
    strategySummary: { family: "breakout" },
    regimeSummary: { regime: "breakout" },
    cluster: "alts",
    ...overrides
  };
}

export async function registerPaperPortfolioAllocatorSimulationTests({ runCheck, assert }) {
  await runCheck("paper allocator simulation allows multiple positions within limits", async () => {
    const simulation = simulatePaperPortfolioAllocation({
      openPositions: [position()],
      candidates: [
        candidate({ symbol: "SOLUSDT", quoteAmount: 100 }),
        candidate({ symbol: "BNBUSDT", quoteAmount: 100, probability: 0.65, cluster: "majors" })
      ],
      accountEquity: 1000,
      config: {
        maxOpenPositions: 4,
        maxTotalExposureFraction: 0.8,
        maxPositionFraction: 0.2
      },
      mode: "paper"
    });
    assert.equal(simulation.selectedCount, 2);
    assert.equal(simulation.simulatedOpenPositions, 3);
    assert.equal(simulation.multiPositionSupported, true);
    assert.ok(simulation.selected.every((item) => item.tag === "paper_allocator_simulated"));
  });

  await runCheck("paper allocator simulation blocks same-symbol duplicate", async () => {
    const simulation = simulatePaperPortfolioAllocation({
      openPositions: [position({ symbol: "SOLUSDT" })],
      candidates: [candidate({ symbol: "SOLUSDT" })],
      accountEquity: 1000,
      config: { maxOpenPositions: 4, maxTotalExposureFraction: 0.8, maxPositionFraction: 0.2 },
      mode: "paper"
    });
    assert.equal(simulation.selectedCount, 0);
    assert.equal(simulation.rejected[0].reasons.includes("same_symbol_duplicate"), true);
  });

  await runCheck("paper allocator simulation lowers size for crowded family and regime", async () => {
    const simulation = simulatePaperPortfolioAllocation({
      openPositions: [
        position({ symbol: "ETHUSDT", strategyFamily: "trend", regime: "trend", cluster: "majors" }),
        position({ symbol: "BNBUSDT", strategyFamily: "trend", regime: "trend", cluster: "majors" })
      ],
      candidates: [candidate({
        symbol: "SOLUSDT",
        quoteAmount: 100,
        strategySummary: { family: "trend" },
        regimeSummary: { regime: "trend" },
        cluster: "majors"
      })],
      accountEquity: 1000,
      config: {
        maxOpenPositions: 5,
        maxTotalExposureFraction: 0.9,
        maxPositionFraction: 0.2,
        maxPositionsPerStrategyFamily: 5,
        maxPositionsPerRegime: 5
      },
      mode: "paper"
    });
    assert.equal(simulation.selectedCount, 1);
    assert.ok(simulation.selected[0].sizeMultiplier < 1);
    assert.ok(["medium", "high"].includes(simulation.selected[0].crowdingRisk));
  });

  await runCheck("paper allocator simulation blocks exposure cap", async () => {
    const simulation = simulatePaperPortfolioAllocation({
      openPositions: [position({ notional: 450 })],
      candidates: [candidate({ quoteAmount: 200 })],
      accountEquity: 1000,
      config: {
        maxOpenPositions: 4,
        maxTotalExposureFraction: 0.5,
        maxPositionFraction: 0.3
      },
      mode: "paper"
    });
    assert.equal(simulation.selectedCount, 0);
    assert.equal(simulation.rejected[0].reasons.includes("total_exposure_cap"), true);
  });

  await runCheck("paper allocator simulation live mode is diagnostics only", async () => {
    const simulation = simulatePaperPortfolioAllocation({
      openPositions: [],
      candidates: [candidate()],
      accountEquity: 1000,
      config: { maxOpenPositions: 4, maxTotalExposureFraction: 0.8, maxPositionFraction: 0.2 },
      mode: "live"
    });
    assert.equal(simulation.status, "diagnostics_only");
    assert.equal(simulation.selectedCount, 0);
    assert.equal(simulation.rejected[0].diagnosticsOnly, true);
    assert.equal(simulation.liveBehaviorChanged, false);
  });

  await runCheck("paper allocator simulation summary is dashboard fallback-safe", async () => {
    const simulation = simulatePaperPortfolioAllocation({
      openPositions: [position()],
      candidates: [candidate()],
      accountEquity: 1000,
      config: { maxOpenPositions: 4, maxTotalExposureFraction: 0.8, maxPositionFraction: 0.2 },
      mode: "paper"
    });
    const paperAllocatorSimulationSummary = summarizePaperAllocatorSimulation(simulation);
    const normalized = normalizeDashboardSnapshotPayload({
      tradingQualitySummary: { paperAllocatorSimulationSummary }
    });
    assert.equal(normalized.paperAllocatorSimulationSummary.selectedCount, 1);
    assert.equal(normalized.paperAllocatorSimulationSummary.multiPositionSupported, true);
  });
}
