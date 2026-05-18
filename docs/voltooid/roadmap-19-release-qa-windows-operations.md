# Roadmap 19 - Release QA & Windows Operations Reliability

Status: actief
Analyse datum: 2026-05-18
Scope: QA scripts, Windows cmd entrypoints, desktop startup, smoke tests, release readiness.

## Analysebasis

Gebaseerd op:

- `package.json`
- `Start-Everything.cmd`
- `Start-Dashboard.cmd`
- `Start-BotService.cmd`
- `Install-Windows11.cmd`
- `scripts/smoke-cli.mjs`
- `scripts/smoke-dashboard.mjs`
- `scripts/check-critical-files.mjs`
- `scripts/check-syntax.mjs`
- `scripts/check-imports.mjs`
- `scripts/check-package-scripts.mjs`
- `scripts/check-order-routing.mjs`
- `scripts/security-scan-report.mjs`
- `desktop/`
- `test/windowsGuiStatus.tests.js`
- `test/windowsFastDataFoundations.tests.js`
- `test/operationalHardening.tests.js`

Niet dupliceren: roadmap 09 ging over operator desktop setup UX. Deze roadmap gaat over release QA, Windows entrypoint reliability en build/run operational checks.

## Probleemstelling

De bot is Windows/operator gericht en heeft meerdere entrypoints. Risico's:

- `.cmd` scripts driften van npm scripts
- dashboard start maar browser opent niet
- Node/PowerShell path assumptions falen
- smoke tests controleren niet alle real-world startup paden
- release gaat groen terwijl Windows helper kapot is
- desktop app en dashboard API contracten driften

## Doel

Maak release readiness toetsbaar vanuit dezelfde paden die operatoren gebruiken.

## Fase 1 - Windows Entrypoint Contract

Definieer expected behavior per script:

- `Start-Everything.cmd`
- `Start-Dashboard.cmd`
- `Start-BotService.cmd`
- `Install-Windows11.cmd`

Contractvelden:

- starts process
- waits for health
- opens dashboard
- uses correct port
- handles existing process
- reports failure visibly
- never hides fatal error

## Fase 2 - Script Static Checks

Breid checks uit:

- script references valid npm/node commands
- health URL matches config
- browser launch fallback order
- no stale command names
- no silent `exit /b 0` after failed startup
- PowerShell snippets are syntax-valid

Nieuwe script:

- `scripts/check-windows-entrypoints.mjs`

## Fase 3 - Startup Smoke Matrix

Maak smoke test matrix:

- dashboard only
- bot service only
- everything
- already running dashboard
- port busy
- missing Firefox fallback
- profile apply after startup
- stop/start after startup

Waar GUI launch niet mogelijk is in CI, valideer command construction en HTTP readiness.

## Fase 4 - Release Gate

Nieuw script:

- `npm run qa:windows`

Inhoud:

- check entrypoints
- smoke dashboard
- smoke CLI
- dashboard API contracts
- order routing audit
- no-live-leak
- secrets scan

## Fase 5 - Operator Release Notes

Auto-gen release summary:

- commit
- changed files
- migrations
- operator actions required
- known warnings
- startup commands tested
- rollback instructions

## Nieuwe Features

- Windows entrypoint checker.
- QA windows script.
- Startup smoke matrix.
- Release readiness report.
- Browser launch fallback validation.

## Tests

Toevoegen:

- `Start-Everything.cmd` waits for running/ready state
- dashboard URL opens via configured browser fallback
- script check catches stale route/command
- port busy gives actionable error
- release report redacts secrets
- qa:windows includes dashboard/API checks

Te draaien:

- `npm.cmd run smoke:cli`
- `npm.cmd run smoke:dashboard`
- `npm.cmd run debug:api-contracts`
- `npm.cmd run debug:dashboard-dom`
- `npm.cmd test -- --grep=windows`
- `npm.cmd test`

## Definition of Done

- Windows helper scripts are covered by static and smoke checks.
- Release readiness includes actual operator entrypoints.
- Dashboard startup failure is actionable.
- Browser launch fallback is verified.
- QA catches broken scripts before push.
