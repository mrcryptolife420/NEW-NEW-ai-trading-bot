function num(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = "") {
  const result = `${value ?? ""}`.trim();
  return result || fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function resolveOrder(position = {}, protectiveOrder = {}) {
  if (protectiveOrder && Object.keys(protectiveOrder).length) {
    return protectiveOrder;
  }
  const orders = Array.isArray(position.protectiveOrders) ? position.protectiveOrders : [];
  return orders.find((order) => upper(order.type).includes("STOP")) || {};
}

function resolveMarketPrice(marketSnapshot = {}) {
  return {
    bid: num(marketSnapshot.bid ?? marketSnapshot.book?.bid, null),
    mid: num(marketSnapshot.mid ?? marketSnapshot.markPrice ?? marketSnapshot.book?.mid, null),
    ask: num(marketSnapshot.ask ?? marketSnapshot.book?.ask, null)
  };
}

export function buildStopLimitStuckAssessment({
  position = {},
  protectiveOrder = {},
  marketSnapshot = {},
  now = new Date().toISOString()
} = {}) {
  const order = resolveOrder(position, protectiveOrder);
  const type = upper(order.type || order.orderType || position.protectiveOrderType);
  const status = upper(order.status || order.orderStatus || position.protectiveOrderStatus);
  const stopTriggerPrice = num(order.stopPrice ?? order.stopTriggerPrice ?? position.stopLossPrice, null);
  const stopLimitPrice = num(order.price ?? order.stopLimitPrice ?? position.stopLimitPrice, null);
  const origQty = num(order.origQty ?? order.originalQuantity ?? position.quantity, 0);
  const executedQty = num(order.executedQty ?? order.cumQty ?? 0, 0);
  const remainingQty = Math.max(0, (origQty || 0) - (executedQty || 0));
  const { bid, mid, ask } = resolveMarketPrice(marketSnapshot);
  const referencePrice = bid ?? mid;
  const issues = [];

  if (!type.includes("STOP")) issues.push("not_stop_limit_order");
  if (!["NEW", "PARTIALLY_FILLED", "PENDING_NEW", "TRIGGERED"].includes(status)) issues.push("order_not_open_or_triggerable");
  if (!Number.isFinite(stopTriggerPrice) || stopTriggerPrice <= 0) issues.push("missing_stop_trigger_price");
  if (!Number.isFinite(stopLimitPrice) || stopLimitPrice <= 0) issues.push("missing_stop_limit_price");
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) issues.push("missing_market_price");

  const triggeredByPrice = Number.isFinite(referencePrice) && Number.isFinite(stopTriggerPrice) && referencePrice <= stopTriggerPrice;
  const triggeredByStatus = ["PARTIALLY_FILLED", "TRIGGERED"].includes(status) || Boolean(order.triggered || order.isTriggered);
  const triggered = Boolean(triggeredByPrice || triggeredByStatus);
  const unfilled = remainingQty > 0 && !["FILLED", "CANCELED", "REJECTED", "EXPIRED"].includes(status);
  const bidBelowStopLimit = Number.isFinite(bid) && Number.isFinite(stopLimitPrice) && bid < stopLimitPrice;
  const limitLikelyUnfillable = triggered && unfilled && bidBelowStopLimit;

  let statusResult = "ok";
  let severity = "info";
  let reason = null;
  if (issues.length) {
    statusResult = "manual_review";
    severity = "medium";
    reason = "stop_limit_stuck_evidence_incomplete";
  } else if (limitLikelyUnfillable) {
    statusResult = "stop_limit_stuck";
    severity = "high";
    reason = "stop_triggered_limit_unfilled_bid_below_limit";
  } else if (triggered && unfilled) {
    statusResult = "triggered_unfilled_watch";
    severity = "medium";
    reason = "stop_triggered_but_limit_may_still_fill";
  }

  return {
    status: statusResult,
    reason,
    severity,
    symbol: position.symbol || order.symbol || null,
    stopLimitStuck: statusResult === "stop_limit_stuck",
    manualReviewRequired: statusResult === "manual_review" || statusResult === "stop_limit_stuck",
    triggered,
    unfilled,
    bidBelowStopLimit,
    issues,
    diagnostics: {
      orderId: order.orderId ?? null,
      orderListId: position.protectiveOrderListId ?? order.orderListId ?? null,
      type,
      orderStatus: status,
      stopTriggerPrice,
      stopLimitPrice,
      bid,
      mid,
      ask,
      origQty,
      executedQty,
      remainingQty,
      checkedAt: now
    },
    positionPatch: statusResult === "stop_limit_stuck"
      ? {
          stopLimitStuck: true,
          lifecycleState: "manual_review",
          manualReviewRequired: true,
          lastManagementError: "Protective stop-limit appears triggered but unfilled with bid below stop limit."
        }
      : {},
    nextAction: statusResult === "stop_limit_stuck"
      ? "manual_review_reconcile_or_existing_safe_exit_policy"
      : statusResult === "manual_review"
        ? "collect_order_and_market_evidence_before_action"
        : triggered && unfilled
          ? "monitor_stop_limit_fill_or_reconcile"
          : "monitor",
    forbiddenActions: ["blind_market_sell_without_confirmed_safe_policy"]
  };
}
