# Risk Management Diagnostics

This document tracks safety-first risk modules that support operator review, paper learning, and portfolio governance without making live trading more aggressive.

## Risk Of Ruin Monitor

`src/risk/riskOfRuin.js` builds a portfolio-facing risk-of-ruin summary from closed trade outcomes, current exposure, optional portfolio scenario stress, and the existing low-level `src/runtime/riskOfRuinSimulator.js`.

Output fields:

- `riskOfRuinScore`: bounded 0-1 score combining drawdown probability, realized drawdown, loss-streak risk, expectancy, variance, and current exposure.
- `expectedDrawdown`: worst available drawdown estimate from trade distribution, simulator output, and portfolio scenario stress.
- `lossStreakRisk`: normalized risk from realized and expected losing streaks.
- `recommendedSizeMultiplier`: risk-reducing hint capped at 1, never a size increase.
- `warnings`: insufficient history, high variance, and high exposure diagnostics.
- `entryGateRecommendation`: `diagnostics_only` by default; can only recommend `block_new_entries` when the explicit risk-of-ruin entry-block config is enabled.

Safety invariants:

- The monitor is diagnostics/governance-first.
- It never recommends larger live size.
- It does not clear exchange safety, reconcile, manual review, or execution-intent blockers.
- Blocking output is opt-in via config and can only make behavior stricter.
- Dashboard/readmodel visibility is optional and fallback-safe through `riskOfRuinSummary`.
