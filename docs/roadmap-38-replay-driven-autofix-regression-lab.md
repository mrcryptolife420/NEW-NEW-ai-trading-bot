# Roadmap 38 - Replay Driven Autofix Regression Lab

## Analysebasis
- `src/runtime/replayChaosLab.js`, `src/runtime/replayDeterminism.js`, `src/runtime/goldenReplayPackGenerator.js` en `src/runtime/incidentReplayLab.js` bestaan al.
- Reconcile en execution fixes worden nu getest met fixtures, maar kunnen beter uit echte incidents worden herleid.
- `src/runtime/failureLibrary.js` kan failure patterns centraal maken.

## Probleem
Veel bugs zijn stateful: stale order, partial fill, provider cooldown, dashboard drift, lifecycle lock. Unit tests dekken losse gevallen, maar een replay lab kan regressies uit echte runtime snapshots automatisch blijven testen.

## Doel
Maak een replay-driven regression lab dat incidents omzet naar replay packs en auto-fix behavior verifieert.

## Niet dubbel bouwen
Roadmap 14 ging over chaos replay library. Deze roadmap focust op auto-fix regression packs uit echte incidents.

## Scope
- Incident-to-fixture generator.
- Reconcile replay.
- Dashboard snapshot replay.
- Risk blocker replay.
- Provider degradation replay.

## Fase 1 - Incident capture
- Capture bij critical events:
  - runtime slice
  - exchangeTruth
  - orderLifecycle
  - openPositions
  - recent dashboard snapshot
  - relevant config subset
  - redacted logs
- Sla op als replay pack.

## Fase 2 - Replay pack schema
- Schema:
  - scenario id
  - category
  - initial state
  - expected action
  - expected final state
  - safety constraints
  - forbidden actions

## Fase 3 - Auto-fix assertions
- Voor reconcile:
  - unfilled order cancel
  - stale intent clear
  - flat local close
  - partial fill adopt
  - protection rebuild
- Voor dashboard:
  - stopped/running truth
  - profile apply action result
  - manual review queue consistency

## Fase 4 - CLI
- Commands:
  - `node src/cli.js replay:incident --id ...`
  - `node src/cli.js replay:autofix --pack ...`
  - `node src/cli.js replay:latest-failures`

## Fase 5 - CI integration
- Critical replay packs draaien in `npm test`.
- Slow replay packs draaien optioneel.
- Voeg drift report toe wanneer output verandert.

## Acceptatiecriteria
- Iedere production/manual-review fix krijgt replay pack.
- Regressie faalt als auto-fix terug manual review wordt.
- Packs zijn secrets-redacted.
- Dashboard en runtime replay gebruiken dezelfde expected state.

## Verwachte files
- `src/runtime/incidentReplayLab.js`
- `src/runtime/replayChaosLab.js`
- `src/runtime/goldenReplayPackGenerator.js`
- `src/runtime/failureLibrary.js`
- `src/cli/runCli.js`
- `test/incidentReplayLab.tests.js`
- `test/replayDeterminism.tests.js`

