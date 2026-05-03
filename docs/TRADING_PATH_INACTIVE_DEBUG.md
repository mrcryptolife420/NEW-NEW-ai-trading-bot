# Trading Path Inactive Debug

Generated: 2026-05-03

This note documents the safety-first debug pass for the dashboard/status message:

`Bot draait maar trading path blijft functioneel inactief | Controleer dashboard snapshot refresh, feed aggregation en frontend polling.`

No live safety gate was relaxed, no force-unlock path was added, and no trading threshold was changed.

## Baseline

| Command | Result | Relevant finding |
| --- | --- | --- |
| `npm test` | Pass after patch | Full regression suite completed with `All checks passed`. |
| `node src/cli.js status` | Pass | Runtime was alive, but readiness was degraded by stream/local-book and REST-pressure diagnostics. |
| `node src/cli.js readmodel:dashboard` | Pass | Read-model dashboard payload was available and fallback-safe. |
| `node src/cli.js once` | Pass | One safe paper cycle ran without live orders; exchange-safety recovery-only state could still dominate entries. |
| `node src/cli.js readmodel:rebuild` | Pass | Read-model rebuild completed and dashboard export remained available afterwards. |
| `node src/cli.js doctor` | Pass | Reported operational degradation around market-data stream fallback and guarded REST pressure. |
| `node src/cli.js feature:audit` | Pass | Feature audit remained available; no trading behavior change was needed. |
| `node src/cli.js rest:audit` | Pass | REST pressure diagnostics remained visible. |

## Root Cause

The generic inactivity message was too broad. It did not distinguish between:

- stale or missing scan cycles
- stale feed aggregation
- missing market snapshots
- no decision snapshot
- stale read-model/dashboard snapshot
- frontend polling errors
- exchange-safety/reconcile blockers

This made a running process look like a single opaque dashboard problem even when the actual root was feed, scan, read-model, or exchange-safety state.

## Fix

Added a pure trading-path health contract in `src/runtime/tradingPathHealth.js`:

- `buildTradingPathHealth(...)`
- `buildFeedAggregationSummary(...)`
- `normalizeDashboardFreshness(...)`
- `normalizeFrontendPollingHealth(...)`

The dashboard snapshot now carries:

- `tradingPathHealth.status`
- `tradingPathHealth.blockingReasons`
- `tradingPathHealth.staleSources`
- `tradingPathHealth.nextAction`
- `feedSummary.status`
- `feedSummary.symbolsRequested`
- `feedSummary.symbolsReady`
- `feedSummary.missingSymbols`
- `dashboardFreshness`
- frontend polling metadata

The inactivity operator card now prefers the specific health blocker/action before falling back to the older generic text.

## New CLI

Run:

```powershell
node src/cli.js trading-path:debug
```

This command is read-only and does not place orders or mutate exchange state. It reports:

- bot running state
- last cycle timestamp and age
- feed freshness
- read-model freshness
- dashboard freshness
- top decision count
- entry blocker reasons
- stale sources
- next safe action

## Safety Behavior

- Stale or missing feed data still blocks entries.
- Missing market snapshots still blocks entries.
- Missing decision snapshots are visible and do not imply trade permission.
- Exchange safety remains dominant over dashboard/read-model freshness.
- A stale dashboard alone does not claim live entry permission.
- A fresh feed/read-model/dashboard only clears the inactivity explanation; it does not bypass risk, exchange safety, reconcile, manual review, unresolved intents, or model confidence blockers.

## Operator Next Actions

| Health reason | Safe next action |
| --- | --- |
| `feed_aggregation_stale` | Run `node src/cli.js once`, then inspect stream/feed source health. |
| `no_market_snapshots_ready` | Check stream/local book readiness and REST budget guards. |
| `no_decision_snapshot_created` | Inspect scan cycle and candidate generation. |
| `readmodel_snapshot_stale` | Run `node src/cli.js readmodel:rebuild`. |
| `dashboard_polling_error` | Restart/check dashboard frontend polling and endpoint reachability. |
| `dashboard_polling_stale` | Check dashboard refresh interval and last successful snapshot. |
| `exchange_safety_blocked` | Run `node src/cli.js exchange-safety:status` and `node src/cli.js reconcile:plan`. |
