# Volledige Overhaul & Debug Roadmap — AI Trading Crypto Bot

**Project:** `mrcryptolife420/NEW-NEW-ai-trading-bot`
**Datum:** 2026-05-09
**Doel:** één volledige debugronde over de hele codebase: runtime, CLI, config, paper/demo/live execution, Binance-integratie, storage, AI/learning, tests, CI, dashboard/GUI, desktop installer, observability en documentatie.

> Dit document is bewust streng. Eerst alles aantoonbaar stabiel, testbaar en veilig maken. Pas daarna nieuwe trading-features toevoegen.

## Status update 2026-05-09 — vervolgwerk uitgevoerd

Deze vervolgronde heeft de overgebleven P0/P2/P7/P8/P13/P14 foundation-gaten uit de vorige pass afgerond waar ze met lokale code en tests aantoonbaar te bewijzen waren.

- [x] Live preflight is nu beschikbaar via CLI en dashboard API.
- [x] De dashboard Live-knop vraagt eerst `/api/live/preflight` op en schakelt pas naar live als `safeToStartLive === true`.
- [x] Dashboard API-routecontracten controleren nu ook `/api/live/preflight`.
- [x] Dashboard DOM-contracten controleren nu dat live-mode via `requestLiveMode()` en preflight loopt.
- [x] Dashboard smoke gebruikt een injected manager en bewijst `/api/health` plus `/api/live/preflight` zonder zware runtime bootstrap.
- [x] `StateStore.saveSnapshotBundle()` schrijft nu manifest-backed bundles met bytes, schema versions en SHA-256 hashes.
- [x] Startup recovery ruimt incomplete staging/temp snapshotbestanden op en kan manifestcorruptie detecteren.
- [x] Storage recovery tests bewijzen manifestverificatie, corruptiedetectie en cleanup van incomplete stagingfiles.
- [x] Debug/report docs zijn bijgewerkt met de uitgevoerde checks en resterende operatoracties.

Bewijscommando's uit deze vervolgronde:

```powershell
npm run lint
npm run format:check
npm run check:env
npm run check:critical
npm run check:syntax
npm run check:imports
npm run debug:package-scripts
npm run debug:api-contracts
npm run debug:dashboard-dom
npm run smoke:cli
npm run smoke:dashboard
npm run test:smoke
npm test -- --grep="state store"
npm test -- --grep="live preflight"
node src/cli.js live:preflight
```

Bekende resterende operatoractie: `npm run debug:secrets` detecteert lokale waarden in `.env` regels 16-17. Die file is lokaal/operator-owned en is niet door deze pass aangepast.

---

## 0. Debug-principes voor deze overhaul

- [ ] Geen nieuwe trading-feature toevoegen voordat P0 groen is.
- [ ] Elke fix krijgt minimaal één test of smoke-check.
- [ ] Elke bug krijgt een reproduceerbaar commando.
- [ ] Elke live-gerelateerde wijziging blijft standaard safe-by-default.
- [ ] Paper/demo/live mogen nooit onduidelijk door elkaar lopen.
- [ ] Dashboard mag nooit “ready” tonen als de onderliggende runtime kapot of leeg is.
- [ ] Geen “silent fallback” bij expliciet foutieve `.env` waarden.
- [ ] Geen lege kritieke bestanden in `main`.
- [ ] Geen test-runner die succesvol eindigt zonder echte tests te draaien.
- [ ] Geen GUI-knop zonder backend-contracttest.
- [ ] Geen storage-write zonder recoverability test.
- [ ] Geen AI/learning auto-apply zonder rollback en audit trail.
- [ ] Geen incident/debug export met secrets.

---

## 1. Bevestigde kritieke bevindingen

Deze punten moeten als eerste worden aangepakt.

- [x] `src/runtime/tradingBot.js` is leeg, terwijl `BotManager`, CLI en dashboard afhankelijk zijn van `TradingBot`.
- [x] `test/run.js` is leeg, terwijl `package.json` `npm test` naar `node test/run.js` routeert.
- [ ] `src/cli/runCli.js` is extreem breed en importeert veel domeinen tegelijk; één gebroken module kan unrelated commands breken.
- [x] `.env.example` is zeer groot en bevat herhaalde/overlappende config-blokken; duplicate-key detectie is noodzakelijk.
- [ ] Dashboard-server start via `BotManager.init()`, dus dashboard kan kapotgaan door dezelfde runtime-importproblemen.
- [ ] Desktop-app embedt dashboard-server en moet dus apart getest worden op packaged/dev path-resolutie.
- [x] `StateStore.saveSnapshotBundle()` schrijft meerdere bestanden; transactionele manifest/recovery moet harder.
- [x] `DemoPaperBroker` erft van `LiveBroker`; dit vereist extra garanties dat demo/paper nooit live-account state verkeerd labelt of echte live-mode guardrails omzeilt.
- [x] Live guardrails bestaan gedeeltelijk, maar moeten centraal, testbaar en volledig zijn.
- [x] Er zijn veel losse testbestanden aanwezig, maar de centrale runner moet bewijzen dat ze echt worden uitgevoerd.

---

## 2. Definition of Done voor de volledige debugronde

- [ ] `npm ci` werkt schoon.
- [x] `npm run lint` werkt schoon.
- [x] `npm run format:check` werkt schoon.
- [ ] `npm test` draait echte tests en faalt bij 0 tests.
- [ ] `npm run coverage` draait en rapporteert relevante modules.
- [x] `node --check src/cli.js` groen.
- [x] `node --check src/runtime/tradingBot.js` groen.
- [ ] `node src/cli.js doctor` groen in paper mode.
- [ ] `node src/cli.js status` groen in paper mode.
- [ ] `node src/cli.js once` groen in internal paper mode met stubbed/offline market data of gecontroleerde network mode.
- [ ] `node src/cli.js dashboard` start en `/api/health` geeft geldige JSON.
- [ ] Desktop `npm run diagnose` groen.
- [ ] Dashboard frontend laadt zonder console-errors.
- [ ] Alle API-routes hebben minimaal smoke/integration tests.
- [ ] Alle GUI-knoppen hebben backend route-contracttests.
- [x] Live mode blokkeert zonder expliciete acknowledgement, API keys en exchange protection.
- [x] Binance demo spot blijft `paper` labelen, nooit `live`.
- [ ] Geen secret leakage in logs, dashboard payloads, incident exports of test snapshots.
- [x] CI draait op elke push en PR.
- [x] Er is een release/debug rapport in `docs/DEBUG_OVERHAUL_REPORT.md`.

---

# FASE P0 — Repo moet weer starten en testen

## P0.1 Kritieke import-integriteit

### Doel
Zorgen dat de codebase niet meer kan mergen met lege of niet-importeerbare kernbestanden.

### Taken

- [ ] Controleer of `src/runtime/tradingBot.js` werkelijk leeg is in `main`.
- [ ] Herstel `TradingBot` export:
  - [ ] `export class TradingBot { ... }`
  - [ ] Constructor accepteert `{ config, logger }`.
  - [ ] Minimale methodes bestaan: `init`, `close`, `refreshAnalysis`, `runCycle`, `getStatus`, `runDoctor`, `getReport`, `getAdaptiveLearningStatus`.
  - [ ] `runCycle` routeert via `runTradingCycle` of veilige core-stub tijdens herstel.
  - [ ] `runCycleCore` bestaat of wordt gecontroleerd vervangen.
- [ ] Voeg `test/importIntegrity.tests.js` toe.
- [ ] Test dat alle kritieke modules importeerbaar zijn:
  - [ ] `src/cli.js`
  - [ ] `src/cli/runCli.js`
  - [ ] `src/runtime/tradingBot.js`
  - [ ] `src/runtime/botManager.js`
  - [ ] `src/dashboard/server.js`
  - [ ] `src/execution/paperBroker.js`
  - [ ] `src/execution/demoPaperBroker.js`
  - [ ] `src/execution/liveBroker.js`
  - [ ] `src/storage/stateStore.js`
  - [ ] `src/risk/riskManager.js`
- [ ] Voeg CI-check toe die faalt als kritieke files 0 bytes of bijna leeg zijn.
- [ ] Voeg `scripts/check-critical-files.mjs` toe.

### Acceptatiecriteria

- [ ] `node --check src/runtime/tradingBot.js` slaagt.
- [ ] `node -e "import('./src/runtime/tradingBot.js').then(m=>console.log(typeof m.TradingBot))"` print `function`.
- [ ] `node src/cli.js status` faalt niet meer door importfout.
- [ ] CI faalt als `tradingBot.js` leeg is.

## P0.2 Echte test-runner maken

### Doel
`npm test` moet betrouwbaar zijn en nooit vals groen geven.

### Taken

- [ ] Vervang lege `test/run.js` door echte runner.
- [ ] Runner moet alle `test/**/*.test.js` en `test/**/*.tests.js` bestanden ontdekken.
- [ ] Runner moet flags ondersteunen: `--unit`, `--integration`, `--safety`, `--desktop`, `--grep=<tekst>`, `--bail`.
- [ ] Runner moet counters bijhouden: passed, failed, skipped, total.
- [ ] Runner moet falen als `total === 0`.
- [ ] Runner moet testduur per bestand tonen.
- [ ] Runner moet hanging tests detecteren met timeout.
- [ ] Runner moet unhandled rejections als fail markeren.
- [ ] Bestaande testbestanden normaliseren naar één testregistratiecontract.
- [ ] Smoke-test toevoegen: runner faalt wanneer testmap leeg is.

### Acceptatiecriteria

- [ ] `npm test` draait minstens één echte test.
- [ ] `npm test -- --grep=import` werkt.
- [ ] `npm run test:unit` draait alleen unit tests.
- [ ] `npm run test:integration` draait alleen integration tests.
- [ ] `npm run test:safety` draait alleen safety tests.
- [ ] Bij een failing assert krijgt process exit code `1`.
- [ ] Coverage toont echte codepaden, niet alleen runner-code.

## P0.3 Package scripts en basis QA herstellen

- [ ] Controleer alle scripts uit `package.json`.
- [ ] Elk script moet of werken of expliciet deprecated zijn.
- [ ] `npm run qa` mag pas alle zware audits draaien nadat basistests groen zijn.
- [ ] Voeg lichte scriptgroep toe: `check:syntax`, `check:imports`, `check:env`, `check:critical`, `test:smoke`.
- [ ] Voeg Windows-vriendelijke commando’s toe: `npm.cmd test`, `npm.cmd run qa`.
- [ ] Documenteer exacte volgorde in `docs/DEBUG_COMMANDS.md`.

### Acceptatiecriteria

- [ ] `npm run check:syntax` groen.
- [ ] `npm run check:critical` vangt lege kernbestanden.
- [ ] `npm run qa` geeft duidelijke fout als P0 niet groen is.

---

# FASE P1 — Config en environment hardening

## P1.1 Strict `.env` parsing

### Probleem
Expliciet foute waarden mogen niet stil naar defaults terugvallen.

### Taken

- [ ] Maak strict parsers: `parseNumberStrict`, `parseBooleanStrict`, `parseEnumStrict`, `parseCsvStrict`, `parseUrlStrict`.
- [ ] Verzamel alle config-errors en throw één `ConfigValidationError`.
- [ ] Error bevat env key, ontvangen waarde, verwacht type en veilige voorbeeldwaarde.
- [ ] Defaults alleen gebruiken als key ontbreekt of leeg is.
- [ ] Tests voor ongeldige waarden:
  - [ ] `MAX_OPEN_POSITIONS=abc`
  - [ ] `ENABLE_EXCHANGE_PROTECTION=maybe`
  - [ ] `BOT_MODE=prod`
  - [ ] `DASHBOARD_PORT=-1`
  - [ ] `BINANCE_API_BASE_URL=not-a-url`
- [ ] `doctor` moet config warnings apart tonen.

### Acceptatiecriteria

- [ ] Ongeldige expliciete `.env` stopt startup.
- [ ] `node src/cli.js doctor` toont key-specifieke melding.
- [ ] Geen stille fallback bij operator typo.

## P1.2 Duplicate env key detectie

- [ ] Detecteer duplicate keys in `.env.example`.
- [ ] Detecteer duplicate keys in lokale `.env`.
- [ ] Toon regelnummers.
- [ ] Voeg `npm run check:env` toe.
- [ ] Maak duplicate keys hard fail in CI voor `.env.example`.
- [ ] Maak duplicate keys warning of fail-fast in lokale `.env`, afhankelijk van `STRICT_ENV=true`.

### Verdachte zones om handmatig te inspecteren

- [ ] `WATCHLIST` komt mogelijk meerdere keren voor.
- [ ] `DATA_RECORDER_ENABLED` komt mogelijk meerdere keren voor.
- [ ] `DATA_RECORDER_RETENTION_DAYS` komt mogelijk meerdere keren voor.
- [ ] `MODEL_REGISTRY_*` komt mogelijk meerdere keren voor.
- [ ] `STATE_BACKUP_*` komt mogelijk meerdere keren voor.
- [ ] `SERVICE_*` blokken overlappen mogelijk.

### Acceptatiecriteria

- [ ] `npm run check:env` toont duplicate keys met regelnummers.
- [ ] CI faalt bij duplicates in `.env.example`.
- [ ] Dashboard/config-status toont “env clean” pas als duplicate-free.

## P1.3 Config-profielen opsplitsen

- [ ] Splits `.env.example` op in profielen:
  - [ ] `config/profiles/paper-safe.env.example`
  - [ ] `config/profiles/paper-learn.env.example`
  - [ ] `config/profiles/binance-demo-spot.env.example`
  - [ ] `config/profiles/live-minimal.env.example`
  - [ ] `config/profiles/live-conservative.env.example`
  - [ ] `config/profiles/dev-offline.env.example`
- [ ] Houd root `.env.example` klein en beginner-safe.
- [ ] Voeg profielvalidatie toe: parsebaar, geen duplicate keys, geen live-only keys in paper-only profiel zonder comment, demo endpoint alleen in demo-profiel.
- [ ] Dashboard-profielpreview moet exact tonen welke keys wijzigen.
- [ ] `applyConfigProfile` moet atomic backup + rollback hebben.

### Acceptatiecriteria

- [ ] Nieuwe gebruiker kan starten met `paper-safe`.
- [ ] Demo spot is duidelijk gescheiden van internal paper.
- [ ] Live-profiel vereist expliciete acknowledgement.

---

# FASE P2 — Mode safety: paper, demo en live volledig scheiden

## P2.1 Canonical mode matrix

- [ ] Definieer één mode-matrix in code:
  - [ ] `botMode: paper | live`
  - [ ] `paperExecutionVenue: internal | binance_demo_spot`
  - [ ] `accountProfile: paper | demo | live`
  - [ ] `exchangeProvider: binance`
- [ ] Maak helpers: `isInternalPaper(config)`, `isDemoPaper(config)`, `isLive(config)`, `isLiveUnsafe(config)`.
- [ ] Alle brokers gebruiken dezelfde mode helper.
- [ ] Dashboard toont mode + venue los: `Paper / internal`, `Paper / Binance Demo Spot`, `Live / Binance Spot`.
- [ ] Tests voor alle combinaties.

### Acceptatiecriteria

- [ ] Demo spot wordt nooit als live weergegeven.
- [ ] Internal paper gebruikt nooit private live order endpoints.
- [ ] Live gebruikt nooit paper broker.
- [ ] Paper/demo trades krijgen altijd `brokerMode: "paper"`.

## P2.2 Broker factory expliciet maken

- [ ] Zoek huidige broker-creatie in `TradingBot` herstel/implementatie.
- [ ] Maak of herstel `src/execution/brokerFactory.js`.
- [ ] Factory kiest `PaperBroker`, `DemoPaperBroker` of `LiveBroker` op basis van mode matrix.
- [ ] Factory retourneert diagnostics: broker class, mode, venue, endpoint, private endpoints required.
- [ ] Tests voor alle branches.
- [ ] Voeg hard error toe bij onbekende venue.

### Acceptatiecriteria

- [ ] Eén centrale plek bepaalt broker.
- [ ] Geen verspreide `if botMode`-logica meer.
- [ ] Dashboard/doctor tonen gekozen broker.

## P2.3 Live preflight

- [x] Voeg command toe: `node src/cli.js live:preflight`.
- [ ] Read-only checks: `BOT_MODE=live`, acknowledgement exact correct, API key aanwezig, API secret aanwezig, exchange protection true, geen demo endpoint, geen paper execution venue, account `canTrade=true`, permission `SPOT`, server clock drift ok, open orders leesbaar, OCO/protection supported.
- [x] Geen order plaatsen.
- [x] JSON output machine-readable.
- [x] Dashboard `/api/live/preflight` route toevoegen.
- [x] GUI live-knop disabled als preflight failed.

### Acceptatiecriteria

- [x] Live start geblokkeerd zonder preflight pass.
- [x] Dashboard toont exacte failed check.
- [ ] Preflight heeft unit + integration tests met mocked Binance client.

Notitie 2026-05-09: de preflight heeft nu unitdekking en dashboard route/DOM/smoke contractdekking. Een diepere mocked Binance-client integratietest voor clock drift, open orders en OCO/protection support blijft open.

---

# FASE P3 — Runtime/TradingBot reconstructie en contracten

## P3.1 TradingBot minimale contractlaag

- [ ] Herstel `TradingBot` als centrale orchestrator.
- [ ] Constructor initialiseert config, logger, state store, runtime state, journal, broker, health, audit log en dashboard snapshot builder.
- [ ] `init({ readOnly })` maakt dirs aan, laadt runtime/journal/model, initialiseert broker read-only of full, valideert mode.
- [ ] `close()` sluit streams/resources veilig.
- [ ] `refreshAnalysis()` werkt zonder orders.
- [ ] `getStatus()` retourneert dashboard-safe status.
- [ ] `runDoctor()` retourneert config, broker, storage en runtime health.
- [ ] `getReport()` retourneert report zonder side effects.
- [ ] `runCycle()` routeert naar `runTradingCycle`.
- [ ] `runCycleCore()` bevat pure orchestration en geen dashboard-side effects.

### Acceptatiecriteria

- [ ] BotManager kan `init`, `start`, `stop`, `runCycleOnce`.
- [ ] Dashboard kan starten.
- [ ] Status/doctor/read-only commands vereisen geen private order endpoints in paper internal.
- [ ] `TradingBot` heeft contracttests.

## P3.2 Run cycle auditbaar maken

- [ ] Definieer vaste cycle stages: `load_state`, `refresh_market_data`, `scan_candidates`, `score_candidates`, `risk_verdict`, `execution_intent`, `broker_execution`, `position_management`, `learning_update`, `persist`, `snapshot_refresh`.
- [ ] Elke stage krijgt start time, end time, status, error, input summary en output summary.
- [ ] `runCycleCore` mag errors niet inslikken zonder audit event.
- [ ] Persist-failure na execution wordt apart gemarkeerd.
- [ ] Voeg cycle trace command toe: `trace-cycle --last`, `trace-symbol BTCUSDT`.

### Acceptatiecriteria

- [ ] Elke no-trade heeft traceerbare reden.
- [ ] Elke entry heeft intent + execution result + persist status.
- [ ] Reproduceerbare cycle trace aanwezig in runtime.

## P3.3 Position lifecycle contract

- [ ] Definieer states: `candidate`, `intent_opened`, `entry_submitted`, `entry_filled`, `protection_pending`, `protected`, `open`, `scaleout_pending`, `exit_pending`, `closed`, `reconcile_required`, `manual_review`, `failed`.
- [ ] Alle transitions centraliseren.
- [ ] Illegal transitions hard failen in test.
- [ ] Runtime positions valideren bij load en save.
- [ ] Dashboard toont lifecycle met operatoractie.
- [ ] Paper, demo en live lifecycle tests scheiden.

### Acceptatiecriteria

- [ ] Geen positie zonder `id`, `symbol`, `entryAt`, `quantity`, `entryPrice`.
- [ ] Geen paper position met negative quote balance.
- [ ] Geen live position zonder protection-status wanneer protection vereist is.

---

# FASE P4 — Execution overhaul

## P4.1 PaperBroker hardening

- [ ] Test `ensurePaperState`.
- [ ] Test `validatePaperPortfolioState`.
- [ ] Test buy met normale fill, partial fill, quantity below min, insufficient quote balance, fee/slippage en symbol filters.
- [ ] Test exit met full fill, partial fill safeguard, no filled quantity, PnL math, fee accounting en learning outcome labels.
- [ ] Test scale-out met valid fraction, invalid fraction en after scale-out stop adjustment.
- [ ] Voeg invariant audit toe na elke broker mutation.

### Acceptatiecriteria

- [ ] Paper equity klopt na entry/exit.
- [ ] Fees zijn consistent.
- [ ] Partial exit laat positie veilig open en markeert safeguard.
- [ ] Paper trade records zijn compleet voor learning.

## P4.2 DemoPaperBroker hardening

- [ ] Test dat `DemoPaperBroker` `LiveBroker` gebruikt maar output remapt naar paper.
- [ ] Test `doctor()` geeft `mode: paper`, `executionVenue: binance_demo_spot`.
- [ ] Test entry position remap: `brokerMode: paper`, `executionVenue: binance_demo_spot`, attribution remapped.
- [ ] Test reconcile remap voor closed trades, recovered positions en account mode/venue.
- [ ] Test scale-out remap.
- [ ] Voeg safety test: demo broker mag nooit `botMode=live` configuratie accepteren zonder hard error.

### Acceptatiecriteria

- [ ] Demo trades staan nooit als live in journal.
- [ ] Demo reconcile schrijft geen live labels.
- [ ] Dashboard toont Demo Spot apart.

## P4.3 LiveBroker hardening

- [ ] Unit tests voor protective OCO geometry.
- [ ] Tests voor invalid TP/SL: TP onder mid, stop boven mid, stop limit boven stop trigger, invalid price, invalid quantity.
- [ ] Test execution intent ledger: begin, touch, resolve, fail, ambiguous, duplicate unresolved blocks.
- [ ] Test private stream fallback: REST unavailable + fresh stream = degraded ok; REST unavailable + stale stream = blocked.
- [ ] Test budget governor: private REST pressure blocks recent trades fetch; stream fallback used.
- [ ] Test reconcile: flat position resolution, protective rebuild, orphan order detection, missing runtime symbol, manual review path.
- [ ] Test min-notional exit path.
- [ ] Live integration tests alleen met mocked client.

### Acceptatiecriteria

- [ ] Geen live order call zonder intent.
- [ ] Geen unresolved intent overschrijft nieuwe order.
- [ ] OCO geometry faalt vóór Binance call.
- [ ] Reconcile is evidence-based en auditbaar.

---

# FASE P5 — Risk manager en entry policies

## P5.1 RiskManager contracttests

- [ ] Snapshot tests voor canonical reason codes.
- [ ] Elke blocker heeft code, categorie, severity, human message, paper/live behavior en dashboard label.
- [ ] Test hard safety blockers kunnen niet door paper leniency.
- [ ] Test soft paper blockers mogen alleen probe/shadow worden.
- [ ] Test recovery probe admission.
- [ ] Test capital governor: blocked, recovery, probe allowed, paper leniency, live hard block.
- [ ] Test position guards: max open positions, already open, post-reconcile limits, daily entry budget.
- [ ] Test execution cost policy.
- [ ] Test session/weekend/funding policies.
- [ ] Test data quality/quorum policies.
- [ ] Test drift/self-heal interactions.

### Acceptatiecriteria

- [ ] Elke no-trade reason is deterministisch.
- [ ] Paper mag leren maar safety nooit omzeilen.
- [ ] Live is strenger dan paper in dezelfde scenario’s.

## P5.2 Risk policies opsplitsen

- [ ] Splits grote risk logic verder in `hardSafetyPolicy`, `paperLeniencyPolicy`, `recoveryProbePolicy`, `executionCostPolicy`, `portfolioExposurePolicy`, `sessionRiskPolicy`, `dataQualityPolicy`, `capitalGovernorPolicy`, `liveSafetyPolicy`.
- [ ] Elke policy is pure function waar mogelijk.
- [ ] Geen policy mag broker/order calls doen.
- [ ] Geen policy mag storage writes doen.
- [ ] Policy output naar één `riskVerdict`.

### Acceptatiecriteria

- [ ] `riskManager.js` orkestreert vooral.
- [ ] Unit coverage op elke policy.
- [ ] Reason code registry is single source of truth.

---

# FASE P6 — Market data en Binance client

## P6.1 Binance REST client safety

- [ ] Alle REST calls voorzien van caller metadata.
- [ ] Rate limit state centraal bijhouden.
- [ ] Request budget governor testen.
- [ ] Clock sync testen: drift ok, drift warning, drift block.
- [ ] Signing tests: query order, timestamp, recvWindow, HMAC.
- [ ] Network timeouts instelbaar.
- [ ] Retries alleen op veilige GET endpoints.
- [ ] Geen retry op non-idempotent order submit zonder idempotency key.

### Acceptatiecriteria

- [ ] REST audit toont hot callers.
- [ ] Private REST pressure kan entries blokkeren.
- [ ] Geen live order double-submit door retry.

## P6.2 Market snapshot integrity

- [ ] Test snapshot bevat book bid/ask/mid, spread bps, candles, market state, volume, liquidity/depth, stream freshness en fallback source.
- [ ] Test stale snapshot blocks live entries.
- [ ] Test REST fallback markeert degraded.
- [ ] Test local order book warmup.
- [ ] Test dynamic watchlist.
- [ ] Test exchange info cache.
- [ ] Test symbol filters applied to sizing.
- [ ] Test kline staleness multiplier.

### Acceptatiecriteria

- [ ] Geen entry op stale/invalid market snapshot.
- [ ] Dashboard toont datasource freshness.
- [ ] `trading-path:debug` verklaart feedproblemen.

---

# FASE P7 — Storage, state en recovery

## P7.1 StateStore transactionele save

- [x] Maak `saveSnapshotBundle()` manifest-based.
- [x] Staging manifest bevat files, sha256 per file, schema versions, timestamp en transaction id.
- [ ] Atomic rename-volgorde documenteren.
- [ ] Startup recovery: incomplete staging opruimen, incomplete manifest detecteren, laatste consistente bundle kiezen, corrupt file quarantainen.
- [ ] Tests voor crash tussen runtime tmp write, journal tmp write, model tmp write, rename stap en manifest rename.
- [x] Windows filesystem tests waar mogelijk.

Notitie 2026-05-09: manifestverificatie, SHA-256 mismatchdetectie en cleanup van incomplete staging/temp files zijn getest. Volledige multi-step crash-injectie en quarantaine van corrupte snapshotleden blijven open.

### Acceptatiecriteria

- [x] Geen halfgeschreven runtime zonder waarschuwing.
- [ ] Doctor toont laatste consistente save.
- [ ] Corrupt JSON wordt veilig gequarantined.

## P7.2 Runtime schema migraties

- [ ] Fixtures maken: `runtime-v1.json`, `runtime-v3.json`, `runtime-v7-minimal.json`, `runtime-corrupt-arrays.json`, `journal-v1.json`, `journal-corrupt-types.json`.
- [ ] Test `migrateRuntime`.
- [ ] Test `migrateJournal`.
- [ ] Test onbekende velden blijven behouden.
- [ ] Test kritieke arrays altijd arrays worden.
- [ ] Test openPositions validatie.
- [ ] Test orderLifecycle defaults.
- [ ] Test exchangeTruth defaults.
- [ ] Test health/recovery defaults.

### Acceptatiecriteria

- [ ] Oude runtime start veilig.
- [ ] Ongeldige types worden hersteld of hard gemeld.
- [ ] Migratie is deterministisch.

## P7.3 Audit log en incident bundles

- [ ] Audit event schema registry maken.
- [ ] Contracttests voor `signal_decision`, `risk_decision`, `trade_intent`, `execution_result`, `exchange_truth_check`, `operator_action`, `adaptive_change`, `cycle_failure`.
- [ ] Incident bundle command testen met runtime snapshot, open positions, unresolved intents, active alerts, config hash, recent audit events en redacted env summary.
- [ ] Secrets redaction test.

### Acceptatiecriteria

- [ ] Incident bundle bevat geen API secrets.
- [ ] Audit schema breekt niet zonder schema bump.
- [ ] Replay kan audit events lezen.

---

# FASE P8 — Dashboard API en GUI volledig testen

## P8.1 Dashboard backend routes

### Routes die getest moeten worden

- [ ] `GET /api/snapshot`
- [ ] `GET /api/health`
- [x] `GET /api/live/preflight`
- [ ] `GET /api/gui/status`
- [ ] `GET /api/gui/diagnostics`
- [ ] `GET /api/config/env`
- [ ] `GET /api/config/profiles`
- [ ] `GET /api/readiness`
- [ ] `GET /api/mission-control`
- [ ] `GET /api/status`
- [ ] `GET /api/doctor`
- [ ] `GET /api/report`
- [ ] `GET /api/learning`
- [ ] `POST /api/start`
- [ ] `POST /api/stop`
- [ ] `POST /api/refresh`
- [ ] `POST /api/cycle`
- [ ] `POST /api/research`
- [ ] `POST /api/mode`
- [ ] `POST /api/config/profile/preview`
- [ ] `POST /api/config/profile/apply`
- [ ] `POST /api/setup/run-checks`
- [ ] `POST /api/alerts/ack`
- [ ] `POST /api/alerts/silence`
- [ ] `POST /api/alerts/resolve`
- [ ] `POST /api/ops/force-reconcile`
- [ ] `POST /api/positions/review`
- [ ] `POST /api/ops/probe-only`
- [ ] `POST /api/diagnostics/action`
- [ ] `POST /api/policies/approve`
- [ ] `POST /api/policies/reject`
- [ ] `POST /api/policies/revert`
- [ ] `POST /api/promotion/approve`
- [ ] `POST /api/promotion/rollback`

### Per route testen

- [ ] Status code.
- [ ] JSON shape.
- [ ] Geen secrets.
- [ ] Geen crash bij missing runtime fields.
- [ ] POST vereist `x-dashboard-request: 1`.
- [ ] POST zonder trusted marker geeft 403.
- [ ] Invalid JSON geeft 400.
- [ ] Te grote body geeft 413.
- [ ] Niet-bestaande route geeft 404.
- [ ] Niet-toegestane method geeft 405.

### Acceptatiecriteria

- [ ] Dashboard backend is volledig contract-tested.
- [ ] Mutaties zijn CSRF/local guarded.
- [ ] Health endpoint werkt ook in degraded state.

## P8.2 Dashboard frontend rendering

- [ ] Voeg browser/E2E test setup toe: Playwright of lichte headless browser, mocked dashboard API, console error capture.
- [ ] Test hoofdscherm: mode badge, run state badge, health badge, refresh badge, operator summary, overview cards, attention list, action list, positions, recent trades, top decisions, learning cards, diagnostics, promotion/probation.
- [ ] Test lege states: geen trades, geen posities, geen decisions, geen learning data, missing ops object.
- [ ] Test kapotte/partial snapshot: `dashboard: null`, `ops: undefined`, arrays als object, invalid dates, NaN/null values.
- [ ] Test search/filter: decision search, allowed only, show more, localStorage restore.
- [ ] Test buttons: Start, Stop, Paper, Live, Refresh, Setup wizard, Profile apply, Alert ack/silence/resolve, Position review.
- [ ] Test busy state en double click prevention.
- [ ] Test rendering fallback banner.
- [ ] Test SSE `/api/events` reconnect of graceful fallback.
- [ ] Test accessibility: button labels, keyboard focus, contrast, live mode waarschuwing duidelijk.

### Acceptatiecriteria

- [ ] Geen console errors bij normale snapshot.
- [ ] Geen white screen bij partial snapshot.
- [ ] GUI toont exact waarom bot niet trade.
- [ ] Live mode visueel niet te verwarren met paper.

## P8.3 Dashboard “why no trade” cockpit

- [ ] Maak timeline component: signal gezien, model score, strategy fit, risk verdict, execution blockers, final no-entry reason.
- [ ] Koppel timeline aan audit events.
- [ ] Toon top blocker + downstream blockers.
- [ ] Link naar replay-decision.
- [ ] Link naar trace-symbol.
- [ ] Toon verschil paper/live blockers.
- [ ] Toon of paper probe/shadow mogelijk was.

### Acceptatiecriteria

- [ ] Operator ziet binnen 10 seconden waarom er geen trade is.
- [ ] No-trade reason komt overeen met risk verdict.
- [ ] Timeline heeft tests met vaste snapshots.

---

# FASE P9 — Desktop-app en Windows installer

## P9.1 Electron dev mode

- [ ] `cd desktop && npm start` testen.
- [ ] `desktop/main.js` path-resolutie testen: dev mode, packaged mode, missing dashboard server, missing public index, missing `.env`.
- [ ] `waitForDashboard` timeout test.
- [ ] Error page snapshot test.
- [ ] Tray menu test: open dashboard, open browser, start bot safely, stop bot safely, open logs, open env.
- [ ] Status polling test.
- [ ] Notification test mocked.

### Acceptatiecriteria

- [ ] Desktop toont duidelijke foutpagina bij dashboard start failure.
- [ ] Logs bevatten startup diagnostics.
- [ ] Tray acties crashen niet als dashboard offline is.

## P9.2 Electron packaged build

- [ ] `cd desktop && npm run dist:dir` testen.
- [ ] `extraResources` inspecteren: `src/**`, `scripts/**`, `config/**`, `.env.example`, package files, node_modules, geen `.env`, geen `data/**`, geen logs/secrets.
- [ ] Packaged bot root controleren.
- [ ] Dashboard server import via `pathToFileURL` testen.
- [ ] Installer artifact naam testen.
- [ ] `Start-Dashboard.cmd`, `Start-BotService.cmd`, `Start-Everything.cmd` testen.
- [ ] Long path Windows test.
- [ ] Fresh install test.
- [ ] Upgrade install test.
- [ ] Uninstall/reinstall test.

### Acceptatiecriteria

- [ ] Packaged app start dashboard lokaal.
- [ ] Geen user secrets in installer.
- [ ] `.env.example` aanwezig voor setup.
- [ ] Runtime data wordt niet overschreven bij upgrade.

---

# FASE P10 — CLI command overhaul

## P10.1 `runCli.js` opsplitsen

- [ ] Maak command registry: `src/cli/commandRegistry.js`.
- [ ] Splits commands: `botCommands.js`, `dashboardCommands.js`, `backtestCommands.js`, `readModelCommands.js`, `reconcileCommands.js`, `learningCommands.js`, `opsCommands.js`, `neuralCommands.js`, `researchCommands.js`, `diagnosticCommands.js`.
- [ ] Gebruik lazy imports per command.
- [ ] Voeg command metadata toe: name, description, readOnly, needsTradingBot, needsNetwork, needsPrivateKeys, safeInLive.
- [ ] Voeg `node src/cli.js help` toe.
- [ ] Voeg `node src/cli.js commands --json` toe.

### Acceptatiecriteria

- [ ] Read-only commands starten zonder volledige runtime indien mogelijk.
- [ ] Broken neural module breekt `status` niet.
- [ ] Unknown command toont suggesties.

## P10.2 CLI smoke matrix

- [ ] `doctor`
- [ ] `status`
- [ ] `once`
- [ ] `report`
- [ ] `learning`
- [ ] `dashboard`
- [ ] `backtest BTCUSDT`
- [ ] `backtest:walkforward`
- [ ] `feature:audit`
- [ ] `feature:completion-gate`
- [ ] `rest:audit`
- [ ] `trading-path:debug`
- [ ] `intents:list`
- [ ] `intents:summary`
- [ ] `reconcile:plan`
- [ ] `exchange-safety:status`
- [ ] `storage:audit`
- [ ] `recorder:audit`
- [ ] `ops:readiness`
- [ ] `ops:release-check`
- [ ] `ops:keys-check`
- [ ] `ops:mission-control`
- [ ] `live:panic-plan`
- [ ] `post-reconcile:status`

### Acceptatiecriteria

- [ ] Elk command heeft exit code contract.
- [ ] Elk command heeft JSON output of duidelijke human output.
- [ ] Geen command crasht op lege runtime.

---

# FASE P11 — AI, learning en neural governance

## P11.1 Learning data safety

- [ ] Paper learning gescheiden houden van live learning.
- [ ] Live core updates default false.
- [ ] Neural live autonomy default false.
- [ ] Auto promote default false.
- [ ] Elke adaptive change krijgt scope, old value, new value, evidence, rollback condition, approval status en mode impact.
- [ ] Tests: paper auto-apply allowed only when paper-only true; live auto-apply blocked zonder evidence; rollback triggers; stale data blocks retrain; low record quality blocks retrain.

### Acceptatiecriteria

- [ ] Geen learning change raakt live zonder gate.
- [ ] Dashboard toont paper/live readiness apart.
- [ ] Model promotion audit trail compleet.

## P11.2 Replay en counterfactual determinisme

- [ ] `replay-decision <decisionId>` volledig offline maken.
- [ ] Replay input bundelen: config hash, market snapshot, features, risk verdict, decision output, execution blockers, open positions, account/equity context, news/context lineage.
- [ ] Replay output: same outcome, diffs, changed reason codes, changed score, changed threshold.
- [ ] Counterfactual queue testen.
- [ ] Paper missers automatisch reviewable maken.
- [ ] GUI link naar replay.

### Acceptatiecriteria

- [ ] Replay gebruikt geen netwerk.
- [ ] Identieke input geeft identieke output.
- [ ] Verschil tussen oude en nieuwe code is zichtbaar.

---

# FASE P12 — Security en secrets

## P12.1 Secret hygiene

- [ ] Redaction helper centraal maken.
- [ ] Redact patronen: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, tokens, webhook URLs, authorization headers, listen keys.
- [ ] Redaction toepassen op logs, dashboard payloads, incident bundles, doctor/status, desktop logs en test snapshots.
- [ ] CI secret scan toevoegen.
- [ ] Pre-commit hook toevoegen.

### Acceptatiecriteria

- [ ] Geen raw secret in output.
- [ ] Test injecteert fake secret en verifieert masking.
- [ ] Incident export is secret-free.

## P12.2 Dashboard local security

- [ ] Dashboard bind standaard `127.0.0.1`.
- [ ] Waarschuw of faal bij `0.0.0.0` zonder expliciete env flag.
- [ ] Mutating POST vereist trusted local header.
- [ ] Origin check testen.
- [ ] Optionele dashboard token toevoegen.
- [ ] Geen secrets in `/api/config/env`.

### Acceptatiecriteria

- [ ] Remote bind is expliciet en zichtbaar.
- [ ] Dashboard payloads zijn safe.
- [ ] Mutatie vanaf ontrusted origin faalt.

---

# FASE P13 — Observability en debug tools

## P13.1 Debug command suite

- [x] `debug:critical`
- [x] `debug:api-contracts`
- [x] `debug:dashboard-dom`
- [x] `debug:package-scripts`
- [x] `debug:secrets`
- [ ] `debug:overview`
- [x] `debug:imports`
- [ ] `debug:config`
- [x] `debug:env`
- [ ] `debug:runtime`
- [ ] `debug:storage`
- [ ] `debug:dashboard`
- [ ] `debug:broker`
- [ ] `debug:paper`
- [ ] `debug:demo`
- [x] `debug:live-preflight`
- [ ] `debug:market-data`
- [ ] `debug:risk`
- [ ] `debug:learning`
- [ ] `debug:desktop`
- [ ] `debug:all --json`

### Output bevat

- [ ] status
- [ ] severity
- [ ] failed checks
- [ ] suggested command
- [ ] affected files
- [ ] safe next action

### Acceptatiecriteria

- [ ] Eén command kan volledige health dump maken.
- [ ] Dump bevat geen secrets.
- [ ] JSON is bruikbaar voor dashboard.

## P13.2 Operator action queue

- [ ] Eén centrale queue maken.
- [ ] Items bevatten id, severity, title, detail, source, command, status, createdAt, reviewedAt.
- [ ] Bronnen: config errors, runtime errors, exchange truth, reconcile, no-trade blockers, dashboard render issues, storage warnings, learning governance, desktop diagnostics.
- [ ] Dashboard toont top 5.
- [ ] CLI toont alle items.
- [ ] Actions kunnen reviewed/resolved worden.

### Acceptatiecriteria

- [ ] Operator ziet beste volgende actie.
- [ ] Queue is persistent.
- [ ] Geen dubbel spam-items.

---

# FASE P14 — Documentation en release discipline

## P14.1 Docs herstellen

- [ ] `README.md` updaten: snelle start klopt, geen absolute `/mnt/c/...` links, paper/demo/live helder, debug commands, dashboard commands.
- [ ] `docs/ARCHITECTURE.md` updaten na herstel `TradingBot`.
- [ ] `docs/FEATURE_STATUS.md` automatisch vergelijken met feature audit.
- [x] `docs/DEBUG_COMMANDS.md` toevoegen.
- [ ] `docs/DASHBOARD_TEST_PLAN.md` toevoegen.
- [ ] `docs/LIVE_PREFLIGHT.md` toevoegen.
- [ ] `docs/RELEASE_CHECKLIST.md` toevoegen.
- [ ] `docs/KNOWN_ISSUES.md` toevoegen.
- [x] `docs/DEBUG_OVERHAUL_REPORT.md` toevoegen bij afronding.

### Acceptatiecriteria

- [x] Docs verwijzen naar echte scripts.
- [ ] Geen dode lokale absolute links.
- [ ] Nieuwe gebruiker kan paper-safe starten.

## P14.2 Release gate

- [ ] `ops:release-check` uitbreiden.
- [ ] Gate vereist: tests groen, env clean, critical files non-empty, dashboard smoke groen, desktop diagnose groen, no secret scan findings, live preflight blocked/ready correct, feature audit geen P0 gaps.
- [ ] Release report schrijft JSON + Markdown.
- [ ] CI artifact uploaden.

### Acceptatiecriteria

- [ ] Geen release met lege runtime.
- [ ] Geen release met dashboard broken.
- [ ] Geen release met secret risico.

---

# FASE P15 — CI/CD

## P15.1 GitHub Actions workflow

- [ ] `.github/workflows/ci.yml` toevoegen.
- [ ] Jobs: install, syntax, lint, format, env check, import integrity, unit tests, safety tests, dashboard API tests, dashboard frontend tests, coverage.
- [ ] Node 22 gebruiken.
- [ ] npm cache gebruiken.
- [ ] Artifacts uploaden: coverage, debug report, test report.
- [ ] Branch protection instellen.

### Acceptatiecriteria

- [ ] PR kan niet mergen met failing P0.
- [ ] CI faalt bij lege `tradingBot.js`.
- [ ] CI faalt bij lege `test/run.js`.

---

# FASE P16 — Handmatige testmatrix

## P16.1 Local paper internal

- [ ] `.env` met `BOT_MODE=paper`.
- [ ] `PAPER_EXECUTION_VENUE=internal`.
- [ ] `node src/cli.js doctor`.
- [ ] `node src/cli.js status`.
- [ ] `node src/cli.js once`.
- [ ] `node src/cli.js report`.
- [ ] `node src/cli.js dashboard`.
- [ ] Open `http://127.0.0.1:3011`.
- [ ] Controleer geen console errors.
- [ ] Start/stop via GUI.
- [ ] Paper knop werkt.
- [ ] Live knop blokkeert zonder ack.
- [ ] No-trade reason zichtbaar.
- [ ] Runtime files worden geschreven.

## P16.2 Binance demo spot

- [ ] `.env` met `BOT_MODE=paper`.
- [ ] `PAPER_EXECUTION_VENUE=binance_demo_spot`.
- [ ] Demo endpoint gezet.
- [ ] Demo credentials gezet indien vereist.
- [ ] `doctor` toont paper + demo venue.
- [ ] `once` opent nooit live labels.
- [ ] Reconcile werkt als demo.
- [ ] Dashboard toont “Paper / Binance Demo Spot”.
- [ ] Trades in journal hebben `brokerMode: paper`.

## P16.3 Live blocked safety

- [ ] `BOT_MODE=live` zonder ack faalt.
- [ ] Live met demo endpoint faalt.
- [ ] Live zonder API key faalt.
- [ ] Live zonder protection faalt.
- [ ] Live preflight toont exacte blockers.
- [ ] Dashboard live start disabled.

## P16.4 Dashboard degraded runtime

- [ ] Runtime file corrupt maken.
- [ ] Dashboard start of toont recoverable error.
- [ ] Doctor toont quarantine.
- [ ] GUI geen white screen.
- [ ] Operator action queue toont storage issue.

## P16.5 Desktop app

- [ ] `cd desktop && npm run diagnose`.
- [ ] `cd desktop && npm start`.
- [ ] Dashboard opent.
- [ ] Tray menu werkt.
- [ ] Stop/start via tray werkt.
- [ ] Logs openen.
- [ ] Error page werkt bij kapotte server.
- [ ] Packaged dir build testen.

---

# FASE P17 — Bug triage workflow

Voor elke bug:

- [ ] Maak issue of log entry.
- [ ] Vul template: titel, severity, component, reproduce steps, expected, actual, logs, screenshots, failing test, fix PR, verification command.
- [ ] Voeg minimaal één test toe.
- [ ] Voeg regression note toe.
- [ ] Update `docs/KNOWN_ISSUES.md`.

## Severity regels

- [ ] P0: start niet, tests vals groen, live safety risk, data corruption.
- [ ] P1: dashboard onbruikbaar, broker mismatch, config silent fallback, runtime crash.
- [ ] P2: incorrect metrics, learning issue, degraded UX, flaky tests.
- [ ] P3: docs, polish, performance improvements.

---

# FASE P18 — Aanbevolen volgorde voor uitvoering

## Sprint 1 — P0 herstel

- [ ] Herstel `TradingBot`.
- [ ] Herstel `test/run.js`.
- [ ] Critical file checker.
- [ ] Import integrity tests.
- [ ] Syntax checks.
- [ ] CI minimal.

## Sprint 2 — Config/mode safety

- [ ] Strict env parsing.
- [ ] Duplicate key detection.
- [ ] Mode matrix.
- [ ] Broker factory.
- [ ] Live preflight.

## Sprint 3 — Runtime/execution tests

- [ ] PaperBroker tests.
- [ ] DemoPaperBroker tests.
- [ ] LiveBroker mocked tests.
- [ ] Position lifecycle tests.
- [ ] Run cycle audit tests.

## Sprint 4 — Dashboard/GUI

- [ ] Dashboard API route tests.
- [ ] Frontend render tests.
- [ ] Button action tests.
- [ ] Why-no-trade timeline.
- [ ] Operator action queue.

## Sprint 5 — Storage/recovery/security

- [ ] Transactional snapshot manifest.
- [ ] Migration fixtures.
- [ ] Incident bundle.
- [ ] Secret redaction.
- [ ] Dashboard local security.

## Sprint 6 — Desktop/release

- [ ] Electron diagnose.
- [ ] Packaged build tests.
- [ ] Installer resource audit.
- [ ] Release checklist.
- [ ] Final debug report.

---

# FASE P19 — Finale go/no-go checklist

## Go als alles groen is

- [ ] P0 checklist volledig groen.
- [ ] P1 config/mode safety groen.
- [ ] Paper internal werkt.
- [ ] Demo spot werkt en blijft paper.
- [ ] Live preflight blokkeert correct.
- [ ] Dashboard API getest.
- [ ] Dashboard frontend getest.
- [ ] Desktop diagnose groen.
- [ ] Storage recovery getest.
- [ ] Secret scan groen.
- [ ] CI groen.
- [ ] Docs bijgewerkt.
- [ ] Release report gegenereerd.

## No-go als één van deze waar is

- [ ] `TradingBot` leeg of niet importeerbaar.
- [ ] `npm test` draait 0 tests.
- [ ] Dashboard white screen.
- [ ] Live kan starten zonder ack/protection/keys.
- [ ] Demo trades worden als live gelabeld.
- [ ] Storage kan corrupt raken zonder recovery.
- [ ] Secrets verschijnen in output.
- [ ] GUI start/stop knoppen missen backend tests.
- [ ] CI ontbreekt of faalt.

---

# Appendix A — Minimaal commandopakket

```powershell
npm ci
npm run check:critical
npm run check:syntax
npm run check:imports
npm run check:env
npm run lint
npm run format:check
npm test
npm run coverage
node src/cli.js doctor
node src/cli.js status
node src/cli.js once
node src/cli.js trading-path:debug
node src/cli.js feature:audit
node src/cli.js rest:audit
node src/cli.js ops:readiness
node src/cli.js dashboard
cd desktop
npm ci
npm run diagnose
npm start
```

---

# Appendix B — Bestanden die extra aandacht nodig hebben

- [ ] `src/runtime/tradingBot.js`
- [ ] `src/runtime/botManager.js`
- [ ] `src/runtime/cycleRunner.js`
- [ ] `src/runtime/decisionPipeline.js`
- [ ] `src/cli/runCli.js`
- [ ] `test/run.js`
- [ ] `src/config/index.js`
- [ ] `src/config/schema.js`
- [ ] `src/config/validate.js`
- [ ] `.env.example`
- [ ] `src/execution/paperBroker.js`
- [ ] `src/execution/demoPaperBroker.js`
- [ ] `src/execution/liveBroker.js`
- [ ] `src/risk/riskManager.js`
- [ ] `src/storage/stateStore.js`
- [ ] `src/dashboard/server.js`
- [ ] `src/dashboard/public/app.js`
- [ ] `desktop/main.js`
- [ ] `desktop/package.json`
- [ ] `README.md`
- [ ] `docs/ARCHITECTURE.md`
- [ ] `docs/FEATURE_STATUS.md`

---

# Appendix C — Testcategorieën

- [ ] Import tests
- [ ] Syntax tests
- [ ] Config parser tests
- [ ] Env duplicate tests
- [ ] Mode matrix tests
- [ ] Broker factory tests
- [ ] PaperBroker unit tests
- [ ] DemoPaperBroker unit tests
- [ ] LiveBroker mocked integration tests
- [ ] Risk policy unit tests
- [ ] Run cycle integration tests
- [ ] Audit contract tests
- [ ] Storage migration tests
- [ ] Storage transaction tests
- [ ] Dashboard API tests
- [ ] Dashboard frontend tests
- [ ] Desktop diagnose tests
- [ ] Security redaction tests
- [ ] Replay determinism tests
- [ ] CI smoke tests

---

# Appendix D — Bug report template

```md
## Bug

**Severity:** P0/P1/P2/P3
**Component:** runtime/config/execution/dashboard/desktop/storage/learning/security
**Detected by:** manual/test/CI/dashboard/operator
**Date:** YYYY-MM-DD

### Reproduce

1.
2.
3.

### Expected

### Actual

### Logs

### Root cause

### Fix

### Regression test

### Verification command

### Rollback plan
```

---

# Appendix E — Debug report template

```md
# Debug Overhaul Report

## Summary

## Fixed P0

## Fixed P1

## Remaining issues

## Test results

## Dashboard results

## Desktop results

## Live safety result

## Release readiness

## Next actions
```

---

## Laatste advies

De beste aanpak is niet “bugs willekeurig oplossen”, maar eerst de fundering herstellen: `TradingBot`, test-runner, import checks, strict config en mode safety. Daarna pas dashboard en execution diep testen. Als P0 niet groen is, zijn alle hogere tests onbetrouwbaar.
