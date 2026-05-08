export class ExchangeAdapter {
  constructor({ id = "generic", mode = "paper", capabilities = {}, logger = null } = {}) {
    this.id = id;
    this.mode = mode;
    this.capabilities = capabilities;
    this.logger = logger;
  }

  async getExchangeInfo() { throw new Error(`${this.id}.getExchangeInfo not implemented`); }
  async getSymbolRules(symbol) { throw new Error(`${this.id}.getSymbolRules not implemented for ${symbol}`); }
  async getBalance() { throw new Error(`${this.id}.getBalance not implemented`); }
  async getTicker(symbol) { throw new Error(`${this.id}.getTicker not implemented for ${symbol}`); }
  async getOrderBook(symbol) { throw new Error(`${this.id}.getOrderBook not implemented for ${symbol}`); }
  async getKlines(symbol, interval, limit) { throw new Error(`${this.id}.getKlines not implemented for ${symbol}:${interval}:${limit}`); }
  async placeOrder(order) { throw new Error(`${this.id}.placeOrder not implemented for ${order?.symbol || "unknown"}`); }
  async cancelOrder(orderId) { throw new Error(`${this.id}.cancelOrder not implemented for ${orderId}`); }
  async getOpenOrders(symbol) { throw new Error(`${this.id}.getOpenOrders not implemented for ${symbol || "all"}`); }
  async getOrderStatus(orderId) { throw new Error(`${this.id}.getOrderStatus not implemented for ${orderId}`); }
  async getRecentFills(symbol) { throw new Error(`${this.id}.getRecentFills not implemented for ${symbol || "all"}`); }
  async createUserStream() { throw new Error(`${this.id}.createUserStream not implemented`); }
  async subscribeMarketStream(symbols) { throw new Error(`${this.id}.subscribeMarketStream not implemented for ${(symbols || []).join(",")}`); }
  getRateLimitState() { return normalizeRateLimitState(); }
  getHealth() { return { exchange: this.id, mode: this.mode, status: "unknown", reasonCodes: ["adapter_health_unknown"] }; }
}

export function normalizeOrderResponse(order = {}) {
  return {
    exchange: order.exchange || "unknown",
    orderId: `${order.orderId ?? order.id ?? ""}`,
    clientOrderId: order.clientOrderId || null,
    symbol: `${order.symbol || ""}`.toUpperCase(),
    side: `${order.side || ""}`.toUpperCase(),
    type: `${order.type || ""}`.toUpperCase(),
    status: `${order.status || "unknown"}`.toLowerCase(),
    price: Number(order.price ?? 0),
    quantity: Number(order.quantity ?? order.origQty ?? 0),
    executedQuantity: Number(order.executedQuantity ?? order.executedQty ?? 0),
    fills: Array.isArray(order.fills) ? order.fills.map(normalizeFill) : [],
    raw: order.raw || null
  };
}

export function normalizeFill(fill = {}) {
  return {
    tradeId: `${fill.tradeId ?? fill.id ?? ""}`,
    price: Number(fill.price ?? 0),
    quantity: Number(fill.quantity ?? fill.qty ?? 0),
    fee: Number(fill.fee ?? fill.commission ?? 0),
    feeAsset: fill.feeAsset || fill.commissionAsset || null,
    timestamp: fill.timestamp || fill.time || null
  };
}

export function normalizeBalances(balances = []) {
  const rows = Array.isArray(balances) ? balances : Object.entries(balances).map(([asset, value]) => ({ asset, ...value }));
  return rows.map((row) => ({
    asset: `${row.asset || ""}`.toUpperCase(),
    free: Number(row.free ?? row.available ?? 0),
    locked: Number(row.locked ?? row.hold ?? 0),
    total: Number(row.total ?? Number(row.free ?? row.available ?? 0) + Number(row.locked ?? row.hold ?? 0))
  }));
}

export function normalizeSymbolRules(symbol, rules = {}) {
  return {
    symbol: `${symbol || rules.symbol || ""}`.toUpperCase(),
    baseAsset: rules.baseAsset || null,
    quoteAsset: rules.quoteAsset || null,
    minQty: Number(rules.minQty ?? 0),
    stepSize: Number(rules.stepSize ?? 0),
    tickSize: Number(rules.tickSize ?? 0),
    minNotional: Number(rules.minNotional ?? 0),
    status: rules.status || "unknown"
  };
}

export function normalizeOrderBook(symbol, book = {}) {
  const levels = (items = []) => items.map((item) => Array.isArray(item)
    ? { price: Number(item[0]), quantity: Number(item[1]) }
    : { price: Number(item.price ?? 0), quantity: Number(item.quantity ?? item.qty ?? 0) });
  return { symbol: `${symbol || book.symbol || ""}`.toUpperCase(), bids: levels(book.bids), asks: levels(book.asks), updatedAt: book.updatedAt || Date.now() };
}

export function normalizeExchangeError(error = {}) {
  return { code: `${error.code ?? error.name ?? "exchange_error"}`, message: error.message || "Exchange error", retryable: Boolean(error.retryable) };
}

export function normalizeRateLimitState(state = {}) {
  return { usedWeight: Number(state.usedWeight ?? 0), limit: Number(state.limit ?? 0), resetAt: state.resetAt || null, pressure: Number(state.pressure ?? 0) };
}
