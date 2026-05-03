import { buildSymbolRules } from "../../src/binance/symbolFilters.js";
import {
  assertExchangeAdapterContract,
  createBinanceClientAdapter,
  normalizeBalances,
  normalizeExchangeAdapterError,
  normalizeOpenOrders,
  normalizeOrderResponse
} from "../../src/execution/exchangeAdapterContract.js";

const exchangeInfoFixture = {
  symbols: [
    {
      symbol: "BTCUSDT",
      status: "TRADING",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      filters: [
        { filterType: "PRICE_FILTER", minPrice: "0.01", maxPrice: "1000000", tickSize: "0.01" },
        { filterType: "LOT_SIZE", minQty: "0.00001", maxQty: "100", stepSize: "0.00001" },
        { filterType: "MARKET_LOT_SIZE", minQty: "0.00001", maxQty: "100", stepSize: "0.00001" },
        { filterType: "MIN_NOTIONAL", minNotional: "10" }
      ]
    }
  ]
};

function makeFakeAdapter() {
  return {
    async placeOrder() {
      return normalizeOrderResponse({
        symbol: "BTCUSDT",
        orderId: 101,
        status: "FILLED",
        side: "BUY",
        type: "MARKET",
        executedQty: "0.01",
        cummulativeQuoteQty: "500"
      });
    },
    async cancelOrder() {
      return normalizeOrderResponse({
        symbol: "BTCUSDT",
        orderId: 102,
        status: "CANCELED",
        side: "SELL",
        type: "LIMIT"
      });
    },
    async fetchOpenOrders() {
      return normalizeOpenOrders([
        { symbol: "BTCUSDT", orderId: 103, status: "NEW", side: "SELL", type: "LIMIT", executedQty: "0" }
      ]);
    },
    async fetchBalances() {
      return normalizeBalances({
        balances: [
          { asset: "BTC", free: "0.01", locked: "0.002" },
          { asset: "USDT", free: "900", locked: "100" }
        ]
      });
    },
    async fetchRecentTrades() {
      return [{ id: 1, symbol: "BTCUSDT", price: "50000", qty: "0.01" }];
    },
    async fetchSymbolFilters() {
      return buildSymbolRules(exchangeInfoFixture, "USDT");
    }
  };
}

export async function registerExchangeAdapterContractTests({ runCheck, assert }) {
  await runCheck("exchange adapter contract detects missing methods", async () => {
    const valid = assertExchangeAdapterContract(makeFakeAdapter(), { name: "paper" });
    assert.equal(valid.valid, true);
    assert.deepEqual(valid.missingMethods, []);

    const invalid = assertExchangeAdapterContract({ placeOrder() {} }, { name: "broken" });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.missingMethods.includes("cancelOrder"));
    assert.ok(invalid.missingMethods.includes("fetchSymbolFilters"));
  });

  await runCheck("exchange adapter contract normalizes paper and demo fake responses", async () => {
    for (const name of ["paper", "demo"]) {
      const adapter = makeFakeAdapter(name);
      assert.equal(assertExchangeAdapterContract(adapter, { name }).valid, true);
      assert.equal((await adapter.placeOrder({ symbol: "BTCUSDT" })).status, "FILLED");
      assert.equal((await adapter.cancelOrder("BTCUSDT", { orderId: 102 })).status, "CANCELED");
      assert.equal((await adapter.fetchOpenOrders("BTCUSDT"))[0].status, "NEW");
      assert.equal((await adapter.fetchBalances()).BTC.total, 0.012);
      assert.equal((await adapter.fetchRecentTrades("BTCUSDT")).length, 1);
      assert.equal((await adapter.fetchSymbolFilters(["BTCUSDT"])).BTCUSDT.minNotional, 10);
    }
  });

  await runCheck("exchange adapter error mapping covers common Binance failures", async () => {
    assert.equal(normalizeExchangeAdapterError({ status: 429 }).category, "rate_limit");
    assert.equal(normalizeExchangeAdapterError({ code: -1013, message: "Filter failure: MIN_NOTIONAL" }).category, "min_notional");
    assert.equal(normalizeExchangeAdapterError({ code: -1111, message: "Precision is over the maximum" }).category, "precision");
    assert.equal(normalizeExchangeAdapterError({ code: -2010, message: "Account has insufficient balance" }).category, "insufficient_balance");
    assert.equal(normalizeExchangeAdapterError({ code: -2011, message: "Unknown order sent." }).category, "unknown_order");
    assert.equal(normalizeExchangeAdapterError({ code: 12345, message: "Something else" }).liveSafeAction, "manual_review");
  });

  await runCheck("live exchange adapter contract uses fake client and forbids real mutations in tests", async () => {
    const attemptedMutations = [];
    const client = {
      async placeOrder(params) {
        attemptedMutations.push({ method: "placeOrder", params });
        throw new Error("live_order_calls_forbidden_in_tests");
      },
      async cancelOrder(symbol, params) {
        attemptedMutations.push({ method: "cancelOrder", symbol, params });
        throw new Error("live_order_calls_forbidden_in_tests");
      },
      async getOpenOrders() {
        return [{ symbol: "BTCUSDT", orderId: 1, status: "NEW" }];
      },
      async getAccountInfo() {
        return { balances: [{ asset: "USDT", free: "1000", locked: "0" }] };
      },
      async getMyTrades() {
        return [];
      },
      async getExchangeInfo() {
        return exchangeInfoFixture;
      }
    };
    const adapter = createBinanceClientAdapter(client, { buildSymbolRules });
    assert.equal(assertExchangeAdapterContract(adapter, { name: "live" }).valid, true);
    assert.equal((await adapter.fetchOpenOrders("BTCUSDT"))[0].orderId, 1);
    assert.equal((await adapter.fetchBalances()).USDT.total, 1000);
    assert.equal((await adapter.fetchRecentTrades("BTCUSDT")).length, 0);
    assert.equal((await adapter.fetchSymbolFilters(["BTCUSDT"])).BTCUSDT.symbol, "BTCUSDT");

    await assert.rejects(
      () => adapter.placeOrder({ symbol: "BTCUSDT", side: "BUY" }),
      /live_order_calls_forbidden_in_tests/
    );
    assert.deepEqual(attemptedMutations.map((item) => item.method), ["placeOrder"]);
  });
}
