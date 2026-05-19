# Roadmap 34 - Decision Truth And Blocker Dedup Engine

## Analysebasis
- `src/risk/riskManager.js` produceert veel reason codes en blockers.
- `src/runtime/rootBlockerOrchestrator.js` en `src/runtime/blockerRootCauseGraph.js` aggregeren blokkades.
- `src/runtime/decisionFunnel.js` en `src/runtime/signalFlowService.js` verzamelen cycle diagnostics.
- `src/dashboard/public/app.js` humanizet veel reasons voor operator view.

## Probleem
Blockers kunnen redundant zijn: model confidence, quality quorum, meta caution, governance, exchange safety en strategy mismatch kunnen tegelijk hetzelfde onderliggende probleem beschrijven. Daardoor is het voor de operator lastig te zien wat echt moet worden opgelost.

## Doel
Maak een canonical decision truth laag die blockers dedupliceert, root cause prioriteert en exact uitlegt welke actie entries weer mogelijk maakt.

## Niet dubbel bouwen
Roadmap 13 ging over blocker root cause explorer. Deze roadmap maakt de production decision truth contracten die alle callers moeten gebruiken.

## Scope
- Canonical reason registry.
- Reason grouping per root cause.
- Dominant blocker selector.
- Actionable unblock plan.
- Candidate-level and cycle-level truth.

## Fase 1 - Reason registry normalisatie
- Breid `src/risk/reasonRegistry.js` uit met:
  - canonical id
  - severity
  - category
  - root cause group
  - operator action
  - auto-fix eligibility
  - live sensitivity
- Maak alle risk reasons verplicht geregistreerd.

## Fase 2 - Dedup rules
- Voorbeelden:
  - `exchange_safety_blocked` domineert execution-specific downstream reasons.
  - `manual_review_required` domineert protection/reconcile variants.
  - `model_confidence_too_low` en `quality_quorum_degraded` worden onder `decision_quality_insufficient` gegroepeerd.
  - `cross_timeframe_misalignment` en `higher_tf_conflict` worden `timeframe_conflict`.

## Fase 3 - Actionable unblock plan
- Output per cycle:
  - primary blocker
  - secondary blockers
  - blockers hidden as duplicates
  - next safest action
  - can auto-fix
  - needs data, config, exchange or strategy action

## Fase 4 - Dashboard integration
- Top card toont niet 15 blockers maar:
  - hoofdreden
  - bewijs
  - actie
  - impact op entries
- Details blijven beschikbaar in drilldown.

## Fase 5 - Tests
- Snapshot tests voor dedup.
- Risk manager tests dat unknown reason faalt.
- Dashboard tests dat primary blocker stabiel blijft.

## Acceptatiecriteria
- Iedere rejection reason heeft registry metadata.
- Dashboard toont root cause en niet alleen raw reason list.
- No-trade cycles hebben maximaal 1 primary blocker en max 5 secondary blockers.
- Operator action queue gebruikt dezelfde canonical reasons.

## Verwachte files
- `src/risk/reasonRegistry.js`
- `src/runtime/rootBlockerOrchestrator.js`
- `src/runtime/blockerRootCauseGraph.js`
- `src/runtime/decisionFunnel.js`
- `src/runtime/noTradeTimeline.js`
- `src/dashboard/public/app.js`
- `test/riskReasonPolicy.tests.js`
- `test/rootBlockerOrchestrator.tests.js`

