# Roadmap 27 - Observability SLO & Alert Routing

Status: actief
Analyse datum: 2026-05-18
Scope: metrics, alert routing, reliability targets, SLO tracking, operator notification policy.

## Analysebasis

Gebaseerd op:

- `src/ops/metricsExporter.js`
- `src/ops/reliabilityTargets.js`
- `src/ops/notificationRouter.js`
- `src/ops/performanceBudget.js`
- `src/runtime/operatorAlertEngine.js`
- `src/runtime/operatorAlertDispatcher.js`
- `src/runtime/runtimeLiveness.js`
- `src/runtime/tradingPathHealth.js`
- `src/runtime/providerBudgetOrchestrator.js`
- `src/runtime/apiDegradationPlanner.js`
- `test/operatorActionQueue.tests.js`
- `test/tradingPathHealth.tests.js`
- `test/apiDegradationPlanner.tests.js`

Niet dupliceren: roadmaps 01, 18 and 20 covered observability, provider budgets and local security. Deze roadmap focuses on SLO definitions, alert routing policy and measurable reliability targets.

## Probleemstelling

There are metrics and alerts, but SLOs can become clearer:

- cycle freshness SLO
- dashboard freshness SLO
- provider freshness SLO
- decision generation SLO
- paper execution evidence SLO
- live protection SLO
- storage persistence SLO
- alert routing severity rules

## Doel

Maak SLOs first-class runtime objects with alert routing, burn-rate and operator actions.

## Fase 1 - SLO Registry

Nieuwe module:

- `src/ops/sloRegistry.js`

SLOs:

- cycle_completed_recently
- dashboard_snapshot_fresh
- provider_core_ready
- readmodel_rebuild_recent
- paper_execution_evidence
- live_protection_healthy
- storage_persistence_success

## Fase 2 - SLO Evaluator

Input:

- snapshot
- runtime liveness
- provider budget plan
- storage audit
- alert history

Output:

- status
- error budget
- burn rate
- affected subsystem
- operator action

## Fase 3 - Alert Routing Policy

Route by:

- severity
- subsystem
- mode paper/live
- repeated alert suppression
- requires acknowledgement
- safe notification channel

## Fase 4 - Metrics Export

Prometheus metrics:

- `bot_slo_status`
- `bot_slo_burn_rate`
- `bot_alerts_active`
- `bot_operator_ack_required`

No secrets or high-cardinality labels.

## Fase 5 - Dashboard

Dashboard panel:

- SLO summary
- active incidents
- burn-rate trend
- suppressed alerts
- next operator action

## Nieuwe Features

- SLO registry.
- Burn-rate evaluator.
- Alert routing policy.
- SLO metrics.
- Dashboard SLO board.

## Tests

Toevoegen:

- stale cycle breaches SLO
- live protection breach is critical in live
- repeated low-priority alert is suppressed
- metrics exporter avoids secrets/high-cardinality payload
- paper mode does not page for live-only SLO

Te draaien:

- `npm.cmd test -- --grep=alert`
- `npm.cmd test -- --grep=metrics`
- `npm.cmd test -- --grep=trading path`
- `npm.cmd test -- --grep=api degradation`

## Definition of Done

- SLOs are explicit and test-covered.
- Alerts route based on mode and subsystem.
- Metrics expose SLO state safely.
- Operator dashboard shows reliability actions.
