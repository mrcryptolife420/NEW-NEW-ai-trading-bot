import { ExchangeAdapter, normalizeBalances, normalizeOrderBook, normalizeOrderResponse, normalizeRateLimitState, normalizeSymbolRules } from "../ExchangeAdapter.js";

export class BinanceExchangeAdapter extends ExchangeAdapter {
  constructor({ client, logger = null } = {}) {
    super({ id: "binance", mode: "live", capabilities: { liveTrading: true, userStream: true, marketStream: true }, logger });
    this.client = client;
  }

  requireClient(method) {
    if (!this.client) throw new Error(`binance.${method} requires client`);
    return this.client;
  }

  async getExchangeInfo() { return this.requireClient("getExchangeInfo").exchangeInfo(); }
  async getSymbolRules(symbol) { return normalizeSymbolRules(symbol, await this.requireClient("getSymbolRules").getSymbolRules?.(symbol)); }
  async getBalance() { return normalizeBalances(await this.requireClient("getBalance").accountBalances?.()); }
  async getTicker(symbol) { return this.requireClient("getTicker").tickerPrice(symbol); }
  async getOrderBook(symbol) { return normalizeOrderBook(symbol, await this.requireClient("getOrderBook").orderBook(symbol)); }
  async getKlines(symbol, interval, limit) { return this.requireClient("getKlines").klines(symbol, interval, limit); }
  async placeOrder(order) { return normalizeOrderResponse({ ...(await this.requireClient("placeOrder").placeOrder(order)), exchange: this.id }); }
  async cancelOrder(orderId) { return this.requireClient("cancelOrder").cancelOrder(orderId); }
  async getOpenOrders(symbol) { return this.requireClient("getOpenOrders").openOrders(symbol); }
  async getOrderStatus(orderId) { return this.requireClient("getOrderStatus").orderStatus(orderId); }
  async getRecentFills(symbol) { return this.requireClient("getRecentFills").myTrades(symbol); }
  async createUserStream() { return this.requireClient("createUserStream").createUserStream(); }
  async subscribeMarketStream(symbols) { return this.requireClient("subscribeMarketStream").subscribeMarketStream(symbols); }
  getRateLimitState() { return normalizeRateLimitState(this.client?.rateLimitState?.() || {}); }
  getHealth() { return { exchange: this.id, mode: this.mode, status: this.client ? "ok" : "degraded", reasonCodes: this.client ? [] : ["binance_client_missing"] }; }
}
