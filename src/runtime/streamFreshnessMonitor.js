function ts(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function age(nowMs, value) {
  const at = ts(value);
  return at == null ? null : Math.max(0, nowMs - at);
}

function statusFor(ageMs, maxMs) {
  if (ageMs == null) return "unknown";
  return ageMs <= maxMs ? "fresh" : "stale";
}

export function buildStreamFreshnessSummary({ symbols = [], symbolStreams = {}, now = new Date().toISOString(), targets = {} } = {}) {
  const nowMs = ts(now) ?? Date.now();
  const limits = {
    bookTickerMs: Number(targets.bookTickerMs || 1500),
    localBookMs: Number(targets.localBookMs || 2000),
    tradeFlowMs: Number(targets.tradeFlowMs || 5000),
    klineMs: Number(targets.klineMs || 120000),
    depthMs: Number(targets.depthMs || 2000)
  };
  const rows = (Array.isArray(symbols) ? symbols : []).map((symbol) => {
    const key = `${symbol || ""}`.toUpperCase();
    const stream = symbolStreams[key] || symbolStreams[symbol] || {};
    const ages = {
      lastTradeAgeMs: age(nowMs, stream.lastTradeAt),
      lastBookAgeMs: age(nowMs, stream.lastBookAt || stream.lastBookTickerAt),
      lastKlineAgeMs: age(nowMs, stream.lastKlineAt),
      lastDepthAgeMs: age(nowMs, stream.lastDepthAt)
    };
    const statuses = {
      trade: statusFor(ages.lastTradeAgeMs, limits.tradeFlowMs),
      book: statusFor(ages.lastBookAgeMs, limits.bookTickerMs),
      kline: statusFor(ages.lastKlineAgeMs, limits.klineMs),
      depth: statusFor(ages.lastDepthAgeMs, limits.depthMs)
    };
    const staleSources = Object.entries(statuses).filter(([, status]) => status !== "fresh").map(([source]) => source);
    return {
      symbol: key,
      ...ages,
      statuses,
      status: staleSources.length ? "degraded" : "fresh",
      staleSources,
      websocketConnected: stream.websocketConnected !== false,
      restFallbackActive: Boolean(stream.restFallbackActive)
    };
  });
  const staleRows = rows.filter((row) => row.status !== "fresh");
  return {
    status: rows.length === 0 ? "empty" : staleRows.length ? "degraded" : "fresh",
    symbolsRequested: rows.length,
    symbolsFresh: rows.length - staleRows.length,
    symbolsStale: staleRows.length,
    rows,
    staleSources: [...new Set(staleRows.flatMap((row) => row.staleSources))],
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
