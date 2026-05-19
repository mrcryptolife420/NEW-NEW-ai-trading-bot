# Roadmap 32 - Order Lifecycle Intent State Machine v2

## Analysebasis
- `src/execution/executionIntentLedger.js` bewaart intents met pending, submitted, completed, failed en ambiguous states.
- `src/execution/orderLifecycleAuditor.js` detecteert lifecycle problemen.
- `src/runtime/tradingBot.js` synchroniseert lifecycle state en toont pending actions.
- `src/risk/fastPreflightRisk.js` en `src/ai/neural/live/neuralLiveExecutionGate.js` blokkeren bij unresolved intents.

## Probleem
Execution intents zijn nuttig, maar intent status, exchange order status en runtime position status zijn nog niet een formele state machine. Daardoor kunnen blockers blijven hangen wanneer een intent technisch stale is maar exchange truth al duidelijk is.

## Doel
Maak order lifecycle deterministisch en herstelbaar, met een centrale state machine voor intents, orders, fills, positions en protection.

## Niet dubbel bouwen
Deze roadmap bouwt voort op roadmap 31. Roadmap 31 lost reconcile acties op; deze roadmap structureert de lifecycle-state daaronder.

## Scope
- Intent lifecycle contract.
- Order lifecycle contract.
- Position lifecycle contract.
- Protection lifecycle contract.
- State transition audit en invariant checks.

## Fase 1 - State model
- Definieer states:
  - intent: `planned`, `submitted`, `exchange_confirmed`, `filled`, `canceled`, `failed`, `ambiguous`, `resolved`
  - order: `new`, `partial`, `filled`, `canceled`, `expired`, `rejected`, `unknown`
  - position: `opening`, `open`, `protected`, `protect_only`, `closing`, `closed`, `manual_review`
  - protection: `missing`, `pending`, `active`, `triggered`, `stale`, `invalid`
- Leg toegestane transitions vast in code.

## Fase 2 - Transition API
- Voeg helper toe:
  - `transitionIntent`
  - `transitionOrderLifecycle`
  - `transitionPositionLifecycle`
  - `transitionProtectionLifecycle`
- Elke transition schrijft:
  - previous state
  - next state
  - reason
  - exchange evidence
  - actor: bot, reconcile, operator, startup recovery

## Fase 3 - Invariants
- Invariant voorbeelden:
  - completed entry intent moet position id of explicit no-fill cancel hebben
  - open position moet protection of protect-only reden hebben
  - manual review mag niet global freeze veroorzaken als symbol-scoped genoeg is
  - canceled unfilled order mag geen unresolved entry intent achterlaten

## Fase 4 - Dashboard en CLI
- `exchange-safety:status` toont lifecycle mismatch per symbol.
- Dashboard position cards tonen de exacte lifecycle chain.
- Voeg "why blocked" en "safe next transition" toe.

## Fase 5 - Migratie
- Migreer oude `orderLifecycle.executionIntentLedger` entries.
- Markeer oude unknown states als `ambiguous` met evidence requirement.
- Voeg repair voor oude pendingActions zonder actuele open position.

## Tests
- Unit tests voor toegestane en verboden transitions.
- Runtime migration tests voor oude ledgers.
- End-to-end tests:
  - unfilled cancel -> resolved intent
  - partial fill -> protected position
  - stale protection -> rebuild
  - invalid protection geometry -> manual review

## Acceptatiecriteria
- Geen unresolved execution intent zonder explicit evidence requirement.
- Ieder dashboard blocker item heeft een state-machine transition als oorzaak.
- Reconcile kan stale states opruimen zonder handmatige data-edit.

## Verwachte files
- `src/execution/executionIntentLedger.js`
- `src/execution/orderLifecycleAuditor.js`
- `src/runtime/tradingBot.js`
- `src/runtime/rootBlockerOrchestrator.js`
- `src/dashboard/public/app.js`
- `test/executionIntentLedger.tests.js`
- `test/orderLifecycleAuditor.tests.js`

