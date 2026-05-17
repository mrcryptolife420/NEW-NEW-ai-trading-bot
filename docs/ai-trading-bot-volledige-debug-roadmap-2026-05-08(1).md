# Volledige debug-roadmap — Binance AI Trading Bot

**Repo:** `mrcryptolife420/NEW-NEW-ai-trading-bot`
**Branch:** `main`
**Datum:** 2026-05-08
**Doel:** eerst de volledige codebase betrouwbaar startbaar, testbaar, uitlegbaar en veilig maken voordat er nieuwe trading-features, live-mode of extra neural/autonomy worden geactiveerd.

> Dit document is technisch bedoeld. Het is geen financieel advies en geen winstgarantie. Live trading blijft risicovol. Debug en validatie moeten altijd eerst in `paper` of veilige demo/testnet-context gebeuren.

---

## Afwerkstatus — 2026-05-09

Status: afgerond op code- en verificatieniveau.

- P0 runtime/test-runner: `TradingBot` en `test/run.js` zijn niet leeg; import-, syntax-, smoke-, unit-, integration-, safety- en volledige test-run zijn groen.
- P1 config: `.env.example` heeft geen actieve duplicate keys meer; duplicate env keys en ongeldige expliciete scalar values worden hard afgewezen.
- P1 broker wiring: centrale broker factory toegevoegd en getest voor paper internal, paper Binance demo spot, live spot en ongeldige live/demo-combinaties.
- P1 live guardrails: `live:preflight` toegevoegd als read-only preflight die live start blokkeert bij ontbrekende acknowledgement, demo-endpoint drift, account-permission onzekerheid, unresolved intents of kritieke alerts.
- P2 dashboard/runtime smoke: dashboard `/api/health` gaf JSON terug en Browser-smoke laadde `Trading Desk` met zichtbare paper/degraded/readiness/blocker-status.
- Security/secrets: lokale secret scan draaide zonder tracked secret leak; lokale `.env` bevat wel verdachte waarden maar is genegeerd door `.gitignore` en niet tracked.

Niet uitgevoerd als bewuste safety-keuze:

- Geen live trading gestart.
- Geen echte order-endpoints aangeroepen.
- Geen `once`-cycle na de dashboard-smoke, omdat de lokale Binance public-data checks een actieve IP-ban/rate-limit-status rapporteerden.

Aanvulling 2026-05-16:

- Beginner setup is gelijkgetrokken met de dashboard trade-profile catalogus: `setup:wizard paper` gebruikt nu `beginner-paper-learning`, en `setup:wizard demo` gebruikt `paper-demo-spot`.
- `writeSetupWizardEnv` gebruikt nu dezelfde atomische `.env` update/backup-route als GUI profile apply, in plaats van de volledige `.env` te vervangen.
- De losse `config/profiles/*.env.example` bestanden bevatten nu `CONFIG_PROFILE` en `CONFIG_CAPABILITY_BUNDLES`, zodat gekopieerde profielbestanden door backend en dashboard herkenbaar blijven.
- Guarded-live profile apply valideert nu tegen de nieuwe profile endpoint-update, zodat overstappen vanaf demo-paper naar live-template niet foutief op de oude demo endpoint blokkeert.
- Verificatie: repo-brede syntax/import/env/API/DOM/dependency checks, lint, format, volledige test-suite, coverage, CLI smoke en dashboard smoke zijn groen.

Aanvulling 2026-05-16 avond:

- Profiel-apply root cause opgelost: `.env.example` allowlistte `CONFIG_PROFILE` en `CONFIG_CAPABILITY_BUNDLES` niet, waardoor een correct toegepast profiel daarna bij `status`, `doctor`, dashboardstart of Start-Everything als onbekende config drift faalde.
- Trade profiles hebben nu een expliciete `TRADE_PROFILE_ID`, zodat dashboard/backend exact één actief profiel herkennen en neural paper niet meer tegelijk als beginner-profiel kan lijken.
- Lokale `.env` is bijgewerkt met `TRADE_PROFILE_ID=paper-neural-learning`; backup is gemaakt als `.env.bak-20260516-201237`.
- Paper loop escalatie is aangepast: herhaalde cycle failures zetten paper nu zichtbaar degraded maar niet stopped; live blijft stoppen op `manager_cycle_failure_escalated`.
- Start-Everything heeft regressiedekking voor de canonieke `runState='running'` check en correcte JSON mutation headers.
- Verificatie: `status` en `doctor` laden config weer, actieve profielcheck geeft exact `paper-neural-learning`, volledige test-suite draait groen met 1438 checks, coverage en smoke checks zijn groen.

---

## 0. Belangrijkste harde bevindingen

- [ ] **P0 — `src/runtime/tradingBot.js` is leeg.**
  De architectuur, CLI, dashboard en `BotManager` verwachten een centrale `TradingBot`, maar het bestand bevat geen implementatie. Dit breekt import/startup zodra een pad `TradingBot` nodig heeft.

- [ ] **P0 — `test/run.js` is leeg.**
  `package.json` routeert `npm test` naar `node test/run.js`, maar de runner voert niets uit. Daardoor kan de repo vals “groen” lijken terwijl tests niet draaien.

- [ ] **P0 — CLI, dashboard en desktop hangen indirect aan dezelfde lege runtime.**
  `src/cli.js` laadt `src/cli/runCli.js`; `runCli.js` en `src/runtime/botManager.js` importeren `TradingBot`; `src/dashboard/server.js` initialiseert `BotManager`; `desktop/main.js` start die dashboardserver embedded. Eén leeg runtime-bestand kan dus CLI, dashboard en desktop tegelijk breken.

- [ ] **P1 — `.env.example` bevat dubbele keys.**
  Voorbeelden: `WATCHLIST`, `DATA_RECORDER_ENABLED`, `DATA_RECORDER_RETENTION_DAYS`, `DATA_RECORDER_COLD_RETENTION_DAYS`, `MODEL_REGISTRY_*`, `STATE_BACKUP_*`. Bij `.env`-parsing wint meestal de laatste waarde; dat maakt debugging onbetrouwbaar.

- [ ] **P1 — config parsing valt stil terug op defaults bij ongeldige expliciete waarden.**
  `parseNumber(value, fallback)` accepteert bijvoorbeeld `MAX_OPEN_POSITIONS=abc` niet als fout maar valt terug op default. Voor trading/risk-config is dat gevaarlijk.

- [ ] **P1 — paper/demo-brokers bestaan, maar de centrale brokerselectie moet opnieuw bewezen worden.**
  `PaperBroker` en `DemoPaperBroker` zijn aanwezig. `DemoPaperBroker` remapt naar `brokerMode: "paper"` en `executionVenue: "binance_demo_spot"`, maar omdat `TradingBot` ontbreekt is niet bewezen dat `BOT_MODE=paper` + `PAPER_EXECUTION_VENUE=...` correct kiest tussen internal paper, Binance demo spot en live.

- [ ] **P1 — live guardrails zijn deels aanwezig, maar moeten strenger en centraal worden.**
  `BotManager` blokkeert live zonder risk acknowledgment, met demo endpoint, of met `PAPER_EXECUTION_VENUE=binance_demo_spot`. Voeg expliciete checks toe voor API keys, `ENABLE_EXCHANGE_PROTECTION=true`, account `canTrade=true`, en `SPOT` permissions.

- [ ] **P2 — `runCli.js` is te groot en heeft een brede import-blast-radius.**
  Veel commands importeren domeinen tegelijk. Een fout in één AI/research/ops-module kan unrelated commands breken.

- [ ] **P2 — docs claimen features/verified commands die nu niet hard bewijsbaar zijn.**
  README en feature docs noemen `npm test`, `doctor`, `status`, `once`, dashboard en feature audit. Door lege P0-bestanden moeten docs pas opnieuw “verified” zeggen nadat CI en lokale smoke-tests groen zijn.

---

## 1. Debug-filosofie

Werk in deze volgorde:

1. **Niet fixen op gevoel. Eerst reproduceren.**
2. **Eerst import/startup herstellen.**
3. **Dan test-runner herstellen.**
4. **Dan config/env hard maken.**
5. **Dan paper/demo/live brokerselectie bewijzen.**
6. **Dan dashboard/desktop.**
7. **Dan AI/neural/replay/learning.**
8. **Pas daarna nieuwe features of live mode.**

### Algemene regel

- [ ] Elke fix krijgt minimaal één test.
- [ ] Elke test moet falen vóór de fix en slagen ná de fix.
- [ ] Geen live order-endpoints tijdens debug.
- [ ] Geen secrets in logs, tests, fixtures of incident bundles.
- [ ] Geen “groene” build accepteren als `test/run.js` nul tests draait.

---

## 2. Directe triage: wat mag nu niet gebeuren

- [ ] Geen live trading starten.
- [ ] Geen `NEURAL_LIVE_AUTONOMY_ENABLED=true`.
- [ ] Geen echte Binance order-endpoints gebruiken.
- [ ] Geen desktop installer publiceren.
- [ ] Geen nieuwe strategieën toevoegen.
- [ ] Geen grote refactor vóór P0 groen is.
- [ ] Geen `.env`-wijzigingen zonder duplicate-key en strict-type checks.

---

## 3. Reproduceerbare baseline maken

### 3.1 Branch en status

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

- [ ] Werk vanaf een aparte branch, bijvoorbeeld `debug/runtime-recovery`.
- [ ] Noteer huidige commit SHA.
- [ ] Commit geen `.env`, `data/`, `logs/`, `tmp/` of secrets.

### 3.2 Dependency baseline

```bash
node --version
npm --version
npm ci
```

Acceptance:

- [ ] Node 22 of nieuwer.
- [ ] `npm ci` slaagt.
- [ ] Geen dependency-install hacks nodig.

### 3.3 Critical file presence

```bash
node -e "const fs=require('fs'); for (const f of ['src/runtime/tradingBot.js','test/run.js','src/cli.js','src/cli/runCli.js','src/runtime/botManager.js']) { const s=fs.existsSync(f)?fs.statSync(f).size:0; console.log(f,s); if(!s) process.exitCode=1 }"
```

Acceptance:

- [ ] Kritieke bestanden bestaan.
- [ ] Kritieke bestanden zijn niet leeg.
- [ ] CI faalt als één van deze bestanden leeg is.

PowerShell alternatief:

```powershell
$files = @(
  "src/runtime/tradingBot.js",
  "test/run.js",
  "src/cli.js",
  "src/cli/runCli.js",
  "src/runtime/botManager.js"
)
foreach ($file in $files) {
  $item = Get-Item $file -ErrorAction SilentlyContinue
  if (-not $item -or $item.Length -eq 0) {
    Write-Error "Critical file missing or empty: $file"
    exit 1
  }
}
```

---

## 4. P0 — Runtime import herstellen

### Probleem

De code verwacht `TradingBot`, maar `src/runtime/tradingBot.js` is leeg.

Afhankelijke paden:

- [ ] `src/cli/runCli.js`
- [ ] `src/runtime/botManager.js`
- [ ] `src/runtime/cycleRunner.js`
- [ ] `src/runtime/decisionPipeline.js`
- [ ] `src/dashboard/server.js`
- [ ] `desktop/main.js`

### 4.1 Minimale import smoke-test

Maak `test/tradingBotContract.test.js`:

```js
import assert from "node:assert/strict";
import { TradingBot } from "../src/runtime/tradingBot.js";

export async function run() {
  assert.equal(typeof TradingBot, "function", "TradingBot moet een class/function exporteren");
}
```

Acceptance:

- [ ] Test faalt zolang `tradingBot.js` leeg is.
- [ ] Test slaagt zodra `TradingBot` export bestaat.

### 4.2 Vereist `TradingBot` contract

`TradingBot` moet minimaal deze interface leveren omdat andere modules deze methodes gebruiken:

```txt
constructor({ config, logger })
init(options)
close()
refreshAnalysis()
runCycle()
runCycleCore()
getStatus()
runDoctor()
getReport()
getAdaptiveLearningStatus()
runResearch({ symbols })
runMarketScanner({ symbols })
runIncidentReplayLab(options)
scanCandidatesForCycle(balance)
openBestCandidate(candidates, { executionBlockers })
persist()
trimJournal()
refreshOperationalViews({ nowIso })
updateSafetyState({ now, candidateSummaries })
recordEvent(type, payload)
noteEntryPersisted({ position, at })
noteEntryPersistFailed({ position, error, at })
notePaperTradePersisted({ position, at })
```

Checklist:

- [ ] Zoek in de Git history of er een eerdere echte `TradingBot` implementatie bestaat.
- [ ] Restore die implementatie als hij bestaat.
- [ ] Als restore te groot is: bouw eerst een **safe minimal runtime shell** die status/doctor/dashboard laat werken maar **geen entries opent**.
- [ ] Voeg contracttest toe die alle publieke methodes controleert.
- [ ] Voeg smoke-test toe voor `new TradingBot({ config, logger })`.

### 4.3 Safe minimal runtime shell

Doel: CLI/dashboard laten starten zonder orders.

Acceptance:

- [ ] `node --check src/runtime/tradingBot.js` slaagt.
- [ ] `node src/cli.js status` crasht niet op importniveau.
- [ ] `node src/cli.js doctor` crasht niet op importniveau.
- [ ] `node src/cli.js once` opent geen positie zolang pipeline/brokerselectie nog niet bewezen is.
- [ ] Dashboard `/api/health` geeft JSON terug.

### 4.4 Geen live-side effects

- [ ] `TradingBot.init()` mag geen order plaatsen.
- [ ] `TradingBot.refreshAnalysis()` mag geen order plaatsen.
- [ ] `TradingBot.getStatus()` mag geen private order endpoints nodig hebben.
- [ ] `TradingBot.runDoctor()` mag read-only zijn.
- [ ] `TradingBot.runCycle()` mag alleen entries openen nadat risk/execution gating bewezen is.

---

## 5. P0 — Test-runner herstellen

### Probleem

`package.json` gebruikt:

```json
"test": "node test/run.js"
```

Maar `test/run.js` is leeg. Bestaande testbestanden worden daardoor niet uitgevoerd.

### 5.1 Runner moet nul-tests blokkeren

Vervang `test/run.js` door een echte runner.

Basisontwerp:

```js
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const includeUnit = args.size === 0 || args.has("--unit");
const includeIntegration = args.size === 0 || args.has("--integration");
const includeSafety = args.size === 0 || args.has("--safety");

let passed = 0;
let failed = 0;

async function runTestModule(file) {
  const mod = await import(url.pathToFileURL(file).href);
  const tests = [];

  if (typeof mod.run === "function") {
    tests.push([path.basename(file), mod.run]);
  }

  for (const [name, value] of Object.entries(mod)) {
    if (name.startsWith("test") && typeof value === "function") {
      tests.push([`${path.basename(file)}:${name}`, value]);
    }
  }

  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error(error?.stack || error);
    }
  }
}

const files = (await fs.readdir(__dirname))
  .filter((name) => /\.tests?\.js$/.test(name))
  .filter((name) => name !== "run.js")
  .sort();

for (const name of files) {
  const lower = name.toLowerCase();
  if (!includeIntegration && lower.includes("integration")) continue;
  if (!includeSafety && lower.includes("safety")) continue;
  if (!includeUnit && !lower.includes("integration") && !lower.includes("safety")) continue;
  await runTestModule(path.join(__dirname, name));
}

if (passed + failed === 0) {
  console.error("No tests were executed.");
  process.exit(1);
}

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

### 5.2 Testbestanden inventariseren

Bekende testbestanden die runner moet ontdekken of expliciet registreren:

- [ ] `test/onlineModel.test.js`
- [ ] `test/symbolFilters.test.js`
- [ ] `test/riskManager.test.js`
- [ ] `test/walkForwardBacktest.tests.js`
- [ ] `test/executionSafetyFilters.tests.js`
- [ ] `test/neuralAutonomyRoadmap.tests.js`
- [ ] `test/featureAudit.tests.js`
- [ ] `test/binanceRestArchitecture.tests.js`
- [ ] `test/configOperatorMaintenance.tests.js`
- [ ] `test/featureWiringCompletionGate.tests.js`
- [ ] `test/largeFoundations.tests.js`
- [ ] `test/operatorSafetyTooling.tests.js`
- [ ] `test/safetyMaintenance.tests.js`
- [ ] `test/postReconcileEntryLimits.tests.js`
- [ ] `test/replayDeterminism.tests.js`
- [ ] `test/strategyLifecycle.tests.js`
- [ ] `test/breakoutRetestStrategy.tests.js`
- [ ] `test/candidateExplainability.tests.js`
- [ ] `test/readModelAnalyticsQueries.tests.js`
- [ ] `test/paperTradeLifecycleContract.tests.js`
- [ ] `test/featureActivationGovernor.tests.js`
- [ ] `test/walkForwardDeploymentReport.tests.js`
- [ ] `test/tradingPathHealth.tests.js`
- [ ] `test/decisionSupportFoundation.tests.js`
- [ ] `test/dataIntegrityMaintenance.tests.js`
- [ ] `test/paperExchangeSafety.tests.js`
- [ ] `test/paperReplayCoverageAutopilot.tests.js`
- [ ] `test/tradingQualityUpgrade.tests.js`
- [ ] `test/shadowStrategyTournament.tests.js`
- [ ] `test/featureFlagHygiene.tests.js`

Acceptance:

- [ ] `npm test` voert minimaal één test uit.
- [ ] Runner faalt hard bij nul tests.
- [ ] `npm run test:unit`, `npm run test:integration`, `npm run test:safety` filteren correct.
- [ ] `npm run coverage` toont echte coverage.

---

## 6. P0 — CLI smoke-tests

### Commands

```bash
node --check src/cli.js
node --check src/cli/runCli.js
node --check src/runtime/botManager.js
node --check src/runtime/tradingBot.js
npm test
node src/cli.js doctor
node src/cli.js status
node src/cli.js once
node src/cli.js feature:audit
node src/cli.js rest:audit
node src/cli.js trading-path:debug
```

Windows:

```powershell
npm.cmd test
node src/cli.js doctor
node src/cli.js status
node src/cli.js once
```

Acceptance:

- [ ] Geen import errors.
- [ ] Geen lege output bij `status`.
- [ ] `doctor` geeft duidelijke checks.
- [ ] `once` kan in paper mode veilig draaien.
- [ ] `feature:audit` en `rest:audit` geven machine-readable JSON.
- [ ] Bij falen is error actionable, niet “undefined is not a function”.

---

## 7. P1 — Config en `.env` debug

### 7.1 Duplicate-key detector

Voeg helper toe, bijvoorbeeld `src/config/envDiagnostics.js`:

```js
export function detectDuplicateEnvKeys(content = "") {
  const seen = new Map();
  const duplicates = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const key = trimmed.split("=")[0].trim();
    if (seen.has(key)) {
      duplicates.push({
        key,
        firstLine: seen.get(key),
        duplicateLine: index + 1
      });
    } else {
      seen.set(key, index + 1);
    }
  });

  return duplicates;
}
```

Checklist:

- [ ] Test op `.env.example`.
- [ ] Test op lokale `.env`.
- [ ] `doctor` toont duplicate keys met regelnummers.
- [ ] CI faalt bij duplicate keys in `.env.example`.
- [ ] Lokale `.env` faalt of waarschuwt afhankelijk van severity.

Acceptance:

- [ ] Geen duplicate keys in `.env.example`.
- [ ] Duplicates worden niet stil overschreven.
- [ ] Operator ziet welke waarde wint en waarom dat gevaarlijk is.

### 7.2 Strict type parsing

Vervang stille fallback voor expliciete values.

Voorbeeld:

```js
function parseNumberStrict(env, key, fallback, errors) {
  const raw = env[key];
  if (raw === undefined || raw === null || `${raw}`.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    errors.push({
      key,
      value: raw,
      expected: "finite number"
    });
    return fallback;
  }
  return parsed;
}
```

Checklist:

- [ ] `MAX_OPEN_POSITIONS=abc` stopt startup.
- [ ] `RISK_PER_TRADE=abc` stopt startup.
- [ ] `BOT_MODE=paper` blijft geldig.
- [ ] Lege keys gebruiken defaults.
- [ ] Expliciet ongeldige keys geven `ConfigValidationError`.

Acceptance:

- [ ] Geen stille fallback voor expliciet foute risk/live waarden.
- [ ] Errors tonen key, waarde en verwacht type.
- [ ] Dashboard setup toont dezelfde config errors.

### 7.3 Config profile cleanup

Splits `.env.example` in profielen:

```txt
config/profiles/paper-safe.env.example
config/profiles/paper-learn.env.example
config/profiles/binance-demo-spot.env.example
config/profiles/live-minimal.env.example
config/profiles/live-conservative.env.example
```

Acceptance:

- [ ] Nieuwe gebruiker start met `paper-safe`.
- [ ] Binance demo staat apart.
- [ ] Live-profiel bevat alleen live-relevante keys.
- [ ] Profiel toepassen schrijft `.env` atomisch en met backup.
- [ ] Setup wizard kan profiel valideren zonder bot te starten.

---

## 8. P1 — Paper mode volledig bewijzen

### Doel

Paper mode moet veilig, intern, reproduceerbaar en zonder echte orders werken.

### Vereiste config

```env
BOT_MODE=paper
PAPER_EXECUTION_VENUE=internal
ACCOUNT_PROFILE=paper
BINANCE_API_KEY=
BINANCE_API_SECRET=
```

### Checklist brokerselectie

- [ ] `TradingBot.init()` kiest `PaperBroker` bij `BOT_MODE=paper` + `PAPER_EXECUTION_VENUE=internal`.
- [ ] `PaperBroker.doctor()` geeft `mode: "paper"`.
- [ ] `PaperBroker.getBalance()` gebruikt `runtime.paperPortfolio`.
- [ ] `PaperBroker.enterPosition()` past `quoteFree`, fees en open positions aan.
- [ ] `PaperBroker.exitPosition()` sluit positie en schrijft trade analytics.
- [ ] Paper broker roept geen live order endpoints aan.
- [ ] Paper broker valideert portfolio-invariants na entry, scale-out en exit.

### Testcases

- [ ] Paper init maakt `paperPortfolio` met `STARTING_CASH`.
- [ ] Paper entry faalt bij onvoldoende balans.
- [ ] Paper entry faalt bij invalid quantity/min notional.
- [ ] Paper exit faalt veilig bij zero fill.
- [ ] Partial exit markeert remaining position correct.
- [ ] `brokerMode` blijft `paper`.
- [ ] `executionVenue` blijft `internal`.

### Commands

```bash
BOT_MODE=paper PAPER_EXECUTION_VENUE=internal node src/cli.js doctor
BOT_MODE=paper PAPER_EXECUTION_VENUE=internal node src/cli.js once
BOT_MODE=paper PAPER_EXECUTION_VENUE=internal node src/cli.js report
```

Acceptance:

- [ ] Eén paper cycle kan draaien zonder echte keys.
- [ ] Geen netwerkorder naar Binance.
- [ ] Runtime state bevat paper portfolio.
- [ ] Journal bevat paper trade only als een entry echt door alle paper gates komt.
- [ ] Dashboard toont duidelijk `Paper` en `internal`.

---

## 9. P1 — Binance demo spot mode bewijzen

### Doel

`PAPER_EXECUTION_VENUE=binance_demo_spot` moet paper blijven, maar echte demo-spot exchange mechanics mogen gebruiken.

### Vereiste config

```env
BOT_MODE=paper
PAPER_EXECUTION_VENUE=binance_demo_spot
BINANCE_API_BASE_URL=https://demo-api.binance.com
BINANCE_API_KEY=<demo key>
BINANCE_API_SECRET=<demo secret>
```

### Checklist

- [ ] `TradingBot` kiest `DemoPaperBroker`.
- [ ] `DemoPaperBroker` gebruikt `LiveBroker` intern maar remapt output naar paper.
- [ ] `doctor()` geeft `mode: "paper"` en `executionVenue: "binance_demo_spot"`.
- [ ] Entries krijgen `brokerMode: "paper"`.
- [ ] Trades krijgen `executionVenue: "binance_demo_spot"`.
- [ ] Demo mode vereist geen live acknowledgement.
- [ ] Demo mode mag nooit samen met `BOT_MODE=live`.
- [ ] Demo endpoints worden geblokkeerd in live mode.

### Extra reconcile tests

- [ ] Demo reconcile sluit geen positie zonder voldoende confirmation samples.
- [ ] Demo recent fill grace wordt gerespecteerd.
- [ ] Demo mark drift tolerance werkt.
- [ ] Demo auto-clear quorum werkt alleen met voldoende bewijs.

Acceptance:

- [ ] Paper/demo is zichtbaar anders dan internal paper.
- [ ] Demo gebruikt geen echte live endpoint.
- [ ] Dashboard toont `Paper · Binance Demo Spot`.
- [ ] `exchangeTruth` en `reconcile` zijn read-only of demo-safe.

---

## 10. P1 — Live mode guardrails

### Live mode mag alleen starten als alle checks slagen

- [ ] `BOT_MODE=live`
- [ ] `LIVE_TRADING_ACKNOWLEDGED=I_UNDERSTAND_LIVE_TRADING_RISK`
- [ ] `ENABLE_EXCHANGE_PROTECTION=true`
- [ ] `PAPER_EXECUTION_VENUE` is niet `binance_demo_spot`
- [ ] `BINANCE_API_BASE_URL` is geen demo/testnet tenzij expliciet toegestaan voor testnet-mode
- [ ] `BINANCE_API_KEY` gevuld
- [ ] `BINANCE_API_SECRET` gevuld
- [ ] Account `canTrade=true`
- [ ] Account permissions bevatten `SPOT`
- [ ] Clock drift binnen limiet
- [ ] Exchange info/symbol rules beschikbaar
- [ ] OCO/protection geometry preflight beschikbaar
- [ ] Geen unresolved execution intents
- [ ] Geen open reconcile conflicts
- [ ] Geen critical alerts zonder operator ack

### Maak `live:preflight`

Command:

```bash
node src/cli.js live:preflight
```

Read-only output:

```json
{
  "status": "blocked",
  "safeToStartLive": false,
  "checks": [
    { "id": "acknowledgement", "status": "passed" },
    { "id": "api_credentials", "status": "failed" },
    { "id": "exchange_protection", "status": "passed" },
    { "id": "demo_endpoint_block", "status": "passed" },
    { "id": "account_can_trade", "status": "unknown" }
  ]
}
```

Acceptance:

- [ ] Geen order endpoints.
- [ ] Geen position-changing endpoints.
- [ ] Dashboard gebruikt dezelfde preflight.
- [ ] Live start-knop is disabled bij failed preflight.
- [ ] Error noemt exacte env key of check.

---

## 11. P1 — Broker factory / execution wiring

Maak expliciete centrale brokerselectie, bijvoorbeeld:

```txt
src/execution/brokerFactory.js
```

### Matrix

| `BOT_MODE` | `PAPER_EXECUTION_VENUE` | Verwachte broker | Orders |
|---|---|---|---|
| `paper` | `internal` | `PaperBroker` | geen exchange orders |
| `paper` | `binance_demo_spot` | `DemoPaperBroker` | demo spot only |
| `live` | leeg/internal | `LiveBroker` | live na preflight |
| `live` | `binance_demo_spot` | blocked | geen orders |

Checklist:

- [ ] Broker factory is unit-tested.
- [ ] `TradingBot` gebruikt alleen broker factory.
- [ ] Geen losse `new LiveBroker()` verspreid door runtime.
- [ ] Broker keuze wordt opgenomen in `doctor`, `status`, dashboard snapshot en audit.
- [ ] `brokerMode` en `executionVenue` worden altijd persisted bij positions/trades/intents.

Acceptance:

- [ ] Onjuiste mode/venue-combinatie faalt vóór init.
- [ ] Paper internal werkt zonder keys.
- [ ] Demo spot werkt met demo keys.
- [ ] Live werkt alleen met preflight groen.

---

## 12. P2 — Runtime cycle debug

### Verwachte flow

```txt
CLI/dashboard
  -> BotManager
  -> TradingBot.init()
  -> refreshAnalysis()
  -> runCycle()
  -> runTradingCycle()
  -> runCycleCore()
  -> executeDecisionPipeline()
  -> scanCandidatesForCycle()
  -> risk verdict
  -> openBestCandidate()
  -> broker enter/exit
  -> persist runtime/journal/audit
```

### Checklist `runCycleCore`

- [ ] Laadt balance/equity.
- [ ] Ververst market snapshots.
- [ ] Verwerkt open positions exits.
- [ ] Bouwt candidates.
- [ ] Past risk gates toe.
- [ ] Bouwt execution blockers.
- [ ] Roept `executeDecisionPipeline`.
- [ ] Opent hoogstens één beste entry per cycle, tenzij paper learning expliciet meerdere concurrente posities toestaat.
- [ ] Schrijft `runtime.latestDecisions`.
- [ ] Schrijft `runtime.lastCycleAt`.
- [ ] Schrijft audit events.

### Checklist error handling

- [ ] Cycle failure schrijft `runtime.lastAnalysisError`.
- [ ] Health failure verhoogt consecutive failure count.
- [ ] Manager gaat naar `degraded`.
- [ ] Na threshold stopt manager.
- [ ] Persist failure na entry markeert `entryPersistFailed`.
- [ ] Geen entry zonder persist-verificatie.

Acceptance:

- [ ] `once` geeft duidelijke JSON of log.
- [ ] Dashboard ziet laatste heartbeat.
- [ ] `trading-path:debug` toont stale sources en next action.
- [ ] Geen stille cycle fail.

---

## 13. P2 — Decision pipeline en audit

### Event-contract

Elke beslissing moet deze event types kunnen schrijven:

- [ ] `signal_decision`
- [ ] `risk_decision`
- [ ] `trade_intent`
- [ ] `execution_result`
- [ ] `adaptive_change`
- [ ] `exchange_truth_check`
- [ ] `operator_action`

### Minimum fields

- [ ] `at`
- [ ] `cycleId`
- [ ] `decisionId`
- [ ] `mode`
- [ ] `symbol`
- [ ] `status`
- [ ] `reasonCodes`
- [ ] `metrics`
- [ ] `details`

### Tests

- [ ] Audit event schema test.
- [ ] No-trade decision writes `signal_decision`, `risk_decision`, `trade_intent`, `execution_result`.
- [ ] Allowed trade writes `execution_result: executed`.
- [ ] Rejected trade writes canonical reason codes.
- [ ] Audit writer redacts secrets.

Acceptance:

- [ ] Eén cycle is achteraf uitlegbaar.
- [ ] Dashboard en replay gebruiken dezelfde eventnamen.
- [ ] Geen breaking rename zonder schemaVersion bump.

---

## 14. P2 — Risk manager en blockers

### Debugdoel

Elke no-trade moet verklaren **welke laag** blokkeerde:

```txt
signal -> model -> risk -> portfolio -> execution -> broker -> persist
```

### Splits policies

Aanbevolen structuur:

```txt
src/risk/policies/hardSafetyPolicy.js
src/risk/policies/paperLeniencyPolicy.js
src/risk/policies/recoveryProbePolicy.js
src/risk/policies/executionCostPolicy.js
src/risk/policies/portfolioExposurePolicy.js
src/risk/policies/sessionRiskPolicy.js
src/risk/policies/dataQualityPolicy.js
src/risk/policies/liveSafetyPolicy.js
```

Checklist:

- [ ] Elke policy is pure/deterministisch.
- [ ] Elke policy heeft unit tests.
- [ ] Elke rejection heeft canonical reason code.
- [ ] Geen risk policy plaatst orders.
- [ ] Paper leniency kan nooit hard safety overschrijven.
- [ ] Live safety is strenger dan paper.

Acceptance:

- [ ] Dashboard “waarom geen trade?” toont top blocker.
- [ ] Replay kan dezelfde blocker reproduceren.
- [ ] Blocker-categorieën zijn `safety`, `governance`, `learning`, `market`, `execution`.

---

## 15. P2 — Execution en order lifecycle

### Paper lifecycle

- [ ] Entry intent start.
- [ ] Paper fill simulation.
- [ ] Position persisted.
- [ ] Optional scale-out.
- [ ] Exit.
- [ ] Trade record.
- [ ] Learning label.

### Live lifecycle

- [ ] Entry intent start.
- [ ] Exchange order submit.
- [ ] Fill verification.
- [ ] Protective OCO build.
- [ ] OCO geometry validation.
- [ ] Protection submit.
- [ ] Reconcile status.
- [ ] Intent resolved.
- [ ] Persist.

### Critical tests

- [ ] Unresolved intent blocks duplicate entry.
- [ ] Protective OCO invalid geometry blocks submission.
- [ ] Min notional synthetic exit only in allowed context.
- [ ] REST budget pressure can use user stream fallback.
- [ ] Reconcile cannot clear conflict without evidence.
- [ ] Partial fill keeps remaining position safe.
- [ ] Entry persist failure triggers safe error state.

Acceptance:

- [ ] No duplicate entries per symbol with unresolved intent.
- [ ] No unprotected live position unless explicit protect-only/manual-review state.
- [ ] Reconcile decision has evidence summary.
- [ ] Panic plan can be generated read-only.

---

## 16. P2 — Storage en state consistency

### Files to audit

```txt
data/runtime/runtime.json
data/runtime/journal.json
data/runtime/audit/*.ndjson
data/runtime/readmodel/*
data/history/*
```

Checklist:

- [ ] StateStore init creates dirs.
- [ ] Runtime load handles missing file.
- [ ] Runtime load migrates older schema.
- [ ] Journal load handles missing file.
- [ ] Writes are atomic.
- [ ] Corrupt JSON gets quarantined.
- [ ] Backup exists before destructive migration.
- [ ] Secrets are redacted.

### Snapshot bundle manifest

Aanbevolen save-protocol:

1. [ ] Schrijf staged files.
2. [ ] Schrijf `snapshot-manifest.tmp`.
3. [ ] Rename staged files.
4. [ ] Rename manifest naar `snapshot-manifest.json`.
5. [ ] Startup herstelt incomplete staging.

Acceptance:

- [ ] Crash tijdens save laat geen half-migrated state achter zonder waarschuwing.
- [ ] `doctor` toont laatste consistente snapshot.
- [ ] `storage:audit` en `recorder:audit` zijn groen.

---

## 17. P2 — Readmodel, dashboard snapshot en freshness

### Commands

```bash
node src/cli.js readmodel:rebuild
node src/cli.js readmodel:status
node src/cli.js readmodel:dashboard
node src/cli.js trading-path:debug
```

Checklist:

- [ ] Readmodel rebuild kan zonder live network.
- [ ] Dashboard snapshot heeft schema/version.
- [ ] Snapshot toont `ops.mode`.
- [ ] Snapshot toont data freshness.
- [ ] Snapshot toont bot lifecycle.
- [ ] Snapshot toont risk locks.
- [ ] Snapshot toont top rejections.
- [ ] Snapshot toont paper learning alleen als data bestaat.
- [ ] Stale data wordt niet als fresh gepresenteerd.

Acceptance:

- [ ] `/api/snapshot` geeft stabiel contract.
- [ ] `/api/health` geeft readiness met redenen.
- [ ] `/api/readiness` geeft 503 bij blocked.
- [ ] Dashboard kan niet “ready” tonen als runtime stale is.

---

## 18. P2 — Dashboard server debug

### Server flow

```txt
startDashboardServer()
  -> new BotManager()
  -> manager.init()
  -> serve static public
  -> API routes
```

### Commands

```bash
node src/cli.js dashboard
curl http://127.0.0.1:3011/api/health
curl http://127.0.0.1:3011/api/gui/status
curl http://127.0.0.1:3011/api/config/env
curl http://127.0.0.1:3011/api/config/profiles
```

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3011/api/health
Invoke-RestMethod http://127.0.0.1:3011/api/gui/status
```

Checklist:

- [ ] Server bindt alleen aan `127.0.0.1`.
- [ ] Static files bestaan: `src/dashboard/public/index.html`, `app.js`.
- [ ] Mutations vereisen `x-dashboard-request: 1`.
- [ ] Content-Type bij POST is JSON.
- [ ] Dashboard start geeft duidelijke error bij `manager.init()` fail.
- [ ] `/api/gui/diagnostics` toont root/env/server/public status.

Acceptance:

- [ ] Geen blank screen zonder diagnostiek.
- [ ] API errors zijn JSON.
- [ ] Dashboard kan start/stop/cycle alleen lokaal/trusted aanroepen.
- [ ] No secrets in dashboard payload.

---

## 19. P2 — Desktop/Electron debug

### Desktop flow

```txt
desktop/main.js
  -> resolveBotRoot()
  -> import resources/bot/src/dashboard/server.js
  -> startDashboardServer()
  -> waitForDashboard()
  -> load BrowserWindow
```

### Commands

```bash
npm run test:desktop
cd desktop && npm run diagnose
cd desktop && npm start
```

Packaging:

```bash
npm run desktop:dist:fresh
```

### Logs

Windows logpad uit desktop code:

```txt
%APPDATA%\Codex AI Trading Bot\logs\desktop-main.log
```

Checklist:

- [ ] `resolveBotRoot()` wijst in dev naar repo root.
- [ ] `resolveBotRoot()` wijst packaged naar `resources\bot`.
- [ ] `resources\bot\src\dashboard\server.js` bestaat na build.
- [ ] `resources\bot\node_modules` bevat dependencies.
- [ ] `resources\bot\.env.example` bestaat.
- [ ] `.env` wordt niet in installer gebundeld.
- [ ] Dashboard start binnen timeout.
- [ ] Error page toont diagnostics bij failure.
- [ ] Tray status poll werkt.
- [ ] Start/Stop tray actions gebruiken trusted headers.

Acceptance:

- [ ] Dev desktop start dashboard.
- [ ] Packaged desktop start dashboard.
- [ ] Geen white screen; bij fail duidelijke error page.
- [ ] Installer bevat geen secrets.
- [ ] Build artifacts zijn reproduceerbaar.

---

## 20. P2 — Setup wizard en GUI `.env`

### Doel

Nieuwe gebruiker moet via GUI veilig naar paper/demo kunnen, zonder live-risico.

Checklist:

- [ ] `/api/setup/run-checks` controleert `.env` bestaat/writable.
- [ ] `/api/config/profiles` toont actieve profielen.
- [ ] `/api/config/profile/preview` toont diff zonder schrijven.
- [ ] `/api/config/profile/apply` schrijft `.env` met backup.
- [ ] Live profiel vereist exacte acknowledgement.
- [ ] Demo profiel zet demo endpoint en paper venue.
- [ ] Paper-safe profiel werkt zonder keys.
- [ ] GUI toont duplicate-key errors.
- [ ] GUI toont strict config errors.

Acceptance:

- [ ] Fresh install kan `paper-safe` starten.
- [ ] Binance demo setup kan keys invullen en preflight doen.
- [ ] Live setup blijft blocked zonder alle guardrails.
- [ ] Operator kan actieve `.env` openen vanuit tray.

---

## 21. P2 — Feature audit en feature wiring

### Commands

```bash
node src/cli.js feature:audit
node src/cli.js feature:completion-gate
node src/cli.js rest:audit
```

Checklist:

- [ ] Feature audit detecteert enabled flag zonder implementatie.
- [ ] Feature audit detecteert implementatie zonder route.
- [ ] Completion gate faalt bij P0 runtime ontbreekt.
- [ ] REST audit detecteert private hot callers.
- [ ] REST audit geeft weights en caller names.
- [ ] Feature docs worden niet als source-of-truth gebruikt zonder code bewijs.

Acceptance:

- [ ] Elke enabled feature heeft:
  - [ ] config key
  - [ ] implementation
  - [ ] test
  - [ ] dashboard/status visibility
  - [ ] paper/live safety classification
- [ ] Geen “implemented” status zonder test of runtime wire.

---

## 22. P2 — Neural/autonomy debug

### Current safety stance

Neural/autonomy moet standaard uit of paper-only blijven totdat core runtime groen is.

### Flags die extra voorzichtigheid vragen

- [ ] `NEURAL_AUTONOMY_ENABLED`
- [ ] `NEURAL_AUTONOMY_LEVEL`
- [ ] `NEURAL_CONTINUOUS_LEARNING_ENABLED`
- [ ] `NEURAL_SELF_TUNING_ENABLED`
- [ ] `NEURAL_SELF_TUNING_PAPER_ONLY`
- [ ] `NEURAL_LIVE_AUTONOMY_ENABLED`
- [ ] `NEURAL_LIVE_AUTONOMY_ACKNOWLEDGED`
- [ ] `NEURAL_AUTO_PROMOTE_PAPER`
- [ ] `NEURAL_AUTO_PROMOTE_LIVE`

### Matrix

| Feature | Paper | Live |
|---|---|---|
| Neural replay | toegestaan, offline | toegestaan, offline only |
| Continuous learning | paper allowed na tests | observe-only |
| Self tuning | paper-only | blocked tenzij explicit promotion |
| Live autonomy | blocked | alleen na strict preflight + separate ack |
| Auto promote paper | voorzichtig | geen live impact |
| Auto promote live | blocked default | alleen handmatig/approved |

Checklist:

- [ ] Neural code mag runtime niet breken als disabled.
- [ ] Disabled flags moeten lazy imports toestaan.
- [ ] Paper self-tuning heeft max threshold delta.
- [ ] Live autonomy vereist aparte ack.
- [ ] Live autonomy vereist max trades/day.
- [ ] Live autonomy vereist max daily drawdown.
- [ ] Live autonomy vereist exchange protection.
- [ ] Auto-disable on loss werkt.
- [ ] Rollback gates hebben tests.

Acceptance:

- [ ] Neural disabled = geen side effects.
- [ ] Neural paper enabled = paper-only changes.
- [ ] Neural live enabled zonder ack = blocked.
- [ ] Promotion heeft changelog en rollback condition.

---

## 23. P3 — Replay en deterministic debugging

### Command

```bash
node src/cli.js replay-decision <decisionId>
```

### Input moet bevatten

- [ ] config hash
- [ ] market snapshot
- [ ] features
- [ ] risk verdict
- [ ] execution blockers
- [ ] account/equity context
- [ ] open positions op dat moment
- [ ] news/context lineage
- [ ] model versions
- [ ] strategy summary
- [ ] symbol rules

### Output

```json
{
  "decisionId": "cycle:symbol",
  "status": "replayed",
  "sameOutcome": true,
  "original": {
    "allow": false,
    "reason": "execution_cost_budget_exceeded"
  },
  "replayed": {
    "allow": false,
    "reason": "execution_cost_budget_exceeded"
  },
  "diffs": []
}
```

Acceptance:

- [ ] Replay gebruikt geen netwerk.
- [ ] Replay faalt als fixture incompleet is.
- [ ] Replay toont alle diffs.
- [ ] Replay kan paper en blocked decisions reproduceren.
- [ ] Replay is onderdeel van CI fixtures.

---

## 24. P3 — Why-no-trade timeline

### Doel

Dashboard moet niet alleen “blocked” tonen, maar de volledige laag waar het stopte.

Voorbeeld:

```txt
Cycle started
Market snapshot fresh
Signal candidate BTCUSDT found
Model probability 0.57
Risk rejected: execution_cost_budget_exceeded
No order intent opened
```

Checklist:

- [ ] Per cycle een timeline object.
- [ ] Timeline bevat layer, status, code, message, evidence.
- [ ] Top blocker wordt vertaald naar operator-taal.
- [ ] Timeline linkt naar replay-decision.
- [ ] Dashboard toont laatste 5 no-trade cycles.

Acceptance:

- [ ] Operator ziet binnen 10 seconden waarom er geen trade kwam.
- [ ] Geen verborgen blockers.
- [ ] Counterfactual/replay beschikbaar.

---

## 25. P3 — Incident bundles

### Command

```bash
node src/cli.js incidents:create --type=exchange_truth_mismatch --severity=high
node src/cli.js incidents:summary
```

Bundle bevat:

- [ ] runtime snapshot
- [ ] open positions
- [ ] unresolved intents
- [ ] recent audit events
- [ ] recent exchange truth
- [ ] active alerts
- [ ] config hash
- [ ] redacted config summary
- [ ] dashboard health
- [ ] replay candidates

Acceptance:

- [ ] Geen secrets.
- [ ] Bundle is lokaal reproduceerbaar.
- [ ] Dashboard linkt naar laatste incident summary.
- [ ] Incident severity is duidelijk.

---

## 26. P3 — CI en kwaliteitsgates

Maak `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: npm run coverage
      - run: node --check src/cli.js
      - run: node --check src/runtime/tradingBot.js
      - run: node src/cli.js feature:audit
      - run: node src/cli.js rest:audit
```

Extra gates:

- [ ] Critical files non-empty.
- [ ] `.env.example` duplicate-free.
- [ ] `.env.example` contains no secrets.
- [ ] `npm test` fails on zero tests.
- [ ] `package.json` scripts are valid.
- [ ] `docs/ARCHITECTURE.md` and `docs/FEATURE_STATUS.md` exist.
- [ ] Dashboard public files exist.
- [ ] Desktop package includes required resources.

Acceptance:

- [ ] PR kan niet groen zijn met lege `TradingBot`.
- [ ] PR kan niet groen zijn met lege test runner.
- [ ] PR kan niet groen zijn met duplicate env keys.
- [ ] CI artifacts bevatten geen secrets.

---

## 27. P3 — Security en secret hygiene

Checklist:

- [ ] `.env` in `.gitignore`.
- [ ] Incident bundles redacteren keys/secrets/tokens.
- [ ] Logs redacteren keys/secrets/tokens.
- [ ] Dashboard payload bevat geen API secret.
- [ ] Desktop logs bevatten geen API secret.
- [ ] Pre-commit secret scan.
- [ ] GitHub secret scanning aan.
- [ ] Geen raw webhook URLs in fixtures.

Pattern scan:

```bash
grep -RInE "BINANCE_API_SECRET|BINANCE_API_KEY|sk-|xoxb-|ghp_|gho_|webhook" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude=.env.example
```

Acceptance:

- [ ] Geen echte secret in repo.
- [ ] Redaction tests bestaan.
- [ ] `doctor` waarschuwt bij unsafe dashboard bind.

---

## 28. Module-voor-module debugchecklist

### 28.1 `src/binance`

- [ ] Signing werkt deterministisch.
- [ ] Clock sync faalt veilig.
- [ ] Request weight tracking klopt.
- [ ] Demo/testnet endpoints zijn expliciet.
- [ ] Private endpoints hebben caller metadata.
- [ ] REST errors worden gecategoriseerd.
- [ ] Rate-limit ban pauzeert cycles.

### 28.2 `src/config`

- [ ] Strict parser.
- [ ] Duplicate key detector.
- [ ] Unknown key detector.
- [ ] Profile resolver.
- [ ] Config hash stabiel.
- [ ] Validation errors actionable.
- [ ] Live profile guardrails.

### 28.3 `src/runtime`

- [ ] TradingBot contract.
- [ ] BotManager lifecycle.
- [ ] CycleRunner persist/error handling.
- [ ] DecisionPipeline audit.
- [ ] Trading path health.
- [ ] Feature audit.
- [ ] Replay.
- [ ] Incident report.

### 28.4 `src/risk`

- [ ] Hard safety.
- [ ] Portfolio exposure.
- [ ] Drawdown.
- [ ] Recovery/probe.
- [ ] Paper leniency.
- [ ] Live strictness.
- [ ] Reason codes.
- [ ] Policy unit tests.

### 28.5 `src/execution`

- [ ] PaperBroker invariants.
- [ ] DemoPaperBroker remap.
- [ ] LiveBroker OCO geometry.
- [ ] ExecutionEngine fill simulation.
- [ ] Intent ledger.
- [ ] Reconcile.
- [ ] Min-notional exit.
- [ ] Panic flatten plan.

### 28.6 `src/storage`

- [ ] Atomic writes.
- [ ] Runtime load/migration.
- [ ] Journal load/migration.
- [ ] Audit NDJSON.
- [ ] Readmodel rebuild.
- [ ] Backup/restore.
- [ ] Corrupt file quarantine.

### 28.7 `src/dashboard`

- [ ] API health.
- [ ] API snapshot.
- [ ] GUI status.
- [ ] Config profiles.
- [ ] Setup checks.
- [ ] Trusted mutation protection.
- [ ] Public static files.
- [ ] No secret payload.

### 28.8 `desktop`

- [ ] Dev root resolution.
- [ ] Packaged root resolution.
- [ ] Embedded dashboard import.
- [ ] Wait-for-dashboard diagnostics.
- [ ] Tray menu.
- [ ] Log file.
- [ ] Installer resources.
- [ ] No `.env` bundled.

### 28.9 `test`

- [ ] Runner discovers tests.
- [ ] Runner fails on zero tests.
- [ ] Unit/integration/safety filters.
- [ ] Fixtures exist.
- [ ] Coverage meaningful.
- [ ] Tests isolated from live network.

### 28.10 `docs`

- [ ] Architecture matches code.
- [ ] Feature status only claims tested features.
- [ ] README quickstart works.
- [ ] Live warning visible.
- [ ] Paper/demo/live setup separated.
- [ ] Troubleshooting section updated.

---

## 29. Beste fix-volgorde

### Sprint 1 — P0 herstel

- [ ] Restore/implement `TradingBot`.
- [ ] Implement `test/run.js`.
- [ ] Add critical file non-empty test.
- [ ] Add TradingBot contract test.
- [ ] Run `npm test`.
- [ ] Run `node src/cli.js doctor`.
- [ ] Run `node src/cli.js status`.

Definition of done:

- [ ] CLI import werkt.
- [ ] Dashboard kan manager initten.
- [ ] `npm test` draait echte tests.
- [ ] Geen live side effects.

### Sprint 2 — Config hardening

- [ ] Duplicate env detector.
- [ ] Strict parser.
- [ ] ConfigValidationError verbeteren.
- [ ] `.env.example` opschonen.
- [ ] Profielen splitsen.
- [ ] Setup wizard toont config fouten.

Definition of done:

- [ ] Geen duplicate `.env.example`.
- [ ] Invalid explicit env stopt startup.
- [ ] Paper-safe profiel werkt out-of-box.

### Sprint 3 — Broker en mode wiring

- [ ] Broker factory.
- [ ] Paper internal tests.
- [ ] Binance demo spot tests.
- [ ] Live preflight.
- [ ] Dashboard mode badges.
- [ ] Audit brokerMode/executionVenue.

Definition of done:

- [ ] Paper internal zonder keys.
- [ ] Demo spot als paper.
- [ ] Live blocked zonder volledige guardrails.

### Sprint 4 — Dashboard/Desktop

- [ ] Dashboard health/debug endpoints groen.
- [ ] Desktop diagnose groen.
- [ ] Packaged app root/resources groen.
- [ ] Error page bij server failure.
- [ ] Tray status betrouwbaar.

Definition of done:

- [ ] Geen blank screen.
- [ ] Packaged dashboard start.
- [ ] Logs bevatten geen secrets.

### Sprint 5 — Replay/observability

- [ ] Audit-contract tests.
- [ ] Replay-decision.
- [ ] Why-no-trade timeline.
- [ ] Incident bundles.
- [ ] Operator action queue.

Definition of done:

- [ ] Elke cycle uitlegbaar.
- [ ] Eén oude decision reproduceerbaar.
- [ ] Incident onderzoek kan lokaal.

### Sprint 6 — Neural/learning governance

- [ ] Neural disabled side-effect tests.
- [ ] Paper-only self-tuning tests.
- [ ] Promotion changelog.
- [ ] Rollback conditions.
- [ ] Live autonomy hard blocked by default.

Definition of done:

- [ ] Paper mag leren.
- [ ] Live blijft conservatief.
- [ ] Elke adaptive change is terugdraaiable.

---

## 30. “Done” criteria voor volledige codebase

De codebase is pas debug-ready als al deze checks groen zijn:

### Core

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm test`
- [ ] `npm run coverage`
- [ ] `node --check src/cli.js`
- [ ] `node --check src/runtime/tradingBot.js`

### CLI

- [ ] `node src/cli.js doctor`
- [ ] `node src/cli.js status`
- [ ] `node src/cli.js once`
- [ ] `node src/cli.js report`
- [ ] `node src/cli.js feature:audit`
- [ ] `node src/cli.js rest:audit`
- [ ] `node src/cli.js trading-path:debug`

### Paper

- [ ] Paper internal starts without keys.
- [ ] Paper cycle writes safe runtime state.
- [ ] Paper broker never hits live order endpoint.
- [ ] Paper lifecycle tests pass.

### Demo

- [ ] Demo mode uses demo endpoint.
- [ ] Demo mode remains `brokerMode: paper`.
- [ ] Demo mode blocked in live.

### Live

- [ ] `live:preflight` read-only.
- [ ] Live blocked without ack.
- [ ] Live blocked without keys.
- [ ] Live blocked without protection.
- [ ] Live blocked on demo endpoint.
- [ ] Live blocked on unresolved intent/reconcile criticals.

### Dashboard

- [ ] `/api/health`
- [ ] `/api/snapshot`
- [ ] `/api/gui/status`
- [ ] `/api/config/env`
- [ ] `/api/config/profiles`
- [ ] `/api/readiness`

### Desktop

- [ ] `cd desktop && npm run diagnose`
- [ ] `cd desktop && npm start`
- [ ] `npm run desktop:dist:fresh`
- [ ] Packaged app starts dashboard.
- [ ] Desktop logs no secrets.

### Docs

- [ ] README commands verified.
- [ ] Architecture matches runtime.
- [ ] Feature status matches tests.
- [ ] Troubleshooting updated.

---

## 31. Aanbevolen issues om aan te maken

### Issue 1 — P0 Restore `TradingBot`

```txt
Title: P0: Restore or rebuild src/runtime/tradingBot.js

Scope:
- Restore TradingBot export
- Implement required public contract
- Add contract test
- Ensure CLI/dashboard import works

Acceptance:
- node --check src/runtime/tradingBot.js
- npm test runs real tests
- node src/cli.js doctor/status no import crash
```

### Issue 2 — P0 Real test runner

```txt
Title: P0: Replace empty test/run.js with real runner

Scope:
- Discover *.test.js and *.tests.js
- Run exported run/test* functions
- Fail on zero tests
- Support --unit/--integration/--safety

Acceptance:
- npm test executes >0 tests
- coverage is meaningful
```

### Issue 3 — P1 Config hardening

```txt
Title: P1: Strict env parsing and duplicate key detection

Scope:
- detect duplicate env keys
- fail CI on duplicate .env.example keys
- strict parse explicit invalid values
- improve ConfigValidationError messages

Acceptance:
- invalid explicit values fail startup
- duplicate keys show line numbers
```

### Issue 4 — P1 Broker mode factory

```txt
Title: P1: Central broker factory for paper/demo/live

Scope:
- PaperBroker for internal paper
- DemoPaperBroker for Binance demo spot
- LiveBroker only after live preflight
- Persist brokerMode/executionVenue

Acceptance:
- mode matrix fully tested
```

### Issue 5 — P1 Live preflight

```txt
Title: P1: Add read-only live:preflight command and dashboard gate

Scope:
- Read-only checks
- API key/protection/ack/account checks
- Dashboard live start disabled on failure

Acceptance:
- no order endpoints called
- machine-readable output
```

### Issue 6 — P2 Desktop packaging diagnostics

```txt
Title: P2: Harden Electron packaged dashboard startup

Scope:
- verify resources/bot content
- improve diagnostics
- fail with error page, not blank screen
- no .env bundled

Acceptance:
- packaged app starts local dashboard
```

---

## 32. Laatste waarschuwingen

- [ ] Vertrouw niet op `npm test` tot `test/run.js` is hersteld.
- [ ] Vertrouw niet op docs “verified” tot CI groen is.
- [ ] Vertrouw niet op paper/demo/live wiring tot `TradingBot` en broker factory getest zijn.
- [ ] Zet live pas aan na `live:preflight` groen én handmatige review.
- [ ] Activeer neural live autonomy niet vóór replay, audit, rollback en promotion gates bewezen zijn.

---

## 33. Korte prioriteitenlijst

1. [ ] Herstel `src/runtime/tradingBot.js`.
2. [ ] Herstel `test/run.js`.
3. [ ] Voeg critical file non-empty CI check toe.
4. [ ] Maak `.env.example` duplicate-free.
5. [ ] Maak config strict.
6. [ ] Maak broker factory.
7. [ ] Bewijs paper internal.
8. [ ] Bewijs Binance demo spot.
9. [ ] Voeg `live:preflight` toe.
10. [ ] Maak dashboard/desktop diagnostics groen.
11. [ ] Voeg audit-contract tests toe.
12. [ ] Voeg replay-decision toe.
13. [ ] Voeg why-no-trade timeline toe.
14. [ ] Voeg incident bundles toe.
15. [ ] Pas docs pas aan nadat tests groen zijn.
