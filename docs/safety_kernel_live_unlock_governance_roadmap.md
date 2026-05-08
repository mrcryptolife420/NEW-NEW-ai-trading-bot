# Safety Kernel, Live Unlock, Red Team en Project Governance Roadmap

Doel:
- Extra uitbreidingen toevoegen bovenop alle eerdere roadmaps.
- Focus op ordening, safety, testbaarheid, live-unlock controle, invariant checks en onderhoudbaarheid.
- Geen dubbele taken rond neural, Windows GUI, fast execution, production recovery, strategy validation, multi-exchange of mission control.
- Alles is afvinkbaar en lokaal bruikbaar als implementatie-checklist.

Belangrijk:
Je project heeft inmiddels veel mogelijke features. De grootste winst zit nu in controle: eerst zorgen dat alles veilig, testbaar, gefaseerd en overzichtelijk gebouwd wordt.

---

## 1. Master Roadmap / Prioriteitenbord

### Doel

Alle losse roadmaps samenbrengen in één master backlog zodat het project niet chaotisch wordt.

### Taken

- [ ] Verzamel alle roadmap-files.
- [ ] Maak één master backlog.
- [ ] Verwijder dubbele taken.
- [ ] Geef elke taak een uniek ID.
- [ ] Geef elke taak prioriteit: P0, P1, P2, P3.
- [ ] Geef elke taak status: planned, building, testing, done, blocked.
- [ ] Geef elke taak module: risk, execution, neural, dashboard, data, ops, research.
- [ ] Geef elke taak safety impact: none, low, medium, high, critical.
- [ ] Geef elke taak trading impact: none, paper, live-observe, live.
- [ ] Geef elke taak difficulty: small, medium, large, epic.
- [ ] Geef elke taak afhankelijkheden.
- [ ] Geef elke taak acceptance criteria.
- [ ] Maak een roadmap index.
- [ ] Maak een sprint-ready lijst.
- [ ] Maak een P0 safety-only lijst.
- [ ] Maak een “niet bouwen vóór X klaar is” lijst.

### Acceptance criteria

- [ ] Er is één centrale plek voor alle taken.
- [ ] Duplicaten zijn verwijderd.
- [ ] Live-impact taken zijn duidelijk gemarkeerd.
- [ ] Neural/live/fast-execution taken hebben afhankelijkheden.

---

## 2. Build Order Planner

### Doel

Automatisch of semi-automatisch bepalen welke taken eerst gebouwd moeten worden.

### Nieuwe module

```txt
src/ops/buildOrderPlanner.js
```

### Taken

- [ ] Lees master roadmap taken.
- [ ] Lees dependencies.
- [ ] Lees safety impact.
- [ ] Lees live impact.
- [ ] Sorteer taken op veilige bouwvolgorde.
- [ ] Blokkeer taken met onafgewerkte dependencies.
- [ ] Blokkeer live-impact taken zonder safety foundation.
- [ ] Maak sprintvoorstel.
- [ ] Maak Codex/AI-agent taakvolgorde.
- [ ] Toon “ready to build”.
- [ ] Toon “blocked because”.
- [ ] Toon “dangerous to build now”.
- [ ] Maak command `ops:build-order`.

### Acceptance criteria

- [ ] Live autonomy kan niet vroeg in de planning belanden.
- [ ] Safety foundations komen eerst.
- [ ] Taken zijn duidelijk afhankelijk van elkaar.

---

## 3. Codebase Architecture Map

### Doel

Automatisch inzicht krijgen in hoe modules met elkaar verbonden zijn.

### Nieuwe module

```txt
src/ops/architectureMap.js
```

### Taken

- [ ] Scan imports.
- [ ] Genereer module dependency graph.
- [ ] Toon welke modules risk beïnvloeden.
- [ ] Toon welke modules execution beïnvloeden.
- [ ] Toon welke modules LiveBroker kunnen bereiken.
- [ ] Toon welke modules neural influence kunnen geven.
- [ ] Toon welke modules state kunnen schrijven.
- [ ] Toon circular dependencies.
- [ ] Toon te grote files.
- [ ] Toon orphan/dead code.
- [ ] Toon entrypoints.
- [ ] Toon dashboard/API routes.
- [ ] Toon CLI commands.
- [ ] Maak command `ops:architecture-map`.
- [ ] Export naar Markdown/JSON.
- [ ] Optioneel export naar Mermaid graph.

### Acceptance criteria

- [ ] Je ziet welke code live trading kan beïnvloeden.
- [ ] Circular dependencies worden gevonden.
- [ ] Grote refactor-risico’s worden zichtbaar.

---

## 4. Runtime Invariant Checker

### Doel

Continu harde waarheden bewaken zodat corrupte of gevaarlijke state snel wordt gevonden.

### Nieuwe module

```txt
src/runtime/invariantChecker.js
```

### Invariants

- [ ] Open positie moet `symbol` hebben.
- [ ] Open positie moet geldige `quantity` hebben.
- [ ] Open positie moet geldige `entryPrice` hebben.
- [ ] Geen negatieve balance.
- [ ] Geen NaN in PnL.
- [ ] Geen Infinity in exposure.
- [ ] Geen trade zonder `tradeTraceId`.
- [ ] Geen execution zonder risk verdict.
- [ ] Geen live order zonder audit event.
- [ ] Geen live position zonder protection status.
- [ ] Geen position met quantity 0 tenzij closed.
- [ ] Geen unresolved intent ouder dan ingestelde limiet zonder alert.
- [ ] Geen neural influence zonder model version.
- [ ] Geen fast execution zonder freshness check.
- [ ] Geen paper/live data mix in één performance metric.
- [ ] Geen state schema mismatch.
- [ ] Geen duplicate open position ID.
- [ ] Geen duplicate order intent ID.
- [ ] Geen live entry als health circuit open is.
- [ ] Geen live entry als exchange safety freeze actief is.

### Taken

- [ ] Maak invariant registry.
- [ ] Maak invariant severity.
- [ ] Maak invariant checker voor runtime.
- [ ] Maak invariant checker voor journal.
- [ ] Maak invariant checker voor positions.
- [ ] Maak invariant checker voor orders/intents.
- [ ] Maak invariant checker voor neural state.
- [ ] Maak invariant checker voor config.
- [ ] Draai checker bij startup.
- [ ] Draai checker na elke trading cycle.
- [ ] Draai checker vóór live order submit.
- [ ] Draai checker bij restore.
- [ ] Maak command `ops:invariants`.
- [ ] Toon invariant failures in dashboard.
- [ ] Blokkeer live entries bij critical invariant failure.

### Acceptance criteria

- [ ] Critical invariant failure blokkeert live entries.
- [ ] Invariant checker wijzigt geen state zonder expliciete repair command.
- [ ] Elke invariant failure heeft duidelijke uitleg.

---

## 5. Red Team Test Suite

### Doel

Een testlaag die actief probeert de bot gevaarlijk of kapot te krijgen.

### Nieuwe map

```txt
test/red-team/
```

### Red team scenario’s

- [ ] Probeer live te starten zonder acknowledgement.
- [ ] Probeer live te starten zonder exchange protection.
- [ ] Probeer dubbele orders te veroorzaken.
- [ ] Probeer fast execution stale data te laten gebruiken.
- [ ] Probeer neural hard blockers te laten overrulen.
- [ ] Probeer max exposure te overschrijden.
- [ ] Probeer corrupt runtime state te laden.
- [ ] Probeer corrupt journal state te laden.
- [ ] Probeer NaN PnL door pipeline te krijgen.
- [ ] Probeer exchange timeout blind retry te laten doen.
- [ ] Probeer partial fill verkeerd te journalen.
- [ ] Probeer unresolved intent te negeren.
- [ ] Probeer manual review te omzeilen.
- [ ] Probeer dashboard action zonder audit te doen.
- [ ] Probeer config met duplicate keys te accepteren.
- [ ] Probeer API key te loggen.
- [ ] Probeer incident export met secret te maken.
- [ ] Probeer safety kernel te omzeilen.
- [ ] Probeer replay engine LiveBroker te laten gebruiken.
- [ ] Probeer neural live autonomy zonder approval te activeren.

### Taken

- [ ] Maak red team test runner.
- [ ] Maak mock/synthetic broker.
- [ ] Maak corrupt-state fixtures.
- [ ] Maak stale-data fixtures.
- [ ] Maak bad-config fixtures.
- [ ] Maak fake exchange failure fixtures.
- [ ] Voeg red team tests toe aan CI.
- [ ] Markeer red team failures als critical.
- [ ] Maak command `npm run test:red-team`.

### Acceptance criteria

- [ ] Safety-breaches worden automatisch getest.
- [ ] Live-risk regressies worden vóór release gevonden.
- [ ] Red team tests kunnen zonder echte API keys draaien.

---

## 6. Autonomous Maintenance Agent

### Doel

Een onderhoudsagent die dagelijks controleert of de bot gezond is, zonder tradingbeslissingen te nemen.

### Nieuwe module

```txt
src/ops/maintenanceAgent.js
```

### Taken

- [ ] Check logs op errors.
- [ ] Check disk usage.
- [ ] Check memory usage.
- [ ] Check stale data.
- [ ] Check backup freshness.
- [ ] Check restore-test freshness.
- [ ] Check model drift.
- [ ] Check config drift.
- [ ] Check unresolved intents.
- [ ] Check stale alerts.
- [ ] Check old runtime tmp files.
- [ ] Check archive integrity.
- [ ] Check dashboard health.
- [ ] Check test results indien beschikbaar.
- [ ] Maak dagelijks onderhoudsrapport.
- [ ] Stel veilige fixes voor.
- [ ] Geen automatische live-risk wijzigingen.
- [ ] Geen trades openen.
- [ ] Geen modelpromoties uitvoeren.

### Commands

```bash
node src/cli.js ops:maintenance
node src/cli.js ops:maintenance-report
```

### Acceptance criteria

- [ ] Agent is read-only tenzij operator expliciet repair command uitvoert.
- [ ] Agent maakt duidelijke onderhoudsacties.
- [ ] Agent kan geen trading uitvoeren.

---

## 7. Explain My Bot Mode

### Doel

De bot kan zichzelf uitleggen aan de operator.

### Nieuwe module

```txt
src/ops/explainMyBot.js
```

### Uitleggebieden

- [ ] Welke mode draait de bot?
- [ ] Welke strategieën zijn actief?
- [ ] Welke risk gates zijn actief?
- [ ] Welke exchange/broker wordt gebruikt?
- [ ] Welke data providers worden gebruikt?
- [ ] Welke neural modellen zijn actief?
- [ ] Welke fast execution features zijn actief?
- [ ] Welke live guardrails zijn actief?
- [ ] Welke recovery/backup features zijn actief?
- [ ] Wat is nodig voor live readiness?
- [ ] Wat is momenteel geblokkeerd?
- [ ] Wat is de veiligste volgende actie?

### Commands

```bash
node src/cli.js explain:bot
node src/cli.js explain:live-readiness
node src/cli.js explain:neural
node src/cli.js explain:risk
```

### Acceptance criteria

- [ ] Uitleg is begrijpelijk voor operator.
- [ ] Uitleg bevat geen secrets.
- [ ] Uitleg opent geen trades of wijzigt geen state.

---

## 8. Testnet / Demo Certification

### Doel

Voordat live trading wordt vrijgegeven moet de bot een examen halen.

### Certification requirements

- [ ] Minimaal 24 uur paper/demo draaien.
- [ ] Minimaal X succesvolle cycles.
- [ ] Minimaal X successful market data refreshes.
- [ ] Minimaal X reconcile checks.
- [ ] Geen critical alerts.
- [ ] Geen unresolved intents.
- [ ] Geen position mismatch.
- [ ] Geen stale-data trades.
- [ ] Geen failed protection checks.
- [ ] Geen audit write failures.
- [ ] Geen state write failures.
- [ ] Geen red team safety failures.
- [ ] Geen critical invariant failures.
- [ ] Backup en restore-test recent.
- [ ] Dashboard health OK.
- [ ] Exchange health OK.
- [ ] Clock health OK.

### Taken

- [ ] Maak `src/ops/demoCertification.js`.
- [ ] Maak command `ops:certification-status`.
- [ ] Maak command `ops:start-certification`.
- [ ] Maak certification report.
- [ ] Blokkeer live unlock als certification verlopen is.
- [ ] Toon certification status in dashboard.
- [ ] Laat certification automatisch verlopen na grote code/config wijziging.

### Acceptance criteria

- [ ] Live readiness vereist geldige certification.
- [ ] Certification is gebaseerd op echte runtime observaties.
- [ ] Certification opent geen live trades.

---

## 9. Live Unlock Levels

### Doel

Live trading niet als één grote schakelaar behandelen, maar als gefaseerd systeem.

### Levels

- [ ] Level 0: paper only.
- [ ] Level 1: live observe.
- [ ] Level 2: live manual approval.
- [ ] Level 3: live tiny canary.
- [ ] Level 4: live conservative.
- [ ] Level 5: live normal.
- [ ] Level 6: live neural bounded.
- [ ] Level 7: live fast bounded.
- [ ] Level 8: live autonomous capped.

### Taken

- [ ] Maak `src/ops/liveUnlockLevels.js`.
- [ ] Definieer requirements per level.
- [ ] Definieer allowed features per level.
- [ ] Definieer max exposure per level.
- [ ] Definieer max trades per day per level.
- [ ] Definieer neural permission per level.
- [ ] Definieer fast execution permission per level.
- [ ] Definieer approval requirement per level.
- [ ] Maak command `live:unlock-status`.
- [ ] Maak command `live:request-level <level>`.
- [ ] Maak command `live:downgrade-level <level>`.
- [ ] Downgrade automatisch bij incidents.
- [ ] Toon live unlock level in dashboard.
- [ ] Audit elke level change.

### Acceptance criteria

- [ ] Bot kan niet direct van paper naar volledige live autonomie.
- [ ] Elk level heeft duidelijke requirements.
- [ ] Downgrade is makkelijker dan upgrade.
- [ ] Upgrade vereist bewijs en/of approval.

---

## 10. What Changed Report

### Doel

Na elke code/config/model wijziging tonen wat het gedrag mogelijk heeft veranderd.

### Nieuwe module

```txt
src/ops/whatChangedReport.js
```

### Detecties

- [ ] Config changes.
- [ ] Strategy changes.
- [ ] Risk setting changes.
- [ ] Execution setting changes.
- [ ] Neural model changes.
- [ ] Feature schema changes.
- [ ] Data source changes.
- [ ] Dashboard/API changes.
- [ ] Broker/exchange changes.
- [ ] Live-impacting changes.
- [ ] Fast-execution-impacting changes.
- [ ] Required retests.
- [ ] Certification invalidation.
- [ ] Migration required.

### Taken

- [ ] Maak config snapshot diff.
- [ ] Maak model registry diff.
- [ ] Maak strategy registry diff.
- [ ] Maak package/version diff.
- [ ] Maak command `ops:what-changed`.
- [ ] Toon report bij startup na wijziging.
- [ ] Blokkeer live upgrade als critical change niet reviewed is.
- [ ] Audit review/acknowledgement.

### Acceptance criteria

- [ ] Operator weet waarom bot vandaag anders kan gedragen dan gisteren.
- [ ] Live-impacting changes vereisen review.
- [ ] Report bevat geen secrets.

---

## 11. Trade Replay Search Engine

### Doel

Tradegeschiedenis doorzoekbaar maken als database van lessen.

### Nieuwe module

```txt
src/replay/tradeReplaySearch.js
```

### Zoekfilters

- [ ] Symbol.
- [ ] Strategy family.
- [ ] Regime.
- [ ] Session.
- [ ] Root cause.
- [ ] Late entry.
- [ ] Early entry.
- [ ] Late exit.
- [ ] Early exit.
- [ ] High slippage.
- [ ] Spread shock.
- [ ] Neural wrong.
- [ ] Neural right.
- [ ] Risk too strict.
- [ ] Risk too loose.
- [ ] Bad veto.
- [ ] Good veto.
- [ ] Missed winner.
- [ ] Avoided loser.
- [ ] Data stale.
- [ ] Execution drag.
- [ ] High confidence wrong.
- [ ] Low confidence right.

### Taken

- [ ] Maak searchable replay index.
- [ ] Index paper trades.
- [ ] Index live trades.
- [ ] Index blocked setups.
- [ ] Index counterfactuals.
- [ ] Index neural black box records.
- [ ] Maak command `replay:search`.
- [ ] Maak command `replay:export-search`.
- [ ] Voeg dashboard search toe.
- [ ] Koppel search results aan replay arena.

### Acceptance criteria

- [ ] Operator kan snel vergelijkbare fouten vinden.
- [ ] Search wijzigt geen state.
- [ ] Results kunnen naar replay queue.

---

## 12. Risk Narrative Generator

### Doel

Dagelijks een begrijpelijk risicoverslag genereren.

### Nieuwe module

```txt
src/reporting/riskNarrativeGenerator.js
```

### Rapport bevat

- [ ] Grootste risico vandaag.
- [ ] Meest actieve risk gate.
- [ ] Meest geblokkeerde symbolen.
- [ ] Meest risicovolle strategie.
- [ ] Data quality problemen.
- [ ] Exchange reliability problemen.
- [ ] Execution cost problemen.
- [ ] Neural overconfidence.
- [ ] Portfolio concentration.
- [ ] Drawdown pressure.
- [ ] Aanbevolen actie voor morgen.
- [ ] Wat veilig werkte.
- [ ] Wat vermeden werd.

### Commands

```bash
node src/cli.js report:risk-narrative
node src/cli.js report:daily-risk
```

### Acceptance criteria

- [ ] Rapport is begrijpelijk.
- [ ] Rapport geeft geen financieel advies, maar operationele observaties.
- [ ] Rapport opent geen trades.

---

## 13. Confidence Debt Tracker

### Doel

Bijhouden wanneer het systeem veel onzekerheid of foute zekerheid opbouwt.

### Nieuwe module

```txt
src/ai/governance/confidenceDebtTracker.js
```

### Debt bronnen

- [ ] Veel low-confidence decisions.
- [ ] Veel high-confidence wrong decisions.
- [ ] Veel neural disagreement.
- [ ] Veel model disagreement.
- [ ] Veel missing data confidence.
- [ ] Veel stale feature usage.
- [ ] Veel bad vetoes.
- [ ] Veel false positives.
- [ ] Veel calibration drift.
- [ ] Veel regime uncertainty.

### Taken

- [ ] Bereken confidence debt score.
- [ ] Bereken debt per symbol.
- [ ] Bereken debt per strategy.
- [ ] Bereken debt per neural model.
- [ ] Verlaag autonomy bij hoge debt.
- [ ] Verlaag size bij hoge debt.
- [ ] Trigger replay cases bij hoge debt.
- [ ] Toon debt in dashboard.
- [ ] Voeg debt toe aan model promotion gates.

### Acceptance criteria

- [ ] Onzekerheid stapelt zich zichtbaar op.
- [ ] Hoge confidence debt verlaagt risico.
- [ ] Debt kan model/autonomy promotie blokkeren.

---

## 14. Trading Freeze Calendar

### Doel

Tijdvensters waarin de bot defensiever moet zijn of niet mag handelen.

### Nieuwe module

```txt
src/ops/tradingFreezeCalendar.js
```

### Freeze types

- [ ] Macro event freeze.
- [ ] CPI/FOMC freeze.
- [ ] Exchange maintenance freeze.
- [ ] Funding window freeze.
- [ ] Low-liquidity holiday freeze.
- [ ] Weekend caution window.
- [ ] Manual operator freeze.
- [ ] Data provider maintenance freeze.
- [ ] Model deployment freeze.
- [ ] High-volatility event freeze.

### Taken

- [ ] Maak freeze calendar schema.
- [ ] Maak manual freeze command.
- [ ] Maak freeze preview.
- [ ] Koppel freeze aan policy engine.
- [ ] Koppel freeze aan Mission Control.
- [ ] Toon active/future freezes in dashboard.
- [ ] Laat freeze entries blokkeren of risk verlagen.
- [ ] Laat exits/protection actief blijven.
- [ ] Audit freeze create/update/remove.
- [ ] Maak command `ops:freeze-calendar`.
- [ ] Maak command `ops:freeze-add`.
- [ ] Maak command `ops:freeze-remove`.

### Acceptance criteria

- [ ] Freeze blokkeert entries maar niet beschermende exits.
- [ ] Operator kan freeze windows handmatig beheren.
- [ ] Freeze is zichtbaar vóór het actief wordt.

---

## 15. Master Safety Kernel

### Doel

Een kleine kernmodule die altijd als laatste/hoogste safetylaag kan blokkeren.

### Nieuwe module

```txt
src/safety/safetyKernel.js
```

### Ontwerpregels

- [ ] Minimale dependencies.
- [ ] Geen neural dependency.
- [ ] Geen dashboard dependency.
- [ ] Geen strategy dependency.
- [ ] Geen optional provider dependency.
- [ ] Kan entries globaal blokkeren.
- [ ] Kan live influence blokkeren.
- [ ] Kan fast execution blokkeren.
- [ ] Kan neural influence blokkeren.
- [ ] Kan broker routing blokkeren.
- [ ] Kan order submit blokkeren.
- [ ] Kan geen trades openen.
- [ ] Kan geen risk verhogen.
- [ ] Kan niet door neural worden aangepast.

### Kernel checks

- [ ] Live guardrails.
- [ ] Exchange protection.
- [ ] Manual review.
- [ ] Health circuit.
- [ ] State write health.
- [ ] Audit write health.
- [ ] Clock health.
- [ ] Data freshness.
- [ ] Unresolved intents.
- [ ] Max exposure.
- [ ] Daily drawdown.
- [ ] Critical alerts.
- [ ] Reconcile freeze.
- [ ] Live unlock level.
- [ ] Trading freeze calendar.

### Taken

- [ ] Maak safety kernel input.
- [ ] Maak safety kernel output.
- [ ] Voeg kernel toe vóór order submit.
- [ ] Voeg kernel toe vóór fast execution.
- [ ] Voeg kernel toe vóór neural live influence.
- [ ] Voeg kernel toe vóór live unlock upgrade.
- [ ] Log kernel decisions.
- [ ] Test elke kernel block.
- [ ] Maak command `safety:kernel-status`.
- [ ] Toon kernel status in dashboard.

### Acceptance criteria

- [ ] Geen live order kan safety kernel omzeilen.
- [ ] Kernel kan niet door AI/neural worden versoepeld.
- [ ] Kernel output is altijd auditbaar.
- [ ] Kernel fail-closed bij onbekende critical state.

---

## 16. Implementatieprioriteit

### Eerst bouwen

- [ ] Master Roadmap / Prioriteitenbord.
- [ ] Runtime Invariant Checker.
- [ ] Master Safety Kernel.
- [ ] Red Team Test Suite.
- [ ] Live Unlock Levels.

### Daarna bouwen

- [ ] What Changed Report.
- [ ] Testnet / Demo Certification.
- [ ] Trade Replay Search Engine.
- [ ] Trading Freeze Calendar.
- [ ] Confidence Debt Tracker.

### Later bouwen

- [ ] Codebase Architecture Map.
- [ ] Build Order Planner.
- [ ] Autonomous Maintenance Agent.
- [ ] Explain My Bot Mode.
- [ ] Risk Narrative Generator.

---

## 17. Eindcontrole

Deze roadmap is klaar wanneer:

- [ ] Alle taken centraal geordend zijn.
- [ ] Build order zichtbaar is.
- [ ] Runtime invariants kritieke fouten blokkeren.
- [ ] Red team tests live-risk regressies vinden.
- [ ] Live unlock gefaseerd werkt.
- [ ] Safety kernel geen live order laat omzeilen.
- [ ] Demo certification live readiness kan blokkeren.
- [ ] What Changed report live-impact wijzigingen toont.
- [ ] Replay search bruikbaar is voor analyse.
- [ ] Confidence debt autonomy kan verlagen.
- [ ] Freeze calendar entries kan pauzeren.
- [ ] Onderhoudsagent veilig rapporten maakt.
