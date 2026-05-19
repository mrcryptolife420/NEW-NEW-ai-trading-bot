# Roadmap 28 - Strategy Plugin Lifecycle & Marketplace Readiness

Status: actief
Analyse datum: 2026-05-18
Scope: strategy plugins, registry, validation, sandboxing, lifecycle promotion.

## Analysebasis

Gebaseerd op:

- `src/strategies/pluginInterface.js`
- `src/strategies/strategyRegistry.js`
- `src/strategies/strategyKillSwitch.js`
- `src/research/strategyDsl.js`
- `src/runtime/strategyResearchWorkflow.js`
- `src/runtime/strategyLifecycle.js`
- `src/runtime/strategyRetirementEngine.js`
- `src/runtime/shadowStrategyTournament.js`
- `src/runtime/strategyEvidenceScorecard.js`
- `test/strategyLifecycle.tests.js`
- `test/strategyValidationCostsPortfolioUx.tests.js`
- `test/shadowStrategyTournament.tests.js`

Niet dupliceren: roadmap 08 covered strategy research and optimizer expansion. Deze roadmap gaat over plugin lifecycle packaging, validation and safe marketplace-style onboarding.

## Probleemstelling

Strategies can be researched and governed, but plugin lifecycle needs stronger boundaries:

- plugin manifest schema
- versioning
- capability declaration
- dependency restrictions
- indicator usage declaration
- sandbox validation
- shadow-only default
- kill switch integration
- marketplace metadata

## Doel

Maak strategy plugins safely installable, testable and promotable without bypassing core risk.

## Fase 1 - Plugin Manifest

Manifest fields:

- id
- version
- family
- indicators
- supported regimes
- required data sources
- max stage
- risk review status
- tests
- owner

## Fase 2 - Static Validator

Validator checks:

- no unsafe imports
- no direct broker access
- no direct env access
- deterministic output
- declares required features
- includes fixtures

## Fase 3 - Plugin Runtime Wrapper

Wrapper:

- timeout
- deterministic seed
- input schema
- output schema
- error isolation
- telemetry

## Fase 4 - Lifecycle Integration

Stages:

- installed
- shadow
- paper candidate
- paper active
- canary review
- retired

Live promotion remains external/manual.

## Fase 5 - Dashboard / CLI

CLI:

- `node src/cli.js strategy:plugins`
- `node src/cli.js strategy:plugin:validate`

Dashboard:

- plugin catalog
- stage
- failures
- required evidence
- kill switch state

## Nieuwe Features

- Plugin manifest schema.
- Static plugin validator.
- Runtime wrapper.
- Plugin lifecycle board.
- Marketplace metadata generator.

## Tests

Toevoegen:

- plugin with direct broker import is rejected
- missing manifest blocks install
- invalid output schema blocks scoring
- shadow plugin cannot place orders
- kill switch disables plugin
- dashboard summary fallback-safe

Te draaien:

- `npm.cmd test -- --grep=strategy`
- `npm.cmd test -- --grep=plugin`
- `npm.cmd test:no-live-leak`

## Definition of Done

- Strategy plugins have a strict lifecycle.
- Unsafe plugins cannot run.
- Plugin evidence is separate from core strategy evidence.
- Dashboard/CLI show plugin state and blockers.
