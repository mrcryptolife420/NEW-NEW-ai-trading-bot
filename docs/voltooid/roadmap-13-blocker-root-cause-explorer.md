# Roadmap 13 - Blocker Root-Cause Explorer & No-Trade Diagnosis

Status: actief
Analyse datum: 2026-05-18
Scope: rejection reasons, blockers, no-trade timeline, candidate explainability, dashboard drilldown.

## Analysebasis

Geinspecteerde relevante modules:

- `src/risk/riskManager.js`
- `src/risk/reasonCodes.js`
- `src/risk/reasonRegistry.js`
- `src/runtime/rootBlockerOrchestrator.js`
- `src/runtime/rootBlockerStalenessVerifier.js`
- `src/runtime/noTradeTimeline.js`
- `src/runtime/decisionFunnel.js`
- `src/runtime/candidateExplainability.js`
- `src/runtime/modelConfidenceRootCause.js`
- `src/runtime/tradingPathHealth.js`
- `src/dashboard/public/app.js`
- `test/rootBlockerOrchestrator.tests.js`
- `test/rootBlockerStalenessVerifier.tests.js`
- `test/modelConfidenceRootCause.tests.js`
- `test/candidateExplainability.tests.js`

Niet dupliceren: roadmap 01 in `docs/voltooid` ging over algemene trading-path inactivity observability. Deze roadmap gaat dieper: automatische root-cause analyse per blocker cluster en operator drilldown naar de eerst oplosbare oorzaak.

## Probleemstelling

De status output laat veel blockers zien, zoals:

- `model_confidence_too_low`
- `meta_followthrough_caution`
- `quality_quorum_degraded`
- `strategy_context_mismatch`
- `anti_chop_context_filter`
- `breakout_fakeout_risk`

Maar operatoren hebben vaak niet genoeg context om te zien:

- welke blocker dominant is versus afgeleid
- welke blocker herstelbaar is
- welke blocker bewust hard safety is
- welke data ontbreekt
- welke config of market state de oorzaak is
- of dezelfde root cause meerdere reason codes veroorzaakt

## Doel

Bouw een blocker root-cause explorer die no-trade periodes uitlegt als causal chain in plaats van losse reason counts.

## Fase 1 - Reason Dependency Graph

Maak een graph tussen reason codes:

- data quality blockers
- model/confidence blockers
- strategy-fit blockers
- market regime blockers
- execution-cost blockers
- portfolio/capital blockers
- hard safety blockers
- paper-only soft blockers

Nieuwe module:

- `src/runtime/blockerRootCauseGraph.js`

Deze graph moet aangeven:

- parent reason
- child reason
- severity
- recoverability
- operator action
- whether it can be softened in paper
- whether it is live-hard

## Fase 2 - Cycle-Level Root Cause Summary

Breid decision funnel output uit met:

- `rootCauseSummary.primary`
- `rootCauseSummary.secondary`
- `rootCauseSummary.hardSafety`
- `rootCauseSummary.dataQuality`
- `rootCauseSummary.recoverable`
- `rootCauseSummary.nextBestAction`

Bijvoorbeeld:

- primary: `data_quality_rest_budget_cooldown`
- derived: `quality_quorum_degraded`, `model_confidence_too_low`
- operator action: wait for budget cooldown or reduce provider pressure

## Fase 3 - Symbol-Level Diagnosis

Per top candidate:

- cause chain
- failing inputs
- threshold distance
- model contribution
- committee contribution
- stale source contribution
- execution-cost contribution
- what would need to change before it can trade

Output moet dashboard-safe zijn en geen secrets lekken.

## Fase 4 - Dashboard Drilldown

Maak een dashboard panel:

- "Waarom geen trade?"
- dominant root cause
- affected symbols
- trend over laatste cycles
- hard versus soft blockers
- data/provider issues
- model confidence breakdown
- operator next action

Geen marketingtekst; compact operationeel overzicht.

## Fase 5 - Replay & Regression

Voeg replay fixtures toe voor:

- low confidence due to stale data
- low confidence due to genuine weak setup
- event risk as hard blocker
- quality quorum degraded due to provider cooldown
- execution-cost overheat
- capital governor recovery

## Nieuwe Features

- Root blocker graph.
- No-trade root-cause CLI: `node src/cli.js no-trade:explain`.
- Dashboard blocker explorer.
- Blocker cluster trend over tijd.
- Operator action recommendation per blocker cluster.

## Tests

Toevoegen:

- root graph classificeert hard/soft blockers correct
- derived blockers worden samengevouwen onder root cause
- dashboard normalizer blijft fallback-safe
- no-trade CLI is read-only
- paper leniency wordt nooit aan live blockers toegekend
- stale data root cause krijgt prioriteit boven model-confidence symptoom

Te draaien:

- `npm.cmd test -- --grep=blocker`
- `npm.cmd test -- --grep=no-trade`
- `npm.cmd test -- --grep=candidate explainability`
- `npm.cmd run status`

## Definition of Done

- Operator kan in dashboard zien waarom er geen trades zijn.
- Dominante root cause is zichtbaar zonder raw logs te lezen.
- Afgeleide blockers worden niet dubbel als losse oorzaken gepresenteerd.
- Live-hard blockers blijven nooit verzacht.
- Replay tests bewijzen meerdere no-trade scenario's.
