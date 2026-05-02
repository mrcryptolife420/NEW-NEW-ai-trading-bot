# Feature Completion Plan

This plan is generated from the `feature:audit` contract and should be updated only from audit findings, not from new trading ideas.

Run:

```bash
node src/cli.js feature:audit
```

## Priority model

- `P0`: broken import, runtime crash risk, or unsafe inconsistency.
- `P1`: config exists but behavior/runtime diagnostics are missing.
- `P2`: module exists but is not wired into the intended runtime path.
- `P3`: behavior exists, but tests, docs, dashboard, report, or read-model visibility are incomplete.
- `P4`: review-only or nice-to-have work.

Current `feature:audit` source of truth reports no P0 feature-completion items.

## Batch 1: audit visibility only

Batch 1 must not change trading behavior. It only enriches `feature:audit` with:

- `priority`
- `priorityReasons`
- `completionPlan`
- `filesToChange`
- `testsToAdd`
- `missingDashboardFields`
- `liveBehaviorPolicy`
- `configStatus`

Acceptance:

- `npm test` passes.
- `node src/cli.js feature:audit` reports completion metadata for each audited feature.
- `node src/cli.js doctor` may report operational exchange/reconcile issues, but those are not feature-completion failures.

## Audit-derived completion table

| Feature | Priority | Current audit state | Safe next action |
| --- | --- | --- | --- |
| `net_edge_gate` | P1 | module exists but runtime callsite/dashboard are missing | Wire into diagnostics first; future live use may only block or add caution. |
| `failed_breakout_detector` | P1 | central detector exists but is not consumed | Replace scattered diagnostics with central detector before any gating change. |
| `funding_oi_matrix` | P1 | pure module exists but is not fed into market features/risk | Add market-context diagnostics with degraded-provider fallback. |
| `spot_futures_divergence` | P1 | module support exists but runtime context is missing | Expose divergence in market diagnostics first. |
| `leadership_context` | P1 | pure module exists but scanner/risk do not consume it | Feed BTC/ETH leadership into diagnostics before ranking/risk use. |
| `indicator_feature_registry` | P3 | computed/tested, dashboard missing | Show indicator pack, top drivers, and missing/stale feature quality. |
| `dynamic_exit_levels` | P3 | runtime/tests exist, dashboard and live review missing | Show open-position dynamic stop/target suggestions. |
| `exit_intelligence_v2` | P3 | runtime/tests exist, dashboard and live review missing | Show exit recommendation and component scores. |
| `trade_quality_analytics` | P3 | analytics exist, dashboard visibility missing | Show MFE/MAE/exit-efficiency summary in report/dashboard. |
| `sector_rotation` | P3 | runtime reference exists, dashboard visibility missing | Show sector score and flag state in market diagnostics. |
| `breakout_retest` | P4 | paper-only strategy exists, live review needed | Keep paper-only default; document live review before any live enablement. |
| `walk_forward_backtest` | complete | CLI/docs/tests are present | Regression protection only. |

## Later batches

1. Dashboard/read-model visibility for all P3 items.
2. Diagnostics-only runtime wiring for P1/P2 items behind existing flags.
3. Paper/shadow-only behavior after replay evidence.
4. Live review for stricter-only changes; no live threshold relief or safety weakening.
