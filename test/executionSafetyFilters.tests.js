import {
  buildSymbolRules,
  normalizePrice,
  normalizeQuantity,
  resolveMarketBuyQuantity
} from "../src/binance/symbolFilters.js";
import {
  normalizeTradeCommissionToQuote,
  summarizeTradeFees
} from "../src/execution/feeAccounting.js";
import { validateProtectiveSellOcoGeometry } from "../src/execution/liveBroker.js";
import { buildExecutionFeedbackDataset } from "../src/runtime/executionFeedbackLearning.js";

const exchangeInfo = {
  symbols: [
    {
      symbol: "TESTUSDT",
      status: "TRADING",
      baseAsset: "TEST",
      quoteAsset: "USDT",
      filters: [
        { filterType: "PRICE_FILTER", minPrice: "0.05", maxPrice: "1000", tickSize: "0.05" },
        { filterType: "LOT_SIZE", minQty: "0.01", maxQty: "100", stepSize: "0.01" },
        { filterType: "MARKET_LOT_SIZE", minQty: "0.001", maxQty: "100", stepSize: "0.001" },
        { filterType: "MIN_NOTIONAL", minNotional: "10" }
      ]
    }
  ]
};

export async function registerExecutionSafetyFilterTests({ runCheck, assert }) {
  await runCheck("P6.3 SELL OCO geometry accepts only protective sell ordering", async () => {
    assert.equal(validateProtectiveSellOcoGeometry({
      takeProfitPrice: 110,
      currentMid: 100,
      stopTriggerPrice: 95,
      stopLimitPrice: 94.5
    }).valid, true);

    const invalid = [
      [{ takeProfitPrice: 100, currentMid: 100, stopTriggerPrice: 95, stopLimitPrice: 94.5 }, "takeProfitPrice_not_above_market"],
      [{ takeProfitPrice: 110, currentMid: 100, stopTriggerPrice: 100, stopLimitPrice: 99.5 }, "stopTriggerPrice_not_below_market"],
      [{ takeProfitPrice: 110, currentMid: 100, stopTriggerPrice: 95, stopLimitPrice: 95.05 }, "stopLimitPrice_above_stopTriggerPrice"],
      [{ takeProfitPrice: 110, currentMid: 0, stopTriggerPrice: 95, stopLimitPrice: 94.5 }, "currentMid_invalid"],
      [{ takeProfitPrice: Number.NaN, currentMid: 100, stopTriggerPrice: 95, stopLimitPrice: 94.5 }, "takeProfitPrice_invalid"]
    ];
    for (const [input, issue] of invalid) {
      const result = validateProtectiveSellOcoGeometry(input);
      assert.equal(result.valid, false);
      assert.ok(result.issues.includes(issue), `expected ${issue}, got ${result.issues.join(",")}`);
    }
  });

  await runCheck("P6.3 symbol filters round tick size step size and min notional safely", async () => {
    const rules = buildSymbolRules(exchangeInfo, "USDT").TESTUSDT;
    assert.equal(normalizePrice(1.023, rules, "floor"), 1);
    assert.equal(normalizePrice(1.023, rules, "ceil"), 1.05);
    assert.equal(normalizePrice(1.023, rules, "round"), 1);
    assert.equal(normalizePrice(0.001, rules, "floor"), 0.05);

    assert.equal(normalizeQuantity(1.23456, rules, "floor", true), 1.234);
    assert.equal(normalizeQuantity(1.23456, rules, "ceil", true), 1.235);
    assert.equal(normalizeQuantity(0.0005, rules, "floor", true), 0);
    assert.equal(normalizeQuantity(1.23456, rules, "floor", false), 1.23);

    const valid = resolveMarketBuyQuantity(20, 2, rules);
    assert.equal(valid.valid, true);
    assert.equal(valid.quantity, 10);
    const belowMinNotional = resolveMarketBuyQuantity(9, 2, rules);
    assert.equal(belowMinNotional.valid, false);
    assert.equal(belowMinNotional.reason, "notional_below_minimum");
  });

  await runCheck("P6.3 fee accounting covers quote base third asset and unconverted fees", async () => {
    const quote = normalizeTradeCommissionToQuote({
      trade: { price: "100", qty: "2", commission: "0.25", commissionAsset: "USDT" },
      baseAsset: "TEST",
      quoteAsset: "USDT"
    });
    assert.equal(quote.feeQuote, 0.25);

    const base = normalizeTradeCommissionToQuote({
      trade: { price: "100", qty: "2", commission: "0.01", commissionAsset: "TEST" },
      baseAsset: "TEST",
      quoteAsset: "USDT"
    });
    assert.equal(base.feeQuote, 1);

    const bnb = normalizeTradeCommissionToQuote({
      trade: { price: "100", qty: "2", commission: "0.02", commissionAsset: "BNB" },
      baseAsset: "TEST",
      quoteAsset: "USDT",
      priceResolver: () => 300
    });
    assert.equal(bnb.feeQuote, 6);

    const summary = summarizeTradeFees({
      trades: [{ price: "100", qty: "2", commission: "0.02", commissionAsset: "UNKNOWN" }],
      baseAsset: "TEST",
      quoteAsset: "USDT"
    });
    assert.equal(summary.feeQuote, 0);
    assert.equal(summary.feeQuoteStatus, "partial_unconverted");
    assert.equal(summary.unconvertedCount, 1);
  });

  await runCheck("P6.3 favorable slippage sign does not create execution pain", async () => {
    const trades = Array.from({ length: 4 }, (_, index) => ({
      symbol: "TESTUSDT",
      sessionAtEntry: "us",
      regimeAtEntry: "trend",
      strategyFamily: "breakout",
      entryExecutionAttribution: {
        expectedSpreadBps: 2,
        realizedSpreadBps: 2,
        expectedSlippageBps: 2,
        realizedSlippageBps: 1,
        slippageDeltaBps: -1,
        fillSpeedMs: 0,
        cancelReplaceCount: 0,
        fillId: `fill-${index}`
      }
    }));
    const dataset = buildExecutionFeedbackDataset({
      journal: { trades },
      symbol: "TESTUSDT",
      session: "us",
      regime: "trend",
      family: "breakout"
    });
    assert.equal(dataset.status, "ready");
    assert.equal(dataset.slippageDeltaBps, -1);
    assert.equal(dataset.slippagePressure, 0);
    assert.equal(dataset.executionPainScore, 0);
    assert.equal(dataset.executionQualityScore, 1);
  });
}
