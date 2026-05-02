# Backtesting

Backtests are offline diagnostics. They must not place live orders and should not be used as a profit guarantee.

## Standard Backtest

Run a single-symbol backtest:

```bash
npm run backtest -- BTCUSDT
```

Direct CLI:

```bash
node src/cli.js backtest BTCUSDT
```

The runner loads historical candles, builds the normal feature/strategy/risk path, simulates execution with the backtest execution model, and returns the performance report.

## Walk-Forward Backtest

Walk-forward mode splits historical candles into rolling windows:

- `train`: strategy/model context development window.
- `validation`: out-of-sample validation window.
- `test`: final out-of-sample test window for that roll.
- `step`: how many candles to advance before the next window.

Run:

```bash
npm run backtest:walkforward -- BTCUSDT
```

Direct CLI:

```bash
node src/cli.js backtest:walkforward BTCUSDT
```

Optional arguments:

```bash
node src/cli.js backtest:walkforward BTCUSDT --interval=15m --train=240 --validation=120 --test=120 --step=120 --limit=900
```

Output per walk-forward window includes:

- trade count
- win rate
- average return
- max drawdown
- profit factor
- Sharpe-like score
- regime breakdown
- strategy family breakdown

## Safety Notes

- Walk-forward backtests use the existing offline backtest runner and synthetic execution model.
- No live broker path is invoked.
- If local candle history is missing or too short, the command returns `insufficient_history`.
- Backtest evidence should be combined with replay coverage, execution fee/slippage reality, and paper/live parity before changing live behavior.
