# Roadmap 36 - Market Data Trust Arbitration v2

## Analysebasis
- `src/market/marketProviderHub.js`, `src/runtime/providerBudgetOrchestrator.js` en `src/runtime/providerSloRegistry.js` beheren providers en budgetten.
- `src/binance/client.js` heeft cache, request budget en fallback telemetry.
- `src/runtime/dataFreshnessScore.js`, `src/runtime/dataQualityScoreV2.js` en `src/runtime/streamFreshnessMonitor.js` meten data quality.
- Logs tonen dat provider cooldowns en stream fallback directe trading impact hebben.

## Probleem
Er zijn losse freshness, budget en provider modules. De bot heeft een sterker arbitragebesluit nodig: welke data is betrouwbaar genoeg voor entry, exit, reconcile of dashboard?

## Doel
Maak een trust arbitration laag die per data use-case beslist welke bron leidend is en welke degradatie toegestaan is.

## Niet dubbel bouwen
Roadmap 18 ging over provider budget SLO. Deze roadmap gaat over data-trust besluitvorming per trading use-case.

## Scope
- Trust policy per use-case:
  - entry signal
  - exit management
  - exchange reconcile
  - dashboard display
  - model learning
  - market scanner
- Bronprioriteit en fallback rules.
- Data conflict handling.

## Fase 1 - Trust policy matrix
- Matrix velden:
  - source
  - freshness TTL
  - minimum confidence
  - fallback allowed
  - conflict behavior
  - trading impact
- Voor exchange/reconcile: REST account truth wint boven cached dashboard state.
- Voor entry: stream + recent klines + book ticker moeten consistent zijn.

## Fase 2 - Source conflict detection
- Detecteer:
  - REST vs stream mismatch
  - stale local order book
  - provider cooldown masking
  - scanner universe stale
  - news/event stale blocker
- Maak conflict reason zichtbaar.

## Fase 3 - Data trust API
- Nieuwe module `dataTrustArbitrator`.
- Output:
  - trusted
  - primarySource
  - fallbackSource
  - conflicts
  - allowedUseCases
  - blockedUseCases
  - requiredRefreshAction

## Fase 4 - Runtime integration
- Entry decisions gebruiken trust gate.
- Reconcile gebruikt strict exchange trust.
- Dashboard toont stale data als stale, niet als current.
- Learning pipeline negeert low-trust samples.

## Fase 5 - Tests
- REST/stream conflict tests.
- Provider cooldown tests.
- Dashboard stale display tests.
- Entry blocked by stale data tests.

## Acceptatiecriteria
- Iedere data-dependent trading action heeft trust decision.
- Stale data kan geen verse status meer simuleren.
- Operator ziet bron, leeftijd en trust impact.
- Learning records krijgen source trust metadata.

## Verwachte files
- `src/runtime/dataFreshnessScore.js`
- `src/runtime/dataQualityScoreV2.js`
- `src/runtime/streamFreshnessMonitor.js`
- `src/market/marketProviderHub.js`
- `src/runtime/tradingBot.js`
- `src/dashboard/public/app.js`
- `test/dataQualityScoreV2.tests.js`
- `test/streamHealthEvidence.tests.js`

