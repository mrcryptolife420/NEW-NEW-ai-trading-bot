export const EXCHANGE_ADAPTER_CONTRACT_METHODS = Object.freeze([
  "placeOrder",
  "cancelOrder",
  "fetchOpenOrders",
  "fetchBalances",
  "fetchRecentTrades",
  "fetchSymbolFilters"
]);

function safeText(value) {
  return `${value ?? ""}`.toLowerCase();
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function assertExchangeAdapterContract(adapter = {}, { name = "exchange_adapter" } = {}) {
  const methods = EXCHANGE_ADAPTER_CONTRACT_METHODS.map((method) => ({
    method,
    present: typeof adapter?.[method] === "function"
  }));
  const missingMethods = methods.filter((item) => !item.present).map((item) => item.method);
  return {
    name,
    valid: missingMethods.length === 0,
    methods,
    missingMethods
  };
}

export function normalizeExchangeAdapterError(error = {}) {
  const code = error?.code ?? error?.payload?.code ?? error?.response?.code ?? null;
  const status = finiteNumber(error?.status ?? error?.statusCode ?? error?.response?.status, 0);
  const message = safeText(error?.message || error?.msg || error?.payload?.msg);

  if (status === 429 || status === 418 || code === -1003 || message.includes("too many requests")) {
    return {
      category: "rate_limit",
      retryable: true,
      liveSafeAction: "backoff",
      code,
      status
    };
  }
  if (
    code === -1013 ||
    message.includes("min_notional") ||
    message.includes("minimum notional") ||
    message.includes("notional")
  ) {
    return {
      category: "min_notional",
      retryable: false,
      liveSafeAction: "reject_order",
      code,
      status
    };
  }
  if (code === -1111 || message.includes("precision") || message.includes("tick size") || message.includes("step size")) {
    return {
      category: "precision",
      retryable: false,
      liveSafeAction: "normalize_filters",
      code,
      status
    };
  }
  if (message.includes("insufficient balance") || message.includes("account has insufficient balance")) {
    return {
      category: "insufficient_balance",
      retryable: false,
      liveSafeAction: "block_and_reconcile",
      code,
      status
    };
  }
  if (code === -2011 || message.includes("unknown order") || message.includes("order does not exist")) {
    return {
      category: "unknown_order",
      retryable: false,
      liveSafeAction: "refresh_order_truth",
      code,
      status
    };
  }
  return {
    category: "unknown",
    retryable: false,
    liveSafeAction: "manual_review",
    code,
    status
  };
}

export function normalizeOrderResponse(order = {}) {
  const orderId = order?.orderId ?? order?.id ?? null;
  const symbol = order?.symbol || null;
  const status = `${order?.status || order?.orderStatus || "UNKNOWN"}`.toUpperCase();
  const executedQty = finiteNumber(order?.executedQty ?? order?.executedQuantity, 0);
  const cummulativeQuoteQty = finiteNumber(order?.cummulativeQuoteQty ?? order?.quoteQty, 0);
  return {
    orderId,
    symbol,
    status,
    side: order?.side || null,
    type: order?.type || order?.orderType || null,
    executedQty,
    cummulativeQuoteQty,
    raw: order
  };
}

export function normalizeOpenOrders(orders = []) {
  return (Array.isArray(orders) ? orders : []).map(normalizeOrderResponse);
}

export function normalizeBalances(account = {}) {
  const balances = Array.isArray(account?.balances) ? account.balances : [];
  return Object.fromEntries(
    balances.map((balance) => [
      balance.asset,
      {
        free: finiteNumber(balance.free, 0),
        locked: finiteNumber(balance.locked, 0),
        total: finiteNumber(balance.free, 0) + finiteNumber(balance.locked, 0)
      }
    ]).filter(([asset]) => asset)
  );
}

export function createBinanceClientAdapter(client, { quoteAsset = "USDT", buildSymbolRules } = {}) {
  return {
    async placeOrder(params) {
      return normalizeOrderResponse(await client.placeOrder(params));
    },
    async cancelOrder(symbol, params = {}) {
      return normalizeOrderResponse(await client.cancelOrder(symbol, params));
    },
    async fetchOpenOrders(symbol = null) {
      return normalizeOpenOrders(await client.getOpenOrders(symbol || undefined));
    },
    async fetchBalances() {
      return normalizeBalances(await client.getAccountInfo());
    },
    async fetchRecentTrades(symbol, params = {}) {
      const trades = await client.getMyTrades(symbol, params);
      return Array.isArray(trades) ? trades : [];
    },
    async fetchSymbolFilters(symbols = []) {
      const exchangeInfo = await client.getExchangeInfo(symbols);
      return typeof buildSymbolRules === "function"
        ? buildSymbolRules(exchangeInfo, quoteAsset)
        : exchangeInfo;
    }
  };
}
