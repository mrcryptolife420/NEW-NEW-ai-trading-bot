# Roadmap 26 - Autodocs Runtime Architecture Map

Status: actief
Analyse datum: 2026-05-18
Scope: generated docs, architecture map, module ownership, CLI/API/test coverage docs.

## Analysebasis

Gebaseerd op:

- `src/docs/autoDocsGenerator.js`
- `docs/debug/inventory/*`
- `scripts/generate-debug-inventory.mjs`
- `scripts/analyze-dependencies.mjs`
- `scripts/check-api-route-contracts.mjs`
- `scripts/check-dashboard-dom-contract.mjs`
- `src/cli/commandRegistry.js`
- `src/dashboard/actionRouteContracts.js`
- `test/domainTestRegistry.tests.js`
- `test/roadmapCompletion.tests.js`

Niet dupliceren: roadmap 05 covered codebase consolidation/feature governance. Deze roadmap gaat over living architecture documentation and traceability from modules to tests/routes/CLI.

## Probleemstelling

De codebase groeit snel. Nieuwe modules en tests worden toegevoegd, maar operators/developers hebben behoefte aan:

- current architecture map
- module ownership
- public contracts
- CLI command documentation
- dashboard API docs
- test coverage map
- feature flag map
- roadmap completion evidence

## Doel

Maak autodocs die de actuele runtime architectuur genereren vanuit code en inventory.

## Fase 1 - Architecture Graph

Genereer:

- module graph
- domain grouping
- critical path modules
- side-effect modules
- public exports
- tests per module

Output:

- `generated-docs/architecture-map.json`
- `generated-docs/architecture-map.md`

## Fase 2 - Contract Docs

Genereer docs voor:

- CLI commands
- dashboard GET/POST routes
- action contracts
- env keys
- feature flags
- broker adapters

## Fase 3 - Roadmap Traceability

Voor elke afgeronde roadmap:

- files added
- tests added
- verification commands
- related modules
- remaining risks

## Fase 4 - Operator Quickstart Refresh

Gebruik runtime truth:

- current startup commands
- dashboard URL
- safe profile setup
- stop/start procedure
- troubleshooting top errors

## Fase 5 - CI Check

Check:

- generated docs current
- API route inventory current
- test coverage inventory current
- no stale roadmap references

## Nieuwe Features

- Living architecture map.
- CLI/API contract docs.
- Roadmap traceability report.
- Operator quickstart refresh.
- Docs freshness check.

## Tests

Toevoegen:

- generator includes new action contracts
- architecture map groups all top-level domains
- stale route inventory fails check
- generated docs redact secrets
- completed roadmaps have traceability metadata

Te draaien:

- `npm.cmd run debug:inventory`
- `npm.cmd run debug:api-contracts`
- `npm.cmd run debug:dashboard-dom`
- `npm.cmd test -- --grep=domain`

## Definition of Done

- Architecture docs can be regenerated deterministically.
- CLI/API/env/test maps stay current.
- New modules cannot silently bypass documentation inventory.
