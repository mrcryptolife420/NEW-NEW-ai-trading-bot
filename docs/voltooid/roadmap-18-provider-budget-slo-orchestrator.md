# Roadmap 18 - Provider Budget SLO Orchestrator

Status: actief
Analyse datum: 2026-05-18
Scope: request budgets, external feed registry, provider cooldowns, SLOs, degradation planning.

## Analysebasis

Gebaseerd op:

- `src/utils/requestBudget.js`
- `src/runtime/externalFeedRegistry.js`
- `src/runtime/apiDegradationPlanner.js`
- `src/runtime/restBudgetGovernor.js`
- `src/runtime/restBanPause.js`
- `src/runtime/streamHealthEvidence.js`
- `src/market/marketProviderHub.js`
- `src/events/binanceAnnouncementService.js`
- `src/market/marketSentimentService.js`
- `src/market/volatilityService.js`
- `src/news/newsService.js`
- `test/apiDegradationPlanner.tests.js`
- `test/marketProviderHub.tests.js`
- `test/marketProviders.tests.js`
- `test/streamHealthEvidence.tests.js`

Niet dupliceren: roadmap 06 in `docs/voltooid` heeft provider resilience afgerond. Deze roadmap gaat specifiek over cross-provider SLO orchestration, shared request budgets en operator-facing cooldown plans.

## Probleemstelling

Providers hebben eigen failure/cooldown gedrag. Zonder globale budget-orchestratie kunnen problemen ontstaan:

- een non-critical feed verbruikt budget dat core market data nodig heeft
- cooldown warnings worden per symbool herhaald
- dashboard toont provider degraded maar niet wat de bot daarom doet
- REST pressure, stream freshness en external feed health zijn verspreid
- operator ziet niet wanneer budget herstelt

## Doel

Maak een SLO-orchestrator die provider budget, cooldown, priority en degradation policy centraal beheert.

## Fase 1 - Provider Priority Registry

Maak registry:

- provider id
- group
- criticality
- trading impact
- freshness SLO
- cooldown policy
- fallback policy
- allowed modes
- request budget class

Nieuwe module:

- `src/runtime/providerSloRegistry.js`

## Fase 2 - Budget Orchestrator

Nieuwe module:

- `src/runtime/providerBudgetOrchestrator.js`

Taken:

- aggregate request budget state
- allocate budget by provider priority
- defer low-priority calls under pressure
- dedupe cooldown logs
- expose next retry windows
- feed api degradation planner

## Fase 3 - Decision Integration

Koppel budget state aan:

- data quality score
- candidate quality quorum
- trading path health
- dashboard snapshot
- risk manager blocker reasons

Belangrijk: missing non-critical providers mogen niet dezelfde severity krijgen als stale price/order data.

## Fase 4 - Operator Visibility

Dashboard:

- provider SLO table
- cooldown countdown
- budget pressure
- deferred providers
- trading impact
- next recovery time

CLI:

- `node src/cli.js provider:slo`
- `node src/cli.js request-budget`

## Fase 5 - Alerting

Voeg alerts toe:

- core provider SLO breach
- repeated cooldown loop
- non-critical provider deferred
- stream primary lost
- REST pressure near limit

## Nieuwe Features

- Provider SLO registry.
- Shared budget allocation.
- Cooldown countdown dashboard.
- Provider impact classifier.
- Alert rules for SLO breach.

## Tests

Toevoegen:

- core provider gets priority over sentiment/news
- cooldown dedupe works across symbols
- non-critical provider deferral does not hard-block paper setup
- core stale price data blocks entry
- dashboard normalizer remains fallback-safe
- alert fires on SLO breach

Te draaien:

- `npm.cmd test -- --grep=request-budget`
- `npm.cmd test -- --grep=api degradation`
- `npm.cmd test -- --grep=provider`
- `npm.cmd test -- --grep=stream`
- `npm.cmd run status`

## Definition of Done

- Provider budget pressure is centrally visible.
- Critical and non-critical feed failures are separated.
- Cooldowns show next recovery time.
- Budget pressure produces explicit blocker/degradation reasons.
- Repeated provider warning storms are prevented by design.
