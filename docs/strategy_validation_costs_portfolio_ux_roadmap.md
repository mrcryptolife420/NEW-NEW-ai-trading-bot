# Extra Trading Bot Uitbreidingen: Strategie, Validatie, Kosten, Portfolio en UX

Doel:
- Nog een extra set uitbreidingen toevoegen bovenop de bestaande roadmaps.
- Focus op strategie-validatie, overfitting-preventie, kosten/slippage, portfolio-risico, onboarding en operator-ervaring.
- Geen dubbele taken rond neural autonomie, Windows GUI, fast execution of production recovery.
- Alles is afvinkbaar en lokaal bruikbaar als implementatie-checklist.

Belangrijk:
Deze roadmap maakt de bot vooral realistischer en betrouwbaarder. Het doel is voorkomen dat de bot goed lijkt in paper/replay, maar faalt door kosten, correlatie, overfitting, slechte instellingen of onduidelijke operatorflows.

---

## 1. Setup Wizard voor beginners

### Doel

De bot makkelijker installeerbaar en configureerbaar maken zonder handmatig `.env` bestanden te moeten begrijpen.

### Taken

- [ ] Maak `src/setup/setupWizard.js`.
- [ ] Maak command `node src/cli.js setup:wizard`.
- [ ] Voeg Windows-vriendelijke setup flow toe.
- [ ] Vraag bot mode: paper, demo, live-observe, live.
- [ ] Vraag Binance API key alleen indien nodig.
- [ ] Test API key zonder secret te loggen.
- [ ] Test Binance connection.
- [ ] Test dashboard port.
- [ ] Test runtime directory.
- [ ] Test write permissions.
- [ ] Maak `.env` automatisch aan uit veilige antwoorden.
- [ ] Maak backup van bestaande `.env`.
- [ ] Toon samenvatting vóór schrijven.
- [ ] Toon safety impact van gekozen opties.
- [ ] Zet live mode standaard uit.
- [ ] Zet neural live autonomy standaard uit.
- [ ] Zet fast live execution standaard uit.
- [ ] Voeg knop/command toe: `Start paper bot`.
- [ ] Voeg knop/command toe: `Open dashboard`.

### Acceptance criteria

- [ ] Nieuwe gebruiker kan paper mode starten zonder handmatig `.env` te schrijven.
- [ ] Wizard toont geen secrets in terminal/logs.
- [ ] Wizard kan bestaande config veilig backuppen.
- [ ] Live mode vereist expliciete aparte bevestiging.

---

## 2. Strategy Plugin System

### Doel

Strategieën modulair maken zodat nieuwe strategieën toegevoegd kunnen worden zonder de kern van de bot te breken.

### Plugin interface

Elke strategy plugin moet bevatten:

- [ ] Strategy ID.
- [ ] Strategy name.
- [ ] Strategy family.
- [ ] Version.
- [ ] Allowed regimes.
- [ ] Blocked regimes.
- [ ] Required features.
- [ ] Minimum data quality.
- [ ] Risk profile.
- [ ] Entry logic.
- [ ] Exit logic.
- [ ] Position sizing hint.
- [ ] Preferred execution style.
- [ ] Paper/live eligibility.
- [ ] Tests.

### Taken

- [ ] Maak `src/strategies/pluginInterface.js`.
- [ ] Maak `src/strategies/strategyRegistry.js`.
- [ ] Maak schema-validatie voor plugins.
- [ ] Blokkeer plugin zonder metadata.
- [ ] Blokkeer plugin zonder tests.
- [ ] Voeg plugin status toe: `disabled`, `paper_only`, `shadow`, `live_allowed`, `retired`.
- [ ] Laat plugin eerst paper-only draaien.
- [ ] Toon plugin performance apart.
- [ ] Toon plugin risk apart.
- [ ] Maak command `strategy:list`.
- [ ] Maak command `strategy:enable <id>`.
- [ ] Maak command `strategy:disable <id>`.
- [ ] Maak command `strategy:report <id>`.

### Acceptance criteria

- [ ] Nieuwe strategy kan worden toegevoegd zonder core risk manager te wijzigen.
- [ ] Strategy kan niet live zonder contract en safety gates.
- [ ] Strategy performance is per versie traceerbaar.

---

## 3. Strategy Marketplace / Strategy Library

### Doel

Een lokale bibliotheek met strategieën en experimenten, niet per se online marketplace.

### Taken

- [ ] Maak `strategies/library/`.
- [ ] Maak strategy manifest per strategie.
- [ ] Maak lokale strategy catalog.
- [ ] Voeg tags toe: breakout, mean-reversion, trend, scalping, low-vol, high-vol.
- [ ] Voeg risk label toe: conservative, balanced, aggressive.
- [ ] Voeg minimum data requirement toe.
- [ ] Voeg performance history toe.
- [ ] Voeg compatibility toe met paper/live/neural.
- [ ] Voeg import/export toe voor strategy plugins.
- [ ] Voeg strategy review workflow toe.
- [ ] Voeg strategy retirement workflow toe.

### Acceptance criteria

- [ ] Operator kan strategieën beheren zonder code te openen.
- [ ] Experimentele strategieën blijven paper/shadow tot bewijs.
- [ ] Retired strategies kunnen niet automatisch live actief worden.

---

## 4. Monte Carlo Risk Simulator

### Doel

Niet alleen gemiddelde backtest bekijken, maar ook worst-case risico en risk-of-ruin simuleren.

### Nieuw bestand

```txt
src/research/monteCarloRiskSimulator.js
```

### Simulaties

- [ ] Randomize trade order.
- [ ] Randomize win/loss streaks.
- [ ] Randomize slippage.
- [ ] Randomize spread shocks.
- [ ] Randomize partial fills.
- [ ] Randomize latency.
- [ ] Randomize missed exits.
- [ ] Randomize volatility regime.
- [ ] Randomize correlation spikes.
- [ ] Simuleer 1000 equity curves.
- [ ] Simuleer 5000 equity curves optioneel.
- [ ] Bereken median outcome.
- [ ] Bereken worst 5% outcome.
- [ ] Bereken max drawdown distribution.
- [ ] Bereken risk-of-ruin.
- [ ] Bereken probability of loss streak.
- [ ] Bereken recommended position fraction.

### CLI

```bash
node src/cli.js research:monte-carlo
```

### Acceptance criteria

- [ ] Live promotion wordt geblokkeerd als risk-of-ruin te hoog is.
- [ ] Strategy promotion gebruikt Monte Carlo metrics.
- [ ] Dashboard toont worst-case drawdown, niet alleen gemiddelde winst.

---

## 5. Walk-Forward Optimizer

### Doel

Overfitting voorkomen door strategieën telkens op nieuwe periodes te testen.

### Nieuw bestand

```txt
src/research/walkForwardOptimizer.js
```

### Taken

- [ ] Split historische data in train/test vensters.
- [ ] Train of tune op periode A.
- [ ] Test op periode B.
- [ ] Schuif venster vooruit.
- [ ] Herhaal over meerdere marktfasen.
- [ ] Meet stabiliteit van parameters.
- [ ] Meet performance decay.
- [ ] Meet drawdown per venster.
- [ ] Meet strategy consistency.
- [ ] Detecteer overfitting.
- [ ] Blokkeer strategie als performance alleen in één venster goed is.
- [ ] Maak walk-forward report.
- [ ] Voeg report toe aan strategy promotion gate.

### Acceptance criteria

- [ ] Geen live promotie zonder out-of-sample validatie.
- [ ] Overfit strategieën blijven paper/shadow.
- [ ] Parameter changes worden alleen gepromoot als ze stabiel zijn.

---

## 6. Kosten- en Fee Simulator

### Doel

Voorkomen dat de bot winstgevend lijkt vóór kosten, maar verliesgevend is na kosten.

### Nieuw bestand

```txt
src/execution/costModel.js
```

### Kostencomponenten

- [ ] Maker fee.
- [ ] Taker fee.
- [ ] Spread cost.
- [ ] Slippage cost.
- [ ] Partial fill cost.
- [ ] Failed order retry cost.
- [ ] Stop-loss slippage.
- [ ] OCO/protection rebuild cost.
- [ ] Minimum notional drag.
- [ ] Dust/rounding loss.
- [ ] Latency drag.
- [ ] Liquidity impact.
- [ ] Opportunity cost van missed maker fill.

### Taken

- [ ] Bereken gross expectancy.
- [ ] Bereken net expectancy na kosten.
- [ ] Bereken minimum edge required.
- [ ] Blokkeer trades met negatieve net expectancy.
- [ ] Toon cost breakdown per trade.
- [ ] Voeg cost model toe aan replay.
- [ ] Voeg cost model toe aan paper.
- [ ] Voeg cost model toe aan live observe.
- [ ] Voeg cost model toe aan neural training labels.

### Acceptance criteria

- [ ] Bot ziet verschil tussen bruto en netto edge.
- [ ] Trades worden niet genomen als kosten de edge opeten.
- [ ] Dashboard toont waarom trade door kosten geblokkeerd werd.

---

## 7. No-Trade-is-a-Trade Analyzer

### Doel

Leren van trades die niet genomen werden. Soms was skippen juist goed, soms was het een gemiste winnaar.

### Nieuw bestand

```txt
src/research/noTradeAnalyzer.js
```

### Labels

- [ ] `good_skip`
- [ ] `bad_skip`
- [ ] `correct_risk_block`
- [ ] `unnecessary_caution`
- [ ] `missed_winner`
- [ ] `avoided_loser`
- [ ] `right_direction_wrong_timing`
- [ ] `execution_cost_saved`
- [ ] `data_quality_block_saved`
- [ ] `model_too_conservative`
- [ ] `risk_too_strict`

### Taken

- [ ] Analyseer blocked setups na afloop.
- [ ] Kijk wat price deed na skip.
- [ ] Bereken hypothetical MFE/MAE.
- [ ] Bereken of trade netto winstgevend zou zijn na kosten.
- [ ] Label goede skips.
- [ ] Label slechte skips.
- [ ] Voeg bad skips toe aan replay queue.
- [ ] Voeg good skips toe aan risk validation.
- [ ] Toon avoided losses in dashboard.
- [ ] Toon missed winners in dashboard.
- [ ] Gebruik labels in neural training.

### Acceptance criteria

- [ ] Bot leert niet alleen van trades, maar ook van skips.
- [ ] Risk gates kunnen worden gevalideerd.
- [ ] Missed winners worden niet blind live-promotie evidence.

---

## 8. Portfolio Correlation Engine

### Doel

Voorkomen dat de bot meerdere sterk gecorreleerde posities opent en denkt dat hij gediversifieerd is.

### Nieuw bestand

```txt
src/portfolio/correlationEngine.js
```

### Taken

- [ ] Bereken rolling correlation tussen symbols.
- [ ] Bereken BTC beta per symbol.
- [ ] Bereken ETH beta per symbol.
- [ ] Bereken cluster correlation.
- [ ] Bereken sector/asset group correlation.
- [ ] Detecteer correlation spike.
- [ ] Verlaag size bij hoge correlatie.
- [ ] Blokkeer nieuwe entry bij correlation breach.
- [ ] Toon correlation matrix in dashboard.
- [ ] Toon portfolio concentration risk.
- [ ] Voeg correlation penalty toe aan candidate ranking.
- [ ] Voeg correlation context toe aan neural features.

### Acceptance criteria

- [ ] Bot opent niet vier keer dezelfde macro-trade.
- [ ] Portfolio exposure wordt realistischer gemeten.
- [ ] Correlation risk is zichtbaar per trade.

---

## 9. Market Session Profiler

### Doel

Leren in welke marktsessies de bot het beste en slechtste presteert.

### Nieuw bestand

```txt
src/runtime/sessionPerformanceProfiler.js
```

### Sessions

- [ ] Asia.
- [ ] Europe.
- [ ] US.
- [ ] Weekend.
- [ ] Low-liquidity hours.
- [ ] Funding window.
- [ ] News-heavy windows.
- [ ] High volatility session.
- [ ] Range-bound session.

### Taken

- [ ] Track performance per session.
- [ ] Track win rate per session.
- [ ] Track average slippage per session.
- [ ] Track spread per session.
- [ ] Track strategy performance per session.
- [ ] Track neural performance per session.
- [ ] Track exit quality per session.
- [ ] Maak session-specific risk multiplier.
- [ ] Blokkeer slechte strategy/session combinaties.
- [ ] Toon session heatmap in dashboard.

### Acceptance criteria

- [ ] Bot kan minder handelen in slechte sessies.
- [ ] Bot kan size verlagen in ongunstige sessies.
- [ ] Strategy promotion gebruikt session performance.

---

## 10. Symbol Auto-Blacklist en Cooldown

### Doel

Een symbool tijdelijk pauzeren als het slechte performance of slechte data heeft.

### Blacklist redenen

- [ ] Repeated losses.
- [ ] High slippage.
- [ ] Low liquidity.
- [ ] Stale data.
- [ ] Frequent spread spikes.
- [ ] Exchange/order errors.
- [ ] Bad fills.
- [ ] High false breakout rate.
- [ ] News/event risk.
- [ ] Reconcile issue.
- [ ] Manual operator block.

### Taken

- [ ] Maak `src/runtime/symbolCooldownManager.js`.
- [ ] Voeg cooldown status per symbol toe.
- [ ] Voeg blacklist status per symbol toe.
- [ ] Maak cooldown duration per reason.
- [ ] Maak auto-review na cooldown.
- [ ] Toon cooldowns in dashboard.
- [ ] Voeg command `symbol:cooldowns`.
- [ ] Voeg command `symbol:block <symbol>`.
- [ ] Voeg command `symbol:unblock <symbol>`.
- [ ] Audit manual symbol blocks.
- [ ] Gebruik cooldown in candidate scan.

### Acceptance criteria

- [ ] Slechte symbols worden tijdelijk vermeden.
- [ ] Manual blocks zijn zichtbaar en auditbaar.
- [ ] Auto-unblock gebeurt alleen na review criteria.

---

## 11. Operator Notes en Journal

### Doel

Handmatige notities toevoegen aan trades, symbols, strategies en incidenten.

### Nieuw bestand

```txt
src/ops/operatorNotes.js
```

### Note types

- [ ] Trade note.
- [ ] Position note.
- [ ] Symbol note.
- [ ] Strategy note.
- [ ] Incident note.
- [ ] Neural note.
- [ ] Config note.
- [ ] Release note.

### Taken

- [ ] Maak command `notes:add`.
- [ ] Maak command `notes:list`.
- [ ] Maak command `notes:search`.
- [ ] Koppel note aan `tradeTraceId`.
- [ ] Koppel note aan symbol.
- [ ] Koppel note aan strategy.
- [ ] Toon notes in dashboard.
- [ ] Neem notes op in review reports.
- [ ] Neem notes optioneel op in incident export.
- [ ] Voorkom secrets in notes met warning.

### Acceptance criteria

- [ ] Operator kennis gaat niet verloren.
- [ ] Notes zijn doorzoekbaar.
- [ ] Notes wijzigen geen tradinggedrag.

---

## 12. Mobile Companion Dashboard

### Doel

Een mobiele view om snel status te bekijken en veilig te pauzeren.

### Taken

- [ ] Maak responsive dashboard layout.
- [ ] Maak mobile overview.
- [ ] Toon bot status.
- [ ] Toon paper/live mode.
- [ ] Toon open positions.
- [ ] Toon active alerts.
- [ ] Toon last trade.
- [ ] Toon health score.
- [ ] Voeg emergency pause knop toe.
- [ ] Verberg risicovolle live controls standaard.
- [ ] Geen enable-live knop op mobiel standaard.
- [ ] Geen approve-neural-live knop op mobiel standaard.
- [ ] Voeg mobile read-only mode toe.

### Acceptance criteria

- [ ] Mobiel kan status veilig bekijken.
- [ ] Mobiel kan emergency pause uitvoeren.
- [ ] Mobiel kan geen gevaarlijke live features activeren zonder extra config.

---

## 13. Notification Layer

### Doel

Belangrijke gebeurtenissen buiten dashboard zichtbaar maken.

### Kanalen

- [ ] Windows toast.
- [ ] Telegram.
- [ ] Discord.
- [ ] Email optioneel.
- [ ] Local sound alert.
- [ ] Daily digest.

### Events

- [ ] Trade opened.
- [ ] Trade closed.
- [ ] Trade blocked by risk.
- [ ] Critical alert.
- [ ] Manual review required.
- [ ] Reconcile mismatch.
- [ ] Neural rollback.
- [ ] Fast execution disabled.
- [ ] Live mode blocked.
- [ ] Backup failed.
- [ ] Restore test failed.
- [ ] Exchange connectivity degraded.

### Taken

- [ ] Maak `src/ops/notificationRouter.js`.
- [ ] Maak notification config.
- [ ] Voeg severity filters toe.
- [ ] Voeg rate limit toe tegen spam.
- [ ] Redact secrets.
- [ ] Log delivery status.
- [ ] Toon notification health.

### Acceptance criteria

- [ ] Critical events bereiken operator.
- [ ] Notifications kunnen geen secrets lekken.
- [ ] Notification failure blokkeert trading niet, maar waarschuwt wel.

---

## 14. Versioned Strategy Experiments

### Doel

Elk strategy-experiment traceerbaar maken.

### Experiment velden

- [ ] Experiment ID.
- [ ] Strategy ID.
- [ ] Strategy version.
- [ ] Config hash.
- [ ] Model version.
- [ ] Start date.
- [ ] End date.
- [ ] Mode: replay, paper, live observe, live.
- [ ] Symbols.
- [ ] Regimes.
- [ ] Metrics.
- [ ] Promote/reject decision.
- [ ] Rollback rule.

### Taken

- [ ] Maak `src/research/strategyExperimentRegistry.js`.
- [ ] Start experiment bij nieuwe strategy config.
- [ ] Koppel trades aan experiment ID.
- [ ] Koppel replay runs aan experiment ID.
- [ ] Toon experiment performance.
- [ ] Sluit experiment automatisch na max trades of max days.
- [ ] Vereis review voor live promotie.
- [ ] Archive oude experimenten.

### Acceptance criteria

- [ ] Je weet altijd welke versie van strategie werkte.
- [ ] Experiments kunnen worden gereplayed.
- [ ] Slechte experimenten worden niet stil doorgezet.

---

## 15. Explain-Like-I-Am-Operator Summaries

### Doel

Technische blocker codes omzetten naar duidelijke operatoracties.

### Taken

- [ ] Maak `src/ops/operatorLanguage.js`.
- [ ] Vertaal blocker codes naar mensentaal.
- [ ] Vertaal risk warnings naar concrete acties.
- [ ] Vertaal neural disagreement naar uitleg.
- [ ] Vertaal exchange issues naar stappenplan.
- [ ] Vertaal config issues naar fix.
- [ ] Voeg `operatorAction` toe aan alerts.
- [ ] Voeg `whyBlockedHuman` toe aan dashboard cards.
- [ ] Voeg `nextBestAction` toe aan readiness report.

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

- [ ] Operator ziet niet alleen codes.
- [ ] Elke critical blocker heeft duidelijke volgende actie.
- [ ] Uitleg blijft kort maar bruikbaar.

---

## 16. Cloud/VPS Deployment Pack

### Doel

De bot later betrouwbaar 24/7 kunnen draaien op VPS of home server.

### Taken

- [ ] Maak `Dockerfile`.
- [ ] Maak `docker-compose.yml`.
- [ ] Maak `.dockerignore`.
- [ ] Maak healthcheck endpoint.
- [ ] Maak volume voor runtime data.
- [ ] Maak volume voor backups.
- [ ] Maak log rotation.
- [ ] Maak restart policy.
- [ ] Maak VPS setup guide.
- [ ] Maak firewall checklist.
- [ ] Maak environment secrets guide.
- [ ] Maak local-only deployment guide.
- [ ] Maak Windows service en Docker duidelijk gescheiden.
- [ ] Voeg warning toe voor live trading op onbeveiligde VPS.

### Acceptance criteria

- [ ] Paper bot kan in Docker draaien.
- [ ] Runtime data blijft persistent.
- [ ] Logs groeien niet onbeperkt.
- [ ] Secrets worden niet in image gebakken.

---

## 17. Tax en Accounting Export

### Doel

Live tradingdata exporteerbaar maken voor administratie.

### Taken

- [ ] Maak `src/reporting/accountingExport.js`.
- [ ] Export closed trades naar CSV.
- [ ] Export closed trades naar JSON.
- [ ] Export fees.
- [ ] Export realized PnL.
- [ ] Export timestamps.
- [ ] Export symbol/base/quote.
- [ ] Export broker mode.
- [ ] Export execution venue.
- [ ] Export order IDs indien veilig.
- [ ] Export trade IDs indien veilig.
- [ ] Maak maandrapport.
- [ ] Maak jaarrapport.
- [ ] Scheid paper en live.
- [ ] Voeg command `report:accounting`.
- [ ] Redact interne debugvelden indien nodig.

### Acceptance criteria

- [ ] Live export is gescheiden van paper.
- [ ] Export wijzigt geen state.
- [ ] Export is bruikbaar voor externe administratie.

---

## 18. Privacy en Local-Only Mode

### Doel

Duidelijk maken welke data lokaal blijft en externe calls kunnen beperken.

### Taken

- [ ] Maak `LOCAL_ONLY_MODE=false`.
- [ ] Documenteer externe API providers.
- [ ] Blokkeer niet-noodzakelijke externe providers in local-only mode.
- [ ] Laat exchange API wel toe indien trading actief is.
- [ ] Blokkeer cloud telemetry.
- [ ] Blokkeer remote logging.
- [ ] Houd incident exports lokaal.
- [ ] Dashboard toont local-only status.
- [ ] Voeg local-only readiness check toe.
- [ ] Voeg data privacy summary toe.

### Acceptance criteria

- [ ] Operator weet welke data extern gaat.
- [ ] Local-only mode blokkeert niet-essentiële externe calls.
- [ ] Secrets en incident exports blijven lokaal.

---

## 19. Paper-to-Live Difference Analyzer

### Doel

Exact zien waarom paper performance verschilt van live performance.

### Taken

- [ ] Vergelijk paper fills met live fills.
- [ ] Vergelijk paper slippage met live slippage.
- [ ] Vergelijk paper spread assumptions met live spread.
- [ ] Vergelijk paper latency met live latency.
- [ ] Vergelijk paper maker fill ratio met live maker fill ratio.
- [ ] Vergelijk paper exit timing met live exit timing.
- [ ] Detecteer overly optimistic paper settings.
- [ ] Pas paper simulator calibration aan op live data.
- [ ] Toon paper/live delta in dashboard.
- [ ] Blokkeer live promotion als paper te optimistisch is.

### Acceptance criteria

- [ ] Paper wordt realistischer door live feedback.
- [ ] Strategieën worden niet gepromoot op onrealistische paper performance.
- [ ] Verschillen zijn per symbol en strategy zichtbaar.

---

## 20. Implementation Priority

### Eerst bouwen

- [ ] Kosten- en Fee Simulator.
- [ ] Monte Carlo Risk Simulator.
- [ ] Walk-Forward Optimizer.
- [ ] Portfolio Correlation Engine.
- [ ] Paper-to-Live Difference Analyzer.

### Daarna bouwen

- [ ] Setup Wizard.
- [ ] Strategy Plugin System.
- [ ] No-Trade-is-a-Trade Analyzer.
- [ ] Market Session Profiler.
- [ ] Symbol Auto-Blacklist.

### Later bouwen

- [ ] Mobile Companion Dashboard.
- [ ] Notification Layer.
- [ ] Strategy Marketplace/Library.
- [ ] Cloud/VPS Deployment Pack.
- [ ] Tax en Accounting Export.

---

## 21. Eindcontrole

Deze roadmap is klaar wanneer:

- [ ] De bot netto edge na kosten berekent.
- [ ] Strategieën out-of-sample getest worden.
- [ ] Worst-case drawdown zichtbaar is.
- [ ] Correlatierisico zichtbaar is.
- [ ] Paper en live verschillen gemeten worden.
- [ ] Skipped trades geanalyseerd worden.
- [ ] Slechte symbols automatisch kunnen afkoelen.
- [ ] Nieuwe gebruikers veilig kunnen starten.
- [ ] Strategieën modulair beheerd kunnen worden.
- [ ] Operator uitleg in mensentaal krijgt.
