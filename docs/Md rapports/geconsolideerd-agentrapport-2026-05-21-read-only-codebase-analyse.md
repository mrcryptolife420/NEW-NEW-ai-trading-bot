# Geconsolideerd agentrapport - read-only codebase-analyse

Datum: 2026-05-21

Status: read-only auditrapport met open implementatiepunten.

Scope:

- Package scripts en CLI commands.
- `src/cli.js` en `src/cli/runCli.js`.
- `src/runtime/botManager.js`.
- `src/runtime/tradingBot.js` als feitelijke core trading lifecycle.
- `src/core/tradingBot.js` is niet aanwezig in deze repo.
- Paper/demo/live scheiding en live-mode guards.
- Dashboard API/state/UI.
- Paper trading services.
- Open positions, PnL, exposure, trim, dynamic stop, dynamic target en Exit v2.
- Binance REST ban, rate limits en circuit breakers.
- Bestaande roadmaps, complete rapporten en debug inventory.
- Tests/lint/typecheck/coverage dekking.

Niet uitgevoerd:

- Geen codewijzigingen.
- Geen live trading.
- Geen watch-mode.
- Geen `npm run live`.
- Geen dev-server of dashboardserver gestart door deze audit.

## 1. Agentstatus

Afgerond:

- `cli_command_surface_auditor`: afgerond; geen P0, wel P1 command-contract drift.
- `botmanager_exchange_health_auditor`: afgerond; geen P0, wel P1 REST-ban/mode-switch risico's.

Timeout of niet volledig beschikbaar:

- `core_tradingbot_lifecycle_auditor`: gestart, maar na meerdere waits afgesloten als timeout.
- `paper_live_boundary_auditor`: gestart, maar na meerdere waits afgesloten als timeout.
- `dashboard_state_api_auditor`: gestart, maar na meerdere waits afgesloten als timeout.
- `positions_pnl_trim_auditor`: gestart, maar na meerdere waits afgesloten als timeout.
- `binance_rate_limit_circuitbreaker_auditor`: eerste poging faalde op usage limit; tweede poging gestart, maar na waits afgesloten als timeout.
- `test_contract_runner`: niet gestart door thread-limiet; veilige checks zijn lokaal door de hoofdagent uitgevoerd.
- `roadmap_continuity_planner`: niet gestart door thread-limiet; docs/voltooid/compleet context is lokaal gecontroleerd.

## 2. Uitgevoerde veilige checks

Groen:

- `npm.cmd run typecheck`: shape contract passed, 28 dashboard actions, 78 package scripts.
- `npm.cmd run debug:api-contracts`: API route contract passed, 48 routes.
- `npm.cmd run debug:package-scripts`: package script check passed, 78 scripts, 122 known commands.
- `npm.cmd run test:no-live-leak`: 2/2 private mutation checks passed, unsafe list leeg.
- `npm.cmd run test:safe`: 237/237 passed, 1309 skipped.
- `npm.cmd run lint`: passed.
- `npm.cmd run format:check`: passed.
- `npm.cmd run test:dashboard`: 1546/1546 passed.
- `npm.cmd run coverage:check`: passed; c8 thresholds gehaald.

Niet uitgevoerd:

- `npm run qa` en `npm run qa:strict`: niet nodig voor read-only audit en bevatten zware gecombineerde flows.
- `npm run smoke:dashboard`: niet uitgevoerd omdat dit een tijdelijke dashboardserver start.
- `npm run live`: expliciet niet uitgevoerd.
- Watch-mode commands: expliciet niet uitgevoerd.

## 3. P0 kritieke bugs

Geen P0 bevestigd.

De uitgevoerde safety gates tonen geen direct bewijs van:

- private Binance order-mutaties in interne paper-mode;
- live trading zonder acknowledgement;
- falende dashboard action route contracts;
- falende shape-contracts;
- falende dashboard regression suite.

## 4. P1 belangrijke bugs

### P1.1 Command contract drift tussen docs/AGENTS, package scripts en echte CLI

Bronnen:

- `AGENTS.md` noemt `npm run dev`, `npm run live`, `npm run gui` en direct `node src/cli.js paper/live/gui`.
- `package.json` bevat `start`, `once`, `paper`, `paper:once`, `demo`, `demo:once`, `dashboard`, maar geen `dev`, `live` of `gui`.
- `paper` en `demo` lopen via `scripts/run-mode.mjs`, niet als directe `src/cli.js paper/live/gui` branches.

Impact:

- Operator-runbooks en projectinstructies kunnen commando's noemen die lokaal niet bestaan.
- Nieuwe agents of operators kunnen verkeerde of niet-bestaande commands gebruiken.
- Safetyclassificatie per command blijft moeilijk als `commandRegistry` niet de volledige source of truth is.

Aanbevolen fix:

- Maak een centrale command matrix die `package.json`, `src/cli/commandRegistry.js`, `src/cli/runCli.js` en `AGENTS.md` valideert.
- Kies expliciet of `dev/live/gui/scan/train` moeten bestaan of uit docs verwijderd moeten worden.

### P1.2 CLI flags zijn ambigu

Bronnen:

- `src/cli.js` gebruikt `process.argv[2] || "run"` als command en `process.argv.slice(3)` als args.
- Er is geen globale parsing voor `--once`, `--paper`, `--live` of `--dry-run`.
- `node src/cli.js run --once` blijft een continue run-loop.
- `--paper` of `--live` als eerste argument wordt geen mode maar een command.

Impact:

- Operators kunnen denken dat ze een veilige one-shot of paper run starten terwijl de semantics anders zijn.
- Muterende commands zoals `reconcile:run` hebben geen overal consistente dry-run semantics.

Aanbevolen fix:

- Voeg flag ambiguity tests toe.
- Blokkeer onbekende globale mode flags hard of implementeer centrale parser.
- Maak `--dry-run` per mutating command expliciet.

### P1.3 Dashboard command is niet read-only safe

Bronnen:

- `npm run dashboard` start de server en initialiseert de manager.
- Dashboard exposeert muterende POST-routes zoals `/api/start`, `/api/cycle`, `/api/mode`, config apply, force reconcile en promotion actions.
- Action contracts bestaan, maar dashboard als command moet niet als read-only worden geclassificeerd.

Impact:

- Een operator kan dashboard starten als observability-only, terwijl API-mutaties beschikbaar zijn.
- Live-sensitive routes zijn guarded, maar de command-classificatie moet dit zichtbaar maken.

Aanbevolen fix:

- Classificeer `dashboard` als long-running, mutating-capable en live-sensitive-by-configuration.
- Voeg package/registry test toe dat dashboard nooit als read-only wordt getoond.

### P1.4 `commandRegistry` is geen volledige source of truth

Bronnen:

- `src/cli/commandRegistry.js` bevat een subset.
- `src/cli/runCli.js` bevat veel extra branches, inclusief `neural:*`, `live:*`, `ops:*`, `research:*`, `docs:generate` en incident/reporting commands.

Impact:

- Help, docs en package validation kunnen groen zijn terwijl command branches niet correct geclassificeerd zijn.
- Muterende of long-running routes kunnen buiten command safety metadata vallen.

Aanbevolen fix:

- Laat alle CLI-branches via een centrale registry lopen.
- Laat `debug:package-scripts` registry-gedreven valideren.

### P1.5 REST 418 zonder parsebare `banUntil` wordt niet conservatief sticky

Bronnen:

- `BinanceClient` zet bij status `418` `state.banUntil = banUntil || state.banUntil`.
- Als Binance geen parsebare expiry meestuurt en er nog geen bestaande `banUntil` is, blijft `banActive` false.

Impact:

- De bot kan na een 418 zonder parsebare ban expiry blijven proberen in plaats van conservatief te pauzeren.
- Dit verhoogt risico op verdere REST-ban escalatie.

Aanbevolen fix:

- Gebruik bij 418 zonder parsebare expiry een conservatieve fallback ban/backoff.
- Voeg unit test toe voor 418 zonder `Retry-After` en zonder parsebare payloadtijd.

### P1.6 Mode-switch gebruikt gedeelde runtime zonder expliciete open-position guard

Bronnen:

- `BotManager.setMode()` kan runtime herladen.
- `runtime.openPositions` blijft gedeeld; source-of-truth filtering mitigeert maar partitioneert niet hard.
- `getManagedSymbols()` neemt open positions mee.

Impact:

- Paper/live state kan in dezelfde runtime aanwezig blijven.
- Filters verlagen risico, maar een expliciete mode-switch guard met open positions ontbreekt.

Aanbevolen fix:

- Blokkeer mode-switch als er open positions of unresolved execution intents bestaan, tenzij expliciet operator-confirmed.
- Voeg test toe met gedeelde runtime waarin live en paper positions aanwezig zijn.

### P1.7 `/api/snapshot` na stop kan herinitialisatie triggeren

Bron:

- Eerdere BotManager-agent rapporteerde dat `stop()` `botNeedsReinitialize=true` kan zetten en `getSnapshot()` standaard `ensureBotReady()` kan aanroepen.

Impact:

- Dashboard polling na stop kan meer doen dan puur read-only state tonen.
- Dit kan runtime bootstrap/streams/REST-prerequisites opnieuw raken.

Aanbevolen fix:

- Maak een stopped-safe snapshot path dat geen reinitialize doet.
- Voeg dashboard test toe: `/api/snapshot` na stop mag geen `reinitializeBot()` triggeren.

## 5. P2 verbeteringen

### P2.1 Dode of overlappende CLI branches

Observatie:

- Sommige `ops:*` commands worden eerst via `command.startsWith("ops:")` afgehandeld en later nog eens als losse branch genoemd.

Impact:

- Onderhoud wordt foutgevoelig.
- Testdekking kan onbereikbare branches missen.

Aanbevolen fix:

- Voeg unreachable-command-branch audit toe aan `debug:package-scripts`.

### P2.2 Ban scheduler gebruikt `tradingIntervalSeconds` in plaats van `banUntil`

Observatie:

- Bij actieve ban doet de cycle pre-check geen REST, maar manager scheduling blijft intervalgedreven.

Impact:

- Veel herhaalde skip-events/persists tijdens lange bans.
- Dashboard kan druk of verwarrend lijken terwijl het systeem correct pauzeert.

Aanbevolen fix:

- Laat manager sleep tot `min(runtime.nextCycleAt, banUntil)` met een maximale cap.
- Test dat ban-active loops geen hot polling veroorzaken.

### P2.3 Shared Binance client heeft geen centrale request-weight queue

Observatie:

- Er is één shared `BinanceClient` per `TradingBot`.
- Concurrency wordt op botniveau begrensd, maar `request()` serialiseert niet centraal op weight budget.

Impact:

- Een hot symbol/snapshot path kan de globale IP-budgetdruk voor alle symbols verhogen.

Aanbevolen fix:

- Voeg centrale budget-aware request queue toe of expliciete per-caller token bucket.
- Voeg multi-symbol burst test toe.

### P2.4 `src/core/tradingBot.js` ontbreekt

Observatie:

- De projectinstructies noemen `src/core/tradingBot.js`.
- De repo bevat geen `src/core` map; de feitelijke core zit in `src/runtime/tradingBot.js`.

Impact:

- Agents en docs kunnen de verkeerde architectuur zoeken.

Aanbevolen fix:

- Werk AGENTS/docs bij of voeg een expliciete bridge/README toe die uitlegt dat `runtime/tradingBot.js` de core is.

## 6. Paper/live safety risico's

Bevestigde mitigaties:

- Live mode vereist acknowledgement en blokkeert demo endpoint combinaties.
- Binance private order mutations worden client-side geblokkeerd buiten live of expliciete paper demo spot.
- `test:no-live-leak` is groen.
- `test:safe` is groen.

Open risico's:

- Mode-switch met open positions heeft geen expliciete harde guard.
- Shared runtime is source-scoped maar niet hard storage-partitioned.
- Dashboard command is mutating-capable en moet zo gelabeld blijven.

## 7. Dashboard/API mismatches

Bevestigd aanwezig:

- Dashboard action contracts bestaan.
- API route contract check is groen.
- Start/stop envelopes zijn contractueel gedekt.
- DOM contract is eerder aanwezig via debug inventory.

Open risico's:

- Dashboard als command is niet read-only.
- `/api/snapshot` na stop moet expliciet stopped-safe worden getest.
- Elke `liveSensitive: true` POST-route zou testbaar gekoppeld moeten zijn aan concrete confirmation/guard behavior.

## 8. Binance/rate-limit risico's

Bevestigd aanwezig:

- 429 backoff bestaat.
- 418 ban-detectie bestaat.
- `runCycleCore()` kan bij actieve ban vroeg skippen.
- Dashboard prerequisite refresh kan REST-achtige refreshes tijdens ban overslaan.

Open risico's:

- 418 zonder parsebare expiry is niet conservatief sticky genoeg.
- Scheduler slaapt niet op `banUntil`.
- Geen centrale request-weight queue.
- Binance specialist-agent heeft geen volledig afgerond rapport geleverd door usage-limit/thread-timeout.

## 9. Niet-aangesloten of onduidelijk aangesloten modules

Geen module is als volledig niet-aangesloten bewezen, maar deze zones vragen vervolgcontrole:

- `commandRegistry` versus alle branches in `runCli.js`.
- `src/core/tradingBot.js` documentatiepad versus daadwerkelijke `src/runtime/tradingBot.js`.
- Dashboard read-only command-classificatie.
- REST budget governor versus directe `BinanceClient.request()` concurrency.
- Mode-switch policy versus runtime open positions.

## 10. Ontbrekende tests

Aanbevolen nieuwe tests:

- Package/CLI command matrix: `package.json`, `commandRegistry`, `runCli` en `AGENTS.md` moeten consistent zijn.
- Flag ambiguity tests: `run --once`, `--paper`, `--live`, `--dry-run`.
- Dashboard command classification test: `dashboard` is long-running en mutating-capable.
- Live guard matrix: `run`, `once`, dashboard `/api/start` en `/api/cycle` zonder acknowledgement.
- 418 fallback-ban test zonder parsebare `banUntil`.
- Mode-switch test met open paper/live positions in shared runtime.
- `/api/snapshot` na stop mag niet reinitialiseren.
- Ban scheduler test dat `banUntil`/`nextCycleAt` wordt gerespecteerd.
- Multi-symbol REST burst test voor shared `BinanceClient`.
- Registry coverage test voor onbereikbare `ops:*` branches.

## 11. Beste implementatievolgorde

1. Fix P1.5: 418 zonder parsebare `banUntil` conservatief pauzeren.
2. Fix P1.6: mode-switch guard bij open positions en unresolved execution intents.
3. Fix P1.1/P1.4: centrale command registry en package/docs contract.
4. Fix P1.2: globale flag ambiguity blokkeren of parser toevoegen.
5. Fix P1.7: stopped-safe `/api/snapshot`.
6. Fix P1.3: dashboard command expliciet mutating-capable classificeren.
7. Voeg P2 scheduler-aanpassing toe voor `banUntil`.
8. Voeg request-weight queue/token bucket toe.
9. Ruim dode CLI branches op.
10. Werk docs bij rond ontbrekende `src/core/tradingBot.js`.

## 12. Aanbevolen eerste fix

Eerste fix:

- Maak Binance REST `418` zonder parsebare `banUntil` conservatief sticky.

Reden:

- Dit raakt live safety en rate-limit bescherming direct.
- Het is klein en testbaar.
- Het voorkomt dat de bot na een REST-ban zonder parsebare expiry blijft proberen.

Minimale test:

- Simuleer status `418` zonder `Retry-After` en zonder parsebare payloadtijd.
- Verwacht `banActive === true`, een fallback `banUntil`, en geen vervolgaanvraag binnen fallback-venster.
