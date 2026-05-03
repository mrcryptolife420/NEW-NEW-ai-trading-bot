import { buildStopLimitStuckAssessment } from "../src/execution/stopLimitStuck.js";

function assertFiniteTree(assert, value, path = "value") {
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${path} must be finite`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(assert, child, `${path}.${key}`);
  }
}

const basePosition = {
  symbol: "BTCUSDT",
  quantity: 0.1,
  stopLossPrice: 98,
  protectiveOrderListId: 123
};

const baseStopOrder = {
  symbol: "BTCUSDT",
  orderId: 456,
  orderListId: 123,
  type: "STOP_LOSS_LIMIT",
  status: "NEW",
  stopPrice: 98,
  price: 97.5,
  origQty: 0.1,
  executedQty: 0
};

export async function registerStopLimitStuckTests({ runCheck, assert }) {
  await runCheck("stop-limit stuck detects triggered unfilled stop with bid below stop limit", async () => {
    const result = buildStopLimitStuckAssessment({
      position: basePosition,
      protectiveOrder: baseStopOrder,
      marketSnapshot: { book: { bid: 96.8, mid: 96.9, ask: 97 } },
      now: "2026-05-03T00:00:00.000Z"
    });

    assert.equal(result.status, "stop_limit_stuck");
    assert.equal(result.stopLimitStuck, true);
    assert.equal(result.manualReviewRequired, true);
    assert.equal(result.triggered, true);
    assert.equal(result.unfilled, true);
    assert.equal(result.bidBelowStopLimit, true);
    assert.equal(result.positionPatch.lifecycleState, "manual_review");
    assert.equal(result.nextAction, "manual_review_reconcile_or_existing_safe_exit_policy");
    assert.equal(result.forbiddenActions.includes("blind_market_sell_without_confirmed_safe_policy"), true);
    assertFiniteTree(assert, result);
  });

  await runCheck("stop-limit stuck watches triggered unfilled stop when bid remains above stop limit", async () => {
    const result = buildStopLimitStuckAssessment({
      position: basePosition,
      protectiveOrder: baseStopOrder,
      marketSnapshot: { book: { bid: 97.7, mid: 97.9, ask: 98.1 } }
    });

    assert.equal(result.status, "triggered_unfilled_watch");
    assert.equal(result.stopLimitStuck, false);
    assert.equal(result.manualReviewRequired, false);
    assert.equal(result.nextAction, "monitor_stop_limit_fill_or_reconcile");
  });

  await runCheck("stop-limit stuck remains ok when protective stop is not triggered", async () => {
    const result = buildStopLimitStuckAssessment({
      position: basePosition,
      protectiveOrder: baseStopOrder,
      marketSnapshot: { book: { bid: 101, mid: 101.2, ask: 101.4 } }
    });

    assert.equal(result.status, "ok");
    assert.equal(result.triggered, false);
    assert.equal(result.stopLimitStuck, false);
    assert.equal(result.nextAction, "monitor");
  });

  await runCheck("stop-limit stuck requires manual review on ambiguous missing evidence", async () => {
    const result = buildStopLimitStuckAssessment({
      position: { symbol: "BTCUSDT", quantity: 0.1 },
      protectiveOrder: { type: "STOP_LOSS_LIMIT", status: "NEW", stopPrice: 98 },
      marketSnapshot: {}
    });

    assert.equal(result.status, "manual_review");
    assert.equal(result.manualReviewRequired, true);
    assert.equal(result.issues.includes("missing_stop_limit_price"), true);
    assert.equal(result.issues.includes("missing_market_price"), true);
    assert.equal(result.nextAction, "collect_order_and_market_evidence_before_action");
    assert.equal(result.forbiddenActions.includes("blind_market_sell_without_confirmed_safe_policy"), true);
  });
}
