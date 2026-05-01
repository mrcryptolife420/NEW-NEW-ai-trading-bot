const DEFAULT_BUFFER_SIZE = 500;
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MULTI_HORIZONS = [60, 300, 900, 3600];

const symbolBuffers = new Map();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBufferSize() {
  return Math.max(10, toNumber(process.env.AGGTRADE_BUFFER_SIZE, DEFAULT_BUFFER_SIZE));
}

function getDefaultWindowSeconds() {
  return Math.max(5, toNumber(process.env.AGGTRADE_WINDOW_SECONDS, DEFAULT_WINDOW_SECONDS));
}

function getRetentionWindowSeconds() {
  const configured = toNumber(process.env.AGGTRADE_RETENTION_SECONDS, 0);
  return Math.max(getDefaultWindowSeconds(), configured, ...DEFAULT_MULTI_HORIZONS);
}

function normalizeSymbol(symbol) {
  return `${symbol || ""}`.trim().toUpperCase();
}

function parseTrade(symbol, trade) {
  const quantity = toNumber(trade?.q ?? trade?.quantity, 0);
  const price = toNumber(trade?.p ?? trade?.price, 0);
  const volume = quantity > 0 ? quantity : 0;
  const quoteVolume = quantity > 0 && price > 0 ? quantity * price : 0;
  const buyerMakerRaw = trade?.m ?? trade?.buyerMaker;
  const buyerMaker = Boolean(buyerMakerRaw);
  const timestamp = toNumber(trade?.T ?? trade?.E ?? trade?.timestamp, Date.now());
  return {
    symbol,
    timestamp,
    price,
    volume,
    quoteVolume,
    buyerMaker
  };
}

function getOrCreateBuffer(symbol) {
  if (!symbolBuffers.has(symbol)) {
    symbolBuffers.set(symbol, []);
  }
  return symbolBuffers.get(symbol);
}

function pruneBuffer(buffer, windowMs, hardLimit) {
  const minTimestamp = Date.now() - windowMs;
  while (buffer.length > 0 && buffer[0].timestamp < minTimestamp) {
    buffer.shift();
  }
  while (buffer.length > hardLimit) {
    buffer.shift();
  }
}

function calculateDelta(symbol, trades, windowSeconds) {
  const buyTrades = [];
  const sellTrades = [];
  for (const trade of trades) {
    if (trade.buyerMaker) {
      sellTrades.push(trade);
    } else {
      buyTrades.push(trade);
    }
  }
  const buyVolume = buyTrades.reduce((sum, trade) => sum + trade.volume, 0);
  const sellVolume = sellTrades.reduce((sum, trade) => sum + trade.volume, 0);
  const totalVolume = buyVolume + sellVolume;
  const delta = buyVolume - sellVolume;
  const deltaRatio = totalVolume > 0 ? delta / totalVolume : 0;
  const absRatio = Math.abs(deltaRatio);
  const pressure = delta > 0 ? "buy" : delta < 0 ? "sell" : "neutral";
  const dataQuality = totalVolume <= 0
    ? "empty"
    : trades.length < Math.max(5, Math.floor(windowSeconds / 8))
      ? "low"
      : absRatio > 0.65 && trades.length < 12
        ? "medium"
        : "high";
  return {
    symbol,
    windowSeconds,
    delta,
    buyVolume,
    sellVolume,
    totalVolume,
    deltaRatio,
    pressure,
    tradeCount: trades.length,
    dataQuality
  };
}

function labelWindow(seconds) {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function priceChangePct(trades = []) {
  const first = trades.find((trade) => trade.price > 0)?.price || 0;
  const last = [...trades].reverse().find((trade) => trade.price > 0)?.price || 0;
  return first > 0 && last > 0 ? (last - first) / first : 0;
}

function buildAbsorption(delta = {}, scopedTrades = []) {
  const priceMove = priceChangePct(scopedTrades);
  const deltaRatio = delta.deltaRatio || 0;
  const absDelta = Math.abs(deltaRatio);
  const strongFlow = absDelta >= 0.42 && (delta.tradeCount || 0) >= 8;
  const weakFollowThrough = Math.abs(priceMove) <= 0.0018;
  const buyAbsorption = strongFlow && deltaRatio > 0 && weakFollowThrough;
  const sellAbsorption = strongFlow && deltaRatio < 0 && weakFollowThrough;
  return {
    side: buyAbsorption ? "buy_absorbed" : sellAbsorption ? "sell_absorbed" : "none",
    score: strongFlow && weakFollowThrough ? Math.min(1, absDelta * 1.35) : 0,
    buyAbsorptionScore: buyAbsorption ? Math.min(1, absDelta * 1.35) : 0,
    sellAbsorptionScore: sellAbsorption ? Math.min(1, absDelta * 1.35) : 0,
    priceMovePct: priceMove
  };
}

function buildToxicity({ delta = {}, absorption = {}, depthConfidence = 0.5, microTrend = 0 } = {}) {
  const imbalance = Math.abs(delta.deltaRatio || 0);
  const depthPenalty = Math.max(0, 0.62 - Number(depthConfidence || 0));
  const followThroughMismatch = Math.max(0, imbalance * 0.65 - Math.abs(microTrend || absorption.priceMovePct || 0) * 80);
  const absorptionPenalty = absorption.score || 0;
  const score = Math.max(0, Math.min(1, imbalance * 0.42 + depthPenalty * 0.5 + followThroughMismatch * 0.22 + absorptionPenalty * 0.34));
  return {
    score,
    level: score >= 0.72 ? "high" : score >= 0.48 ? "elevated" : score >= 0.28 ? "watch" : "normal"
  };
}

export function recordAggTrade(symbol, trade) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol || !trade) {
    return null;
  }
  const parsed = parseTrade(normalizedSymbol, trade);
  const buffer = getOrCreateBuffer(normalizedSymbol);
  buffer.push(parsed);
  pruneBuffer(buffer, getRetentionWindowSeconds() * 1000, getBufferSize());
  return {
    symbol: normalizedSymbol,
    accepted: parsed.volume > 0,
    bufferSize: buffer.length
  };
}

export function getOrderflowDelta(symbol, windowSeconds) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const buffer = symbolBuffers.get(normalizedSymbol) || [];
  const effectiveWindow = Math.max(5, toNumber(windowSeconds, getDefaultWindowSeconds()));
  const minTimestamp = Date.now() - effectiveWindow * 1000;
  const scopedTrades = buffer.filter((trade) => trade.timestamp >= minTimestamp);
  return calculateDelta(normalizedSymbol, scopedTrades, effectiveWindow);
}

export function getMultiHorizonOrderflow(symbol, horizons = DEFAULT_MULTI_HORIZONS, context = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const buffer = symbolBuffers.get(normalizedSymbol) || [];
  const uniqueHorizons = [...new Set((horizons || DEFAULT_MULTI_HORIZONS).map((value) => Math.max(5, toNumber(value, 0))).filter(Boolean))]
    .sort((left, right) => left - right);
  const byHorizon = {};
  const now = Date.now();
  for (const horizon of uniqueHorizons) {
    const minTimestamp = now - horizon * 1000;
    const scopedTrades = buffer.filter((trade) => trade.timestamp >= minTimestamp);
    const delta = calculateDelta(normalizedSymbol, scopedTrades, horizon);
    const absorption = buildAbsorption(delta, scopedTrades);
    byHorizon[labelWindow(horizon)] = {
      ...delta,
      priceMovePct: absorption.priceMovePct,
      absorption
    };
  }
  const primary = byHorizon["5m"] || byHorizon[labelWindow(uniqueHorizons[0])] || calculateDelta(normalizedSymbol, [], uniqueHorizons[0] || DEFAULT_WINDOW_SECONDS);
  const short = byHorizon["1m"] || primary;
  const long = byHorizon["15m"] || byHorizon["1h"] || primary;
  const divergenceScore = Math.max(0, Math.min(1,
    Math.sign(short.deltaRatio || 0) !== Math.sign(long.deltaRatio || 0) && Math.abs(short.deltaRatio || 0) >= 0.22 && Math.abs(long.deltaRatio || 0) >= 0.18
      ? (Math.abs(short.deltaRatio || 0) + Math.abs(long.deltaRatio || 0)) / 2
      : 0
  ));
  const absorption = primary.absorption || buildAbsorption(primary, buffer);
  const toxicity = buildToxicity({
    delta: primary,
    absorption,
    depthConfidence: context.depthConfidence,
    microTrend: context.microTrend
  });
  return {
    symbol: normalizedSymbol,
    status: buffer.length ? "ready" : "empty",
    horizons: byHorizon,
    primary,
    absorption,
    toxicity,
    divergenceScore,
    trendAlignment: Math.max(-1, Math.min(1, (short.deltaRatio || 0) * 0.55 + (long.deltaRatio || 0) * 0.45)),
    updatedAt: new Date().toISOString()
  };
}

export function getAllDeltas(windowSeconds) {
  const effectiveWindow = Math.max(5, toNumber(windowSeconds, getDefaultWindowSeconds()));
  const deltas = [];
  for (const symbol of symbolBuffers.keys()) {
    deltas.push(getOrderflowDelta(symbol, effectiveWindow));
  }
  return deltas;
}

export function resetBuffer(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    return { symbol: normalizedSymbol, cleared: false };
  }
  const existed = symbolBuffers.delete(normalizedSymbol);
  return { symbol: normalizedSymbol, cleared: existed };
}
