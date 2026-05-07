# Aanbevolen verbeteringen en nieuwe updates

Dit document bundelt aanbevolen verbeteringen voor de Binance AI Trading Bot. De focus ligt op betrouwbaarheid, veiligheid, uitlegbaarheid en schaalbare doorontwikkeling.

> Let op: dit zijn technische product- en codebase-aanbevelingen. Dit is geen financieel advies en geen winstgarantie.

## Doel

De bot heeft al een sterke safety-first richting: paper mode als standaard, live mode met extra guardrails, dashboard-observability, risk gates, exchange-truth checks en learning/replay-lagen.

De belangrijkste volgende stap is minder nieuwe complexiteit toevoegen en eerst de bestaande kern harder, testbaarder en eenvoudiger onderhoudbaar maken.

## Prioriteitenoverzicht

| Prioriteit | Thema | Waarom belangrijk |
|---|---|---|
| P0 | Runtime- en testintegriteit | De bot moet aantoonbaar starten, testen en falen wanneer iets ontbreekt. |
| P1 | Live-trading safety | Live mode mag alleen onder expliciete, verifieerbare voorwaarden actief zijn. |
| P1 | Config-validatie | Ongeldige `.env` waarden mogen niet stil naar defaults terugvallen. |
| P2 | Refactor van grote modules | Minder kans op regressies en makkelijker debuggen. |
| P2 | Replay en audit-first debugging | Elke beslissing moet reproduceerbaar worden. |
| P3 | Dashboard- en operator-UX | Sneller zien wat de bot doet, waarom, en welke actie nodig is. |
| P3 | Learning/retrain governance | Beter leren zonder live-risico te verhogen. |

---

# P0 - Eerst stabiliseren

## 1. Verifieer dat `TradingBot` altijd aanwezig en importeerbaar is

De hele runtime hangt aan `src/runtime/tradingBot.js`. Voeg daarom een harde smoke-test toe die alleen al controleert dat de centrale class bestaat.

Aanbevolen test:

```js
import assert from "node:assert/strict";
import { TradingBot } from "../src/runtime/tradingBot.js";

assert.equal(typeof TradingBot, "function");
```

Aanbevolen command:

```bash
node --check src/runtime/tradingBot.js
node --check src/cli.js
node src/cli.js status
```

Acceptance criteria:

- `TradingBot` export bestaat.
- `node --check src/runtime/tradingBot.js` slaagt.
- `node src/cli.js status` faalt niet op importniveau.
- CI blokkeert een commit waarin `tradingBot.js` leeg of niet importeerbaar is.

## 2. Maak `test/run.js` een echte test-runner

Er bestaan losse testbestanden, maar de centrale runner moet die ook werkelijk uitvoeren.

Voorstel:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;

async function runCheck(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

// Importeer hier de bestaande testregistraties.
// Bijvoorbeeld:
// const { registerDashboardHealthTests } = await import("./dashboardHealth.tests.js");
// await registerDashboardHealthTests({ runCheck, assert, fs, os, path, ...helpers });

if (passed + failed === 0) {
  throw new Error("No tests were executed.");
}

if (failed > 0) {
  process.exitCode = 1;
}
```

Acceptance criteria:

- `npm test` draait minimaal één echte test.
- De runner faalt bij nul uitgevoerde tests.
- Coverage via `npm run coverage` toont echte modules.

## 3. Voeg CI toe voor minimale kwaliteitspoorten

Aanbevolen GitHub Actions workflow:

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
      - run: node --check src/cli.js
```

Extra hardening:

- Voeg een check toe dat kritieke files niet leeg zijn.
- Voeg een check toe dat `.env.example` geen dubbele keys bevat.
- Voeg een check toe dat `README.md`, `docs/ARCHITECTURE.md` en `docs/FEATURE_STATUS.md` bestaan.

---

# P1 - Live trading safety versterken

## 4. Maak live-mode guardrails expliciet en centraal

Live mode moet alleen starten wanneer alle verplichte voorwaarden kloppen.

Aanbevolen harde checks:

- `LIVE_TRADING_ACKNOWLEDGED=I_UNDERSTAND_LIVE_TRADING_RISK`
- `ENABLE_EXCHANGE_PROTECTION=true`
- `BINANCE_API_KEY` gevuld
- `BINANCE_API_SECRET` gevuld
- geen demo endpoint in live mode
- geen `PAPER_EXECUTION_VENUE=binance_demo_spot` in live mode
- account check geeft `canTrade=true`
- account permissions bevatten `SPOT`

Voorstel:

```js
function assertLiveModeGuardrails(config = {}) {
  if ((config.botMode || "paper") !== "live") return;

  if (config.liveTradingAcknowledged !== "I_UNDERSTAND_LIVE_TRADING_RISK") {
    throw new Error("Live mode vereist expliciete risico-acknowledgement.");
  }

  if (config.enableExchangeProtection !== true) {
    throw new Error("Live mode vereist ENABLE_EXCHANGE_PROTECTION=true.");
  }

  if (!config.binanceApiKey || !config.binanceApiSecret) {
    throw new Error("Live mode vereist Binance API credentials.");
  }
}
```

Acceptance criteria:

- Live mode kan niet starten zonder protection.
- Live mode kan niet starten met demo endpoint.
- Live mode kan niet starten zonder API keys.
- Dashboard toont exact welke live guardrail blokkeert.

## 5. Voeg een `live:preflight` command toe

Een operator moet kunnen testen of live mode klaar is zonder orders te plaatsen.

Voorstel:

```bash
node src/cli.js live:preflight
```

Output:

```json
{
  "status": "blocked",
  "checks": [
    { "id": "acknowledgement", "status": "passed" },
    { "id": "api_credentials", "status": "passed" },
    { "id": "exchange_protection", "status": "failed" },
    { "id": "account_can_trade", "status": "unknown" }
  ],
  "safeToStartLive": false
}
```

Acceptance criteria:

- Command is read-only.
- Geen order endpoints worden aangeroepen.
- Resultaat is machine-readable en dashboard-vriendelijk.

---

# P1 - Config en `.env` betrouwbaarder maken

## 6. Strict parsing voor expliciete `.env` waarden

Nu is het veiliger om expliciete fouten hard te blokkeren. Als een operator bijvoorbeeld `MAX_OPEN_POSITIONS=abc` invult, mag de bot niet stil terugvallen naar de default.

Aanbevolen aanpak:

```js
function parseNumberStrict(env, key, fallback, errors) {
  const raw = env[key];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    errors.push(`${key} must be a finite number.`);
    return fallback;
  }
  return parsed;
}
```

Acceptance criteria:

- Ongeldige expliciete `.env` waarden stoppen startup.
- Error toont key, ontvangen waarde en verwacht type.
- Defaults worden alleen gebruikt wanneer de key leeg of afwezig is.

## 7. Detecteer dubbele keys in `.env.example` en `.env`

Dubbele keys zijn gevaarlijk omdat de laatste waarde meestal wint.

Voorstel:

```js
function detectDuplicateEnvKeys(content = "") {
  const seen = new Set();
  const duplicates = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.split("=")[0].trim();
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }

  return [...new Set(duplicates)];
}
```

Acceptance criteria:

- `npm test` faalt bij duplicate keys in `.env.example`.
- `doctor` waarschuwt bij duplicate keys in lokale `.env`.
- Duplicates worden getoond met keynaam en regelnummer.

## 8. Maak config-profielen explicieter

Gebruik aparte profielen in plaats van één grote `.env.example` voor alles.

Aanbevolen structuur:

```txt
config/profiles/paper-learn.env.example
config/profiles/paper-safe.env.example
config/profiles/binance-demo.env.example
config/profiles/live-minimal.env.example
config/profiles/live-conservative.env.example
```

Acceptance criteria:

- Nieuwe gebruiker start met paper-safe.
- Binance demo spot staat apart.
- Live-profiel bevat alleen live-relevante settings.

---

# P2 - Refactor en onderhoudbaarheid

## 9. Splits `runCli.js` in command modules

De CLI-router bevat veel commandlogica en veel imports. Daardoor kan een fout in één domein ook unrelated commands breken.

Aanbevolen structuur:

```txt
src/cli/runCli.js
src/cli/commands/botCommands.js
src/cli/commands/dashboardCommands.js
src/cli/commands/backtestCommands.js
src/cli/commands/readModelCommands.js
src/cli/commands/reconcileCommands.js
src/cli/commands/learningCommands.js
src/cli/commands/diagnosticCommands.js
```

Acceptance criteria:

- `runCli.js` bevat alleen routing.
- Command modules gebruiken lazy imports.
- Read-only commands kunnen starten zonder volledige trading runtime.

## 10. Splits `riskManager.js` verder op

Risk logic is het belangrijkste veiligheidsdomein. Houd policies klein, testbaar en deterministisch.

Aanbevolen structuur:

```txt
src/risk/riskManager.js
src/risk/policies/hardSafetyPolicy.js
src/risk/policies/paperLeniencyPolicy.js
src/risk/policies/recoveryProbePolicy.js
src/risk/policies/executionCostPolicy.js
src/risk/policies/portfolioExposurePolicy.js
src/risk/policies/sessionRiskPolicy.js
src/risk/policies/dataQualityPolicy.js
src/risk/policies/liveSafetyPolicy.js
```

Acceptance criteria:

- Elke policy heeft unit tests.
- Elke blocker heeft een canonical reason code.
- Geen policy mag direct orders plaatsen of runtime muteren.

## 11. Maak `TradingBot` kleiner via services

De architectuur noemt `TradingBot` de centrale runtime-engine. Dat is logisch, maar hij mag niet te veel domeinen tegelijk bezitten.

Aanbevolen extracties:

```txt
src/runtime/services/MarketScanService.js
src/runtime/services/PositionManagementService.js
src/runtime/services/DecisionService.js
src/runtime/services/PersistenceService.js
src/runtime/services/DashboardSnapshotService.js
src/runtime/services/ExchangeTruthService.js
src/runtime/services/LearningService.js
```

Acceptance criteria:

- `TradingBot` orkestreert vooral.
- Beslissingen blijven via `decisionPipeline` lopen.
- Dashboard-snapshot bouw is apart testbaar.

---

# P2 - Replay, audit en debugbaarheid

## 12. Maak replay van één beslissing volledig deterministisch

Doel: een operator moet één oude beslissing exact kunnen reconstrueren.

Aanbevolen command:

```bash
node src/cli.js replay-decision <decisionId>
```

Replay-input:

- config hash
- market snapshot
- features
- risk verdict
- execution blockers
- account/equity context
- open positions op dat moment
- news/context lineage

Output:

```json
{
  "decisionId": "cycle:symbol",
  "status": "replayed",
  "sameOutcome": true,
  "original": { "allow": false, "reason": "execution_cost_budget_exceeded" },
  "replayed": { "allow": false, "reason": "execution_cost_budget_exceeded" },
  "diffs": []
}
```

Acceptance criteria:

- Replay zonder netwerk.
- Replay gebruikt opgeslagen snapshots en audit logs.
- Verschil tussen originele en nieuwe uitkomst wordt duidelijk getoond.

## 13. Voeg audit-contract tests toe

Elke audit event type moet stabiel blijven.

Belangrijke event types:

- `signal_decision`
- `risk_decision`
- `trade_intent`
- `execution_result`
- `adaptive_change`
- `exchange_truth_check`
- `operator_action`

Acceptance criteria:

- Elk event heeft `at`, `cycleId`, `symbol`, `status`, `reasonCodes`.
- Geen breaking field rename zonder schema bump.
- Dashboard gebruikt dezelfde canonical eventnamen.

## 14. Voeg incident bundles toe

Bij een live probleem moet de bot automatisch een compact incidentpakket kunnen bouwen.

Aanbevolen command:

```bash
node src/cli.js incidents:create --type=exchange_truth_mismatch --severity=high
```

Bundle bevat:

- runtime snapshot
- open positions
- unresolved intents
- recent audit events
- recent exchange truth
- active alerts
- config hash
- safe redaction van secrets

Acceptance criteria:

- Secrets worden nooit opgeslagen.
- Bundle is lokaal reproduceerbaar.
- Dashboard linkt naar laatste incident summary.

---

# P2 - Storage en state consistency

## 15. Maak snapshot bundle recovery sterker

`saveSnapshotBundle()` schrijft meerdere JSON-bestanden. Maak dit transactioneler met een manifest.

Aanbevolen aanpak:

1. Schrijf alle staged files.
2. Schrijf `snapshot-manifest.tmp`.
3. Rename staged files.
4. Rename manifest naar `snapshot-manifest.json`.
5. Bij startup: herstel incomplete transaction.

Acceptance criteria:

- Crash tijdens save geeft geen half-migrated state zonder waarschuwing.
- Startup kan incomplete staging opruimen of herstellen.
- `doctor` toont laatste consistente snapshot bundle.

## 16. Voeg state schema migratietests toe

Maak fixtures voor oudere runtime- en journal-versies.

Aanbevolen fixtures:

```txt
test/fixtures/runtime-v1.json
test/fixtures/runtime-v3.json
test/fixtures/runtime-v7-minimal.json
test/fixtures/journal-v1.json
```

Acceptance criteria:

- Oude runtime migreert naar huidige schemaVersion.
- Ontbrekende velden krijgen veilige defaults.
- Ongeldige arrays/objecten worden gecorrigeerd of hard gemeld.

---

# P3 - Dashboard en operator UX

## 17. Maak een operator action queue de centrale cockpit

Dashboard moet bovenaan niet alleen status tonen, maar vooral de volgende actie.

Voorbeeld:

```txt
1. Live geblokkeerd: exchange protection ontbreekt
2. BTCUSDT manual review nodig door reconcile conflict
3. Request weight hoog: private REST calls verminderen
4. Paper learning: review probe winner SOLUSDT
```

Acceptance criteria:

- Elke actie heeft severity, reason, command en status.
- Operator kan actie markeren als reviewed.
- Dashboard toont maximaal 5 hoofdacties.

## 18. Voeg een “why no trade?” timeline toe

Per cycle moet zichtbaar zijn waarom er geen trade kwam.

Timeline:

```txt
Signal gezien -> model ok -> risk blocked -> execution cost te duur -> no entry
```

Acceptance criteria:

- Top blocker wordt niet alleen als code getoond.
- Operator ziet welke laag blokkeerde.
- Counterfactual/replay link is beschikbaar.

## 19. Maak live/paper verschil visueel strikter

Live mode moet extreem duidelijk anders zijn dan paper.

Aanbevolen UI:

- grote live banner
- live preflight status
- exchange protection status
- unresolved intent count
- open live exposure
- last reconcile time
- emergency/panic plan link

Acceptance criteria:

- Niemand kan live mode verwarren met paper.
- Live mode toont altijd account protection status.
- Dashboard blokkeert live start-knop als preflight failed is.

---

# P3 - Learning, retrain en AI-governance

## 20. Houd paper learning agressief, live learning conservatief

Paper mag experimenteren; live moet alleen bewezen scopes accepteren.

Aanbevolen lanes:

| Lane | Doel | Live impact |
|---|---|---|
| safe | normale paper entries | kan later promotie-kandidaat worden |
| probe | kleine leerentries | alleen na probation |
| shadow | alleen simulatie | geen directe live impact |
| counterfactual | gemiste setups evalueren | tuning input |

Acceptance criteria:

- Live gebruikt nooit directe paper-aanpassingen zonder promotion gate.
- Elke paper-to-live promotie heeft evidence, scope en rollback-regel.
- Dashboard toont `paper_ready`, `building`, of `warmup` per scope.

## 21. Voeg model promotion changelog toe

Elke adaptive change moet uitlegbaar zijn.

Voorbeeld:

```json
{
  "scope": "breakout/high_vol/us_session",
  "change": "threshold_relax",
  "oldValue": 0.58,
  "newValue": 0.56,
  "evidence": {
    "paperTrades": 24,
    "winRate": 0.58,
    "maxDrawdown": 0.04
  },
  "rollbackIf": "winRate drops below 0.50 over 10 trades"
}
```

Acceptance criteria:

- Elke auto-apply heeft rollback condition.
- Operator kan approve/reject/revert.
- Live changes vereisen strengere evidence dan paper.

## 22. Maak training data quality een harde gate

Niet alle data moet even zwaar meetellen.

Aanbevolen quality gates:

- feature completeness
- data confidence
- source reliability
- record quality
- market context coverage
- execution attribution completeness
- stale snapshot penalty

Acceptance criteria:

- Retrain weigert datasets onder minimumkwaliteit.
- Dashboard toont waarom retrain nog niet klaar is.
- Oude data weegt minder dan recente data.

---

# P3 - Strategie en marktlogica

## 23. Voeg benchmark-strategieën toe als sanity check

De AI-strategie moet worden vergeleken met eenvoudige baselines.

Baselines:

- always skip
- fixed threshold
- simple trend-following
- simple mean-reversion
- buy-and-hold benchmark per symbol
- random controlled entry baseline

Acceptance criteria:

- Paper learning toont delta versus baseline.
- Slechte complexiteit wordt zichtbaar.
- Strategieën worden niet gepromoot als ze simpele baselines niet verslaan.

## 24. Voeg market regime drift alerts toe

Als de markt verandert, moeten oude thresholds minder betrouwbaar worden.

Aanbevolen driftdimensies:

- volatility regime
- spread/liquidity regime
- trend/range verdeling
- news/event density
- execution slippage
- model confidence calibration

Acceptance criteria:

- Drift kan entries blokkeren of verkleinen.
- Drift wordt per scope getoond.
- Replay packs selecteren drift-cases automatisch.

---

# P3 - Security en secret hygiene

## 25. Voeg secret scanning toe

Zorg dat API keys nooit in commits, logs of incident bundles komen.

Aanbevolen:

- GitHub secret scanning aanzetten.
- Pre-commit check voor `BINANCE_API_KEY`, `BINANCE_API_SECRET`, webhook URLs.
- Redaction helper voor logs en incident reports.

Acceptance criteria:

- Secrets worden gemaskeerd in logs.
- Incident bundles bevatten geen raw credentials.
- CI faalt op verdachte secret patterns.

## 26. Maak dashboard alleen lokaal of beveiligd beschikbaar

Dashboard draait lokaal. Houd dat expliciet veilig.

Aanbevolen:

- bind standaard aan `127.0.0.1`
- waarschuwing als host `0.0.0.0` is
- optionele dashboard token
- geen secrets in dashboard payload

Acceptance criteria:

- Dashboard payload is secret-free.
- Public bind vereist expliciete env flag.
- `doctor` waarschuwt bij onveilige dashboard bind.

---

# Aanbevolen roadmap

## Fase 1 - Hardening sprint

Doel: zeker weten dat de bot start, test en veilig blokkeert.

Taken:

- herstel/valideer `TradingBot` import
- echte `test/run.js`
- CI workflow
- strict `.env` parsing
- duplicate env key detection
- live guardrails centraliseren

Resultaat:

- minder kans op stille fouten
- basisvertrouwen in runtime
- veiligere live-mode overgang

## Fase 2 - Observability sprint

Doel: elke beslissing kunnen uitleggen en replayen.

Taken:

- audit-contract tests
- deterministic replay v2
- incident bundles
- why-no-trade timeline
- operator action queue

Resultaat:

- makkelijker debuggen
- sneller incidentonderzoek
- betere operatorcontrole

## Fase 3 - Refactor sprint

Doel: grote modules kleiner en testbaarder maken.

Taken:

- CLI command modules
- risk policies splitsen
- TradingBot services extracten
- dashboard snapshot builder isoleren

Resultaat:

- minder regressies
- snellere ontwikkeling
- betere code review

## Fase 4 - Learning governance sprint

Doel: beter leren zonder live-risico te verhogen.

Taken:

- paper-to-live promotion changelog
- retrain quality gates
- benchmark baselines
- regime drift gates
- scoped rollback rules

Resultaat:

- veiliger adaptive gedrag
- beter verklaarbare promoties
- live blijft conservatief

---

# Beste eerstvolgende actie

De beste eerstvolgende update is niet een nieuwe trading feature, maar een betrouwbaarheidspakket:

1. echte test-runner
2. CI
3. strict config parsing
4. live preflight
5. duplicate `.env` key detection

Daarna pas nieuwe strategieën, extra AI-tuning of dashboard-uitbreidingen toevoegen.

## Korte checklist

- [ ] `TradingBot` import smoke-test
- [ ] `test/run.js` voert echte tests uit
- [ ] CI workflow toegevoegd
- [ ] `.env.example` duplicate-free
- [ ] strict config parser
- [ ] live-mode guardrails uitgebreid
- [ ] `live:preflight` command
- [ ] audit-contract tests
- [ ] replay-decision deterministisch
- [ ] operator action queue in dashboard
- [ ] risk policies verder gesplitst
- [ ] paper-to-live promotion changelog
