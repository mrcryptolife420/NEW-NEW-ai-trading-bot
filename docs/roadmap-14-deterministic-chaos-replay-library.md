# Roadmap 14 - Deterministic Chaos Replay Library

Status: actief
Analyse datum: 2026-05-18
Scope: replay determinism, golden packs, chaos lab, incident replay, regression fixtures.

## Analysebasis

Gebaseerd op:

- `src/runtime/replayDeterminism.js`
- `src/runtime/goldenReplayPackGenerator.js`
- `src/runtime/replayChaosLab.js`
- `src/runtime/incidentReplayLab.js`
- `src/runtime/marketReplayEngine.js`
- `src/runtime/replayPackManifest.js`
- `src/runtime/replayPackScoring.js`
- `src/runtime/tradeReplayTimeline.js`
- `src/runtime/vetoReplayCoverage.js`
- `src/storage/dataLake.js`
- `test/replayDeterminism.tests.js`
- `test/goldenReplayPackGenerator.tests.js`
- `test/incidentReplayLab.tests.js`
- `test/vetoReplayCoverage.tests.js`

Niet dupliceren: roadmap 04 in `docs/voltooid` ging over data/storage/replay observability. Deze roadmap gaat specifiek over een curated chaos replay library die bugs als regressie-fixtures bewaart.

## Probleemstelling

Er bestaan veel replay- en incidentmodules, maar de volgende stap is een vaste bibliotheek met scenario's die elke kritieke bug of risicosituatie reproduceerbaar maakt:

- stream warmup zonder local order book
- request-budget cooldown storm
- lifecycle stop/restart race
- stale readmodel snapshot
- paper execution approved maar persistence faalt
- live protection cancel ambiguous
- exchange truth mismatch
- model confidence collapse door stale features
- market crash/news shock blockers

## Doel

Elke belangrijke productieachtige fout moet als deterministic replay scenario bestaan, met expected outputs en safety assertions.

## Fase 1 - Scenario Taxonomie

Definieer replay scenario categorieen:

- market data degradation
- provider cooldown
- lifecycle race
- paper execution lifecycle
- live reconcile/protection
- model confidence/root blocker
- dashboard snapshot drift
- storage corruption/recovery
- operator mutation
- fast execution safety

Maak `src/runtime/replayScenarioCatalog.js`.

## Fase 2 - Fixture Pack Format

Standaardiseer fixture packs:

- manifest
- market events
- runtime state
- env/config hash
- expected decisions
- expected blockers
- expected dashboard summary
- expected safety state
- expected audit events

Voeg schema-validatie toe zonder zware dependency.

## Fase 3 - Bug-to-Replay Workflow

Maak een workflow:

- incident log selecteren
- relevante snapshots extraheren
- secrets redacteren
- replay pack genereren
- expected behavior vastleggen
- test genereren

CLI:

- `node src/cli.js replay:pack:create`
- `node src/cli.js replay:pack:run`
- `node src/cli.js replay:pack:diff`

## Fase 4 - Chaos Mutators

Maak mutators:

- drop stream events
- delay REST calls
- duplicate operator mutation
- stale readmodel
- corrupt one journal entry
- provider cooldown active
- exchange response partial
- time drift jump

Elke mutator moet:

- deterministic seeded zijn
- expected safety output hebben
- live execution onmogelijk maken

## Fase 5 - CI/QA Integratie

Voeg scripts toe:

- `npm run test:replay-packs`
- `npm run test:chaos-regression`

Koppel aan `qa:strict` nadat runtime acceptabel blijft.

## Nieuwe Features

- Replay scenario catalog.
- Chaos mutator library.
- Bug-to-replay generator.
- Replay diff report.
- Dashboard panel met laatst gefaalde replay pack.

## Tests

Toevoegen:

- pack schema validatie
- deterministic output bij zelfde seed
- mutators kunnen geen live orderpad activeren
- lifecycle race replay blijft groen
- request-budget cooldown storm replay logt gededuped
- corrupt storage replay degradeert veilig

Te draaien:

- `npm.cmd test -- --grep=replay`
- `npm.cmd test -- --grep=chaos`
- `npm.cmd test -- --grep=incident`
- `npm.cmd run test:safety`

## Definition of Done

- Minimaal 10 scenario packs bestaan.
- Elke recente bugklasse heeft replay-dekking.
- Replay output bevat decision, blocker, safety en dashboard verwachtingen.
- Chaos mutators zijn deterministic.
- Replay tests zijn onderdeel van QA.
