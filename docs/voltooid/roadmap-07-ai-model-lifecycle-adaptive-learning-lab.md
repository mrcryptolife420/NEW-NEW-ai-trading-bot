# Roadmap 07 - AI Model Lifecycle en Adaptive Learning Lab

Status: voltooid  
Voltooid op: 2026-05-17  
Aanmaakdatum: 2026-05-17  
Analysebasis: volledige codebase-inspectie, `docs/`, `docs/voltooid/`, AI modules, neural modules, offline/online learning, model registry en testinventaris.

## Eerst gecontroleerd

Voor deze roadmap is eerst gekeken in:

- `docs/`
- `docs/voltooid/`

Voltooide roadmaps behandelen al feature governance, trading-path observability, paper/live parity, dashboard/readmodel truth en replay/storage observability. Deze roadmap mag daarom geen tweede feature-audit, tweede decision-funnel of tweede promotion-dashboard bouwen. De roadmap gebruikt bestaande AI, neural en model governance modules.

## Doel

Bouw een expliciete AI/model lifecycle rond de bestaande adaptieve modules, zodat modelwijzigingen, calibration drift, neural proposals, offline training en online adaptation niet als losse subsystemen blijven bestaan maar als een gecontroleerde lifecycle:

- observe
- diagnose
- propose
- shadow
- paper evaluate
- canary
- promote
- rollback
- document

Live trading blijft strikter dan paper. Geen enkele roadmapstap mag automatisch live thresholds versoepelen.

## Belangrijkste bestaande bouwstenen

- `src/ai/adaptiveModel.js`: adaptive score, specialist stats, challenger blending, calibration summary, deployment summary.
- `src/runtime/modelRegistry.js`: snapshots, rollbackkeuze, promotion policy en registry summary.
- `src/ai/probabilityCalibrator.js`: probability bins en calibration summary.
- `src/ai/confidenceCalibration.js`: confidence calibration logic.
- `src/ai/antiOverfitGovernor.js`: evidence-based guard tegen overfitting.
- `src/runtime/offlineTrainer.js`: grote learning summary, scorecards, retrain readiness, threshold policy, exit learning, feature decay.
- `src/runtime/onlineAdaptationController.js`: online adaptation state, policy guidance en trade updates.
- `src/ai/parameterGovernor.js`: parameter snapshots en scope-resolutie.
- `src/ai/strategyAllocationBandit.js`: strategy allocation scoring en trade updates.
- `src/ai/neural/modelRegistryV2.js`: neural model cards en comparisons.
- `src/ai/neural/proposalEngine.js`: neural proposals uit learning evidence.
- `src/ai/neural/promotionPipeline.js`: promotion en rollback stages.
- `src/ai/neural/neuralSafetyAuditor.js`: safety audit van proposals.
- `src/ai/neural/neuralWalkForward.js`: walk-forward evaluation.
- `src/ai/neural/stressScenarioEngine.js`: stress scenario evaluation.
- `src/runtime/canaryReleaseGate.js`: promotion gate met anti-overfit, parity en rollback watch.
- `src/runtime/rollbackWatch.js`: rollback status uit live/canary/failure/drift stats.

## Niet dubbel bouwen

Niet opnieuw bouwen:

- geen tweede `ModelRegistry`
- geen tweede neural promotion pipeline
- geen alternatief voor `antiOverfitGovernor`
- geen nieuwe onzichtbare tuninglaag naast `offlineTrainer`
- geen parallelle online adaptation state naast `onlineAdaptationController`
- geen live threshold-autotuner zonder governance

Wel doen:

- lifecycle-state expliciet maken
- model cards automatisch vullen uit bestaande evidence
- calibratie- en driftanalyses beter koppelen aan promotion decisions
- paper-only learning sandbox afbakenen
- rollback- en canary-evidence beter zichtbaar maken

## Bevindingen uit analyse

1. AI en neural onderdelen zijn breed aanwezig, maar lifecycle-overgangen zijn verspreid over modules.
2. `offlineTrainer.js` bevat veel waardevolle signalen, maar de operator kan moeilijk zien welke aanbeveling actiegericht, observatie-only of live-gevaarlijk is.
3. `modelRegistry.js` kan snapshots en promotion policy bouwen, maar model cards en neural registry v2 kunnen sterker met elkaar worden verbonden.
4. Neural proposal, safety audit, walk-forward, stress en promotion bestaan al, maar verdienen een uniforme promotion dossier.
5. `onlineAdaptationController` en `parameterGovernor` kunnen paper learning ondersteunen, maar moeten live-veilig blijven.
6. Anti-overfit governance bestaat, maar moet als verplichte gate in elke promotion/proposal flow zichtbaar zijn.

## Gewenste eindstaat

Elke AI- of modelwijziging heeft:

- unieke change id
- scope
- evidence source
- model card
- calibration status
- drift status
- anti-overfit verdict
- walk-forward result
- stress result
- shadow result
- paper/canary metrics
- rollback condition
- operator-readable explanation

## Fase 1 - Unified Model Lifecycle Contract

Taken:

- Definieer een `ModelLifecycleDossier` bovenop bestaande registries.
- Verzamel evidence uit:
  - `modelRegistry`
  - `adaptiveModel.getDeploymentSummary`
  - `probabilityCalibrator.getSummary`
  - `offlineTrainer.buildSummary`
  - `onlineAdaptationController`
  - `neural/modelRegistryV2`
  - `canaryReleaseGate`
  - `rollbackWatch`
- Geef elk dossier een status:
  - observing
  - candidate
  - shadow
  - paper_trial
  - canary
  - promoted
  - rollback_required
  - retired

Acceptatiecriteria:

- Dossier is read-only aggregatie, geen tweede statebron.
- Dossier kan zonder live credentials worden gebouwd.
- Statusovergangen zijn expliciet en testbaar.

## Fase 2 - Calibration Drift Lab

Taken:

- Bouw calibration drift views op probability bins, scorecards en recent trade labels.
- Maak verschil zichtbaar tussen:
  - te optimistisch model
  - te conservatief model
  - te weinig evidence
  - stale evidence
  - regime mismatch
- Koppel drift aan concrete adviezen:
  - observe only
  - retrain paper
  - reset calibration warmup
  - restrict promotion
  - request operator review

Acceptatiecriteria:

- Drift resulteert niet automatisch in live versoepeling.
- Driftadvies bevat evidence count en freshness.
- Tests dekken low-evidence en stale-evidence scenario's.

## Fase 3 - Paper-only Adaptive Learning Sandbox

Taken:

- Scheid paper learning proposals expliciet van live-impact.
- Laat `onlineAdaptationController` policies genereren met mode-scope.
- Maak safe boundaries:
  - max learning rate
  - min evidence count
  - cooldown tussen wijzigingen
  - scope-specific changes only
  - rollback trigger verplicht
- Voeg dashboard/report samenvatting toe:
  - active proposals
  - rejected proposals
  - observed-only proposals
  - paper-only proposals

Acceptatiecriteria:

- Paper learning kan actief zijn zonder live risico.
- Live mode ziet paper evidence, maar gebruikt die niet als automatische versoepeling.
- Operator kan zien waarom een proposal niet promoveert.

## Fase 4 - Neural Proposal Governance

Taken:

- Verbind `proposalEngine`, `neuralSafetyAuditor`, `neuralWalkForward`, `stressScenarioEngine` en `promotionPipeline`.
- Maak per neural proposal een verplicht testpakket:
  - replay
  - walk-forward
  - stress
  - anti-overfit
  - shadow comparison
  - paper metrics
- Laat `canaryReleaseGate` alleen dossiers accepteren met complete evidence.

Acceptatiecriteria:

- Geen neural proposal kan rechtstreeks naar live.
- Missing test evidence veroorzaakt duidelijke blokkade.
- Rollback condition staat in elk promoted/canary dossier.

## Fase 5 - Model Cards en Operator Explainability

Taken:

- Vul neural/model cards met:
  - version
  - scope
  - training/evidence window
  - feature groups
  - regime coverage
  - calibration score
  - known weaknesses
  - allowed mode
  - rollback trigger
- Maak model card output beschikbaar in report/dashboard.
- Voeg compacte uitleg toe waarom een model actief, shadow of geblokkeerd is.

Acceptatiecriteria:

- Model card bevat geen secrets of ruwe private payloads.
- Model card is deterministisch uit bestaande evidence.
- Dashboard toont geen "AI ready" zonder onderbouwing.

## Fase 6 - Challenger Tournament voor AI Changes

Taken:

- Breid shadow strategy tournament concept uit naar model/proposal challengers.
- Vergelijk champion versus challenger op:
  - candidate rank
  - rejection reason shifts
  - false positive risk
  - false negative recovery
  - drawdown pressure
  - calibration drift
- Gebruik resultaten alleen als promotion evidence, niet als directe executie-instructie.

Acceptatiecriteria:

- Challenger kan verliezen zonder runtime-state te vervuilen.
- Tournament output is replaybaar.
- Promotion dossier verwijst naar tournament evidence.

## New features

- Unified Model Lifecycle Dossier.
- Calibration Drift Lab.
- Paper-only Adaptive Learning Sandbox.
- Neural Proposal Governance Board.
- Auto-generated AI Model Cards.
- Challenger Tournament voor modelwijzigingen.
- Rollback-ready promotion dossiers.

## Verificatiecommando's

Minimaal:

- `npm.cmd run check:imports`
- `npm.cmd test`
- `npm.cmd run feature:audit`

Aanvullend:

- `npm.cmd run report`
- `npm.cmd run backtest`
- `npm.cmd run once`

## Definitie van klaar

Deze roadmap is pas klaar wanneer:

- elke modelwijziging een dossier heeft
- calibration drift zichtbaar en mode-safe is
- paper-only learning niet live kan versoepelen
- neural proposals langs replay/walk-forward/stress/anti-overfit gaan
- model cards operatorvriendelijk zijn
- rollback evidence verplicht is voor canary/promote

Na volledige uitvoering en verificatie moet dit bestand worden verplaatst naar `docs/voltooid/`.
