# Roadmap 17 - Universe Scan Performance & Scalability Budget

Status: actief
Analyse datum: 2026-05-18
Scope: market scanner, universe selector, watchlist coverage, hot symbol lanes, incremental feature cache.

## Analysebasis

Gebaseerd op:

- `src/runtime/marketScanner.js`
- `src/runtime/universeSelector.js`
- `src/runtime/universeScorer.js`
- `src/runtime/scanPlanner.js`
- `src/runtime/watchlistResolver.js`
- `src/runtime/watchlistCoverageBalancer.js`
- `src/runtime/hotSymbolLane.js`
- `src/runtime/incrementalFeatureCache.js`
- `src/runtime/latencyProfiler.js`
- `src/runtime/performanceBudget.js`
- `src/market/marketProviderHub.js`
- `src/binance/client.js`
- `test/scopedLearningAndUniverse.tests.js`
- `test/watchlistCoverageBalancer.tests.js`
- `test/latencyProfiler.tests.js`
- `test/performanceTuning.tests.js`

Niet dupliceren: roadmap 06 in `docs/voltooid` ging over market data provider resilience. Deze roadmap gaat over universe-scan schaalbaarheid, latency budgets en CPU/API efficientie.

## Probleemstelling

De scanner kan honderden USDT-symbolen selecteren. Dat geeft risico's:

- te veel REST druk
- te veel feature recomputation
- vertraagde cycles
- stale top candidates
- dashboard ziet oude candidates als actueel
- request budget cooldown cascades
- hot symbols krijgen niet genoeg prioriteit

## Doel

Maak universe scanning budget-aware, incremental en meetbaar zodat de bot snel blijft zonder blind symbolen te negeren.

## Fase 1 - Scan Budget Model

Definieer budgets:

- max symbols per cycle
- max REST weight per scan
- max feature compute ms
- max stale candidate age
- max provider failures per cycle
- min coverage per watchlist group

Nieuwe module:

- `src/runtime/scanPerformanceBudget.js`

## Fase 2 - Tiered Universe Planner

Verdeel symbols in tiers:

- open positions
- near-threshold
- recently active
- high liquidity
- watchlist mandated
- exploration
- cooldown/deprioritized

Planner moet output geven:

- selected symbols
- skipped symbols
- reason per skip
- expected request cost
- fallback if budget exceeded

## Fase 3 - Incremental Feature Cache Expansion

Breid cache uit met:

- per feature group TTL
- dependency invalidation
- symbol-level freshness
- cache hit/miss counters
- stale-but-usable classification

## Fase 4 - Latency Guardrails

Koppel `latencyProfiler` aan scanner:

- detect slow provider
- cap concurrent calls
- degrade non-critical context
- preserve core trading candidates
- emit dashboard warning if cycle exceeds budget

## Fase 5 - Dashboard & CLI

Nieuwe views:

- scan budget usage
- symbol tier counts
- skipped reason histogram
- cache hit rate
- stale candidates
- API weight forecast

CLI:

- `node src/cli.js scan:plan`
- `node src/cli.js scan:budget`

## Nieuwe Features

- Tiered universe planner.
- Scan budget forecast.
- Incremental feature dependency invalidation.
- Symbol skip reasons.
- Performance dashboard for scanner.

## Tests

Toevoegen:

- planner prioritizes open positions and near-threshold symbols
- budget cap produces explicit skip reasons
- cache freshness prevents stale candidate promotion
- provider slowdown degrades non-critical context only
- dashboard fallback safe when scan stats missing
- no live safety shortcut under budget pressure

Te draaien:

- `npm.cmd test -- --grep=universe`
- `npm.cmd test -- --grep=watchlist`
- `npm.cmd test -- --grep=latency`
- `npm.cmd test -- --grep=performance`
- `npm.cmd run status`

## Definition of Done

- Scanner has deterministic budget output.
- Every skipped symbol has an explainable reason.
- Cycle latency and API weight pressure are visible.
- Hot symbols and positions keep priority.
- Performance regressions are test-covered.
