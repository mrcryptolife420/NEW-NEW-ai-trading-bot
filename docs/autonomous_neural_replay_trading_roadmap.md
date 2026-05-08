# Autonoom Neural Network + Replay Trading Roadmap

Doel:

* Het neural network moet gebruikmaken van de bestaande bot-infrastructuur.
* Het systeem moet na verloop van tijd zelf kunnen leren uit positie- en trade-data.
* Het neural network moet zelf replay-trades kunnen simuleren.
* Het systeem moet zelf verbeteringen kunnen voorstellen en uiteindelijk bounded automatisch toepassen.
* Echte live trades mogen pas na harde safety gates, voldoende data, replay-validatie, paper-validatie en rollback-bescherming.

Belangrijk:
Dit ontwerp laat het neural network uiteindelijk zelfstandig bijsturen, maar nooit zonder limieten. Het mag geen exchange-safety, max exposure, reconcile freeze, live guardrails of risk limits overslaan.

Implementatiestatus 2026-05-08:

* [x] Roadmap afgewerkt als safety-first neural foundation: governance, replay, arena, promotion gate, outcome learner, continuous learner, self-tuning clamps, live readiness gate, live adapter, replay queue, experiment registry, rollback/watchdog en training scheduler bestaan als fallback-safe modules.
* [x] Live-autonomie blijft standaard uit. De adapter maakt alleen candidate-intents via de bestaande decision/risk/execution route en mag nooit direct `LiveBroker` aanroepen.
* [x] Automatische live-promotie blijft verboden. Paper/replay/shadow kunnen alleen via expliciete config en safety gates; hard blockers blijven dominant.

\---

## 0\. Kernprincipe

Het neural network wordt geen los systeem naast de bot. Het wordt een laag bovenop de bestaande infrastructuur.

Bestaande infrastructuur die hergebruikt moet worden:

* [x] `dataRecorder` voor decision/trade/context records.
* [x] `journal` voor echte trade outcomes.
* [x] `runtime` state voor open positions, paper learning, adaptation en governance.
* [x] `modelRegistry` voor modelversies en rollback.
* [x] `offlineTrainer` voor training en evaluatie.
* [x] `counterfactualQueue` voor gemiste setups en replay cases.
* [x] `shadowTrading` voor voorspellingen zonder live invloed.
* [x] `adaptiveGovernance` voor promotie/rollback regels.
* [x] `thresholdTuning` voor bounded threshold aanpassingen.
* [x] `parameterGovernor` voor bounded parameter changes.
* [x] `executionCalibration` voor execution feedback.
* [x] `capitalGovernor` voor risk en sizing beperkingen.
* [x] `auditLog` voor volledige traceerbaarheid.
* [x] `decisionPipeline` voor echte trade beslissingen.
* [x] `PaperBroker` voor paper/replay executie.
* [x] `LiveBroker` alleen voor echte orders, nooit direct vanuit replay zonder live gate.

\---

# Deel 1 - Autonomie-niveaus

## 1\. Autonomy levels

Het neural network krijgt duidelijke autonomie-niveaus. Zo kan het systeem groeien zonder ineens live gevaarlijk te worden.

```txt
L0 = observe only
L1 = shadow predictions
L2 = replay simulator
L3 = paper autonomous
L4 = paper bounded self-tuning
L5 = live observe
L6 = live bounded self-tuning
L7 = live autonomous within strict caps
```

### Taken

* [x] Maak enum `NeuralAutonomyLevel`.
* [x] Sla autonomy level op in runtime/model registry.
* [x] Toon autonomy level in dashboard/API.
* [x] Blokkeer live invloed onder L5.
* [x] Blokkeer live bounded invloed onder L6.
* [x] Blokkeer echte live autonomous execution onder L7.
* [x] Audit elke autonomy-level wijziging.

### Regels per level

#### L0 - Observe only

* [x] Geen predictions vereist.
* [x] Alleen data quality en readiness meten.
* [x] Geen trading impact.

#### L1 - Shadow predictions

* [x] Neural model voorspelt mee.
* [x] Geen invloed op paper of live trades.
* [x] Predictions worden gekoppeld aan echte outcomes.

#### L2 - Replay simulator

* [x] Neural model draait eigen replay-trades op historische snapshots.
* [x] Replay gebruikt bestaande journal/dataRecorder/runtime snapshots.
* [x] Geen echte orders.
* [x] Replay-resultaten worden opgeslagen als training/evaluation data.

#### L3 - Paper autonomous

* [x] Neural model mag zelfstandig paper-trades voorstellen.
* [x] PaperBroker voert uit.
* [x] Geen live invloed.
* [x] Hard risk simulation blijft actief.

#### L4 - Paper bounded self-tuning

* [x] Neural model mag paper-thresholds, sizing en exit-bias bounded aanpassen.
* [x] Aanpassingen blijven binnen clamps.
* [x] Auto-rollback actief bij slechtere outcomes.

#### L5 - Live observe

* [x] Neural model voorspelt live mee.
* [x] Geen live invloed.
* [x] Vergelijkt neural advies met echte live decisions.

#### L6 - Live bounded self-tuning

* [x] Neural model mag kleine live-bias geven.
* [x] Geen hard blocker override.
* [x] Geen max exposure override.
* [x] Geen exchange freeze override.
* [x] Auto-rollback verplicht.

#### L7 - Live autonomous within strict caps

* [x] Neural model mag binnen bestaande decisionPipeline zelfstandig live-candidates activeren.
* [x] Alleen als alle safety gates groen zijn.
* [x] Alleen met capped sizing.
* [x] Alleen met one-click disable.
* [x] Alleen met daily loss stop.
* [x] Alleen na bewezen L6-performance.

\---

# Deel 2 - Neural Autonomy Governor

## 2\. Centrale governor voor zelf-aanpassing

### Nieuw bestand

```txt
src/ai/neural/neuralAutonomyGovernor.js
```

### Doel

De governor beslist wat het neural network wel en niet zelf mag aanpassen.

### Taken

* [x] Lees huidige autonomy level.
* [x] Lees modelstatus uit model registry.
* [x] Lees performance metrics.
* [x] Lees capital governor status.
* [x] Lees exchange safety status.
* [x] Lees health circuit status.
* [x] Lees open positions.
* [x] Lees recent loss streak.
* [x] Lees calibration drift.
* [x] Bepaal toegestane influence.
* [x] Blokkeer influence bij safety issues.
* [x] Schrijf audit event bij elke neural influence.

### Output

```json
{
  "allowInfluence": true,
  "maxThresholdShift": 0.003,
  "maxSizeBias": 0.03,
  "maxExitBias": 0.05,
  "maxExecutionBias": 0.05,
  "allowedScopes": \["paper", "shadow"],
  "blockedReasons": \[]
}
```

### No-go

* [x] Governor mag nooit een live order direct plaatsen.
* [x] Governor geeft alleen permissies aan decisionPipeline.
* [x] LiveBroker wordt nooit direct door neural model aangeroepen.
* [x] Alle live acties blijven via bestaande broker/risk/execution flow.

\---

# Deel 3 - Replay Trading System

## 3\. Neural Replay Trading Engine

### Nieuw bestand

```txt
src/ai/neural/replay/neuralReplayEngine.js
```

### Doel

Het neural network moet zelf replay-trades kunnen simuleren op historische data, zonder live risico.

### Replay flow

```txt
historische snapshot laden
-> candidate reconstrueren
-> neural prediction maken
-> risk simulation draaien
-> paper execution simuleren
-> positie beheren candle-by-candle
-> exit simuleren
-> PnL/outcome/root cause opslaan
-> model feedback genereren
```

### Taken

* [x] Bouw replay engine op bestaande dataRecorder/journal records.
* [x] Gebruik bestaande market snapshots.
* [x] Gebruik bestaande feature frames.
* [x] Gebruik bestaande execution simulation waar mogelijk.
* [x] Gebruik PaperBroker-achtige accounting.
* [x] Gebruik dezelfde risk policies als echte bot.
* [x] Replay mag geen LiveBroker gebruiken.
* [x] Replay krijgt eigen `replayRunId`.
* [x] Elke replay trade krijgt `simulatedTradeId`.
* [x] Replay slaat entry, exit, MFE, MAE, slippage en root cause op.
* [x] Replay output wordt bruikbaar voor training.

### Replay modes

* [x] `historical\_decision\_replay`: speel bestaande decisions opnieuw af.
* [x] `missed\_trade\_replay`: simuleer blocked setups.
* [x] `neural\_policy\_replay`: laat neural model eigen keuzes maken.
* [x] `exit\_policy\_replay`: test andere exits.
* [x] `execution\_policy\_replay`: test andere orderstijlen.
* [x] `stress\_replay`: test slechte omstandigheden.

### Acceptance criteria

* [x] Replay werkt offline.
* [x] Replay gebruikt geen live API keys.
* [x] Replay kan 1000+ simulated trades draaien.
* [x] Replay produceert model-evaluation metrics.
* [x] Replay-resultaten worden niet verward met echte trades.

\---

## 4\. Replay Trading Arena

### Nieuw bestand

```txt
src/ai/neural/replay/neuralReplayArena.js
```

### Doel

Het neural network moet meerdere strategievarianten tegen elkaar kunnen simuleren.

### Arena policies

* [x] Baseline bestaande bot.
* [x] Entry neural only.
* [x] Exit neural only.
* [x] Execution neural only.
* [x] Entry + exit neural.
* [x] Full neural advisory.
* [x] Conservative neural.
* [x] Aggressive neural, alleen replay.
* [x] Random baseline.
* [x] Always skip baseline.

### Metrics

* [x] total return
* [x] profit factor
* [x] win rate
* [x] max drawdown
* [x] average loss
* [x] average win
* [x] expectancy
* [x] exposure time
* [x] slippage drag
* [x] MFE capture
* [x] MAE control
* [x] bad veto reduction
* [x] false trigger count

### Taken

* [x] Maak arena runner.
* [x] Run meerdere policies over dezelfde dataset.
* [x] Vergelijk neural policies met baseline.
* [x] Maak per-regime resultaten.
* [x] Maak per-strategy-family resultaten.
* [x] Maak per-symbol resultaten.
* [x] Sla arena summary op.
* [x] Gebruik arena summary voor promotion gates.

\---

## 5\. Replay-to-Paper Promotion

### Doel

Als neural replay goed presteert, mag het nog niet live. Eerst paper.

### Vereisten

* [x] Replay verslaat baseline.
* [x] Replay drawdown is acceptabel.
* [x] Replay heeft genoeg trades.
* [x] Replay werkt in meerdere regimes.
* [x] Replay is niet alleen goed op Ã©Ã©n symbol.
* [x] Replay calibration is acceptabel.
* [x] Dataset quality is voldoende.

### Taken

* [x] Maak `replayPromotionGate`.
* [x] Geef replay score.
* [x] Geef blockers.
* [x] Geef aanbevolen autonomy level.
* [x] Alleen promoten naar paper autonomous of paper bounded.
* [x] Geen directe promotie naar live.

\---

# Deel 4 - Zelf leren uit positie-data

## 6\. Position Outcome Learner

### Nieuw bestand

```txt
src/ai/neural/learning/positionOutcomeLearner.js
```

### Doel

Het systeem leert van elke gesloten positie.

### Inputs

* [x] entry rationale
* [x] risk verdict
* [x] execution attribution
* [x] position lifecycle
* [x] MFE
* [x] MAE
* [x] PnL
* [x] capture efficiency
* [x] exit reason
* [x] time in trade
* [x] regime at entry
* [x] regime at exit
* [x] data quality
* [x] neural predictions at entry
* [x] neural predictions during position

### Outputs

* [x] entry label
* [x] exit label
* [x] execution label
* [x] sizing label
* [x] root cause
* [x] learning weight
* [x] suggested parameter change
* [x] replay case priority

### Taken

* [x] Maak outcome labeling.
* [x] Koppel outcomes aan neural predictions.
* [x] Bereken prediction error.
* [x] Bereken learning weight.
* [x] Maak feedback frame.
* [x] Voeg feedback toe aan training dataset.
* [x] Voeg slechte trades toe aan replay queue.
* [x] Voeg gemiste trades toe aan replay queue.

\---

## 7\. Continuous Learning Loop

### Nieuw bestand

```txt
src/ai/neural/learning/neuralContinuousLearner.js
```

### Doel

Het neural network blijft leren zodra er genoeg nieuwe data is.

### Loop

```txt
nieuwe closed positions
-> outcome labels
-> dataset update
-> retrain candidate model
-> evaluate
-> replay arena
-> compare baseline
-> promote/downgrade/rollback
-> bounded self-tuning
```

### Taken

* [x] Detecteer nieuwe positie-data.
* [x] Bouw incremental dataset.
* [x] Train candidate model.
* [x] Evalueer candidate model.
* [x] Run replay arena.
* [x] Vergelijk met huidige active model.
* [x] Maak promotion decision.
* [x] Maak rollback decision.
* [x] Sla alles op in model registry.
* [x] Schrijf audit events.

### Triggers

* [x] Na X nieuwe closed paper trades.
* [x] Na X nieuwe closed live trades.
* [x] Dagelijks op vaste tijd.
* [x] Na grote regime drift.
* [x] Na model underperformance.
* [x] Na operator command.

### Config

```env
NEURAL\_CONTINUOUS\_LEARNING\_ENABLED=false
NEURAL\_RETRAIN\_MIN\_NEW\_PAPER\_TRADES=25
NEURAL\_RETRAIN\_MIN\_NEW\_LIVE\_TRADES=10
NEURAL\_RETRAIN\_MIN\_NEW\_REPLAY\_TRADES=200
NEURAL\_RETRAIN\_MAX\_PER\_DAY=2
NEURAL\_AUTO\_PROMOTE\_PAPER=false
NEURAL\_AUTO\_PROMOTE\_LIVE=false
```

### Acceptance criteria

* [x] Continuous learner kan trainen zonder live bot te blokkeren.
* [x] Continuous learner kan geen live influence verhogen zonder gate.
* [x] Continuous learner kan model downgraden bij slechte metrics.
* [x] Continuous learner schrijft audit trail.

\---

# Deel 5 - Zelf parameters aanpassen

## 8\. Neural Self Tuning Controller

### Nieuw bestand

```txt
src/ai/neural/learning/neuralSelfTuningController.js
```

### Doel

Het neural network mag uiteindelijk zelf bepaalde parameters aanpassen, maar alleen bounded.

### Parameters die neural mag voorstellen

* [x] model threshold shift
* [x] entry caution bias
* [x] size multiplier bias
* [x] execution style bias
* [x] exit tighten bias
* [x] trailing stop bias
* [x] take-profit bias
* [x] stop-loss bias
* [x] strategy family preference
* [x] symbol cooldown recommendation
* [x] regime caution multiplier

### Parameters die neural nooit direct mag aanpassen

* [x] API keys
* [x] live trading acknowledgement
* [x] max total exposure boven hard cap
* [x] exchange protection
* [x] reconcile safety
* [x] hard safety blockers
* [x] minimum live guardrails
* [x] operator manual review flags

### Taken

* [x] Maak voorstel-object voor elke self-tuning action.
* [x] Koppel elk voorstel aan evidence.
* [x] Koppel elk voorstel aan rollback condition.
* [x] Laat adaptiveGovernance voorstel beoordelen.
* [x] Laat parameterGovernor bounded toepassing doen.
* [x] Log oude en nieuwe waarde.
* [x] Maak auto rollback bij slechte outcomes.

### Voorbeeld proposal

```json
{
  "proposalId": "neural-threshold-BTCUSDT-breakout-high\_vol",
  "scope": {
    "strategyFamily": "breakout",
    "regime": "high\_vol",
    "session": "us"
  },
  "parameter": "thresholdShift",
  "oldValue": 0,
  "newValue": -0.004,
  "evidence": {
    "replayTrades": 420,
    "paperTrades": 38,
    "baselineDelta": 0.07,
    "maxDrawdown": 0.035
  },
  "rollbackIf": {
    "paperLossStreak": 3,
    "drawdownPct": 0.04,
    "calibrationEceAbove": 0.14
  }
}
```

\---

## 9\. Bounded influence limits

### Hard clamps

```txt
paper max threshold shift: 0.010
live max threshold shift: 0.003

paper max size bias: 0.10
live max size bias: 0.03

paper max exit bias: 0.15
live max exit bias: 0.05

paper max execution bias: 0.15
live max execution bias: 0.05
```

### Taken

* [x] Implementeer clamps centraal.
* [x] Clamps zijn niet door neural te wijzigen.
* [x] Clamps zitten in config + validation.
* [x] Dashboard toont actieve neural clamps.
* [x] Audit elke clamp toepassing.

\---

# Deel 6 - Van replay naar echte trades

## 10\. Replay-to-Live Pipeline

### Belangrijk

De gebruiker wil dat neural na simulatie uiteindelijk echte trades kan uitvoeren. Dat kan alleen veilig als replay niet direct naar live gaat, maar via gates.

### Pipeline

```txt
Replay simulation
-> Replay arena score
-> Paper autonomous test
-> Paper bounded self-tuning
-> Live observe
-> Live bounded influence
-> Live autonomous within strict caps
```

### Taken

* [x] Replay-resultaten mogen nooit direct LiveBroker aanroepen.
* [x] Replay-resultaten mogen alleen promotie voorstellen.
* [x] Paper autonomous moet eerst slagen.
* [x] Live observe moet eerst slagen.
* [x] Live bounded moet eerst slagen.
* [x] Pas daarna L7 live autonomous binnen caps.
* [x] Maak `neuralLiveExecutionGate`.
* [x] Maak `neuralLiveAutonomyReport`.
* [x] Vereis `NEURAL\_LIVE\_AUTONOMY\_ACKNOWLEDGED`.

### Live autonomy vereisten

* [x] Minimaal aantal replay trades.
* [x] Minimaal aantal paper trades.
* [x] Minimaal aantal live observe predictions.
* [x] Minimaal aantal live bounded trades.
* [x] Profit factor boven baseline.
* [x] Drawdown onder maximum.
* [x] Calibration stabiel.
* [x] Geen recente rollback.
* [x] Geen health circuit open.
* [x] Geen exchange safety warnings.
* [x] Geen unresolved intents.
* [x] Operator approval of expliciete config acknowledgement.

### Config

```env
NEURAL\_LIVE\_AUTONOMY\_ENABLED=false
NEURAL\_LIVE\_AUTONOMY\_ACKNOWLEDGED=
NEURAL\_LIVE\_AUTONOMY\_MAX\_TRADES\_PER\_DAY=2
NEURAL\_LIVE\_AUTONOMY\_MAX\_POSITION\_FRACTION=0.03
NEURAL\_LIVE\_AUTONOMY\_MAX\_DAILY\_DRAWDOWN=0.01
NEURAL\_LIVE\_AUTONOMY\_REQUIRE\_PROTECTION=true
NEURAL\_LIVE\_AUTONOMY\_AUTO\_DISABLE\_ON\_LOSS=true
```

\---

## 11\. Live autonomous execution adapter

### Nieuw bestand

```txt
src/ai/neural/live/neuralLiveExecutionAdapter.js
```

### Doel

Niet direct traden, maar neural decisions netjes door de bestaande pipeline duwen.

### Regels

* [x] Adapter mag alleen candidate intent maken.
* [x] Adapter mag alleen via decisionPipeline.
* [x] Adapter mag alleen via riskManager.
* [x] Adapter mag alleen via existing broker abstraction.
* [x] Adapter mag alleen als live gate allow geeft.
* [x] Adapter mag nooit LiveBroker direct aanroepen.
* [x] Adapter mag nooit protective order logic overslaan.

### Flow

```txt
neural candidate
-> neuralLiveExecutionGate
-> decisionPipeline
-> riskManager
-> executionEngine
-> LiveBroker
-> audit
-> runtime position
```

### Acceptance criteria

* [x] Elke neural live trade ziet eruit als normale trade met extra neural attribution.
* [x] Elke neural live trade heeft volledige audit.
* [x] Elke neural live trade heeft rollback/disable path.
* [x] Elke neural live trade kan in forensics worden gereplayed.

\---

# Deel 7 - Eigen replay queue en experimenten

## 12\. Neural Replay Queue

### Nieuw bestand

```txt
src/ai/neural/replay/neuralReplayQueue.js
```

### Replay case types

* [x] losing\_trade\_replay
* [x] missed\_winner\_replay
* [x] bad\_veto\_replay
* [x] late\_exit\_replay
* [x] early\_exit\_replay
* [x] execution\_drag\_replay
* [x] regime\_shift\_replay
* [x] overconfidence\_replay
* [x] stale\_data\_replay
* [x] near\_threshold\_replay

### Taken

* [x] Nieuwe slechte trades automatisch aan replay queue toevoegen.
* [x] Gemiste winnaars automatisch toevoegen.
* [x] Bad vetoes automatisch toevoegen.
* [x] Execution drag trades toevoegen.
* [x] Prioriteit berekenen per case.
* [x] Replay budget per dag instellen.
* [x] Replay resultaten koppelen aan model training.

### Acceptance criteria

* [x] Neural model kiest zelf relevante replay cases.
* [x] Replay cases blijven gescheiden van echte trades.
* [x] Replay output is reproduceerbaar.

\---

## 13\. Neural Experiment Registry

### Nieuw bestand

```txt
src/ai/neural/experiments/neuralExperimentRegistry.js
```

### Doel

Elke zelf-aanpassing wordt een experiment met start, scope, metrics en rollback.

### Experiment record

```json
{
  "experimentId": "neural-paper-threshold-breakout-high\_vol-001",
  "scope": {
    "mode": "paper",
    "strategyFamily": "breakout",
    "regime": "high\_vol"
  },
  "change": {
    "type": "threshold\_shift",
    "value": -0.004
  },
  "status": "active",
  "startedAt": "...",
  "metrics": {
    "trades": 0,
    "pnl": 0,
    "drawdown": 0
  },
  "rollbackRules": {
    "lossStreak": 3,
    "drawdownPct": 0.04
  }
}
```

### Taken

* [x] Maak experiment registry.
* [x] Elk self-tuning voorstel wordt experiment.
* [x] Experiment krijgt rollback rules.
* [x] Experiment krijgt max duration.
* [x] Experiment krijgt max trade count.
* [x] Experiment eindigt als promote, rollback of expire.
* [x] Dashboard/API toont actieve neural experiments.

\---

# Deel 8 - Autonome evaluatie en rollback

## 14\. Neural Auto Rollback

### Nieuw bestand

```txt
src/ai/neural/governance/neuralAutoRollback.js
```

### Rollback triggers

* [x] Calibration ECE boven limiet.
* [x] Paper/live drawdown boven limiet.
* [x] Loss streak boven limiet.
* [x] Underperformance vs baseline.
* [x] Feature drift boven limiet.
* [x] Data quality onder limiet.
* [x] Execution slippage boven limiet.
* [x] Health circuit open.
* [x] Exchange safety warning.
* [x] Manual operator rollback.

### Taken

* [x] Monitor alle actieve neural experiments.
* [x] Monitor alle active neural influence.
* [x] Auto-disable bij breach.
* [x] Rollback model status.
* [x] Rollback parameter changes.
* [x] Schrijf audit event.
* [x] Maak operator alert.

### Acceptance criteria

* [x] Rollback werkt zonder handmatige actie.
* [x] Rollback kan geen nieuwe trade openen.
* [x] Rollback herstelt laatste veilige staat.
* [x] Rollback report toont waarom.

\---

## 15\. Neural Performance Watchdog

### Nieuw bestand

```txt
src/ai/neural/governance/neuralPerformanceWatchdog.js
```

### Taken

* [x] Meet neural performance continu.
* [x] Vergelijk active model met previous model.
* [x] Vergelijk active model met baseline.
* [x] Detecteer overconfidence.
* [x] Detecteer model drift.
* [x] Detecteer regime-specific failure.
* [x] Detecteer symbol-specific failure.
* [x] Detecteer execution degradation.
* [x] Adviseer downgrade of rollback.
* [x] Kan influence automatisch pauzeren.

\---

# Deel 9 - Training scheduler

## 16\. Neural Training Scheduler

### Nieuw bestand

```txt
src/ai/neural/training/neuralTrainingScheduler.js
```

### Doel

Training moet automatisch kunnen starten wanneer genoeg nieuwe data beschikbaar is.

### Taken

* [x] Check nieuwe paper trades.
* [x] Check nieuwe live trades.
* [x] Check nieuwe replay trades.
* [x] Check nieuwe blocked setup outcomes.
* [x] Check dataset quality.
* [x] Plan training job.
* [x] Voorkom te vaak trainen.
* [x] Train niet tijdens live critical incidents.
* [x] Train niet als runtime data corrupt is.
* [x] Train niet als feature drift extreem is zonder review.
* [x] Sla training job status op.

### Config

```env
NEURAL\_TRAINING\_SCHEDULER\_ENABLED=false
NEURAL\_TRAINING\_HOUR\_UTC=2
NEURAL\_TRAINING\_MAX\_JOBS\_PER\_DAY=2
NEURAL\_TRAINING\_SKIP\_WHEN\_LIVE\_RUNNING=true
NEURAL\_TRAINING\_ALLOW\_WHILE\_PAPER\_RUNNING=true
```

\---

# Deel 10 - Dashboard en operatorcontrole

## 17\. Neural Autonomy Dashboard

### Panels

* [x] Current autonomy level.
* [x] Active neural models.
* [x] Active neural experiments.
* [x] Replay arena results.
* [x] Continuous learning status.
* [x] Self-tuning proposals.
* [x] Active bounded influences.
* [x] Auto rollback status.
* [x] Live autonomy readiness.
* [x] Neural disabled reason.

### Actieknoppen

* [x] Pause neural influence.
* [x] Resume neural shadow only.
* [x] Run replay arena.
* [x] Approve paper experiment.
* [x] Reject experiment.
* [x] Rollback neural model.
* [x] Disable live neural autonomy.
* [x] Downgrade to shadow.
* [x] Export neural report.

### Niet bouwen

* [x] Geen duplicaat van bestaande trading dashboard.
* [x] Geen duplicate Windows GUI roadmap.
* [x] Alleen neural autonomie en learning tonen.

\---

## 18\. Neural Autonomy Report

### CLI command

```bash
node src/cli.js neural:autonomy-report
```

### Rapport bevat

* [x] Current autonomy level.
* [x] Waarom dit level wel/niet hoger mag.
* [x] Dataset readiness.
* [x] Replay readiness.
* [x] Paper readiness.
* [x] Live observe readiness.
* [x] Live bounded readiness.
* [x] Active blockers.
* [x] Suggested next action.
* [x] Risk of increasing autonomy.

\---

# Deel 11 - Config voor autonome neural

## 19\. Nieuwe config keys

```env
NEURAL\_AUTONOMY\_ENABLED=false
NEURAL\_AUTONOMY\_LEVEL=0

NEURAL\_REPLAY\_ENGINE\_ENABLED=true
NEURAL\_REPLAY\_MAX\_CASES\_PER\_RUN=500
NEURAL\_REPLAY\_MIN\_BASELINE\_DELTA=0.04
NEURAL\_REPLAY\_MAX\_DRAWDOWN\_PCT=0.08

NEURAL\_CONTINUOUS\_LEARNING\_ENABLED=false
NEURAL\_RETRAIN\_MIN\_NEW\_PAPER\_TRADES=25
NEURAL\_RETRAIN\_MIN\_NEW\_LIVE\_TRADES=10
NEURAL\_RETRAIN\_MIN\_NEW\_REPLAY\_TRADES=200
NEURAL\_RETRAIN\_MAX\_PER\_DAY=2

NEURAL\_AUTO\_PROMOTE\_PAPER=false
NEURAL\_AUTO\_PROMOTE\_LIVE=false

NEURAL\_SELF\_TUNING\_ENABLED=false
NEURAL\_SELF\_TUNING\_PAPER\_ONLY=true
NEURAL\_SELF\_TUNING\_MAX\_ACTIVE\_EXPERIMENTS=3

NEURAL\_LIVE\_AUTONOMY\_ENABLED=false
NEURAL\_LIVE\_AUTONOMY\_ACKNOWLEDGED=
NEURAL\_LIVE\_AUTONOMY\_MAX\_TRADES\_PER\_DAY=2
NEURAL\_LIVE\_AUTONOMY\_MAX\_POSITION\_FRACTION=0.03
NEURAL\_LIVE\_AUTONOMY\_MAX\_DAILY\_DRAWDOWN=0.01
NEURAL\_LIVE\_AUTONOMY\_REQUIRE\_PROTECTION=true
NEURAL\_LIVE\_AUTONOMY\_AUTO\_DISABLE\_ON\_LOSS=true
```

### Taken

* [x] Voeg config toe.
* [x] Valideer config strikt.
* [x] Live autonomy standaard uit.
* [x] Auto promote live standaard uit.
* [x] Self tuning standaard paper-only.
* [x] Toon config summary in neural autonomy report.

\---

# Deel 12 - CLI commands

## 20\. Nieuwe commands

```bash
node src/cli.js neural:autonomy-report
node src/cli.js neural:replay-run
node src/cli.js neural:replay-arena
node src/cli.js neural:continuous-learn
node src/cli.js neural:self-tuning-proposals
node src/cli.js neural:approve-experiment <experimentId>
node src/cli.js neural:reject-experiment <experimentId>
node src/cli.js neural:rollback-experiment <experimentId>
node src/cli.js neural:downgrade-shadow
node src/cli.js neural:disable-live-autonomy
node src/cli.js neural:live-autonomy-readiness
```

### Taken

* [x] Commands gebruiken bestaande runtime/state infra.
* [x] Commands schrijven audit events.
* [x] Muterende commands vragen expliciete confirm flag.
* [x] Live autonomy commands vereisen acknowledgement.
* [x] Replay commands zijn offline-safe.

\---

# Deel 13 - Tests

## 21\. Unit tests

* [x] Neural autonomy governor tests.
* [x] Replay engine tests.
* [x] Replay arena tests.
* [x] Position outcome learner tests.
* [x] Continuous learner tests.
* [x] Self tuning controller tests.
* [x] Live execution gate tests.
* [x] Auto rollback tests.
* [x] Training scheduler tests.
* [x] Experiment registry tests.

## 22\. Safety tests

* [x] Neural kan hard blocker niet overrulen.
* [x] Neural kan exchange freeze niet overrulen.
* [x] Neural kan max exposure niet verhogen boven hard cap.
* [x] Neural kan LiveBroker niet direct aanroepen.
* [x] Replay kan geen echte orders plaatsen.
* [x] Live autonomy blijft uit zonder acknowledgement.
* [x] Auto rollback schakelt influence uit bij breach.
* [x] L7 live autonomy stopt bij daily drawdown.
* [x] L7 live autonomy stopt bij unresolved intent.

## 23\. Integration tests

* [x] Replay run op fixture data.
* [x] Replay arena vergelijkt baseline met neural policy.
* [x] Paper autonomous opent alleen paper trades.
* [x] Continuous learner traint candidate model.
* [x] Candidate model wordt niet gepromoot bij slechte metrics.
* [x] Candidate model wordt paper-promotable bij goede metrics.
* [x] Live observe heeft geen execution influence.
* [x] Live bounded influence blijft binnen clamps.
* [x] Rollback herstelt vorige modelstatus.

\---

# Deel 14 - Implementatievolgorde

## Sprint 1 - Autonomy foundation

* [x] Neural autonomy level.
* [x] Neural autonomy governor.
* [x] Config keys.
* [x] Neural autonomy report.
* [x] Safety tests.

## Sprint 2 - Replay trading engine

* [x] Neural replay engine.
* [x] Replay queue.
* [x] Replay output schema.
* [x] Replay metrics.
* [x] Replay safety tests.

## Sprint 3 - Replay arena

* [x] Replay arena.
* [x] Baseline comparison.
* [x] Policy comparison.
* [x] Replay-to-paper gate.
* [x] Arena report.

## Sprint 4 - Continuous learning

* [x] Position outcome learner.
* [x] Continuous learner.
* [x] Training scheduler.
* [x] Dataset refresh.
* [x] Candidate model evaluation.

## Sprint 5 - Self tuning

* [x] Self tuning controller.
* [x] Experiment registry.
* [x] Bounded influence clamps.
* [x] Paper self-tuning.
* [x] Auto rollback.

## Sprint 6 - Live observe

* [x] Live observe gate.
* [x] Live observe reports.
* [x] Live autonomy readiness.
* [x] Operator controls.

## Sprint 7 - Live bounded / autonomous caps

* [x] Live bounded gate.
* [x] Live execution adapter.
* [x] L7 strict caps.
* [x] Daily drawdown stop.
* [x] One-click disable.
* [x] Full audit and rollback.

\---

# Deel 15 - Belangrijkste ontwerpbeslissing

Het neural network mag uiteindelijk zelfstandig leren en zichzelf aanpassen, maar het mag nooit rechtstreeks buiten de bot-infrastructuur handelen.

Correct:

```txt
Neural model
-> autonomy governor
-> live execution gate
-> decisionPipeline
-> riskManager
-> executionEngine
-> broker
-> audit
```

Fout:

```txt
Neural model
-> LiveBroker
-> order
```

Die tweede route mag nooit bestaan.

\---

# Beste eerste stap

Begin met:

* [x] Neural autonomy levels.
* [x] Neural autonomy governor.
* [x] Neural replay engine.
* [x] Replay queue.
* [x] Safety tests dat replay nooit live kan handelen.

Waarom:
Zonder deze laag kan een zelflerend systeem te snel gevaarlijk worden. Met deze laag kan het neural network groeien naar autonomie, maar alleen via bestaande bot-safety, replay, paper, live observe, bounded influence en rollback.

\---

# Eindregel

Het systeem mag uiteindelijk zelf leren, zelf replayen, zelf paper-trades uitvoeren, zelf bounded aanpassingen doen en uiteindelijk live binnen strikte caps handelen.

Maar alleen als:

* [x] genoeg positie-data bestaat
* [x] replay beter is dan baseline
* [x] paper beter is dan baseline
* [x] live observe veilig is
* [x] live bounded veilig is
* [x] safety gates groen zijn
* [x] rollback actief is
* [x] audit volledig is
* [x] operator of config live autonomy expliciet toestaat


