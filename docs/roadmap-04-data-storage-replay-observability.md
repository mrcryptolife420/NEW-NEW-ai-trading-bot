# Roadmap 04 - Data, Storage, Replay en Observability

## Doel

Maak runtime state, journal, audit events, recorder files, market history en replay traces consistent genoeg om tradinggedrag te bewijzen en regressies reproduceerbaar te maken.

## Analysebasis

Geinspecteerde hoofdmodules:

- `src/storage/stateStore.js`
- `src/storage/readModelStore.js`
- `src/storage/auditLogStore.js`
- `src/storage/marketHistoryStore.js`
- `src/storage/recorderIntegrityAudit.js`
- `src/runtime/dataRecorder.js`
- `src/runtime/persistenceCoordinator.js`
- `src/runtime/replayDeterminism.js`
- `src/runtime/replayLabService.js`
- `src/runtime/goldenReplayPackGenerator.js`
- `src/runtime/marketHistory.js`

Er bestaan al migraties, snapshot manifests, corrupt-file quarantine, data recorder buckets, replay traces en readmodel rebuilds. De nuttigste verbetering is bron- en freshness-consistentie tussen deze bestaande stores.

## Niet dubbel bouwen

- Gebruik `StateStore` voor runtime/journal/model persistence.
- Gebruik `DataRecorder` voor JSONL history en dataset curation.
- Gebruik `ReadModelStore` als query/readmodel-laag, niet losse dashboard parsers.
- Gebruik `AuditLogStore` voor operator en decision audit events.
- Gebruik bestaande replay modules voor determinisme en incident replay.

## Fase 1 - Storage source-of-truth matrix

- Leg per datatype vast welke store eigenaar is: runtime state, journal trades, audit events, market snapshots, replay traces, readmodel tables.
- Voeg docs/debug inventory output toe die deze matrix kan genereren.
- Markeer velden die uit runtime cache komen versus persisted truth.
- Voorkom dat dashboard data direct uit recorder history leest als readmodel de eigenaar hoort te zijn.

## Fase 2 - Manifest en integrity checks

- Breid snapshot manifests uit met hashes, source counts, schema versions en generatedAt.
- Laat `recorderIntegrityAudit` stale, missing, corrupt en partial buckets apart rapporteren.
- Voeg checks toe voor journal-readmodel count drift en trade-id mismatch.
- Houd quarantine expliciet zichtbaar met file, reason en next safe action.

## Fase 3 - Replay coverage voor blockers

- Zorg dat rejected decisions en blockers replaybaar worden met genoeg context: market snapshot, features, score, threshold, reason codes en risk inputs.
- Maak replay coverage zichtbaar per strategy family, regime, session en blocker category.
- Voeg golden replay packs toe voor de belangrijkste no-trade blockers.
- Laat feature/risk changes falen wanneer golden replay root reasons onverwacht veranderen zonder review.

## Fase 4 - Data quality en provider lineage

- Koppel market provider status, fallback source, cache age en request-budget state aan candidate evidence.
- Maak degraded external feeds zichtbaar als data quality component, niet als generieke low confidence.
- Laat stale market snapshots niet dezelfde status krijgen als missing snapshots.
- Voeg per symbol coverage toe voor candle history, book data, news context en derivatives/reference venue context.

## Fase 5 - Retention en rebuild ergonomie

- Definieer retention per bucket: cycle, decisions, trades, replay, news, context, dataset curation.
- Maak readmodel rebuild idempotent en operator-visible.
- Voeg een `doctor` sectie toe die storage health samenvat zonder grote JSON dumps.
- Houd runtime directories buiten git en bevestig dat docs/scripts nooit runtime data committen.

## Acceptatiecriteria

- Elk dashboard/readmodel trade count verschil heeft een diagnose.
- Replay van een blocked candidate kan de originele primary reason reconstrueren.
- Corrupt of stale storage wordt niet stil genegeerd.
- Data provider degradatie is zichtbaar in candidate quality en operator health.

## Validatiecommando's

- `npm run test:storage`
- `npm run readmodel:rebuild`
- `npm run readmodel:dashboard`
- `npm run debug:deps`
- `npm run report`
