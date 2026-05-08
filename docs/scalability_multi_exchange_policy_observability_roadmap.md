# Schaalbaarheid, Multi-Exchange, Policy Engine en Observability Roadmap

Doel:
- Extra uitbreidingen toevoegen bovenop de bestaande roadmaps.
- Focus op schaalbaarheid, meerdere exchanges/accounts, broker routing, policy centralisatie, metrics, liquiditeit en veilige degradatie.
- Geen dubbele taken rond neural autonomie, Windows GUI, fast execution, production recovery of strategy-validatie.
- Alles is afvinkbaar en lokaal bruikbaar als implementatie-checklist.

Belangrijk:
Deze roadmap maakt de bot volwassener als systeem. De nadruk ligt op veilig kunnen uitbreiden, beter kunnen monitoren en gecontroleerd kunnen falen.

---

## 1. Multi-Exchange Adapter Layer

### Doel

De bot minder afhankelijk maken van één exchange en later makkelijker andere exchanges toevoegen.

### Nieuw bestand / structuur

```txt
src/exchange/adapters/ExchangeAdapter.js
src/exchange/adapters/binance/BinanceExchangeAdapter.js
src/exchange/adapters/paper/PaperExchangeAdapter.js
src/exchange/adapters/synthetic/SyntheticExchangeAdapter.js
src/exchange/exchangeCapabilities.js
```

### ExchangeAdapter interface

- [x] `getExchangeInfo()`
- [x] `getSymbolRules(symbol)`
- [x] `getBalance()`
- [x] `getTicker(symbol)`
- [x] `getOrderBook(symbol)`
- [x] `getKlines(symbol, interval, limit)`
- [x] `placeOrder(order)`
- [x] `cancelOrder(orderId)`
- [x] `getOpenOrders(symbol)`
- [x] `getOrderStatus(orderId)`
- [x] `getRecentFills(symbol)`
- [x] `createUserStream()`
- [x] `subscribeMarketStream(symbols)`
- [x] `getRateLimitState()`
- [x] `getHealth()`

### Taken

- [x] Maak generieke exchange adapter interface.
- [x] Verplaats Binance-specifieke normalisatie achter Binance adapter.
- [x] Maak paper adapter met dezelfde interface.
- [x] Maak synthetic adapter voor tests en training mode.
- [x] Normaliseer order response.
- [x] Normaliseer balances.
- [x] Normaliseer fees.
- [x] Normaliseer symbol rules.
- [x] Normaliseer order book data.
- [x] Normaliseer exchange error codes.
- [x] Normaliseer rate-limit status.
- [x] Voeg exchange capability matrix toe.
- [x] Toon actieve exchange in dashboard/API.
- [x] Voeg config toe: `EXCHANGE_PROVIDER=binance`.

### Acceptance criteria

- [x] De rest van de bot gebruikt niet direct Binance client voor nieuwe logic.
- [x] Paper/synthetic/live gebruiken dezelfde adaptervorm.
- [x] Nieuwe exchange kan worden toegevoegd zonder risk manager te herschrijven.
- [x] Exchange-specific quirks blijven binnen adapter.

---

## 2. Multi-Account Support

### Doel

Aparte accounts/profielen kunnen gebruiken voor paper, demo, live-small, live-main en neural sandbox.

### Accountprofielen

- [x] `paper`
- [x] `binance_demo`
- [x] `live_small`
- [x] `live_main`
- [x] `neural_sandbox`
- [x] `research_only`
- [x] `operator_training`

### Taken

- [x] Maak `src/accounts/accountProfileRegistry.js`.
- [x] Maak account-level config.
- [x] Maak account-level risk budget.
- [x] Maak account-level API key reference.
- [x] Maak account-level exchange provider.
- [x] Maak account-level broker mode.
- [x] Maak account-level dashboard status.
- [x] Maak account-level PnL.
- [x] Maak account-level exposure.
- [x] Maak account-level neural permissions.
- [x] Maak account-level fast execution permissions.
- [x] Blokkeer neural live autonomy op main account tenzij expliciet toegestaan.
- [x] Toon accountprofiel per open positie.
- [x] Log accountprofiel in audit events.

### Acceptance criteria

- [x] Neural experiments kunnen naar sandbox-account worden beperkt.
- [x] Live-main kan conservatiever zijn dan live-small.
- [x] Accountprofielen lekken geen secrets naar dashboard/logs.

---

## 3. Broker Router

### Doel

Een centrale router bepaalt waar een trade heen mag: paper, demo, sandbox, live-small of live-main.

### Nieuw bestand

```txt
src/execution/brokerRouter.js
```

### Routebeslissingen

- [x] High-confidence normal trade -> configured broker.
- [x] Low-confidence trade -> shadow/paper.
- [x] Neural experiment -> sandbox/paper.
- [x] New strategy -> paper-only.
- [x] Canary strategy -> live-small only.
- [x] High-risk symbol -> paper or blocked.
- [x] Manual approval required -> intent approval queue.
- [x] Exchange degraded -> paper/shadow/block.
- [x] Policy breach -> block.

### Taken

- [x] Maak broker route request object.
- [x] Maak broker route decision object.
- [x] Koppel route aan policy engine.
- [x] Log elke routebeslissing.
- [x] Voeg route reason codes toe.
- [x] Toon route in dashboard.
- [x] Voeg route toe aan trade forensics.
- [x] Voeg tests toe voor neural sandbox routing.
- [x] Voeg tests toe voor live-main blocking.
- [x] Voeg tests toe voor degraded exchange fallback.

### Acceptance criteria

- [x] Geen model/strategie kiest zelf direct broker.
- [x] Elke brokerkeuze is auditbaar.
- [x] Live-main wordt alleen gebruikt als route policy dat toestaat.

---

## 4. Data Lake / Feature Store v2

### Doel

Data beter organiseren zodat training, replay, audit en analyse betrouwbaar blijven.

### Lagen

```txt
raw/
cleaned/
features/
labels/
replay/
model_ready/
archives/
```

### Taken

- [x] Maak duidelijke datasetlagen.
- [x] Sla raw exchange data apart op.
- [x] Sla cleaned data apart op.
- [x] Sla feature frames apart op.
- [x] Sla labels apart op.
- [x] Sla replay outputs apart op.
- [x] Sla model-ready datasets apart op.
- [x] Maak dataset manifest.
- [x] Maak dataset hash.
- [x] Maak dataset lineage.
- [x] Maak dataset quality score.
- [x] Maak dataset compaction job.
- [x] Maak dataset export/import.
- [x] Maak archive integrity check.
- [x] Voeg command toe: `data:lake-report`.

### Acceptance criteria

- [x] Training dataset is reproduceerbaar.
- [x] Replay dataset is reproduceerbaar.
- [x] Raw data blijft gescheiden van model-ready data.
- [x] Dataset lineage is zichtbaar in model registry.

---

## 5. Model Cards

### Doel

Voor elk model een duidelijk “paspoort” maken.

### Model card velden

- [x] Model ID.
- [x] Model version.
- [x] Model type.
- [x] Doel van model.
- [x] Training dataset hash.
- [x] Feature schema version.
- [x] Normalizer version.
- [x] Trained at.
- [x] Training window.
- [x] Symbols in training.
- [x] Regimes in training.
- [x] Strategy families in training.
- [x] Metrics.
- [x] Calibration.
- [x] Known weaknesses.
- [x] Allowed modes.
- [x] Disallowed modes.
- [x] Live permissions.
- [x] Rollback target.
- [x] Retirement condition.
- [x] Operator notes.

### Taken

- [x] Maak `src/models/modelCard.js`.
- [x] Genereer model card na training.
- [x] Toon model card in dashboard/API.
- [x] Export model card naar Markdown/JSON.
- [x] Blokkeer promotie zonder model card.
- [x] Voeg model card toe aan incident export.

### Acceptance criteria

- [x] Elk actief model heeft model card.
- [x] Operator kan zien waar model wel/niet voor bedoeld is.
- [x] Live influence vereist model card met live permissions.

---

## 6. Central Policy Engine

### Doel

Safety- en governance-regels centraliseren in één policy engine.

### Nieuw bestand

```txt
src/policy/policyEngine.js
```

### Policy types

- [x] Live trading policy.
- [x] Neural influence policy.
- [x] Fast execution policy.
- [x] Broker routing policy.
- [x] Data quality policy.
- [x] Exchange safety policy.
- [x] Operator approval policy.
- [x] Strategy promotion policy.
- [x] Account permission policy.
- [x] Replay-to-paper policy.
- [x] Paper-to-live policy.
- [x] Emergency mode policy.

### Policy response

```json
{
  "decision": "block",
  "severity": "critical",
  "reasonCodes": ["exchange_truth_freeze"],
  "requiresApproval": false,
  "allowedScopes": [],
  "operatorAction": "Run reconcile preview before enabling entries."
}
```

### Taken

- [x] Maak policy input schema.
- [x] Maak policy response schema.
- [x] Maak severity enum.
- [x] Maak reason code registry.
- [x] Laat broker router policy engine gebruiken.
- [x] Laat live gates policy engine gebruiken.
- [x] Laat neural autonomy governor policy engine gebruiken.
- [x] Laat fast execution policy engine gebruiken.
- [x] Voeg policy decision toe aan audit.
- [x] Toon policy decision in dashboard.
- [x] Voeg policy tests toe.

### Acceptance criteria

- [x] Safety decisions zijn consistent over modules.
- [x] Policy output is menselijk en machine-readable.
- [x] Geen module implementeert eigen stille live override.

---

## 7. SLA / Reliability Targets

### Doel

Meetbaar maken of de bot gezond genoeg is om te handelen.

### SLA’s

- [x] Market data freshness SLA.
- [x] Stream uptime SLA.
- [x] User stream uptime SLA.
- [x] REST success rate SLA.
- [x] Order ack latency SLA.
- [x] Fill latency SLA.
- [x] Dashboard API latency SLA.
- [x] State write success SLA.
- [x] Backup freshness SLA.
- [x] Reconcile freshness SLA.
- [x] Audit write success SLA.
- [x] Neural inference latency SLA.
- [x] Fast execution latency SLA.

### Taken

- [x] Maak `src/ops/reliabilityTargets.js`.
- [x] Definieer targets per mode.
- [x] Maak SLA checker.
- [x] Toon SLA status in dashboard.
- [x] Maak command `ops:sla-report`.
- [x] Pauzeer entries bij critical SLA breach.
- [x] Verlaag risk bij warning SLA breach.
- [x] Voeg SLA breach toe aan audit.
- [x] Voeg SLA breach toe aan incident export.

### Acceptance criteria

- [x] Bot weet wanneer infrastructuur onbetrouwbaar is.
- [x] Entries worden geblokkeerd bij kritieke reliability breach.
- [x] SLA status is zichtbaar en historisch traceerbaar.

---

## 8. Prometheus / Metrics Export

### Doel

De bot extern monitorbaar maken met standaard metrics.

### Endpoint

```txt
GET /metrics
```

### Metrics

- [x] Bot mode.
- [x] Bot running status.
- [x] Open positions count.
- [x] Paper PnL.
- [x] Live PnL.
- [x] Unrealized exposure.
- [x] Stream freshness.
- [x] REST request count.
- [x] REST error count.
- [x] Rate limit pressure.
- [x] Order latency.
- [x] Fill latency.
- [x] Risk blocker count.
- [x] Fast queue size.
- [x] Neural influence count.
- [x] Neural rollback count.
- [x] Audit write failures.
- [x] Backup age.
- [x] Reconcile age.
- [x] Dashboard response time.
- [x] Event loop lag.
- [x] Memory usage.
- [x] Disk usage.

### Taken

- [x] Maak `src/ops/metricsExporter.js`.
- [x] Voeg `/metrics` endpoint toe.
- [x] Zorg dat metrics geen secrets bevatten.
- [x] Voeg config toe: `METRICS_ENABLED=false`.
- [x] Voeg config toe: `METRICS_BIND_LOCAL_ONLY=true`.
- [x] Voeg voorbeeld Grafana dashboard JSON toe.
- [x] Voeg tests toe voor secret redaction.

### Acceptance criteria

- [x] Monitoring kan zonder dashboard scraping.
- [x] Metrics endpoint lekt geen gevoelige data.
- [x] Metrics is opt-in.

---

## 9. Scenario Lab

### Doel

Experimenten kunnen draaien zonder runtime/trading state te wijzigen.

### Nieuw concept

```txt
Scenario = market data + config overrides + policy overrides + strategy/model variant + execution assumptions
```

### Taken

- [x] Maak `src/research/scenarioLab.js`.
- [x] Maak scenario schema.
- [x] Maak scenario builder.
- [x] Ondersteun custom market shock.
- [x] Ondersteun custom fee/slippage model.
- [x] Ondersteun custom risk settings.
- [x] Ondersteun custom strategy.
- [x] Ondersteun custom neural profile.
- [x] Run scenario offline.
- [x] Vergelijk scenario met baseline.
- [x] Export scenario report.
- [x] Voeg command toe: `research:scenario-run`.
- [x] Voeg command toe: `research:scenario-compare`.

### Acceptance criteria

- [x] Scenario lab wijzigt geen runtime state.
- [x] Scenario lab gebruikt geen LiveBroker.
- [x] Scenario resultaten zijn reproduceerbaar.

---

## 10. Bot Coach

### Doel

Een operator-begeleider die uitlegt wat veilig de volgende actie is.

### Taken

- [x] Maak `src/ops/botCoach.js`.
- [x] Verzamel blockers.
- [x] Verzamel alerts.
- [x] Verzamel performance issues.
- [x] Verzamel data quality issues.
- [x] Verzamel exchange issues.
- [x] Verzamel neural proposals.
- [x] Genereer korte coaching summary.
- [x] Genereer next best safe action.
- [x] Link naar relevante runbook.
- [x] Toon coach summary in dashboard.
- [x] Maak command `ops:coach`.

### Voorbeeld

```txt
De bot handelt weinig omdat 73% van near-threshold setups wordt geblokkeerd door execution cost.
Veilige actie: controleer spread/slippage report en filter tijdelijk minder liquide pairs.
```

### Acceptance criteria

- [x] Coach opent nooit trades.
- [x] Coach verhoogt nooit risk.
- [x] Coach geeft alleen uitleg en veilige acties.

---

## 11. Liquidity Score per Coin

### Doel

Niet alleen volume meten, maar echte tradebaarheid.

### Scorecomponenten

- [x] Spread score.
- [x] Depth score.
- [x] Slippage score.
- [x] Order book stability.
- [x] Fill reliability.
- [x] Volatility-adjusted liquidity.
- [x] Liquidity trend.
- [x] Time-of-day liquidity.
- [x] Maker fill chance.
- [x] Partial fill risk.
- [x] Market impact risk.

### Taken

- [x] Maak `src/market/liquidityScore.js`.
- [x] Bereken score per symbol.
- [x] Bereken score per session.
- [x] Gebruik score in universe selection.
- [x] Gebruik score in risk sizing.
- [x] Gebruik score in execution planner.
- [x] Gebruik score in neural features.
- [x] Blokkeer entries bij te lage score.
- [x] Verlaag size bij medium score.
- [x] Toon liquidity score in dashboard.
- [x] Voeg liquidity trend toe aan reports.

### Acceptance criteria

- [x] Bot vermijdt slecht uitvoerbare coins.
- [x] Liquidity score verklaart execution blockers.
- [x] Liquidity score wordt historisch gemeten.

---

## 12. Trade Replay Video / Visual Timeline

### Doel

Visueel kunnen zien wat er gebeurde tijdens een trade of replay.

### Timeline lagen

- [x] Candle chart.
- [x] Entry marker.
- [x] Stop marker.
- [x] Take-profit marker.
- [x] Exit marker.
- [x] Scale-out markers.
- [x] Neural score timeline.
- [x] Risk score timeline.
- [x] Execution score timeline.
- [x] Spread timeline.
- [x] Order book pressure timeline.
- [x] Data freshness timeline.
- [x] Alerts timeline.
- [x] Policy decisions timeline.

### Taken

- [x] Maak replay timeline data contract.
- [x] Maak endpoint voor timeline data.
- [x] Maak dashboard component.
- [x] Ondersteun export naar JSON.
- [x] Ondersteun screenshot/export optioneel.
- [x] Link timeline aan trade forensics.
- [x] Link timeline aan replay runs.

### Acceptance criteria

- [x] Operator kan trade visueel debuggen.
- [x] Timeline bevat geen secrets.
- [x] Timeline werkt voor paper, live en replay.

---

## 13. Auto Documentation Generator

### Doel

Documentatie automatisch genereren uit actieve config en modules.

### Taken

- [x] Maak `src/docs/autoDocsGenerator.js`.
- [x] Genereer active config summary.
- [x] Genereer active strategies summary.
- [x] Genereer risk settings summary.
- [x] Genereer exchange settings summary.
- [x] Genereer neural status summary.
- [x] Genereer dashboard route summary.
- [x] Genereer CLI command summary.
- [x] Genereer operator quickstart.
- [x] Genereer safety summary.
- [x] Redact secrets.
- [x] Maak command `docs:generate`.
- [x] Schrijf output naar `generated-docs/`.

### Acceptance criteria

- [x] Docs blijven dichter bij echte config.
- [x] Secrets worden nooit in docs gezet.
- [x] Operator quickstart kan automatisch worden vernieuwd.

---

## 14. Performance Budget per Module

### Doel

Elke module krijgt een maximale runtime zodat snelle trading niet traag wordt door zware berekeningen.

### Budgetten

- [x] Feature calculation max ms.
- [x] Risk check max ms.
- [x] Neural inference max ms.
- [x] Policy engine max ms.
- [x] Broker routing max ms.
- [x] Dashboard snapshot max ms.
- [x] Replay batch max ms.
- [x] Scenario lab max ms.
- [x] Data recorder write max ms.
- [x] Audit write max ms.

### Taken

- [x] Maak `src/ops/performanceBudget.js`.
- [x] Meet runtime per module.
- [x] Voeg p50/p95/p99 toe.
- [x] Log budget breach.
- [x] Toon budget breaches in dashboard.
- [x] Disable optional slow modules bij repeated breaches.
- [x] Blokkeer fast execution als critical path te traag is.
- [x] Voeg command `ops:performance-budget`.

### Acceptance criteria

- [x] Je ziet welke module traag is.
- [x] Fast execution wordt niet vertraagd door optionele modules.
- [x] Budget breaches worden historisch traceerbaar.

---

## 15. Safe Degradation Layer

### Doel

Als iets faalt, moet de bot veiliger worden in plaats van gevaarlijk of onduidelijk verder te draaien.

### Degradation rules

- [x] News faalt -> geen news-based entries.
- [x] Neural faalt -> neural influence uit.
- [x] Stream faalt -> fast execution uit.
- [x] Local book faalt -> entries blokkeren of size verlagen.
- [x] REST faalt -> degrade to stream-only waar veilig.
- [x] User stream faalt -> live entries pauzeren.
- [x] Dashboard faalt -> bot blijft veilig draaien, alerts blijven lokaal.
- [x] Audit write faalt -> live entries blokkeren.
- [x] State write faalt -> live entries blokkeren.
- [x] Backup faalt -> warning, geen directe trade block tenzij langdurig.
- [x] Reconcile faalt -> nieuwe live entries blokkeren.
- [x] Metrics faalt -> trading niet blokkeren, wel alert.

### Taken

- [x] Maak `src/ops/safeDegradation.js`.
- [x] Definieer degradation modes.
- [x] Koppel degradation aan policy engine.
- [x] Koppel degradation aan alert routing.
- [x] Toon actieve degradation in dashboard.
- [x] Voeg degradation toe aan incident export.
- [x] Voeg tests toe per failure.
- [x] Voeg recovery condition toe per degradation.
- [x] Maak command `ops:degradation-status`.

### Acceptance criteria

- [x] Fouten leiden tot veiliger gedrag.
- [x] Degradation is zichtbaar.
- [x] Recovery is expliciet en auditbaar.
- [x] Hard critical failures blokkeren live entries.

---

## 16. Implementatieprioriteit

### Eerst bouwen

- [x] Central Policy Engine.
- [x] Broker Router.
- [x] Liquidity Score per Coin.
- [x] Safe Degradation Layer.
- [x] Performance Budget per Module.

### Daarna bouwen

- [x] Multi-Exchange Adapter Layer.
- [x] Multi-Account Support.
- [x] Data Lake / Feature Store v2.
- [x] Model Cards.
- [x] SLA / Reliability Targets.

### Later bouwen

- [x] Prometheus / Metrics Export.
- [x] Scenario Lab.
- [x] Bot Coach.
- [x] Trade Replay Visual Timeline.
- [x] Auto Documentation Generator.

---

## 17. Eindcontrole

Deze roadmap is klaar wanneer:

- [x] Exchange-specific code achter adapters zit.
- [x] Brokerkeuze centraal en auditbaar is.
- [x] Policies consistent `allow`, `warn`, `block` of `requires_approval` teruggeven.
- [x] Slechte liquiditeit entries kan blokkeren.
- [x] Safe degradation live entries kan pauzeren bij kritieke fouten.
- [x] Metrics optioneel geëxporteerd kunnen worden.
- [x] Data lineage duidelijk is voor training/replay.
- [x] Model cards bestaan voor actieve modellen.
- [x] Performance bottlenecks meetbaar zijn.
- [x] Operator veilige coaching krijgt in gewone taal.
