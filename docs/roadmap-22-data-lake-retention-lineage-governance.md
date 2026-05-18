# Roadmap 22 - Data Lake Retention, Lineage & Governance

Status: actief
Analyse datum: 2026-05-18
Scope: storage, data lake, read model, journal retention, lineage, archive policy.

## Analysebasis

Gebaseerd op:

- `src/storage/dataLake.js`
- `src/storage/stateStore.js`
- `src/storage/readModelStore.js`
- `src/storage/marketHistoryStore.js`
- `src/storage/recorderIntegrityAudit.js`
- `src/storage/storageAudit.js`
- `src/storage/storageTruthMatrix.js`
- `src/runtime/dataRecorder.js`
- `src/runtime/persistenceCoordinator.js`
- `src/runtime/decisionInputLineage.js`
- `src/runtime/tradeAttribution.js`
- `test/storageRecovery.tests.js`
- `test/dataIntegrityMaintenance.tests.js`
- `test/readModelAnalyticsQueries.tests.js`
- `test/decisionInputLineage.tests.js`

Niet dupliceren: roadmap 04 in `docs/voltooid/` ging over data/storage/replay observability. Deze roadmap gaat over lifecycle governance van opgeslagen data: retentie, lineage, archivering, pruning en privacy-safe export.

## Probleemstelling

De bot bouwt veel lokale data op:

- journals
- decision snapshots
- readmodel snapshots
- market history
- replay packs
- audit logs
- learning evidence
- generated reports

Zonder expliciete retentie en lineage kunnen opslagkosten, stale evidence, privacy risks en replay pollution toenemen.

## Doel

Maak een data governance laag die bepaalt wat bewaard, gecomprimeerd, geanonimiseerd, gearchiveerd of verwijderd mag worden.

## Fase 1 - Dataset Catalog

Maak een catalogus:

- dataset id
- storage path
- schema version
- producer module
- consumer modules
- retention class
- privacy class
- replay eligibility
- live evidence eligibility

Nieuwe module:

- `src/storage/dataGovernanceCatalog.js`

## Fase 2 - Retention Policy Engine

Maak policies:

- hot runtime data
- recent paper evidence
- live audit evidence
- replay fixtures
- generated reports
- stale readmodel caches
- raw provider payloads

Actions:

- keep
- compact
- archive
- sanitize
- delete after confirmation

Geen automatische delete zonder dry-run en operator review.

## Fase 3 - Lineage Graph

Koppel decision lineage aan storage:

- which source created this decision
- which dataset version was used
- which model/config hash was used
- whether evidence is still valid
- whether replay can reproduce it

## Fase 4 - CLI & Dashboard

CLI:

- `node src/cli.js data:catalog`
- `node src/cli.js data:retention --dry-run`
- `node src/cli.js data:lineage --trade <id>`

Dashboard:

- storage health
- retention actions pending
- stale evidence warnings
- replay eligibility
- privacy risk summary

## Fase 5 - Migration Guard

Before storage migration:

- snapshot schema versions
- dry-run migration
- verify readmodel rebuild
- verify journal load
- verify no secrets in export

## Nieuwe Features

- Data governance catalog.
- Retention dry-run planner.
- Trade/decision lineage graph.
- Storage privacy risk report.
- Safe archive workflow.

## Tests

Toevoegen:

- retention dry-run never deletes directly
- live audit data gets longest retention
- stale readmodel cache can be rebuilt
- replay-ineligible data is labeled clearly
- lineage includes config/model hash
- privacy sanitizer runs before export

Te draaien:

- `npm.cmd test -- --grep=storage`
- `npm.cmd test -- --grep=lineage`
- `npm.cmd test -- --grep=readmodel`
- `npm.cmd run debug:secrets`

## Definition of Done

- Every storage dataset has retention and privacy classification.
- Operator can run dry-run retention safely.
- Lineage links trades/decisions to data/model/config versions.
- No storage cleanup can silently remove live audit evidence.
