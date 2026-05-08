# AI Trading Bot: Mission Control, Risk Intelligence en Zelfbeheersing Roadmap

Doel:
- Extra uitbreidingen toevoegen bovenop alle eerdere roadmaps.
- Focus op slimmer kapitaalgebruik, verliespreventie, reality-gap detectie, marktconditie-score, AI change control en operator mission control.
- Geen dubbele taken rond neural basis, fast execution, Windows GUI, production recovery, strategy validation of multi-exchange infrastructuur.
- Alles is afvinkbaar en lokaal bruikbaar als implementatie-checklist.

Belangrijk:
Deze roadmap maakt de bot vooral minder impulsief. De beste trading bot is niet degene die het vaakst handelt, maar degene die weet wanneer hij niet moet handelen, wanneer risico omlaag moet en wanneer live trading tijdelijk niet verantwoord is.

---

## 1. Trading Mission Control

### Doel

Eén centrale cockpit die in gewone taal uitlegt wat de bot doet, waarom hij wel/niet handelt en wat de operator moet doen.

### Nieuwe module

```txt
src/ops/missionControl.js
```

### Taken

- [ ] Maak centrale Mission Control summary.
- [ ] Toon huidige bot mode.
- [ ] Toon huidige operator mode.
- [ ] Toon of nieuwe entries toegestaan zijn.
- [ ] Toon of exits/protection actief blijven.
- [ ] Toon grootste actieve blocker.
- [ ] Toon grootste actieve risico.
- [ ] Toon laatste tradebeslissing.
- [ ] Toon waarom de bot wel/niet handelt.
- [ ] Toon welke module trading blokkeert.
- [ ] Toon welke operatoractie nodig is.
- [ ] Toon live readiness.
- [ ] Toon neural readiness.
- [ ] Toon fast execution readiness.
- [ ] Toon data freshness status.
- [ ] Toon exchange safety status.
- [ ] Toon position protection status.
- [ ] Maak command `ops:mission-control`.
- [ ] Maak dashboard/API endpoint `/api/mission-control`.

### Output voorbeeld

```json
{
  "status": "blocked",
  "botMode": "paper",
  "primaryBlocker": "execution_cost_budget_exceeded",
  "largestRisk": "high_correlation_exposure",
  "nextBestAction": "Review liquidity and spread filters before enabling fast entries.",
  "entriesAllowed": false,
  "exitsManaged": true
}
```

### Acceptance criteria

- [ ] Operator ziet binnen 10 seconden wat de bot doet.
- [ ] Mission Control opent nooit trades.
- [ ] Mission Control verhoogt nooit risico.
- [ ] Elke critical status linkt naar een concrete actie of runbook.

---

## 2. Capital Allocation AI

### Doel

Een aparte AI-laag die niet beslist “koop/verkoop”, maar hoeveel kapitaal elk onderdeel veilig mag gebruiken.

### Nieuwe module

```txt
src/ai/capital/capitalAllocationAI.js
```

### Taken

- [ ] Maak kapitaalbudget per strategy family.
- [ ] Maak kapitaalbudget per symbool.
- [ ] Maak kapitaalbudget per regime.
- [ ] Maak kapitaalbudget per sessie.
- [ ] Maak kapitaalbudget per neural model.
- [ ] Maak kapitaalbudget per fast execution lane.
- [ ] Maak kapitaalbudget per broker/account.
- [ ] Meet capital efficiency per strategie.
- [ ] Meet capital efficiency per symbol.
- [ ] Meet drawdown impact per strategie.
- [ ] Meet correlation-adjusted capital usage.
- [ ] Verlaag automatisch budget bij slechte performance.
- [ ] Verlaag automatisch budget bij hoge drawdown.
- [ ] Verlaag automatisch budget bij hoge slippage.
- [ ] Verlaag automatisch budget bij hoge correlation exposure.
- [ ] Stel budgetverhoging alleen voor als proposal.
- [ ] Vereis approval voor budgetverhoging.
- [ ] Log alle budgetwijzigingen.
- [ ] Toon budgetverdeling in dashboard.

### Safetyregels

- [ ] AI mag risico automatisch verlagen.
- [ ] AI mag risico nooit automatisch boven hard caps verhogen.
- [ ] AI mag max total exposure nooit verhogen.
- [ ] AI mag live budget niet verhogen zonder approval.
- [ ] AI mag budget niet aanpassen als data quality slecht is.

### Acceptance criteria

- [ ] Kapitaalverdeling is traceerbaar.
- [ ] Budgetverlaging kan automatisch.
- [ ] Budgetverhoging vereist governance.
- [ ] Capital Allocation AI kan geen orders plaatsen.

---

## 3. Do-Nothing Intelligence

### Doel

De bot moet leren wanneer niets doen de beste trade is.

### Nieuwe module

```txt
src/ai/decision/doNothingIntelligence.js
```

### Taken

- [ ] Detecteer marktomstandigheden waarin traden historisch slecht was.
- [ ] Label correcte skips.
- [ ] Label onnodige trades.
- [ ] Label avoided losses.
- [ ] Label “market not worth trading”.
- [ ] Meet winst/verlies van niet-handelen.
- [ ] Beloon correcte skips in learning.
- [ ] Straf onnodige trades in training.
- [ ] Geef `doNothingScore` per candidate.
- [ ] Geef `doNothingScore` voor hele markt.
- [ ] Toon “best avoided losses” in dashboard.
- [ ] Voeg do-nothing score toe aan decision pipeline.
- [ ] Gebruik do-nothing score als hard caution, niet als live override.
- [ ] Voeg replay cases toe voor onnodige trades.

### Labels

- [ ] `correct_skip`
- [ ] `bad_skip`
- [ ] `avoided_loss`
- [ ] `unnecessary_trade`
- [ ] `market_too_noisy`
- [ ] `risk_not_worth_reward`
- [ ] `liquidity_not_worth_trade`
- [ ] `execution_cost_too_high`

### Acceptance criteria

- [ ] Bot leert van niet-handelen.
- [ ] Niet-handelen wordt zichtbaar als positieve beslissing.
- [ ] Do-nothing layer kan risico verlagen maar niet automatisch verhogen.

---

## 4. Market Regime Playbooks

### Doel

Voor elk markttype een eigen draaiboek, zodat de bot niet één universele aanpak forceert.

### Nieuwe module

```txt
src/market/regimePlaybooks.js
```

### Playbooks

- [ ] Bull trend playbook.
- [ ] Bear trend playbook.
- [ ] Sideways/range playbook.
- [ ] High volatility playbook.
- [ ] Low volatility playbook.
- [ ] Low liquidity playbook.
- [ ] News shock playbook.
- [ ] Weekend playbook.
- [ ] Funding window playbook.
- [ ] Exchange degraded playbook.
- [ ] Recovery mode playbook.

### Per playbook definiëren

- [ ] Allowed strategy families.
- [ ] Blocked strategy families.
- [ ] Max risk multiplier.
- [ ] Max position count.
- [ ] Max position fraction.
- [ ] Min liquidity score.
- [ ] Min data quality.
- [ ] Allowed execution styles.
- [ ] Exit aggressiveness.
- [ ] Neural influence limit.
- [ ] Fast execution permission.
- [ ] Required operator approval.

### Acceptance criteria

- [ ] Elke regime heeft duidelijke tradingregels.
- [ ] Playbooks kunnen risk verlagen.
- [ ] Playbooks kunnen hard safety niet versoepelen.
- [ ] Dashboard toont actief playbook.

---

## 5. Loss Prevention AI

### Doel

Een AI-laag die alleen probeert verliezen te voorkomen. Deze laag mag automatisch risico verlagen, maar nooit risico verhogen.

### Nieuwe module

```txt
src/ai/risk/lossPreventionAI.js
```

### Detecties

- [ ] Verhoogde kans op slechte entry.
- [ ] Verhoogde kans op late entry.
- [ ] Verhoogde kans op early failure.
- [ ] Verhoogde kans op stop-loss hit.
- [ ] Verhoogde kans op slippage spike.
- [ ] Verhoogde kans op spread shock.
- [ ] Verhoogde kans op liquidity evaporation.
- [ ] Verhoogde kans op bad exit.
- [ ] Verhoogde kans op late exit.
- [ ] Verhoogde kans op model overconfidence.
- [ ] Verhoogde kans op correlated loss.
- [ ] Verhoogde kans op news shock.
- [ ] Verhoogde kans op data-quality failure.

### Mogelijke acties

- [ ] Entry blokkeren.
- [ ] Position size verlagen.
- [ ] Strategy tijdelijk pauzeren.
- [ ] Symbol cooldown activeren.
- [ ] Fast execution uitzetten.
- [ ] Neural influence verlagen.
- [ ] Exit caution verhogen.
- [ ] Operator alert sturen.
- [ ] Replay case aanmaken.

### No-go

- [ ] Loss Prevention AI mag nooit size verhogen.
- [ ] Loss Prevention AI mag nooit entry forceren.
- [ ] Loss Prevention AI mag nooit hard blockers overrulen.
- [ ] Loss Prevention AI mag nooit LiveBroker direct aanroepen.

### Acceptance criteria

- [ ] Loss Prevention AI kan alleen defensieve acties uitvoeren.
- [ ] Elke actie is auditbaar.
- [ ] Operator ziet welke verliezen mogelijk voorkomen zijn.

---

## 6. Trade Quality Score vóór execution

### Doel

Elke mogelijke trade krijgt een totale kwaliteitsscore voordat hij naar execution mag.

### Nieuwe module

```txt
src/trading/tradeQualityScore.js
```

### Scorecomponenten

- [ ] Signal quality.
- [ ] Data quality.
- [ ] Execution quality.
- [ ] Risk/reward quality.
- [ ] Liquidity quality.
- [ ] Regime fit.
- [ ] Portfolio fit.
- [ ] Neural agreement.
- [ ] Cost/fee quality.
- [ ] Correlation quality.
- [ ] Session quality.
- [ ] News/event risk quality.
- [ ] Position protection readiness.

### Taken

- [ ] Maak totale trade quality score.
- [ ] Maak minimum score voor paper.
- [ ] Maak minimum score voor live.
- [ ] Maak strengere score voor fast execution.
- [ ] Maak strengere score voor neural live autonomy.
- [ ] Toon score per candidate.
- [ ] Toon zwakste component.
- [ ] Blokkeer trade als score onder minimum is.
- [ ] Voeg score toe aan trade receipt.
- [ ] Voeg score toe aan replay/training labels.

### Acceptance criteria

- [ ] Geen trade zonder quality score.
- [ ] Score is uitlegbaar per component.
- [ ] Lage score verlaagt risico of blokkeert entry.

---

## 7. Bot Personality Modes

### Doel

Duidelijke risk-modi maken voor verschillende situaties.

### Modes

- [ ] `ultra_safe`
- [ ] `learning_paper`
- [ ] `conservative_live`
- [ ] `recovery_mode`
- [ ] `high_confidence_only`
- [ ] `no_new_entries`
- [ ] `exit_management_only`
- [ ] `neural_shadow_only`
- [ ] `fast_execution_disabled`
- [ ] `incident_mode`

### Taken

- [ ] Maak `src/runtime/botPersonalityMode.js`.
- [ ] Definieer toegestane acties per mode.
- [ ] Definieer risk multiplier per mode.
- [ ] Definieer neural permission per mode.
- [ ] Definieer fast execution permission per mode.
- [ ] Definieer entry permission per mode.
- [ ] Definieer exit/protection permission per mode.
- [ ] Voeg mode toe aan dashboard.
- [ ] Voeg mode toe aan audit events.
- [ ] Maak command `bot:mode <mode>`.
- [ ] Vereis confirmation voor risk-increasing modes.

### Acceptance criteria

- [ ] `exit_management_only` beheert bestaande posities maar opent niets nieuws.
- [ ] `no_new_entries` blokkeert entries maar laat exits/protection actief.
- [ ] Incident mode verlaagt risico automatisch.
- [ ] Modes kunnen hard safety niet versoepelen.

---

## 8. Reality Gap Detector

### Doel

Detecteren wanneer replay/paper te optimistisch is vergeleken met echte live observe/live data.

### Nieuwe module

```txt
src/research/realityGapDetector.js
```

### Detecties

- [ ] Paper verwacht fill, live krijgt geen fill.
- [ ] Paper slippage laag, live slippage hoog.
- [ ] Replay winstgevend, paper niet.
- [ ] Paper winstgevend, live niet.
- [ ] Neural goed in replay, slecht in live observe.
- [ ] Execution model goed in paper, slecht in live.
- [ ] Spread assumptions te optimistisch.
- [ ] Latency assumptions te optimistisch.
- [ ] Maker fill assumptions te optimistisch.
- [ ] Partial fill model te optimistisch.
- [ ] Stop-loss slippage onderschat.
- [ ] Market impact onderschat.

### Taken

- [ ] Maak reality gap score.
- [ ] Maak gap per symbol.
- [ ] Maak gap per strategy.
- [ ] Maak gap per session.
- [ ] Maak gap per execution style.
- [ ] Maak gap per neural model.
- [ ] Verlaag paper-to-live readiness bij hoge gap.
- [ ] Blokkeer live promotie bij extreme gap.
- [ ] Toon reality gap in dashboard.
- [ ] Voeg gap toe aan model/strategy cards.

### Acceptance criteria

- [ ] Live promotie houdt rekening met verschil tussen simulatie en realiteit.
- [ ] Paper simulator wordt gekalibreerd met live feedback.
- [ ] Hoge reality gap verlaagt autonomie.

---

## 9. Trading System Scorecard

### Doel

Elke dag/week een score per onderdeel van het trading systeem.

### Nieuwe module

```txt
src/reporting/tradingSystemScorecard.js
```

### Scores

- [ ] Signal score.
- [ ] Risk score.
- [ ] Execution score.
- [ ] Exit score.
- [ ] Neural score.
- [ ] Data score.
- [ ] Portfolio score.
- [ ] Liquidity score.
- [ ] Cost score.
- [ ] Operator safety score.
- [ ] Reality gap score.
- [ ] Position protection score.
- [ ] Replay quality score.
- [ ] Paper/live alignment score.

### Taken

- [ ] Maak daily scorecard.
- [ ] Maak weekly scorecard.
- [ ] Toon weakest module.
- [ ] Toon strongest module.
- [ ] Toon recommended fix.
- [ ] Toon trend versus vorige periode.
- [ ] Maak command `report:scorecard`.
- [ ] Voeg scorecard toe aan dashboard.
- [ ] Voeg scorecard toe aan daily briefing.

### Acceptance criteria

- [ ] Operator ziet waar de bot zwak is.
- [ ] Scorecard opent geen trades.
- [ ] Scorecard geeft veilige verbeteracties.

---

## 10. Never-Trade-When Rules

### Doel

Een centrale lijst met harde anti-trading regels.

### Nieuwe module

```txt
src/risk/neverTradeWhenRules.js
```

### Regels

- [ ] Niet traden bij stale order book.
- [ ] Niet traden bij exchange mismatch.
- [ ] Niet traden bij hoge spread.
- [ ] Niet traden bij te hoge slippage.
- [ ] Niet traden bij unresolved execution intent.
- [ ] Niet traden bij slechte clock sync.
- [ ] Niet traden bij open critical alert.
- [ ] Niet traden als audit niet geschreven kan worden.
- [ ] Niet traden als state niet geschreven kan worden.
- [ ] Niet traden als open live positie manual review vereist.
- [ ] Niet traden als exchange protection uit is.
- [ ] Niet traden als live acknowledgement ontbreekt.
- [ ] Niet traden als withdrawal permission onverwacht actief is.
- [ ] Niet traden als data quality onder minimum is.
- [ ] Niet traden als market worth trading score te laag is.
- [ ] Niet traden als daily drawdown limiet geraakt is.

### Taken

- [ ] Maak centrale hard-block registry.
- [ ] Koppel registry aan policy engine.
- [ ] Koppel registry aan fast execution.
- [ ] Koppel registry aan neural autonomy.
- [ ] Koppel registry aan live readiness.
- [ ] Toon actieve never-trade regels in dashboard.
- [ ] Test elke regel afzonderlijk.

### Acceptance criteria

- [ ] Hard blocks zijn niet verspreid over losse modules.
- [ ] Neural kan never-trade regels niet overrulen.
- [ ] Fast execution kan never-trade regels niet overrulen.

---

## 11. Strategy Kill-Switch per familie

### Doel

Niet alleen globale kill-switch, maar gericht strategieën/families/regimes kunnen pauzeren.

### Nieuwe module

```txt
src/strategies/strategyKillSwitch.js
```

### Kill-switch scopes

- [ ] Per strategy.
- [ ] Per strategy family.
- [ ] Per symbol.
- [ ] Per regime.
- [ ] Per session.
- [ ] Per neural model.
- [ ] Per execution style.
- [ ] Per account profile.
- [ ] Per broker route.

### Taken

- [ ] Maak kill-switch registry.
- [ ] Maak command `strategy:kill <scope>`.
- [ ] Maak command `strategy:resume <scope>`.
- [ ] Vereis reason bij kill-switch.
- [ ] Vereis review bij resume.
- [ ] Audit alle kill/resume acties.
- [ ] Toon active kill-switches in dashboard.
- [ ] Auto-kill bij loss streak.
- [ ] Auto-kill bij drawdown.
- [ ] Auto-kill bij high reality gap.
- [ ] Auto-kill bij repeated execution failure.

### Acceptance criteria

- [ ] Slechte strategie kan gepauzeerd worden zonder hele bot te stoppen.
- [ ] Resume is expliciet en auditbaar.
- [ ] Kill-switch kan hard safety niet versoepelen.

---

## 12. Trade Explainability Receipt

### Doel

Elke trade krijgt een duidelijk bonnetje met waarom hij genomen werd.

### Nieuwe module

```txt
src/trading/tradeReceipt.js
```

### Receipt onderdelen

- [ ] Symbol.
- [ ] Direction.
- [ ] Strategy.
- [ ] Entry reason.
- [ ] Size reason.
- [ ] Risk reason.
- [ ] Execution reason.
- [ ] Exit plan.
- [ ] Stop reason.
- [ ] Take-profit reason.
- [ ] Neural agreement.
- [ ] Data quality.
- [ ] Liquidity quality.
- [ ] Cost estimate.
- [ ] Portfolio impact.
- [ ] What could go wrong.
- [ ] Why this trade was allowed.
- [ ] Why this trade was not blocked.

### Voorbeeld

```txt
Trade: BTCUSDT long
Waarom: breakout + volume + book pressure
Waarom size: exposure laag + volatility acceptabel
Waarom execution: maker order door lage spread
Waarom risk oké: drawdown budget vrij
Wat kan fout gaan: hoge BTC-correlatie en volatility expansion
```

### Taken

- [ ] Genereer receipt vóór execution.
- [ ] Sla receipt op bij trade trace.
- [ ] Toon receipt in dashboard.
- [ ] Voeg receipt toe aan incident export.
- [ ] Voeg receipt toe aan replay output.
- [ ] Voeg receipt toe aan training labels.

### Acceptance criteria

- [ ] Elke trade heeft een begrijpelijke uitleg.
- [ ] Receipt bevat geen secrets.
- [ ] Receipt is beschikbaar voor paper, live en replay.

---

## 13. Operator Mistake Protection

### Doel

Bescherming tegen menselijke fouten in config, live mode en dashboard.

### Nieuwe module

```txt
src/ops/operatorMistakeProtection.js
```

### Detecties

- [ ] Live mode met demo endpoint.
- [ ] Live mode zonder exchange protection.
- [ ] Live mode met lege watchlist.
- [ ] Live mode met extreem hoge trade size.
- [ ] Live mode met dashboard publiek bereikbaar.
- [ ] API keys met withdrawal permission.
- [ ] Dubbele `.env` keys.
- [ ] Verkeerde runtime directory.
- [ ] Runtime directory in cloud sync folder.
- [ ] Fast live execution per ongeluk aan.
- [ ] Neural live autonomy per ongeluk aan.
- [ ] Paper profile gebruikt live keys.
- [ ] Live profile gebruikt paper settings.
- [ ] Max exposure boven veilige limiet.
- [ ] Manual review genegeerd.

### Taken

- [ ] Maak mistake protection checks.
- [ ] Voeg checks toe aan setup wizard.
- [ ] Voeg checks toe aan readiness gate.
- [ ] Voeg checks toe aan dashboard.
- [ ] Block critical mistakes.
- [ ] Warn medium mistakes.
- [ ] Audit ignored warnings.
- [ ] Vereis confirm flag bij risk-increasing mistakes.

### Acceptance criteria

- [ ] Veelgemaakte operatorfouten worden vroeg gevonden.
- [ ] Kritieke fouten blokkeren live.
- [ ] Warnings zijn duidelijk en actiegericht.

---

## 14. Market Worth Trading Score

### Doel

Een score voor de hele markt, zodat de bot weet wanneer de markt niet interessant of te riskant is.

### Nieuwe module

```txt
src/market/marketWorthTradingScore.js
```

### Componenten

- [ ] BTC trend health.
- [ ] ETH trend health.
- [ ] Market breadth.
- [ ] Volatility condition.
- [ ] Liquidity condition.
- [ ] Stablecoin stress.
- [ ] News/event risk.
- [ ] Exchange reliability.
- [ ] Correlation risk.
- [ ] Spread regime.
- [ ] Volume participation.
- [ ] Funding/event risk.
- [ ] Risk-on/risk-off proxy.
- [ ] Altcoin strength.
- [ ] Data quality.

### Taken

- [ ] Bereken score 0-1.
- [ ] Maak status: `good`, `selective`, `defensive`, `do_not_trade`.
- [ ] Gebruik score als global risk multiplier.
- [ ] Gebruik score in do-nothing intelligence.
- [ ] Gebruik score in bot personality mode.
- [ ] Blokkeer entries als score extreem laag is.
- [ ] Toon score in dashboard.
- [ ] Voeg score toe aan daily briefing.
- [ ] Voeg score toe aan replay/training context.

### Acceptance criteria

- [ ] Bot kan hele markt als ongeschikt markeren.
- [ ] Lage score verlaagt risico.
- [ ] Extreem lage score kan entries blokkeren.

---

## 15. AI Change Budget

### Doel

Voorkomen dat AI zichzelf te vaak of te agressief aanpast.

### Nieuwe module

```txt
src/ai/governance/aiChangeBudget.js
```

### Budgetten

- [ ] Max AI-aanpassingen per dag.
- [ ] Max AI-aanpassingen per week.
- [ ] Max threshold shift per dag.
- [ ] Max threshold shift per week.
- [ ] Max size-bias shift per dag.
- [ ] Max actieve experiments.
- [ ] Max model promotions per week.
- [ ] Max autonomy level increase per periode.
- [ ] Cooldown na rollback.
- [ ] Cooldown na drawdown.
- [ ] Cooldown na calibration breach.
- [ ] Cooldown na reality-gap breach.

### Taken

- [ ] Maak budget tracker.
- [ ] Koppel budget aan neural self-tuning.
- [ ] Koppel budget aan parameter governor.
- [ ] Koppel budget aan model promotions.
- [ ] Koppel budget aan autonomy governor.
- [ ] Blokkeer AI change bij budget breach.
- [ ] Toon budget usage in dashboard.
- [ ] Audit elke AI change.
- [ ] Reset budget volgens schema.
- [ ] Operator kan budget verlagen.
- [ ] Budget verhogen vereist approval.

### Acceptance criteria

- [ ] AI kan niet onbeperkt blijven aanpassen.
- [ ] Rollback veroorzaakt cooldown.
- [ ] Budget breach blokkeert nieuwe self-tuning acties.

---

## 16. Implementatieprioriteit

### Eerst bouwen

- [ ] Mission Control.
- [ ] Never-Trade-When Rules.
- [ ] Trade Quality Score.
- [ ] Market Worth Trading Score.
- [ ] Loss Prevention AI.

### Daarna bouwen

- [ ] Reality Gap Detector.
- [ ] Capital Allocation AI.
- [ ] Strategy Kill-Switch per familie.
- [ ] Trade Explainability Receipt.
- [ ] Operator Mistake Protection.

### Later bouwen

- [ ] Bot Personality Modes.
- [ ] Market Regime Playbooks.
- [ ] Trading System Scorecard.
- [ ] AI Change Budget.
- [ ] Do-Nothing Intelligence.

---

## 17. Eindcontrole

Deze roadmap is klaar wanneer:

- [ ] Operator in Mission Control ziet wat de bot doet.
- [ ] Elke trade een quality score heeft.
- [ ] Elke trade een explainability receipt heeft.
- [ ] De bot marktbrede ongunstige condities kan herkennen.
- [ ] Loss Prevention AI alleen defensief kan handelen.
- [ ] AI zichzelf niet onbeperkt kan aanpassen.
- [ ] Reality gap live promotie kan blokkeren.
- [ ] Never-trade regels door niets kunnen worden overrulled.
- [ ] Strategy kill-switches gericht kunnen ingrijpen.
- [ ] Operatorfouten vroeg worden geblokkeerd.
