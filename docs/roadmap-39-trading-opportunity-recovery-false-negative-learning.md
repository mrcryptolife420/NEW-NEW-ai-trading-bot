# Roadmap 39 - Trading Opportunity Recovery And False Negative Learning

## Analysebasis
- `src/runtime/noTradeTimeline.js`, `src/runtime/opportunityCostAnalyzer.js`, `src/runtime/nearThresholdWatchlist.js` en `src/runtime/badVetoLearningService.js` bestaan.
- `src/risk/riskManager.js` bevat veel blockers en paper learning leniency.
- `src/runtime/vetoOutcome.js` en `src/runtime/vetoReplayCoverage.js` meten veto uitkomsten.

## Probleem
De bot kan veilig maar te passief worden. Veel candidates worden rejected door meerdere blockers. Er is meer structuur nodig om false negatives te leren zonder live safety te verzwakken.

## Doel
Maak een recovery engine die gemiste kansen analyseert, paper-only probes voorstelt en drempel/feature feedback onder governance houdt.

## Niet dubbel bouwen
Roadmap 08 ging over strategy research/portfolio optimizer. Deze roadmap focust op false negative learning en recovery probes na overblocking.

## Scope
- No-trade cycle classification.
- False negative detection.
- Paper-only recovery probes.
- Blocker regret scoring.
- Adaptive but governed threshold suggestions.

## Fase 1 - No-trade taxonomy
- Classificeer cycles:
  - no candidates
  - candidates rejected by safety
  - candidates rejected by model
  - candidates rejected by execution cost
  - candidates rejected by portfolio
  - data trust blocked
  - exchange/reconcile blocked

## Fase 2 - Missed opportunity tracking
- Track rejected candidates over horizons:
  - 15m
  - 1h
  - 4h
  - 24h
- Label:
  - good reject
  - false negative
  - noisy near miss
  - unsafe but profitable

## Fase 3 - Recovery probes
- Paper-only candidate admission voor:
  - near threshold with clean execution
  - model confidence near miss
  - committee disagreement but no hard safety blocker
  - strategy fit borderline in favorable regime
- Nooit voor exchange safety, live protection, stale data of critical alerts.

## Fase 4 - Learning outputs
- Output:
  - blocker regret score
  - candidate family regret
  - suggested threshold sandbox
  - suggested feature audit
  - suggested strategy retirement or promotion

## Fase 5 - Dashboard
- Voeg "missed opportunity recovery" panel toe:
  - top false negatives
  - why blocked
  - what would have happened
  - proposed paper probe
  - governance status

## Tests
- False negative labeling tests.
- Probe admission safety tests.
- No-trade timeline tests.
- Dashboard summary tests.

## Acceptatiecriteria
- No-trade cycles zijn verklaarbaar.
- False negative learning blijft paper-only tenzij promotion dossier akkoord is.
- Hard safety blockers worden nooit versoepeld door regret.
- Operator ziet wat de bot leert van gemiste trades.

## Verwachte files
- `src/runtime/noTradeTimeline.js`
- `src/runtime/opportunityCostAnalyzer.js`
- `src/runtime/badVetoLearningService.js`
- `src/runtime/nearThresholdWatchlist.js`
- `src/risk/riskManager.js`
- `src/dashboard/public/app.js`
- `test/noTradeTimeline.tests.js`
- `test/opportunityCostAnalyzer.tests.js`

