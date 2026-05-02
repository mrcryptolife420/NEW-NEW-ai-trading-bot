# Learning Analytics

This layer improves learning quality and operator review without making live trading more aggressive. All promotion, rollback and replay-pack outputs are diagnostics only.

## Trade Thesis

`src/runtime/tradeThesis.js` builds a compact thesis for a candidate or decision:

- primary reason
- supporting reasons
- invalidation conditions
- expected hold time and expected path
- risk notes
- `doNotAverageDown: true`

The dashboard can show this as audit metadata. It does not change execution behavior.

## Exit Quality

`src/runtime/exitQuality.js` labels closed-trade exits as:

- `good_exit`
- `late_exit`
- `early_exit`
- `stop_too_tight`
- `take_profit_too_close`
- `trailing_stop_good`
- `execution_drag_exit`
- `news_risk_exit`
- `forced_reconcile_exit`
- `unknown_exit_quality`

Labels include confidence and reasons. They are analytics-only.

## Veto Outcomes

`src/runtime/vetoOutcome.js` records blocked setups as observations and labels later paths:

- `good_veto`
- `bad_veto`
- `neutral_veto`
- `unknown_veto`

This supports missed-trade review but does not relax hard-safety blockers.

## Failure Library

`src/runtime/failureLibrary.js` maps evidence into operator-review modes:

- `late_entry`
- `early_exit`
- `bad_veto`
- `execution_drag`
- `crowded_breakout`
- `news_blindspot`
- `quality_trap`
- `reconcile_uncertainty`

The output is a review aid with severity, confidence, evidence and a recommended review action.

## Regime Confusion

`src/runtime/regimeConfusion.js` tracks predicted regime versus realized outcome. This is useful for finding regime-specific strategy mistakes without changing live routing.

## Promotion Dossier

`src/runtime/promotionDossier.js` builds paper-to-live readiness dossiers with:

- sample counts
- paper/shadow quality
- freshness
- failure modes
- blocking reasons
- recommended next step

The dossier explicitly sets `autoPromotionAllowed: false`.

## Rollback Watch

`src/runtime/rollbackWatch.js` emits `normal`, `watch` or `rollback_recommended` based on live/canary drawdown, failure clusters and drift. It never executes a rollback automatically.

## Replay Pack Scoring

`src/runtime/replayPackScoring.js` prioritizes replay candidates, especially `bad_veto` and `reconcile_uncertainty`, so operators can debug the most useful decision packs first.

## CLI

Read-only commands:

- `node src/cli.js learning:failures`
- `node src/cli.js learning:promotion`
- `node src/cli.js learning:replay-packs`

These commands read runtime/journal state and may return `insufficient_data`. They do not place orders or mutate live configuration.
