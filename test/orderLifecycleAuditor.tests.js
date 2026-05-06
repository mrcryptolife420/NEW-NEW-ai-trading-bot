import { auditOrderLifecycle } from "../src/execution/orderLifecycleAuditor.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

const now = "2026-05-06T12:00:00.000Z";

export async function registerOrderLifecycleAuditorTests({ runCheck, assert }) {
  await runCheck("order lifecycle auditor passes clean lifecycle", async () => {
    const summary = auditOrderLifecycle({
      now,
      localOrders: [{
        orderId: 101,
        symbol: "BTCUSDT",
        side: "BUY",
        status: "NEW",
        updatedAt: "2026-05-06T11:59:30.000Z"
      }],
      openOrders: [{ orderId: 101, symbol: "BTCUSDT", side: "BUY", status: "NEW" }],
      positions: []
    });
    assert.equal(summary.status, "ok");
    assert.equal(summary.entryBlocked, false);
    assert.equal(summary.liveMutationAdded, false);
  });

  await runCheck("order lifecycle auditor marks exchange-only order orphaned", async () => {
    const summary = auditOrderLifecycle({
      now,
      openOrders: [{ orderId: 202, symbol: "ETHUSDT", side: "BUY", status: "NEW" }]
    });
    assert.equal(summary.status, "degraded");
    assert.equal(summary.entryBlocked, true);
    assert.equal(summary.orphanedOrders.length, 1);
    assert.equal(summary.orphanedOrders[0].type, "exchange_only_order");
  });

  await runCheck("order lifecycle auditor degrades local-only stale order", async () => {
    const summary = auditOrderLifecycle({
      now,
      localOrders: [{
        orderId: 303,
        symbol: "SOLUSDT",
        side: "BUY",
        status: "SUBMITTED",
        updatedAt: "2026-05-06T11:00:00.000Z"
      }],
      config: { orderLifecycleStaleMs: 60_000 }
    });
    assert.equal(summary.status, "degraded");
    assert.equal(summary.localOnlyOrders.length, 1);
    assert.equal(summary.localOnlyOrders[0].blocksEntries, true);
  });

  await runCheck("order lifecycle auditor blocks unknown protective order", async () => {
    const summary = auditOrderLifecycle({
      now,
      positions: [{
        symbol: "BNBUSDT",
        status: "OPEN",
        protectiveOrderListId: 404
      }],
      openOrderLists: []
    });
    assert.equal(summary.status, "blocked");
    assert.equal(summary.entryBlocked, true);
    assert.equal(summary.unknownProtectiveOrders.length, 1);
    assert.equal(summary.recommendedAction, "manual_review_order_lifecycle_before_new_entries");
  });

  await runCheck("order lifecycle auditor keeps paper orphan simulations separate", async () => {
    const summary = auditOrderLifecycle({
      now,
      paperOrders: [{
        orderId: "paper-1",
        symbol: "XRPUSDT",
        brokerMode: "paper",
        status: "SUBMITTED"
      }]
    });
    assert.equal(summary.status, "ok");
    assert.equal(summary.entryBlocked, false);
    assert.equal(summary.paperMirrors.length, 1);
    assert.equal(summary.counts.paperMirrorOrders, 1);
  });

  await runCheck("order lifecycle auditor blocks unresolved protection intent", async () => {
    const summary = auditOrderLifecycle({
      now,
      intents: [{
        id: "intent-1",
        symbol: "ADAUSDT",
        kind: "rebuild_protection",
        status: "ambiguous"
      }]
    });
    assert.equal(summary.status, "blocked");
    assert.equal(summary.entryBlocked, true);
    assert.equal(summary.issues[0].type, "unresolved_protection_intent");
  });

  await runCheck("dashboard normalizer keeps order lifecycle audit optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.orderLifecycleAuditSummary.status, "unavailable");
    const normalized = normalizeDashboardSnapshotPayload({
      orderLifecycleAuditSummary: {
        status: "blocked",
        entryBlocked: true,
        issues: [{ type: "unknown_protective_order" }]
      }
    });
    assert.equal(normalized.orderLifecycleAuditSummary.status, "blocked");
    assert.equal(normalized.orderLifecycleAuditSummary.entryBlocked, true);
  });
}
