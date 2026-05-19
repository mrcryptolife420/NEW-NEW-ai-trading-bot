# Roadmap 40 - Runtime Modularization And Service Boundaries

## Analysebasis
- `src/runtime/tradingBot.js` is zeer groot en bevat dashboard, trading loop, learning, reconcile, scanner, research, persistence en operator actions.
- Er bestaan al modules zoals `tradingBotDecomposition.js`, `cycleRunner.js`, `botManager.js`, `persistenceCoordinator.js` en `dashboardSnapshotBuilder.js`.
- Grote files in inventory: `tradingBot.js`, `riskManager.js`, `liveBroker.js`, `reportBuilder.js`, `botManager.js`.

## Probleem
Veel gedrag is al modulair, maar `tradingBot.js` blijft een centrale orchestrator met veel verantwoordelijkheden. Dat maakt wijzigingen risicovol en vergroot kans op regressies bij dashboard, reconcile, learning en trading loop.

## Doel
Splits runtime gedrag in expliciete services met heldere boundaries, zonder de bestaande architectuur breed te herschrijven.

## Niet dubbel bouwen
Roadmap 05 ging over consolidatie en feature governance. Deze roadmap is een concrete service-boundary refactor voor runtime maintainability.

## Scope
- Trading loop service.
- Reconcile service.
- Dashboard snapshot service.
- Operator action service.
- Learning service.
- Scanner/research service.
- Persistence service facade.

## Fase 1 - Boundary map
- Documenteer huidige methoden in `TradingBot` per responsibility.
- Maak ownership tabel:
  - cycle
  - positions
  - reconcile
  - dashboard
  - operator actions
  - learning
  - storage
  - market data

## Fase 2 - Extract low-risk services
- Eerst pure/read-only builders:
  - dashboard operator diagnostics
  - promotion pipeline view
  - scanner priority index
  - missed trade analysis
- Geen behavior change.

## Fase 3 - Extract mutation services
- Daarna mutaties:
  - operator actions
  - reconcile actions
  - policy transitions
  - alert actions
- Iedere service krijgt explicit dependencies en tests.

## Fase 4 - Runtime service container
- Bouw lichte container:
  - config
  - logger
  - state access
  - broker
  - stores
- Vermijd dependency cycles.

## Fase 5 - Regression protection
- Snapshot tests voor dashboard.
- Runtime mutation contract tests.
- Trading cycle smoke tests.
- Reconcile safety tests.

## Acceptatiecriteria
- Nieuwe features hoeven niet direct in `tradingBot.js`.
- `TradingBot` wordt orchestrator, niet storage van alle business logic.
- Service methods hebben eigen tests.
- Geen dashboard payload drift door refactor.

## Verwachte files
- `src/runtime/tradingBot.js`
- `src/runtime/tradingBotDecomposition.js`
- `src/runtime/cycleRunner.js`
- `src/runtime/operatorWorkflow.js`
- `src/runtime/persistenceCoordinator.js`
- `src/runtime/dashboardSnapshotBuilder.js`
- `test/runtimeMutation.tests.js`
- `test/dashboardSnapshot.tests.js`

