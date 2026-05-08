function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toMs(value, fallback = null) {
  if (value == null) return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function symbolOf(value) {
  return `${value?.symbol || ""}`.trim().toUpperCase();
}

function sameDay(left, right) {
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

export function evaluateFastExecutionSafety({
  config = {},
  candidate = {},
  recentFastEntries = [],
  recentFailures = [],
  slippageEvents = [],
  staleDataEvents = [],
  ambiguousIntents = [],
  health = {},
  exchangeSafety = {},
  requestBudget = {},
  now = new Date().toISOString()
} = {}) {
  const nowMs = toMs(now, Date.now());
  const symbol = symbolOf(candidate);
  const maxPerMinute = Math.max(0, finite(config.fastExecutionMaxSignalsPerMinute, 3));
  const maxPerSymbolDay = Math.max(0, finite(config.fastExecutionMaxSignalsPerSymbolPerDay, 2));
  const cooldownMs = Math.max(0, finite(config.fastExecutionCooldownMs, 30000));
  const reasonCodes = [];

  const entriesLastMinute = arr(recentFastEntries).filter((entry) => nowMs - (toMs(entry.at || entry.createdAt, 0) ?? 0) <= 60000);
  const entriesTodayForSymbol = arr(recentFastEntries).filter((entry) => symbolOf(entry) === symbol && sameDay(toMs(entry.at || entry.createdAt, nowMs), nowMs));
  if (maxPerMinute > 0 && entriesLastMinute.length >= maxPerMinute) reasonCodes.push("fast_entry_rate_limit");
  if (symbol && maxPerSymbolDay > 0 && entriesTodayForSymbol.length >= maxPerSymbolDay) reasonCodes.push("fast_symbol_daily_limit");

  const recentFailure = arr(recentFailures).find((entry) => (!symbol || symbolOf(entry) === symbol) && nowMs - (toMs(entry.at || entry.createdAt, 0) ?? 0) <= cooldownMs);
  if (recentFailure) reasonCodes.push("fast_failed_entry_cooldown");
  const slippageSpike = arr(slippageEvents).find((entry) => (!symbol || symbolOf(entry) === symbol) && entry.spike === true && nowMs - (toMs(entry.at, 0) ?? 0) <= cooldownMs);
  if (slippageSpike) reasonCodes.push("fast_slippage_spike_cooldown");
  const staleData = arr(staleDataEvents).find((entry) => (!symbol || symbolOf(entry) === symbol) && nowMs - (toMs(entry.at, 0) ?? 0) <= cooldownMs);
  if (staleData) reasonCodes.push("fast_stale_data_cooldown");
  const ambiguousIntent = arr(ambiguousIntents).find((entry) => (!symbol || symbolOf(entry) === symbol) && nowMs - (toMs(entry.at || entry.createdAt, 0) ?? 0) <= cooldownMs);
  if (ambiguousIntent) reasonCodes.push("fast_ambiguous_intent_cooldown");
  if (health.circuitOpen === true || health.status === "blocked") reasonCodes.push("health_circuit_open");
  if (exchangeSafety.warning === true || exchangeSafety.entryBlocked === true || exchangeSafety.status === "blocked") reasonCodes.push("exchange_safety_warning");
  if (requestBudget.pressure === true || requestBudget.status === "exhausted" || requestBudget.usedWeight1mPct >= 0.9) reasonCodes.push("request_weight_pressure");

  return {
    allow: reasonCodes.length === 0,
    reasonCodes,
    cooldownMs,
    counters: {
      entriesLastMinute: entriesLastMinute.length,
      entriesTodayForSymbol: entriesTodayForSymbol.length,
      maxPerMinute,
      maxPerSymbolDay
    },
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
