# Roadmap 35 - Paper Live Promotion Evidence Dossier

## Analysebasis
- `src/runtime/promotionDossier.js`, `src/runtime/paperLiveParity.js`, `src/runtime/liveReadinessAudit.js` en `src/runtime/livePreflight.js` bestaan al.
- `src/runtime/paperStrategyCohortScorecard.js` en `src/runtime/paperTradeLifecycleContract.js` leveren paper evidence.
- `src/runtime/modelLifecycleDossier.js` en `src/runtime/strategyLifecycle.js` leveren model/strategy lifecycle context.

## Probleem
Er zijn veel losse readiness en promotion modules, maar nog geen operator-dossier dat per strategy/symbol uitlegt waarom iets wel of niet naar guarded live mag.

## Doel
Maak een promotiedossier dat paper prestaties, risk, execution quality, replay evidence en live readiness samenbrengt tot een beslisbaar pakket.

## Niet dubbel bouwen
Roadmap 02 ging over paper/live parity. Deze roadmap maakt een promotie-dossier bovenop bestaande parity checks.

## Scope
- Strategy promotion dossier.
- Symbol promotion dossier.
- Guarded-live probation plan.
- Rollback criteria.
- Dashboard decision view.

## Fase 1 - Evidence inputs
- Verzamel:
  - paper trades
  - near misses
  - rejected-but-profitable counterfactuals
  - execution cost
  - slippage/fill quality
  - strategy cohort score
  - regime/session coverage
  - replay determinism status
  - live preflight status

## Fase 2 - Promotion scoring
- Score onderdelen:
  - profitability
  - sample quality
  - drawdown behavior
  - fill quality
  - blocker stability
  - model confidence calibration
  - risk compliance
  - live capability compatibility

## Fase 3 - Guarded live plan
- Voor promoted scope:
  - max position size
  - max open positions
  - max daily entries
  - allowed sessions
  - rollback conditions
  - observation metrics
  - expiration

## Fase 4 - Dashboard UX
- Promotion card toont:
  - why eligible
  - why not eligible
  - evidence gaps
  - suggested next paper experiment
  - approve guarded live
  - rollback

## Fase 5 - Tests
- Dossier generation fixtures.
- Promotion approval safety tests.
- Rollback trigger tests.
- Dashboard rendering tests.

## Acceptatiecriteria
- Geen live promotion zonder dossier.
- Dossier verklaart sample gaps expliciet.
- Guarded live heeft automatische rollback triggers.
- Operator kan promotie accepteren of afwijzen met audit trail.

## Verwachte files
- `src/runtime/promotionDossier.js`
- `src/runtime/paperLiveParity.js`
- `src/runtime/liveReadinessAudit.js`
- `src/runtime/paperStrategyCohortScorecard.js`
- `src/dashboard/public/app.js`
- `test/liveReadinessAudit.tests.js`
- `test/paperStrategyCohortScorecard.tests.js`

