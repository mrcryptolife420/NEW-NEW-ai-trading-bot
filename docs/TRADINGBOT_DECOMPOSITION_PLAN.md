# TradingBot Decomposition Plan

`TradingBot` remains the runtime orchestrator. The safe extraction path is to move one responsibility at a time behind small service contracts while keeping existing replay and safety checks intact.

## Current Service Boundaries

- `MarketDataCoordinator`: streams, historical candles, provider health, request budgets.
- `CandidateScanner`: watchlist, scanner, universe scoring, candidate ranking.
- `DecisionEngine`: signal -> risk -> intent decision flow.
- `ExecutionCoordinator`: paper/live broker routing, execution planning, reconcile and fee attribution.
- `RuntimePersistenceService`: state snapshots, journal consistency, audit logs, SQLite read-model rebuilds.
- `ReplayLabService`: incident replay and offline market replay.
- `DashboardReadModelService`: dashboard snapshot/read-model views without trading-state mutation.

## Rules

- Do not move live execution behavior without replay fixtures and targeted broker tests.
- Keep `TradingBot` as the only lifecycle owner until each service has start/stop tests.
- Prefer pure helpers and read-only services first.
- Read-model and replay services must remain rebuildable from JSON/NDJSON source-of-truth.

## Next Safe Extraction

1. Move dashboard snapshot read-model assembly behind `DashboardReadModelService`.
2. Move market history refresh orchestration behind `MarketDataCoordinator`.
3. Move entry candidate scan/ranking behind `CandidateScanner`.
4. Move broker selection and execution-attribution assembly behind `ExecutionCoordinator`.

Each step should preserve current public CLI/dashboard behavior and add tests before deleting old in-file branches.
