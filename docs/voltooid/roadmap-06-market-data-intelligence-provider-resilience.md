# Roadmap 06 - Market Data Intelligence en Provider Resilience

Status: voltooid  
Voltooid op: 2026-05-17  
Aanmaakdatum: 2026-05-17  
Analysebasis: volledige codebase-inspectie, `docs/`, `docs/voltooid/`, debug-inventaris, runtime market-data modules, dashboard API-contracten en REST-audit.

## Eerst gecontroleerd

Voor deze roadmap is eerst gekeken in:

- `docs/`
- `docs/voltooid/`

Daar staan al voltooide roadmaps voor no-trade observability, paper/live execution parity, dashboard/readmodel truth, storage/replay observability en codebase consolidation/feature governance. Deze roadmap bouwt daarom geen tweede trading-funnel, dashboard-readmodel, paper/live paritylaag of feature-governance-systeem. Alle voorstellen moeten aansluiten op bestaande modules.

## Doel

Maak de marktdata-keten slimmer, controleerbaarder en veerkrachtiger, zodat de bot per symbool kan uitleggen:

- welke databronnen actueel zijn
- welke bronnen degraded zijn
- welke bron dominant is voor een beslissing
- welke bron alleen ondersteunend is
- wanneer REST-fallback acceptabel is
- wanneer streamdata betrouwbaar genoeg is
- wanneer een kandidaat niet op datakwaliteit mag vertrouwen
- welke provider of feed de scanner beperkt

Het doel is niet om meer trades af te dwingen. Het doel is om marktdata als expliciete inputkwaliteit te behandelen voordat strategie, AI-score, risico en executie handelen.

## Belangrijkste bestaande bouwstenen

De codebase heeft al veel onderdelen die hiervoor gebruikt moeten worden:

- `src/runtime/marketScanner.js`: scanner, universumopbouw, tradability, candles, ranking en candidate enrichment.
- `src/runtime/scanPlanner.js`: lightweight snapshots, deep-scan plan, stream-first scanlogica.
- `src/runtime/universeSelector.js`: selectie en rotatie van symbolen.
- `src/runtime/universeScorer.js`: scoring op runtime, journal en telemetrie.
- `src/runtime/dataFreshnessScore.js`: freshness-score voor markt, news, recorder en stream.
- `src/runtime/dataQualityScoreV2.js`: candle/ticker/orderbook/provider kwaliteitscheck.
- `src/runtime/streamCoordinator.js`: public streams, local order book, user stream, listen key en stream telemetry.
- `src/runtime/streamFreshnessMonitor.js`: stream freshness per symbool.
- `src/runtime/streamHealthEvidence.js`: stream health, REST-fallbackdruk en kandidaatannotaties.
- `src/runtime/apiDegradationPlanner.js`: degradatielevel, allowed modes, blocked actions en evidence.
- `src/runtime/externalFeedRegistry.js`: externe feed state, cooldown, success/failure en degradation summary.
- `src/market/marketProviderHub.js`: hub voor derivatives, macro, stablecoin, microstructure, execution feedback en cross-exchange context.
- `src/market/derivativesMatrix.js`: funding/open-interest matrix en squeeze/unwind context.

## Niet dubbel bouwen

Niet opnieuw bouwen:

- geen tweede `dataQualityScoreV2`
- geen tweede `streamHealthEvidence`
- geen tweede `apiDegradationPlanner`
- geen nieuwe parallelle market scanner naast `marketScanner` en `scanPlanner`
- geen dashboard-readmodel naast de bestaande dashboard snapshot/readmodel flow
- geen aparte provider registry naast `externalFeedRegistry` en `marketProviderHub`

Wel doen:

- bestaande scores samenbrengen in een expliciete data-intelligence laag
- lineage en confidence per kandidaat uitbreiden
- provider degraded states beter zichtbaar maken
- REST-auditpunten omzetten naar concrete migratie- en acceptatiecriteria

## Bevindingen uit analyse

1. De scanner en providerlaag zijn rijk, maar data confidence is nog verdeeld over meerdere plekken.
2. Stream health, freshness, data quality en provider health bestaan apart, maar er is ruimte voor een samengevoegd per-symbol verdict.
3. `rest:audit` rapporteert nog review-required en critical REST-classificaties, vooral rond kritieke reconcile/user-data of cache/static calls.
4. `apiDegradationPlanner` kan al degraded modes bepalen, maar kan sterker worden verbonden met scannerbudget, scanprioriteit en candidate quality.
5. `externalFeedRegistry` bevat feed-cooldown en failure-detectie, maar kan meer bron-lineage leveren aan beslissing en dashboard.
6. `marketProviderHub` heeft meerdere contextproviders, maar mist nog een operatorgerichte uitleg waarom een provider wel/niet beslissend was.
7. De dashboard API-contracten slagen, dus uitbreidingen moeten contractueel worden toegevoegd en getest in plaats van losse payloadvelden te introduceren.

## Gewenste eindstaat

Elke kandidaat, scanner entry en dashboard market-state kan het volgende tonen:

- `dataConfidence`: 0..1 score met harde redenen
- `sourceLineage`: gebruikte bron per inputgroep
- `freshnessStatus`: fresh, stale, missing of degraded
- `streamAuthority`: stream, rest_fallback, cached of unavailable
- `providerQuorum`: genoeg onafhankelijke bronnen of niet
- `decisionImpact`: welke dataproblemen entry blokkeren, verlagen of alleen annoteren
- `operatorNote`: korte uitleg in gewone taal

## Fase 1 - Data Intelligence Contract

Taken:

- Definieer een contract voor `MarketDataIntelligenceSnapshot`.
- Hergebruik `dataQualityScoreV2`, `scoreDataFreshness`, `buildStreamHealthEvidence`, `externalFeedRegistry.buildSummary` en `marketProviderHub`.
- Voeg per symbool een compact verdict toe:
  - status
  - confidence
  - hardBlockers
  - softWarnings
  - staleInputs
  - dominantSource
  - fallbackSource
  - evidence
- Leg vast welke velden alleen diagnostisch zijn en welke velden trading mogen blokkeren.

Acceptatiecriteria:

- Geen duplicatie van bestaande scorefuncties.
- Unit tests voor statusclassificatie.
- Snapshot blijft serialiseerbaar en dashboard-safe.
- Paper mode gebruikt dezelfde observability als live, maar live mag striktere blokkades houden.

## Fase 2 - Provider Quorum en Bron-Lineage

Taken:

- Voeg provider quorum toe voor optionele externe context:
  - derivatives
  - stablecoin flow
  - macro context
  - microstructure
  - cross-exchange divergence
  - execution feedback
- Label elke provider als:
  - required
  - preferred
  - optional
  - diagnostic_only
- Laat `marketProviderHub` per provider aangeven:
  - lastSuccessAt
  - lastFailureAt
  - cooldownUntil
  - degradationReason
  - confidenceContribution
- Voeg lineage toe aan candidates zodat later zichtbaar is welke bron de score beinvloedde.

Acceptatiecriteria:

- Candidate bevat bron-lineage zonder grote payloadgroei.
- Ontbrekende optionele provider veroorzaakt geen fake hard block.
- Vereiste bron mist of is stale en wordt duidelijk gemarkeerd.

## Fase 3 - Stream-first Scanner Hardening

Taken:

- Verbind `scanPlanner` sterker met `streamHealthEvidence`.
- Laat deep scans automatisch kleiner worden bij REST-rate pressure.
- Laat scanprioriteit stijgen voor:
  - open positions
  - near-threshold candidates
  - stale symbols met recente goede setups
  - symbols waar streamdata sterk is maar REST beperkt
- Voeg reason codes toe wanneer een symbool niet diep gescand wordt.
- Bouw regressietests voor scanplan onder:
  - stream fresh
  - stream stale
  - REST limited
  - provider outage
  - mixed data quality

Acceptatiecriteria:

- Scanner kan uitleggen waarom symbolen wel/niet deep scanned zijn.
- REST-limieten leiden tot gedegradeerd maar verklaarbaar gedrag.
- Geen nieuwe calls om auditfouten te maskeren.

## Fase 4 - REST-Audit Remediation Plan

Taken:

- Classificeer alle `rest:audit` review-required punten in:
  - critical_reconcile
  - exchange_info/cache_static
  - user_data_stream_required
  - acceptable_snapshot_call
  - needs_throttle_or_cache
- Maak per callsite een migratiebesluit:
  - stream replacement
  - cached static data
  - budget governed REST
  - keep with explicit reason
- Voeg tests toe die voorkomen dat nieuwe kritieke REST-calls zonder classificatie binnenkomen.

Acceptatiecriteria:

- `npm run rest:audit` heeft minder review-required punten of heeft expliciete allowlist met reden.
- Kritieke live/reconcile REST-callers zijn zichtbaar in dashboard/report.
- Geen stille fallback naar ongebudgetteerde REST-calls.

## Fase 5 - Market Data SLO Dashboard

Taken:

- Voeg een compacte market-data SLO-sectie toe aan bestaande dashboard flow.
- Toon:
  - stream freshness
  - REST pressure
  - provider quorum
  - stale symbols
  - top degraded feeds
  - top symbols blocked by data quality
- Koppel operator runbooks aan data-degradatie:
  - wait
  - refresh metadata
  - reduce universe
  - switch to paper-only observation
  - review exchange connectivity

Acceptatiecriteria:

- Dashboard toont geen losse bronstatus zonder interpretatie.
- Stale data kan niet als actueel worden gelezen.
- UI gebruikt bestaande `/api/snapshot`/normalizer patronen.

## Fase 6 - Provider Chaos en Replay

Taken:

- Voeg replay/chaos fixtures toe voor provider outages.
- Test scenario's:
  - exchange ticker stale
  - order book missing
  - derivatives provider offline
  - stream reconnect storm
  - REST rate limited
  - external feed cooldown actief
- Gebruik bestaande replay/chaos lab waar mogelijk.

Acceptatiecriteria:

- Data-intelligence verdicts zijn deterministisch in replay.
- Geen live-only codepad nodig voor testdekking.
- Incident reports kunnen providerdegradatie reconstrueren.

## New features

- Per-symbol Market Data Confidence.
- Provider quorum verdict.
- Source-lineage badges voor candidates.
- REST-audit remediation board.
- Stream-first scan budget planner.
- Provider outage replay pack.
- Market Data SLO paneel in dashboard.

## Verificatiecommando's

Minimaal:

- `npm.cmd run check:imports`
- `npm.cmd run debug:api-contracts`
- `npm.cmd run rest:audit`
- `npm.cmd test`

Aanvullend wanneer scanner of dashboard wijzigt:

- `npm.cmd run once`
- `npm.cmd run dashboard`
- `npm.cmd run smoke:dashboard`

## Definitie van klaar

Deze roadmap is pas klaar wanneer:

- data confidence per kandidaat zichtbaar is
- provider degraded states niet stil blijven
- REST-auditpunten verklaard of verminderd zijn
- stream-first scanbudget aantoonbaar werkt
- dashboard marktdata-status niet misleidend is
- tests de belangrijkste degradation scenario's dekken

Na volledige uitvoering en verificatie moet dit bestand worden verplaatst naar `docs/voltooid/`.
