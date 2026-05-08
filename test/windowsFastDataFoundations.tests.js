import { DashboardEventBus, buildSseEventPayload } from "../src/dashboard/eventBus.js";
import { buildStreamFreshnessSummary } from "../src/runtime/streamFreshnessMonitor.js";
import { buildHotSymbolLane } from "../src/runtime/hotSymbolLane.js";
import { createFeatureCacheState, summarizeFeatureCache, updateFeatureGroup } from "../src/runtime/incrementalFeatureCache.js";

export async function registerWindowsFastDataFoundationsTests({ runCheck, assert }) {
  await runCheck("dashboard event bus redacts secrets and stores safe history", async () => {
    const payload = buildSseEventPayload("alert_update", { apiSecret: "hidden", nested: { token: "hidden" }, ok: true });
    assert.equal(payload.type, "alert_update");
    assert.equal(JSON.stringify(payload).includes("hidden"), false);
    const bus = new DashboardEventBus({ maxHistory: 2 });
    bus.publish("bot_status", { authorization: "Bearer hidden" });
    assert.equal(bus.summary().historyCount, 1);
    assert.equal(JSON.stringify(bus.summary()).includes("hidden"), false);
  });

  await runCheck("stream freshness summary reports fresh and stale symbols", async () => {
    const summary = buildStreamFreshnessSummary({
      symbols: ["BTCUSDT", "ETHUSDT"],
      now: "2026-05-08T10:00:00.000Z",
      symbolStreams: {
        BTCUSDT: {
          lastTradeAt: "2026-05-08T09:59:59.000Z",
          lastBookAt: "2026-05-08T09:59:59.200Z",
          lastKlineAt: "2026-05-08T09:59:00.000Z",
          lastDepthAt: "2026-05-08T09:59:59.100Z"
        },
        ETHUSDT: {
          lastTradeAt: "2026-05-08T09:59:00.000Z"
        }
      }
    });
    assert.equal(summary.status, "degraded");
    assert.equal(summary.symbolsFresh, 1);
    assert.ok(summary.rows.find((row) => row.symbol === "ETHUSDT").staleSources.includes("trade"));
  });

  await runCheck("hot symbol lane prioritizes positions then near-threshold candidates", async () => {
    const result = buildHotSymbolLane({
      openPositions: [{ symbol: "SOLUSDT" }],
      candidates: [
        { symbol: "BTCUSDT", probability: 0.69, threshold: 0.7 },
        { symbol: "ETHUSDT", probability: 0.66, threshold: 0.7 }
      ],
      marketChanges: { XRPUSDT: { volumeSpikeScore: 0.9, levelBreak: true } },
      maxSymbols: 3
    });
    assert.equal(result.hotSymbols[0].symbol, "SOLUSDT");
    assert.ok(result.hotSymbols.some((item) => item.reasons.includes("within_2pct_threshold")));
  });

  await runCheck("incremental feature cache tracks feature group age", async () => {
    let cache = createFeatureCacheState();
    cache = updateFeatureGroup(cache, {
      symbol: "BTCUSDT",
      group: "fast",
      features: { spreadBps: 2 },
      at: "2026-05-08T09:59:59.000Z"
    });
    const summary = summarizeFeatureCache(cache, { now: "2026-05-08T10:00:00.000Z" });
    const btc = summary.symbols[0];
    assert.equal(btc.groups.fast.ageMs, 1000);
    assert.equal(btc.groups.fast.stale, false);
    assert.equal(btc.groups.medium.stale, true);
  });
}
