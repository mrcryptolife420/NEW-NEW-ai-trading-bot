# Debug Playbook

This playbook is for operator-safe diagnosis. It does not replace exchange-safety, reconcile or live-readiness rules.

## Bot Opens No Trades

1. Run `node src/cli.js status`.
2. Check `readiness.status`, `can-it-trade` text, dominant blocker and `decisionFunnelSummary`.
3. If blockers are `model_confidence_too_low`, `meta_gate_reject`, `meta_followthrough_caution` or `quality_quorum_degraded`, inspect candidate evidence and replay/near-miss data before touching thresholds.
4. Do not weaken hard safety blockers to force trades.

## Exchange Safety Blocked

1. Run `node src/cli.js exchange-safety:status`.
2. Run `node src/cli.js reconcile:plan`.
3. Confirm the plan shows fresh evidence: account snapshot, open orders or user-stream truth, recent trades and protection status.
4. If the block is stale-suspected, only `reconcile:run` may clear safe auto-fix actions; there is no force unlock.
5. If evidence conflicts, keep manual review.

## Reconcile Required

1. Use `node src/cli.js reconcile:plan`.
2. Safe auto-actions are limited to clearing local reconcile flags with matching account/protection evidence, marking confirmed-flat local positions, and rebuilding protection with valid geometry.
3. Manual review remains required for REST/user-stream conflict, quantity mismatch above tolerance, unknown order status, invalid OCO geometry or unresolved intents.

## Dashboard Shows Stale Data

1. Compare `node src/cli.js status` with `node src/cli.js readmodel:dashboard`.
2. Check snapshot age, portfolio freshness and recorder/readmodel summaries.
3. Run `node src/cli.js trading-path:debug` to separate feed freshness, read-model freshness, dashboard freshness and frontend polling.
4. If CLI status is fresh but dashboard is stale, inspect dashboard server polling or read-model refresh hooks before changing trading logic.

## Trading Path Functionally Inactive

1. Run `node src/cli.js trading-path:debug`.
2. Check `health.status`, `blockingReasons`, `staleSources`, `feedFreshness`, `readmodelFreshness` and `dashboardFreshness`.
3. If `feed_aggregation_stale` or `no_market_snapshots_ready` appears, run `node src/cli.js once` and inspect `marketSnapshotFlowDebug`.
4. If `readmodel_snapshot_stale` appears, run `node src/cli.js readmodel:rebuild` and re-check `readmodel:dashboard`.
5. If `dashboard_polling_error` or `dashboard_polling_stale` appears, check the dashboard server endpoint and frontend polling state.
6. If `exchange_safety_blocked` appears, use `exchange-safety:status` and `reconcile:plan`; do not force unlock.
7. A fresh trading path does not mean entries are allowed. Risk, exchange safety, manual review, unresolved intents and model confidence can still block correctly.

## Market Snapshots Missing

1. Run `node src/cli.js trading-path:debug`.
2. Inspect `marketSnapshotFlowDebug.snapshotsPersisted`, `snapshotsReady`, `candidatesWithSnapshots`, `missingSymbols`, `degradedSymbols` and `prefetchFailures`.
3. If `snapshotsPersisted` is `0` after `node src/cli.js once`, trace `scanCandidates` and `getMarketSnapshot`.
4. If snapshots are persisted but degraded, inspect stream/local-book readiness and symbol-specific prefetch failures.
5. Do not bypass stale-data entry blockers; fresh snapshots are evidence, not trade approval.

## Backtest Gives NaN Or Impossible Metrics

1. Run the affected backtest command and inspect `backtestIntegrity`.
2. Missing `configHash`, `dataHash`, impossible timestamps, missing feature timestamps and NaN trade metrics should produce warnings/degraded status, not silent success.
3. Empty datasets should return finite metrics with sample-size warnings.

## Paper / Live Mismatch

1. Run `node src/cli.js doctor`.
2. Inspect paper/live parity, fee attribution, execution drag and broker mode fields.
3. Do not promote paper-only evidence to live without promotion dossier, live readiness and anti-overfit review.

## Multi-Position Does Not Work

1. Check `MAX_OPEN_POSITIONS`, `MAX_TOTAL_EXPOSURE_FRACTION`, `MAX_POSITION_FRACTION`, portfolio crowding and post-reconcile probation state.
2. Same-symbol duplicates should remain blocked.
3. Healthy state should allow multiple symbols up to configured limits.
4. Post-reconcile probation may reduce slots but must not permanently force max one position.

## Config Fails

1. Run `node src/cli.js doctor`.
2. Live mode must fail without acknowledgement, credentials and exchange protection.
3. Paper mode should remain usable without live credentials.
4. Do not make defaults more aggressive to bypass validation.

## REST Budget Exceeded

1. Run `node src/cli.js rest:audit` and inspect request-weight diagnostics in `doctor/status`.
2. Public market data should prefer streams/local book; depth REST is startup/fallback only.
3. Private order/trade REST should be startup/reconcile/sanity only; user-data stream should be the live truth source.
4. If Binance returns `429` or `418`, honor backoff/ban state and do not retry hot loops.

## Local Search Tool Fails

If `rg` returns `Toegang geweigerd` on Windows, use:

```powershell
Get-ChildItem -Path src,test,docs -Recurse -Include *.js,*.md |
  Select-String -Pattern 'your_pattern'
```
