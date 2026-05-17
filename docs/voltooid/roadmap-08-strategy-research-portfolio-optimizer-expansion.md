# Roadmap 08 - Strategy Research en Portfolio Optimizer Expansion

Status: voltooid  
Voltooid op: 2026-05-17  
Aanmaakdatum: 2026-05-17  
Analysebasis: volledige codebase-inspectie, `docs/`, `docs/voltooid/`, strategy router, strategy DSL, research labs, strategy lifecycle, portfolio/risk modules en testinventaris.

## Eerst gecontroleerd

Voor deze roadmap is eerst gekeken in:

- `docs/`
- `docs/voltooid/`

De voltooide roadmaps behandelen al no-trade observability, paper/live execution parity, dashboard/readmodel, storage/replay en feature governance. Deze roadmap bouwt daarom geen tweede decision-funnel en geen tweede replay foundation. Strategieonderzoek moet aansluiten op de bestaande strategy, research, risk en runtime modules.

## Doel

Maak strategieontwikkeling en portfolioselectie systematischer:

- strategieen definieren via bestaande DSL/pluginstructuur
- strategieen testen via scenario, walk-forward en Monte Carlo
- strategieen vergelijken via shadow tournaments
- strategieen promoten of afbouwen via lifecycle governance
- portfolio allocatie verbeteren zonder risk safeguards te verzwakken
- researchresultaten vertalen naar paper-only experiments voordat live ooit betrokken raakt

## Belangrijkste bestaande bouwstenen

- `src/strategy/strategyRouter.js`: evaluatie van breakout, trend, mean reversion, VWAP, liquidity sweep, OI/funding, range-grid en meer.
- `src/strategies/pluginInterface.js`: pluginvalidatie en normalisatie.
- `src/strategies/strategyRegistry.js`: registry en status per plugin.
- `src/research/strategyDsl.js`: normalisatie, validatie, fingerprint en summary van strategie-DSL.
- `src/research/scenarioLab.js`: scenario bouwen, offline runnen en vergelijken.
- `src/research/strategyExperimentRegistry.js`: experimenten en metrics.
- `src/research/walkForwardOptimizer.js`: walk-forward optimizer.
- `src/research/monteCarloRiskSimulator.js`: Monte Carlo risk.
- `src/research/realityGapDetector.js`: reality-gap detectie.
- `src/runtime/shadowStrategyTournament.js`: challenger versus champion vergelijking.
- `src/runtime/strategyRetirementEngine.js`: lifecycle, cooldown, retirement en anti-overfit.
- `src/runtime/opportunityCostAnalyzer.js`: opportunity cost van open posities versus candidates.
- `src/runtime/portfolioScenarioStress.js`: portfolio stress scenario's.
- `src/risk/portfolioOptimizer.js`: portfolio optimalisatie.
- `src/risk/portfolioCrowding.js`: crowding/exposure analyse.
- `src/risk/riskOfRuin.js`: risk-of-ruin.

## Niet dubbel bouwen

Niet opnieuw bouwen:

- geen alternatieve strategy router naast `strategyRouter`
- geen tweede strategy DSL naast `strategyDsl`
- geen apart research registry naast `strategyExperimentRegistry` en `researchRegistry`
- geen parallelle retirement engine
- geen portfolio optimizer die risk manager omzeilt
- geen threshold-tuning om trades te forceren

Wel doen:

- bestaande researchonderdelen in een volledige workflow verbinden
- portfolio allocatie uitbreiden met evidence en stress
- experimenten reproduceerbaar en terugvindbaar maken
- strategy lifecycle zichtbaarder maken voor operator en report

## Bevindingen uit analyse

1. `strategyRouter.js` bevat veel strategie-families, maar uitbreiding via plugins is nog minimaal.
2. `strategyDsl.js` is geschikt om strategievoorstellen te normaliseren en te valideren, maar kan sterker gekoppeld worden aan experiments.
3. Scenario, walk-forward en Monte Carlo bestaan, maar zijn relatief klein en verdienen een orchestrated research pipeline.
4. `shadowStrategyTournament` kan challengers vergelijken, maar kan worden uitgebreid met portfolio-impact en regret-analyse.
5. Strategy retirement bestaat al met anti-overfit en lifecycle triggers, maar researchresultaten kunnen beter worden gebruikt voor cooldown/retest/promote.
6. Opportunity cost en portfolio stress zijn aanwezig, maar kunnen meer invloed krijgen op allocatie zonder safeguards te verzwakken.

## Gewenste eindstaat

Een nieuwe strategie of strategie-aanpassing doorloopt:

- DSL/plugin validatie
- fingerprint en versioning
- scenario pack
- walk-forward windows
- Monte Carlo risk
- shadow tournament
- paper experiment
- lifecycle decision
- portfolio allocation review
- promotion dossier

## Fase 1 - Strategy Experiment Workflow

Taken:

- Maak een workflow bovenop `strategyDsl`, `strategyExperimentRegistry` en `strategyRegistry`.
- Leg per experiment vast:
  - strategyId
  - strategyVersion
  - configHash
  - mode
  - symbols
  - regimes
  - start/end time
  - evidence links
  - rollback condition
- Voeg validatie toe dat experimenten alleen bestaande DSL/pluginstructuur gebruiken.

Acceptatiecriteria:

- Geen experiment zonder fingerprint.
- Geen experiment zonder mode-scope.
- Experimentresultaten zijn reproduceerbaar.

## Fase 2 - Scenario Pack Library

Taken:

- Breid `scenarioLab` uit met scenario packs:
  - sudden volatility spike
  - liquidity collapse
  - trend continuation
  - range chop
  - funding squeeze
  - exchange data stale
  - portfolio correlation shock
- Koppel scenario packs aan strategy families.
- Laat scenario output aangeven:
  - expected behavior
  - actual behavior
  - safety violations
  - opportunity misses

Acceptatiecriteria:

- Scenario packs zijn deterministisch.
- Scenario's gebruiken bestaande replay/data fixtures waar mogelijk.
- Safety violations blokkeren promotion.

## Fase 3 - Walk-forward en Reality-gap Pipeline

Taken:

- Verbind `walkForwardOptimizer` met `realityGapDetector`.
- Voeg consistency metrics toe:
  - window consistency
  - regime consistency
  - symbol generalization
  - drawdown stability
  - false positive/negative balance
- Maak reality-gap zichtbaar wanneer paper/replay performance niet overeenkomt met live-observatie of market conditions.

Acceptatiecriteria:

- Walk-forward succes op een enkel venster is onvoldoende voor promotion.
- Reality-gap resulteert in observe/cooldown/retest, niet in automatische live actie.
- Tests dekken inconsistent en low-sample resultaat.

## Fase 4 - Portfolio-aware Strategy Tournament

Taken:

- Breid `shadowStrategyTournament` uit met portfolio impact:
  - exposure cluster
  - correlation/crowding
  - opportunity cost
  - risk-of-ruin contribution
  - capital governor impact
- Vergelijk challengers niet alleen op score, maar ook op portfolio health.
- Laat tournament resultaten doorstromen naar strategy lifecycle.

Acceptatiecriteria:

- Beste individuele strategie kan verliezen als portfolio risico verslechtert.
- Tournament output bevat duidelijke reasons.
- Geen directe executie op tournament result.

## Fase 5 - Adaptive Portfolio Allocator

Taken:

- Bouw bovenop `portfolioOptimizer`, `portfolioCrowding`, `capitalGovernor`, `capitalPolicyEngine` en `opportunityCostAnalyzer`.
- Voeg paper-only allocator experiments toe:
  - equal risk
  - quality weighted
  - regime weighted
  - opportunity cost aware
  - drawdown pressure aware
- Meet allocatorresultaten in paper/replay voordat live betrokken wordt.

Acceptatiecriteria:

- Allocator kan risk manager niet overslaan.
- Live mode blijft strikter.
- Allocatiebesluit bevat risk reasons en opportunity reasons.

## Fase 6 - Strategy Lifecycle Board

Taken:

- Maak lifecycle states zichtbaarder:
  - candidate
  - shadow
  - paper_active
  - active
  - cooling_down
  - retest_required
  - retired
- Toon per strategie:
  - waarom actief
  - waarom afgekoeld
  - waarom retired
  - welke retest nodig is
  - welke evidence ontbreekt
- Koppel lifecycle board aan report/dashboard.

Acceptatiecriteria:

- Geen "dead strategy" blijft onzichtbaar.
- Operator kan zien waarom een strategie niet meer meedoet.
- Retest requirements komen uit bestaande lifecycle logic.

## New features

- Strategy Experiment Workflow.
- Scenario Pack Library.
- Walk-forward Reality-gap Pipeline.
- Portfolio-aware Strategy Tournament.
- Paper-only Adaptive Portfolio Allocator.
- Strategy Lifecycle Board.
- Strategy regret en opportunity-cost analytics.

## Verificatiecommando's

Minimaal:

- `npm.cmd run check:imports`
- `npm.cmd test`
- `npm.cmd run backtest`

Aanvullend:

- `npm.cmd run report`
- `npm.cmd run feature:audit`
- `npm.cmd run once`

## Definitie van klaar

Deze roadmap is pas klaar wanneer:

- strategy experiments reproduceerbaar zijn
- scenario/walk-forward/reality-gap evidence bestaat
- portfolio impact onderdeel is van strategy comparison
- allocator experiments paper-only en risk-safe zijn
- lifecycle status zichtbaar is
- strategy promotion/retirement evidence-based is

Na volledige uitvoering en verificatie moet dit bestand worden verplaatst naar `docs/voltooid/`.
