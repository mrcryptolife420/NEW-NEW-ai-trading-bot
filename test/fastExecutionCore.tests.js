import { buildImmediateEntryQueueItem, enqueueImmediateEntry, summarizeImmediateEntryQueue } from "../src/runtime/immediateEntryQueue.js";
import { runFastPreflightRisk } from "../src/risk/fastPreflightRisk.js";

export async function registerFastExecutionCoreTests({ runCheck, assert }) {
  const now = "2026-05-08T10:00:00.000Z";

  await runCheck("immediate entry queue deduplicates symbols", async () => {
    const item = buildImmediateEntryQueueItem({ symbol: "btcusdt", now });
    const first = enqueueImmediateEntry({ queue: [], item, now });
    const second = enqueueImmediateEntry({ queue: first.queue, item: buildImmediateEntryQueueItem({ symbol: "BTCUSDT", now }), now });
    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.blockedReason, "duplicate_symbol_queue_item");
  });

  await runCheck("immediate entry queue blocks unresolved execution intents", async () => {
    const item = buildImmediateEntryQueueItem({ symbol: "ETHUSDT", now });
    const result = enqueueImmediateEntry({
      queue: [],
      item,
      unresolvedIntents: [{ symbol: "ETHUSDT", status: "pending", kind: "entry" }],
      now
    });
    assert.equal(result.accepted, false);
    assert.equal(result.blockedReason, "unresolved_execution_intent");
  });

  await runCheck("immediate entry queue summarizes expired candidates", async () => {
    const item = buildImmediateEntryQueueItem({ symbol: "SOLUSDT", now, ttlMs: 1000 });
    const summary = summarizeImmediateEntryQueue({ queue: [item], now: "2026-05-08T10:00:02.000Z" });
    assert.equal(summary.size, 0);
    assert.equal(summary.expiredCount, 1);
    assert.equal(summary.items[0].status, "expired");
    assert.equal(summary.items[0].blockedReason, "candidate_expired");
  });

  await runCheck("immediate entry queue stores source trace context and preflight deadline", async () => {
    const item = buildImmediateEntryQueueItem({
      symbol: "ADAUSDT",
      source: "fast_signal_trigger",
      now,
      ttlMs: 5000,
      latencyBudgetMs: 250,
      traceContext: { marketDataAgeMs: 120, featuresHash: "features-fast" }
    });
    assert.equal(item.source, "fast_signal_trigger");
    assert.equal(item.preflightDeadlineAt, "2026-05-08T10:00:00.250Z");
    assert.equal(item.latencyBudgetMs, 250);
    assert.equal(item.traceContext.featuresHash, "features-fast");
  });

  await runCheck("fast preflight allows clean fresh candidate", async () => {
    const result = runFastPreflightRisk({
      candidate: { symbol: "BTCUSDT", allow: true, marketDataAgeMs: 400, spreadBps: 2 },
      config: { maxOpenPositions: 3, maxSpreadBps: 5, fastExecutionMinDataFreshnessMs: 1500 },
      openPositions: [],
      riskVerdict: { allow: true },
      exchangeSafety: { status: "ready" },
      health: { circuitOpen: false },
      operatorMode: "active"
    });
    assert.equal(result.allow, true);
    assert.deepEqual(result.reasonCodes, []);
  });

  await runCheck("fast preflight blocks all required safety blockers", async () => {
    const result = runFastPreflightRisk({
      candidate: { symbol: "BTCUSDT", allow: false, marketDataAgeMs: 3000, spreadBps: 10, manualReviewRequired: true },
      config: { maxOpenPositions: 1, maxSpreadBps: 5, fastExecutionMinDataFreshnessMs: 1500 },
      openPositions: [{ symbol: "BTCUSDT" }],
      unresolvedIntents: [{ symbol: "BTCUSDT", status: "pending", kind: "entry" }],
      riskVerdict: { allow: false },
      exchangeSafety: { entryBlocked: true },
      health: { circuitOpen: true },
      operatorMode: "protect_only"
    });
    for (const reason of [
      "duplicate_symbol_position",
      "max_open_positions_reached",
      "spread_too_high",
      "market_data_stale",
      "risk_verdict_blocked",
      "exchange_safety_blocked",
      "unresolved_execution_intent",
      "health_circuit_open",
      "operator_mode_blocks_entries",
      "manual_review_required"
    ]) {
      assert.ok(result.reasonCodes.includes(reason), reason);
    }
    assert.equal(result.allow, false);
  });
}
