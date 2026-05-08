function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function toMs(value, fallback = null) {
  if (value == null) return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function upper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

export function buildExitFastLanePlan({
  openPositions = [],
  streamEvents = [],
  protectionStates = [],
  now = new Date().toISOString(),
  maxStreamAgeMs = 2000,
  maxProtectionAgeMs = 5000
} = {}) {
  const nowMs = toMs(now, Date.now());
  const eventsBySymbol = new Map(arr(streamEvents).map((event) => [upper(event.symbol), event]));
  const protectionBySymbol = new Map(arr(protectionStates).map((state) => [upper(state.symbol), state]));

  const positions = arr(openPositions).map((position) => {
    const symbol = upper(position.symbol);
    const event = eventsBySymbol.get(symbol) || {};
    const protection = protectionBySymbol.get(symbol) || {};
    const streamAgeMs = Math.max(0, nowMs - (toMs(event.updatedAt || event.at, nowMs) ?? nowMs));
    const protectionAgeMs = Math.max(0, nowMs - (toMs(protection.updatedAt || protection.checkedAt, nowMs) ?? nowMs));
    const exitRiskScore = Math.max(
      finite(position.exitRiskScore, 0),
      finite(event.exitRiskScore, 0),
      protection.protected === false ? 1 : 0
    );
    const reasons = [];
    if (exitRiskScore >= 0.7) reasons.push("high_exit_risk");
    if (protection.protected === false) reasons.push("protection_missing");
    if (streamAgeMs > maxStreamAgeMs) reasons.push("exit_stream_stale");
    if (protectionAgeMs > maxProtectionAgeMs) reasons.push("protection_status_stale");
    return {
      symbol,
      positionId: position.id || position.positionId || symbol,
      priority: protection.protected === false ? 100 : Math.round(exitRiskScore * 90),
      exitRiskScore,
      streamAgeMs,
      protectionAgeMs,
      runExitCheck: streamAgeMs <= maxStreamAgeMs && reasons.includes("high_exit_risk"),
      runTrailingCheck: streamAgeMs <= maxStreamAgeMs && finite(position.unrealizedPnlPct, 0) > 0,
      runProtectionCheck: protection.protected === false || protectionAgeMs > maxProtectionAgeMs,
      reasons
    };
  }).sort((left, right) => right.priority - left.priority || left.symbol.localeCompare(right.symbol));

  return {
    status: positions.length ? "active" : "empty",
    positions,
    nextSymbols: positions.filter((position) => position.runExitCheck || position.runProtectionCheck).map((position) => position.symbol),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function summarizeExitFastLaneLatency({ decisions = [], now = new Date().toISOString() } = {}) {
  const nowMs = toMs(now, Date.now());
  const rows = arr(decisions).map((decision) => {
    const signalMs = toMs(decision.signalAt || decision.createdAt, nowMs) ?? nowMs;
    const checkedMs = toMs(decision.checkedAt || decision.updatedAt, nowMs) ?? nowMs;
    const protectionMs = toMs(decision.protectionCheckedAt, checkedMs) ?? checkedMs;
    return {
      symbol: upper(decision.symbol),
      exitDecisionDelayMs: Math.max(0, checkedMs - signalMs),
      protectionLatencyMs: Math.max(0, protectionMs - signalMs)
    };
  });
  const maxExitDelayMs = rows.reduce((max, row) => Math.max(max, row.exitDecisionDelayMs), 0);
  const maxProtectionLatencyMs = rows.reduce((max, row) => Math.max(max, row.protectionLatencyMs), 0);
  return {
    status: rows.length ? "measured" : "empty",
    rows,
    maxExitDelayMs,
    maxProtectionLatencyMs,
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
