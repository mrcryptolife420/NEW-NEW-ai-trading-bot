import { buildSymbolLifecycleRisk } from "../src/runtime/symbolLifecycleRisk.js";

const NOW = "2026-05-04T12:00:00.000Z";

export async function registerSymbolLifecycleRiskTests({ runCheck, assert }) {
  await runCheck("symbol lifecycle risk flags new listing", async () => {
    const risk = buildSymbolLifecycleRisk({
      symbol: "NEWUSDT",
      now: NOW,
      profile: { listedAt: "2026-05-01T00:00:00.000Z" },
      marketSnapshot: { book: { spreadBps: 4, depthConfidence: 0.7, totalDepthNotional: 90_000 } }
    });
    assert.equal(risk.lifecycleRisk, "watch");
    assert.ok(risk.warnings.includes("new_listing"));
    assert.equal(risk.liveBehaviorChanged, false);
  });

  await runCheck("symbol lifecycle risk keeps mature liquid symbol low", async () => {
    const risk = buildSymbolLifecycleRisk({
      symbol: "BTCUSDT",
      now: NOW,
      profile: { listedAt: "2019-01-01T00:00:00.000Z" },
      marketSnapshot: { book: { spreadBps: 0.8, depthConfidence: 0.9, totalDepthNotional: 5_000_000, spreadStabilityScore: 0.92 }, stream: { recentTradeCount: 50 }, market: { volumeZ: 0.4 } }
    });
    assert.equal(risk.lifecycleRisk, "low");
    assert.equal(risk.sizeMultiplier, 1);
    assert.equal(risk.entryAllowedDiagnostic, true);
  });

  await runCheck("symbol lifecycle risk blocks illiquid hype spike", async () => {
    const risk = buildSymbolLifecycleRisk({
      symbol: "HYPEUSDT",
      now: NOW,
      profile: { listedAt: "2026-05-02T00:00:00.000Z" },
      marketSnapshot: { book: { spreadBps: 28, depthConfidence: 0.2, totalDepthNotional: 8_000, spreadStabilityScore: 0.2 }, stream: { recentTradeCount: 1 }, market: { volumeZ: 7 } },
      newsItems: [{ title: "HYPEUSDT new listing volume spike" }]
    });
    assert.equal(risk.lifecycleRisk, "blocked");
    assert.equal(risk.entryAllowedDiagnostic, false);
    assert.ok(risk.requiredEvidence.includes("healthy_local_orderbook_depth"));
  });

  await runCheck("symbol lifecycle risk detects stale profile", async () => {
    const risk = buildSymbolLifecycleRisk({
      symbol: "OLDUSDT",
      now: NOW,
      profile: { stale: true },
      marketSnapshot: { stale: true, book: { spreadBps: 3, depthConfidence: 0.7, totalDepthNotional: 100_000 } }
    });
    assert.ok(["watch", "high"].includes(risk.lifecycleRisk));
    assert.ok(risk.warnings.includes("stale_symbol_profile"));
    assert.ok(risk.requiredEvidence.includes("fresh_profile_and_market_snapshot"));
  });

  await runCheck("symbol lifecycle risk handles missing profile", async () => {
    const risk = buildSymbolLifecycleRisk({ symbol: "UNKNOWNUSDT", marketSnapshot: {} });
    assert.ok(Number.isFinite(risk.riskScore));
    assert.ok(risk.warnings.includes("missing_listing_age"));
    assert.equal(risk.diagnosticsOnly, true);
  });

  await runCheck("symbol lifecycle risk blocks delisting or halt warning", async () => {
    const risk = buildSymbolLifecycleRisk({
      symbol: "ABCUSDT",
      now: NOW,
      profile: { listedAt: "2024-01-01T00:00:00.000Z" },
      marketSnapshot: { book: { spreadBps: 2, depthConfidence: 0.8, totalDepthNotional: 200_000 } },
      newsItems: [{ title: "Binance will delist ABCUSDT and suspend trading" }]
    });
    assert.equal(risk.lifecycleRisk, "blocked");
    assert.ok(risk.warnings.includes("delisting_or_halt_warning"));
  });
}
