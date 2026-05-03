function objectOrFallback(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function normalizeSymbol(symbol) {
  return symbol ? `${symbol}`.toUpperCase() : null;
}

export function summarizeMarketSnapshotForRuntime(snapshot = {}, now = new Date().toISOString()) {
  const source = objectOrFallback(snapshot, {});
  const symbol = normalizeSymbol(source.symbol);
  const book = objectOrFallback(source.book, {});
  const market = objectOrFallback(source.market, {});
  const stream = objectOrFallback(source.stream, {});
  const candles = arr(source.candles);
  const mid = finite(book.mid || market.close || source.close, 0);
  const bid = finite(book.bid, 0);
  const ask = finite(book.ask, 0);
  const hasBook = isPositive(mid) || (isPositive(bid) && isPositive(ask));
  const hasCandles = candles.length > 0;
  const status = source.status || (hasBook || hasCandles ? "ready" : "degraded");
  return {
    symbol,
    status,
    updatedAt: source.cachedAt || source.updatedAt || source.at || source.timestamp || now,
    source: source.lightweight ? "lightweight" : source.fromCache ? "cache" : "full",
    lightweight: Boolean(source.lightweight),
    fromCache: Boolean(source.fromCache),
    candlesCount: candles.length,
    hasBook,
    hasCandles,
    book: {
      bid,
      ask,
      mid,
      spreadBps: finite(book.spreadBps, 0),
      depthConfidence: finite(book.depthConfidence, 0),
      totalDepthNotional: finite(book.totalDepthNotional, 0),
      bookSource: book.bookSource || null,
      localBookSynced: Boolean(book.localBookSynced),
      bookFallbackReady: Boolean(book.bookFallbackReady)
    },
    market: {
      close: finite(market.close || mid, 0),
      realizedVolPct: finite(market.realizedVolPct, 0),
      volumeZ: finite(market.volumeZ, 0),
      emaTrendScore: finite(market.emaTrendScore, 0),
      dominantPattern: market.dominantPattern || "none"
    },
    stream: {
      recentTradeCount: finite(stream.recentTradeCount, 0),
      hasBookTicker: Boolean(stream.latestBookTicker?.bid && stream.latestBookTicker?.ask),
      localBookSynced: Boolean(stream.localBook?.synced || book.localBookSynced),
      publicStreamFresh: Boolean(stream.publicStreamFresh || stream.latestBookTicker?.eventTime)
    }
  };
}

export function compactMarketSnapshotMap(snapshotMap = {}, now = new Date().toISOString()) {
  const compact = {};
  for (const [symbol, snapshot] of Object.entries(objectOrFallback(snapshotMap, {}))) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const summary = summarizeMarketSnapshotForRuntime({ symbol, ...snapshot }, now);
    if (summary.symbol) compact[summary.symbol] = summary;
  }
  return compact;
}

export function buildMarketSnapshotFlowDebug({
  watchlist = [],
  symbolsRequested = [],
  deepScanSymbols = [],
  localBookSymbols = [],
  snapshotMap = {},
  prefetchFailures = [],
  candidates = [],
  marketCache = {},
  streamStatus = {},
  now = new Date().toISOString()
} = {}) {
  const requested = [...new Set(arr(symbolsRequested).length ? arr(symbolsRequested) : arr(watchlist))]
    .map(normalizeSymbol)
    .filter(Boolean);
  const deep = [...new Set(arr(deepScanSymbols).map(normalizeSymbol).filter(Boolean))];
  const localBook = [...new Set(arr(localBookSymbols).map(normalizeSymbol).filter(Boolean))];
  const failures = new Set(arr(prefetchFailures).map(normalizeSymbol).filter(Boolean));
  const compact = compactMarketSnapshotMap(snapshotMap, now);
  const cache = objectOrFallback(marketCache, {});
  const candidateList = arr(candidates);
  const candidateSymbols = new Set(candidateList.map((candidate) => normalizeSymbol(candidate?.symbol)).filter(Boolean));
  const candidateSnapshotSymbols = new Set(candidateList.filter((candidate) => candidate?.marketSnapshot).map((candidate) => normalizeSymbol(candidate.symbol)).filter(Boolean));
  const readySymbols = Object.entries(compact)
    .filter(([, summary]) => summary.status !== "missing" && (summary.hasBook || summary.hasCandles || summary.book.mid > 0))
    .map(([symbol]) => symbol);
  const missingSymbols = requested.filter((symbol) => !readySymbols.includes(symbol));
  const degradedSymbols = Object.entries(compact)
    .filter(([, summary]) => summary.status !== "ready" || (!summary.hasBook && !summary.hasCandles))
    .map(([symbol]) => symbol);
  const staleSources = [];
  if (!requested.length) staleSources.push("watchlist_empty");
  if (!readySymbols.length) staleSources.push("no_market_snapshots_ready");
  if (failures.size) staleSources.push("snapshot_prefetch_failures");
  if (requested.length && missingSymbols.length === requested.length) staleSources.push("all_requested_symbols_missing");
  const status = !requested.length
    ? "empty_watchlist"
    : readySymbols.length === 0
      ? "stale"
      : missingSymbols.length || degradedSymbols.length || failures.size
        ? "degraded"
        : "ready";
  return {
    status,
    generatedAt: now,
    symbolsRequested: requested.length,
    deepScanSymbols: deep.length,
    localBookSymbols: localBook.length,
    snapshotsReady: readySymbols.length,
    snapshotsPersisted: Object.keys(compact).length,
    candidateCount: candidateList.length,
    candidatesWithSnapshots: candidateSnapshotSymbols.size,
    missingSymbols: missingSymbols.slice(0, 24),
    degradedSymbols: degradedSymbols.slice(0, 24),
    prefetchFailures: [...failures].slice(0, 24),
    readySymbols: readySymbols.slice(0, 24),
    cacheSymbols: Object.keys(cache).slice(0, 24),
    candidateSymbols: [...candidateSymbols].slice(0, 24),
    staleSources: [...new Set(staleSources)],
    nextAction: readySymbols.length
      ? "monitor_next_cycle"
      : failures.size
        ? "inspect_snapshot_prefetch_failures"
        : "inspect_stream_and_market_snapshot_sources"
  };
}
