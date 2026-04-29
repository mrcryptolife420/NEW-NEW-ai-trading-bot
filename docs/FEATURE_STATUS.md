# Feature Status

## Implemented

- Fail-fast config loading met `zod` schema parsing en expliciete `ConfigValidationError`.
- Guarded bot lifecycle state machine in `src/runtime/botLifecycleStateMachine.js`.
- Manager-first CLI orchestration voor `run`, `once`, `status`, `doctor`, `report`, `learning`, `research` en `scan`.
- Structured audit logging voor signal, risk, trade intent, execution en adaptive changes.
- Dashboard snapshot contract v3 met expliciete operations health-secties.
- Repo-local history management, inspect/migrate/repair flows en lock-tolerante quarantine.

## Experimental

- Adaptive governance auto-apply in paper mode.
- Online/adaptive parameter tuning en runtime-applied biases.
- Threshold tuning, promotion/probation en shadow-style promotion flows.
- Research mining, replay chaos packs en broader offline retrain orchestration.

## Planned

- Verdere opsplitsing van `TradingBot` naar kleinere read-model en orchestration services.
- Replay tooling die een volledige beslissing kan reconstrueren uit audit log + runtime snapshot + journal.
- CI gates voor config schema, lifecycle, dashboard contract en replay determinism.
- Operator timeline view direct gevoed vanuit audit logs en coarse domain events.
