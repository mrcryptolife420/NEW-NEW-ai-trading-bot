import { buildNewsShockCircuitBreaker } from "../src/news/shockCircuitBreaker.js";

const NOW = "2026-05-04T12:00:00.000Z";

export async function registerNewsShockCircuitBreakerTests({ runCheck, assert }) {
  await runCheck("news shock circuit breaker flags hack headline", async () => {
    const summary = buildNewsShockCircuitBreaker({
      now: NOW,
      watchlist: ["ABCUSDT"],
      items: [{ title: "ABC protocol exploit and hack drains bridge", source: "CoinDesk", provider: "coindesk", publishedAt: "2026-05-04T11:50:00.000Z" }]
    });
    assert.equal(summary.shockLevel, "critical");
    assert.equal(summary.manualReviewRecommended, true);
    assert.ok(summary.affectedSymbols.includes("ABCUSDT"));
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("news shock circuit breaker detects listing hype", async () => {
    const summary = buildNewsShockCircuitBreaker({
      now: NOW,
      watchlist: ["NEWUSDT"],
      items: [
        { title: "Binance announces NEWUSDT listing launchpool", source: "Binance", provider: "binance_support", publishedAt: "2026-05-04T11:45:00.000Z" },
        { title: "NEW token listing hype volume surges", source: "Cointelegraph", provider: "cointelegraph", publishedAt: "2026-05-04T11:48:00.000Z" }
      ]
    });
    assert.ok(["watch", "elevated"].includes(summary.shockLevel));
    assert.equal(summary.dominantEventType, "listing");
    assert.ok(summary.entryPenalty > 0);
  });

  await runCheck("news shock circuit breaker warns on stale provider", async () => {
    const summary = buildNewsShockCircuitBreaker({
      now: NOW,
      providerStatus: "stale",
      items: [{ title: "Old hack story resurfaces", source: "CoinDesk", provider: "coindesk", publishedAt: "2026-05-03T00:00:00.000Z" }]
    });
    assert.ok(summary.warnings.includes("stale_news_provider"));
    assert.equal(summary.shockLevel, "none");
    assert.ok(Number.isFinite(summary.shockScore));
  });

  await runCheck("news shock circuit breaker ignores irrelevant fresh news", async () => {
    const summary = buildNewsShockCircuitBreaker({
      now: NOW,
      items: [{ title: "Bitcoin market structure remains quiet", source: "Reuters", provider: "coindesk", publishedAt: "2026-05-04T11:30:00.000Z" }]
    });
    assert.equal(summary.shockLevel, "none");
    assert.equal(summary.entryPenalty, 0);
  });

  await runCheck("news shock circuit breaker handles missing news provider", async () => {
    const summary = buildNewsShockCircuitBreaker({ now: NOW, items: [] });
    assert.ok(summary.warnings.includes("missing_news_provider_data"));
    assert.equal(summary.fallbackSafe, true);
    assert.equal(summary.diagnosticsOnly, true);
  });
}
