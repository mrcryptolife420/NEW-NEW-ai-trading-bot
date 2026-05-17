# Extra Volledige Debug Overhaul Roadmap V3 — AI Trading Crypto Bot

**Project:** `mrcryptolife420/NEW-NEW-ai-trading-bot`
**Datum:** 2026-05-09
**Type:** extra uitgebreide afvinkbare roadmap bovenop de vorige debug-roadmaps
**Scope:** volledige codebase, GUI, dashboard, desktop-app, installer, runtime, trading-flow, paper/demo/live execution, storage, AI/learning, tests, CI, security, observability, performance en release.

> Doel van deze V3: alles meenemen wat in een normale debugronde vaak wordt vergeten. Dit document is bedoeld als **full overhaul checklist** voor een harde stabilisatie- en bugfixronde, niet als feature-roadmap.

---

## 0. Uitgangspunten van deze extra V3-debugronde

- [ ] Behandel de repo alsof elke module verdacht is totdat er een test, smoke-check of contractbewijs voor bestaat.
- [ ] Nieuwe features zijn geblokkeerd totdat de volledige debug-basis groen is.
- [ ] Elke bug krijgt: reproduce, root cause, fix, test, verificatiecommando en rollbackplan.
- [ ] Geen enkel dashboard-element mag data tonen zonder bewezen backend-contract.
- [ ] Geen enkele GUI-knop mag bestaan zonder API-route-test en foutscenario-test.
- [ ] Geen enkele broker mag orders of posities muteren zonder idempotency- en recovery-test.
- [ ] Geen enkele learning/AI-module mag runtime-config muteren zonder audit, bounds en rollback.
- [ ] Geen enkel storage-bestand mag half geschreven kunnen blijven zonder detectie bij startup.
- [ ] Geen enkele CI-run mag groen zijn als kritieke bestanden leeg zijn.
- [ ] Geen enkele test-run mag groen zijn als 0 tests zijn uitgevoerd.
- [ ] Geen enkele live-route mag werken zonder hard bewijs dat live-preflight groen is.
- [ ] Geen enkele demo/paper-route mag per ongeluk als live worden gelabeld.
- [ ] Geen enkele secret mag in dashboard, logs, incident bundles, traces of testfixtures terechtkomen.
- [ ] Alle fouten moeten zichtbaar worden in `doctor`, `status`, dashboard `/api/health`, logs en CI.

---

## 1. Extra bevestigde technische context die in V3 expliciet meegenomen wordt

- [ ] `package.json` bevat scripts voor `test`, `coverage`, `qa`, `dashboard`, desktop-builds en veel CLI-subcommands; elk script moet in de smoke-matrix komen.
- [ ] `src/cli.js` laadt config, maakt logger en importeert daarna `src/cli/runCli.js`; fout in config of importroute breekt dus alle commands.
- [ ] `src/cli/runCli.js` importeert zeer veel modules bovenaan; één syntaxis- of exportfout in een obscure module kan ook read-only commands breken.
- [ ] `src/runtime/botManager.js` maakt `new TradingBot(...)` aan, roept `bot.init()`, `bot.refreshAnalysis()`, `bot.runCycle()` en vele dashboard/manager-methodes aan.
- [ ] `src/runtime/tradingBot.js` moet daarom een groot publiek contract leveren en mag nooit leeg of gedeeltelijk kapot zijn.
- [ ] `src/dashboard/server.js` start `BotManager.init()` bij dashboard-start; runtime-bugs zijn dus ook dashboard-bugs.
- [ ] `src/dashboard/server.js` bevat GET/POST API-routes voor snapshot, health, start/stop, mode, setup, alerts, reconcile, policies, promotion en diagnostics; elke route krijgt contracttests.
- [ ] `src/dashboard/public/index.html` definieert veel vaste DOM-id’s; `app.js` queryt deze id’s direct. DOM-id drift moet getest worden.
- [ ] `src/dashboard/public/app.js` rendert veel data uit nested snapshotvelden; elk ontbrekend of afwijkend veld moet fallback-safe zijn.
- [ ] `desktop/main.js` embedt dashboard-server in Electron en heeft aparte dev/packaged path-resolutie; dit moet apart getest worden.
- [ ] `desktop/scripts/desktop-diagnose.mjs` bestaat maar moet uitgebreid worden met runtime-import, dashboard-health en packaged-resource checks.
- [ ] `.github/workflows/ci.yml` bestaat en draait `npm ci`, lint, format, test en coverage; V3 voegt missing gates toe voor empty files, CLI smoke, dashboard smoke, env duplicates en desktop diagnose.
- [ ] `StateStore` migreert runtime/journal en schrijft snapshot bundles; crash-, corruptie- en migratietests moeten zwaarder.
- [ ] `PaperBroker`, `DemoPaperBroker` en `LiveBroker` moeten niet alleen unit tests krijgen maar ook scenario-, recovery- en invarianttests.

---

# FASE X0 — Meta-inventarisatie van de volledige codebase

## X0.1 Bouw een machine-readable codebase inventory

### Doel
Eerst exact weten welke bestanden, modules, exports, scripts, routes, DOM-id’s en configkeys bestaan.

### Taken

- [ ] Genereer `docs/debug/inventory/files.json` met alle bestanden, grootte, hash, laatste wijziging en type.
- [ ] Markeer lege bestanden automatisch als `critical`, `warning` of `allowed_empty`.
- [ ] Markeer bestanden groter dan 800 regels voor refactor-review.
- [ ] Markeer modules met meer dan 20 imports voor dependency-review.
- [ ] Markeer bestanden met top-level side effects.
- [ ] Markeer bestanden die Node-only APIs gebruiken.
- [ ] Markeer frontend-bestanden die browser-only APIs gebruiken.
- [ ] Markeer gedeelde modules die zowel frontend als backend geïmporteerd worden.
- [ ] Maak een export-index van alle `export` en `export default` statements.
- [ ] Maak een import-index van alle relatieve imports.
- [ ] Detecteer imports naar niet-bestaande bestanden.
- [ ] Detecteer case-sensitive import-mismatches, belangrijk voor Linux CI.
- [ ] Detecteer circular dependencies.
- [ ] Detecteer modules die `process.env` direct lezen buiten configlaag.
- [ ] Detecteer modules die file-system writes doen buiten storage/ops/scripts.
- [ ] Detecteer modules die netwerk calls doen buiten clients/providers.
- [ ] Detecteer modules die order/execution calls doen buiten broker/executionlaag.
- [ ] Detecteer modules die dashboard payloads bouwen buiten runtime/dashboard services.
- [ ] Detecteer testbestanden die niet door `test/run.js` worden opgepikt.

### Artefacten

- [ ] `docs/debug/inventory/files.json`
- [ ] `docs/debug/inventory/import-graph.json`
- [ ] `docs/debug/inventory/exports.json`
- [ ] `docs/debug/inventory/scripts.json`
- [ ] `docs/debug/inventory/dashboard-dom.json`
- [ ] `docs/debug/inventory/api-routes.json`
- [ ] `docs/debug/inventory/env-keys.json`
- [ ] `docs/debug/inventory/test-coverage-map.json`

### Acceptatiecriteria

- [ ] Inventory-command draait lokaal en in CI.
- [ ] Inventory faalt bij kritieke lege bestanden.
- [ ] Inventory faalt bij missing import targets.
- [ ] Inventory geeft duidelijke markdown summary in `docs/debug/INVENTORY_SUMMARY.md`.

---

## X0.2 Maak een dependency graph gate

### Taken

- [ ] Bouw `scripts/analyze-dependencies.mjs`.
- [ ] Output alle dependency-randen als `{from,to,type}`.
- [ ] Detecteer `src/dashboard/public/*` imports naar backend-only modules.
- [ ] Detecteer `src/shared/*` imports naar `fs`, `http`, `path`, `process` of exchange clients.
- [ ] Detecteer `src/risk/*` imports naar execution/broker modules.
- [ ] Detecteer `src/ai/*` imports naar live broker modules.
- [ ] Detecteer storage modules die dashboard modules importeren.
- [ ] Detecteer config modules die runtime modules importeren.
- [ ] Detecteer CLI router die teveel eager imports doet.
- [ ] Voeg allowlist toe voor bewuste uitzonderingen.
- [ ] Voeg CI gate toe: geen nieuwe cycle zonder expliciete allowlist.

### Acceptatiecriteria

- [ ] Dependency graph is reproduceerbaar.
- [ ] Elke dependency cycle heeft owner en reden.
- [ ] Nieuwe cycles blokkeren PR.

---

# FASE X1 — Kritieke startup-chain volledig nalopen

## X1.1 Startup-chain contract van nul tot dashboard

### Chain

```txt
node src/cli.js
  -> loadConfig()
  -> createLogger()
  -> import src/cli/runCli.js
  -> runCli(command)
  -> BotManager / TradingBot / command handler
```

### Taken

- [ ] Test `node src/cli.js --help` of voeg `help` command toe zonder TradingBot import.
- [ ] Test `node src/cli.js doctor` met lege `.env`.
- [ ] Test `node src/cli.js doctor` met `.env.example` gekopieerd.
- [ ] Test `node src/cli.js status` zonder internet.
- [ ] Test `node src/cli.js status` met corrupt runtime.json.
- [ ] Test `node src/cli.js once` met fake/stub market provider.
- [ ] Test `node src/cli.js dashboard` en `/api/health`.
- [ ] Test dashboard start wanneer runtime init faalt: API moet degraded JSON geven, geen crash-only exit.
- [ ] Test dashboard start wanneer `.env` fout is: duidelijke foutkaart in GUI.
- [ ] Test desktop start wanneer dashboard-server import faalt: error page toont diagnose.
- [ ] Test `npm run qa` in een frisse clone.
- [ ] Test `npm run qa` zonder `.env`.
- [ ] Test `npm run qa` met `BOT_MODE=live` maar zonder live ack; moet veilig blokkeren.

### Acceptatiecriteria

- [ ] Elke startup-failure heeft duidelijke foutmelding.
- [ ] Geen stacktrace-only output voor normale operatorfouten.
- [ ] Geen command hangt oneindig bij ontbrekende config of runtimefile.
- [ ] Dashboard/desktop tonen degraded status in plaats van witte pagina.

---

## X1.2 Lazy import overhaul van CLI

### Probleem
De CLI-router importeert veel modules top-level. Daardoor kan een bug in bijvoorbeeld neural replay een simpele `status` of `doctor` breken.

### Taken

- [ ] Splits `src/cli/runCli.js` in commandgroepen.
- [ ] Vervang top-level heavy imports door lazy imports per command.
- [ ] Maak `src/cli/commandRegistry.js` met metadata: command, mode, readOnly, requiresRuntime, requiresNetwork, dangerous.
- [ ] Voeg `node src/cli.js commands` toe met alle commands en flags.
- [ ] Voeg test toe dat read-only commands geen broker/order modules importeren.
- [ ] Voeg test toe dat `help`, `commands`, `version`, `config:check` zonder TradingBot kunnen draaien.
- [ ] Voeg test toe dat onbekende command exitCode 1 geeft met suggestie.
- [ ] Voeg test toe dat command aliases niet botsen.
- [ ] Voeg test toe dat alle package scripts naar bestaande commands verwijzen.

### Acceptatiecriteria

- [ ] `status` kan niet breken door syntaxfout in unrelated neural module.
- [ ] `config:check` draait zonder dashboard, broker of market providers.
- [ ] Command registry is de enige bron van CLI command metadata.

---

# FASE X2 — Test-runner V2 en volledige test-architectuur

## X2.1 Nieuwe test-runner met discovery

### Taken

- [ ] `test/run.js` moet alle `*.test.js` en `*.tests.js` automatisch vinden.
- [ ] Runner moet `--unit`, `--integration`, `--safety`, `--dashboard`, `--desktop`, `--slow`, `--changed` ondersteunen.
- [ ] Runner moet per testbestand duration tonen.
- [ ] Runner moet parallel/serial ondersteunen.
- [ ] Runner moet serial afdwingen voor tests met file-system/runtime-state.
- [ ] Runner moet tijdelijke dirs per test isoleren.
- [ ] Runner moet faalrapport naar `data/test-results/latest.json` schrijven.
- [ ] Runner moet JUnit XML kunnen schrijven voor CI.
- [ ] Runner moet faal bij 0 tests.
- [ ] Runner moet faal bij unhandled rejection.
- [ ] Runner moet faal bij console error tenzij test expliciet `allowConsoleError` zet.
- [ ] Runner moet faal bij open handles boven timeout.
- [ ] Runner moet random seed loggen.
- [ ] Runner moet deterministic order kunnen afdwingen met `TEST_SEED`.

### Acceptatiecriteria

- [ ] `npm test` draait minimaal alle bestaande testbestanden.
- [ ] `npm run test:unit` draait alleen unit tests.
- [ ] `npm run test:integration` draait integration tests.
- [ ] CI artifact bevat testresultaat JSON.

---

## X2.2 Test categorisatie per domein

### Labels

- [ ] `unit:config`
- [ ] `unit:risk`
- [ ] `unit:execution`
- [ ] `unit:storage`
- [ ] `unit:dashboard-render`
- [ ] `unit:ai-learning`
- [ ] `integration:cli`
- [ ] `integration:dashboard-api`
- [ ] `integration:desktop`
- [ ] `integration:paper-cycle`
- [ ] `integration:demo-paper-cycle`
- [ ] `safety:live-preflight`
- [ ] `safety:secret-redaction`
- [ ] `safety:order-idempotency`
- [ ] `chaos:storage-corruption`
- [ ] `chaos:network-failure`
- [ ] `chaos:exchange-timeout`
- [ ] `chaos:partial-fill`
- [ ] `performance:dashboard-snapshot`
- [ ] `performance:cycle-runtime`

### Taken

- [ ] Elk testbestand krijgt metadata export.
- [ ] Runner valideert metadata.
- [ ] Ongecategoriseerde tests falen in CI.
- [ ] Safety-tests moeten altijd draaien op PR.
- [ ] Slow tests mogen nightly draaien, maar moeten lokaal beschikbaar zijn.

---

## X2.3 Fixture- en mockstrategie

### Taken

- [ ] Maak `test/helpers/tempProject.js` voor geïsoleerde repo-runtime.
- [ ] Maak `test/helpers/fakeLogger.js` met capture van warn/error.
- [ ] Maak `test/helpers/fakeClock.js` voor deterministische tijden.
- [ ] Maak `test/helpers/fakeBinanceClient.js` met account, exchangeInfo, klines, orders, OCO, trades.
- [ ] Maak `test/helpers/fakeMarketData.js` met stabiele candles/book snapshots.
- [ ] Maak `test/helpers/fakeDashboardDom.js` voor frontend render tests.
- [ ] Maak `test/helpers/assertNoSecrets.js`.
- [ ] Maak fixtures voor `runtime-v1`, `runtime-v7`, corrupt runtime, missing journal, partial snapshot bundle.
- [ ] Maak fixtures voor Binance errors: `-1021`, `-2010`, `-1013`, `-2011`, `429`, `418`, timeout, ECONNRESET.
- [ ] Maak fixtures voor partial fills, no fills, duplicate order intent, ambiguous order result.
- [ ] Maak fixtures voor stale streams, stale book, stale candle, bad news provider, missing market context.

---

# FASE X3 — Config, schema en environment volledig uitpluizen

## X3.1 Env parsing mag nooit stil liegen

### Taken

- [ ] Vervang alle `parseNumber(value, fallback)` voor expliciete env-keys door strict parser met errorlijst.
- [ ] Vervang boolean parser door strict boolean parser voor expliciete waardes.
- [ ] Ongeldige waardes zoals `abc`, `maybe`, `yesplease`, `1.2.3`, `NaN`, `Infinity` moeten falen.
- [ ] Lege waardes mogen alleen default gebruiken als key leeg/afwezig is.
- [ ] Voeg `source` toe per configwaarde: `env`, `default`, `profile`, `runtimeOverride`.
- [ ] Voeg `config.diagnostics.invalidKeys` toe.
- [ ] Voeg `config.diagnostics.unknownKeys` toe.
- [ ] Voeg `config.diagnostics.duplicateKeys` toe.
- [ ] Voeg `config.diagnostics.deprecatedKeys` toe.
- [ ] Voeg `config.diagnostics.conflicts` toe.
- [ ] `doctor` toont configfouten zonder secrets.
- [ ] Dashboard `/api/config/env` toont alleen safe keys.
- [ ] `config:check --json` geeft machine-readable output.

### Extra conflictchecks

- [ ] `BOT_MODE=live` + `PAPER_EXECUTION_VENUE=binance_demo_spot` moet blokkeren.
- [ ] `BOT_MODE=live` + demo/testnet API base URL moet blokkeren tenzij expliciete sandbox-live bestaat.
- [ ] `BOT_MODE=paper` + live API keys mag waarschuwing geven maar geen live calls doen.
- [ ] `NEURAL_LIVE_AUTONOMY_ENABLED=true` zonder live autonomy ack moet blokkeren.
- [ ] `ENABLE_EXCHANGE_PROTECTION=false` in live moet blokkeren.
- [ ] `MAX_OPEN_POSITIONS=0` moet duidelijk betekenen no entries of configfout, niet stil onverwacht gedrag.
- [ ] `STARTING_CASH<=0` in paper moet blokkeren.
- [ ] `MIN_TRADE_USDT > STARTING_CASH` in paper moet waarschuwen/blokkeren.
- [ ] `PAPER_MIN_TRADE_USDT` onder exchange min-notional in demo spot moet worden gebufferd of geblokkeerd.
- [ ] `TRADING_INTERVAL_SECONDS` te laag moet warning krijgen tegen rate-limit risico.
- [ ] Duplicate `WATCHLIST` in `.env.example` moet gevonden worden.
- [ ] Duplicate `DATA_RECORDER_ENABLED` en retention keys moeten gevonden worden.

---

## X3.2 Profieltestmatrix

### Profielen

- [ ] `paper-safe`
- [ ] `paper-learn`
- [ ] `paper-fast-debug`
- [ ] `binance-demo-spot`
- [ ] `local-only-offline`
- [ ] `dashboard-only`
- [ ] `live-preflight-only`
- [ ] `live-conservative`
- [ ] `research-only`
- [ ] `training-only`

### Per profiel testen

- [ ] `config:check`
- [ ] `doctor`
- [ ] `status`
- [ ] `dashboard /api/health`
- [ ] `feature:audit`
- [ ] `rest:audit`
- [ ] `readmodel:dashboard`
- [ ] `trading-path:debug`
- [ ] mode labels in dashboard
- [ ] safe env status
- [ ] geen secrets in output

---

# FASE X4 — TradingBot contract volledig herbouwen/testen

## X4.1 Publiek contract van `TradingBot`

### Minimale methodes die BotManager/CLI/dashboard verwachten

- [ ] `constructor({ config, logger })`
- [ ] `init(options)`
- [ ] `close()`
- [ ] `refreshAnalysis()`
- [ ] `runCycle()`
- [ ] `runCycleCore()`
- [ ] `getStatus()`
- [ ] `runDoctor()`
- [ ] `getReport()`
- [ ] `getAdaptiveLearningStatus()`
- [ ] `getDashboardSnapshot()` of equivalent voor `getSnapshot()` flow.
- [ ] `runResearch({ symbols })`
- [ ] `runMarketScanner({ symbols })`
- [ ] `runIncidentReplayLab(options)`
- [ ] `acknowledgeAlert(id, acknowledged, note)`
- [ ] `silenceAlert(id, minutes)`
- [ ] `resolveAlert(id, resolved, note)`
- [ ] `forceReconcile(note)`
- [ ] `markPositionReviewed(id, note)`
- [ ] `setProbeOnly(enabled, minutes, note)`
- [ ] `runDiagnosticsAction(action, target, note)`
- [ ] `approvePolicyTransition(id, action, note)`
- [ ] `rejectPolicyTransition(id, action, note)`
- [ ] `revertPolicyTransition(id, note)`
- [ ] `approvePromotionCandidate(symbol, note)`
- [ ] `rollbackPromotionCandidate(symbol, note)`
- [ ] `approvePromotionScope(scope, note)`
- [ ] `rollbackPromotionScope(scope, note)`
- [ ] `decidePromotionProbation(key, decision, note)`

### Taken

- [ ] Maak `test/tradingBotContract.tests.js`.
- [ ] Test dat alle methodes bestaan.
- [ ] Test dat read-only methods geen runtime mutatie doen.
- [ ] Test dat mutation methods audit events schrijven.
- [ ] Test dat `close()` idempotent is.
- [ ] Test dat `init()` meerdere keren veilig is of duidelijk blokkeert.
- [ ] Test dat `runCycle()` na `close()` correct faalt of herinitialiseert.
- [ ] Test dat errors `lastAnalysisError` en health state bijwerken.
- [ ] Test dat dashboard snapshot altijd een minimale shape heeft.
- [ ] Test dat runtime/journal/model altijd via StateStore gaan.

---

## X4.2 Runtime service boundaries

### Extracties die debugbaarheid verbeteren

- [ ] `RuntimeBootstrapService`
- [ ] `MarketDataService`
- [ ] `CandidateScanService`
- [ ] `DecisionService`
- [ ] `RiskEvaluationService`
- [ ] `ExecutionCoordinator`
- [ ] `PositionLifecycleService`
- [ ] `PersistenceCoordinator`
- [ ] `DashboardSnapshotService`
- [ ] `LearningCoordinator`
- [ ] `AuditCoordinator`
- [ ] `HealthCoordinator`
- [ ] `OperatorActionService`

### Acceptatiecriteria

- [ ] TradingBot wordt orkestrator, niet alles-in-één module.
- [ ] Elke service heeft unit tests.
- [ ] Elke service heeft duidelijke input/output contracten.
- [ ] Geen service doet verborgen network/file/order side effects buiten eigen verantwoordelijkheid.

---

# FASE X5 — Full trading-flow debug van signal tot persist

## X5.1 Canonical flow

```txt
market data
  -> features
  -> strategy candidate
  -> AI/model score
  -> risk verdict
  -> sizing
  -> execution intent
  -> broker order/fill
  -> open position
  -> protective orders
  -> journal/audit/runtime persist
  -> dashboard snapshot/read model
```

### Taken per stap

- [ ] Elke stap krijgt een `traceId`/`cycleId`.
- [ ] Elke stap logt start/end duration.
- [ ] Elke stap logt input hash en output hash.
- [ ] Elke stap heeft een failure mode met reason code.
- [ ] Elke stap heeft unit/integration tests.
- [ ] Elke stap kan in replay offline opnieuw draaien.
- [ ] Geen stap mag silently skippen zonder audit event.
- [ ] Geen stap mag direct naar dashboard schrijven.
- [ ] Geen stap mag secrets in trace zetten.

### Testcases

- [ ] Geen market data beschikbaar.
- [ ] Candle data stale.
- [ ] Order book stale.
- [ ] News/context provider faalt.
- [ ] Model confidence onder threshold.
- [ ] Risk hard block.
- [ ] Risk soft block in paper.
- [ ] Paper probe toegestaan.
- [ ] Sizing onder minimum.
- [ ] Broker entry success.
- [ ] Broker entry partial fill.
- [ ] Broker entry ambiguity na timeout.
- [ ] Persist faalt na entry.
- [ ] Persist recovery schrijft incident.
- [ ] Dashboard toont “executed but persist failed” als dat gebeurt.

---

## X5.2 Why-no-trade deep timeline

### Taken

- [ ] Maak per cycle een `whyNoTradeTimeline`.
- [ ] Timeline bevat alle lagen: data, feature, model, strategy, risk, sizing, execution, persist.
- [ ] Timeline bevat top candidate, rejected candidates, final selected candidate.
- [ ] Timeline toont eerste hard blocker en downstream blockers.
- [ ] Timeline toont paper-only relaxed blockers apart van live blockers.
- [ ] Timeline toont of een paper probe/shadow entry mogelijk was.
- [ ] Timeline toont waarom probe niet werd geopend.
- [ ] Timeline wordt opgeslagen in audit/log/readmodel.
- [ ] Dashboard toont compacte timeline.
- [ ] CLI `trace-cycle` toont volledige timeline.
- [ ] CLI `trace-symbol BTCUSDT` toont laatste symbol timeline.

### Acceptatiecriteria

- [ ] Operator kan voor elke no-trade zien waar de flow stopte.
- [ ] Timeline werkt ook als dashboard snapshot gedeeltelijk ontbreekt.
- [ ] Timeline heeft schema-test.

---

# FASE X6 — Broker en execution volledige bugronde

## X6.1 Broker factory en mode isolation

### Taken

- [ ] Maak één `createBroker(config, dependencies)` functie.
- [ ] Factory kiest exact één broker: `PaperBroker`, `DemoPaperBroker`, `LiveBroker`.
- [ ] Factory output bevat `brokerMode`, `executionVenue`, `canPlaceRealOrders`.
- [ ] In paper internal is `canPlaceRealOrders=false`.
- [ ] In Binance demo spot is `brokerMode=paper`, `executionVenue=binance_demo_spot`, `canPlaceRealOrders=false` vanuit live-risico-oogpunt.
- [ ] In live is `brokerMode=live`, `executionVenue=binance_spot`, `canPlaceRealOrders=true` alleen na live preflight.
- [ ] Test dat demo endpoints nooit live-mode unlocken.
- [ ] Test dat live endpoint nooit gebruikt wordt in paper internal.
- [ ] Test dat API keys niet vereist zijn voor internal paper.
- [ ] Test dat API keys wel vereist zijn voor demo spot als demo broker echte demo API gebruikt.
- [ ] Test dat paper/demo/live labels in positions/trades/journal consistent blijven.

---

## X6.2 Execution intents en idempotency

### Taken

- [ ] Elke entry/exit/protection actie begint met execution intent.
- [ ] Intent bevat idempotency key.
- [ ] Intent bevat symbol, side, quote/quantity, mode, venue, reason.
- [ ] Intent gaat door states: `created`, `submitted`, `acknowledged`, `filled`, `partial`, `ambiguous`, `failed`, `resolved`.
- [ ] Duplicate unresolved entry intent voor zelfde symbol blokkeert nieuwe entry.
- [ ] Timeout na order submit wordt `ambiguous`, niet direct `failed`.
- [ ] Ambiguous intent triggert reconcile voordat nieuwe order wordt geplaatst.
- [ ] Intent ledger flush faalt niet stil.
- [ ] Dashboard toont unresolved intents.
- [ ] `intents:list` toont unresolved-only en all modes.
- [ ] `intents:resolve` bestaat alleen met expliciete safe action.

### Testcases

- [ ] order submit success.
- [ ] order submit timeout maar order later gevonden.
- [ ] order submit timeout en geen order gevonden.
- [ ] duplicate client order id.
- [ ] partial fill daarna reconnect.
- [ ] protection order fail na entry.
- [ ] exit order partial fill.
- [ ] cancel fails omdat order al filled is.
- [ ] OCO rejects door prijsgeometrie.

---

## X6.3 PaperBroker invariants extra hard

### Taken

- [ ] `quoteFree` mag nooit negatief worden.
- [ ] `feesPaid` mag nooit NaN worden.
- [ ] `realizedPnl` mag nooit NaN worden.
- [ ] Open paper positions moeten altijd `id`, `symbol`, `entryAt`, `quantity`, `entryPrice`, `notional`, `totalCost` hebben.
- [ ] `quantity` moet > 0 zijn.
- [ ] `totalCost` moet entry notional + fee reflecteren.
- [ ] Scale-out mag niet volledige positie als scale-out behandelen.
- [ ] Partial exit moet resterende positie correct aanpassen.
- [ ] Exit moet journal trade schrijven met execution attribution.
- [ ] Entry en exit moeten fee/slippage consistent toepassen.
- [ ] `marketSnapshot.book.mid/bid/ask` missing moet gecontroleerd falen.
- [ ] Min-notional edge cases moeten getest worden.
- [ ] Very small price/quantity precision cases moeten getest worden.
- [ ] Zero/negative price moet blokkeren.
- [ ] Extreme spread moet blokkeren of slechte fill simuleren.

---

## X6.4 DemoPaperBroker extra risicoanalyse

### Taken

- [ ] Omdat `DemoPaperBroker` van `LiveBroker` erft: maak safety tests die bewijzen dat alle teruggegeven trades/positions `brokerMode=paper` krijgen.
- [ ] Test dat `doctor()` nooit `mode=live` retourneert in demo paper.
- [ ] Test dat reconcile recovered positions remapt naar `paper`.
- [ ] Test dat closedTrades remappen naar `paper`.
- [ ] Test dat execution attribution venue `binance_demo_spot` wordt.
- [ ] Test dat live guardrails niet per ongeluk door demo flow worden overgeslagen.
- [ ] Test dat demo spot endpoint vereist is voor demo venue.
- [ ] Test dat echte Binance endpoint + demo paper config blokkeert of warning geeft.
- [ ] Test dat demo API errors geen live incident escalation veroorzaken.
- [ ] Test dat dashboard demo mode duidelijk anders toont dan live.

---

## X6.5 LiveBroker safety extra rondes

### Taken

- [ ] Live order placement alleen na `safeToStartLive=true`.
- [ ] Account check: `canTrade=true`.
- [ ] Account permissions bevatten `SPOT`.
- [ ] Exchange protection verplicht.
- [ ] STP mode validatie tegen symbol rules.
- [ ] Clock drift check verplicht.
- [ ] recvWindow bounds test.
- [ ] OCO prijsgeometrie test voor SELL protection.
- [ ] Min notional check voor entry en exit.
- [ ] Emergency flatten plan is read-only tenzij expliciet apply bestaat met dubbele confirm.
- [ ] Auto reconcile mag alleen safe acties doen.
- [ ] No-force-unlock policy bij exchange mismatch.
- [ ] Elke live order heeft clientOrderId prefix en audit trace.
- [ ] Geen live order in tests zonder fake client.
- [ ] CI blokkeert network-live tests.

---

# FASE X7 — Binance/client/network chaos testing

## X7.1 REST error matrix

### Testcases

- [ ] `-1021` timestamp drift.
- [ ] `-1022` signature invalid.
- [ ] `-2010` order reject.
- [ ] `-1013` filter failure.
- [ ] `-2011` unknown order cancel.
- [ ] `429` rate limit.
- [ ] `418` IP banned.
- [ ] `5xx` exchange error.
- [ ] `ECONNRESET`.
- [ ] `ETIMEDOUT`.
- [ ] `AbortError`.
- [ ] invalid JSON response.
- [ ] empty response.
- [ ] very slow response.
- [ ] inconsistent exchangeInfo.
- [ ] stale server time.

### Acceptatiecriteria

- [ ] Elke error krijgt canonical classification.
- [ ] Retriable errors worden beperkt geretryd.
- [ ] Non-retriable errors falen snel.
- [ ] Rate limit verhoogt request budget pressure.
- [ ] 418 ban pauzeert private REST.
- [ ] Dashboard toont request pressure.

---

## X7.2 WebSocket/user stream chaos

### Taken

- [ ] Test stream connect success.
- [ ] Test stream reconnect.
- [ ] Test listenKey expired.
- [ ] Test stale depth stream.
- [ ] Test stale user stream.
- [ ] Test out-of-order execution reports.
- [ ] Test duplicate execution report.
- [ ] Test missing fill event.
- [ ] Test REST fallback wanneer stream stale is.
- [ ] Test stream primary wanneer REST budget hoog is.
- [ ] Test dashboard stream status.

---

# FASE X8 — RiskManager en strategy policies extra debug

## X8.1 Risk reason code canon

### Taken

- [ ] Maak centrale `reasonCodeRegistry`.
- [ ] Elke blocker moet in registry staan.
- [ ] Elke registry entry heeft category, severity, liveHardBlock, paperRelaxable, description, operatorAction.
- [ ] Geen vrije strings meer in risk output zonder registry entry.
- [ ] Test dat alle `decision.reasons` geregistreerd zijn.
- [ ] Test dat dashboard alle reason codes kan humanizen.
- [ ] Test dat unknown reason code in CI faalt.

---

## X8.2 Hard-safety versus paper-leniency scheiding

### Taken

- [ ] Hard safety blockers mogen nooit paper-relaxed worden.
- [ ] Paper leniency mag alleen soft blockers relaxen.
- [ ] Live mode mag paper leniency nooit gebruiken.
- [ ] Recovery probe mag geen open-position limits negeren tenzij expliciet toegestaan.
- [ ] Exchange truth freeze blokkeert altijd nieuwe entries.
- [ ] Reconcile required blokkeert live en demo-paper met exchange state.
- [ ] Operator ack required blokkeert volgens severity.
- [ ] Capital governor behavior verschilt paper/live maar moet tracebaar zijn.
- [ ] Weekend/session/funding gates moeten consistent zijn.

### Testcases

- [ ] `exchange_truth_freeze` in paper.
- [ ] `exchange_truth_freeze` in live.
- [ ] `capital_governor_recovery` in paper internal.
- [ ] `capital_governor_recovery` in demo paper.
- [ ] `capital_governor_recovery` in live.
- [ ] `model_confidence_too_low` near-miss paper probe.
- [ ] `model_confidence_too_low` live block.
- [ ] `quality_quorum_degraded` paper observe-only.
- [ ] `quality_quorum_degraded` live block.

---

## X8.3 Strategy output contract

### Taken

- [ ] Elke strategy geeft `id`, `family`, `fitScore`, `confidence`, `blockers`, `rationale`.
- [ ] Geen strategy mag `undefined` candidate teruggeven.
- [ ] Geen strategy mag side effects hebben.
- [ ] Strategy output wordt gevalideerd met schema.
- [ ] Dashboard toont strategy family consistent.
- [ ] Backtest/replay gebruikt dezelfde strategy-output schema.
- [ ] Elke strategy krijgt fixtures met bullish, bearish, range, high-vol, stale data.

---

# FASE X9 — AI, learning, neural en adaptive governance extra debug

## X9.1 AI modules mogen runtime niet onveilig muteren

### Taken

- [ ] Elke adaptive change krijgt `changeId`.
- [ ] Elke change krijgt `scope`.
- [ ] Elke change krijgt oldValue/newValue.
- [ ] Elke change krijgt evidence.
- [ ] Elke change krijgt rollback rule.
- [ ] Elke change krijgt mode restriction: paper-only, shadow-only, live-eligible.
- [ ] Live adaptive changes require explicit approval unless proven allowed.
- [ ] Neural self-tuning moet `PAPER_ONLY` afdwingen wanneer config dat zegt.
- [ ] Auto-promote paper/live moet default off blijven.
- [ ] Dashboard toont pending adaptive changes.
- [ ] CLI toont `learning:promotion` met rejection reasons.

---

## X9.2 Model/retrain dataset quality

### Taken

- [ ] Train/retrain weigert records zonder feature hash.
- [ ] Train/retrain weigert records zonder datasource lineage.
- [ ] Train/retrain weegt stale records lager.
- [ ] Train/retrain splitst paper/demo/live.
- [ ] Train/retrain splitst safe/probe/shadow/counterfactual.
- [ ] Train/retrain detecteert duplicate trades.
- [ ] Train/retrain detecteert lookahead bias.
- [ ] Train/retrain detecteert leakage uit future candles.
- [ ] Train/retrain detecteert missing fees/slippage.
- [ ] Train/retrain detecteert survivorship bias in watchlist.
- [ ] Retrain report toont waarom dataset niet klaar is.

---

## X9.3 Replay determinisme extra hard

### Taken

- [ ] Replay mag geen netwerk gebruiken.
- [ ] Replay mag geen huidige config gebruiken tenzij config hash matcht of override expliciet is.
- [ ] Replay gebruikt opgeslagen market snapshot.
- [ ] Replay gebruikt opgeslagen feature frame.
- [ ] Replay gebruikt opgeslagen open positions op cycle moment.
- [ ] Replay gebruikt opgeslagen account/equity snapshot.
- [ ] Replay gebruikt opgeslagen news/context lineage.
- [ ] Replay vergelijkt original vs replayed reason codes.
- [ ] Replay toont diffs per layer.
- [ ] Replay faalt als cruciale input ontbreekt, tenzij partial replay expliciet is.
- [ ] Replay tests draaien met frozen clock/random seed.

---

# FASE X10 — Storage, files, runtime-state en recovery extra debug

## X10.1 Snapshot bundle transaction log

### Taken

- [ ] Voeg `snapshot-manifest.json` toe.
- [ ] Manifest bevat runtime/journal/model/modelBackups hash.
- [ ] Save schrijft eerst staged files.
- [ ] Save schrijft staged manifest.
- [ ] Save rename files atomair waar mogelijk.
- [ ] Save rename manifest als laatste.
- [ ] Startup valideert manifest.
- [ ] Startup detecteert orphan `.tmp`.
- [ ] Startup detecteert staging leftovers.
- [ ] Startup kan laatste consistente bundle herstellen.
- [ ] Startup maakt corrupt quarantine met reden.
- [ ] `doctor` toont latest consistent state.
- [ ] `storage:audit` toont inconsistenties.

### Chaos tests

- [ ] Crash na runtime staged write.
- [ ] Crash na journal staged write.
- [ ] Crash na model staged write.
- [ ] Crash na files rename maar vóór manifest.
- [ ] Corrupt runtime JSON.
- [ ] Corrupt journal JSON.
- [ ] Missing model file.
- [ ] Permission denied runtime dir.
- [ ] Disk full simulatie.

---

## X10.2 Runtime schema audit

### Taken

- [ ] Runtime schema version bump policy documenteren.
- [ ] Elke migratie krijgt fixture test.
- [ ] Missing arrays worden arrays.
- [ ] Missing objects worden default objects.
- [ ] Invalid object/array types worden gecorrigeerd of hard gemeld.
- [ ] Open positions worden gevalideerd.
- [ ] Journal trades worden gevalideerd.
- [ ] Scale-outs worden gevalideerd.
- [ ] Counterfactual queue wordt getrimd.
- [ ] Audit indexes worden hersteld.
- [ ] Readmodel rebuild na schema migratie werkt.

---

# FASE X11 — Dashboard backend API volledige contractmatrix

## X11.1 GET-routes

### Routes

- [ ] `GET /api/snapshot`
- [ ] `GET /api/health`
- [ ] `GET /api/gui/status`
- [ ] `GET /api/gui/fast-execution`
- [ ] `GET /api/gui/diagnostics`
- [ ] `GET /api/config/env`
- [ ] `GET /api/config/profiles`
- [ ] `GET /api/readiness`
- [ ] `GET /api/mission-control`
- [ ] `GET /api/status`
- [ ] `GET /api/doctor`
- [ ] `GET /api/report`
- [ ] `GET /api/learning`
- [ ] `GET /metrics` when disabled.
- [ ] `GET /metrics` when enabled.
- [ ] static `/`, `/app.js`, `/styles.css`.
- [ ] `/shared/statusTone.js`.

### Per route testen

- [ ] Status code.
- [ ] Content-Type.
- [ ] Cache-Control.
- [ ] JSON shape.
- [ ] Error response shape.
- [ ] Geen secrets.
- [ ] Werkt als manager degraded is.
- [ ] Werkt als runtime files missing zijn.
- [ ] Werkt als snapshot partial is.
- [ ] Response binnen performance budget.

---

## X11.2 POST-routes

### Routes

- [ ] `POST /api/start`
- [ ] `POST /api/stop`
- [ ] `POST /api/refresh`
- [ ] `POST /api/cycle`
- [ ] `POST /api/research`
- [ ] `POST /api/mode`
- [ ] `POST /api/config/profile/preview`
- [ ] `POST /api/config/profile/apply`
- [ ] `POST /api/setup/run-checks`
- [ ] `POST /api/setup/complete`
- [ ] `POST /api/setup/reset`
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
- [ ] `POST /api/promotion/scope/approve`
- [ ] `POST /api/promotion/scope/rollback`
- [ ] `POST /api/promotion/probation/decide`

### Security tests

- [ ] POST zonder `x-dashboard-request: 1` geeft 403.
- [ ] POST met verkeerde content-type geeft 403/400.
- [ ] POST met externe Origin geeft 403.
- [ ] POST met malformed JSON geeft 400.
- [ ] POST body > max bytes geeft 413.
- [ ] Unknown POST route geeft 404.
- [ ] GET op POST-only route geeft 405.

### Contract tests

- [ ] Elke mutation schrijft audit/operator event.
- [ ] Elke mutation heeft clear success/error response.
- [ ] Mode switch naar live faalt zonder preflight.
- [ ] Profile apply met live profiel faalt zonder exacte ack.
- [ ] Alert ack/silence/resolve werkt idempotent.
- [ ] Force reconcile is safe/no-force-unlock.
- [ ] Promotion approval kan niet live zonder evidence.

---

# FASE X12 — Dashboard frontend/GUI extra debug

## X12.1 DOM-contract tussen index.html en app.js

### Taken

- [ ] Parse `index.html` en verzamel alle id’s.
- [ ] Parse `app.js` `querySelector("#...")` calls.
- [ ] Test dat elke door `app.js` gevraagde id bestaat in `index.html`.
- [ ] Test dat critical id’s niet per ongeluk dubbel bestaan.
- [ ] Test dat buttons `type="button"` hebben.
- [ ] Test dat script `/app.js` type module laadt.
- [ ] Test dat `/shared/statusTone.js` browser-compatible is.
- [ ] Test dat CSS niet ontbreekt.

### Id’s die expliciet getest moeten worden

- [ ] `modeBadge`
- [ ] `runStateBadge`
- [ ] `healthBadge`
- [ ] `refreshBadge`
- [ ] `controlHint`
- [ ] `operatorSummary`
- [ ] `startBtn`
- [ ] `stopBtn`
- [ ] `paperBtn`
- [ ] `liveBtn`
- [ ] `refreshBtn`
- [ ] `setupWizardBtn`
- [ ] `decisionSearch`
- [ ] `decisionAllowedOnly`
- [ ] `decisionMeta`
- [ ] `decisionShowMoreBtn`
- [ ] `overviewCards`
- [ ] `attentionList`
- [ ] `actionList`
- [ ] `quickActionsList`
- [ ] `configCurrentBadge`
- [ ] `configStatusPanel`
- [ ] `profileList`
- [ ] `profilePreview`
- [ ] `setupWizardPanel`
- [ ] `focusList`
- [ ] `positionsList`
- [ ] `recentTradesList`
- [ ] `opportunityList`
- [ ] `healthList`
- [ ] `learningList`
- [ ] `diagnosticsList`
- [ ] `explainabilityList`
- [ ] `promotionList`

---

## X12.2 Frontend render snapshots

### Snapshot fixtures

- [ ] Empty snapshot.
- [ ] Minimal snapshot.
- [ ] Ready paper snapshot.
- [ ] Blocked live snapshot.
- [ ] Degraded runtime snapshot.
- [ ] Missing `dashboard.ops`.
- [ ] Missing `dashboard.overview`.
- [ ] Missing `topDecisions`.
- [ ] Missing positions.
- [ ] Positions with NaN values.
- [ ] Trades with missing fees.
- [ ] Long reason codes.
- [ ] Very large arrays.
- [ ] Alerts active.
- [ ] Manual review pending.
- [ ] Unresolved intents.
- [ ] Slow snapshot metadata.

### Tests

- [ ] Render never throws.
- [ ] `controlHint` shows degraded render section if section fails.
- [ ] No `undefined` text in UI.
- [ ] No `[object Object]` text in UI.
- [ ] No NaN visible.
- [ ] Empty states are meaningful.
- [ ] Live banner/state is visually distinct.
- [ ] Paper/demo/live labels consistent.
- [ ] Buttons disable while busy.
- [ ] API errors show operator-readable message.
- [ ] Search/filter in opportunity board works.
- [ ] Show-more persists via localStorage safely.
- [ ] Polling handles stale responses by epoch.
- [ ] Race: refresh response older than newer response does not overwrite UI.

---

## X12.3 GUI action tests

### Actions

- [ ] Start button calls `/api/start` with correct header.
- [ ] Stop button calls `/api/stop` with correct header.
- [ ] Paper button calls `/api/mode` with `{mode:"paper"}`.
- [ ] Live button calls `/api/mode` but blocks/asks according to live preflight UX.
- [ ] Refresh button calls `/api/refresh` or reloads snapshot safely.
- [ ] Setup wizard button toggles wizard panel.
- [ ] Profile preview calls preview route.
- [ ] Profile apply calls apply route with required ack.
- [ ] Alert ack/silence/resolve controls call correct route.
- [ ] Diagnostics action controls call correct route.
- [ ] Promotion controls call correct route.

### Acceptatiecriteria

- [ ] Geen knop doet niets zonder foutmelding.
- [ ] Geen knop kan dubbel submitten tijdens busy.
- [ ] Geen live knop kan per ongeluk live starten zonder duidelijke gate.
- [ ] GUI toont backend errors in duidelijke taal.

---

## X12.4 CSS/responsive/accessibility debug

### Taken

- [ ] Test desktop 1920x1080.
- [ ] Test laptop 1366x768.
- [ ] Test small width 1024.
- [ ] Test zoom 125% en 150%.
- [ ] Test dark contrast.
- [ ] Test keyboard navigation.
- [ ] Test focus styles.
- [ ] Test screenreader labels voor statuschips.
- [ ] Test buttons have accessible names.
- [ ] Test no horizontal overflow op 1100px minWidth.
- [ ] Test long symbol/reason strings wrap correctly.
- [ ] Test large lists do not freeze UI.

---

# FASE X13 — Desktop/Electron/installer extra debug

## X13.1 Desktop dev-mode

### Taken

- [ ] `cd desktop && npm install` werkt.
- [ ] `npm run diagnose` checkt meer dan files bestaan.
- [ ] Diagnose importeert dashboard server als smoke.
- [ ] Diagnose checkt bot root.
- [ ] Diagnose checkt `.env` resolutie.
- [ ] Diagnose checkt log write permissions.
- [ ] Diagnose checkt dashboard health door server kort te starten.
- [ ] Diagnose checkt preload bestaat en sandbox settings.
- [ ] Diagnose geeft JSON en human summary.
- [ ] Desktop start toont dashboard.
- [ ] Desktop start toont error page bij dashboard-fail.
- [ ] Tray start/stop actions werken.
- [ ] Log file wordt geschreven.
- [ ] External browser link werkt.

---

## X13.2 Packaged build

### Taken

- [ ] `npm run desktop:dist:dir` werkt lokaal.
- [ ] `extraResources` bevat alle benodigde bot files.
- [ ] Packaged `resources/bot/src/cli.js` bestaat.
- [ ] Packaged dashboard public files bestaan.
- [ ] Packaged `node_modules` compleet genoeg voor runtime.
- [ ] `.env` wordt niet mee verpakt.
- [ ] `.env.example` wordt wel mee verpakt.
- [ ] Data/log/tmp folders worden niet mee verpakt.
- [ ] Packaged app kan env aanmaken/kopiëren.
- [ ] Packaged dashboard start vanaf resourcesPath.
- [ ] Packaged app kan logs schrijven naar AppData.
- [ ] Packaged app sluit dashboard server netjes.
- [ ] Installer uninstall laat user data wel/niet volgens policy staan.

---

## X13.3 Windows service/cmd scripts

### Scripts

- [ ] `Install-Windows11.cmd`
- [ ] `Start-Dashboard.cmd`
- [ ] `Start-BotService.cmd`
- [ ] `Start-Everything.cmd`
- [ ] `Start-BotService` via PowerShell/cmd context.

### Tests

- [ ] Scripts werken met pad met spaties.
- [ ] Scripts werken met korte clone path.
- [ ] Scripts detecteren ontbrekende Node.
- [ ] Scripts detecteren verkeerde Node versie.
- [ ] Scripts detecteren ontbrekende npm install.
- [ ] Scripts tonen `.env` instructies.
- [ ] Scripts schrijven logs.
- [ ] Scripts zetten exit codes correct.
- [ ] Scripts starten geen live mode zonder explicit ack.

---

# FASE X14 — Observability, logs, metrics en incidenten extra debug

## X14.1 Structured logging contract

### Taken

- [ ] Elke logregel JSON of consistent text+metadata.
- [ ] Elke error log heeft `error.message` en safe stack.
- [ ] Elke cycle heeft `cycleId`.
- [ ] Elke order intent heeft `intentId`.
- [ ] Elke broker call heeft `caller`.
- [ ] Elke REST call heeft request budget metadata.
- [ ] Elke dashboard request failure logt route/status.
- [ ] Geen secrets in logs.
- [ ] Redaction helper centraal gebruiken.
- [ ] Test redaction op API keys, secrets, tokens, webhook URLs.

---

## X14.2 Metrics contract

### Metrics

- [ ] bot running state.
- [ ] mode.
- [ ] readiness status.
- [ ] cycle duration.
- [ ] last cycle age.
- [ ] open positions.
- [ ] unresolved intents.
- [ ] active alerts.
- [ ] request weight used.
- [ ] REST errors by type.
- [ ] dashboard snapshot duration.
- [ ] storage save duration.
- [ ] paper equity.
- [ ] daily PnL.
- [ ] trade count by mode.
- [ ] rejected candidates by reason.

### Tests

- [ ] `/metrics` disabled returns 404.
- [ ] `/metrics` enabled returns Prometheus text.
- [ ] Metrics contain no secrets.
- [ ] Metrics labels have bounded cardinality.

---

## X14.3 Incident bundle V2

### Bundle bevat

- [ ] config hash.
- [ ] safe config summary.
- [ ] runtime snapshot.
- [ ] journal excerpt.
- [ ] open positions.
- [ ] unresolved intents.
- [ ] active alerts.
- [ ] latest audit events.
- [ ] request budget status.
- [ ] exchange truth summary.
- [ ] dashboard health.
- [ ] storage audit.
- [ ] replay manifest.
- [ ] environment summary zonder secrets.
- [ ] version/git sha.

### Tests

- [ ] Bundle generation zonder runtime files.
- [ ] Bundle generation met corrupt runtime.
- [ ] Bundle generation met live config redacts keys.
- [ ] Bundle generation output is deterministic enough.

---

# FASE X15 — Security, secrets en local-only safety extra debug

## X15.1 Secret scanning

### Taken

- [ ] Voeg `scripts/scan-secrets.mjs` toe.
- [ ] Scan `.env`, logs, data, docs, testfixtures.
- [ ] Scan staged git files via pre-commit.
- [ ] Detecteer Binance-like keys.
- [ ] Detecteer generic API secrets.
- [ ] Detecteer webhook URLs.
- [ ] Detecteer bearer tokens.
- [ ] Detecteer private keys.
- [ ] Allowlist test dummy keys.
- [ ] CI faalt bij verdachte secrets.

---

## X15.2 Dashboard local security

### Taken

- [ ] Dashboard bindt standaard alleen `127.0.0.1`.
- [ ] Config voor public bind vereist explicit flag.
- [ ] Public bind toont grote warning in doctor/dashboard.
- [ ] POST mutation vereist local origin + header.
- [ ] Voeg optionele dashboard token toe.
- [ ] Token nooit in logs.
- [ ] Static server path traversal tests.
- [ ] Shared files alleen uit toegestane directory.
- [ ] CORS blijft dicht tenzij expliciet.

---

# FASE X16 — Performance, memory en timing bugs

## X16.1 Cycle performance budget

### Taken

- [ ] Meet duration per cyclefase.
- [ ] Set budget per fase.
- [ ] Detecteer langzaamste symbolen.
- [ ] Detecteer overmatig REST gebruik.
- [ ] Detecteer memory growth per 100 cycles.
- [ ] Detecteer unbounded arrays in runtime.
- [ ] Detecteer journal trim werkt.
- [ ] Detecteer dataRecorder retention werkt.
- [ ] Detecteer dashboard snapshot build onder budget blijft.
- [ ] Detecteer frontend render bij 100+ decisions niet bevriest.

### Budgets voorstel

- [ ] Config load < 500ms.
- [ ] Dashboard snapshot < 750ms normaal, < 2000ms degraded.
- [ ] Status command < 1500ms zonder netwerk.
- [ ] Doctor command < 5000ms met exchange checks.
- [ ] Paper cycle offline fixture < 3000ms.
- [ ] Frontend render < 100ms voor normale snapshot.

---

## X16.2 Timers en shutdown

### Taken

- [ ] Manager loop interruptible delay werkt.
- [ ] SIGINT stopt netjes.
- [ ] SIGTERM stopt netjes.
- [ ] Dashboard shutdown stopt manager.
- [ ] Electron before-quit stopt embedded dashboard.
- [ ] Geen open timers na tests.
- [ ] Geen dangling server handles.
- [ ] Geen unhandled promise rejections.
- [ ] Geen repeated signal handler leaks bij restart.

---

# FASE X17 — CI/CD extra gates bovenop bestaande workflow

## X17.1 CI uitbreiden

### Bestaande basis

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm test`
- [ ] `npm run coverage`

### Extra gates toevoegen

- [ ] `node scripts/check-critical-files.mjs`
- [ ] `node scripts/analyze-dependencies.mjs --ci`
- [ ] `node scripts/check-env-duplicates.mjs .env.example`
- [ ] `node scripts/check-package-scripts.mjs`
- [ ] `node scripts/check-dashboard-dom-contract.mjs`
- [ ] `node scripts/check-api-route-contracts.mjs`
- [ ] `node scripts/scan-secrets.mjs --ci`
- [ ] `node --check src/cli.js`
- [ ] `node --check src/cli/runCli.js`
- [ ] `node --check src/runtime/tradingBot.js`
- [ ] `node src/cli.js config:check --ci`
- [ ] `node src/cli.js doctor --no-network` of equivalent.
- [ ] `node src/cli.js status --no-network` of equivalent.
- [ ] `npm run test:dashboard`
- [ ] `npm run test:safety`
- [ ] `cd desktop && npm ci && npm run diagnose`

### CI artifacts

- [ ] test results JSON.
- [ ] coverage report.
- [ ] dependency graph.
- [ ] inventory summary.
- [ ] dashboard route contract report.
- [ ] secret scan report.

---

# FASE X18 — Bug bash rondes per domein

## Ronde 1 — Build/import bash

- [ ] Alle modules syntax-checken.
- [ ] Alle imports resolven.
- [ ] Alle exports valideren.
- [ ] Alle package scripts uitvoeren of dry-runnen.
- [ ] Alle critical files non-empty.
- [ ] Alle command names in docs bestaan.

## Ronde 2 — Config/mode bash

- [ ] Elk profiel laden.
- [ ] Elke foutieve env waarde testen.
- [ ] Elke duplicate key testen.
- [ ] Elk live safety conflict testen.
- [ ] Elk paper/demo conflict testen.

## Ronde 3 — Runtime bash

- [ ] Bot init.
- [ ] Bot refresh.
- [ ] One cycle.
- [ ] Multiple cycles.
- [ ] Stop/restart.
- [ ] Persist fail.
- [ ] Runtime corrupt.
- [ ] Health circuit open/close.

## Ronde 4 — Execution bash

- [ ] Paper entry.
- [ ] Paper scale-out.
- [ ] Paper exit.
- [ ] Demo entry.
- [ ] Demo reconcile.
- [ ] Live preflight blocked.
- [ ] Live order fake-client success.
- [ ] Live order fake-client failure.
- [ ] Intent ambiguity.

## Ronde 5 — Dashboard bash

- [ ] Static load.
- [ ] Snapshot load.
- [ ] Health load.
- [ ] Buttons.
- [ ] Render missing fields.
- [ ] Render huge payload.
- [ ] API errors.
- [ ] Busy state.
- [ ] Polling race.

## Ronde 6 — Desktop bash

- [ ] Diagnose.
- [ ] Dev start.
- [ ] Packaged dir.
- [ ] Error page.
- [ ] Tray actions.
- [ ] Logs.
- [ ] Shutdown.

## Ronde 7 — Storage/recovery bash

- [ ] Runtime migration.
- [ ] Journal migration.
- [ ] Snapshot bundle.
- [ ] Corrupt quarantine.
- [ ] Restore test.
- [ ] Backup retention.

## Ronde 8 — AI/learning bash

- [ ] Adaptive status.
- [ ] Promotion report.
- [ ] Replay packs.
- [ ] Counterfactual queue.
- [ ] Threshold changes.
- [ ] Rollback rules.
- [ ] Dataset quality.

## Ronde 9 — Security bash

- [ ] Secret scan.
- [ ] Dashboard local bind.
- [ ] POST origin/header.
- [ ] Incident redaction.
- [ ] Logs redaction.

## Ronde 10 — Final release bash

- [ ] Fresh clone.
- [ ] Fresh install.
- [ ] First run.
- [ ] Dashboard manual smoke.
- [ ] Desktop manual smoke.
- [ ] Paper one-cycle.
- [ ] Demo preflight.
- [ ] Live blocked preflight.
- [ ] Release notes.
- [ ] Rollback package.

---

# FASE X19 — Extra checklists voor specifieke bestanden

## `src/runtime/tradingBot.js`

- [ ] Bestand bestaat en is niet leeg.
- [ ] Exporteert named `TradingBot`.
- [ ] Constructor is side-effect-light.
- [ ] `init()` laadt stores, model, runtime, journal.
- [ ] `init()` kiest broker via factory.
- [ ] `refreshAnalysis()` faalt niet zonder network als offline mode.
- [ ] `runCycle()` wrapped `runTradingCycle` of equivalent.
- [ ] `runCycleCore()` is testbaar met fake market data.
- [ ] `persist()` schrijft snapshot bundle.
- [ ] `getStatus()` heeft minimale shape.
- [ ] `runDoctor()` heeft minimale shape.
- [ ] `getReport()` heeft minimale shape.
- [ ] `getDashboardSnapshot()` heeft minimale shape.
- [ ] Alle manager-called mutation methods bestaan.
- [ ] Elke public method heeft test.

## `test/run.js`

- [ ] Niet leeg.
- [ ] Auto-discovery.
- [ ] Fails on zero tests.
- [ ] Supports filters.
- [ ] Captures failures.
- [ ] Handles async tests.
- [ ] Handles timeouts.
- [ ] Writes report.
- [ ] Exits nonzero on failure.

## `src/cli/runCli.js`

- [ ] Geen onnodige top-level heavy imports.
- [ ] Command registry.
- [ ] Unknown command errors.
- [ ] Read-only commands read-only.
- [ ] Dangerous commands marked.
- [ ] JSON output consistent.
- [ ] `markCommandSuccess` betrouwbaar.

## `src/dashboard/server.js`

- [ ] Routes contracttest.
- [ ] Static path traversal test.
- [ ] Mutation security test.
- [ ] Error responses consistent.
- [ ] Shutdown test.
- [ ] Event stream test.
- [ ] Metrics test.

## `src/dashboard/public/app.js`

- [ ] DOM ids match.
- [ ] Render missing fields.
- [ ] Render partial dashboard.
- [ ] API error UX.
- [ ] Busy state.
- [ ] Race-safe polling.
- [ ] No undefined/NaN output.

## `desktop/main.js`

- [ ] Dev root resolve.
- [ ] Packaged root resolve.
- [ ] Embedded dashboard start.
- [ ] Error page.
- [ ] Tray actions.
- [ ] Log path.
- [ ] Shutdown.
- [ ] Security settings.

## `desktop/scripts/desktop-diagnose.mjs`

- [ ] Checks syntax imports.
- [ ] Checks dashboard health.
- [ ] Checks write permissions.
- [ ] Checks packaged resources if env flag.
- [ ] Returns useful JSON.

## `.github/workflows/ci.yml`

- [ ] Adds all extra gates.
- [ ] Adds desktop diagnose.
- [ ] Uploads artifacts.
- [ ] Runs safety tests.
- [ ] Blocks empty critical files.

---

# FASE X20 — Overhaul acceptance scorecard

## Must be green

- [ ] Critical file check: green.
- [ ] Dependency graph: green or documented allowed cycles.
- [ ] Env duplicate check: green.
- [ ] Config strict parser: green.
- [ ] CLI smoke: green.
- [ ] Test runner: green with >0 tests.
- [ ] Safety tests: green.
- [ ] Dashboard backend contracts: green.
- [ ] Dashboard frontend render tests: green.
- [ ] Desktop diagnose: green.
- [ ] Storage recovery tests: green.
- [ ] Secret scan: green.
- [ ] Coverage threshold met.
- [ ] Manual dashboard test completed.
- [ ] Manual desktop test completed.
- [ ] Paper one-cycle completed.
- [ ] Live preflight safely blocked without ack.

## Must be red/no-go if true

- [ ] `tradingBot.js` empty or missing export.
- [ ] `test/run.js` executes 0 tests.
- [ ] Dashboard white screen on normal startup.
- [ ] Dashboard start button silently fails.
- [ ] Live mode can start without ack/protection/API keys.
- [ ] Demo paper is labeled live.
- [ ] Any secret appears in logs/dashboard/incident/test output.
- [ ] Storage corruption causes silent data loss.
- [ ] Persist failure after entry is not surfaced.
- [ ] CI green while local `doctor` fails on clean paper config.

---

# Appendix A — Nieuwe scripts om toe te voegen

- [ ] `scripts/check-critical-files.mjs`
- [ ] `scripts/analyze-dependencies.mjs`
- [ ] `scripts/check-env-duplicates.mjs`
- [ ] `scripts/check-package-scripts.mjs`
- [ ] `scripts/check-dashboard-dom-contract.mjs`
- [ ] `scripts/check-api-route-contracts.mjs`
- [ ] `scripts/scan-secrets.mjs`
- [ ] `scripts/smoke-cli.mjs`
- [ ] `scripts/smoke-dashboard.mjs`
- [ ] `scripts/smoke-desktop.mjs`
- [ ] `scripts/generate-debug-inventory.mjs`
- [ ] `scripts/generate-debug-report.mjs`
- [ ] `scripts/check-no-network-in-tests.mjs`
- [ ] `scripts/check-reason-code-registry.mjs`
- [ ] `scripts/check-mode-isolation.mjs`

---

# Appendix B — Nieuwe npm scripts voorstel

```json
{
  "debug:inventory": "node scripts/generate-debug-inventory.mjs",
  "debug:deps": "node scripts/analyze-dependencies.mjs",
  "debug:critical": "node scripts/check-critical-files.mjs",
  "debug:env": "node scripts/check-env-duplicates.mjs .env.example",
  "debug:dashboard-dom": "node scripts/check-dashboard-dom-contract.mjs",
  "debug:api-contracts": "node scripts/check-api-route-contracts.mjs",
  "debug:secrets": "node scripts/scan-secrets.mjs --ci",
  "smoke:cli": "node scripts/smoke-cli.mjs",
  "smoke:dashboard": "node scripts/smoke-dashboard.mjs",
  "test:dashboard": "node test/run.js --dashboard",
  "test:storage": "node test/run.js --storage",
  "test:chaos": "node test/run.js --chaos",
  "test:security": "node test/run.js --security",
  "qa:strict": "npm run debug:critical && npm run debug:deps && npm run debug:env && npm run lint && npm run format:check && npm test && npm run test:safety && npm run test:dashboard && npm run coverage && npm run smoke:cli && npm run smoke:dashboard && npm run debug:secrets"
}
```

---

# Appendix C — Pull request checklist voor elke fix

- [ ] Bug heeft issue of debug-ticket.
- [ ] Reproduce command staat in PR.
- [ ] Root cause staat in PR.
- [ ] Fix is klein genoeg om te reviewen.
- [ ] Nieuwe test toegevoegd.
- [ ] Safety impact beschreven.
- [ ] Dashboard impact beschreven.
- [ ] Storage impact beschreven.
- [ ] Live impact beschreven, ook als “geen”.
- [ ] Rollback plan beschreven.
- [ ] `qa:strict` resultaat geplakt.
- [ ] Screenshots of JSON output bij dashboard/API changes.
- [ ] Geen secrets in diff.

---

# Appendix D — Debug report template V3

```md
# Debug Overhaul Report V3

## Samenvatting
- Datum:
- Commit:
- Branch:
- Uitvoerder:

## Kritieke fixes
- [ ] TradingBot contract hersteld
- [ ] Test-runner hersteld
- [ ] Config strict parser
- [ ] Dashboard contracttests
- [ ] Broker mode isolation
- [ ] Storage recovery

## Commands gedraaid
```bash
npm ci
npm run qa:strict
node src/cli.js doctor
node src/cli.js status
node src/cli.js dashboard
cd desktop && npm run diagnose
```

## Resultaten
- Unit tests:
- Integration tests:
- Safety tests:
- Dashboard tests:
- Desktop tests:
- Coverage:

## Open bugs
| Severity | Domein | Bug | Reproduce | Owner | Status |
|---|---|---|---|---|---|

## Dashboard verificatie
- Browser:
- Console errors:
- API health:
- Buttons:
- Live/paper labels:

## Live safety verificatie
- Ack missing:
- API keys missing:
- Protection disabled:
- Demo endpoint conflict:

## Releasebesluit
- [ ] GO
- [ ] NO-GO

## Reden

## Rollback plan
```

---

# Appendix E — Dagindeling voor uitvoering

## Dag 1 — Repo/import/test-runner

- [ ] Critical file checker.
- [ ] TradingBot contract smoke.
- [ ] Test-runner discovery.
- [ ] CI fails on zero tests.
- [ ] CLI syntax/import smoke.

## Dag 2 — Config/mode/broker safety

- [ ] Strict config parser.
- [ ] Env duplicate detection.
- [ ] Mode matrix.
- [ ] Broker factory.
- [ ] Live preflight.

## Dag 3 — Runtime/cycle/execution

- [ ] TradingBot minimal runtime.
- [ ] Paper cycle fixture.
- [ ] Intent ledger tests.
- [ ] PaperBroker invariants.
- [ ] DemoPaperBroker remap tests.

## Dag 4 — Storage/recovery/audit

- [ ] Snapshot manifest.
- [ ] Corrupt quarantine.
- [ ] Runtime migrations.
- [ ] Audit schema.
- [ ] Incident bundle.

## Dag 5 — Dashboard API/frontend

- [ ] Backend route contracts.
- [ ] POST security.
- [ ] DOM contract.
- [ ] Render fixtures.
- [ ] Button tests.

## Dag 6 — Desktop/installer/security

- [ ] Desktop diagnose V2.
- [ ] Electron dev smoke.
- [ ] Packaged dir smoke.
- [ ] Secret scan.
- [ ] Dashboard local security.

## Dag 7 — Final QA/release

- [ ] Fresh clone.
- [ ] Full `qa:strict`.
- [ ] Manual dashboard smoke.
- [ ] Manual desktop smoke.
- [ ] Paper one-cycle.
- [ ] Live blocked preflight.
- [ ] Debug report.
- [ ] Release/no-go decision.

---

## Laatste extra advies

De grootste fout bij dit project zou zijn om meteen nieuwe AI/trading-features te bouwen terwijl de basis-runtime, test-runner, dashboard-contracten en mode-isolatie nog niet hard bewezen zijn. De juiste volgorde is:

1. **Repo kan niet meer groen zijn met lege kernbestanden.**
2. **Test-runner moet alles echt uitvoeren.**
3. **Config en mode safety moeten fail-fast zijn.**
4. **TradingBot contract moet stabiel zijn.**
5. **Paper/demo/live execution moet keihard gescheiden zijn.**
6. **Dashboard en desktop moeten niet alleen starten, maar ook degraded states goed tonen.**
7. **Pas daarna AI-learning, replay, strategieën en live-promotie verder uitbreiden.**
