function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hasUnresolvedIntent(intents = [], symbol = null) {
  return arr(intents).some((intent) => {
    const status = `${intent.status || ""}`.toLowerCase();
    const kind = `${intent.kind || intent.type || ""}`.toLowerCase();
    const sameSymbol = !symbol || `${intent.symbol || ""}`.toUpperCase() === `${symbol || ""}`.toUpperCase();
    return sameSymbol && !["resolved", "failed", "cancelled"].includes(status) && (!kind || kind.includes("entry") || kind.includes("protection"));
  });
}

export function runFastPreflightRisk({
  candidate = {},
  config = {},
  openPositions = [],
  unresolvedIntents = [],
  exchangeSafety = {},
  health = {},
  operatorMode = "active",
  marketSnapshot = {},
  riskVerdict = {},
  now = Date.now()
} = {}) {
  const started = Number.isFinite(now) ? now : Date.now();
  const reasonCodes = [];
  const symbol = `${candidate.symbol || ""}`.toUpperCase();
  const maxOpenPositions = Math.max(1, finite(config.maxOpenPositions, 1));
  const maxSpreadBps = Math.max(0, finite(config.maxSpreadBps, 9999));
  const marketDataAgeMs = finite(candidate.marketDataAgeMs ?? marketSnapshot.marketDataAgeMs, 0);
  const maxMarketDataAgeMs = Math.max(1, finite(config.fastExecutionMinDataFreshnessMs, 1500));
  const spreadBps = finite(candidate.spreadBps ?? marketSnapshot.spreadBps, 0);

  if (!symbol) reasonCodes.push("missing_symbol");
  if (arr(openPositions).some((position) => `${position.symbol || ""}`.toUpperCase() === symbol)) reasonCodes.push("duplicate_symbol_position");
  if (arr(openPositions).length >= maxOpenPositions) reasonCodes.push("max_open_positions_reached");
  if (spreadBps > maxSpreadBps) reasonCodes.push("spread_too_high");
  if (marketDataAgeMs > maxMarketDataAgeMs || candidate.dataFreshnessStatus === "stale" || candidate.expired === true) reasonCodes.push("market_data_stale");
  if (riskVerdict.allow === false || candidate.allow === false) reasonCodes.push("risk_verdict_blocked");
  if (exchangeSafety.entryBlocked === true || exchangeSafety.status === "blocked" || exchangeSafety.exchangeTruthFreeze === true) reasonCodes.push("exchange_safety_blocked");
  if (hasUnresolvedIntent(unresolvedIntents, symbol)) reasonCodes.push("unresolved_execution_intent");
  if (health.circuitOpen === true || health.status === "blocked") reasonCodes.push("health_circuit_open");
  if (["observe_only", "maintenance", "stopped", "protect_only"].includes(`${operatorMode || ""}`.toLowerCase())) reasonCodes.push("operator_mode_blocks_entries");
  if (candidate.manualReviewRequired === true || riskVerdict.manualReviewRequired === true) reasonCodes.push("manual_review_required");

  return {
    allow: reasonCodes.length === 0,
    reasonCodes,
    latencyMs: Math.max(0, Date.now() - started),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
