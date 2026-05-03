# Debug Audit Report

Generated: 2026-05-03

Last baseline refresh: 2026-05-03T15:22Z

Scope: safety-first debug, stability and regression audit for the Binance Spot paper/live trading bot. This report records reproducible command results and code-backed findings. No live safety gate was relaxed and no force-unlock path was added.

## Baseline Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm test` | Pass | Full test runner completed with `All checks passed` in 188.4s. |
| `node src/cli.js doctor` | Pass | Completed in 79.5s. Paper config remains usable for diagnostics; output still shows market/universe data collection and stream-local-book dependency. |
| `node src/cli.js status` | Pass | Completed in 55.8s. Readiness was `blocked` with reasons `exchange_safety_blocked` and `market_data_rest_pressure_guarded`. |
| `node src/cli.js once` | Pass | Completed in 66.5s. Single paper cycle completed without live orders; candidates remained rejected, dominated by `exchange_safety_blocked`, meta/model confidence, portfolio drawdown and range-grid quarantine reasons. |
| `node src/cli.js readmodel:dashboard` | Pass | Completed in 0.5s. Read-model dashboard command returned without crashing. |
| `node src/cli.js feature:audit` | Pass | Completed in 2.2s. Feature audit returned `review_required`; current summary showed 66 complete items and 5 documented config-only placeholders. |
| `node src/cli.js rest:audit` | Pass | Completed in 0.6s. REST audit returned `stream_first`; hot callers include guarded local order book depth snapshot and open-order reconcile REST with user-stream replacement recommended. |

## Findings

| Issue | Command / Evidence | Suspected Cause | Files | Fix Status |
| --- | --- | --- | --- | --- |
| REST pressure and stream fallback degrade readiness | `status` reason `market_data_rest_pressure_guarded`; `doctor` top callers include signed `openOrders`, `myTrades`, kline and book ticker fallbacks | Read-only CLI snapshots do not start authoritative streams, while runtime fallback telemetry still exposes REST pressure. This is operationally valid but must remain visible. | `src/runtime/streamFallbackHealth.js`, `src/runtime/restBudgetGovernor.js`, `src/runtime/tradingBot.js` | Documented; no behavior change in this pass. |
| Local order book depth stream not ready | `doctor/status/once` logs show suppressed local-book prime attempts with `local_book_depth_stream_not_ready` | Stream delta not available during snapshot/single-cycle execution, so depth REST fallback is guarded rather than forced. | `src/market/localOrderBook.js`, `src/runtime/streamCoordinator.js` | Existing guard confirmed; no force REST or force unlock added. |
| Binance announcement feed rate limit / cooldown | `doctor/status` logs show CMS `429` and request-budget cooldown until a later timestamp | External announcement provider is budget-limited. This should not crash or unblock trades. | `src/events/binanceAnnouncementService.js`, `src/news/sourceReliabilityEngine.js` | Existing cooldown works; documented for operator playbook. |
| Exchange-safety block explanations lacked a single pure diagnostic contract | Code had auto-reconcile plan/status, but no explicit `entryBlocked`, stale-blocker suspicion, required evidence and safe next action helper | Operator surfaces could show block state without enough structured evidence requirements for debugging stale blockers. | `src/execution/autoReconcileCoordinator.js` | Fixed with `explainExchangeSafetyBlock()` and regression tests. |
| Repeated local `safeNumber` / ratio patterns existed without a shared testable utility | Audit found many local finite guards; central helper was absent | Future modules risk inconsistent fallback behavior for NaN/Infinity unless shared helpers are available. | `src/utils/safeMath.js` | Fixed with `safeNumber`, `safeRatio`, `clampFinite` and tests. |
| `rg.exe` unavailable in this Windows session | Search failed with `Toegang geweigerd` | Local executable permission issue, not a repo code failure. | N/A | Worked around using PowerShell `Select-String`; documented. |

## Current Known Issues

- `exchange_safety_blocked` remains the dominant entry blocker. This is intentional while unresolved exchange-safety evidence or execution-intent concerns remain.
- `market_data_rest_pressure_guarded` remains visible in status. REST audit confirms stream-first architecture, but hot REST callers still need operational attention.
- `once` produced candidate rejections rather than trades. This is expected under current exchange-safety and model/meta blockers; no thresholds were changed to force trades.
- `feature:audit` remains `review_required`, not failed. Several roadmap items are intentionally diagnostics/config-only or live-risk-review gated.

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
