# Trading Quality Diagnostics

This patch adds a diagnostics-first trading-quality layer. It is designed to improve operator review, paper learning, and backtest analysis without making live trading more aggressive.

## Modules

- `src/strategy/advancedIndicators.js` contains fallback-safe pure helpers for anchored VWAP, EMA slope stack, relative volume, squeeze state, ATR percentile, VWAP Z-score, OBV divergence, spread percentile, and order-book imbalance stability.
- `src/strategy/indicatorRegimeScoring.js` scores whether indicators fit the current regime/setup. It separates supporting indicators, conflicts, and warnings.
- `src/strategy/setupThesis.js` builds compact thesis diagnostics for trend continuation, breakout retest, mean reversion, liquidity sweep reclaim, and VWAP reclaim.
- `src/strategy/exitPlanHints.js` provides setup-aware exit planning hints such as invalidation type, time stop, partial take-profit, and trail activation.
- `src/risk/portfolioCrowding.js` detects duplicate symbol blocks and portfolio crowding without disabling normal multi-position support.
- `src/backtest/backtestMetrics.js` computes quality metrics such as expectancy, profit factor, drawdown, average R, fee drag, slippage drag, and sample-size warning.

## Runtime Visibility

Dashboard decision cards can now include `tradingQualitySummary` with:

- `topSetupType`
- `regimeFit`
- `bestEvidence`
- `mainConflict`
- `portfolioCrowdingRisk`
- `exitPlanHint`

The dashboard normalizer treats the summary as optional, so older snapshots remain valid.

## Safety Rules

- Live safety is unchanged and remains stricter than paper.
- Exchange safety, reconcile, manual review, unresolved execution intents, and health-circuit blockers remain hard blockers.
- New positive indicator diagnostics do not lower live thresholds or bypass risk gates.
- Portfolio crowding reduces size or blocks duplicates/extreme crowding; it does not impose a hardcoded one-position mode.
- Post-reconcile probation continues to use configurable multi-position limits instead of max-one assumptions.
