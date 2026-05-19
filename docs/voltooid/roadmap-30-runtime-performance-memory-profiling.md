# Roadmap 30 - Runtime Performance, Memory & Long-Run Profiling

Status: actief
Analyse datum: 2026-05-18
Scope: long-run stability, memory pressure, CPU hotspots, latency budgets, dashboard payload size.

## Analysebasis

Gebaseerd op:

- `src/runtime/latencyProfiler.js`
- `src/ops/performanceBudget.js`
- `src/runtime/incrementalFeatureCache.js`
- `src/runtime/marketScanner.js`
- `src/runtime/dashboardSnapshotBuilder.js`
- `src/runtime/reportBuilder.js`
- `src/dashboard/public/app.js`
- `src/runtime/tradingBot.js`
- `test/performanceTuning.tests.js`
- `test/latencyProfiler.tests.js`
- `test/dashboardSnapshot.tests.js`

Niet dupliceren: roadmap 17 covered universe scan performance budget. Deze roadmap focuses on whole-process long-run performance, memory and payload budgets.

## Probleemstelling

Long-running bots can degrade because of:

- growing in-memory histories
- large dashboard payloads
- repeated snapshot rebuilds
- unbounded event histories
- heavy report generation
- feature cache churn
- slow cycle stages
- hidden memory leaks

## Doel

Maak runtime performance measurable over long runs and enforce budgets for memory, latency and payload size.

## Fase 1 - Runtime Performance Snapshot

Nieuwe module:

- `src/runtime/runtimePerformanceSnapshot.js`

Fields:

- heap used
- rss
- event history sizes
- dashboard payload bytes
- report generation ms
- cycle stage p95
- feature cache hit rate
- stream buffer sizes

## Fase 2 - Budget Enforcement

Budgets:

- max dashboard payload bytes
- max report build ms
- max cycle p95
- max event history length
- max replay pack in memory
- max cache churn

Budget breach should degrade observability, not trade safety.

## Fase 3 - Long-Run Profiler

CLI:

- `node src/cli.js perf:profile --cycles 100`
- `node src/cli.js perf:snapshot`

Profiler records:

- memory trend
- slow stage trend
- payload growth
- provider latency

## Fase 4 - Dashboard Performance Panel

Show:

- cycle p95
- memory trend
- payload size
- slowest stage
- cache hit/miss
- warning if dashboard payload stale or oversized

## Fase 5 - Guarded Cleanup

Implement bounded histories:

- event bus history
- runtime alert history
- decision snapshot compacting
- report section limits
- cache TTLs

No cleanup may remove live audit evidence.

## Nieuwe Features

- Runtime performance snapshot.
- Long-run profiler CLI.
- Dashboard payload budget.
- Memory trend report.
- Bounded history enforcement.

## Tests

Toevoegen:

- performance snapshot is finite and redaction-safe
- oversized dashboard payload flagged
- bounded history keeps newest critical events
- profiler produces deterministic summary on fixture cycles
- cleanup does not remove audit/live evidence

Te draaien:

- `npm.cmd test -- --grep=performance`
- `npm.cmd test -- --grep=latency`
- `npm.cmd test -- --grep=dashboard`
- `npm.cmd run smoke:dashboard`

## Definition of Done

- Runtime memory and latency are observable.
- Long-run profiler can detect growth.
- Dashboard payload budgets are enforced.
- Bounded cleanup preserves safety/audit evidence.
