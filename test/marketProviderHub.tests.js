import { MarketProviderHub } from "../src/market/marketProviderHub.js";
import { buildDerivativesContextProvider } from "../src/market/providers/derivativesContextProvider.js";
import { buildExecutionFeedbackProvider } from "../src/market/providers/executionFeedbackProvider.js";

export async function registerMarketProviderHubTests({
  runCheck,
  assert
}) {
  await runCheck("market provider hub degrades safely when providers are disabled", async () => {
    const hub = new MarketProviderHub({
      config: {
        enableMarketProviderDerivativesContext: false,
        enableMarketProviderMacroContext: false,
        enableMarketProviderExecutionFeedback: false,
        enableMarketProviderCrossExchangeDivergence: false,
        enableMarketProviderStablecoinFlows: false,
        enableMarketProviderMicrostructurePriors: false
      }
    });

    const summary = hub.buildSymbolSummary({ symbol: "BTCUSDT" });
    assert.equal(summary.status, "disabled");
    assert.equal(summary.enabledCount, 0);
    assert.equal(summary.providers.length, 6);
    assert.equal(summary.providers.every((item) => item.status === "disabled"), true);
  });

  await runCheck("derivatives provider normalizes taker, open-interest and basis context across horizons", async () => {
    const provider = buildDerivativesContextProvider({
      enabled: true,
      symbol: "BTCUSDT",
      runtime: {
        marketStructureCache: {
          "market:BTCUSDT": {
            payload: {
              takerLongShort: [
                { buyVol: 120, sellVol: 80 },
                { buyVol: 118, sellVol: 82 },
                { buyVol: 132, sellVol: 70 },
                { buyVol: 128, sellVol: 74 }
              ],
              openInterestHist: [
                { sumOpenInterest: 1000 },
                { sumOpenInterest: 1030 },
                { sumOpenInterest: 1070 },
                { sumOpenInterest: 1110 }
              ],
              basis: [
                { basisRate: 0.0004 },
                { basisRate: 0.0005 },
                { basisRate: 0.0007 },
                { basisRate: 0.0008 }
              ]
            }
          }
        }
      },
      marketStructureSummary: {
        fundingRate: 0.00012,
        liquidationMagnetDirection: "up",
        liquidationMagnetStrength: 0.42,
        liquidationTrapRisk: 0.18,
        squeezeContinuationScore: 0.36
      }
    });

    assert.equal(provider.status, "ready");
    assert.ok((provider.data.takerImbalance.short || 0) > 0);
    assert.ok((provider.data.openInterest.deltaPct || 0) > 0);
    assert.ok((provider.data.openInterest.percentile || 0) >= 0);
    assert.equal(provider.data.basis.regime, "contango_expanding");
  });

  await runCheck("execution feedback provider computes execution pain from scoped fills", async () => {
    const provider = buildExecutionFeedbackProvider({
      enabled: true,
      symbol: "BTCUSDT",
      sessionSummary: { session: "us" },
      regimeSummary: { regime: "trend" },
      strategySummary: { family: "breakout" },
      journal: {
        trades: [
          {
            symbol: "BTCUSDT",
            sessionAtEntry: "us",
            regimeAtEntry: "trend",
            family: "breakout",
            entryExecutionAttribution: {
              expectedSpreadBps: 1.2,
              realizedSpreadBps: 2.8,
              slippageDeltaBps: 1.9,
              fillSpeedMs: 1400,
              cancelReplaceCount: 1
            }
          },
          {
            symbol: "BTCUSDT",
            sessionAtEntry: "us",
            regimeAtEntry: "trend",
            family: "breakout",
            entryExecutionAttribution: {
              expectedSpreadBps: 1,
              realizedSpreadBps: 2.1,
              slippageDeltaBps: 1.2,
              fillSpeedMs: 1100,
              cancelReplaceCount: 0
            }
          },
          {
            symbol: "BTCUSDT",
            sessionAtEntry: "us",
            regimeAtEntry: "trend",
            family: "breakout",
            entryExecutionAttribution: {
              expectedSpreadBps: 1.1,
              realizedSpreadBps: 2.4,
              slippageDeltaBps: 1.6,
              fillSpeedMs: 1200,
              cancelReplaceCount: 1
            }
          },
          {
            symbol: "BTCUSDT",
            sessionAtEntry: "us",
            regimeAtEntry: "trend",
            family: "breakout",
            entryExecutionAttribution: {
              expectedSpreadBps: 1.1,
              realizedSpreadBps: 2.2,
              slippageDeltaBps: 1.4,
              fillSpeedMs: 1000,
              cancelReplaceCount: 0
            }
          }
        ]
      }
    });

    assert.equal(provider.status, "ready");
    assert.ok((provider.data.executionPainScore || 0) > 0);
    assert.ok((provider.data.executionQualityScore || 0) < 1);
  });

  await runCheck("market provider runtime health aggregates ready and degraded symbol summaries", async () => {
    const hub = new MarketProviderHub({ config: {} });
    const health = hub.buildRuntimeHealth({
      symbolSummaries: [
        {
          providers: [
            { id: "derivatives_context", enabled: true, status: "ready", score: 0.72 },
            { id: "macro_context", enabled: true, status: "degraded", score: 0.54 }
          ]
        },
        {
          providers: [
            { id: "derivatives_context", enabled: true, status: "ready", score: 0.78 },
            { id: "macro_context", enabled: true, status: "ready", score: 0.68 }
          ]
        }
      ]
    });

    assert.equal(health.status, "degraded");
    assert.equal(health.providerCount, 2);
    assert.equal(health.degradedCount, 1);
    assert.ok((health.score || 0) > 0);
  });
}
