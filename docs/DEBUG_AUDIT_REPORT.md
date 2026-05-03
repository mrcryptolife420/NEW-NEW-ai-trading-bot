# Debug Audit Report

Generated: 2026-05-03

Scope: safety-first debug, stability and regression audit for the Binance Spot paper/live trading bot. This report records reproducible command results and code-backed findings. No live safety gate was relaxed and no force-unlock path was added.

## Baseline Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm test` | Pass | Full test runner completed with `All checks passed`. Node emitted a non-fatal localstorage-file warning from the runtime environment. |
| `node src/cli.js doctor` | Pass | Paper config valid. Broker can trade in paper/demo terms, but readiness/data quality is degraded by stream-local-book and REST pressure diagnostics. |
| `node src/cli.js status` | Pass | Status payload returned. Readiness was `degraded` with `market_data_rest_pressure_guarded`. |
| `node src/cli.js once` | Pass | Single cycle completed without live orders. Candidates remained blocked by data/model/meta/governance reasons. |
| `node src/cli.js feature:audit` | Pass | Feature audit returned `review_required`: 69 flags, 12 audited features, no P0 runtime crash. Several live-risk-review items remain intentionally non-live-aggressive. |
| `node src/cli.js rest:audit` | Pass | REST audit identifies public kline/book ticker/depth fallbacks and exchange-info cache paths. Hot runtime pressure still needs stream-first operation. |
| `node src/cli.js readmodel:dashboard` | Pass | Read-model dashboard snapshot returned operator recommendations and fallback-safe sections. |

## Findings

| Issue | Command / Evidence | Suspected Cause | Files | Fix Status |
| --- | --- | --- | --- | --- |
| REST pressure and stream fallback degrade readiness | `status` reason `market_data_rest_pressure_guarded`; `doctor` top callers include signed `openOrders`, `myTrades`, kline and book ticker fallbacks | Read-only CLI snapshots do not start authoritative streams, while runtime fallback telemetry still exposes REST pressure. This is operationally valid but must remain visible. | `src/runtime/streamFallbackHealth.js`, `src/runtime/restBudgetGovernor.js`, `src/runtime/tradingBot.js` | Documented; no behavior change in this pass. |
| Local order book depth stream not ready | `doctor/status/once` logs show suppressed local-book prime attempts with `local_book_depth_stream_not_ready` | Stream delta not available during snapshot/single-cycle execution, so depth REST fallback is guarded rather than forced. | `src/market/localOrderBook.js`, `src/runtime/streamCoordinator.js` | Existing guard confirmed; no force REST or force unlock added. |
| Binance announcement feed rate limit / cooldown | `doctor/status` logs show CMS `429` and request-budget cooldown until a later timestamp | External announcement provider is budget-limited. This should not crash or unblock trades. | `src/events/binanceAnnouncementService.js`, `src/news/sourceReliabilityEngine.js` | Existing cooldown works; documented for operator playbook. |
| Exchange-safety block explanations lacked a single pure diagnostic contract | Code had auto-reconcile plan/status, but no explicit `entryBlocked`, stale-blocker suspicion, required evidence and safe next action helper | Operator surfaces could show block state without enough structured evidence requirements for debugging stale blockers. | `src/execution/autoReconcileCoordinator.js` | Fixed with `explainExchangeSafetyBlock()` and regression tests. |
| Repeated local `safeNumber` / ratio patterns existed without a shared testable utility | Audit found many local finite guards; central helper was absent | Future modules risk inconsistent fallback behavior for NaN/Infinity unless shared helpers are available. | `src/utils/safeMath.js` | Fixed with `safeNumber`, `safeRatio`, `clampFinite` and tests. |
| `rg.exe` unavailable in this Windows session | Search failed with `Toegang geweigerd` | Local executable permission issue, not a repo code failure. | N/A | Worked around using PowerShell `Select-String`; documented. |

## Safety Invariants Checked

- Exchange safety was not disabled.
- No force unlock was added.
- Manual review, reconcile-required positions, critical alerts and unresolved execution intents remain entry blockers.
- Paper mode still cannot relax hard exchange-safety blockers.
- Multi-position healthy state remains governed by configured limits, not hardcoded single-position assumptions.
- Tests did not place real Binance orders.

## New Regression Coverage

- Exchange-safety explanation detects stale blockers only when no positions, critical alerts, unresolved intents or explicit blocking evidence remain.
- Exchange-safety explanation reports required evidence and safe next action for critical alerts, unresolved intents and reconcile-required positions.
- Safe math helpers keep missing, zero-denominator and extreme values finite.

## Remaining Operational Risks

- The bot remains operationally degraded when public/private streams are not authoritative and local book data is unavailable.
- REST pressure can still rise during CLI diagnostics because they collect exchange truth and market snapshots; critical reconcile REST remains allowed by design.
- Binance announcement provider cooldown can reduce news/event freshness; current behavior degrades diagnostics instead of crashing.
- Current blockers in paper cycles are mostly data quality, meta gate and model confidence; those should be reviewed via replay/evidence rather than threshold tuning.
