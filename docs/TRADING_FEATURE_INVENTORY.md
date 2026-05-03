# Trading Feature Inventory

This inventory is code-grounded against `src/strategy/indicators.js`, `src/strategy/indicatorFeatureRegistry.js`, and current strategy/risk consumers. It is intentionally operator-facing: features are documented for safer review, not as profit claims.

| Feature | Type | Best Regime | Use | Known Pitfall | Test Coverage | Live Impact |
| --- | --- | --- | --- | --- | --- | --- |
| SMA / EMA / EMA gap | trend | trend, pullback | entry/filter/risk | Late in fast reversals | yes | yes |
| EMA trend score / slope | trend | trend, breakout | entry/filter/scoring | Can chase mature moves | yes | yes |
| RSI | range | range, mean reversion | entry/filter/diagnostic | Oversold can stay oversold in trend | yes | yes |
| MACD histogram | trend | trend, breakout | entry/diagnostic | Lagging in choppy tapes | yes | yes |
| ATR / ATR pct | volatility/risk | all | sizing/risk/exit | High ATR can mean opportunity or danger | yes | yes |
| Bollinger bands | range/breakout | squeeze, range | entry/filter/diagnostic | Band tags alone are not reversals | yes | yes |
| Keltner channels | volatility/breakout | squeeze, expansion | entry/filter/diagnostic | False expansion in thin books | yes | yes |
| Bollinger/Keltner squeeze | breakout/volatility | compression to expansion | diagnostic/watch | Watch signal, not automatic entry | yes | diagnostics/paper |
| Donchian channel | breakout | breakout, trend | entry/filter | Breakout chase risk | yes | yes |
| Liquidity sweep | market structure | range, reclaim | entry/filter | Wick-only sweeps need reclaim proof | yes | yes |
| Structure break / BOS | breakout/market structure | trend, breakout | entry/filter | Failed breakouts need invalidation | yes | yes |
| Swing structure | market structure | trend/range | filter/exit | Sensitive to window length | partial | yes |
| Fair value gap | market structure | trend, continuation | diagnostic/filter | Gaps can fill slowly or never | partial | diagnostics |
| CVD context from candles | orderflow | breakout, reclaim | filter/risk | Candle-derived CVD is approximate | yes | yes |
| Choppiness Index | range/risk | range/chop | filter/risk | Can lag regime transition | yes | yes |
| Hurst exponent | trend/range | trend/range split | diagnostic/filter | Needs enough samples | yes | diagnostics |
| Realized skew/kurtosis | volatility/risk | high volatility | risk/diagnostic | Noisy on small samples | yes | diagnostics/risk |
| Stoch RSI | range | range, mean reversion | entry/filter | Overreacts in strong trends | yes | yes |
| Money Flow Index | volume/range | range/reversion | entry/filter | Volume spikes distort readings | yes | yes |
| Chaikin Money Flow | volume/orderflow | trend, accumulation | diagnostic/filter | Weak on low-volume symbols | partial | diagnostics |
| Supertrend | trend/risk | trend | filter/exit | Flips late in chop | yes | yes |
| Volume acceptance | volume/breakout | breakout | entry/filter | Wash volume can fake acceptance | yes | yes |
| Relative strength vs BTC/ETH/cluster | trend/risk | trend, rotation | entry/risk | Correlation shifts quickly | yes | yes |
| Range stability / range grid diagnostics | range/risk | range | filter/risk | Dangerous in expansion regimes | yes | paper/risk |
| Indicator feature registry pack | mixed | strategy-specific | paper scoring/diagnostic | Missing/warmup features must not be fake zeros | yes | paper/diagnostic |
| Multi-horizon orderflow/CVD v1/v2 | orderflow | breakout/reclaim | diagnostic/risk | Stream gaps can stale signals | yes | risk/diagnostic |

## New Diagnostics In This Patch

| Feature | Type | Best Regime | Use | Known Pitfall | Test Coverage | Live Impact |
| --- | --- | --- | --- | --- | --- | --- |
| Anchored VWAP helper | trend/range | pullback, reclaim | diagnostic/thesis/exit hint | Anchor choice matters | yes | diagnostics only |
| EMA slope stack | trend | trend, breakout | diagnostic/regime-fit | Late in reversals | yes | diagnostics only |
| Relative volume | volume | breakout, reclaim | diagnostic/regime-fit | Single spike can mislead | yes | diagnostics only |
| ATR percentile | volatility/risk | all | diagnostic/risk warning | High percentile can be event-driven | yes | diagnostics only |
| VWAP Z-score | range/reclaim | mean reversion, vwap reclaim | diagnostic/thesis | Reversion fails in trend expansion | yes | diagnostics only |
| OBV divergence | orderflow | reclaim/reversion | diagnostic/conflict | OBV can diverge for long periods | yes | diagnostics only |
| Spread percentile | execution/risk | all | diagnostic/risk | Needs local spread history | yes | diagnostics only |
| Order book imbalance stability | orderflow/execution | breakout/reclaim | diagnostic/risk | Requires fresh stream snapshots | yes | diagnostics only |

Safety invariant: new positive diagnostics do not loosen live thresholds, exchange safety, reconcile gates, manual review gates, execution intent blockers, or sizing caps.
