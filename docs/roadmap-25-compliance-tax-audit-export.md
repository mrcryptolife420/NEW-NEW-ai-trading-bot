# Roadmap 25 - Compliance, Tax & Audit Export

Status: actief
Analyse datum: 2026-05-18
Scope: accounting export, audit log, trade ledger, tax-safe reporting, immutable local evidence.

## Analysebasis

Gebaseerd op:

- `src/reporting/accountingExport.js`
- `src/runtime/performanceLedger.js`
- `src/runtime/auditLogService.js`
- `src/storage/auditLogStore.js`
- `src/runtime/tradeAttribution.js`
- `src/execution/feeAccounting.js`
- `src/runtime/reportBuilder.js`
- `src/storage/dataLake.js`
- `test/performanceLedger.tests.js`
- `test/auditLog.tests.js`
- `test/operatorSafetyTooling.tests.js`

Niet dupliceren: roadmap 20 covered local security/privacy hardening. Deze roadmap gaat over compliance-grade exports, audit integrity and accounting evidence, not generic security.

## Probleemstelling

Trading systems need reliable exports:

- closed trades
- fees
- partial fills
- base/quote commission
- realized PnL
- transfers/manual adjustments
- audit events
- mode separation
- tax lots

Paper/live separation must stay explicit so paper trades are never exported as real taxable activity.

## Doel

Maak een compliance export layer voor local operator review, tax prep and audit trail integrity.

## Fase 1 - Canonical Accounting Event

Nieuwe module:

- `src/reporting/accountingEvent.js`

Event types:

- trade_opened
- trade_closed
- partial_fill
- fee_paid
- protective_order
- manual_review
- adjustment
- export_generated

## Fase 2 - Export Formats

Support:

- JSON
- CSV
- normalized ledger rows
- audit manifest

Elke export bevat:

- generatedAt
- source files
- schema version
- mode
- hash
- redaction status

## Fase 3 - Tax Lot Builder

Maak tax lot builder:

- FIFO baseline
- average cost summary
- fee basis
- partial exits
- dust
- missing data warnings

## Fase 4 - Audit Integrity

Add:

- export hash
- source journal hash
- audit log range
- tamper warning if source changed
- deterministic ordering

## Fase 5 - Dashboard / CLI

CLI:

- `node src/cli.js accounting:export --mode live`
- `node src/cli.js accounting:verify`

Dashboard:

- latest export
- warnings
- mode separation
- missing fee data

## Nieuwe Features

- Accounting event normalizer.
- Tax lot builder.
- Compliance export manifest.
- Export integrity verifier.
- Dashboard export status.

## Tests

Toevoegen:

- paper and live exports are separated
- base and quote fees handled
- partial exits map to tax lots
- export hash deterministic
- secrets redacted
- missing fill data produces warning, not fake precision

Te draaien:

- `npm.cmd test -- --grep=accounting`
- `npm.cmd test -- --grep=ledger`
- `npm.cmd test -- --grep=audit`
- `npm.cmd run debug:secrets`

## Definition of Done

- Operator can generate deterministic local accounting exports.
- Paper/live records cannot be mixed silently.
- Fee and partial-fill handling is explicit.
- Export integrity is verifiable.
