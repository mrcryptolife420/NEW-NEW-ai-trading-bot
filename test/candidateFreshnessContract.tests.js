import { attachCandidateFreshness, buildCandidateFreshnessContract } from "../src/runtime/candidateFreshnessContract.js";

export async function registerCandidateFreshnessContractTests({ runCheck, assert }) {
  const now = "2026-05-08T10:00:00.000Z";

  await runCheck("candidate freshness contract marks fresh candidates eligible", async () => {
    const result = buildCandidateFreshnessContract({
      candidate: {
        createdAt: "2026-05-08T09:59:59.000Z",
        marketUpdatedAt: "2026-05-08T09:59:59.200Z",
        featureUpdatedAt: "2026-05-08T09:59:58.000Z"
      },
      now,
      ttlMs: 5000,
      maxMarketDataAgeMs: 1500
    });
    assert.equal(result.dataFreshnessStatus, "fresh");
    assert.equal(result.fastExecutionEligible, true);
    assert.equal(result.marketDataAgeMs, 800);
    assert.equal(result.featureAgeMs, 2000);
  });

  await runCheck("candidate freshness contract blocks expired candidates", async () => {
    const result = buildCandidateFreshnessContract({
      candidate: {
        createdAt: "2026-05-08T09:59:50.000Z",
        validUntil: "2026-05-08T09:59:55.000Z",
        marketUpdatedAt: "2026-05-08T09:59:59.900Z"
      },
      now
    });
    assert.equal(result.expired, true);
    assert.equal(result.fastExecutionEligible, false);
    assert.equal(result.reason, "candidate_expired");
  });

  await runCheck("candidate freshness contract blocks stale market data", async () => {
    const result = buildCandidateFreshnessContract({
      candidate: {
        createdAt: "2026-05-08T09:59:59.000Z",
        marketUpdatedAt: "2026-05-08T09:59:55.000Z"
      },
      now,
      maxMarketDataAgeMs: 1500
    });
    assert.equal(result.dataFreshnessStatus, "stale");
    assert.equal(result.fastExecutionEligible, false);
    assert.equal(result.reason, "market_data_stale");
  });

  await runCheck("candidate freshness contract attaches dashboard-safe fields", async () => {
    const enriched = attachCandidateFreshness({ symbol: "BTCUSDT" }, { now, ttlMs: 5000 });
    assert.equal(enriched.symbol, "BTCUSDT");
    assert.equal(enriched.createdAt, now);
    assert.equal(enriched.validUntil, "2026-05-08T10:00:05.000Z");
    assert.equal(Number.isFinite(enriched.marketDataAgeMs), true);
    assert.equal(enriched.candidateFreshness.diagnosticsOnly, true);
    assert.equal(enriched.candidateFreshness.liveBehaviorChanged, false);
  });
}
