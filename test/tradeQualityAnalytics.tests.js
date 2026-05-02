import {
  buildExcursionAnalyticsFromCandles,
  buildTradePathQualitySummary,
  buildTradeQualityAnalytics,
  updateOpenPositionExcursion
} from "../src/runtime/tradeQualityAnalytics.js";
import { buildPerformanceReport } from "../src/runtime/reportBuilder.js";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");

function candle(offsetMinutes, { high, low, close = 100 }) {
  return {
    openTime: T0 + offsetMinutes * 60_000 - 60_000,
    closeTime: T0 + offsetMinutes * 60_000,
    open: close,
    high,
    low,
    close,
    volume: 100
  };
}

export async function registerTradeQualityAnalyticsTests({ runCheck, assert, makeConfig }) {
  await runCheck("trade quality analytics computes MFE MAE and timing from synthetic candles", async () => {
    const analytics = buildExcursionAnalyticsFromCandles({
      entryPrice: 100,
      entryAt: "2026-01-01T00:00:00.000Z",
      exitAt: "2026-01-01T00:30:00.000Z",
      candles: [
        candle(5, { high: 101, low: 99.2 }),
        candle(15, { high: 106, low: 100.8 }),
        candle(25, { high: 103, low: 96.5 }),
        candle(35, { high: 110, low: 95 })
      ]
    });

    assert.equal(analytics.maximumFavorableExcursionPct, 0.06);
    assert.equal(analytics.maximumAdverseExcursionPct, -0.035);
    assert.equal(analytics.bestPossibleExitPrice, 106);
    assert.equal(analytics.worstAdversePrice, 96.5);
    assert.equal(analytics.timeToMfeMinutes, 15);
    assert.equal(analytics.timeToMaeMinutes, 25);
  });

  await runCheck("open position excursion tracker updates runtime path quality", async () => {
    const position = {
      entryAt: "2026-01-01T00:00:00.000Z",
      entryPrice: 100,
      highestPrice: 100,
      lowestPrice: 100
    };
    updateOpenPositionExcursion(position, {
      price: 101,
      highPrice: 104,
      lowPrice: 98.2,
      at: "2026-01-01T00:12:00.000Z"
    });
    updateOpenPositionExcursion(position, {
      price: 99,
      highPrice: 102,
      lowPrice: 96.8,
      at: "2026-01-01T00:24:00.000Z"
    });

    assert.equal(position.maximumFavorableExcursionPct, 0.04);
    assert.equal(position.maximumAdverseExcursionPct, -0.032);
    assert.equal(position.bestPossibleExitPrice, 104);
    assert.equal(position.worstAdversePrice, 96.8);
    assert.equal(position.timeToMfeMinutes, 12);
    assert.equal(position.timeToMaeMinutes, 24);
  });

  await runCheck("trade quality analytics labels good entry bad exit and late exit", async () => {
    const analytics = buildTradeQualityAnalytics({
      trade: {
        entryPrice: 100,
        exitPrice: 99,
        netPnlPct: -0.01,
        maximumFavorableExcursionPct: 0.04,
        maximumAdverseExcursionPct: -0.012,
        reason: "time_stop"
      }
    });

    assert.equal(analytics.tradeQualityLabels.includes("good_entry_bad_exit"), true);
    assert.equal(analytics.tradeQualityLabels.includes("late_exit"), true);
    assert.equal(analytics.gaveBackPct, 0.05);
    assert.equal(analytics.exitEfficiencyPct, -0.25);
  });

  await runCheck("trade quality analytics labels stop too tight and take profit too close", async () => {
    const stopped = buildTradeQualityAnalytics({
      trade: {
        entryPrice: 100,
        exitPrice: 99.2,
        netPnlPct: -0.008,
        maximumFavorableExcursionPct: 0.012,
        maximumAdverseExcursionPct: -0.01,
        reason: "stop_loss"
      }
    });
    const capped = buildTradeQualityAnalytics({
      trade: {
        entryPrice: 100,
        exitPrice: 101,
        netPnlPct: 0.01,
        maximumFavorableExcursionPct: 0.025,
        maximumAdverseExcursionPct: -0.004,
        reason: "take_profit"
      }
    });

    assert.equal(stopped.tradeQualityLabels.includes("stop_too_tight"), true);
    assert.equal(capped.tradeQualityLabels.includes("take_profit_too_close"), true);
  });

  await runCheck("performance report exposes trade path quality summary", async () => {
    const trades = [
      {
        id: "t1",
        symbol: "BTCUSDT",
        brokerMode: "paper",
        tradingSource: "paper:internal",
        entryAt: "2026-01-01T00:00:00.000Z",
        exitAt: "2026-01-01T00:30:00.000Z",
        entryPrice: 100,
        exitPrice: 99,
        quantity: 1,
        totalCost: 100,
        proceeds: 99,
        pnlQuote: -1,
        netPnlPct: -0.01,
        maximumFavorableExcursionPct: 0.04,
        maximumAdverseExcursionPct: -0.012,
        reason: "time_stop"
      },
      {
        id: "t2",
        symbol: "ETHUSDT",
        brokerMode: "paper",
        tradingSource: "paper:internal",
        entryAt: "2026-01-01T00:00:00.000Z",
        exitAt: "2026-01-01T00:30:00.000Z",
        entryPrice: 100,
        exitPrice: 103,
        quantity: 1,
        totalCost: 100,
        proceeds: 103,
        pnlQuote: 3,
        netPnlPct: 0.03,
        maximumFavorableExcursionPct: 0.035,
        maximumAdverseExcursionPct: -0.004,
        reason: "trailing_stop"
      }
    ];
    const summary = buildTradePathQualitySummary(trades);
    const report = buildPerformanceReport({
      journal: { trades, scaleOuts: [], blockedSetups: [], researchRuns: [], equitySnapshots: [], events: [] },
      runtime: { openPositions: [] },
      config: makeConfig({ botMode: "paper", reportLookbackTrades: 10 }),
      now: new Date("2026-01-01T01:00:00.000Z")
    });

    assert.equal(summary.tradeCount, 2);
    assert.equal(summary.labelCounts.good_entry_bad_exit >= 1, true);
    assert.equal(report.postTradeAnalytics.tradePathQuality.tradeCount, 2);
    assert.equal(report.postTradeAnalytics.tradePathQuality.weakestExitEfficiency[0].symbol, "BTCUSDT");
  });
}
