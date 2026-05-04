# Execution Safety Diagnostics

Execution safety helpers are diagnostics/governance-first unless an existing broker safety flow explicitly consumes them.

## Order Style Advisor

`src/execution/orderStyleAdvisor.js` recommends conservative order-style posture from spread, depth, volatility, slippage confidence, setup type, urgency, position size, and maker/taker fee context.

Supported styles:

- `maker_limit`
- `limit_ioc`
- `market_prohibited`
- `stop_limit_wide`
- `protective_rebuild_only`

The advisor also returns `makerSuitable`, `takerSuitable`, `stopLimitGapHint`, `warnings`, and `manualReviewRecommended`.

Safety invariants:

- It does not mutate execution plans or place orders.
- It does not make live order style riskier automatically.
- `market_prohibited` and `protective_rebuild_only` are conservative recommendations.
- Liquidity drain, missing orderbook, low slippage confidence, high volatility, and wide spread remain caution/manual-review signals.
- Dashboard visibility is optional through `orderStyleAdviceSummary`.
