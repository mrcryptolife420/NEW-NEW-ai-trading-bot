import {
  buildFastQueueTriggerFromCross,
  buildNearThresholdWatchlist,
  detectThresholdCross
} from "../src/runtime/nearThresholdWatchlist.js";

export function registerNearThresholdWatchlistTests({ runCheck, assert }) {
  runCheck("near-threshold watchlist tracks two and five percent bands", () => {
    const summary = buildNearThresholdWatchlist({
      now: "2026-05-08T10:00:00.000Z",
      candidates: [
        { symbol: "BTCUSDT", probability: 0.692, threshold: 0.7 },
        { symbol: "ETHUSDT", probability: 0.672, threshold: 0.7 },
        { symbol: "SOLUSDT", probability: 0.62, threshold: 0.7 }
      ]
    });
    assert.equal(summary.status, "watching");
    assert.equal(summary.within2Pct, 1);
    assert.equal(summary.within5Pct, 1);
    assert.equal(summary.items[0].symbol, "BTCUSDT");
    assert.equal(summary.items.some((item) => item.symbol === "SOLUSDT"), false);
  });

  runCheck("near-threshold watchlist expires old entries", () => {
    const summary = buildNearThresholdWatchlist({
      now: "2026-05-08T10:02:01.000Z",
      previousWatchlist: [
        { symbol: "BTCUSDT", probability: 0.69, threshold: 0.7, expiresAt: "2026-05-08T10:02:00.000Z" },
        { symbol: "ETHUSDT", probability: 0.69, threshold: 0.7, expiresAt: "2026-05-08T10:03:00.000Z" }
      ],
      candidates: []
    });
    assert.equal(summary.items.length, 1);
    assert.equal(summary.items[0].symbol, "ETHUSDT");
  });

  runCheck("near-threshold threshold cross builds safe queue trigger", () => {
    const cross = detectThresholdCross({
      now: "2026-05-08T10:00:01.000Z",
      previousItem: { symbol: "BTCUSDT", probability: 0.69, threshold: 0.7, candidateId: "btc-1" },
      candidate: { symbol: "BTCUSDT", probability: 0.705, threshold: 0.7, id: "btc-2" }
    });
    const trigger = buildFastQueueTriggerFromCross({ cross, ttlMs: 4000 });
    assert.equal(cross.crossed, true);
    assert.equal(trigger.shouldQueue, true);
    assert.equal(trigger.queueItem.symbol, "BTCUSDT");
    assert.equal(trigger.queueItem.source, "near_threshold_cross");
    assert.equal(trigger.liveBehaviorChanged, false);
  });

  runCheck("near-threshold does not queue without confirmed cross", () => {
    const cross = detectThresholdCross({
      previousItem: { symbol: "BTCUSDT", probability: 0.69, threshold: 0.7 },
      candidate: { symbol: "BTCUSDT", probability: 0.695, threshold: 0.7 }
    });
    const trigger = buildFastQueueTriggerFromCross({ cross });
    assert.equal(cross.crossed, false);
    assert.equal(trigger.shouldQueue, false);
    assert.equal(trigger.blockedReason, "threshold_not_crossed");
  });
}
