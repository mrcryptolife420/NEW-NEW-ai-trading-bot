# Roadmap 15 - Config, Env & Profile Integrity Control Plane

Status: actief
Analyse datum: 2026-05-18
Scope: env schema, profile apply, mode profiles, config drift, operator maintenance.

## Analysebasis

Gebaseerd op:

- `src/config/index.js`
- `src/config/schema.js`
- `src/config/envValidation.js`
- `src/config/envFile.js`
- `src/config/tradeProfiles.js`
- `src/config/profileAudit.js`
- `src/config/mode.js`
- `src/config/paperModeProfile.js`
- `src/runtime/setupStateMachine.js`
- `src/setup/setupWizard.js`
- `test/configSchema.tests.js`
- `test/configOperatorMaintenance.tests.js`
- `test/featureFlagHygiene.tests.js`
- `scripts/check-env.mjs`
- `scripts/check-env-duplicates.mjs`
- `.env.example`

Niet dupliceren: roadmap 09 in `docs/voltooid` ging over operator desktop setup UX. Deze roadmap gaat over config integrity, drift, migration en profile correctness.

## Probleemstelling

De repo heeft honderden env keys en meerdere profile lagen:

- base config
- `.env`
- `.env.example`
- trade profiles
- paper mode profile
- exchange capability profile
- live acknowledgement
- feature activation stages

Risico's:

- profile apply schrijft env maar runtime herlaadt niet volledig
- `.env.example` drift van schema
- deprecated keys blijven actief
- live-sensitive keys blijven achter na switch naar paper/demo
- dashboard toont profiel actief op basis van subset terwijl andere keys afwijken
- operator weet niet welke key door welke profile-laag is gezet

## Doel

Bouw een config control plane die profile/env drift exact detecteert, veilig migreert en operator-proof uitlegt.

## Fase 1 - Config Source Lineage

Voeg lineage toe per config key:

- default
- env file
- process env
- profile
- paper mode profile
- derived
- deprecated
- unknown

Nieuwe module:

- `src/config/configLineage.js`

Output:

- `key`
- `valueRedacted`
- `source`
- `profileOwner`
- `safetyClass`
- `requiresRestart`
- `liveSensitive`

## Fase 2 - Profile Exactness Validator

Verbeter active profile detectie:

- exact match
- partial match
- conflicting profile keys
- missing required profile keys
- stale keys from previous profile
- live-dangerous leftovers

Dashboard moet tonen:

- actief profiel
- drift count
- keys die afwijken
- suggested repair action

## Fase 3 - Env Migration System

Maak migraties:

- rename deprecated keys
- remove unsafe stale demo/live combinations
- add missing required keys with safe defaults
- comment unknown keys in audit report, niet automatisch verwijderen

Nieuwe module:

- `src/config/envMigrationPlan.js`

CLI:

- `node src/cli.js config:audit`
- `node src/cli.js config:migrate --dry-run`

## Fase 4 - Profile Apply Transaction

Maak `applyConfigProfile` transactioneler:

- preview
- backup
- write
- verify
- reload
- post-reload config validation
- rollback only when safe
- public result with exact mismatch list

Belangrijk: live profile apply moet stricter blijven.

## Fase 5 - Dashboard Control Plane

Dashboard panel:

- config source map
- active profile exactness
- profile drift
- dangerous stale keys
- reload state
- migration dry-run

Geen secrets tonen; altijd redacted.

## Nieuwe Features

- Config lineage API.
- Profile drift repair action.
- Env migration dry-run.
- Safe rollback report.
- Profile exactness badge in dashboard.

## Tests

Toevoegen:

- `.env.example` covers schema keys
- unknown keys worden gerapporteerd maar niet verwijderd
- profile exact partial/conflict states
- live-sensitive stale demo endpoints blokkeren live
- profile apply rollback behavior
- redaction van secrets in lineage

Te draaien:

- `npm.cmd run check:env`
- `npm.cmd run debug:env`
- `npm.cmd test -- --grep=config`
- `npm.cmd test -- --grep=profile`
- `npm.cmd test -- --grep=setup`

## Definition of Done

- Operator kan zien waarom een profiel wel/niet exact actief is.
- Env migrations zijn dry-run first.
- Profile apply is transactioneel en rapporteert reload waarheid.
- Live guardrails blijven dominant.
- Config drift kan niet stil blijven.
