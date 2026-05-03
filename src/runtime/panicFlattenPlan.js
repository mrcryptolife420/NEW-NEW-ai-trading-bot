function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function symbolPrice(symbol, marketSnapshots = {}) {
  const snap = marketSnapshots[symbol] || marketSnapshots[symbol?.toUpperCase?.()] || {};
  return num(snap.bid || snap.mid || snap.price || snap.lastPrice, null);
}

export function buildPanicFlattenPlan({ config = {}, positions = [], marketSnapshots = {}, symbolRules = {}, openOrders = [] } = {}) {
  const risks = ["dry_run_only_no_orders_will_be_placed"];
  const blockedReasons = [];
  const positionsToClose = arr(positions).map((position) => {
    const symbol = position.symbol || null;
    const quantity = num(position.quantity ?? position.qty, 0);
    const price = symbolPrice(symbol, marketSnapshots);
    const notional = price == null ? null : quantity * price;
    const minNotional = num(symbolRules[symbol]?.minNotional || config.minTradeUsdt, 0);
    const blockers = [];
    if (!symbol || quantity <= 0) blockers.push("invalid_position");
    if (price == null) blockers.push("missing_market_data");
    if (notional != null && minNotional > 0 && notional < minNotional) blockers.push("below_min_notional");
    blockedReasons.push(...blockers);
    return {
      symbol,
      quantity,
      estimatedExitPrice: price,
      estimatedNotional: notional,
      protected: Boolean(position.protection || position.protectiveOrder || position.ocoOrderListId),
      blockers
    };
  });
  const ordersToCancel = arr(openOrders).map((order) => ({
    symbol: order.symbol || null,
    orderId: order.orderId || order.id || null,
    side: order.side || null,
    type: order.type || null
  }));
  if (ordersToCancel.length) {
    risks.push("open_orders_require_cancel_plan_before_flatten");
  }
  if (!positionsToClose.length) {
    risks.push("no_open_positions_detected");
  }
  return {
    mode: "dry_run",
    warning: "Dry-run panic plan only. No orders are placed or canceled by this command.",
    positionsToClose,
    ordersToCancel,
    estimatedNotional: positionsToClose.reduce((total, item) => total + num(item.estimatedNotional, 0), 0),
    risks,
    blockedReasons: [...new Set(blockedReasons)],
    requiredConfirmation: "Explicit operator confirmation and existing safe live flow required before any real flatten action."
  };
}
