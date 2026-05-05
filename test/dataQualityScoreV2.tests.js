import {
  buildDataQualityScoreV2,
  attachDataQualityToCandidate,
  summarizeDataQualityScores
} from "../src/runtime/dataQualityScoreV2.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

const NOW = "2026-05-05T12:00:00.000Z";

function candles(overrides = {}) {
  return [
    { open: 100, high: 102, low: 99, close: 101, volume: 1000, closeTime: "2026-05-05T11:56:00.000Z", ...overrides[0] },
    { open: 101, high: 103, low: 100, close: 102, volume: 1100, closeTime: "2026-05-05T11:57:00.000Z", ...overrides[1] },
    { open: 102, high: 104, low: 101, close: 103, volume: 1200, closeTime: "2026-05-05T11:58:00.000Z", ...overrides[2] }
  ];
}

function baseInput(overrides = {}) {
  return {
    symbol: "BTCUSDT",
    candles: candles(),
    ticker: { price: 103, updatedAt: "2026-05-05T11:59:30.000Z" },
    orderBook: { bid: 102.99, ask: 103.01, spreadBps: 2, depthConfidence: 0.92, updatedAt: "2026-05-05T11:59:45.000Z" },
    marketSnapshot: { updatedAt: "2026-05-05T11:59:30.000Z", streamUpdatedAt: "2026-05-05T11:59:45.000Z" },
    decision: { decisionId: "d1", createdAt: "2026-05-05T11:59:40.000Z" },
    features: { featureSetId: "pack-v1", computedAt: "2026-05-05T11:59:35.000Z", configHash: "cfg", dataHash: "data" },
    optionalProviders: { news: { status: "fresh", updatedAt: "2026-05-05T11:40:00.000Z" } },
    now: NOW,
    mode: "paper",
    ...overrides
  };
}

export async function registerDataQualityScoreV2Tests({ runCheck, assert }) {
  await runCheck("data quality score v2 clean candles orderbook produce high quality", async () => {
    const quality = buildDataQualityScoreV2(baseInput());
    assert.ok(quality.dataQualityScore >= 0.82);
    assert.equal(quality.status, "trusted");
    assert.equal(quality.learningEvidenceEligible, true);
  });

  await runCheck("data quality score v2 missing candle gap lowers quality", async () => {
    const clean = buildDataQualityScoreV2(baseInput());
    const quality = buildDataQualityScoreV2(baseInput({
      candles: [
        { open: 100, high: 101, low: 99, close: 100.5, volume: 1000, closeTime: "2026-05-05T10:00:00.000Z" },
        { open: 100.5, high: 102, low: 100, close: 101, volume: 900, closeTime: "2026-05-05T11:58:00.000Z" }
      ]
    }));
    assert.ok(quality.dataQualityScore < clean.dataQualityScore);
    assert.ok(quality.reasons.includes("candle_timestamp_gap"));
  });

  await runCheck("data quality score v2 impossible OHLC lowers quality", async () => {
    const quality = buildDataQualityScoreV2(baseInput({
      candles: candles({ 1: { high: 99, low: 101 } })
    }));
    assert.equal(quality.status, "unreliable");
    assert.ok(quality.reasons.includes("impossible_ohlc"));
    assert.equal(quality.learningEvidenceEligible, false);
  });

  await runCheck("data quality score v2 stale ticker lowers quality", async () => {
    const clean = buildDataQualityScoreV2(baseInput());
    const quality = buildDataQualityScoreV2(baseInput({
      ticker: { price: 103, updatedAt: "2026-05-05T11:00:00.000Z" },
      marketSnapshot: { updatedAt: "2026-05-05T11:00:00.000Z", streamUpdatedAt: "2026-05-05T11:59:45.000Z" }
    }));
    assert.ok(quality.dataQualityScore < clean.dataQualityScore);
    assert.ok(quality.reasons.includes("ticker_stale"));
  });

  await runCheck("data quality score v2 missing optional provider does not mark data safe", async () => {
    const quality = buildDataQualityScoreV2(baseInput({
      optionalProviders: { news: { status: "missing" } }
    }));
    assert.ok(quality.reasons.includes("optional_provider_missing:news"));
    assert.equal(quality.diagnosticsOnly, true);
    assert.equal(quality.liveSafetyImpact, "negative_only");
  });

  await runCheck("data quality score v2 attaches candidate diagnostics and dashboard summary", async () => {
    const quality = buildDataQualityScoreV2(baseInput());
    const candidate = attachDataQualityToCandidate({ symbol: "BTCUSDT" }, quality);
    const summary = summarizeDataQualityScores([quality]);
    const normalized = normalizeDashboardSnapshotPayload({
      dataIntegrity: { dataQualityScoreSummary: summary }
    });
    assert.equal(candidate.dataQualityScore, quality.dataQualityScore);
    assert.equal(candidate.dataQuality.learningEvidenceEligible, true);
    assert.equal(normalized.dataQualityScoreSummary.count, 1);
    assert.equal(normalized.dataQualityScoreSummary.liveSafetyImpact, "negative_only");
  });
}
