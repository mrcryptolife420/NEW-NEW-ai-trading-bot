# Roadmap 16 - Execution Cost & Fill Quality Feedback Loop

Status: actief
Analyse datum: 2026-05-18
Scope: execution engine, cost model, slippage, order style advisor, trade analytics.

## Analysebasis

Gebaseerd op:

- `src/execution/executionEngine.js`
- `src/execution/costModel.js`
- `src/execution/microstructureFillSimulator.js`
- `src/execution/orderStyleAdvisor.js`
- `src/execution/feeAccounting.js`
- `src/execution/tradeAnalyticsContext.js`
- `src/execution/paperBroker.js`
- `src/execution/liveBroker.js`
- `src/runtime/executionFeedbackLearning.js`
- `src/runtime/performanceLedger.js`
- `src/runtime/tradeAttribution.js`
- `src/runtime/tradeQualityAnalytics.js`
- `src/risk/netEdgeGate.js`
- `test/executionFeedbackLearning.tests.js`
- `test/microstructureFillSimulator.tests.js`
- `test/orderStyleAdvisor.tests.js`
- `test/performanceLedger.tests.js`

Niet dupliceren: roadmap 02 in `docs/voltooid` ging over paper/live execution safety parity. Deze roadmap gaat over cost/slippage learning en fill-quality feedback als decision input.

## Probleemstelling

Het systeem heeft cost model, order style advies, fill simulator en ledger, maar de feedback loop kan verder worden gesloten:

- voorspelde slippage versus gerealiseerde slippage
- maker timeout versus market urgency
- spread/queue decay per symbool
- fees per venue/profiel
- paper synthetic fill quality versus demo/live observations
- cost-heavy strategies die tijdelijk moeten afkoelen

## Doel

Maak execution quality meetbaar, leerbaar en direct bruikbaar voor risk sizing en order style selection.

## Fase 1 - Execution Quality Dataset

Maak een canonical record:

- pre-trade spread
- local book pressure
- order style
- expected slippage
- expected fee
- expected fill probability
- actual fill price
- actual fee
- realized slippage
- maker timeout
- cancel/replace count
- post-trade adverse excursion

Nieuwe module:

- `src/execution/executionQualityRecord.js`

## Fase 2 - Cost Calibration

Breid `executionFeedbackLearning` uit:

- per symbol
- per strategy
- per order style
- per volatility regime
- per venue/paper mode

Output:

- calibrated slippage bps
- maker reliability
- taker penalty
- order style confidence
- thin-book caution

## Fase 3 - Risk Integration

Koppel calibrated cost aan:

- `netEdgeGate`
- `riskManager`
- `entrySizing`
- `orderStyleAdvisor`
- `candidateRanking`

Regel: hogere cost mag entries blokkeren of verkleinen, maar nooit live safety versoepelen.

## Fase 4 - Paper/Demo/Live Delta

Maak delta-rapport:

- paper synthetic versus demo spot
- demo spot versus live observation
- expected versus realized fees
- expected versus realized slippage
- symbol-level confidence

Gebruik dit als promotion blocker voor live readiness.

## Fase 5 - Dashboard

Dashboard panel:

- execution quality score
- worst symbols by slippage
- maker reliability
- order style recommendation quality
- cost-driven rejected candidates
- net edge after costs

## Nieuwe Features

- Execution quality ledger.
- Cost calibration by regime.
- Order style feedback score.
- Paper/live execution delta report.
- Cost heatmap in dashboard.

## Tests

Toevoegen:

- calibrated slippage updates after fills
- negative net edge blocks candidate
- maker reliability lowers maker preference
- paper/live delta blocks promotion evidence
- dashboard normalizer handles missing quality data
- live path remains strict

Te draaien:

- `npm.cmd test -- --grep=execution`
- `npm.cmd test -- --grep=cost`
- `npm.cmd test -- --grep=performance ledger`
- `npm.cmd test -- --grep=order style`
- `npm.cmd test -- --grep=no-live-leak`

## Definition of Done

- Every executed trade creates execution quality evidence.
- Cost model learns from fills without weakening safeguards.
- Risk sizing and candidate ranking can consume calibrated costs.
- Dashboard exposes cost blockers clearly.
- Paper/live execution deltas are promotion evidence.
