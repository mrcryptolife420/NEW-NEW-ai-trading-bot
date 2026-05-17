# Paper/Demo Mode Wiring Roadmap

Repo: `mrcryptolife420/NEW-NEW-ai-trading-bot`
Branch onderzocht: `main`
Datum: 2026-05-08

## Conclusie

**Nee: ik zou nog niet afvinken dat alle modules en features volledig hard zijn aangesloten op paper mode / demo mode.**

Wat er wél aanwezig is:

- `botMode` staat standaard op `paper` in de core defaults.
- Er is een paper-mode profielsysteem met profielen zoals `sim`, `learn`, `research` en `demo_spot`.
- Er is een echte `PaperBroker` met paper portfolio, fills, fees, PnL en trade analytics.
- Er is een `DemoPaperBroker` die output forceert naar `brokerMode: "paper"` en `executionVenue: "binance_demo_spot"`.
- De feature completion docs tonen dat veel modules bewust diagnostic-only, paper-only, read-only of live-review-only zijn.

Wat nog niet hard genoeg is:

- De huidige `package.json` bevat geen duidelijke `npm run paper` of `npm run demo` scripts.
- Er moet een harde centrale execution-router komen die bewijst dat elke order-capable module via paper/demo loopt.
- Meerdere features zijn nog experimental, planned, diagnostics-only, dashboard-only of live-risk-review-needed.
- Er moet een volledige feature-by-feature matrix komen met status: `PAPER_CONNECTED`, `DEMO_CONNECTED`, `SHADOW_ONLY`, `OFFLINE_ONLY`, `DIAGNOSTIC_ONLY`, `NOT_REQUIRED`, `LIVE_GATED` of `MISSING`.
- Runtime verificatie is nodig voor de top-level bot flow: `CLI -> config -> BotManager/TradingBot -> strategy/risk -> broker -> paper fill -> telemetry`.

---

## Status-legenda

- `[x]` = aanwezig of grotendeels geïmplementeerd
- `[ ]` = nog doen
- `P0` = eerst doen, blokkeert betrouwbare paper/demo mode
- `P1` = belangrijk voor volledige dekking
- `P2` = kwaliteit, realisme, dashboards en documentatie

---

## 0. Huidige sterke punten

- [x] `src/config/defaults/core.js` zet `botMode` standaard op `paper`.
- [x] `src/config/paperModeProfile.js` bevat paper profielen: `sim`, `learn`, `research`, `demo_spot`.
- [x] `src/execution/paperBroker.js` bevat paper portfolio, paper fills, fees, PnL, positie-validatie en analytics.
- [x] `src/execution/demoPaperBroker.js` remapt broker-output naar `brokerMode: "paper"` en `executionVenue: "binance_demo_spot"`.
- [x] `docs/FEATURE_COMPLETION_PLAN.md` gebruikt een prioriteitsmodel voor audit/completion.
- [x] `docs/FEATURE_STATUS.md` splitst features in implemented, experimental en planned.

---

## P0 — Baseline audit hard maken

- [ ] Draai dependencies lokaal:

```bash
npm ci
```

- [ ] Draai de bestaande feature audit:

```bash
npm run feature:audit
# of direct:
node src/cli.js feature:audit
```

- [ ] Draai algemene test suite:

```bash
npm test
```

- [ ] Draai doctor:

```bash
npm run doctor
# of:
node src/cli.js doctor
```

- [ ] Start een minimale paper-run via de CLI:

```bash
BOT_MODE=paper node src/cli.js once
```

- [ ] Start een langere paper-run via CLI:

```bash
BOT_MODE=paper node src/cli.js run
```

- [x] Voeg ontbrekende expliciete scripts toe aan `package.json`:

```json
{
  "scripts": {
    "paper": "node scripts/run-mode.mjs paper run",
    "paper:once": "node scripts/run-mode.mjs paper once",
    "paper:doctor": "node scripts/run-mode.mjs paper doctor",
    "paper:audit": "node scripts/run-mode.mjs paper feature:audit",
    "demo": "node scripts/run-mode.mjs demo run",
    "demo:once": "node scripts/run-mode.mjs demo once",
    "demo:doctor": "node scripts/run-mode.mjs demo doctor",
    "demo:audit": "node scripts/run-mode.mjs demo feature:audit"
  }
}
```

Deze scripts gebruiken `scripts/run-mode.mjs`, zodat ze cross-platform werken in PowerShell, cmd, Linux en CI zonder shell-specifieke env-var syntax.

- [ ] Verifieer dat `src/config/index.js` overal `botMode` gebruikt als bron van waarheid.
- [ ] Verifieer dat `BOT_MODE=live` nooit per ongeluk gekozen wordt zonder expliciete live-confirmatie en live credentials.
- [ ] Maak een audit-output bestand:

```bash
node src/cli.js feature:audit > data/runtime/feature-audit.paper.txt
```

---

## P0 — Eén centrale execution-router verplicht maken

Doel: geen enkele module mag direct echte orders kunnen plaatsen buiten de centrale broker-router.

- [ ] Maak of bevestig één centrale `BrokerRouter` / `ExecutionRouter`.
- [ ] Alle order-capable modules moeten via deze flow gaan:

```text
Strategy / AI / Signal
  -> Risk / Safety
  -> ExecutionRouter
  -> PaperBroker of DemoPaperBroker
  -> Paper fill / Demo exchange fill
  -> Position store
  -> Telemetry / dashboard / audit log
```

- [x] Zoek alle directe order callsites:

```bash
npm run debug:order-routing
```

- [x] Label elke callsite als:
  - `PAPER_SAFE`
  - `DEMO_SAFE`
  - `LIVE_GATED`
  - `DIAGNOSTIC_ONLY`
  - `TEST_ONLY`
  - `UNSAFE`
- [x] Laat CI falen bij `UNSAFE`.
- [ ] Voeg runtime guard toe: in `botMode !== "live"` mag geen echte private exchange order-call plaatsvinden.
- [ ] Voeg metadata toe aan elke order/fill:
  - `botMode`
  - `paperModeProfile`
  - `brokerMode`
  - `executionVenue`
  - `simulationId`
  - `decisionId`
  - `sourceFeature`

---

## P0 — Paper/demo smoke test per hoofdflow

- [ ] Signal generation werkt zonder live keys.
- [ ] Risk manager blokkeert of keurt goed zonder live keys.
- [ ] Paper order wordt aangemaakt.
- [ ] Paper fill wordt gesimuleerd.
- [ ] Paper position wordt opgeslagen.
- [ ] Paper exit wordt gesimuleerd.
- [ ] PnL wordt bijgewerkt.
- [ ] Telemetry toont `brokerMode: paper`.
- [ ] Dashboard/readmodel toont duidelijk `PAPER` of `DEMO`.
- [ ] Logs tonen geen echte order endpoint calls.
- [ ] Bot kan draaien met lege/ontbrekende Binance private keys in paper mode.

Acceptatie:

```bash
BOT_MODE=paper node src/cli.js once
BOT_MODE=paper node src/cli.js doctor
BOT_MODE=paper node src/cli.js feature:audit
npm test
```

---

## P1 — Feature-by-feature wiring matrix

Maak een tabelbestand: `docs/PAPER_DEMO_WIRING_MATRIX.md`.

Gebruik deze kolommen:

| Feature | Bestand(en) | Runtime path | Paper status | Demo status | Live status | Tests | Dashboard | Actie |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Toegestane statuses:

- `PAPER_CONNECTED`
- `DEMO_CONNECTED`
- `SHADOW_ONLY`
- `OFFLINE_ONLY`
- `DIAGNOSTIC_ONLY`
- `READ_ONLY`
- `NOT_REQUIRED`
- `LIVE_GATED`
- `MISSING`
- `UNKNOWN`

Checklist:

- [ ] Trading core matrix invullen.
- [ ] Execution/broker matrix invullen.
- [ ] Risk/safety matrix invullen.
- [ ] AI/self-improvement matrix invullen.
- [ ] Strategy modules matrix invullen.
- [ ] Market intelligence/read-only modules matrix invullen.
- [ ] Dashboard/readmodel matrix invullen.
- [ ] Backtest/replay/simulation matrix invullen.
- [ ] Ops/doctor/audit matrix invullen.
- [ ] Alle `UNKNOWN` statussen oplossen.
- [ ] Alle core `MISSING` statussen oplossen of bewust markeren als `NOT_REQUIRED`.

---

## P1 — Trading core aansluiten op paper/demo

- [ ] `DataPipeline` levert data aan paper/demo zonder live private API.
- [ ] `StrategyEngine` kan decisions maken in paper/demo.
- [ ] `RiskManager` gebruikt dezelfde gates in paper/demo als live, behalve waar bewust relaxatie toegestaan is.
- [ ] `BotManager` start paper/demo bot zonder live keys.
- [ ] `TradingBot` lifecycle is getest voor:
  - [ ] init
  - [ ] once
  - [ ] run loop
  - [ ] stop
  - [ ] doctor
  - [ ] report
- [ ] Elke decision krijgt een `decisionId`.
- [ ] Elke order krijgt een `decisionId`.
- [ ] Elke fill krijgt een `decisionId`.
- [ ] Elke positie linkt terug naar de brondecision.

---

## P1 — Execution/broker laag

- [ ] `PaperBroker` is default voor `botMode=paper`.
- [ ] `DemoPaperBroker` is default voor `paperModeProfile=demo_spot`.
- [ ] `LiveBroker` kan alleen actief worden bij expliciete live configuratie.
- [ ] `PaperBroker` ondersteunt:
  - [ ] market buy
  - [ ] market sell
  - [ ] partial fill
  - [ ] fee model
  - [ ] slippage model
  - [ ] latency model
  - [ ] insufficient balance rejection
  - [ ] min notional rejection
  - [ ] position reconciliation no-op/safe mode
- [ ] `DemoPaperBroker` ondersteunt:
  - [ ] Binance demo spot venue metadata
  - [ ] paper brokerMode metadata
  - [ ] demo account doctor
  - [ ] demo reconcile
  - [ ] demo position remapping
- [ ] Elke execution event moet in paper/demo zichtbaar zijn in audit log en dashboard.
- [ ] Voeg test toe: paper mode mag nooit echte exchange private order endpoint raken.

---

## P1 — AI/self-improvement veilig houden

- [ ] Adaptive governance blijft paper/shadow tenzij expliciet anders.
- [ ] Online tuning mag in paper mode suggesties maken, maar niet live thresholds aanpassen.
- [ ] Challenger/promotie flow vereist paper evidence.
- [ ] Research mining blijft offline of paper-only.
- [ ] Replay chaos packs mogen geen orders plaatsen.
- [ ] Elke self-improvement output krijgt status:
  - [ ] `suggestion`
  - [ ] `shadow_candidate`
  - [ ] `paper_applied`
  - [ ] `rejected`
  - [ ] `requires_live_review`
- [ ] Geen enkele AI-module mag direct broker-calls doen.
- [ ] AI-modules mogen alleen via Strategy/Risk/ExecutionRouter.

---

## P1 — Risk en safety gates

- [ ] Max position size werkt in paper/demo.
- [ ] Max open positions werkt in paper/demo.
- [ ] Daily drawdown werkt in paper/demo.
- [ ] Spread shock werkt in paper/demo.
- [ ] Volatility block werkt in paper/demo.
- [ ] News/event risk blijft read-only of risk-context.
- [ ] Circuit breaker werkt in paper/demo.
- [ ] Live leakage detector toevoegen.
- [ ] Hard fail wanneer `BOT_MODE=paper` maar live-order functie wordt aangeroepen.
- [ ] Hard fail wanneer `PAPER_MODE_PROFILE=demo_spot` maar broker metadata niet `executionVenue=binance_demo_spot` is.

---

## P1 — Dashboard/readmodel bewijs

- [ ] Dashboard toont grote mode banner:
  - [ ] `PAPER`
  - [ ] `DEMO_SPOT`
  - [ ] `LIVE`
- [ ] Elke order card toont:
  - [ ] brokerMode
  - [ ] executionVenue
  - [ ] simulationId
  - [ ] decisionId
  - [ ] sourceFeature
- [ ] Elke open position toont:
  - [ ] paper/demo/live status
  - [ ] entry source
  - [ ] risk source
  - [ ] strategy source
- [ ] Report toont total PnL apart voor paper/demo.
- [ ] Doctor toont of private live endpoints geblokkeerd zijn.

---

## P2 — Demo realisme verhogen

- [ ] Seeded deterministic prijsstream voor reproduceerbare tests.
- [ ] Slippage per symbol/regime.
- [ ] Fees per exchange profile.
- [ ] Partial fills.
- [ ] Rejections:
  - [ ] min notional
  - [ ] insufficient balance
  - [ ] precision error
  - [ ] stale price
  - [ ] rate limit
- [ ] Latency simulatie.
- [ ] Queue/maker-vs-taker simulatie.
- [ ] Spread shock scenario.
- [ ] Flash crash scenario.
- [ ] API outage scenario.
- [ ] Reconcile mismatch scenario.
- [ ] Replay mode: backtest decisions opnieuw door paper/demo broker sturen.

---

## P2 — CI gates

Voeg scripts toe:

```json
{
  "scripts": {
    "qa:paper": "BOT_MODE=paper node src/cli.js feature:audit && BOT_MODE=paper node src/cli.js doctor",
    "qa:demo": "BOT_MODE=paper PAPER_MODE_PROFILE=demo_spot node src/cli.js feature:audit",
    "test:paper-safety": "node test/paperSafety.test.js",
    "test:no-live-leak": "node test/noLiveLeak.test.js"
  }
}
```

Checklist:

- [ ] CI draait `npm test`.
- [ ] CI draait `npm run feature:audit`.
- [ ] CI draait paper safety tests.
- [ ] CI faalt bij directe live broker call in paper/demo.
- [ ] CI faalt bij ontbrekende mode metadata.
- [ ] CI faalt bij `UNKNOWN` status in core features.
- [ ] CI faalt bij `MISSING` status in paper feature ids.

---

## P2 — Documentatie

- [ ] Update `README.md` met mode matrix.
- [ ] Maak `docs/PAPER_MODE.md`.
- [ ] Maak `docs/DEMO_MODE.md`.
- [ ] Maak `docs/LIVE_MODE_GATES.md`.
- [ ] Update `docs/FEATURE_STATUS.md`.
- [ ] Update `docs/FEATURE_COMPLETION_PLAN.md`.
- [ ] Voeg operator checklist toe:

```text
1. npm ci
2. npm test
3. BOT_MODE=paper node src/cli.js feature:audit
4. BOT_MODE=paper node src/cli.js doctor
5. BOT_MODE=paper node src/cli.js once
6. dashboard controleren
7. logs controleren op live leakage
```

---

## Eindacceptatie

Je mag pas zeggen “alles is aangesloten op paper/demo” wanneer dit allemaal klopt:

- [ ] Alle features staan in `docs/PAPER_DEMO_WIRING_MATRIX.md`.
- [ ] Geen enkele core feature heeft status `UNKNOWN`.
- [ ] Geen enkele paper/demo feature heeft status `MISSING`.
- [ ] Alle order-capable modules gaan via één centrale execution-router.
- [ ] Paper mode draait zonder live private API keys.
- [ ] Demo mode draait zonder echte live orders.
- [ ] Alle orders/fills/positions bevatten mode metadata.
- [ ] Dashboard toont correct paper/demo/live.
- [ ] `npm test` passed.
- [ ] `node src/cli.js feature:audit` passed.
- [ ] `BOT_MODE=paper node src/cli.js once` passed.
- [ ] `BOT_MODE=paper node src/cli.js doctor` passed.
- [ ] CI blokkeert live leakage.
- [ ] Live mode blijft gated en vereist aparte review.

---

## Kort oordeel

De basis is goed: paper defaults, paper profiles, PaperBroker en DemoPaperBroker bestaan.
Maar “alle modules/features zijn aangesloten” is nog te sterk. De juiste volgende stap is: **feature-by-feature matrix + centrale execution-router + paper/demo CI gates**.
