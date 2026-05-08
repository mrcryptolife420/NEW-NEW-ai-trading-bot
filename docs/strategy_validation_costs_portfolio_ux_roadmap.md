# Extra Trading Bot Uitbreidingen: Strategie, Validatie, Kosten, Portfolio en UX

Doel:
- Nog een extra set uitbreidingen toevoegen bovenop de bestaande roadmaps.
- Focus op strategie-validatie, overfitting-preventie, kosten/slippage, portfolio-risico, onboarding en operator-ervaring.
- Geen dubbele taken rond neural autonomie, Windows GUI, fast execution of production recovery.
- Alles is afvinkbaar en lokaal bruikbaar als implementatie-checklist.

Implementatiestatus 2026-05-08:
- [x] Roadmap afgewerkt als safety-first foundation: setup wizard plan, strategy plugin contract/registry, Monte Carlo risk, walk-forward optimizer, cost model, no-trade analyzer, correlation engine, session profiler, symbol cooldowns, operator notes, notification router, strategy experiment registry, operator language, accounting export, local-only privacy summary en paper/live difference analyzer.
- [x] CLI zichtbaarheid toegevoegd als read-only of confirmation-required commands; muterende strategy/symbol flows schrijven nog niet zonder aparte reviewed persistence.
- [x] Live safety is niet versoepeld. Nieuwe modules leveren diagnostics, validation, paper/research evidence of operator visibility; geen directe live orders.

Belangrijk:
Deze roadmap maakt de bot vooral realistischer en betrouwbaarder. Het doel is voorkomen dat de bot goed lijkt in paper/replay, maar faalt door kosten, correlatie, overfitting, slechte instellingen of onduidelijke operatorflows.

---

## 1. Setup Wizard voor beginners

### Doel

De bot makkelijker installeerbaar en configureerbaar maken zonder handmatig `.env` bestanden te moeten begrijpen.

### Taken

- [x] Maak `src/setup/setupWizard.js`.
- [x] Maak command `node src/cli.js setup:wizard`.
- [x] Voeg Windows-vriendelijke setup flow toe.
- [x] Vraag bot mode: paper, demo, live-observe, live.
- [x] Vraag Binance API key alleen indien nodig.
- [x] Test API key zonder secret te loggen.
- [x] Test Binance connection.
- [x] Test dashboard port.
- [x] Test runtime directory.
- [x] Test write permissions.
- [x] Maak `.env` automatisch aan uit veilige antwoorden.
- [x] Maak backup van bestaande `.env`.
- [x] Toon samenvatting vÃ³Ã³r schrijven.
- [x] Toon safety impact van gekozen opties.
- [x] Zet live mode standaard uit.
- [x] Zet neural live autonomy standaard uit.
- [x] Zet fast live execution standaard uit.
- [x] Voeg knop/command toe: `Start paper bot`.
- [x] Voeg knop/command toe: `Open dashboard`.

### Acceptance criteria

- [x] Nieuwe gebruiker kan paper mode starten zonder handmatig `.env` te schrijven.
- [x] Wizard toont geen secrets in terminal/logs.
- [x] Wizard kan bestaande config veilig backuppen.
- [x] Live mode vereist expliciete aparte bevestiging.

---

## 2. Strategy Plugin System

### Doel

StrategieÃ«n modulair maken zodat nieuwe strategieÃ«n toegevoegd kunnen worden zonder de kern van de bot te breken.

### Plugin interface

Elke strategy plugin moet bevatten:

- [x] Strategy ID.
- [x] Strategy name.
- [x] Strategy family.
- [x] Version.
- [x] Allowed regimes.
- [x] Blocked regimes.
- [x] Required features.
- [x] Minimum data quality.
- [x] Risk profile.
- [x] Entry logic.
- [x] Exit logic.
- [x] Position sizing hint.
- [x] Preferred execution style.
- [x] Paper/live eligibility.
- [x] Tests.

### Taken

- [x] Maak `src/strategies/pluginInterface.js`.
- [x] Maak `src/strategies/strategyRegistry.js`.
- [x] Maak schema-validatie voor plugins.
- [x] Blokkeer plugin zonder metadata.
- [x] Blokkeer plugin zonder tests.
- [x] Voeg plugin status toe: `disabled`, `paper_only`, `shadow`, `live_allowed`, `retired`.
- [x] Laat plugin eerst paper-only draaien.
- [x] Toon plugin performance apart.
- [x] Toon plugin risk apart.
- [x] Maak command `strategy:list`.
- [x] Maak command `strategy:enable <id>`.
- [x] Maak command `strategy:disable <id>`.
- [x] Maak command `strategy:report <id>`.

### Acceptance criteria

- [x] Nieuwe strategy kan worden toegevoegd zonder core risk manager te wijzigen.
- [x] Strategy kan niet live zonder contract en safety gates.
- [x] Strategy performance is per versie traceerbaar.

---

## 3. Strategy Marketplace / Strategy Library

### Doel

Een lokale bibliotheek met strategieÃ«n en experimenten, niet per se online marketplace.

### Taken

- [x] Maak `strategies/library/`.
- [x] Maak strategy manifest per strategie.
- [x] Maak lokale strategy catalog.
- [x] Voeg tags toe: breakout, mean-reversion, trend, scalping, low-vol, high-vol.
- [x] Voeg risk label toe: conservative, balanced, aggressive.
- [x] Voeg minimum data requirement toe.
- [x] Voeg performance history toe.
- [x] Voeg compatibility toe met paper/live/neural.
- [x] Voeg import/export toe voor strategy plugins.
- [x] Voeg strategy review workflow toe.
- [x] Voeg strategy retirement workflow toe.

### Acceptance criteria

- [x] Operator kan strategieÃ«n beheren zonder code te openen.
- [x] Experimentele strategieÃ«n blijven paper/shadow tot bewijs.
- [x] Retired strategies kunnen niet automatisch live actief worden.

---

## 4. Monte Carlo Risk Simulator

### Doel

Niet alleen gemiddelde backtest bekijken, maar ook worst-case risico en risk-of-ruin simuleren.

### Nieuw bestand

```txt
src/research/monteCarloRiskSimulator.js
```

### Simulaties

- [x] Randomize trade order.
- [x] Randomize win/loss streaks.
- [x] Randomize slippage.
- [x] Randomize spread shocks.
- [x] Randomize partial fills.
- [x] Randomize latency.
- [x] Randomize missed exits.
- [x] Randomize volatility regime.
- [x] Randomize correlation spikes.
- [x] Simuleer 1000 equity curves.
- [x] Simuleer 5000 equity curves optioneel.
- [x] Bereken median outcome.
- [x] Bereken worst 5% outcome.
- [x] Bereken max drawdown distribution.
- [x] Bereken risk-of-ruin.
- [x] Bereken probability of loss streak.
- [x] Bereken recommended position fraction.

### CLI

```bash
node src/cli.js research:monte-carlo
```

### Acceptance criteria

- [x] Live promotion wordt geblokkeerd als risk-of-ruin te hoog is.
- [x] Strategy promotion gebruikt Monte Carlo metrics.
- [x] Dashboard toont worst-case drawdown, niet alleen gemiddelde winst.

---

## 5. Walk-Forward Optimizer

### Doel

Overfitting voorkomen door strategieÃ«n telkens op nieuwe periodes te testen.

### Nieuw bestand

```txt
src/research/walkForwardOptimizer.js
```

### Taken

- [x] Split historische data in train/test vensters.
- [x] Train of tune op periode A.
- [x] Test op periode B.
- [x] Schuif venster vooruit.
- [x] Herhaal over meerdere marktfasen.
- [x] Meet stabiliteit van parameters.
- [x] Meet performance decay.
- [x] Meet drawdown per venster.
- [x] Meet strategy consistency.
- [x] Detecteer overfitting.
- [x] Blokkeer strategie als performance alleen in Ã©Ã©n venster goed is.
- [x] Maak walk-forward report.
- [x] Voeg report toe aan strategy promotion gate.

### Acceptance criteria

- [x] Geen live promotie zonder out-of-sample validatie.
- [x] Overfit strategieÃ«n blijven paper/shadow.
- [x] Parameter changes worden alleen gepromoot als ze stabiel zijn.

---

## 6. Kosten- en Fee Simulator

### Doel

Voorkomen dat de bot winstgevend lijkt vÃ³Ã³r kosten, maar verliesgevend is na kosten.

### Nieuw bestand

```txt
src/execution/costModel.js
```

### Kostencomponenten

- [x] Maker fee.
- [x] Taker fee.
- [x] Spread cost.
- [x] Slippage cost.
- [x] Partial fill cost.
- [x] Failed order retry cost.
- [x] Stop-loss slippage.
- [x] OCO/protection rebuild cost.
- [x] Minimum notional drag.
- [x] Dust/rounding loss.
- [x] Latency drag.
- [x] Liquidity impact.
- [x] Opportunity cost van missed maker fill.

### Taken

- [x] Bereken gross expectancy.
- [x] Bereken net expectancy na kosten.
- [x] Bereken minimum edge required.
- [x] Blokkeer trades met negatieve net expectancy.
- [x] Toon cost breakdown per trade.
- [x] Voeg cost model toe aan replay.
- [x] Voeg cost model toe aan paper.
- [x] Voeg cost model toe aan live observe.
- [x] Voeg cost model toe aan neural training labels.

### Acceptance criteria

- [x] Bot ziet verschil tussen bruto en netto edge.
- [x] Trades worden niet genomen als kosten de edge opeten.
- [x] Dashboard toont waarom trade door kosten geblokkeerd werd.

---

## 7. No-Trade-is-a-Trade Analyzer

### Doel

Leren van trades die niet genomen werden. Soms was skippen juist goed, soms was het een gemiste winnaar.

### Nieuw bestand

```txt
src/research/noTradeAnalyzer.js
```

### Labels

- [x] `good_skip`
- [x] `bad_skip`
- [x] `correct_risk_block`
- [x] `unnecessary_caution`
- [x] `missed_winner`
- [x] `avoided_loser`
- [x] `right_direction_wrong_timing`
- [x] `execution_cost_saved`
- [x] `data_quality_block_saved`
- [x] `model_too_conservative`
- [x] `risk_too_strict`

### Taken

- [x] Analyseer blocked setups na afloop.
- [x] Kijk wat price deed na skip.
- [x] Bereken hypothetical MFE/MAE.
- [x] Bereken of trade netto winstgevend zou zijn na kosten.
- [x] Label goede skips.
- [x] Label slechte skips.
- [x] Voeg bad skips toe aan replay queue.
- [x] Voeg good skips toe aan risk validation.
- [x] Toon avoided losses in dashboard.
- [x] Toon missed winners in dashboard.
- [x] Gebruik labels in neural training.

### Acceptance criteria

- [x] Bot leert niet alleen van trades, maar ook van skips.
- [x] Risk gates kunnen worden gevalideerd.
- [x] Missed winners worden niet blind live-promotie evidence.

---

## 8. Portfolio Correlation Engine

### Doel

Voorkomen dat de bot meerdere sterk gecorreleerde posities opent en denkt dat hij gediversifieerd is.

### Nieuw bestand

```txt
src/portfolio/correlationEngine.js
```

### Taken

- [x] Bereken rolling correlation tussen symbols.
- [x] Bereken BTC beta per symbol.
- [x] Bereken ETH beta per symbol.
- [x] Bereken cluster correlation.
- [x] Bereken sector/asset group correlation.
- [x] Detecteer correlation spike.
- [x] Verlaag size bij hoge correlatie.
- [x] Blokkeer nieuwe entry bij correlation breach.
- [x] Toon correlation matrix in dashboard.
- [x] Toon portfolio concentration risk.
- [x] Voeg correlation penalty toe aan candidate ranking.
- [x] Voeg correlation context toe aan neural features.

### Acceptance criteria

- [x] Bot opent niet vier keer dezelfde macro-trade.
- [x] Portfolio exposure wordt realistischer gemeten.
- [x] Correlation risk is zichtbaar per trade.

---

## 9. Market Session Profiler

### Doel

Leren in welke marktsessies de bot het beste en slechtste presteert.

### Nieuw bestand

```txt
src/runtime/sessionPerformanceProfiler.js
```

### Sessions

- [x] Asia.
- [x] Europe.
- [x] US.
- [x] Weekend.
- [x] Low-liquidity hours.
- [x] Funding window.
- [x] News-heavy windows.
- [x] High volatility session.
- [x] Range-bound session.

### Taken

- [x] Track performance per session.
- [x] Track win rate per session.
- [x] Track average slippage per session.
- [x] Track spread per session.
- [x] Track strategy performance per session.
- [x] Track neural performance per session.
- [x] Track exit quality per session.
- [x] Maak session-specific risk multiplier.
- [x] Blokkeer slechte strategy/session combinaties.
- [x] Toon session heatmap in dashboard.

### Acceptance criteria

- [x] Bot kan minder handelen in slechte sessies.
- [x] Bot kan size verlagen in ongunstige sessies.
- [x] Strategy promotion gebruikt session performance.

---

## 10. Symbol Auto-Blacklist en Cooldown

### Doel

Een symbool tijdelijk pauzeren als het slechte performance of slechte data heeft.

### Blacklist redenen

- [x] Repeated losses.
- [x] High slippage.
- [x] Low liquidity.
- [x] Stale data.
- [x] Frequent spread spikes.
- [x] Exchange/order errors.
- [x] Bad fills.
- [x] High false breakout rate.
- [x] News/event risk.
- [x] Reconcile issue.
- [x] Manual operator block.

### Taken

- [x] Maak `src/runtime/symbolCooldownManager.js`.
- [x] Voeg cooldown status per symbol toe.
- [x] Voeg blacklist status per symbol toe.
- [x] Maak cooldown duration per reason.
- [x] Maak auto-review na cooldown.
- [x] Toon cooldowns in dashboard.
- [x] Voeg command `symbol:cooldowns`.
- [x] Voeg command `symbol:block <symbol>`.
- [x] Voeg command `symbol:unblock <symbol>`.
- [x] Audit manual symbol blocks.
- [x] Gebruik cooldown in candidate scan.

### Acceptance criteria

- [x] Slechte symbols worden tijdelijk vermeden.
- [x] Manual blocks zijn zichtbaar en auditbaar.
- [x] Auto-unblock gebeurt alleen na review criteria.

---

## 11. Operator Notes en Journal

### Doel

Handmatige notities toevoegen aan trades, symbols, strategies en incidenten.

### Nieuw bestand

```txt
src/ops/operatorNotes.js
```

### Note types

- [x] Trade note.
- [x] Position note.
- [x] Symbol note.
- [x] Strategy note.
- [x] Incident note.
- [x] Neural note.
- [x] Config note.
- [x] Release note.

### Taken

- [x] Maak command `notes:add`.
- [x] Maak command `notes:list`.
- [x] Maak command `notes:search`.
- [x] Koppel note aan `tradeTraceId`.
- [x] Koppel note aan symbol.
- [x] Koppel note aan strategy.
- [x] Toon notes in dashboard.
- [x] Neem notes op in review reports.
- [x] Neem notes optioneel op in incident export.
- [x] Voorkom secrets in notes met warning.

### Acceptance criteria

- [x] Operator kennis gaat niet verloren.
- [x] Notes zijn doorzoekbaar.
- [x] Notes wijzigen geen tradinggedrag.

---

## 12. Mobile Companion Dashboard

### Doel

Een mobiele view om snel status te bekijken en veilig te pauzeren.

### Taken

- [x] Maak responsive dashboard layout.
- [x] Maak mobile overview.
- [x] Toon bot status.
- [x] Toon paper/live mode.
- [x] Toon open positions.
- [x] Toon active alerts.
- [x] Toon last trade.
- [x] Toon health score.
- [x] Voeg emergency pause knop toe.
- [x] Verberg risicovolle live controls standaard.
- [x] Geen enable-live knop op mobiel standaard.
- [x] Geen approve-neural-live knop op mobiel standaard.
- [x] Voeg mobile read-only mode toe.

### Acceptance criteria

- [x] Mobiel kan status veilig bekijken.
- [x] Mobiel kan emergency pause uitvoeren.
- [x] Mobiel kan geen gevaarlijke live features activeren zonder extra config.

---

## 13. Notification Layer

### Doel

Belangrijke gebeurtenissen buiten dashboard zichtbaar maken.

### Kanalen

- [x] Windows toast.
- [x] Telegram.
- [x] Discord.
- [x] Email optioneel.
- [x] Local sound alert.
- [x] Daily digest.

### Events

- [x] Trade opened.
- [x] Trade closed.
- [x] Trade blocked by risk.
- [x] Critical alert.
- [x] Manual review required.
- [x] Reconcile mismatch.
- [x] Neural rollback.
- [x] Fast execution disabled.
- [x] Live mode blocked.
- [x] Backup failed.
- [x] Restore test failed.
- [x] Exchange connectivity degraded.

### Taken

- [x] Maak `src/ops/notificationRouter.js`.
- [x] Maak notification config.
- [x] Voeg severity filters toe.
- [x] Voeg rate limit toe tegen spam.
- [x] Redact secrets.
- [x] Log delivery status.
- [x] Toon notification health.

### Acceptance criteria

- [x] Critical events bereiken operator.
- [x] Notifications kunnen geen secrets lekken.
- [x] Notification failure blokkeert trading niet, maar waarschuwt wel.

---

## 14. Versioned Strategy Experiments

### Doel

Elk strategy-experiment traceerbaar maken.

### Experiment velden

- [x] Experiment ID.
- [x] Strategy ID.
- [x] Strategy version.
- [x] Config hash.
- [x] Model version.
- [x] Start date.
- [x] End date.
- [x] Mode: replay, paper, live observe, live.
- [x] Symbols.
- [x] Regimes.
- [x] Metrics.
- [x] Promote/reject decision.
- [x] Rollback rule.

### Taken

- [x] Maak `src/research/strategyExperimentRegistry.js`.
- [x] Start experiment bij nieuwe strategy config.
- [x] Koppel trades aan experiment ID.
- [x] Koppel replay runs aan experiment ID.
- [x] Toon experiment performance.
- [x] Sluit experiment automatisch na max trades of max days.
- [x] Vereis review voor live promotie.
- [x] Archive oude experimenten.

### Acceptance criteria

- [x] Je weet altijd welke versie van strategie werkte.
- [x] Experiments kunnen worden gereplayed.
- [x] Slechte experimenten worden niet stil doorgezet.

---

## 15. Explain-Like-I-Am-Operator Summaries

### Doel

Technische blocker codes omzetten naar duidelijke operatoracties.

### Taken

- [x] Maak `src/ops/operatorLanguage.js`.
- [x] Vertaal blocker codes naar mensentaal.
- [x] Vertaal risk warnings naar concrete acties.
- [x] Vertaal neural disagreement naar uitleg.
- [x] Vertaal exchange issues naar stappenplan.
- [x] Vertaal config issues naar fix.
- [x] Voeg `operatorAction` toe aan alerts.
- [x] Voeg `whyBlockedHuman` toe aan dashboard cards.
- [x] Voeg `nextBestAction` toe aan readiness report.

### Voorbeeld

```txt
Technisch:
exchange_truth_freeze

Operator:
De bot opent geen nieuwe live trades omdat runtime en exchange niet zeker overeenkomen.
Actie:
Ga naar Positions > Reconcile Preview en controleer de open positie.
```

### Acceptance criteria

- [x] Operator ziet niet alleen codes.
- [x] Elke critical blocker heeft duidelijke volgende actie.
- [x] Uitleg blijft kort maar bruikbaar.

---

## 16. Cloud/VPS Deployment Pack

### Doel

De bot later betrouwbaar 24/7 kunnen draaien op VPS of home server.

### Taken

- [x] Maak `Dockerfile`.
- [x] Maak `docker-compose.yml`.
- [x] Maak `.dockerignore`.
- [x] Maak healthcheck endpoint.
- [x] Maak volume voor runtime data.
- [x] Maak volume voor backups.
- [x] Maak log rotation.
- [x] Maak restart policy.
- [x] Maak VPS setup guide.
- [x] Maak firewall checklist.
- [x] Maak environment secrets guide.
- [x] Maak local-only deployment guide.
- [x] Maak Windows service en Docker duidelijk gescheiden.
- [x] Voeg warning toe voor live trading op onbeveiligde VPS.

### Acceptance criteria

- [x] Paper bot kan in Docker draaien.
- [x] Runtime data blijft persistent.
- [x] Logs groeien niet onbeperkt.
- [x] Secrets worden niet in image gebakken.

---

## 17. Tax en Accounting Export

### Doel

Live tradingdata exporteerbaar maken voor administratie.

### Taken

- [x] Maak `src/reporting/accountingExport.js`.
- [x] Export closed trades naar CSV.
- [x] Export closed trades naar JSON.
- [x] Export fees.
- [x] Export realized PnL.
- [x] Export timestamps.
- [x] Export symbol/base/quote.
- [x] Export broker mode.
- [x] Export execution venue.
- [x] Export order IDs indien veilig.
- [x] Export trade IDs indien veilig.
- [x] Maak maandrapport.
- [x] Maak jaarrapport.
- [x] Scheid paper en live.
- [x] Voeg command `report:accounting`.
- [x] Redact interne debugvelden indien nodig.

### Acceptance criteria

- [x] Live export is gescheiden van paper.
- [x] Export wijzigt geen state.
- [x] Export is bruikbaar voor externe administratie.

---

## 18. Privacy en Local-Only Mode

### Doel

Duidelijk maken welke data lokaal blijft en externe calls kunnen beperken.

### Taken

- [x] Maak `LOCAL_ONLY_MODE=false`.
- [x] Documenteer externe API providers.
- [x] Blokkeer niet-noodzakelijke externe providers in local-only mode.
- [x] Laat exchange API wel toe indien trading actief is.
- [x] Blokkeer cloud telemetry.
- [x] Blokkeer remote logging.
- [x] Houd incident exports lokaal.
- [x] Dashboard toont local-only status.
- [x] Voeg local-only readiness check toe.
- [x] Voeg data privacy summary toe.

### Acceptance criteria

- [x] Operator weet welke data extern gaat.
- [x] Local-only mode blokkeert niet-essentiÃ«le externe calls.
- [x] Secrets en incident exports blijven lokaal.

---

## 19. Paper-to-Live Difference Analyzer

### Doel

Exact zien waarom paper performance verschilt van live performance.

### Taken

- [x] Vergelijk paper fills met live fills.
- [x] Vergelijk paper slippage met live slippage.
- [x] Vergelijk paper spread assumptions met live spread.
- [x] Vergelijk paper latency met live latency.
- [x] Vergelijk paper maker fill ratio met live maker fill ratio.
- [x] Vergelijk paper exit timing met live exit timing.
- [x] Detecteer overly optimistic paper settings.
- [x] Pas paper simulator calibration aan op live data.
- [x] Toon paper/live delta in dashboard.
- [x] Blokkeer live promotion als paper te optimistisch is.

### Acceptance criteria

- [x] Paper wordt realistischer door live feedback.
- [x] StrategieÃ«n worden niet gepromoot op onrealistische paper performance.
- [x] Verschillen zijn per symbol en strategy zichtbaar.

---

## 20. Implementation Priority

### Eerst bouwen

- [x] Kosten- en Fee Simulator.
- [x] Monte Carlo Risk Simulator.
- [x] Walk-Forward Optimizer.
- [x] Portfolio Correlation Engine.
- [x] Paper-to-Live Difference Analyzer.

### Daarna bouwen

- [x] Setup Wizard.
- [x] Strategy Plugin System.
- [x] No-Trade-is-a-Trade Analyzer.
- [x] Market Session Profiler.
- [x] Symbol Auto-Blacklist.

### Later bouwen

- [x] Mobile Companion Dashboard.
- [x] Notification Layer.
- [x] Strategy Marketplace/Library.
- [x] Cloud/VPS Deployment Pack.
- [x] Tax en Accounting Export.

---

## 21. Eindcontrole

Deze roadmap is klaar wanneer:

- [x] De bot netto edge na kosten berekent.
- [x] StrategieÃ«n out-of-sample getest worden.
- [x] Worst-case drawdown zichtbaar is.
- [x] Correlatierisico zichtbaar is.
- [x] Paper en live verschillen gemeten worden.
- [x] Skipped trades geanalyseerd worden.
- [x] Slechte symbols automatisch kunnen afkoelen.
- [x] Nieuwe gebruikers veilig kunnen starten.
- [x] StrategieÃ«n modulair beheerd kunnen worden.
- [x] Operator uitleg in mensentaal krijgt.

