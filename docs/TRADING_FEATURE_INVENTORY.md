# Trading Feature Inventory

This inventory is code-grounded against `src/strategy/indicators.js`, `src/strategy/indicatorFeatureRegistry.js`, and current strategy/risk consumers. It is intentionally operator-facing: features are documented for safer review, not as profit claims.

| Feature | Type | Best Regime | Use | Known Pitfall | Test Coverage | Live Impact | Advice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SMA / EMA / EMA gap | trend | trend, pullback | entry/filter/risk | Late in fast reversals | yes | yes | live with existing gates |
| EMA trend score / slope | trend | trend, breakout | entry/filter/scoring | Can chase mature moves | yes | yes | live with anti-chase blockers |
| RSI | range | range, mean reversion | entry/filter/diagnostic | Oversold can stay oversold in trend | yes | yes | live only with regime fit |
| MACD histogram | trend | trend, breakout | entry/diagnostic | Lagging in choppy tapes | yes | yes | live as supporting evidence |
| ATR / ATR pct | volatility/risk | all | sizing/risk/exit | High ATR can mean opportunity or danger | yes | yes | live risk/size conservative |
| Bollinger bands | range/breakout | squeeze, range | entry/filter/diagnostic | Band tags alone are not reversals | yes | yes | live only with confirmation |
| Keltner channels | volatility/breakout | squeeze, expansion | entry/filter/diagnostic | False expansion in thin books | yes | yes | live only with confirmation |
| Bollinger/Keltner squeeze | breakout/volatility | compression to expansion | diagnostic/watch | Watch signal, not automatic entry | yes | diagnostics/paper | paper/shadow first |
| Donchian channel | breakout | breakout, trend | entry/filter | Breakout chase risk | yes | yes | live with retest/acceptance filters |
| Liquidity sweep | market structure | range, reclaim | entry/filter | Wick-only sweeps need reclaim proof | yes | yes | live only after reclaim proof |
| Structure break / BOS | breakout/market structure | trend, breakout | entry/filter | Failed breakouts need invalidation | yes | yes | live with failed-breakout guard |
| Swing structure | market structure | trend/range | filter/exit | Sensitive to window length | partial | yes | live cautious; improve tests |
| Fair value gap | market structure | trend, continuation | diagnostic/filter | Gaps can fill slowly or never | partial | diagnostics | diagnostics until stronger tests |
| CVD context from candles | orderflow | breakout, reclaim | filter/risk | Candle-derived CVD is approximate | yes | yes | live as risk/conflict input |
| Choppiness Index | range/risk | range/chop | filter/risk | Can lag regime transition | yes | yes | live conservative filter |
| Hurst exponent | trend/range | trend/range split | diagnostic/filter | Needs enough samples | yes | diagnostics | diagnostics/shadow |
| Realized skew/kurtosis | volatility/risk | high volatility | risk/diagnostic | Noisy on small samples | yes | diagnostics/risk | diagnostics/risk drag only |
| Stoch RSI | range | range, mean reversion | entry/filter | Overreacts in strong trends | yes | yes | live only in range context |
| Money Flow Index | volume/range | range/reversion | entry/filter | Volume spikes distort readings | yes | yes | live with volume sanity |
| Chaikin Money Flow | volume/orderflow | trend, accumulation | diagnostic/filter | Weak on low-volume symbols | partial | diagnostics | diagnostics until tests improve |
| Supertrend | trend/risk | trend | filter/exit | Flips late in chop | yes | yes | live with chop guard |
| Volume acceptance | volume/breakout | breakout | entry/filter | Wash volume can fake acceptance | yes | yes | live only with price/orderflow confirm |
| Relative strength vs BTC/ETH/cluster | trend/risk | trend, rotation | entry/risk | Correlation shifts quickly | yes | yes | live as ranking/risk evidence |
| Range stability / range grid diagnostics | range/risk | range | filter/risk | Dangerous in expansion regimes | yes | paper/risk | paper containment; live strict |
| Indicator feature registry pack | mixed | strategy-specific | paper scoring/diagnostic | Missing/warmup features must not be fake zeros | yes | paper/diagnostic | paper/shadow first |
| Multi-horizon orderflow/CVD v1/v2 | orderflow | breakout/reclaim | diagnostic/risk | Stream gaps can stale signals | yes | risk/diagnostic | live negative risk only |

## New Diagnostics In This Patch

| Feature | Type | Best Regime | Use | Known Pitfall | Test Coverage | Live Impact | Advice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Anchored VWAP helper | trend/range | pullback, reclaim | diagnostic/thesis/exit hint | Anchor choice matters | yes | diagnostics only | diagnostics/paper first |
| EMA slope stack | trend | trend, breakout | diagnostic/regime-fit | Late in reversals | yes | diagnostics only | diagnostics/paper first |
| Relative volume | volume | breakout, reclaim | diagnostic/regime-fit | Single spike can mislead | yes | diagnostics only | diagnostics/paper first |
| ATR percentile | volatility/risk | all | diagnostic/risk warning | High percentile can be event-driven | yes | diagnostics only | live risk drag only after review |
| VWAP Z-score | range/reclaim | mean reversion, vwap reclaim | diagnostic/thesis | Reversion fails in trend expansion | yes | diagnostics only | diagnostics/paper first |
| OBV divergence | orderflow | reclaim/reversion | diagnostic/conflict | OBV can diverge for long periods | yes | diagnostics only | live conflict warning only |
| Spread percentile | execution/risk | all | diagnostic/risk | Needs local spread history | yes | diagnostics only | live execution caution only |
| Order book imbalance stability | orderflow/execution | breakout/reclaim | diagnostic/risk | Requires fresh stream snapshots | yes | diagnostics only | live negative risk only |
| Slippage confidence score | execution/risk | all | diagnostic/risk | Needs realistic fill/slippage samples | yes | diagnostics only | live execution caution only |

## Derivatives Context Diagnostics

| Feature | Type | Best Regime | Use | Known Pitfall | Test Coverage | Live Impact | Advice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Funding pressure | derivatives/risk | trend continuation, squeeze risk | filter/diagnostic | Positive funding can mark crowded longs and should not be treated as automatic bullish evidence | yes | diagnostics/risk only | conservative risk only |
| Open-interest trend | derivatives/confirmation | breakout, trend, unwind | diagnostic/risk | Rising OI can confirm momentum or increase liquidation risk depending on price/orderflow context | yes | diagnostics only | shadow first |
| Spot/futures basis state | derivatives/market structure | trend, stress, backwardation | diagnostic/risk | Negative basis can signal panic/hedging and should not force entries | yes | diagnostics only | diagnostics unless future safety config blocks |
| Liquidation risk | derivatives/orderflow risk | squeeze, crash risk, liquidation magnet | exit/risk diagnostic | Liquidation proximity is noisy without fresh stream/context | yes | diagnostics/risk only | conservative risk only |

`src/market/derivativesContext.js` normalizes existing derivatives provider and market-structure summaries into `derivativesContextSummary`. Missing derivatives data does not block live by default; live safety remains governed by exchange safety, reconcile, readiness and explicit risk policies.

Safety invariant: new positive diagnostics do not loosen live thresholds, exchange safety, reconcile gates, manual review gates, execution intent blockers, or sizing caps.
