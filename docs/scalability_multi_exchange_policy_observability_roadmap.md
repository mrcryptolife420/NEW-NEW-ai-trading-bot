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

- [ ] `getExchangeInfo()`
- [ ] `getSymbolRules(symbol)`
- [ ] `getBalance()`
- [ ] `getTicker(symbol)`
- [ ] `getOrderBook(symbol)`
- [ ] `getKlines(symbol, interval, limit)`
- [ ] `placeOrder(order)`
- [ ] `cancelOrder(orderId)`
- [ ] `getOpenOrders(symbol)`
- [ ] `getOrderStatus(orderId)`
- [ ] `getRecentFills(symbol)`
- [ ] `createUserStream()`
- [ ] `subscribeMarketStream(symbols)`
- [ ] `getRateLimitState()`
- [ ] `getHealth()`

### Taken

- [ ] Maak generieke exchange adapter interface.
- [ ] Verplaats Binance-specifieke normalisatie achter Binance adapter.
- [ ] Maak paper adapter met dezelfde interface.
- [ ] Maak synthetic adapter voor tests en training mode.
- [ ] Normaliseer order response.
- [ ] Normaliseer balances.
- [ ] Normaliseer fees.
- [ ] Normaliseer symbol rules.
- [ ] Normaliseer order book data.
- [ ] Normaliseer exchange error codes.
- [ ] Normaliseer rate-limit status.
- [ ] Voeg exchange capability matrix toe.
- [ ] Toon actieve exchange in dashboard/API.
- [ ] Voeg config toe: `EXCHANGE_PROVIDER=binance`.

### Acceptance criteria

- [ ] De rest van de bot gebruikt niet direct Binance client voor nieuwe logic.
- [ ] Paper/synthetic/live gebruiken dezelfde adaptervorm.
- [ ] Nieuwe exchange kan worden toegevoegd zonder risk manager te herschrijven.
- [ ] Exchange-specific quirks blijven binnen adapter.

---

## 2. Multi-Account Support

### Doel

Aparte accounts/profielen kunnen gebruiken voor paper, demo, live-small, live-main en neural sandbox.

### Accountprofielen

- [ ] `paper`
- [ ] `binance_demo`
- [ ] `live_small`
- [ ] `live_main`
- [ ] `neural_sandbox`
- [ ] `research_only`
- [ ] `operator_training`

### Taken

- [ ] Maak `src/accounts/accountProfileRegistry.js`.
- [ ] Maak account-level config.
- [ ] Maak account-level risk budget.
- [ ] Maak account-level API key reference.
- [ ] Maak account-level exchange provider.
- [ ] Maak account-level broker mode.
- [ ] Maak account-level dashboard status.
- [ ] Maak account-level PnL.
- [ ] Maak account-level exposure.
- [ ] Maak account-level neural permissions.
- [ ] Maak account-level fast execution permissions.
- [ ] Blokkeer neural live autonomy op main account tenzij expliciet toegestaan.
- [ ] Toon accountprofiel per open positie.
- [ ] Log accountprofiel in audit events.

### Acceptance criteria

- [ ] Neural experiments kunnen naar sandbox-account worden beperkt.
- [ ] Live-main kan conservatiever zijn dan live-small.
- [ ] Accountprofielen lekken geen secrets naar dashboard/logs.

---

## 3. Broker Router

### Doel

Een centrale router bepaalt waar een trade heen mag: paper, demo, sandbox, live-small of live-main.

### Nieuw bestand

```txt
src/execution/brokerRouter.js
```

### Routebeslissingen

- [ ] High-confidence normal trade -> configured broker.
- [ ] Low-confidence trade -> shadow/paper.
- [ ] Neural experiment -> sandbox/paper.
- [ ] New strategy -> paper-only.
- [ ] Canary strategy -> live-small only.
- [ ] High-risk symbol -> paper or blocked.
- [ ] Manual approval required -> intent approval queue.
- [ ] Exchange degraded -> paper/shadow/block.
- [ ] Policy breach -> block.

### Taken

- [ ] Maak broker route request object.
- [ ] Maak broker route decision object.
- [ ] Koppel route aan policy engine.
- [ ] Log elke routebeslissing.
- [ ] Voeg route reason codes toe.
- [ ] Toon route in dashboard.
- [ ] Voeg route toe aan trade forensics.
- [ ] Voeg tests toe voor neural sandbox routing.
- [ ] Voeg tests toe voor live-main blocking.
- [ ] Voeg tests toe voor degraded exchange fallback.

### Acceptance criteria

- [ ] Geen model/strategie kiest zelf direct broker.
- [ ] Elke brokerkeuze is auditbaar.
- [ ] Live-main wordt alleen gebruikt als route policy dat toestaat.

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

- [ ] Maak duidelijke datasetlagen.
- [ ] Sla raw exchange data apart op.
- [ ] Sla cleaned data apart op.
- [ ] Sla feature frames apart op.
- [ ] Sla labels apart op.
- [ ] Sla replay outputs apart op.
- [ ] Sla model-ready datasets apart op.
- [ ] Maak dataset manifest.
- [ ] Maak dataset hash.
- [ ] Maak dataset lineage.
- [ ] Maak dataset quality score.
- [ ] Maak dataset compaction job.
- [ ] Maak dataset export/import.
- [ ] Maak archive integrity check.
- [ ] Voeg command toe: `data:lake-report`.

### Acceptance criteria

- [ ] Training dataset is reproduceerbaar.
- [ ] Replay dataset is reproduceerbaar.
- [ ] Raw data blijft gescheiden van model-ready data.
- [ ] Dataset lineage is zichtbaar in model registry.

---

## 5. Model Cards

### Doel

Voor elk model een duidelijk “paspoort” maken.

### Model card velden

- [ ] Model ID.
- [ ] Model version.
- [ ] Model type.
- [ ] Doel van model.
- [ ] Training dataset hash.
- [ ] Feature schema version.
- [ ] Normalizer version.
- [ ] Trained at.
- [ ] Training window.
- [ ] Symbols in training.
- [ ] Regimes in training.
- [ ] Strategy families in training.
- [ ] Metrics.
- [ ] Calibration.
- [ ] Known weaknesses.
- [ ] Allowed modes.
- [ ] Disallowed modes.
- [ ] Live permissions.
- [ ] Rollback target.
- [ ] Retirement condition.
- [ ] Operator notes.

### Taken

- [ ] Maak `src/models/modelCard.js`.
- [ ] Genereer model card na training.
- [ ] Toon model card in dashboard/API.
- [ ] Export model card naar Markdown/JSON.
- [ ] Blokkeer promotie zonder model card.
- [ ] Voeg model card toe aan incident export.

### Acceptance criteria

- [ ] Elk actief model heeft model card.
- [ ] Operator kan zien waar model wel/niet voor bedoeld is.
- [ ] Live influence vereist model card met live permissions.

---

## 6. Central Policy Engine

### Doel

Safety- en governance-regels centraliseren in één policy engine.

### Nieuw bestand

```txt
src/policy/policyEngine.js
```

### Policy types

- [ ] Live trading policy.
- [ ] Neural influence policy.
- [ ] Fast execution policy.
- [ ] Broker routing policy.
- [ ] Data quality policy.
- [ ] Exchange safety policy.
- [ ] Operator approval policy.
- [ ] Strategy promotion policy.
- [ ] Account permission policy.
- [ ] Replay-to-paper policy.
- [ ] Paper-to-live policy.
- [ ] Emergency mode policy.

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

- [ ] Maak policy input schema.
- [ ] Maak policy response schema.
- [ ] Maak severity enum.
- [ ] Maak reason code registry.
- [ ] Laat broker router policy engine gebruiken.
- [ ] Laat live gates policy engine gebruiken.
- [ ] Laat neural autonomy governor policy engine gebruiken.
- [ ] Laat fast execution policy engine gebruiken.
- [ ] Voeg policy decision toe aan audit.
- [ ] Toon policy decision in dashboard.
- [ ] Voeg policy tests toe.

### Acceptance criteria

- [ ] Safety decisions zijn consistent over modules.
- [ ] Policy output is menselijk en machine-readable.
- [ ] Geen module implementeert eigen stille live override.

---

## 7. SLA / Reliability Targets

### Doel

Meetbaar maken of de bot gezond genoeg is om te handelen.

### SLA’s

- [ ] Market data freshness SLA.
- [ ] Stream uptime SLA.
- [ ] User stream uptime SLA.
- [ ] REST success rate SLA.
- [ ] Order ack latency SLA.
- [ ] Fill latency SLA.
- [ ] Dashboard API latency SLA.
- [ ] State write success SLA.
- [ ] Backup freshness SLA.
- [ ] Reconcile freshness SLA.
- [ ] Audit write success SLA.
- [ ] Neural inference latency SLA.
- [ ] Fast execution latency SLA.

### Taken

- [ ] Maak `src/ops/reliabilityTargets.js`.
- [ ] Definieer targets per mode.
- [ ] Maak SLA checker.
- [ ] Toon SLA status in dashboard.
- [ ] Maak command `ops:sla-report`.
- [ ] Pauzeer entries bij critical SLA breach.
- [ ] Verlaag risk bij warning SLA breach.
- [ ] Voeg SLA breach toe aan audit.
- [ ] Voeg SLA breach toe aan incident export.

### Acceptance criteria

- [ ] Bot weet wanneer infrastructuur onbetrouwbaar is.
- [ ] Entries worden geblokkeerd bij kritieke reliability breach.
- [ ] SLA status is zichtbaar en historisch traceerbaar.

---

## 8. Prometheus / Metrics Export

### Doel

De bot extern monitorbaar maken met standaard metrics.

### Endpoint

```txt
GET /metrics
```

### Metrics

- [ ] Bot mode.
- [ ] Bot running status.
- [ ] Open positions count.
- [ ] Paper PnL.
- [ ] Live PnL.
- [ ] Unrealized exposure.
- [ ] Stream freshness.
- [ ] REST request count.
- [ ] REST error count.
- [ ] Rate limit pressure.
- [ ] Order latency.
- [ ] Fill latency.
- [ ] Risk blocker count.
- [ ] Fast queue size.
- [ ] Neural influence count.
- [ ] Neural rollback count.
- [ ] Audit write failures.
- [ ] Backup age.
- [ ] Reconcile age.
- [ ] Dashboard response time.
- [ ] Event loop lag.
- [ ] Memory usage.
- [ ] Disk usage.

### Taken

- [ ] Maak `src/ops/metricsExporter.js`.
- [ ] Voeg `/metrics` endpoint toe.
- [ ] Zorg dat metrics geen secrets bevatten.
- [ ] Voeg config toe: `METRICS_ENABLED=false`.
- [ ] Voeg config toe: `METRICS_BIND_LOCAL_ONLY=true`.
- [ ] Voeg voorbeeld Grafana dashboard JSON toe.
- [ ] Voeg tests toe voor secret redaction.

### Acceptance criteria

- [ ] Monitoring kan zonder dashboard scraping.
- [ ] Metrics endpoint lekt geen gevoelige data.
- [ ] Metrics is opt-in.

---

## 9. Scenario Lab

### Doel

Experimenten kunnen draaien zonder runtime/trading state te wijzigen.

### Nieuw concept

```txt
Scenario = market data + config overrides + policy overrides + strategy/model variant + execution assumptions
```

### Taken

- [ ] Maak `src/research/scenarioLab.js`.
- [ ] Maak scenario schema.
- [ ] Maak scenario builder.
- [ ] Ondersteun custom market shock.
- [ ] Ondersteun custom fee/slippage model.
- [ ] Ondersteun custom risk settings.
- [ ] Ondersteun custom strategy.
- [ ] Ondersteun custom neural profile.
- [ ] Run scenario offline.
- [ ] Vergelijk scenario met baseline.
- [ ] Export scenario report.
- [ ] Voeg command toe: `research:scenario-run`.
- [ ] Voeg command toe: `research:scenario-compare`.

### Acceptance criteria

- [ ] Scenario lab wijzigt geen runtime state.
- [ ] Scenario lab gebruikt geen LiveBroker.
- [ ] Scenario resultaten zijn reproduceerbaar.

---

## 10. Bot Coach

### Doel

Een operator-begeleider die uitlegt wat veilig de volgende actie is.

### Taken

- [ ] Maak `src/ops/botCoach.js`.
- [ ] Verzamel blockers.
- [ ] Verzamel alerts.
- [ ] Verzamel performance issues.
- [ ] Verzamel data quality issues.
- [ ] Verzamel exchange issues.
- [ ] Verzamel neural proposals.
- [ ] Genereer korte coaching summary.
- [ ] Genereer next best safe action.
- [ ] Link naar relevante runbook.
- [ ] Toon coach summary in dashboard.
- [ ] Maak command `ops:coach`.

### Voorbeeld

```txt
De bot handelt weinig omdat 73% van near-threshold setups wordt geblokkeerd door execution cost.
Veilige actie: controleer spread/slippage report en filter tijdelijk minder liquide pairs.
```

### Acceptance criteria

- [ ] Coach opent nooit trades.
- [ ] Coach verhoogt nooit risk.
- [ ] Coach geeft alleen uitleg en veilige acties.

---

## 11. Liquidity Score per Coin

### Doel

Niet alleen volume meten, maar echte tradebaarheid.

### Scorecomponenten

- [ ] Spread score.
- [ ] Depth score.
- [ ] Slippage score.
- [ ] Order book stability.
- [ ] Fill reliability.
- [ ] Volatility-adjusted liquidity.
- [ ] Liquidity trend.
- [ ] Time-of-day liquidity.
- [ ] Maker fill chance.
- [ ] Partial fill risk.
- [ ] Market impact risk.

### Taken

- [ ] Maak `src/market/liquidityScore.js`.
- [ ] Bereken score per symbol.
- [ ] Bereken score per session.
- [ ] Gebruik score in universe selection.
- [ ] Gebruik score in risk sizing.
- [ ] Gebruik score in execution planner.
- [ ] Gebruik score in neural features.
- [ ] Blokkeer entries bij te lage score.
- [ ] Verlaag size bij medium score.
- [ ] Toon liquidity score in dashboard.
- [ ] Voeg liquidity trend toe aan reports.

### Acceptance criteria

- [ ] Bot vermijdt slecht uitvoerbare coins.
- [ ] Liquidity score verklaart execution blockers.
- [ ] Liquidity score wordt historisch gemeten.

---

## 12. Trade Replay Video / Visual Timeline

### Doel

Visueel kunnen zien wat er gebeurde tijdens een trade of replay.

### Timeline lagen

- [ ] Candle chart.
- [ ] Entry marker.
- [ ] Stop marker.
- [ ] Take-profit marker.
- [ ] Exit marker.
- [ ] Scale-out markers.
- [ ] Neural score timeline.
- [ ] Risk score timeline.
- [ ] Execution score timeline.
- [ ] Spread timeline.
- [ ] Order book pressure timeline.
- [ ] Data freshness timeline.
- [ ] Alerts timeline.
- [ ] Policy decisions timeline.

### Taken

- [ ] Maak replay timeline data contract.
- [ ] Maak endpoint voor timeline data.
- [ ] Maak dashboard component.
- [ ] Ondersteun export naar JSON.
- [ ] Ondersteun screenshot/export optioneel.
- [ ] Link timeline aan trade forensics.
- [ ] Link timeline aan replay runs.

### Acceptance criteria

- [ ] Operator kan trade visueel debuggen.
- [ ] Timeline bevat geen secrets.
- [ ] Timeline werkt voor paper, live en replay.

---

## 13. Auto Documentation Generator

### Doel

Documentatie automatisch genereren uit actieve config en modules.

### Taken

- [ ] Maak `src/docs/autoDocsGenerator.js`.
- [ ] Genereer active config summary.
- [ ] Genereer active strategies summary.
- [ ] Genereer risk settings summary.
- [ ] Genereer exchange settings summary.
- [ ] Genereer neural status summary.
- [ ] Genereer dashboard route summary.
- [ ] Genereer CLI command summary.
- [ ] Genereer operator quickstart.
- [ ] Genereer safety summary.
- [ ] Redact secrets.
- [ ] Maak command `docs:generate`.
- [ ] Schrijf output naar `generated-docs/`.

### Acceptance criteria

- [ ] Docs blijven dichter bij echte config.
- [ ] Secrets worden nooit in docs gezet.
- [ ] Operator quickstart kan automatisch worden vernieuwd.

---

## 14. Performance Budget per Module

### Doel

Elke module krijgt een maximale runtime zodat snelle trading niet traag wordt door zware berekeningen.

### Budgetten

- [ ] Feature calculation max ms.
- [ ] Risk check max ms.
- [ ] Neural inference max ms.
- [ ] Policy engine max ms.
- [ ] Broker routing max ms.
- [ ] Dashboard snapshot max ms.
- [ ] Replay batch max ms.
- [ ] Scenario lab max ms.
- [ ] Data recorder write max ms.
- [ ] Audit write max ms.

### Taken

- [ ] Maak `src/ops/performanceBudget.js`.
- [ ] Meet runtime per module.
- [ ] Voeg p50/p95/p99 toe.
- [ ] Log budget breach.
- [ ] Toon budget breaches in dashboard.
- [ ] Disable optional slow modules bij repeated breaches.
- [ ] Blokkeer fast execution als critical path te traag is.
- [ ] Voeg command `ops:performance-budget`.

### Acceptance criteria

- [ ] Je ziet welke module traag is.
- [ ] Fast execution wordt niet vertraagd door optionele modules.
- [ ] Budget breaches worden historisch traceerbaar.

---

## 15. Safe Degradation Layer

### Doel

Als iets faalt, moet de bot veiliger worden in plaats van gevaarlijk of onduidelijk verder te draaien.

### Degradation rules

- [ ] News faalt -> geen news-based entries.
- [ ] Neural faalt -> neural influence uit.
- [ ] Stream faalt -> fast execution uit.
- [ ] Local book faalt -> entries blokkeren of size verlagen.
- [ ] REST faalt -> degrade to stream-only waar veilig.
- [ ] User stream faalt -> live entries pauzeren.
- [ ] Dashboard faalt -> bot blijft veilig draaien, alerts blijven lokaal.
- [ ] Audit write faalt -> live entries blokkeren.
- [ ] State write faalt -> live entries blokkeren.
- [ ] Backup faalt -> warning, geen directe trade block tenzij langdurig.
- [ ] Reconcile faalt -> nieuwe live entries blokkeren.
- [ ] Metrics faalt -> trading niet blokkeren, wel alert.

### Taken

- [ ] Maak `src/ops/safeDegradation.js`.
- [ ] Definieer degradation modes.
- [ ] Koppel degradation aan policy engine.
- [ ] Koppel degradation aan alert routing.
- [ ] Toon actieve degradation in dashboard.
- [ ] Voeg degradation toe aan incident export.
- [ ] Voeg tests toe per failure.
- [ ] Voeg recovery condition toe per degradation.
- [ ] Maak command `ops:degradation-status`.

### Acceptance criteria

- [ ] Fouten leiden tot veiliger gedrag.
- [ ] Degradation is zichtbaar.
- [ ] Recovery is expliciet en auditbaar.
- [ ] Hard critical failures blokkeren live entries.

---

## 16. Implementatieprioriteit

### Eerst bouwen

- [ ] Central Policy Engine.
- [ ] Broker Router.
- [ ] Liquidity Score per Coin.
- [ ] Safe Degradation Layer.
- [ ] Performance Budget per Module.

### Daarna bouwen

- [ ] Multi-Exchange Adapter Layer.
- [ ] Multi-Account Support.
- [ ] Data Lake / Feature Store v2.
- [ ] Model Cards.
- [ ] SLA / Reliability Targets.

### Later bouwen

- [ ] Prometheus / Metrics Export.
- [ ] Scenario Lab.
- [ ] Bot Coach.
- [ ] Trade Replay Visual Timeline.
- [ ] Auto Documentation Generator.

---

## 17. Eindcontrole

Deze roadmap is klaar wanneer:

- [ ] Exchange-specific code achter adapters zit.
- [ ] Brokerkeuze centraal en auditbaar is.
- [ ] Policies consistent `allow`, `warn`, `block` of `requires_approval` teruggeven.
- [ ] Slechte liquiditeit entries kan blokkeren.
- [ ] Safe degradation live entries kan pauzeren bij kritieke fouten.
- [ ] Metrics optioneel geëxporteerd kunnen worden.
- [ ] Data lineage duidelijk is voor training/replay.
- [ ] Model cards bestaan voor actieve modellen.
- [ ] Performance bottlenecks meetbaar zijn.
- [ ] Operator veilige coaching krijgt in gewone taal.
