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

- [x] Maak centrale Mission Control summary.
- [x] Toon huidige bot mode.
- [x] Toon huidige operator mode.
- [x] Toon of nieuwe entries toegestaan zijn.
- [x] Toon of exits/protection actief blijven.
- [x] Toon grootste actieve blocker.
- [x] Toon grootste actieve risico.
- [x] Toon laatste tradebeslissing.
- [x] Toon waarom de bot wel/niet handelt.
- [x] Toon welke module trading blokkeert.
- [x] Toon welke operatoractie nodig is.
- [x] Toon live readiness.
- [x] Toon neural readiness.
- [x] Toon fast execution readiness.
- [x] Toon data freshness status.
- [x] Toon exchange safety status.
- [x] Toon position protection status.
- [x] Maak command `ops:mission-control`.
- [x] Maak dashboard/API endpoint `/api/mission-control`.

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

- [x] Operator ziet binnen 10 seconden wat de bot doet.
- [x] Mission Control opent nooit trades.
- [x] Mission Control verhoogt nooit risico.
- [x] Elke critical status linkt naar een concrete actie of runbook.

---

## 2. Capital Allocation AI

### Doel

Een aparte AI-laag die niet beslist “koop/verkoop”, maar hoeveel kapitaal elk onderdeel veilig mag gebruiken.

### Nieuwe module

```txt
src/ai/capital/capitalAllocationAI.js
```

### Taken

- [x] Maak kapitaalbudget per strategy family.
- [x] Maak kapitaalbudget per symbool.
- [x] Maak kapitaalbudget per regime.
- [x] Maak kapitaalbudget per sessie.
- [x] Maak kapitaalbudget per neural model.
- [x] Maak kapitaalbudget per fast execution lane.
- [x] Maak kapitaalbudget per broker/account.
- [x] Meet capital efficiency per strategie.
- [x] Meet capital efficiency per symbol.
- [x] Meet drawdown impact per strategie.
- [x] Meet correlation-adjusted capital usage.
- [x] Verlaag automatisch budget bij slechte performance.
- [x] Verlaag automatisch budget bij hoge drawdown.
- [x] Verlaag automatisch budget bij hoge slippage.
- [x] Verlaag automatisch budget bij hoge correlation exposure.
- [x] Stel budgetverhoging alleen voor als proposal.
- [x] Vereis approval voor budgetverhoging.
- [x] Log alle budgetwijzigingen.
- [x] Toon budgetverdeling in dashboard.

### Safetyregels

- [x] AI mag risico automatisch verlagen.
- [x] AI mag risico nooit automatisch boven hard caps verhogen.
- [x] AI mag max total exposure nooit verhogen.
- [x] AI mag live budget niet verhogen zonder approval.
- [x] AI mag budget niet aanpassen als data quality slecht is.

### Acceptance criteria

- [x] Kapitaalverdeling is traceerbaar.
- [x] Budgetverlaging kan automatisch.
- [x] Budgetverhoging vereist governance.
- [x] Capital Allocation AI kan geen orders plaatsen.

---

## 3. Do-Nothing Intelligence

### Doel

De bot moet leren wanneer niets doen de beste trade is.

### Nieuwe module

```txt
src/ai/decision/doNothingIntelligence.js
```

### Taken

- [x] Detecteer marktomstandigheden waarin traden historisch slecht was.
- [x] Label correcte skips.
- [x] Label onnodige trades.
- [x] Label avoided losses.
- [x] Label “market not worth trading”.
- [x] Meet winst/verlies van niet-handelen.
- [x] Beloon correcte skips in learning.
- [x] Straf onnodige trades in training.
- [x] Geef `doNothingScore` per candidate.
- [x] Geef `doNothingScore` voor hele markt.
- [x] Toon “best avoided losses” in dashboard.
- [x] Voeg do-nothing score toe aan decision pipeline.
- [x] Gebruik do-nothing score als hard caution, niet als live override.
- [x] Voeg replay cases toe voor onnodige trades.

### Labels

- [x] `correct_skip`
- [x] `bad_skip`
- [x] `avoided_loss`
- [x] `unnecessary_trade`
- [x] `market_too_noisy`
- [x] `risk_not_worth_reward`
- [x] `liquidity_not_worth_trade`
- [x] `execution_cost_too_high`

### Acceptance criteria

- [x] Bot leert van niet-handelen.
- [x] Niet-handelen wordt zichtbaar als positieve beslissing.
- [x] Do-nothing layer kan risico verlagen maar niet automatisch verhogen.

---

## 4. Market Regime Playbooks

### Doel

Voor elk markttype een eigen draaiboek, zodat de bot niet één universele aanpak forceert.

### Nieuwe module

```txt
src/market/regimePlaybooks.js
```

### Playbooks

- [x] Bull trend playbook.
- [x] Bear trend playbook.
- [x] Sideways/range playbook.
- [x] High volatility playbook.
- [x] Low volatility playbook.
- [x] Low liquidity playbook.
- [x] News shock playbook.
- [x] Weekend playbook.
- [x] Funding window playbook.
- [x] Exchange degraded playbook.
- [x] Recovery mode playbook.

### Per playbook definiëren

- [x] Allowed strategy families.
- [x] Blocked strategy families.
- [x] Max risk multiplier.
- [x] Max position count.
- [x] Max position fraction.
- [x] Min liquidity score.
- [x] Min data quality.
- [x] Allowed execution styles.
- [x] Exit aggressiveness.
- [x] Neural influence limit.
- [x] Fast execution permission.
- [x] Required operator approval.

### Acceptance criteria

- [x] Elke regime heeft duidelijke tradingregels.
- [x] Playbooks kunnen risk verlagen.
- [x] Playbooks kunnen hard safety niet versoepelen.
- [x] Dashboard toont actief playbook.

---

## 5. Loss Prevention AI

### Doel

Een AI-laag die alleen probeert verliezen te voorkomen. Deze laag mag automatisch risico verlagen, maar nooit risico verhogen.

### Nieuwe module

```txt
src/ai/risk/lossPreventionAI.js
```

### Detecties

- [x] Verhoogde kans op slechte entry.
- [x] Verhoogde kans op late entry.
- [x] Verhoogde kans op early failure.
- [x] Verhoogde kans op stop-loss hit.
- [x] Verhoogde kans op slippage spike.
- [x] Verhoogde kans op spread shock.
- [x] Verhoogde kans op liquidity evaporation.
- [x] Verhoogde kans op bad exit.
- [x] Verhoogde kans op late exit.
- [x] Verhoogde kans op model overconfidence.
- [x] Verhoogde kans op correlated loss.
- [x] Verhoogde kans op news shock.
- [x] Verhoogde kans op data-quality failure.

### Mogelijke acties

- [x] Entry blokkeren.
- [x] Position size verlagen.
- [x] Strategy tijdelijk pauzeren.
- [x] Symbol cooldown activeren.
- [x] Fast execution uitzetten.
- [x] Neural influence verlagen.
- [x] Exit caution verhogen.
- [x] Operator alert sturen.
- [x] Replay case aanmaken.

### No-go

- [x] Loss Prevention AI mag nooit size verhogen.
- [x] Loss Prevention AI mag nooit entry forceren.
- [x] Loss Prevention AI mag nooit hard blockers overrulen.
- [x] Loss Prevention AI mag nooit LiveBroker direct aanroepen.

### Acceptance criteria

- [x] Loss Prevention AI kan alleen defensieve acties uitvoeren.
- [x] Elke actie is auditbaar.
- [x] Operator ziet welke verliezen mogelijk voorkomen zijn.

---

## 6. Trade Quality Score vóór execution

### Doel

Elke mogelijke trade krijgt een totale kwaliteitsscore voordat hij naar execution mag.

### Nieuwe module

```txt
src/trading/tradeQualityScore.js
```

### Scorecomponenten

- [x] Signal quality.
- [x] Data quality.
- [x] Execution quality.
- [x] Risk/reward quality.
- [x] Liquidity quality.
- [x] Regime fit.
- [x] Portfolio fit.
- [x] Neural agreement.
- [x] Cost/fee quality.
- [x] Correlation quality.
- [x] Session quality.
- [x] News/event risk quality.
- [x] Position protection readiness.

### Taken

- [x] Maak totale trade quality score.
- [x] Maak minimum score voor paper.
- [x] Maak minimum score voor live.
- [x] Maak strengere score voor fast execution.
- [x] Maak strengere score voor neural live autonomy.
- [x] Toon score per candidate.
- [x] Toon zwakste component.
- [x] Blokkeer trade als score onder minimum is.
- [x] Voeg score toe aan trade receipt.
- [x] Voeg score toe aan replay/training labels.

### Acceptance criteria

- [x] Geen trade zonder quality score.
- [x] Score is uitlegbaar per component.
- [x] Lage score verlaagt risico of blokkeert entry.

---

## 7. Bot Personality Modes

### Doel

Duidelijke risk-modi maken voor verschillende situaties.

### Modes

- [x] `ultra_safe`
- [x] `learning_paper`
- [x] `conservative_live`
- [x] `recovery_mode`
- [x] `high_confidence_only`
- [x] `no_new_entries`
- [x] `exit_management_only`
- [x] `neural_shadow_only`
- [x] `fast_execution_disabled`
- [x] `incident_mode`

### Taken

- [x] Maak `src/runtime/botPersonalityMode.js`.
- [x] Definieer toegestane acties per mode.
- [x] Definieer risk multiplier per mode.
- [x] Definieer neural permission per mode.
- [x] Definieer fast execution permission per mode.
- [x] Definieer entry permission per mode.
- [x] Definieer exit/protection permission per mode.
- [x] Voeg mode toe aan dashboard.
- [x] Voeg mode toe aan audit events.
- [x] Maak command `bot:mode <mode>`.
- [x] Vereis confirmation voor risk-increasing modes.

### Acceptance criteria

- [x] `exit_management_only` beheert bestaande posities maar opent niets nieuws.
- [x] `no_new_entries` blokkeert entries maar laat exits/protection actief.
- [x] Incident mode verlaagt risico automatisch.
- [x] Modes kunnen hard safety niet versoepelen.

---

## 8. Reality Gap Detector

### Doel

Detecteren wanneer replay/paper te optimistisch is vergeleken met echte live observe/live data.

### Nieuwe module

```txt
src/research/realityGapDetector.js
```

### Detecties

- [x] Paper verwacht fill, live krijgt geen fill.
- [x] Paper slippage laag, live slippage hoog.
- [x] Replay winstgevend, paper niet.
- [x] Paper winstgevend, live niet.
- [x] Neural goed in replay, slecht in live observe.
- [x] Execution model goed in paper, slecht in live.
- [x] Spread assumptions te optimistisch.
- [x] Latency assumptions te optimistisch.
- [x] Maker fill assumptions te optimistisch.
- [x] Partial fill model te optimistisch.
- [x] Stop-loss slippage onderschat.
- [x] Market impact onderschat.

### Taken

- [x] Maak reality gap score.
- [x] Maak gap per symbol.
- [x] Maak gap per strategy.
- [x] Maak gap per session.
- [x] Maak gap per execution style.
- [x] Maak gap per neural model.
- [x] Verlaag paper-to-live readiness bij hoge gap.
- [x] Blokkeer live promotie bij extreme gap.
- [x] Toon reality gap in dashboard.
- [x] Voeg gap toe aan model/strategy cards.

### Acceptance criteria

- [x] Live promotie houdt rekening met verschil tussen simulatie en realiteit.
- [x] Paper simulator wordt gekalibreerd met live feedback.
- [x] Hoge reality gap verlaagt autonomie.

---

## 9. Trading System Scorecard

### Doel

Elke dag/week een score per onderdeel van het trading systeem.

### Nieuwe module

```txt
src/reporting/tradingSystemScorecard.js
```

### Scores

- [x] Signal score.
- [x] Risk score.
- [x] Execution score.
- [x] Exit score.
- [x] Neural score.
- [x] Data score.
- [x] Portfolio score.
- [x] Liquidity score.
- [x] Cost score.
- [x] Operator safety score.
- [x] Reality gap score.
- [x] Position protection score.
- [x] Replay quality score.
- [x] Paper/live alignment score.

### Taken

- [x] Maak daily scorecard.
- [x] Maak weekly scorecard.
- [x] Toon weakest module.
- [x] Toon strongest module.
- [x] Toon recommended fix.
- [x] Toon trend versus vorige periode.
- [x] Maak command `report:scorecard`.
- [x] Voeg scorecard toe aan dashboard.
- [x] Voeg scorecard toe aan daily briefing.

### Acceptance criteria

- [x] Operator ziet waar de bot zwak is.
- [x] Scorecard opent geen trades.
- [x] Scorecard geeft veilige verbeteracties.

---

## 10. Never-Trade-When Rules

### Doel

Een centrale lijst met harde anti-trading regels.

### Nieuwe module

```txt
src/risk/neverTradeWhenRules.js
```

### Regels

- [x] Niet traden bij stale order book.
- [x] Niet traden bij exchange mismatch.
- [x] Niet traden bij hoge spread.
- [x] Niet traden bij te hoge slippage.
- [x] Niet traden bij unresolved execution intent.
- [x] Niet traden bij slechte clock sync.
- [x] Niet traden bij open critical alert.
- [x] Niet traden als audit niet geschreven kan worden.
- [x] Niet traden als state niet geschreven kan worden.
- [x] Niet traden als open live positie manual review vereist.
- [x] Niet traden als exchange protection uit is.
- [x] Niet traden als live acknowledgement ontbreekt.
- [x] Niet traden als withdrawal permission onverwacht actief is.
- [x] Niet traden als data quality onder minimum is.
- [x] Niet traden als market worth trading score te laag is.
- [x] Niet traden als daily drawdown limiet geraakt is.

### Taken

- [x] Maak centrale hard-block registry.
- [x] Koppel registry aan policy engine.
- [x] Koppel registry aan fast execution.
- [x] Koppel registry aan neural autonomy.
- [x] Koppel registry aan live readiness.
- [x] Toon actieve never-trade regels in dashboard.
- [x] Test elke regel afzonderlijk.

### Acceptance criteria

- [x] Hard blocks zijn niet verspreid over losse modules.
- [x] Neural kan never-trade regels niet overrulen.
- [x] Fast execution kan never-trade regels niet overrulen.

---

## 11. Strategy Kill-Switch per familie

### Doel

Niet alleen globale kill-switch, maar gericht strategieën/families/regimes kunnen pauzeren.

### Nieuwe module

```txt
src/strategies/strategyKillSwitch.js
```

### Kill-switch scopes

- [x] Per strategy.
- [x] Per strategy family.
- [x] Per symbol.
- [x] Per regime.
- [x] Per session.
- [x] Per neural model.
- [x] Per execution style.
- [x] Per account profile.
- [x] Per broker route.

### Taken

- [x] Maak kill-switch registry.
- [x] Maak command `strategy:kill <scope>`.
- [x] Maak command `strategy:resume <scope>`.
- [x] Vereis reason bij kill-switch.
- [x] Vereis review bij resume.
- [x] Audit alle kill/resume acties.
- [x] Toon active kill-switches in dashboard.
- [x] Auto-kill bij loss streak.
- [x] Auto-kill bij drawdown.
- [x] Auto-kill bij high reality gap.
- [x] Auto-kill bij repeated execution failure.

### Acceptance criteria

- [x] Slechte strategie kan gepauzeerd worden zonder hele bot te stoppen.
- [x] Resume is expliciet en auditbaar.
- [x] Kill-switch kan hard safety niet versoepelen.

---

## 12. Trade Explainability Receipt

### Doel

Elke trade krijgt een duidelijk bonnetje met waarom hij genomen werd.

### Nieuwe module

```txt
src/trading/tradeReceipt.js
```

### Receipt onderdelen

- [x] Symbol.
- [x] Direction.
- [x] Strategy.
- [x] Entry reason.
- [x] Size reason.
- [x] Risk reason.
- [x] Execution reason.
- [x] Exit plan.
- [x] Stop reason.
- [x] Take-profit reason.
- [x] Neural agreement.
- [x] Data quality.
- [x] Liquidity quality.
- [x] Cost estimate.
- [x] Portfolio impact.
- [x] What could go wrong.
- [x] Why this trade was allowed.
- [x] Why this trade was not blocked.

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

- [x] Genereer receipt vóór execution.
- [x] Sla receipt op bij trade trace.
- [x] Toon receipt in dashboard.
- [x] Voeg receipt toe aan incident export.
- [x] Voeg receipt toe aan replay output.
- [x] Voeg receipt toe aan training labels.

### Acceptance criteria

- [x] Elke trade heeft een begrijpelijke uitleg.
- [x] Receipt bevat geen secrets.
- [x] Receipt is beschikbaar voor paper, live en replay.

---

## 13. Operator Mistake Protection

### Doel

Bescherming tegen menselijke fouten in config, live mode en dashboard.

### Nieuwe module

```txt
src/ops/operatorMistakeProtection.js
```

### Detecties

- [x] Live mode met demo endpoint.
- [x] Live mode zonder exchange protection.
- [x] Live mode met lege watchlist.
- [x] Live mode met extreem hoge trade size.
- [x] Live mode met dashboard publiek bereikbaar.
- [x] API keys met withdrawal permission.
- [x] Dubbele `.env` keys.
- [x] Verkeerde runtime directory.
- [x] Runtime directory in cloud sync folder.
- [x] Fast live execution per ongeluk aan.
- [x] Neural live autonomy per ongeluk aan.
- [x] Paper profile gebruikt live keys.
- [x] Live profile gebruikt paper settings.
- [x] Max exposure boven veilige limiet.
- [x] Manual review genegeerd.

### Taken

- [x] Maak mistake protection checks.
- [x] Voeg checks toe aan setup wizard.
- [x] Voeg checks toe aan readiness gate.
- [x] Voeg checks toe aan dashboard.
- [x] Block critical mistakes.
- [x] Warn medium mistakes.
- [x] Audit ignored warnings.
- [x] Vereis confirm flag bij risk-increasing mistakes.

### Acceptance criteria

- [x] Veelgemaakte operatorfouten worden vroeg gevonden.
- [x] Kritieke fouten blokkeren live.
- [x] Warnings zijn duidelijk en actiegericht.

---

## 14. Market Worth Trading Score

### Doel

Een score voor de hele markt, zodat de bot weet wanneer de markt niet interessant of te riskant is.

### Nieuwe module

```txt
src/market/marketWorthTradingScore.js
```

### Componenten

- [x] BTC trend health.
- [x] ETH trend health.
- [x] Market breadth.
- [x] Volatility condition.
- [x] Liquidity condition.
- [x] Stablecoin stress.
- [x] News/event risk.
- [x] Exchange reliability.
- [x] Correlation risk.
- [x] Spread regime.
- [x] Volume participation.
- [x] Funding/event risk.
- [x] Risk-on/risk-off proxy.
- [x] Altcoin strength.
- [x] Data quality.

### Taken

- [x] Bereken score 0-1.
- [x] Maak status: `good`, `selective`, `defensive`, `do_not_trade`.
- [x] Gebruik score als global risk multiplier.
- [x] Gebruik score in do-nothing intelligence.
- [x] Gebruik score in bot personality mode.
- [x] Blokkeer entries als score extreem laag is.
- [x] Toon score in dashboard.
- [x] Voeg score toe aan daily briefing.
- [x] Voeg score toe aan replay/training context.

### Acceptance criteria

- [x] Bot kan hele markt als ongeschikt markeren.
- [x] Lage score verlaagt risico.
- [x] Extreem lage score kan entries blokkeren.

---

## 15. AI Change Budget

### Doel

Voorkomen dat AI zichzelf te vaak of te agressief aanpast.

### Nieuwe module

```txt
src/ai/governance/aiChangeBudget.js
```

### Budgetten

- [x] Max AI-aanpassingen per dag.
- [x] Max AI-aanpassingen per week.
- [x] Max threshold shift per dag.
- [x] Max threshold shift per week.
- [x] Max size-bias shift per dag.
- [x] Max actieve experiments.
- [x] Max model promotions per week.
- [x] Max autonomy level increase per periode.
- [x] Cooldown na rollback.
- [x] Cooldown na drawdown.
- [x] Cooldown na calibration breach.
- [x] Cooldown na reality-gap breach.

### Taken

- [x] Maak budget tracker.
- [x] Koppel budget aan neural self-tuning.
- [x] Koppel budget aan parameter governor.
- [x] Koppel budget aan model promotions.
- [x] Koppel budget aan autonomy governor.
- [x] Blokkeer AI change bij budget breach.
- [x] Toon budget usage in dashboard.
- [x] Audit elke AI change.
- [x] Reset budget volgens schema.
- [x] Operator kan budget verlagen.
- [x] Budget verhogen vereist approval.

### Acceptance criteria

- [x] AI kan niet onbeperkt blijven aanpassen.
- [x] Rollback veroorzaakt cooldown.
- [x] Budget breach blokkeert nieuwe self-tuning acties.

---

## 16. Implementatieprioriteit

### Eerst bouwen

- [x] Mission Control.
- [x] Never-Trade-When Rules.
- [x] Trade Quality Score.
- [x] Market Worth Trading Score.
- [x] Loss Prevention AI.

### Daarna bouwen

- [x] Reality Gap Detector.
- [x] Capital Allocation AI.
- [x] Strategy Kill-Switch per familie.
- [x] Trade Explainability Receipt.
- [x] Operator Mistake Protection.

### Later bouwen

- [x] Bot Personality Modes.
- [x] Market Regime Playbooks.
- [x] Trading System Scorecard.
- [x] AI Change Budget.
- [x] Do-Nothing Intelligence.

---

## 17. Eindcontrole

Deze roadmap is klaar wanneer:

- [x] Operator in Mission Control ziet wat de bot doet.
- [x] Elke trade een quality score heeft.
- [x] Elke trade een explainability receipt heeft.
- [x] De bot marktbrede ongunstige condities kan herkennen.
- [x] Loss Prevention AI alleen defensief kan handelen.
- [x] AI zichzelf niet onbeperkt kan aanpassen.
- [x] Reality gap live promotie kan blokkeren.
- [x] Never-trade regels door niets kunnen worden overrulled.
- [x] Strategy kill-switches gericht kunnen ingrijpen.
- [x] Operatorfouten vroeg worden geblokkeerd.
