const HARD_SAFETY_BLOCKERS = new Set([
  "exchange_safety_blocked",
  "exchange_safety_symbol_blocked",
  "execution_intent_ambiguous",
  "exchange_truth_freeze",
  "operator_ack_required",
  "reconcile_required",
  "health_circuit_open",
  "daily_drawdown_limit_hit",
  "regime_kill_switch_active"
]);

export { HARD_SAFETY_BLOCKERS };

export function resolveExchangeSafetySymbolBlock(runtime = {}, symbol = null) {
  if (!symbol) {
    return null;
  }
  return (runtime?.exchangeSafety?.blockedSymbols || []).find((item) => item?.symbol === symbol) || null;
}

export function resolveExecutionIntentSymbolBlock(runtime = {}, symbol = null) {
  if (!symbol) {
    return null;
  }
  const ledger = runtime?.orderLifecycle?.executionIntentLedger || {};
  const unresolved = Array.isArray(ledger.unresolvedIntentIds)
    ? ledger.unresolvedIntentIds.map((id) => ledger.intents?.[id]).filter(Boolean)
    : [];
  return unresolved.find((intent) =>
    intent?.status === "ambiguous" &&
    (intent.scope === "global" || intent.symbol === symbol)
  ) || null;
}

export function applyHardSafetyPolicy({
  runtime = {},
  symbol = null,
  reasons = []
} = {}) {
  const nextReasons = [...(reasons || [])];
  const exchangeSafetySymbolBlock = resolveExchangeSafetySymbolBlock(runtime, symbol);
  const executionIntentBlock = resolveExecutionIntentSymbolBlock(runtime, symbol);
  if (runtime?.exchangeSafety?.globalFreezeEntries) {
    nextReasons.push("exchange_safety_blocked");
  } else if (exchangeSafetySymbolBlock) {
    nextReasons.push("exchange_safety_symbol_blocked");
  }
  if (executionIntentBlock) {
    nextReasons.push("execution_intent_ambiguous");
  }
  const hardSafetyReasons = [...new Set(nextReasons.filter((reason) => HARD_SAFETY_BLOCKERS.has(reason)))];
  return {
    reasons: nextReasons,
    exchangeSafetySymbolBlock,
    executionIntentBlock,
    hardSafetyReasons,
    hardSafetyBlocked: hardSafetyReasons.length > 0,
    primaryReason: hardSafetyReasons[0] || null
  };
}
