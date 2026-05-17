# Roadmap 02 - Paper, Demo en Live Execution Safety Parity

## Doel

Bewijs paper trading end-to-end, houd live trading strenger, en voorkom dat internal paper, Binance demo paper en live execution ieder hun eigen afwijkende waarheid krijgen.

## Analysebasis

Geinspecteerde hoofdmodules:

- `src/execution/brokerFactory.js`
- `src/execution/paperBroker.js`
- `src/execution/demoPaperBroker.js`
- `src/execution/liveBroker.js`
- `src/execution/executionEngine.js`
- `src/execution/executionIntentLedger.js`
- `src/execution/exchangeAdapterContract.js`
- `src/runtime/paperTradeLifecycleContract.js`
- `src/runtime/paperLiveParity.js`
- `src/config/mode.js`
- `src/binance/client.js`

De repo heeft al duidelijke brokerselectie, private mutation guards, execution intents, paper lifecycle evidence en paper/live parity helpers. Verbeteringen moeten deze bestaande lagen verbinden in plaats van extra brokerlagen toevoegen.

## Niet dubbel bouwen

- Maak geen vierde brokerpad; breid `brokerFactory.js` alleen uit als mode/venue echt nieuw is.
- Gebruik `executionEngine.js` voor fill, attribution en execution quality; dupliceer dit niet in brokers.
- Gebruik `paperTradeLifecycleContract.js` als paper end-to-end bewijscontract.
- Gebruik `paperLiveParity.js` voor fill-model vergelijking, niet een aparte parity analyzer.
- Gebruik `executionIntentLedger.js` voor ambiguous live/demo execution state.

## Fase 1 - Broker mode matrix afdwingen

- Maak een testmatrix voor `paper/internal`, `paper/binance_demo_spot` en `live/binance_spot`.
- Controleer dat elke mode exact een brokerselectie, brokerMode, executionVenue en private mutation policy heeft.
- Laat misconfiguraties een operator-visible reason opleveren in status, doctor en dashboard.
- Bewijs dat live nooit start met demo endpoint, ontbrekende secrets of ontbrekende acknowledgements.

## Fase 2 - Paper lifecycle bewijs

- Laat elke paper entry attempt vastleggen: selected candidate, risk allow/reject, quote sizing, fill simulation, opened position, journal persistence en readmodel/dashboard visibility.
- Gebruik het bestaande lifecycle contract om te bewijzen dat een paper trade niet alleen geopend maar ook zichtbaar en leerbaar is.
- Voeg een scenario toe waarin paper correct niet handelt door hard safety, met expliciete blocker.
- Voeg een scenario toe waarin paper wel een kleine geldige positie opent zonder live broker te initialiseren.

## Fase 3 - Fill model kalibratie

- Verzamel internal paper fill assumptions en demo/live observed fills in een gedeelde parity record shape.
- Rapporteer optimism bias per symbol, session en strategy family.
- Pas paper slippage/fee conservatisme alleen diagnostisch aan totdat genoeg samples bestaan.
- Houd live gedrag onveranderd; parity mag live alleen waarschuwen of blokkeren, niet versoepelen.

## Fase 4 - Execution intent recovery

- Maak unresolved execution intents zichtbaar als root blocker met symbol, scope, age en next safe action.
- Leg herstelpaden vast voor submitted-but-unknown, protective order missing, reconcile required en manual review.
- Voeg tests toe dat duplicate unresolved intents nieuwe entries blokkeren.
- Zorg dat paper/demo recovery duidelijk losstaat van live exchange-truth recovery.

## Fase 5 - Exit en protection consistency

- Vergelijk paper exit, synthetic min-notional exit, live protective OCO en emergency flatten als aparte flows met gedeelde lifecycle labels.
- Laat dashboard open positions tonen met protection state, exit source en reconcile state.
- Voeg regressie toe dat live exits geen synthetic success mogen claimen tenzij expliciet toegestaan en zichtbaar.

## Acceptatiecriteria

- Paper flow is bewezen van candidate tot dashboard of de exacte blocker is zichtbaar.
- Live mode blijft strenger dan paper en vereist acknowledgements plus exchange protection.
- Demo paper gebruikt exchange-facing checks zonder live mutation policy te verlagen.
- Ambiguous execution state blokkeert nieuwe entries en geeft herstelactie.

## Validatiecommando's

- `npm run test:paper-safety`
- `npm run test:no-live-leak`
- `npm run paper:doctor`
- `npm run demo:doctor`
- `npm run debug:order-routing`
