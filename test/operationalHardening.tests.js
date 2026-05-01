import { normalizeTradeCommissionToQuote, summarizeTradeFees } from "../src/execution/feeAccounting.js";
import { validatePaperPortfolioState } from "../src/execution/paperBroker.js";
import { sortReasonsByRootPriority, classifyDecisionPlane, isHardSafetyReason } from "../src/risk/reasonRegistry.js";
import { buildStrategyEvidenceScorecard } from "../src/runtime/strategyEvidenceScorecard.js";
import { classifyTradeAutopsy } from "../src/runtime/tradeAutopsy.js";
import { buildPaperLiveParitySummary } from "../src/runtime/paperLiveParity.js";

export async function registerOperationalHardeningTests({ runCheck, assert }) {
  await runCheck("fee accounting converts base quote and third asset commissions", async () => {
    const baseFee = normalizeTradeCommissionToQuote({
      trade: { price: "100", qty: "2", commission: "0.01", commissionAsset: "BTC" },
      baseAsset: "BTC",
      quoteAsset: "USDT"
    });
    assert.equal(baseFee.feeQuote, 1);
    const quoteFee = normalizeTradeCommissionToQuote({
      trade: { price: "100", qty: "2", commission: "0.2", commissionAsset: "USDT" },
      baseAsset: "BTC",
      quoteAsset: "USDT"
    });
    assert.equal(quoteFee.feeQuote, 0.2);
    const bnbFee = normalizeTradeCommissionToQuote({
      trade: { price: "100", qty: "2", commission: "0.01", commissionAsset: "BNB" },
      baseAsset: "BTC",
      quoteAsset: "USDT",
      priceResolver: () => 300
    });
    assert.equal(bnbFee.feeQuote, 3);
  });

  await runCheck("fee accounting preserves unconverted third asset fees", async () => {
    const summary = summarizeTradeFees({
      trades: [{ price: "100", qty: "1", commission: "0.5", commissionAsset: "ABC" }],
      baseAsset: "BTC",
      quoteAsset: "USDT"
    });
    assert.equal(summary.feeQuote, 0);
    assert.equal(summary.feeQuoteStatus, "partial_unconverted");
    assert.equal(summary.unconvertedCount, 1);
    assert.equal(summary.breakdown[0].feeQuoteStatus, "unconverted");
  });

  await runCheck("reason registry keeps safety blockers ahead of downstream symptoms", async () => {
    const sorted = sortReasonsByRootPriority(["model_confidence_too_low", "trade_size_below_minimum", "exchange_safety_blocked"]);
    assert.equal(sorted[0], "exchange_safety_blocked");
    assert.equal(isHardSafetyReason(sorted[0]), true);
    assert.equal(classifyDecisionPlane("model_confidence_too_low"), "alpha");
    assert.equal(classifyDecisionPlane("capital_governor_blocked"), "permissioning");
  });

  await runCheck("paper portfolio invariant catches NaN and invalid open positions", async () => {
    assert.equal(validatePaperPortfolioState({
      paperPortfolio: { quoteFree: 100, feesPaid: 1, realizedPnl: 0 },
      openPositions: [{ id: "p1", symbol: "BTCUSDT", entryAt: "now", quantity: 0.1, entryPrice: 100, notional: 10, totalCost: 10, brokerMode: "paper" }]
    }), true);
    assert.throws(() => validatePaperPortfolioState({
      paperPortfolio: { quoteFree: Number.NaN, feesPaid: 1, realizedPnl: 0 },
      openPositions: []
    }), /quoteFree/);
  });

  await runCheck("strategy scorecard separates evidence and detects positive and dangerous edges", async () => {
    const positive = Array.from({ length: 10 }, (_, index) => ({
      id: `w${index}`,
      brokerMode: "paper",
      exitAt: "now",
      strategyAtEntry: "breakout",
      strategyFamily: "breakout",
      regimeAtEntry: "trend_up",
      netPnlPct: index < 7 ? 0.012 : -0.004,
      mfePct: 0.018,
      maePct: -0.004,
      captureEfficiency: 0.6
    }));
    const scorecard = buildStrategyEvidenceScorecard({ trades: positive, source: "paper", strategyId: "breakout", minSampleSize: 8 });
    assert.equal(scorecard.status, "positive_edge");
    const dangerous = buildStrategyEvidenceScorecard({
      trades: positive.map((trade, index) => ({ ...trade, netPnlPct: index < 8 ? 0.002 : -0.05 })),
      source: "paper",
      strategyId: "breakout",
      minSampleSize: 8
    });
    assert.equal(dangerous.status, "dangerous");
    const insufficient = buildStrategyEvidenceScorecard({ trades: positive.slice(0, 3), source: "paper", strategyId: "breakout", minSampleSize: 8 });
    assert.equal(insufficient.status, "insufficient_sample");
  });

  await runCheck("trade autopsy classifies late exits and execution drag", async () => {
    assert.equal(classifyTradeAutopsy({ netPnlPct: -0.01, mfePct: 0.03, maePct: -0.012 }).classification, "late_exit");
    assert.equal(classifyTradeAutopsy({ netPnlPct: -0.002, mfePct: 0.001, maePct: -0.02 }).classification, "bad_entry");
    assert.equal(classifyTradeAutopsy({ netPnlPct: -0.002, mfePct: 0.002, maePct: -0.004, executionQualityScore: 0.2 }).classification, "execution_drag");
    const profitableLowCapture = classifyTradeAutopsy({ netPnlPct: 0.004, mfePct: 0.03, captureEfficiency: 0.12 });
    assert.equal(profitableLowCapture.classification, "premature_exit");
  });

  await runCheck("paper/live parity flags optimistic paper fills", async () => {
    const summary = buildPaperLiveParitySummary({
      comparisons: [
        { symbol: "BTCUSDT", side: "BUY", paperFillPrice: 100, liveFillPrice: 100.08, expectedSlippageBps: 1, realizedSlippageBps: 7, expectedFeeBps: 10, observedFeeBps: 10 },
        { symbol: "ETHUSDT", side: "BUY", paperFillPrice: 50, liveFillPrice: 50.04, expectedSlippageBps: 1, realizedSlippageBps: 6, expectedFeeBps: 10, observedFeeBps: 11 },
        { symbol: "BNBUSDT", side: "SELL", paperFillPrice: 300, liveFillPrice: 299.7, expectedSlippageBps: 1, realizedSlippageBps: 6, expectedFeeBps: 10, observedFeeBps: 10 }
      ],
      minSampleSize: 3
    });
    assert.equal(summary.status, "paper_too_optimistic");
    assert.equal(summary.fillModelTooOptimistic, true);
    assert.ok(summary.optimismBiasBps > 3);
    assert.ok(summary.recommendedPaperCalibration.includes("conservatisme"));
  });
}
