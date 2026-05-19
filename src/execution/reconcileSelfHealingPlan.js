function buildReconcileEvidenceState({ exchangePosition = 0, localPosition = 0, openOrders = [], lastPrice = 0 } = {}) {
  const qtyDrift = Math.abs(Number(exchangePosition) - Number(localPosition));
  return {
    qtyDrift,
    flatOnExchange: Number(exchangePosition) === 0,
    localOpen: Number(localPosition) > 0,
    openOrders,
    lastPrice: Number(lastPrice)
  };
}

function buildReconcileActionCatalog(evidence = {}) {
  const actions = [];
  for (const order of evidence.openOrders || []) {
    if (order.status === "NEW" && Number(order.executedQty || 0) === 0) {
      actions.push({ action: "cancel_unfilled_order", orderId: order.orderId, reason: "open_unfilled_entry" });
    }
  }
  if (evidence.flatOnExchange && evidence.localOpen) {
    actions.push({ action: "clear_local_position", reason: "exchange_confirms_flat" });
  }
  if (evidence.qtyDrift > 0 && !evidence.flatOnExchange) {
    actions.push({ action: "manual_review", reason: "hard_inventory_conflict" });
  }
  return actions;
}

function planReconcileSelfHealing(input = {}) {
  const evidence = input.qtyDrift === undefined ? buildReconcileEvidenceState(input) : input;
  const actions = buildReconcileActionCatalog(evidence);
  return {
    evidence,
    actions,
    requiresManualReview: actions.some((action) => action.action === "manual_review"),
    canAutoResolve: actions.length > 0 && actions.every((action) => action.action !== "manual_review")
  };
}

export { buildReconcileEvidenceState, buildReconcileActionCatalog, planReconcileSelfHealing };
