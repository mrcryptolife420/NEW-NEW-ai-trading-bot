function bool(value) {
  return Boolean(value);
}

function classifyHotspot({ id, endpoint, currentUse, streamReplacement = null, cachePolicy = null, critical = false }) {
  const classification = streamReplacement
    ? "should_move_or_stay_on_websocket"
    : cachePolicy
      ? "should_be_cached_or_rate_limited"
      : critical
        ? "must_stay_rest"
        : "review_required";
  return {
    id,
    endpoint,
    currentUse,
    classification,
    streamReplacement,
    cachePolicy,
    critical
  };
}

export function buildRestArchitectureAudit({ config = {}, requestBudget = null, streamStatus = null } = {}) {
  const publicStreamsEnabled = bool(config.enableEventDrivenData);
  const localBookEnabled = bool(config.enableLocalOrderBook);
  const userStreamExpected = bool(config.binanceApiKey) && (config.botMode === "live" || config.paperExecutionVenue === "binance_demo_spot");
  const hotspots = [
    classifyHotspot({
      id: "ticker_book_ticker",
      endpoint: "GET /api/v3/ticker/bookTicker",
      currentUse: "fallback only when stream/local book lacks fresh book ticker",
      streamReplacement: "combined public stream: <symbol>@bookTicker",
      cachePolicy: `fallback min ${config.restMarketDataFallbackMinMs || 30_000}ms`
    }),
    classifyHotspot({
      id: "depth_orderbook",
      endpoint: "GET /api/v3/depth",
      currentUse: "startup sync/local order book priming and fallback",
      streamReplacement: "combined public stream: <symbol>@depth@100ms plus startup depth sync",
      cachePolicy: "prime once, then stream deltas"
    }),
    classifyHotspot({
      id: "klines",
      endpoint: "GET /api/v3/klines",
      currentUse: "startup warmup and fallback when stream candles missing",
      streamReplacement: "combined public stream: <symbol>@kline_<interval>",
      cachePolicy: `fallback min ${config.restTimeframeFallbackMinMs || 60_000}ms`
    }),
    classifyHotspot({
      id: "exchange_info",
      endpoint: "GET /api/v3/exchangeInfo",
      currentUse: "startup symbol filters and symbol rule cache",
      cachePolicy: `cache ${config.exchangeInfoCacheMs || 21_600_000}ms`,
      critical: true
    }),
    classifyHotspot({
      id: "account_orders",
      endpoint: "SIGNED account/openOrders/order/trades",
      currentUse: "startup sync, reconcile, fill confirmation, emergency recovery",
      streamReplacement: "user data stream / WebSocket API for live order and fill updates",
      cachePolicy: "keep REST for reconciliation and ambiguity resolution",
      critical: true
    })
  ];
  const topCallers = requestBudget?.topCallers || [];
  return {
    status: publicStreamsEnabled ? "stream_first" : "rest_fallback_risk",
    publicStreamsEnabled,
    localBookEnabled,
    userStreamExpected,
    streamStatus: streamStatus || null,
    requestBudget: requestBudget || null,
    hotspots,
    topRestCallers: topCallers,
    warnings: [
      publicStreamsEnabled ? null : "enableEventDrivenData is disabled; public market data may rely on REST fallback.",
      localBookEnabled ? null : "enableLocalOrderBook is disabled; depth quality may depend on ticker/book fallback.",
      userStreamExpected ? null : "Private user stream may be unavailable without API key or supported mode.",
      topCallers.length ? null : "No request-budget caller history is available yet."
    ].filter(Boolean),
    operatorActions: [
      "Keep public market data on combined WebSocket streams.",
      "Use REST only for startup sync, exchange info, reconciliation and fallback sanity checks.",
      "Investigate any hot caller that appears repeatedly in request-budget topCallers."
    ]
  };
}
