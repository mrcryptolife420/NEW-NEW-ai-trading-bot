import { buildExecutionFeedbackDataset } from "../src/runtime/executionFeedbackLearning.js";

export async function registerExecutionFeedbackLearningTests({
  runCheck,
  assert
}) {
  await runCheck("execution feedback learning builds scoped pain and reliability metrics from fills", async () => {
    const dataset = buildExecutionFeedbackDataset({
      journal: {
        trades: [
          {
            symbol: "BTCUSDT",
            sessionAtEntry: "us",
            regimeAtEntry: "trend",
            family: "breakout",
            entryExecutionAttribution: {
              expectedSpreadBps: 1.2,
              realizedSpreadBps: 2.4,
              expectedSlippageBps: 0.4,
              realizedSlippageBps: 1.1,
              slippageDeltaBps: 0.7,
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
              expectedSpreadBps: 1,
              realizedSpreadBps: 1.9,
              expectedSlippageBps: 0.3,
              realizedSlippageBps: 0.8,
              slippageDeltaBps: 0.5,
              fillSpeedMs: 900,
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
              realizedSpreadBps: 2,
              expectedSlippageBps: 0.35,
              realizedSlippageBps: 0.9,
              slippageDeltaBps: 0.55,
              fillSpeedMs: 1000,
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
              realizedSpreadBps: 2.1,
              expectedSlippageBps: 0.35,
              realizedSlippageBps: 0.95,
              slippageDeltaBps: 0.6,
              fillSpeedMs: 1100,
              cancelReplaceCount: 0
            }
          }
        ]
      },
      symbol: "BTCUSDT",
      session: "us",
      regime: "trend",
      family: "breakout"
    });

    assert.equal(dataset.status, "ready");
    assert.ok((dataset.executionPainScore || 0) > 0);
    assert.ok((dataset.executionQualityScore || 0) < 1);
    assert.ok((dataset.fillReliability || 0) > 0);
  });
}
