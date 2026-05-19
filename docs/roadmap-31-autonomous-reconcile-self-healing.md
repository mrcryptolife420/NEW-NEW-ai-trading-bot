# Roadmap 31 - Autonomous Reconcile Self-Healing

## Analysebasis
- `src/execution/liveBroker.js` bevat reconcile, execution intent herstel, open-order cleanup, exchange truth en recovery.
- `src/execution/liveBrokerReconcile.js` bevat beslissingen voor flat-close, hard inventory conflict, prijs/quantity drift en protective rebuild.
- `src/runtime/exchangeSafetyReconciler.js` vertaalt exchange truth naar global freeze en symbol-scoped blocks.
- `src/runtime/tradingBot.js` bevat operator acties zoals force reconcile en flat manual review resolution.
- Tests: `test/paperExchangeSafety.tests.js`, `test/reconcileAutofixTolerance.tests.js`, `test/flatManualReviewResolution.tests.js`.

## Probleem
Reconcile lost steeds meer situaties zelf op, maar de logica is verspreid over broker, runtime, dashboard acties en safety audit. Daardoor blijft het risico bestaan dat een nieuwe open-order of stale-intent variant toch weer als manual review blijft hangen.

## Doel
Maak reconcile een expliciete self-healing pipeline met duidelijke evidence states, autonome acties en operator-visible uitkomsten.

## Niet dubbel bouwen
Deze roadmap vervangt niet roadmap 23 over exit/protective intelligence en niet roadmap 12 over dashboard action contracts. Dit is specifiek de reconcile-herstelengine voor exchange/runtime drift.

## Scope
- Open unfilled entry orders automatisch annuleren.
- Stale unresolved entry intents oplossen wanneer exchange truth vers en flat is.
- Hard inventory conflict automatisch sluiten in demo/paper wanneer venue flat bevestigd is.
- Partial fills apart behandelen als adopt-or-protect flow.
- Manual review alleen overhouden voor echte contradictie of ontbrekend bewijs.

## Fase 1 - Evidence model normaliseren
- Introduceer een `ReconcileEvidenceState` object met:
  - account snapshot freshness
  - open order freshness
  - user stream freshness
  - recent trades freshness
  - open order list freshness
  - base balance truth
  - quote/order notional truth
- Maak iedere reconcile beslissing afhankelijk van dit object.
- Voeg reason codes toe voor `evidence_missing`, `evidence_conflicting`, `evidence_confirmed_flat`, `evidence_confirmed_open`.

## Fase 2 - Auto-fix actiecatalogus
- Bouw een vaste catalogus:
  - `cancel_unfilled_entry_order`
  - `resolve_stale_entry_intent`
  - `close_local_flat_position`
  - `adopt_partial_fill_position`
  - `rebuild_missing_protection`
  - `adopt_existing_protection`
  - `symbol_scope_external_inventory`
- Elke actie krijgt preconditions, mutation summary en rollback note.

## Fase 3 - Partial fill adoptie
- Als Binance `PARTIALLY_FILLED` teruggeeft:
  - cancel remaining quantity indien actief
  - bereken filled base/quote uit trades
  - maak of update runtime position
  - plaats/repareer protective order
  - clear intent als protection bevestigd is
- Live blijft strenger: als trade evidence ontbreekt, symbol-scoped protect only.

## Fase 4 - Operator visibility
- Dashboard toont per reconcile:
  - bewijsbron
  - actie die automatisch is uitgevoerd
  - waarom geen manual review meer nodig was
  - waarom manual review nog wel nodig is
- Voeg "laatste autonome reconcile acties" toe aan operator deck.

## Fase 5 - Tests
- Fixture voor unfilled entry order.
- Fixture voor partial fill met cancel remaining.
- Fixture voor stale local position zonder exchange balance.
- Fixture voor contradictory open BUY/SELL state.
- Regression test dat live mode geen blind flat-close doet zonder evidence.

## Acceptatiecriteria
- `reconcile:plan` laat exact zien welke self-heal actie mogelijk is.
- `reconcile:run` voert alleen acties uit met verse exchange truth.
- Manual review verschijnt alleen bij conflict of onvoldoende bewijs.
- Alle acties zijn zichtbaar in warnings, exchangeTruth en dashboard.

## Verwachte files
- `src/execution/liveBroker.js`
- `src/execution/liveBrokerReconcile.js`
- `src/execution/autoReconcileCoordinator.js`
- `src/runtime/exchangeSafetyReconciler.js`
- `src/runtime/tradingBot.js`
- `src/dashboard/public/app.js`
- `test/paperExchangeSafety.tests.js`
- `test/autoReconcileCoordinator.tests.js`

