import { buildFundingOiMatrix } from "../src/market/derivativesMatrix.js";
import { buildLeadershipContext } from "../src/market/leadershipContext.js";
import { buildDecisionSupportDiagnostics } from "../src/runtime/decisionSupportDiagnostics.js";
import { estimateRiskOfRuin } from "../src/runtime/riskOfRuinSimulator.js";
import { buildNetEdgeGate } from "../src/runtime/netEdgeGate.js";
import { buildWalkForwardStudy } from "../src/runtime/walkForwardBacktest.js";
import { detectFailedBreakout } from "../src/strategy/failedBreakoutDetector.js";

function trade(index, netPnlPct) {
  return {
    id: `t-${index}`,
    entryAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    exitAt: new Date(Date.UTC(2026, 0, 1, 1, index)).toISOString(),
    netPnlPct
  };
}

export async function registerDecisionSupportFoundationTests({ runCheck, assert, makeConfig }) {
  await runCheck("net edge gate blocks negative paper edge after fees and slippage", () => {
    const gate = buildNetEdgeGate({
      botMode: "paper",
      config: makeConfig({ enableNetEdgeGate: true, minNetEdgeBps: 0, paperFeeBps: 10, paperSlippageBps: 8 }),
      candidate: {
        expectedEdgePct: 0.002,
        executionCost: { slippageBps: 8 }
      }
    });
    assert.equal(gate.status, "block");
    assert.equal(gate.reason, "net_edge_after_costs_too_low");
    assert.ok(gate.netEdgeBps < 0);
  });

  await runCheck("net edge gate remains diagnostic when disabled", () => {
    const gate = buildNetEdgeGate({
      botMode: "paper",
      config: makeConfig({ enableNetEdgeGate: false, minNetEdgeBps: 20 }),
      candidate: { expectedEdgePct: 0.001 }
    });
    assert.equal(gate.block, false);
    assert.equal(gate.status, "warn");
  });

  await runCheck("failed breakout detector catches lost level with bearish flow", () => {
    const result = detectFailedBreakout({
      market: {
        priorRangeHigh: 100,
        close: 99.4,
        closeLocation: 0.34,
        breakoutFollowThroughScore: 0.22,
        volumeAcceptanceScore: 0.28,
        cvdDivergenceScore: 0.8,
        cvdTrendAlignment: -0.38
      },
      book: { mid: 99.4, bookPressure: -0.36, spreadBps: 16, depthConfidence: 0.42 },
      stream: { tradeFlowImbalance: -0.42 },
      timeframeSummary: { alignmentScore: 0.36 }
    });
    assert.equal(result.status, "failed_breakout");
    assert.ok(result.reasons.includes("breakout_level_lost"));
    assert.ok(result.reasons.includes("cvd_orderflow_reversal"));
  });

  await runCheck("funding OI matrix separates crowded longs and unwind", () => {
    const crowded = buildFundingOiMatrix({
      fundingRate: 0.0012,
      fundingAcceleration: 0.0004,
      openInterestDeltaPct: 0.045,
      basisBps: 120,
      priceChangePct: 0.025,
      takerImbalance: 0.45
    });
    assert.equal(crowded.status, "crowded_long");
    const unwind = buildFundingOiMatrix({
      fundingRate: 0.0009,
      openInterestAccelerationPct: -0.04,
      basisSlopeBps: -60,
      priceChangePct: -0.03,
      takerImbalance: -0.5
    });
    assert.equal(unwind.status, "oi_unwind_risk");
  });

  await runCheck("leadership context flags leaders divergence and risk-off", () => {
    const leader = buildLeadershipContext({
      symbol: "SOLUSDT",
      symbolReturnPct: 0.045,
      btcReturnPct: 0.01,
      ethReturnPct: 0.012,
      sectorReturnPct: 0.03,
      sectorBreadth: 0.72,
      sectorMomentum: 0.02,
      spotPrice: 100,
      futuresPrice: 100.7
    });
    assert.equal(leader.leadershipState, "leader");
    assert.equal(leader.divergenceState, "diverged");
    const riskOff = buildLeadershipContext({ symbolReturnPct: -0.02, btcReturnPct: -0.04, ethReturnPct: -0.045, sectorBreadth: 0.2 });
    assert.ok(riskOff.riskOffScore > 0.45);
  });

  await runCheck("decision support diagnostics stay disabled until feature flags are enabled", () => {
    const diagnostics = buildDecisionSupportDiagnostics({
      config: makeConfig({
        enableNetEdgeGate: false,
        enableFailedBreakoutDetector: false,
        enableFundingOiMatrix: false,
        enableSpotFuturesDivergence: false,
        enableLeadershipContext: false
      }),
      candidate: {
        symbol: "BTCUSDT",
        probability: 0.7,
        threshold: 0.55
      }
    });
    assert.equal(diagnostics.status, "disabled");
    assert.equal(diagnostics.netEdgeGate.status, "disabled");
    assert.equal(diagnostics.failedBreakoutDetector.status, "disabled");
    assert.equal(diagnostics.fundingOiMatrix.status, "disabled");
    assert.equal(diagnostics.leadershipContext.status, "disabled");
    assert.equal(diagnostics.spotFuturesDivergence.status, "disabled");
  });

  await runCheck("decision support diagnostics surface existing modules without applying trading behavior", () => {
    const diagnostics = buildDecisionSupportDiagnostics({
      botMode: "live",
      config: makeConfig({
        botMode: "live",
        enableNetEdgeGate: true,
        minNetEdgeBps: 220,
        enableFailedBreakoutDetector: true,
        enableFundingOiMatrix: true,
        enableSpotFuturesDivergence: true,
        enableLeadershipContext: true
      }),
      candidate: {
        symbol: "SOLUSDT",
        score: { probability: 0.57 },
        decision: {
          threshold: 0.55,
          executionPlan: { expectedSlippageBps: 8 }
        },
        marketSnapshot: {
          market: {
            priorRangeHigh: 100,
            close: 99.2,
            closeLocation: 0.32,
            breakoutFollowThroughScore: 0.22,
            volumeAcceptanceScore: 0.28,
            cvdDivergenceScore: 0.78,
            cvdTrendAlignment: -0.32,
            momentum20: -0.018
          },
          book: {
            mid: 99.2,
            spreadBps: 16,
            depthConfidence: 0.38,
            bookPressure: -0.4
          }
        },
        streamFeatures: { tradeFlowImbalance: -0.44 },
        marketStructureSummary: {
          fundingRate: 0.001,
          fundingAcceleration: 0.0004,
          openInterestDeltaPct: 0.04,
          basisBps: 110,
          takerImbalance: -0.4
        },
        globalMarketContextSummary: {
          btcReturnPct: -0.025,
          ethReturnPct: -0.03
        },
        marketProviderSummary: {
          macro: { sectorReturnPct: -0.015, sectorBreadth: 0.25 },
          crossExchange: { futuresPrice: 99.85 }
        }
      }
    });
    assert.equal(diagnostics.runtimeApplied, false);
    assert.equal(diagnostics.diagnosticOnly, true);
    assert.equal(diagnostics.netEdgeGate.runtimeApplied, false);
    assert.equal(diagnostics.netEdgeGate.block, false);
    assert.equal(diagnostics.netEdgeGate.wouldBlock, true);
    assert.equal(diagnostics.failedBreakoutDetector.status, "failed_breakout");
    assert.equal(diagnostics.fundingOiMatrix.enabled, true);
    assert.equal(diagnostics.leadershipContext.enabled, true);
    assert.equal(diagnostics.spotFuturesDivergence.status, "diverged");
  });

  await runCheck("walk-forward study is deterministic and detects degradation", () => {
    const trades = Array.from({ length: 18 }, (_, index) => trade(index, index < 9 ? 0.01 : -0.006));
    const study = buildWalkForwardStudy({ trades, trainSize: 6, testSize: 3, stepSize: 3 });
    assert.equal(study.status, "ready");
    assert.equal(study.windowCount, 4);
    assert.ok(study.averageDegradationPct > 0);
  });

  await runCheck("risk of ruin rises with large losses and drops with lower risk", () => {
    const risky = estimateRiskOfRuin({ tradeCount: 80, winRate: 0.42, avgWinPct: 0.01, avgLossPct: 0.018, riskPerTrade: 0.03, correlation: 0.6 });
    const safer = estimateRiskOfRuin({ tradeCount: 80, winRate: 0.42, avgWinPct: 0.01, avgLossPct: 0.018, riskPerTrade: 0.008, correlation: 0.1 });
    assert.ok(risky.probabilityDrawdown25 > safer.probabilityDrawdown25);
    assert.equal(estimateRiskOfRuin({ tradeCount: 8 }).status, "insufficient_sample");
  });
}
