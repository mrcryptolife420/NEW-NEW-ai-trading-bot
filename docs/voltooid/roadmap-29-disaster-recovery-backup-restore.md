# Roadmap 29 - Disaster Recovery, Backup & Restore

Status: actief
Analyse datum: 2026-05-18
Scope: backup manager, state recovery, restore drills, runtime corruption recovery.

## Analysebasis

Gebaseerd op:

- `src/runtime/stateBackupManager.js`
- `src/storage/stateStore.js`
- `src/storage/marketHistoryStore.js`
- `src/storage/storageAudit.js`
- `src/storage/recorderIntegrityAudit.js`
- `src/runtime/persistenceCoordinator.js`
- `src/runtime/replayScenarioCatalog.js`
- `src/runtime/replayChaosLab.js`
- `src/runtime/incidentReport.js`
- `test/storageRecovery.tests.js`
- `test/dataIntegrityMaintenance.tests.js`
- `test/replayDeterminism.tests.js`

Niet dupliceren: roadmap 04 covered storage/replay observability and roadmap 22 plans retention/lineage governance. Deze roadmap focuses on operational restore drills after corruption, disk failure or bad deploy.

## Probleemstelling

State recovery needs operational playbooks:

- which files are critical
- how to restore last known safe state
- how to validate restored readmodel
- how to avoid resurrecting stale blockers
- how to prove no live exposure mismatch
- how to recover after bad config/profile write

## Doel

Maak disaster recovery testable with backup manifests, restore dry-run and recovery drills.

## Fase 1 - Backup Manifest

Manifest:

- createdAt
- commit
- config hash
- files included
- schema versions
- journal hash
- readmodel hash
- storage audit status
- mode

## Fase 2 - Restore Planner

Dry-run restore:

- detect current state
- compare backup
- list files to restore
- identify live-sensitive restore risks
- require operator confirmation for live mode

## Fase 3 - Restore Verification

After restore:

- load journal
- rebuild readmodel
- run status
- verify open positions
- verify exchange truth if live
- verify no stale stop pending state

## Fase 4 - Recovery Drills

Drills:

- corrupt journal
- missing readmodel
- bad env write
- partial backup
- stale lifecycle state
- provider cooldown registry stale

## Fase 5 - Dashboard / CLI

CLI:

- `node src/cli.js backup:create`
- `node src/cli.js backup:restore --dry-run`
- `node src/cli.js backup:verify`

Dashboard:

- backup freshness
- last restore drill
- restore blockers
- critical files status

## Nieuwe Features

- Backup manifest.
- Restore dry-run planner.
- Recovery drill suite.
- Restore verification report.
- Dashboard backup status.

## Tests

Toevoegen:

- restore dry-run never mutates files
- corrupt journal restore requires rebuild
- live restore requires exchange truth verification
- bad env rollback is detected
- restored readmodel matches journal
- backup manifest redacts secrets

Te draaien:

- `npm.cmd test -- --grep=storage`
- `npm.cmd test -- --grep=backup`
- `npm.cmd test -- --grep=recovery`
- `npm.cmd run debug:secrets`

## Definition of Done

- Operator can create and verify backups.
- Restore has safe dry-run.
- Live restore requires extra safety checks.
- Recovery drills cover critical local failure modes.
