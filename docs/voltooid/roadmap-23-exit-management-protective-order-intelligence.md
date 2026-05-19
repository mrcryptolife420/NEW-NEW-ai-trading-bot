# Roadmap 23 - Exit Management & Protective Order Intelligence

Status: actief
Analyse datum: 2026-05-18
Scope: exits, protective orders, stop/limit geometry, scale-out, post-entry monitoring.

## Analysebasis

Gebaseerd op:

- `src/execution/liveBroker.js`
- `src/execution/liveBrokerReconcile.js`
- `src/execution/stopLimitGap.js`
- `src/execution/stopLimitStuck.js`
- `src/risk/dynamicExitLevels.js`
- `src/risk/exitIntelligenceV2.js`
- `src/ai/exitIntelligence.js`
- `src/ai/exitNeuralAdvisor.js`
- `src/runtime/exitFastLane.js`
- `src/runtime/exitQuality.js`
- `src/runtime/tradeAutopsy.js`
- `src/runtime/exitFastLane.js`
- `test/exitIntelligenceV2.tests.js`
- `test/stopLimitGap.tests.js`
- `test/stopLimitStuck.tests.js`
- `test/liveBrokerReconcile.tests.js`

Niet dupliceren: roadmap 10 in `docs/voltooid/` ging over live incident response/capital protection. Deze roadmap gaat specifiek over proactive exit intelligence and protective order quality while positions are open.

## Probleemstelling

Entry safety is heavily instrumented, maar open positions blijven riskant als:

- stop-limit geometry niet past bij actuele liquidity
- protective OCO drift ontstaat
- maker exit blijft hangen
- partial exits inconsistent verwerkt worden
- dynamic exit levels verouderd raken
- exit fast lane te weinig context heeft
- paper exits onvoldoende bewijs leveren voor live exit policy

## Doel

Maak exit-management een first-class intelligence loop met protective order health, exit regret en geometry monitoring.

## Fase 1 - Protective Order Health Score

Nieuwe module:

- `src/execution/protectiveOrderHealth.js`

Inputs:

- stop/limit gap
- order age
- distance to stop
- current bid/ask
- local order book liquidity
- volatility
- position lifecycle state
- exchange truth

Output:

- status
- risk level
- geometry score
- stuck risk
- recommended action

## Fase 2 - Dynamic Exit Refresh Policy

Bouw policy:

- when to refresh stop levels
- when not to cancel existing protection
- when to require manual review
- when to use protect-only mode
- when scale-out is safer than full exit

## Fase 3 - Exit Regret Feedback

Koppel `tradeAutopsy`, `exitQuality` en `exitIntelligence`:

- early exit regret
- late exit regret
- stop too tight
- stop too loose
- maker timeout
- manual review delay

Gebruik feedback voor paper tuning, niet direct voor live relaxation.

## Fase 4 - Dashboard Position Exit Panel

Dashboard per open position:

- protective health
- stop geometry
- stuck risk
- exit recommendation
- manual action needed
- last reconcile evidence

## Fase 5 - Simulation & Replay

Replay scenarios:

- stop-limit triggered but unfilled
- partial protective fill
- OCO all done with stale local state
- exchange order missing
- liquidity vacuum after entry

## Nieuwe Features

- Protective order health score.
- Exit refresh policy.
- Exit regret feedback loop.
- Position exit dashboard panel.
- Protective replay pack set.

## Tests

Toevoegen:

- healthy OCO scores ready
- stuck stop-limit scores critical
- refresh policy refuses unsafe cancel without replacement
- partial fill remains managed
- exit regret does not relax live protections
- dashboard fallback safe with missing exchange truth

Te draaien:

- `npm.cmd test -- --grep=exit`
- `npm.cmd test -- --grep=stop-limit`
- `npm.cmd test -- --grep=reconcile`
- `npm.cmd test -- --grep=live broker`

## Definition of Done

- Every open position has protective health.
- Unsafe exit refresh is blocked.
- Exit quality feedback is stored and visible.
- Live protective order safety remains dominant.
