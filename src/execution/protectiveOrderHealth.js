function scoreProtectiveOrderHealth({ position = {}, market = {}, exchangeTruth = {} } = {}) {
  const entryPrice = Number(position.entryPrice || 0);
  const stopPrice = Number(exchangeTruth.stopPrice || position.stopPrice || 0);
  const takeProfitPrice = Number(exchangeTruth.takeProfitPrice || position.takeProfitPrice || 0);
  const lastPrice = Number(market.lastPrice || market.price || entryPrice);
  const hasPosition = Number(position.quantity || position.qty || 0) > 0;
  const hasStop = stopPrice > 0;
  const hasTarget = takeProfitPrice > 0;
  const invalidStopGeometry = hasPosition && hasStop && stopPrice >= lastPrice;
  const invalidTargetGeometry = hasPosition && hasTarget && takeProfitPrice <= lastPrice;
  const staleMs = Number(exchangeTruth.staleMs || 0);
  const stuck = Boolean(exchangeTruth.stuck || staleMs > 5 * 60 * 1000);
  const blockers = [
    ...(!hasPosition ? ["no_position"] : []),
    ...(hasPosition && !hasStop ? ["missing_stop"] : []),
    ...(hasPosition && !hasTarget ? ["missing_take_profit"] : []),
    ...(invalidStopGeometry ? ["invalid_stop_geometry"] : []),
    ...(invalidTargetGeometry ? ["invalid_target_geometry"] : []),
    ...(stuck ? ["exchange_truth_stale_or_stuck"] : [])
  ];
  const score = Math.max(0, 1 - blockers.length * 0.2);
  return {
    score,
    status: blockers.length === 0 ? "healthy" : score <= 0.4 ? "critical" : "degraded",
    blockers,
    exchangeTruthRequired: hasPosition
  };
}

function buildExitRefreshPolicy({ health, replacementOrder, requestedAction = "refresh" } = {}) {
  const unsafeCancel = requestedAction === "cancel" && !replacementOrder;
  return {
    action: unsafeCancel ? "block" : health?.status === "healthy" ? "keep" : "refresh",
    requiresReplacementBeforeCancel: unsafeCancel,
    allowed: !unsafeCancel,
    reasons: unsafeCancel ? ["protective_cancel_requires_replacement"] : health?.blockers || []
  };
}

export { scoreProtectiveOrderHealth, buildExitRefreshPolicy };
