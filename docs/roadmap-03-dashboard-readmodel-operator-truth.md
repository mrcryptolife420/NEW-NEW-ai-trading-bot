# Roadmap 03 - Dashboard, Readmodel en Operator Truth

## Doel

Laat dashboard, CLI status, report en readmodel dezelfde operationele waarheid tonen, met expliciete freshness en zonder dat lege UI-states backend-activiteit maskeren.

## Analysebasis

Geinspecteerde hoofdmodules:

- `src/dashboard/server.js`
- `src/dashboard/public/app.js`
- `src/dashboard/guiStatus.js`
- `src/dashboard/fastExecutionDashboard.js`
- `src/runtime/dashboardSnapshotBuilder.js`
- `src/runtime/dashboardPayloadNormalizers.js`
- `src/runtime/botManager.js`
- `src/runtime/tradingPathHealth.js`
- `src/storage/readModelStore.js`
- `scripts/check-dashboard-dom-contract.mjs`
- `scripts/check-api-route-contracts.mjs`

De dashboardlaag heeft al API routes, snapshot metadata, frontend smoke render, DOM/API contract checks en readmodel summaries. De roadmap richt zich op contractharding en stale-state bewijs.

## Niet dubbel bouwen

- Maak geen tweede dashboard snapshot format; gebruik `dashboardSnapshotBuilder.js` en `dashboardPayloadNormalizers.js`.
- Gebruik `ReadModelStore.dashboardSummary()` voor historische waarheid.
- Gebruik bestaande contract scripts voor API en DOM checks.
- Gebruik `tradingPathHealth.js` voor backend/frontend drift, niet losse frontend-only diagnoses.
- Voeg nieuwe UI-kaarten alleen toe als het backendveld al contractueel bestaat of tegelijk wordt toegevoegd met tests.

## Fase 1 - Canoniek dashboard DTO contract

- Leg per snapshotveld vast: eigenaar, bronmodule, freshness, nullable gedrag en frontend renderer.
- Maak `schemaVersion` verplicht in snapshot responses en test payload normalisatie.
- Voeg een compacte generated contract summary toe aan `docs/debug/inventory`.
- Laat frontend renderers defensief omgaan met ontbrekende velden maar wel render health warnings geven.

## Fase 2 - Freshness boven alleen status

- Toon apart: snapshot age, cycle age, analysis age, portfolio age en readmodel age.
- Label dashboard als stale wanneer alleen frontend polling vers is maar backend data oud is.
- Label backend als actief wanneer runtime cycles vers zijn maar dashboard/readmodel achterloopt.
- Voeg operator guidance toe voor `run_once`, `readmodel_rebuild`, dashboard restart of reconcile afhankelijk van root cause.

## Fase 3 - Paper en live trade visibility

- Zorg dat paper positions, closed paper trades, live positions, execution intents en manual review states allemaal dezelfde visibility path hebben.
- Gebruik `paperTradeLifecycleContract.js` om dashboard-linked trade evidence te testen.
- Toon brokerMode en executionVenue bij recente trades en open positions.
- Maak lege trade-tabellen expliciet: geen candidates, geblokkeerd, geen fills, of readmodel stale.

## Fase 4 - Operator actions contract

- Koppel elke quick action aan een backend route, expected mutation, audit event en UI-resultaat.
- Voeg anti-CSRF/trusted mutation status zichtbaar toe in diagnostics.
- Test dat mislukte operator actions niet als success-card worden getoond.
- Zorg dat live mode request en profile apply altijd safety checks teruggeven.

## Fase 5 - Readmodel rebuild en drift detectie

- Laat dashboard tonen of readmodel afkomstig is van journal, audit events of replay traces.
- Rapporteer rebuild status, last completed at, stale reason en record counts.
- Voeg drift checks toe tussen runtime journal counts en readmodel dashboard counts.
- Maak drift een warning totdat hij operator impact heeft; maak hem blocker als trade visibility onbetrouwbaar wordt.

## Acceptatiecriteria

- Dashboard, `npm run status` en `npm run report` tonen dezelfde primaire status.
- Frontend empty states geven geen misleidende "geen activiteit" bij backend errors of stale snapshots.
- API/DOM contract checks dekken nieuwe operator fields.
- Readmodel stale of drift is zichtbaar met concrete herstelactie.

## Validatiecommando's

- `npm run debug:dashboard-dom`
- `npm run debug:api-contracts`
- `npm run test:dashboard`
- `npm run smoke:dashboard`
- `npm run readmodel:status`
