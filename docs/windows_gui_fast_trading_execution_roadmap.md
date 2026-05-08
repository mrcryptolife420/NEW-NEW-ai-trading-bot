# Windows GUI + Fast Trading Execution Roadmap

Doel:
- Een Windows GUI maken voor de trading bot.
- De bot sneller laten reageren op geldige trade-signalen.
- Marktdata sneller binnenhalen.
- Directe veilige acties mogelijk maken vanuit GUI/dashboard.
- Geen dubbele voorstellen uit eerdere roadmaps herhalen.

Belangrijk:
Sneller traden mag nooit betekenen dat risk checks, exchange protection, live guardrails, exposure limits of reconcile safety worden overgeslagen.

---

## 1. Windows GUI voor de trading bot

### Aanpak

Start met een Windows desktop app bovenop de bestaande dashboard/API.

Aanbevolen eerste keuze: Electron.

Waarom Electron:
- Werkt goed met Node.js.
- Sneller te bouwen dan Tauri.
- Makkelijk Windows installer maken.
- Kan bestaande dashboard in een desktop app tonen.
- Kan tray icon, notificaties en start/stop knoppen krijgen.

Later kan Tauri eventueel als lichtere app worden onderzocht.

### Taken

- [ ] Maak nieuwe map: `desktop/`.
- [ ] Voeg Electron toe als desktop wrapper.
- [ ] Maak `desktop/package.json`.
- [ ] Maak `desktop/main.js`.
- [ ] Open lokale dashboard URL in de app.
- [ ] Voeg Windows tray icon toe.
- [ ] Toon tray status: `stopped`, `running`, `paper`, `live`, `blocked`.
- [ ] Voeg Windows notifications toe voor critical alerts.
- [ ] Voeg optie toe om dashboard te openen vanuit tray.
- [ ] Voeg optie toe om bot veilig te starten vanuit tray.
- [ ] Voeg optie toe om bot veilig te stoppen vanuit tray.
- [ ] Voeg Windows installer toe via `electron-builder`.
- [ ] Voeg desktop shortcut toe.
- [ ] Voeg start menu shortcut toe.
- [ ] Voeg optie toe om bot service-status te tonen.
- [ ] Toon pad naar `.env`.
- [ ] Toon pad naar runtime data.
- [ ] Toon of GUI verbonden is met de lokale bot API.

### GUI-schermen

- [ ] Overview scherm.
- [ ] Trading Control scherm.
- [ ] Fast Execution scherm.
- [ ] Positions scherm.
- [ ] Trade Debug scherm.
- [ ] Alerts scherm.
- [ ] Settings scherm.
- [ ] Logs scherm.
- [ ] Neural/AI status scherm.
- [ ] Data freshness scherm.

### GUI-regels

- [ ] Live mode krijgt altijd duidelijke rode waarschuwing.
- [ ] Live acties vragen extra bevestiging.
- [ ] Geen knop maken die risk checks overslaat.
- [ ] Geen `force market buy now` knop zonder risk verdict.
- [ ] Geen knop die exchange freeze negeert.
- [ ] Geen knop die reconcile warnings negeert.
- [ ] GUI toont altijd of data vers of stale is.
- [ ] GUI toont altijd of exchange protection actief is.
- [ ] GUI toont altijd of bot in paper of live staat.

---

## 2. Directe trade execution zonder 1 minuut vertraging

### Probleem

Als trading alleen per interval/cycle loopt, kan er vertraging zitten tussen:

```txt
signaal gevonden -> volgende cycle -> risk check -> order
```

De betere oplossing is niet zomaar de interval extreem laag zetten, maar een aparte fast execution lane toevoegen.

### Nieuwe flow

```txt
Nieuwe stream data
-> hot symbol update
-> snelle candidate refresh
-> threshold wordt geraakt
-> fast risk preflight
-> immediate entry queue
-> execution intent
-> broker order
-> audit + dashboard update
```

### Taken

- [ ] Maak `FastSignalTriggerService`.
- [ ] Laat normale trading cycle bestaan voor volledige analyse.
- [ ] Laat fast execution alleen reageren op verse streamdata.
- [ ] Laat fast execution alleen werken op recent geanalyseerde candidates.
- [ ] Voeg `FAST_EXECUTION_ENABLED=false` toe als default.
- [ ] Voeg `FAST_EXECUTION_PAPER_ONLY=true` toe als default.
- [ ] Voeg `FAST_EXECUTION_MAX_SIGNALS_PER_MINUTE=3` toe.
- [ ] Voeg `FAST_EXECUTION_MIN_DATA_FRESHNESS_MS=1500` toe.
- [ ] Voeg `FAST_EXECUTION_CANDIDATE_TTL_MS=5000` toe.
- [ ] Voeg `FAST_EXECUTION_REQUIRE_LOCAL_BOOK=true` toe.
- [ ] Voeg `FAST_EXECUTION_BLOCK_ON_RECONCILE_WARNING=true` toe.
- [ ] Voeg `FAST_EXECUTION_BLOCK_ON_UNRESOLVED_INTENT=true` toe.

### Verplichte checks

- [ ] Geen open positie op hetzelfde symbool.
- [ ] Max open positions niet overschreden.
- [ ] Max exposure niet overschreden.
- [ ] Spread onder maximum.
- [ ] Order book data vers.
- [ ] Risk verdict positief.
- [ ] Exchange safety oké.
- [ ] Geen unresolved execution intent.
- [ ] Geen health circuit open.
- [ ] Geen manual review vereist.
- [ ] Geen live guardrail fail.

---

## 3. Immediate Entry Queue

### Doel

Wanneer een setup klaar is, moet hij niet wachten op de volgende volledige cycle. Hij gaat naar een queue die direct checkt of hij veilig uitgevoerd mag worden.

### Taken

- [ ] Maak `src/runtime/immediateEntryQueue.js`.
- [ ] Queue item bevat `symbol`, `candidateId`, `createdAt`, `expiresAt`.
- [ ] Queue item verloopt na 3 tot 5 seconden.
- [ ] Deduplicate queue items per symbool.
- [ ] Blokkeer queue item als er al een unresolved execution intent bestaat.
- [ ] Log elk queue item als audit event.
- [ ] Toon queue in GUI.
- [ ] Toon waarom queue item niet uitgevoerd werd.
- [ ] Toon latency per queue item.
- [ ] Voeg tests toe voor duplicate prevention.
- [ ] Voeg tests toe voor expired candidate blocking.
- [ ] Voeg tests toe voor safety blockers.

### Voorbeeld queue item

```json
{
  "id": "fast-entry-BTCUSDT-2026-05-07T12:00:00.000Z",
  "symbol": "BTCUSDT",
  "source": "stream_threshold_cross",
  "createdAt": "2026-05-07T12:00:00.000Z",
  "expiresAt": "2026-05-07T12:00:05.000Z",
  "requiredChecks": [
    "fresh_market_data",
    "risk_verdict",
    "exposure_limit",
    "exchange_safety",
    "execution_budget"
  ]
}
```

---

## 4. Fast Preflight Risk Check

### Doel

Een snelle risk check die alleen kijkt naar dingen die op dat moment kunnen veranderen.

Niet opnieuw doen:
- lange research
- volledige universe rebuild
- volledige backtest
- zware news refresh
- offline training

Wel checken:
- data freshness
- huidige spread
- huidige book pressure
- open positions
- max exposure
- current balance
- unresolved intents
- exchange safety
- health state
- operator mode

### Taken

- [ ] Maak `src/risk/fastPreflightRisk.js`.
- [ ] Return altijd `{ allow, reasonCodes, latencyMs }`.
- [ ] Voeg canonical reason codes toe.
- [ ] Voeg unit tests toe voor elke blocker.
- [ ] Fast preflight mag geen runtime muteren.
- [ ] Fast preflight moet onder 100 ms kunnen draaien.
- [ ] Fast preflight resultaat wordt opgeslagen in trade trace.
- [ ] Fast preflight resultaat wordt getoond in GUI.

---

## 5. Snellere marktdata binnenhalen

### Doel

Websocket/stream data moet primair worden. REST moet vooral fallback en bootstrap zijn.

### Taken

- [ ] Gebruik stream data primair voor top watchlist symbols.
- [ ] Gebruik REST alleen voor bootstrap.
- [ ] Gebruik REST voor gap fill.
- [ ] Gebruik REST als fallback bij stream failure.
- [ ] Houd per symbool bij: `lastTradeAt`.
- [ ] Houd per symbool bij: `lastBookAt`.
- [ ] Houd per symbool bij: `lastKlineAt`.
- [ ] Houd per symbool bij: `lastDepthAt`.
- [ ] Voeg data freshness score toe.
- [ ] Fast execution blokkeert als streamdata stale is.
- [ ] Dashboard toont data age per symbool.
- [ ] GUI toont stream status.
- [ ] GUI toont websocket connected/disconnected.
- [ ] GUI toont REST fallback actief/inactief.

### Data freshness targets

- [ ] Book ticker maximaal 1.5 seconde oud voor fast entry.
- [ ] Local order book maximaal 2 seconden oud voor fast entry.
- [ ] Trade flow maximaal 5 seconden oud.
- [ ] Candle features mogen ouder zijn, maar moeten age tonen.
- [ ] News/macro hoeft niet realtime, maar mag geen onbekende stale status hebben.

---

## 6. Hot Symbol Lane

### Doel

Niet alle coins even zwaar verwerken. De bot moet sneller reageren op symbols waar echt iets gebeurt.

### Hot symbol triggers

- [ ] Candidate zit dicht bij threshold.
- [ ] Prijs breekt belangrijke level.
- [ ] Volume spike.
- [ ] Spread wordt ineens acceptabel.
- [ ] Book pressure draait positief.
- [ ] Open position heeft exit risk.
- [ ] News/event risk verandert.
- [ ] Volatility regime verandert.
- [ ] Model score stijgt snel.

### Taken

- [ ] Maak `src/runtime/hotSymbolLane.js`.
- [ ] Geef open positions hoogste prioriteit.
- [ ] Geef near-threshold candidates tweede prioriteit.
- [ ] Geef volume/spread/book changes derde prioriteit.
- [ ] Beperk hot symbols via `HOT_SYMBOL_MAX=12`.
- [ ] Toon hot symbols in GUI.
- [ ] Toon waarom een symbool hot is.
- [ ] Laat hot symbols vaker fast feature updates krijgen.
- [ ] Laat normale cycle nog steeds alle symbols periodiek checken.

---

## 7. Incremental Feature Updates

### Probleem

Alles opnieuw berekenen op elke tick is te traag.

### Oplossing

Features splitsen op snelheid.

```txt
Fast:
- spread
- book pressure
- microprice
- trade flow
- queue imbalance

Medium:
- candles
- volatility
- VWAP
- RSI/ADX/MFI
- regime

Slow:
- news
- macro
- sector
- market structure
- higher timeframe

Static:
- symbol profile
- exchange rules
- strategy config
```

### Taken

- [ ] Maak feature cache per symbool.
- [ ] Voeg `featureAgeMs` toe per featuregroep.
- [ ] Update fast features op websocket event.
- [ ] Update medium features op candle close.
- [ ] Update slow features via normale cycle.
- [ ] Fast execution mag alleen fast + recent full-analysis combineren.
- [ ] GUI toont welke featuregroep stale is.
- [ ] Trade forensics slaat feature age op.

---

## 8. GUI realtime updates via SSE of WebSocket

### Doel

GUI moet niet steeds pollen. De bot moet updates pushen.

Aanbevolen eerste stap: SSE.

### Taken

- [ ] Maak `src/dashboard/eventBus.js`.
- [ ] Maak endpoint `GET /api/events`.
- [ ] Push event bij bot status update.
- [ ] Push event bij nieuwe hot candidate.
- [ ] Push event bij immediate queue update.
- [ ] Push event bij execution intent update.
- [ ] Push event bij position update.
- [ ] Push event bij alert update.
- [ ] Push event bij latency update.
- [ ] GUI luistert naar `/api/events`.
- [ ] Fallback polling blijft bestaan.
- [ ] Events mogen geen secrets bevatten.

### Event types

```txt
bot_status
market_tick
hot_candidate
entry_queue_update
execution_intent_update
position_update
alert_update
latency_update
stream_health_update
```

---

## 9. Latency Profiler

### Doel

Eerst meten waar die minuut vertraging vandaan komt.

### Taken

- [ ] Maak `src/runtime/latencyProfiler.js`.
- [ ] Meet stream-to-signal latency.
- [ ] Meet signal-to-risk latency.
- [ ] Meet risk-to-intent latency.
- [ ] Meet intent-to-submit latency.
- [ ] Meet submit-to-ack latency.
- [ ] Meet ack-to-fill latency.
- [ ] Meet dashboard-update latency.
- [ ] Voeg CLI command toe: `node src/cli.js latency:report`.
- [ ] Toon p50/p95/p99 latency in GUI.
- [ ] Toon grootste bottleneck.
- [ ] Voeg latency toe aan trade forensics.

### Voorbeeld output

```json
{
  "streamToSignalMs": 120,
  "signalToRiskMs": 44,
  "riskToIntentMs": 22,
  "intentToSubmitMs": 80,
  "submitToAckMs": 210,
  "biggestBottleneck": "waiting_for_next_cycle"
}
```

---

## 10. Directe veilige operator-acties

### Acties die direct in GUI mogen

- [ ] Start bot.
- [ ] Stop bot.
- [ ] Run one cycle.
- [ ] Refresh analysis.
- [ ] Run market scan.
- [ ] Force reconcile.
- [ ] Mark position reviewed.
- [ ] Acknowledge alert.
- [ ] Resolve alert.
- [ ] Pause new entries.
- [ ] Resume new entries.
- [ ] Disable fast execution.
- [ ] Enable paper fast execution.
- [ ] Enable probe-only.
- [ ] Disable probe-only.

### Acties met extra bevestiging

- [ ] Switch naar live.
- [ ] Enable live fast execution.
- [ ] Approve neural model promotion.
- [ ] Rollback model.
- [ ] Panic flatten plan.
- [ ] Change risk limits.
- [ ] Change max exposure.
- [ ] Change API mode.

### Acties die niet mogen

- [ ] Geen force buy zonder risk verdict.
- [ ] Geen force sell zonder position context.
- [ ] Geen override van exchange freeze.
- [ ] Geen override van manual review.
- [ ] Geen override van max exposure.
- [ ] Geen live fast execution standaard aan.

---

## 11. Command Palette in GUI

### Doel

Snel acties uitvoeren zonder door veel schermen te klikken.

Voorbeeld:

```txt
Ctrl + K -> pause entries -> Enter -> confirm -> audit event created
```

### Taken

- [ ] Voeg command palette toe.
- [ ] Zoek acties op naam.
- [ ] Toon safety impact per actie.
- [ ] Toon of actie live impact heeft.
- [ ] Vraag bevestiging bij risicovolle acties.
- [ ] Toon audit ID na actie.
- [ ] Log elke actie.

---

## 12. Fast execution config profielen

### Paper-fast profiel

Maak profiel:

```txt
config/profiles/paper-fast.env.example
```

Voorstel:

```env
FAST_EXECUTION_ENABLED=true
FAST_EXECUTION_PAPER_ONLY=true
TRADING_INTERVAL_SECONDS=15
ENABLE_EVENT_DRIVEN_DATA=true
ENABLE_LOCAL_ORDER_BOOK=true
PUBLIC_STREAM_STARTUP_WAIT_MS=1000
PUBLIC_STREAM_STALE_MS=10000
PUBLIC_STREAM_MONITOR_INTERVAL_MS=5000
LOCAL_BOOK_BOOTSTRAP_WAIT_MS=150
LOCAL_BOOK_WARMUP_MS=750
REST_BOOK_TICKER_FALLBACK_MIN_MS=30000
REST_DEPTH_FALLBACK_MIN_MS=60000
```

Taken:

- [ ] Maak paper-fast profiel.
- [ ] Maak live-fast profiel nog niet standaard.
- [ ] Voeg waarschuwing toe dat live-fast apart goedgekeurd moet worden.
- [ ] GUI kan profiel tonen.
- [ ] GUI kan profiel niet blind toepassen zonder preview.

---

## 13. Position Exit Fast Lane

### Belangrijk

Sneller instappen is nuttig, maar sneller uitstappen en beschermen is belangrijker.

### Taken

- [ ] Open positions krijgen hoogste stream priority.
- [ ] Exit checks draaien op relevante stream events.
- [ ] Trailing stop checks draaien sneller.
- [ ] Protective order status wordt sneller gemonitord.
- [ ] Exit fast lane gebruikt eigen risk/safety checks.
- [ ] GUI toont exit latency.
- [ ] GUI toont protection latency.
- [ ] Trade forensics toont exit decision delay.

---

## 14. Candidate Freshness Contract

### Doel

Geen trade uitvoeren op oude analyse.

### Taken

- [ ] Elke candidate krijgt `createdAt`.
- [ ] Elke candidate krijgt `validUntil`.
- [ ] Elke candidate krijgt `marketDataAgeMs`.
- [ ] Elke candidate krijgt `featureAgeMs`.
- [ ] Elke candidate krijgt `dataFreshnessStatus`.
- [ ] Fast execution weigert verlopen candidates.
- [ ] GUI toont candidate age.
- [ ] Dashboard toont stale candidates apart.
- [ ] Audit logt wanneer candidate verlopen was.

---

## 15. Near-threshold Watchlist

### Doel

De bot moet extra opletten op setups die bijna klaar zijn.

### Taken

- [ ] Track candidates binnen 2% van threshold.
- [ ] Track candidates binnen 5% van threshold.
- [ ] Geef near-threshold symbols hogere data priority.
- [ ] Toon near-threshold candidates in GUI.
- [ ] Trigger fast preflight zodra threshold crossed wordt.
- [ ] Log threshold cross event.
- [ ] Laat near-threshold lijst automatisch verlopen.

---

## 16. Safe Live-Fast Observe Mode

### Doel

Live-fast eerst observeren zonder echte invloed.

### Taken

- [ ] Maak `LIVE_FAST_OBSERVE_ONLY=true` default.
- [ ] Simuleer wat fast execution live zou hebben gedaan.
- [ ] Vergelijk fast beslissing met normale cycle.
- [ ] Meet hoeveel kansen sneller waren.
- [ ] Meet hoeveel false triggers er waren.
- [ ] Toon rapport in GUI.
- [ ] Vereis operator approval voor echte live-fast.
- [ ] Maak one-click disable voor live-fast.

---

## 17. GUI Trading Debug Panel

### Doel

Je wil meteen zien waarom bot niet of te laat handelt.

### Taken

- [ ] Toon laatste 20 signals.
- [ ] Toon laatste 20 blocked entries.
- [ ] Toon laatste 20 fast queue items.
- [ ] Toon laatste 20 execution intents.
- [ ] Toon root blocker per item.
- [ ] Toon latency per item.
- [ ] Toon data age per item.
- [ ] Toon risk verdict per item.
- [ ] Toon execution result per item.
- [ ] Voeg filter toe per symbol.
- [ ] Voeg filter toe per blocker.
- [ ] Voeg filter toe per mode: paper/live.

---

## 18. GUI Fast Execution Panel

### Tonen

- [ ] Fast execution enabled/disabled.
- [ ] Paper-only enabled/disabled.
- [ ] Live observe enabled/disabled.
- [ ] Queue size.
- [ ] Last fast signal.
- [ ] Last fast execution.
- [ ] Fast blocked reasons.
- [ ] Average fast latency.
- [ ] p95 fast latency.
- [ ] Stream freshness.
- [ ] Hot symbols.
- [ ] Near-threshold symbols.
- [ ] One-click disable fast execution.

---

## 19. Extra safety voor snelle execution

### Taken

- [ ] Hard cap op fast entries per minuut.
- [ ] Hard cap op fast entries per symbol per dag.
- [ ] Cooldown na failed fast entry.
- [ ] Cooldown na slippage spike.
- [ ] Cooldown na stale data event.
- [ ] Cooldown na ambiguous order intent.
- [ ] Fast execution stopt automatisch bij health circuit open.
- [ ] Fast execution stopt automatisch bij exchange safety warning.
- [ ] Fast execution stopt automatisch bij request weight pressure.

---

## 20. Aanbevolen implementatievolgorde

### Sprint 1: Windows GUI basis

- [ ] Electron desktop shell.
- [ ] GUI status endpoint.
- [ ] Bot start/stop knoppen.
- [ ] Service status tonen.
- [ ] Alerts tonen.
- [ ] Logs tonen.

### Sprint 2: Latency meten

- [ ] Latency profiler.
- [ ] `latency:report`.
- [ ] Candidate freshness contract.
- [ ] GUI latency panel.
- [ ] Trading Debug panel basis.

### Sprint 3: Snellere data

- [ ] Event bus.
- [ ] SSE endpoint.
- [ ] Stream freshness monitor.
- [ ] Hot symbol lane.
- [ ] Incremental fast features.

### Sprint 4: Fast paper execution

- [ ] Immediate entry queue.
- [ ] Fast preflight risk.
- [ ] Fast execution paper-only.
- [ ] Fast execution GUI panel.
- [ ] Fast execution audit trail.

### Sprint 5: Exit fast lane

- [ ] Open position priority.
- [ ] Exit stream checks.
- [ ] Protection latency tracking.
- [ ] Exit debug panel.

### Sprint 6: Live-fast observe

- [ ] Live-fast observe mode.
- [ ] Live-fast report.
- [ ] Operator approval flow.
- [ ] One-click disable.
- [ ] Rollback and safety shutdown.

---

## 21. Beste eerste stap

Niet meteen live sneller maken.

Eerst:

- [ ] Windows GUI basis.
- [ ] Latency profiler.
- [ ] Candidate freshness.
- [ ] Stream freshness.
- [ ] Trading Debug panel.

Daarna pas:

- [ ] Fast paper execution.
- [ ] Fast live observe.
- [ ] Live fast execution met approval.

Reden:
Je moet eerst exact zien waar de vertraging zit. Anders maak je de bot sneller zonder te weten of de vertraging komt door cycle interval, stream delay, feature rebuild, risk checks, broker latency of dashboard polling.
