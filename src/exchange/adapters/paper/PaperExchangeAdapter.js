import { ExchangeAdapter, normalizeBalances, normalizeOrderBook, normalizeOrderResponse, normalizeRateLimitState, normalizeSymbolRules } from "../ExchangeAdapter.js";

export class PaperExchangeAdapter extends ExchangeAdapter {
  constructor({ balances = [{ asset: "USDT", free: 10000, locked: 0 }], symbols = {}, tickers = {}, orderBooks = {}, klines = {}, logger = null } = {}) {
    super({ id: "paper", mode: "paper", capabilities: { liveTrading: false, userStream: false, marketStream: false }, logger });
    this.balances = balances;
    this.symbols = symbols;
    this.tickers = tickers;
    this.orderBooks = orderBooks;
    this.klines = klines;
    this.orders = [];
  }

  async getExchangeInfo() { return { exchange: this.id, symbols: Object.keys(this.symbols), capabilities: this.capabilities }; }
  async getSymbolRules(symbol) { return normalizeSymbolRules(symbol, this.symbols[symbol] || { symbol, minQty: 0.000001, stepSize: 0.000001, tickSize: 0.01, minNotional: 5, status: "TRADING" }); }
  async getBalance() { return normalizeBalances(this.balances); }
  async getTicker(symbol) { return { symbol, price: Number(this.tickers[symbol]?.price ?? 0), updatedAt: this.tickers[symbol]?.updatedAt || Date.now() }; }
  async getOrderBook(symbol) { return normalizeOrderBook(symbol, this.orderBooks[symbol] || { bids: [], asks: [] }); }
  async getKlines(symbol, interval, limit = 100) { return (this.klines[`${symbol}:${interval}`] || []).slice(-limit); }
  async placeOrder(order) {
    const row = normalizeOrderResponse({ ...order, exchange: this.id, orderId: `paper-${this.orders.length + 1}`, status: "filled", executedQuantity: order.quantity ?? order.quoteQuantity ?? 0 });
    this.orders.push(row);
    return row;
  }
  async cancelOrder(orderId) { return { exchange: this.id, orderId: `${orderId}`, status: "cancelled" }; }
  async getOpenOrders(symbol) { return this.orders.filter((order) => order.status === "open" && (!symbol || order.symbol === symbol)); }
  async getOrderStatus(orderId) { return this.orders.find((order) => order.orderId === `${orderId}`) || null; }
  async getRecentFills(symbol) { return this.orders.filter((order) => !symbol || order.symbol === symbol).flatMap((order) => order.fills); }
  async createUserStream() { return { status: "unsupported", reasonCodes: ["paper_user_stream_unavailable"] }; }
  async subscribeMarketStream(symbols) { return { status: "unsupported", symbols, reasonCodes: ["paper_market_stream_unavailable"] }; }
  getRateLimitState() { return normalizeRateLimitState({ pressure: 0 }); }
  getHealth() { return { exchange: this.id, mode: this.mode, status: "ok", reasonCodes: [] }; }
}
