# Roadmap 20 - Local Security, Audit & Privacy Hardening

Status: actief
Analyse datum: 2026-05-18
Scope: local dashboard security, secret redaction, audit logs, artifact privacy, safe mutation controls.

## Analysebasis

Gebaseerd op:

- `src/utils/redactSecrets.js`
- `src/runtime/auditLogService.js`
- `src/storage/auditLogStore.js`
- `src/runtime/localOnlyPrivacy.js`
- `src/dashboard/server.js`
- `src/dashboard/eventBus.js`
- `src/ops/metricsExporter.js`
- `src/ops/notificationRouter.js`
- `src/runtime/operatorActionQueue.js`
- `scripts/scan-secrets.mjs`
- `scripts/security-scan-report.mjs`
- `test/auditLog.tests.js`
- `test/operatorActionQueue.tests.js`
- `test/operatorSafetyTooling.tests.js`
- `test/configSchema.tests.js`

Niet dupliceren: roadmap 10 ging over live incident response and capital protection. Deze roadmap gaat over local security/privacy controls, mutation hardening en artifact leakage prevention.

## Probleemstelling

De bot is lokaal, maar verwerkt gevoelige informatie:

- API keys
- live acknowledgement
- exchange endpoints
- account balances
- trade history
- runtime artifacts
- dashboard mutation routes
- logs and reports

Risico's:

- secrets in logs/reports/dashboard
- local dashboard mutaties zonder voldoende origin checks
- audit logs missen before/after context
- exported artifacts bevatten gevoelige data
- event bus history kan gevoelige payloads bewaren
- metrics endpoint kan te veel details tonen

## Doel

Maak lokale security hardening expliciet en testbaar zonder de operator workflow onnodig te vertragen.

## Fase 1 - Secret Classification

Maak centrale classificatie:

- API key
- secret
- token
- account id
- balance
- order id
- client order id
- file path
- live acknowledgement
- strategy internals

Nieuwe module:

- `src/utils/sensitiveFields.js`

Koppel aan `redactSecrets`.

## Fase 2 - Dashboard Mutation Security

Hardening:

- trusted origin validation
- content-type enforcement
- mutation request id
- optional local CSRF token
- deny cross-host mutation
- live-sensitive route extra confirmation
- rate limit voor repeated mutation attempts

## Fase 3 - Audit Log Completeness

Audit per mutatie:

- actor source
- route/action id
- request id
- lifecycle before/after
- profile before/after
- mode before/after
- live sensitivity
- result
- public error

No secrets in audit payloads.

## Fase 4 - Artifact Privacy

Controleer outputs:

- reports
- generated docs
- debug inventory
- logs
- readmodel snapshots
- replay packs
- data lake exports

Voeg artifact sanitizer toe voor export/report.

## Fase 5 - Security QA

Breid checks uit:

- scan route payload examples
- scan logs/test fixtures
- scan generated docs
- scan replay packs
- verify dashboard event bus redaction

## Nieuwe Features

- Sensitive field registry.
- Dashboard mutation request id.
- Local CSRF token option.
- Artifact sanitizer.
- Security report for local runtime artifacts.

## Tests

Toevoegen:

- dashboard rejects untrusted mutation origin
- secrets redacted from audit/eventBus/report
- metrics endpoint does not expose secrets
- replay pack sanitizer removes account/API fields
- live-sensitive mutation has explicit audit classification
- artifact scan catches seeded fake secret

Te draaien:

- `npm.cmd run debug:secrets`
- `npm.cmd run debug:security-report`
- `npm.cmd test -- --grep=secret`
- `npm.cmd test -- --grep=audit`
- `npm.cmd test -- --grep=operator`
- `npm.cmd test`

## Definition of Done

- Secret redaction is centralized.
- Dashboard mutations have stronger local security controls.
- Audit logs are complete and public-safe.
- Exported artifacts are sanitized.
- Security checks are part of strict QA.
