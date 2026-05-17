# Extra verbeter-roadmap voor Codex AI Trading Bot

Repo: `mrcryptolife420/NEW-NEW-ai-trading-bot`
Datum: 2026-05-08
Doel: naast GUI/profile/neural fixes ook de hele bot robuuster, veiliger, testbaarder en makkelijker te onderhouden maken.

---

## Korte conclusie

Naast de eerder gemaakte roadmap voor:

- wit scherm in de desktop GUI
- paper/demo profiles
- `.env` persistence
- setup wizard
- neural paper mode

zou ik nog deze grote verbeteringen doen:

1. **Test-runner en echte testdekking herstellen**
2. **CI/CD pipeline toevoegen**
3. **No-live-leak safety gates verplicht maken**
4. **Config strictness en dangerous-key validation verbeteren**
5. **Desktop release/debug flow professionaliseren**
6. **Observability, logs en diagnostics uitbreiden**
7. **Paper/demo ledger betrouwbaarder maken**
8. **Backtest/replay deterministisch maken**
9. **Secrets/security hardening**
10. **Documentatie en operator UX verbeteren**

---

# P0 — Test-runner herstellen

## Probleem

`package.json` gebruikt:

```json
"test": "node test/run.js"
```

Maar `test/run.js` lijkt leeg. Daardoor kan `npm test` mogelijk succesvol eindigen zonder echte tests.

## Doel

`npm test` moet echt alle tests uitvoeren en falen als er geen tests gevonden worden.

## Checklist

- [ ] Vul `test/run.js` met een echte test-loader.
- [ ] Laat `test/run.js` alle bestanden vinden:
  - [ ] `test/**/*.test.js`
  - [ ] `test/**/*.tests.js`
  - [ ] `desktop/test/**/*.test.js`
- [ ] Laat test-runner falen als 0 tests gevonden zijn.
- [ ] Voeg test summary toe:
  - [ ] aantal files
  - [ ] aantal suites
  - [ ] aantal assertions
  - [ ] duur
- [ ] Voeg exit code `1` toe bij failure.
- [ ] Voeg smoke test toe die altijd draait.
- [ ] Voeg `npm run test:unit` toe.
- [ ] Voeg `npm run test:integration` toe.
- [ ] Voeg `npm run test:desktop` toe.
- [ ] Voeg `npm run test:safety` toe.
- [ ] Voeg `npm run qa` toe.

## Voorbeeld scripts

```json
{
  "scripts": {
    "test": "node test/run.js",
    "test:unit": "node test/run.js --unit",
    "test:integration": "node test/run.js --integration",
    "test:safety": "node test/run.js --safety",
    "test:desktop": "cd desktop && npm run test",
    "qa": "npm run lint && npm run format:check && npm run test && npm run coverage && node src/cli.js feature:audit"
  }
}
```

## Acceptatie

- [ ] `npm test` faalt als test-map leeg is.
- [ ] `npm test` toont duidelijke summary.
- [ ] `npm run coverage` geeft echte coverage.
- [ ] CI kan niet groen zijn zonder tests.

---

# P0 — No-live-leak safety gates

## Probleem

Voor tradingsoftware is het belangrijkste risico dat paper/demo mode per ongeluk live endpoints of echte orders raakt.

## Doel

Bewijzen dat `BOT_MODE=paper` nooit live orders kan plaatsen.

## Checklist

- [ ] Maak `test/noLiveLeak.test.js`.
- [ ] Mock alle exchange private order endpoints.
- [ ] Run bot in `BOT_MODE=paper`.
- [ ] Simuleer entry decision.
- [ ] Verifieer:
  - [ ] geen `placeOrder`
  - [ ] geen `placeOrderListOco`
  - [ ] geen live account mutation
  - [ ] geen cancel live order
- [ ] In paper mode mogen private endpoints alleen gebruikt worden als read-only én expliciet toegestaan.
- [ ] Voeg runtime guard toe:
  - [ ] elke private order call checkt `botMode === "live"`.
- [ ] Voeg fail-fast error toe:
  - [ ] `LIVE_ORDER_CALL_IN_PAPER_MODE`
- [ ] Voeg audit event toe bij geblokkeerde live leak.
- [ ] Voeg CI gate toe.

## Acceptatie

- [ ] Test faalt als een live order endpoint wordt aangeroepen in paper mode.
- [ ] Paper/demo profile kan nooit live order plaatsen.
- [ ] Dashboard toont `liveLeakGuard=active`.

---

# P0 — Config strictness verbeteren

## Probleem

Het config-schema is flexibel en gebruikt `.passthrough()`. Dat is handig, maar gevaarlijk voor trading: typfouten in env keys kunnen stil genegeerd worden.

## Doel

Twee modes:

1. **Development permissive**
2. **Trading strict**

## Checklist

- [ ] Voeg `CONFIG_STRICT_MODE=true` toe.
- [ ] In strict mode:
  - [ ] onbekende env keys falen hard
  - [ ] gevaarlijke combinaties falen hard
  - [ ] live mode vereist expliciete acknowledgement
  - [ ] neural live autonomy vereist aparte acknowledgement
- [ ] Voeg dangerous combination validator toe:
  - [ ] `BOT_MODE=live` + demo endpoint = fail
  - [ ] `BOT_MODE=paper` + live autonomy = fail
  - [ ] `PAPER_EXECUTION_VENUE=binance_demo_spot` + `BOT_MODE=live` = fail
  - [ ] `NEURAL_AUTO_PROMOTE_LIVE=true` zonder acknowledgement = fail
- [ ] Voeg config doctor toe:
  - [ ] `node src/cli.js config:doctor`
- [ ] Voeg config diff toe:
  - [ ] toont effective config versus `.env`
  - [ ] secrets redacted

## Acceptatie

- [ ] Typfout in gevaarlijke key wordt zichtbaar.
- [ ] Live-risk combinatie faalt vóór bot start.
- [ ] GUI toont config errors duidelijk.

---

# P0 — CI/CD pipeline toevoegen

## Doel

Elke push/PR moet automatisch testen.

## Checklist GitHub Actions

Maak:

```text
.github/workflows/ci.yml
```

Jobs:

- [ ] install
- [ ] lint
- [ ] format check
- [ ] unit tests
- [ ] integration tests
- [ ] coverage
- [ ] feature audit
- [ ] rest audit
- [ ] paper safety
- [ ] no-live-leak
- [ ] desktop package smoke build

## Matrix

- [ ] Windows latest
- [ ] Ubuntu latest
- [ ] Node LTS
- [ ] Node current

## Voorbeeld commands

```bash
npm ci
npm run lint
npm run format:check
npm test
npm run coverage
node src/cli.js feature:audit
node src/cli.js rest:audit
```

Desktop build:

```bash
cd desktop
npm ci
npm run dist
```

## Acceptatie

- [ ] PR kan niet mergen bij falende tests.
- [ ] Coverage report wordt artifact.
- [ ] Desktop build artifact wordt bewaard.
- [ ] No-live-leak gate is verplicht.

---

# P0 — Desktop build en installer robuuster maken

## Probleem

Je kreeg eerder locks op `app.asar` en daarna een witte GUI. De desktop build heeft te weinig debug scripts.

## Checklist

In `desktop/package.json` toevoegen:

```json
{
  "scripts": {
    "start:debug": "set DESKTOP_DEBUG=1&& electron .",
    "dist:fresh": "electron-builder --win --config.directories.output=dist-new",
    "dist:dir": "electron-builder --win --dir",
    "clean": "node scripts/clean-desktop-dist.mjs",
    "diagnose": "node scripts/desktop-diagnose.mjs"
  }
}
```

- [ ] Voeg `description` toe.
- [ ] Voeg `author` toe.
- [ ] Voeg `dist:fresh` toe.
- [ ] Voeg `dist:dir` toe voor snelle test zonder installer.
- [ ] Voeg `desktop-diagnose.mjs` toe:
  - [ ] checkt Electron install
  - [ ] checkt `main.js`
  - [ ] checkt bundled bot files
  - [ ] checkt dashboard public files
  - [ ] checkt active env path
- [ ] Voeg `clean-desktop-dist.mjs` toe:
  - [ ] detecteert lock
  - [ ] geeft duidelijke instructie
  - [ ] bouwt optioneel naar `dist-new`

## Acceptatie

- [ ] Je kunt debug-build starten met één command.
- [ ] Build lock geeft duidelijke uitleg.
- [ ] `dist:fresh` werkt zonder oude dist te verwijderen.
- [ ] Installer smoke test is reproduceerbaar.

---

# P1 — Observability en logs uitbreiden

## Doel

Als iets faalt, moet je in één scherm zien wat.

## Checklist

- [ ] Centrale log-map:
  - [ ] `%APPDATA%\Codex AI Trading Bot\logs`
- [ ] Logbestanden:
  - [ ] `desktop-main.log`
  - [ ] `dashboard-server.log`
  - [ ] `bot-manager.log`
  - [ ] `orders-audit.ndjson`
  - [ ] `profile-apply.ndjson`
  - [ ] `safety-events.ndjson`
- [ ] GUI-knoppen:
  - [ ] open logs
  - [ ] export diagnostics zip
  - [ ] copy diagnostics summary
- [ ] Diagnostics zip bevat:
  - [ ] redacted `.env`
  - [ ] latest logs
  - [ ] package versions
  - [ ] active paths
  - [ ] dashboard health
  - [ ] feature audit
- [ ] Nooit secrets in logs.
- [ ] Voeg `redactSecrets` tests toe.

## Acceptatie

- [ ] Eén knop maakt support zip.
- [ ] Zip bevat geen API keys.
- [ ] Fouten zijn traceerbaar.

---

# P1 — Paper/demo ledger verbeteren

## Doel

Paper trading moet boekhoudkundig betrouwbaar zijn.

## Checklist

- [ ] Maak `paper-ledger.ndjson`.
- [ ] Elke paper event krijgt:
  - [ ] event id
  - [ ] decision id
  - [ ] order id
  - [ ] fill id
  - [ ] position id
  - [ ] timestamp
  - [ ] symbol
  - [ ] side
  - [ ] quantity
  - [ ] price
  - [ ] fee
  - [ ] slippage
  - [ ] broker mode
  - [ ] execution venue
- [ ] Maak ledger invariant checks:
  - [ ] cash nooit NaN
  - [ ] quantity nooit negatief
  - [ ] realized PnL klopt
  - [ ] open positions match ledger
- [ ] Voeg reconcile command toe:

```bash
node src/cli.js paper:reconcile
```

- [ ] Voeg report toe:

```bash
node src/cli.js paper:ledger-report
```

## Acceptatie

- [ ] Paper PnL is reproduceerbaar vanuit ledger.
- [ ] Dashboard kan ledger status tonen.
- [ ] Beschadigde ledger wordt gedetecteerd.

---

# P1 — Backtest/replay deterministisch maken

## Doel

Je moet beslissingen kunnen reproduceren.

## Checklist

- [ ] Elke run krijgt `runId`.
- [ ] Elke cycle krijgt `cycleId`.
- [ ] Elke decision krijgt `decisionId`.
- [ ] Alle random keuzes krijgen seeded RNG.
- [ ] Backtest slaat seed op.
- [ ] Replay kan exact dezelfde decision reconstrueren.
- [ ] Voeg `replay:decision --id <decisionId>` toe.
- [ ] Voeg snapshot artifact toe:
  - [ ] config hash
  - [ ] market data hash
  - [ ] model hash
  - [ ] strategy version
  - [ ] risk version
- [ ] Voeg replay determinism tests toe.

## Acceptatie

- [ ] Zelfde input + seed = zelfde output.
- [ ] Replay verklaart waarom trade wel/niet genomen werd.
- [ ] Dashboard linkt decision naar replay.

---

# P1 — Security en secrets hardening

## Wat al goed is

`.gitignore` sluit `.env`, `.env.*`, keys, credentials en data uit.

## Extra checklist

- [ ] Voeg secret scanner toe:
  - [ ] gitleaks
  - [ ] detect-secrets
- [ ] Voeg pre-commit hook toe voor secrets.
- [ ] Voeg CI secret scan toe.
- [ ] Redact secrets in:
  - [ ] logs
  - [ ] diagnostics zip
  - [ ] dashboard API
  - [ ] error page
  - [ ] profile preview
- [ ] Voeg tests toe voor `redactSecrets`.
- [ ] API endpoints mogen nooit `BINANCE_API_SECRET` teruggeven.
- [ ] Desktop error page mag nooit secrets tonen.
- [ ] Voeg `.env.backup` ook aan gitignore toe:
  - [ ] `.env.bak*`
  - [ ] `.env.tmp`
  - [ ] `diagnostics-*.zip`

## Acceptatie

- [ ] Secret scanner groen.
- [ ] Geen API key in logs/diagnostics.
- [ ] Geen secret in GUI error page.

---

# P1 — Dashboard UX verbeteren

## Checklist

- [ ] Grote mode banner:
  - [ ] PAPER
  - [ ] DEMO SPOT
  - [ ] LIVE
- [ ] Active profile zichtbaar.
- [ ] Active `.env` path zichtbaar.
- [ ] Active project root zichtbaar.
- [ ] Neural status zichtbaar.
- [ ] Paper ledger status zichtbaar.
- [ ] Last profile apply zichtbaar.
- [ ] Last doctor result zichtbaar.
- [ ] Last cycle result zichtbaar.
- [ ] `safe to start` indicator.
- [ ] Button states:
  - [ ] Start disabled als config invalid is.
  - [ ] Live disabled zonder acknowledgement.
  - [ ] Neural live disabled zonder acknowledgement.
- [ ] Elke fout heeft een actie:
  - [ ] open env
  - [ ] open logs
  - [ ] run doctor
  - [ ] run setup wizard

## Acceptatie

- [ ] Beginner ziet wat hij moet doen.
- [ ] Geen verborgen failures.
- [ ] Start-knop kan niet gevaarlijk verkeerd gebruikt worden.

---

# P1 — CLI verbeteren

## Nieuwe commands

```bash
node src/cli.js config:doctor
node src/cli.js config:show --redacted
node src/cli.js profile:list
node src/cli.js profile:preview paper-demo-spot
node src/cli.js profile:apply paper-demo-spot
node src/cli.js paper:doctor
node src/cli.js paper:once
node src/cli.js paper:reconcile
node src/cli.js desktop:diagnose
node src/cli.js safety:audit
node src/cli.js neural:status
```

## Acceptatie

- [ ] Alles wat GUI doet kan ook via CLI.
- [ ] CLI toont redacted config.
- [ ] Profile apply via CLI wijzigt dezelfde `.env`.

---

# P1 — Release en versiebeheer

## Checklist

- [ ] Voeg `CHANGELOG.md` toe.
- [ ] Voeg semantic versioning toe.
- [ ] Voeg build metadata toe in GUI:
  - [ ] app version
  - [ ] git commit
  - [ ] build date
  - [ ] config schema version
- [ ] Voeg migraties toe voor `.env`.
- [ ] Voeg `configVersion` toe.
- [ ] Bij oude `.env`:
  - [ ] backup maken
  - [ ] migreren
  - [ ] diff tonen
- [ ] Installer artifact naam bevat version + commit.
- [ ] Release checklist toevoegen.

## Acceptatie

- [ ] Je weet welke build draait.
- [ ] Config upgrades zijn veilig.
- [ ] Oude `.env` breekt app niet stil.

---

# P1 — Data lifecycle en cleanup

## Checklist

- [ ] Runtime data max grootte instelbaar.
- [ ] Logs rotatie:
  - [ ] max MB
  - [ ] max dagen
- [ ] History retention zichtbaar in GUI.
- [ ] Command voor cleanup:

```bash
node src/cli.js data:cleanup
```

- [ ] Command voor backup:

```bash
node src/cli.js data:backup
```

- [ ] Command voor restore:

```bash
node src/cli.js data:restore <file>
```

## Acceptatie

- [ ] App groeit niet oneindig op schijf.
- [ ] Je kunt runtime state backuppen.
- [ ] Je kunt terug naar vorige veilige state.

---

# P2 — Codebase onderhoudbaarheid

## Checklist

- [ ] Splits grote modules verder op.
- [ ] Voeg architectuurdocument toe:
  - [ ] config layer
  - [ ] runtime manager
  - [ ] strategy layer
  - [ ] risk layer
  - [ ] execution layer
  - [ ] dashboard layer
  - [ ] desktop wrapper
- [ ] Voeg ADR’s toe:
  - [ ] waarom paper/demo zo werken
  - [ ] waarom live gated is
  - [ ] waarom neural live uit staat
- [ ] Voeg dependency update workflow toe.
- [ ] Voeg `npm audit` of alternatief toe in CI.
- [ ] Voeg lint rule toe tegen directe private exchange calls buiten broker layer.
- [ ] Voeg import boundary tests toe.

## Acceptatie

- [ ] Nieuwe features hebben duidelijke plek.
- [ ] Directe live call buiten broker layer faalt lint/test.
- [ ] Architectuur is begrijpbaar.

---

# P2 — Trading risk management uitbreiden

## Checklist

- [ ] Max daily trades per profile.
- [ ] Max loss streak per profile.
- [ ] Max symbol exposure per profile.
- [ ] Max sector exposure per profile.
- [ ] Volatility kill switch.
- [ ] Exchange outage kill switch.
- [ ] News/event kill switch.
- [ ] Manual emergency stop.
- [ ] Cooldown na crash/restart.
- [ ] Post-restart reconcile verplicht.
- [ ] Paper/demo safety parity report.

## Acceptatie

- [ ] Bot kan niet direct doortraden na crash zonder checks.
- [ ] Risk locks zichtbaar in GUI.
- [ ] Emergency stop werkt vanuit GUI en CLI.

---

# P2 — Paper/demo realism

## Checklist

- [ ] Spread model per symbol.
- [ ] Slippage model per liquidity regime.
- [ ] Fee tiers.
- [ ] Partial fills.
- [ ] Min notional rejection.
- [ ] Precision rejection.
- [ ] Stale quote rejection.
- [ ] Rate limit simulation.
- [ ] API outage simulation.
- [ ] Flash crash scenario.
- [ ] Gap scenario.
- [ ] Reconcile mismatch scenario.
- [ ] Demo exchange constraint parity.

## Acceptatie

- [ ] Paper results zijn realistischer.
- [ ] Strategieën worden niet te optimistisch beoordeeld.
- [ ] Demo mode verklaart afwijkingen.

---

# P2 — AI/neural governance

## Checklist

- [ ] Neural change proposals krijgen eigen audit log.
- [ ] Elke neural wijziging krijgt:
  - [ ] reason
  - [ ] before
  - [ ] after
  - [ ] evidence count
  - [ ] expected impact
  - [ ] rollback condition
- [ ] Human approval flow voor promotion.
- [ ] Paper-only auto-apply begrenzen.
- [ ] Live auto-apply verboden tenzij expliciet unlocked.
- [ ] Neural experiments dashboard.
- [ ] Model registry UI.
- [ ] Rollback-knop.

## Acceptatie

- [ ] Neural kan niet stil gevaarlijke wijzigingen doen.
- [ ] Elke wijziging is verklaarbaar.
- [ ] Rollback werkt.

---

# P2 — Documentatie voor jou als operator

## Bestanden

```text
docs/OPERATOR_MANUAL_NL.md
docs/SAFETY_MANUAL_NL.md
docs/DESKTOP_INSTALL_NL.md
docs/PAPER_DEMO_MODE_NL.md
docs/NEURAL_MODE_NL.md
docs/TROUBLESHOOTING_NL.md
```

## Checklist

- [ ] Installatie stap voor stap.
- [ ] Wat is paper mode?
- [ ] Wat is demo spot?
- [ ] Wat is live mode?
- [ ] Wat doet neural mode?
- [ ] Hoe zet je profiel om?
- [ ] Waar staat `.env`?
- [ ] Hoe debug je wit scherm?
- [ ] Hoe exporteer je logs?
- [ ] Hoe stop je veilig?
- [ ] Hoe herstel je backup?

## Acceptatie

- [ ] Je kunt de bot beheren zonder code te lezen.
- [ ] Fouten zijn opzoekbaar.
- [ ] Veiligheidsregels zijn duidelijk.

---

# Aanbevolen volgorde

## Eerst doen

- [ ] Test-runner herstellen.
- [ ] No-live-leak tests.
- [ ] Desktop error page/logs.
- [ ] Active `.env` path zichtbaar.
- [ ] Profile apply verify.

## Daarna

- [ ] CI pipeline.
- [ ] Neural paper profiles.
- [ ] Setup wizard.
- [ ] Paper ledger.
- [ ] Config strict mode.

## Later

- [ ] Installer polish.
- [ ] Full replay determinism.
- [ ] AI governance UI.
- [ ] Operator docs NL.

---

# Eindacceptatie voor “professioneel bruikbaar”

- [ ] Geen wit scherm.
- [ ] Profiles werken aantoonbaar.
- [ ] `.env` pad zichtbaar.
- [ ] `npm test` draait echte tests.
- [ ] CI draait automatisch.
- [ ] Paper mode kan geen live orders plaatsen.
- [ ] Neural paper mode is actief maar veilig.
- [ ] Logs en diagnostics zijn exporteerbaar.
- [ ] Installer is reproduceerbaar.
- [ ] Operator docs zijn compleet.
