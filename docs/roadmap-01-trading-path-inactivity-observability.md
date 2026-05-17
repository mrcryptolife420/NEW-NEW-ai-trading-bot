# Roadmap 01 - Trading Path en Inactiviteit Observability

## Doel

Maak elke no-trade, reject, blocker en execution-uitkomst herleidbaar van marktdata tot dashboard, zonder nieuwe parallelle trading-pipelines te bouwen.

## Analysebasis

Geinspecteerde hoofdmodules:

- `src/runtime/tradingBot.js`
- `src/runtime/cycleRunner.js`
- `src/runtime/decisionPipeline.js`
- `src/strategy/strategyRouter.js`
- `src/risk/riskManager.js`
- `src/runtime/rootBlockerOrchestrator.js`
- `src/runtime/tradingPathHealth.js`
- `src/runtime/dataRecorder.js`
- `src/storage/readModelStore.js`
- `src/dashboard/public/app.js`

De codebase bevat al veel losse verklarende onderdelen: decision audit, root blockers, trading path health, rejected candidate diagnostics, paper learning en dashboard summaries. De grootste verbetering zit daarom niet in nog een nieuwe analyzer, maar in een vaste end-to-end evidence chain.

## Niet dubbel bouwen

- Gebruik `decisionPipeline.js` als centrale plek voor decision-outcome audit.
- Gebruik `rootBlockerOrchestrator.js` voor primaire blockers in plaats van nieuwe blocker-prioriteitstabellen.
- Gebruik `tradingPathHealth.js` voor bot-alive-maar-functioneel-inactief diagnoses.
- Gebruik `dataRecorder.js` en `readModelStore.js` voor persistente analyse, niet losse runtime-only counters.
- Breid `reasonRegistry.js` en bestaande risk reason codes uit voordat nieuwe reason strings worden toegevoegd.

## Fase 1 - Decision funnel contract

- Definieer een compact decision funnel contract met vaste stages: `market_data`, `feature_build`, `strategy_candidate`, `model_score`, `risk_gate`, `execution_plan`, `broker_attempt`, `persistence`, `dashboard_visibility`.
- Laat `decisionPipeline.js` per cycle het hoogste bereikte stadium en de eerste blokkade vastleggen.
- Laat `cycleRunner.js` persistence-fouten al vroeg koppelen aan dezelfde funnel-id.
- Zorg dat elke top decision en blocked setup exact een `decisionId`, `cycleId`, `symbol`, `stage`, `primaryReason` en `nextSafeAction` heeft.

## Fase 2 - No-trade root cause boven symptoms

- Laat `rootBlockerOrchestrator.js` globale blockers en symbol blockers koppelen aan de decision funnel.
- Voeg een no-trade summary toe die onderscheid maakt tussen: geen marktdata, geen candidates, candidates rejected, risk blocked, execution blocked, persistence drift en dashboard stale.
- Laat `tradingPathHealth.js` alleen root causes rapporteren als ze door runtime/readmodel bewijs worden ondersteund.
- Laat dashboard en CLI dezelfde no-trade status gebruiken.

## Fase 3 - Rejection taxonomy opschonen

- Maak een mapping van bestaande risk, strategy, committee, event, self-heal en execution-cost reasons naar categorieen.
- Normaliseer synoniemen zoals confidence, model confidence, low score en threshold miss naar een gedeelde categorie met behoud van detail.
- Voeg tests toe die bewijzen dat nieuwe reasons niet buiten de registry vallen.
- Maak onbekende reasons zichtbaar als audit warning, niet als stille fallback.

## Fase 4 - Inactiviteit watchdog

- Gebruik de bestaande inactivity watchdog logica in `tradingBot.js` als bron.
- Voeg counters toe voor opeenvolgende cycli zonder candidate, zonder risk allow, zonder broker attempt en zonder persisted trade.
- Stel per mode andere verwachtingen in: paper mag leren en probe-paden tonen; live mag strenger blokkeren maar moet dit expliciet verklaren.
- Toon in status/report/dashboard wanneer de bot draait maar geen functioneel tradingpad bereikt.

## Fase 5 - Replay en regressie

- Bouw fixtures voor minstens vier scenario's: data missing, candidate rejected, risk blocked, paper execution reached.
- Koppel tests aan bestaande suites: `decisionPipeline.tests.js`, `tradingPathHealth.tests.js`, `rootBlockerOrchestrator.tests.js`, `paperTradeLifecycleContract.tests.js`.
- Voeg een smoke check toe die bewijst dat een cycle altijd een decision funnel summary oplevert.

## Acceptatiecriteria

- Elke cycle heeft een herleidbare funnel summary.
- Zero-paper-trade perioden tonen een concrete code-backed reden.
- Dashboard, status en readmodel spreken dezelfde primaire blocker uit.
- Nieuwe blocker- of reject-reasons komen uit een registry of veroorzaken een test failure.

## Validatiecommando's

- `npm run feature:audit`
- `npm run test -- --grep=decision`
- `npm run test -- --grep=tradingPathHealth`
- `npm run once`
- `npm run status`
