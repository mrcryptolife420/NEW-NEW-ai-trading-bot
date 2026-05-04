import { buildCrossExchangeDivergenceProvider } from "../src/market/providers/crossExchangeDivergenceProvider.js";
import { buildStablecoinFlowProvider } from "../src/market/providers/stablecoinFlowProvider.js";
import { buildMicrostructurePriorProvider } from "../src/market/providers/microstructurePriorProvider.js";
import { buildDerivativesContext } from "../src/market/derivativesContext.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerMarketProvidersTests({
  runCheck,
  assert
}) {
  await runCheck("new market providers degrade safely and normalize scoped summaries", async () => {
    const cross = buildCrossExchangeDivergenceProvider({
      enabled: true,
      symbol: "BTCUSDT",
      runtime: {
        referenceVenueCache: {
          BTCUSDT: {
            venues: [
              { id: "binance", premiumBps: 1.2, priceDivergenceBps: 2.4, aggressorMismatch: 0.08, spreadMismatchBps: 0.5 },
              { id: "bybit", premiumBps: 2.1, priceDivergenceBps: 3.2, aggressorMismatch: 0.06, spreadMismatchBps: 0.7 }
            ]
          }
        }
      }
    });
    const stable = buildStablecoinFlowProvider({
      enabled: true,
      onChainLiteSummary: { liquidityScore: 0.72, stressScore: 0.18 },
      globalMarketContextSummary: { stablecoinDominance: 6.4 }
    });
    const micro = buildMicrostructurePriorProvider({
      enabled: true,
      marketSnapshot: { book: { spreadBps: 2.2, depthConfidence: 0.81, queueRefreshScore: 0.22 } },
      sessionSummary: { session: "us", riskScore: 0.12 },
      executionFeedback: { executionPainScore: 0.18, sampleSize: 6 }
    });

    assert.equal(cross.status, "ready");
    assert.equal(stable.status, "ready");
    assert.equal(micro.status, "ready");
    assert.equal(cross.data.regime, "aligned");
    assert.equal(stable.data.regime, "inflow_support");
    assert.ok((micro.data.score || 0) > 0);
  });

  await runCheck("derivatives context degrades safely without provider data", async () => {
    const summary = buildDerivativesContext({
      providerSummary: null,
      marketStructureSummary: {},
      nowIso: "2026-05-04T10:00:00.000Z"
    });
    assert.equal(summary.status, "unavailable");
    assert.equal(summary.missingDataBlocksLive, false);
    assert.ok(summary.warnings.includes("derivatives_data_missing"));
  });

  await runCheck("derivatives context flags extreme funding and rising OI", async () => {
    const summary = buildDerivativesContext({
      providerSummary: {
        status: "ready",
        updatedAt: "2026-05-04T09:59:00.000Z",
        data: {
          funding: { rate: 0.0009, acceleration: 0.0002 },
          openInterest: { deltaPct: 0.04, acceleration: 0.01 },
          basis: { bps: 18, slopeBps: 3, regime: "contango_expanding" },
          liquidation: { trapRisk: 0.18, magnetStrength: 0.25 },
          takerImbalance: { medium: 0.42 }
        }
      },
      nowIso: "2026-05-04T10:00:00.000Z"
    });
    assert.equal(summary.status, "ready");
    assert.equal(summary.fundingPressure, "crowded_long");
    assert.equal(summary.openInterestTrend, "rising");
    assert.equal(summary.basisState, "contango_expanding");
    assert.ok(summary.warnings.includes("funding_extreme"));
    assert.equal(summary.diagnosticsOnly, true);
  });

  await runCheck("derivatives context flags negative basis and stale data", async () => {
    const summary = buildDerivativesContext({
      providerSummary: {
        status: "degraded",
        updatedAt: "2026-05-04T09:00:00.000Z",
        data: {
          funding: { rate: -0.0002 },
          openInterest: { deltaPct: -0.03, acceleration: -0.04 },
          basis: { bps: -14, slopeBps: -4 },
          liquidation: { trapRisk: 0.68, magnetStrength: 0.62 }
        }
      },
      nowIso: "2026-05-04T10:00:00.000Z",
      maxAgeMs: 15 * 60_000
    });
    assert.equal(summary.status, "stale");
    assert.equal(summary.openInterestTrend, "falling");
    assert.equal(summary.basisState, "backwardation");
    assert.ok(summary.warnings.includes("negative_basis"));
    assert.ok(summary.warnings.includes("derivatives_data_stale"));
    assert.ok(summary.warnings.includes("liquidation_risk_elevated"));
  });

  await runCheck("dashboard normalizer keeps derivatives context summary optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.derivativesContextSummary.status, "unavailable");

    const nested = normalizeDashboardSnapshotPayload({
      marketContext: {
        derivativesContextSummary: { status: "ready", confidence: 0.72 }
      }
    });
    assert.equal(nested.derivativesContextSummary.status, "ready");
    assert.equal(nested.derivativesContextSummary.confidence, 0.72);
  });
}
