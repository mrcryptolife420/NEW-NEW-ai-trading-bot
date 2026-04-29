import { buildCrossExchangeDivergenceProvider } from "../src/market/providers/crossExchangeDivergenceProvider.js";
import { buildStablecoinFlowProvider } from "../src/market/providers/stablecoinFlowProvider.js";
import { buildMicrostructurePriorProvider } from "../src/market/providers/microstructurePriorProvider.js";

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
}
