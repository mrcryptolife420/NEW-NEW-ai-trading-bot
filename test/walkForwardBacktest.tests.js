import {
  buildWalkForwardWindowsFromCandles,
  parseBacktestWalkForwardArgs,
  summarizeWalkForwardBacktestStage
} from "../src/runtime/walkForwardBacktest.js";

function candle(index) {
  const openTime = Date.UTC(2026, 0, 1, 0, index * 15);
  return {
    openTime,
    closeTime: openTime + 15 * 60_000 - 1,
    open: 100 + index * 0.1,
    high: 101 + index * 0.1,
    low: 99 + index * 0.1,
    close: 100.5 + index * 0.1,
    volume: 1000 + index
  };
}

function trade(id, netPnlPct, extras = {}) {
  return {
    id,
    entryAt: new Date(Date.UTC(2026, 0, 1, 0, Number(id.replace(/\D/g, "")) || 0)).toISOString(),
    exitAt: new Date(Date.UTC(2026, 0, 1, 1, Number(id.replace(/\D/g, "")) || 0)).toISOString(),
    netPnlPct,
    pnlQuote: netPnlPct * 1000,
    ...extras
  };
}

export async function registerWalkForwardBacktestTests({ runCheck, assert }) {
  await runCheck("walk-forward candle splitter builds train validation and test windows", () => {
    const candles = Array.from({ length: 20 }, (_, index) => candle(index));
    const split = buildWalkForwardWindowsFromCandles({
      candles,
      trainCandles: 6,
      validationCandles: 4,
      testCandles: 4,
      stepCandles: 3
    });
    assert.equal(split.status, "ready");
    assert.equal(split.windowCount, 3);
    assert.deepEqual(split.windows[0].ranges, undefined);
    assert.equal(split.windows[0].train.startIndex, 0);
    assert.equal(split.windows[0].validation.startIndex, 6);
    assert.equal(split.windows[0].test.startIndex, 10);
    assert.equal(split.windows[1].train.startIndex, 3);
  });

  await runCheck("walk-forward splitter reports insufficient history deterministically", () => {
    const split = buildWalkForwardWindowsFromCandles({
      candles: Array.from({ length: 9 }, (_, index) => candle(index)),
      trainCandles: 6,
      validationCandles: 3,
      testCandles: 3,
      stepCandles: 3
    });
    assert.equal(split.status, "insufficient_history");
    assert.equal(split.windowCount, 0);
    assert.equal(split.requiredCandles, 12);
  });

  await runCheck("walk-forward stage summary computes metrics and breakdowns", () => {
    const result = {
      artifacts: {
        trades: [
          trade("t1", 0.02, { regimeAtEntry: "trend_up", strategyDecision: { family: "breakout" } }),
          trade("t2", -0.01, { regimeAtEntry: "range", strategyDecision: { family: "mean_reversion" } }),
          trade("t3", 0.015, { regimeAtEntry: "trend_up", strategyDecision: { family: "breakout" } })
        ],
        equitySnapshots: [
          { equity: 10000 },
          { equity: 10300 },
          { equity: 9900 },
          { equity: 10400 }
        ]
      }
    };
    const summary = summarizeWalkForwardBacktestStage({ result, stage: "test", candles: [candle(0), candle(1)] });
    assert.equal(summary.stage, "test");
    assert.equal(summary.trades, 3);
    assert.equal(summary.winRate, 0.6667);
    assert.ok(summary.maxDrawdown > 0.03);
    assert.ok(summary.profitFactor > 3);
    assert.equal(summary.regimeBreakdown[0].id, "trend_up");
    assert.equal(summary.strategyFamilyBreakdown[0].id, "breakout");
  });

  await runCheck("walk-forward CLI args parse symbol and window sizes", () => {
    const parsed = parseBacktestWalkForwardArgs([
      "ETHUSDT",
      "--interval=5m",
      "--train=100",
      "--validation=40",
      "--test=30",
      "--step=15",
      "--limit=400"
    ], { watchlist: ["BTCUSDT"], klineInterval: "15m", backtestCandleLimit: 500 });
    assert.equal(parsed.symbol, "ETHUSDT");
    assert.equal(parsed.interval, "5m");
    assert.equal(parsed.trainCandles, 100);
    assert.equal(parsed.validationCandles, 40);
    assert.equal(parsed.testCandles, 30);
    assert.equal(parsed.stepCandles, 15);
    assert.equal(parsed.limit, 400);
  });
}
