# Backtest Quality

Backtest and paper results should be treated as evidence only when execution assumptions are explicit and conservative. This document tracks diagnostics that make backtest and paper fills less optimistic without changing live execution behavior.

## Microstructure Fill Simulation

`src/execution/microstructureFillSimulator.js` provides a pure diagnostics helper for paper/backtest realism.

Inputs:

- order type
- quantity or notional
- spread
- book depth
- candle volume
- volatility
- latency
- urgency

Output:

- `fillProbability`
- `expectedSlippageBps`
- `partialFillRatio`
- `timeoutRisk`
- `queueRisk`
- `liquidityScore`
- `warnings`

Safety rules:

- The helper is fallback-safe and returns finite values on missing data.
- It is diagnostics/config-gated first and does not change live order routing.
- Thin books, high volatility, wide spreads and maker queue risk produce warnings instead of optimistic fills.
- Live execution behavior must not be changed without a separate canary/safety review.
