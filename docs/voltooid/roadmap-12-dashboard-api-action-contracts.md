# Roadmap 12 - Dashboard API Action Contracts & Operator Reliability

Status: actief
Analyse datum: 2026-05-18
Scope: dashboard backend routes, frontend action calls, action audit, API contract checks.

## Analysebasis

Deze roadmap is gebaseerd op:

- `src/dashboard/server.js`
- `src/dashboard/eventBus.js`
- `src/dashboard/public/app.js`
- `src/dashboard/guiStatus.js`
- `src/dashboard/fastExecutionDashboard.js`
- `src/runtime/operatorActionQueue.js`
- `src/runtime/auditLogService.js`
- `docs/debug/inventory/api-routes.json`
- `docs/debug/inventory/dashboard-dom.json`
- `scripts/check-api-route-contracts.mjs`
- `scripts/check-dashboard-dom-contract.mjs`
- `test/dashboardSnapshot.tests.js`
- `test/dashboardHealth.tests.js`
- `test/fastExecutionDashboard.tests.js`

Niet dupliceren: voltooide roadmap 03 ging over dashboard-readmodel truth. Deze roadmap gaat over actiecontracten, response-shapes en operator reliability van muterende dashboardacties.

## Probleemstelling

Het dashboard heeft veel muterende routes:

- start/stop
- refresh/cycle/research
- mode/profile/setup
- alerts
- ops/reconcile/probe-only
- diagnostics action
- policy approval/reject/revert
- promotion approve/rollback/scope/probation

Deze routes sturen verschillende result shapes terug. De frontend gebruikt `mutateAndRefresh`, maar niet elke actie heeft een formeel contract voor:

- required body
- response shape
- error shape
- audit id
- snapshot freshness
- whether the mutation is safe while stopping
- whether the action is read-only, paper-only, or live-sensitive

## Doel

Elke dashboardactie krijgt een expliciet contract zodat frontend, backend, tests en operator feedback niet uit elkaar driften.

## Fase 1 - Route Contract Registry

Maak `src/dashboard/actionRouteContracts.js` met per route:

- method
- path
- action id
- body schema
- response schema
- live sensitivity
- requires trusted mutation
- allowed lifecycle states
- audit category
- expected eventBus topic
- frontend success label
- frontend failure label

Voorbeelden:

- `config_profile_apply`
- `setup_complete`
- `ops_force_reconcile`
- `promotion_rollback`

## Fase 2 - Server Enforcement

Pas `src/dashboard/server.js` aan:

- centraliseer POST route matching via contract registry
- valideer body basisvorm voordat manager-call draait
- voeg consistente error envelope toe
- voeg `requestId`, `actionId`, `auditId` toe waar relevant
- log route errors met actionId en lifecycle-state

## Fase 3 - Frontend Binding

Pas `src/dashboard/public/app.js` aan:

- gebruik actionId's in plaats van losse strings waar mogelijk
- toon mutation pending state per actie
- voorkom double-click storms met action locks
- toon exact verschil tussen "accepted pending" en "completed"
- refresh snapshot alleen als routecontract dat vereist
- render contractuele errors in operator taal

## Fase 4 - Contract Tests

Breid `scripts/check-api-route-contracts.mjs` uit:

- alle routes in `server.js` moeten in registry staan
- alle muterende frontend calls moeten een backend contract hebben
- routecontracten moeten een test-id hebben
- live-sensitive routes moeten audit metadata hebben
- profile/setup routes moeten lifecycle allowed states hebben

## Fase 5 - Operator Audit Trail

Koppel routes aan audit:

- route action id
- safe/unsafe classification
- before/after lifecycle
- before/after profile id
- before/after mode
- user-visible result
- error category

Dashboard moet recente acties tonen met:

- status
- pending/done/failed
- request id
- affected subsystem
- next operator step

## Nieuwe Features

- Dashboard action history panel.
- Per-button pending spinner en disabled state.
- Contract-driven route docs generator.
- Mutatie replay simulator voor tests.
- "Why is this button disabled?" uitleg per actie.

## Tests

Toevoegen:

- backend contract registry covers all routes
- frontend calls only known action ids
- profile apply double click produces one pending action
- setup complete returns consistent success envelope
- mutation errors expose safe public error only
- live-sensitive route without acknowledgement is blocked
- audit event exists for each operator mutation

Te draaien:

- `npm.cmd run debug:api-contracts`
- `npm.cmd run debug:dashboard-dom`
- `npm.cmd test -- --grep=dashboard`
- `npm.cmd test -- --grep=operator action`
- `npm.cmd run smoke:dashboard`

## Definition of Done

- Geen dashboard mutatie bestaat zonder contract.
- Frontend en backend delen action ids.
- Elke mutatie heeft consistente success/error envelopes.
- Operator ziet pending, failed en completed acties zonder verborgen backend drift.
- Contract check faalt bij nieuwe ongedocumenteerde route.
