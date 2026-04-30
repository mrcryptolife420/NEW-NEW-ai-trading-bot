import fs from "node:fs/promises";
import path from "node:path";

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

function classifyCodeCaller(text = "", filePath = "") {
  const lowered = text.toLowerCase();
  const file = filePath.replace(/\\/g, "/");
  if (/getklines|\/api\/v3\/klines/.test(lowered)) {
    return {
      family: "klines",
      classification: "websocket_primary_rest_fallback",
      streamReplacement: "combined public stream: <symbol>@kline_<interval>"
    };
  }
  if (/getbookticker|bookticker|\/api\/v3\/ticker\/bookticker/.test(lowered)) {
    return {
      family: "book_ticker",
      classification: "websocket_primary_rest_fallback",
      streamReplacement: "combined public stream: <symbol>@bookTicker"
    };
  }
  if (/getorderbook|\/api\/v3\/depth/.test(lowered)) {
    return {
      family: "depth",
      classification: "startup_sync_or_websocket_fallback",
      streamReplacement: "combined public stream: <symbol>@depth@100ms"
    };
  }
  if (/getexchangeinfo|\/api\/v3\/exchangeinfo/.test(lowered)) {
    return {
      family: "exchange_info",
      classification: "cache_static_rest",
      streamReplacement: null
    };
  }
  if (/openorders|getorder|getmytrades|account|placeorder|cancelorder/.test(lowered) || file.includes("/execution/")) {
    return {
      family: "private_account_orders",
      classification: "critical_rest_or_user_data_stream",
      streamReplacement: "User Data Stream / WebSocket API where supported"
    };
  }
  return {
    family: "unknown_rest",
    classification: "review_required",
    streamReplacement: null
  };
}

async function listJavaScriptFiles(rootDir) {
  const results = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (["node_modules", ".git", "data", "logs"].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listJavaScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

export async function scanRestCallers({ projectRoot = process.cwd(), limit = 80 } = {}) {
  const srcRoot = path.join(projectRoot, "src");
  const files = await listJavaScriptFiles(srcRoot);
  const patterns = [
    "publicRequest(",
    "signedRequest(",
    "getKlines(",
    "getBookTicker(",
    "getOrderBook(",
    "getExchangeInfo(",
    "getOpenOrders(",
    "getOrder(",
    "getMyTrades(",
    "placeOrder(",
    "cancelOrder("
  ];
  const callers = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!patterns.some((pattern) => line.includes(pattern))) {
        return;
      }
      const classified = classifyCodeCaller(line, filePath);
      callers.push({
        file: path.relative(projectRoot, filePath).replace(/\\/g, "/"),
        line: index + 1,
        snippet: line.trim().slice(0, 180),
        ...classified
      });
    });
  }
  const familyCounts = {};
  const classificationCounts = {};
  for (const caller of callers) {
    familyCounts[caller.family] = (familyCounts[caller.family] || 0) + 1;
    classificationCounts[caller.classification] = (classificationCounts[caller.classification] || 0) + 1;
  }
  return {
    status: callers.length ? "ready" : "no_rest_callers_found",
    callerCount: callers.length,
    familyCounts,
    classificationCounts,
    callers: callers.slice(0, limit)
  };
}
