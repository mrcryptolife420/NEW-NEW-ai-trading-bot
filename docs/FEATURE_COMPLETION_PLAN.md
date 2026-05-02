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

1. Diagnostics/read-model refinement for remaining audit-only flags and generic config-only items.
2. Paper/shadow-only behavior after replay evidence.
3. Live review for stricter-only changes; no live threshold relief or safety weakening.

## Batch 3: diagnostics-only runtime wiring

Batch 3 wires existing P1/P2 modules into candidate and dashboard diagnostics only:

- `net_edge_gate`
- `failed_breakout_detector`
- `funding_oi_matrix`
- `spot_futures_divergence`
- `leadership_context`

The contract is intentionally read-only:

- `runtimeApplied` is always `false`.
- `diagnosticOnly` is always `true`.
- net-edge output exposes `wouldBlock`, but keeps `block: false` in the dashboard diagnostic wrapper.
- no entry permissioning, ranking, sizing, execution style, thresholds, or live safety behavior changes.

Future behavior changes must start paper/shadow-only unless the live change is strictly more conservative and separately reviewed.

Status after Batch 3:

- `failed_breakout_detector`, `funding_oi_matrix`, `spot_futures_divergence`, and `leadership_context` are complete by the audit contract for diagnostics visibility.
- `net_edge_gate` is diagnostically wired, but remains `live_risk_review_needed` before any live blocking behavior can be treated as active.
- Remaining `missing_dashboard` items are P3/P4 surfaces such as indicator registry detail, dynamic exit suggestions, exit intelligence v2, trade quality analytics, and sector rotation.

## Batch 4: remaining P3 dashboard visibility

Batch 4 exposes the remaining P3 surfaces without changing trading behavior:

- `indicator_feature_registry`: candidate cards now carry `indicatorRegistry`, `topPositiveFeatures`, `topNegativeFeatures`, `missingIndicatorFeatures`, and `indicatorPackUsed`.
- `dynamic_exit_levels`: open-position cards now carry `dynamicExitLevels`, `suggestedStopPct`, and `suggestedTakeProfitPct`.
- `exit_intelligence_v2`: open-position cards now carry `exitIntelligenceV2`, `exitQuality`, and `currentExitRecommendation`.
- `trade_quality_analytics`: recent-trade cards and report snapshots now carry MFE, MAE, exit efficiency, give-back, and `tradeQualitySummary`.
- `sector_rotation`: decision market context now carries `sectorRotation`, `sectorRotationScore`, and `sectorRotationState`.

The contract remains read-only:

- no entry permissioning changes
- no threshold changes
- no sizing changes
- no execution style changes
- no live safety changes

Status after Batch 4:

- `feature:audit` reports no `missing_dashboard` classifications for the audited feature-completion targets.
- Remaining review items are live-risk-review or broader config/test hygiene, not missing operator visibility for the audited features.

## Batch 5: feature-flag hygiene

Batch 5 keeps the audit source-of-truth cleaner without changing trading behavior:

- document missing env keys for existing runtime flags: `BASELINE_CORE_ENABLED`, `ENABLE_SEQUENCE_CHALLENGER`, and `HISTORY_CACHE_ENABLED`
- add audit-visible tests for runtime diagnostic flags that already have implementation callsites
- keep known config-only/alias flags visible for future cleanup instead of silently treating them as active behavior
- classify legacy umbrella flags as `documented_config_only` instead of treating them like broken wiring

The contract remains non-behavioral:

- no risk or strategy gate changes
- no live behavior changes
- no paper threshold changes
- no request/execution behavior changes

Known `documented_config_only` flags after this batch:

- `enableCvdConfirmation`
- `enableLiquidationMagnetContext`
- `enablePriceActionStructure`
- `enableStrategyRouter`
- `enableTrailingProtection`

These flags stay operator-visible with notes and `nextSafeAction`; future cleanup should either wire them to a real module boundary or deprecate them through a config migration.
