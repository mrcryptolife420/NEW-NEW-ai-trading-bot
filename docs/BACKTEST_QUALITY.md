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

## Walk-Forward Deployment Report

`src/research/walkForwardDeploymentReport.js` combines backtest metrics, regime breakdown, calibration, failure severity, anti-overfit review and canary gate status into a read-only deployment report.

CLI:

```bash
node src/cli.js research:deployment-report
```

Output:

- `deploymentStatus`: `not_ready`, `blocked`, `watch` or `paper_candidate`
- `blockingReasons`
- `warnings`
- `recommendedNextStep`
- `metrics`
- `regimeBreakdown`
- `antiOverfit`
- `canaryGate`

Safety rules:

- The report never promotes a strategy/config to live automatically.
- Strong evidence can only produce a paper/shadow recommendation.
- Low samples, weak regime splits, bad calibration, severe failure modes or anti-overfit blocks prevent promotion.
- Live rollout still requires separate safety/canary review.
