# Autonoom Neural Network + Replay Trading Roadmap

Doel:

* Het neural network moet gebruikmaken van de bestaande bot-infrastructuur.
* Het systeem moet na verloop van tijd zelf kunnen leren uit positie- en trade-data.
* Het neural network moet zelf replay-trades kunnen simuleren.
* Het systeem moet zelf verbeteringen kunnen voorstellen en uiteindelijk bounded automatisch toepassen.
* Echte live trades mogen pas na harde safety gates, voldoende data, replay-validatie, paper-validatie en rollback-bescherming.

Belangrijk:
Dit ontwerp laat het neural network uiteindelijk zelfstandig bijsturen, maar nooit zonder limieten. Het mag geen exchange-safety, max exposure, reconcile freeze, live guardrails of risk limits overslaan.

\---

## 0\. Kernprincipe

Het neural network wordt geen los systeem naast de bot. Het wordt een laag bovenop de bestaande infrastructuur.

Bestaande infrastructuur die hergebruikt moet worden:

* \[ ] `dataRecorder` voor decision/trade/context records.
* \[ ] `journal` voor echte trade outcomes.
* \[ ] `runtime` state voor open positions, paper learning, adaptation en governance.
* \[ ] `modelRegistry` voor modelversies en rollback.
* \[ ] `offlineTrainer` voor training en evaluatie.
* \[ ] `counterfactualQueue` voor gemiste setups en replay cases.
* \[ ] `shadowTrading` voor voorspellingen zonder live invloed.
* \[ ] `adaptiveGovernance` voor promotie/rollback regels.
* \[ ] `thresholdTuning` voor bounded threshold aanpassingen.
* \[ ] `parameterGovernor` voor bounded parameter changes.
* \[ ] `executionCalibration` voor execution feedback.
* \[ ] `capitalGovernor` voor risk en sizing beperkingen.
* \[ ] `auditLog` voor volledige traceerbaarheid.
* \[ ] `decisionPipeline` voor echte trade beslissingen.
* \[ ] `PaperBroker` voor paper/replay executie.
* \[ ] `LiveBroker` alleen voor echte orders, nooit direct vanuit replay zonder live gate.

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

* \[ ] Maak enum `NeuralAutonomyLevel`.
* \[ ] Sla autonomy level op in runtime/model registry.
* \[ ] Toon autonomy level in dashboard/API.
* \[ ] Blokkeer live invloed onder L5.
* \[ ] Blokkeer live bounded invloed onder L6.
* \[ ] Blokkeer echte live autonomous execution onder L7.
* \[ ] Audit elke autonomy-level wijziging.

### Regels per level

#### L0 - Observe only

* \[ ] Geen predictions vereist.
* \[ ] Alleen data quality en readiness meten.
* \[ ] Geen trading impact.

#### L1 - Shadow predictions

* \[ ] Neural model voorspelt mee.
* \[ ] Geen invloed op paper of live trades.
* \[ ] Predictions worden gekoppeld aan echte outcomes.

#### L2 - Replay simulator

* \[ ] Neural model draait eigen replay-trades op historische snapshots.
* \[ ] Replay gebruikt bestaande journal/dataRecorder/runtime snapshots.
* \[ ] Geen echte orders.
* \[ ] Replay-resultaten worden opgeslagen als training/evaluation data.

#### L3 - Paper autonomous

* \[ ] Neural model mag zelfstandig paper-trades voorstellen.
* \[ ] PaperBroker voert uit.
* \[ ] Geen live invloed.
* \[ ] Hard risk simulation blijft actief.

#### L4 - Paper bounded self-tuning

* \[ ] Neural model mag paper-thresholds, sizing en exit-bias bounded aanpassen.
* \[ ] Aanpassingen blijven binnen clamps.
* \[ ] Auto-rollback actief bij slechtere outcomes.

#### L5 - Live observe

* \[ ] Neural model voorspelt live mee.
* \[ ] Geen live invloed.
* \[ ] Vergelijkt neural advies met echte live decisions.

#### L6 - Live bounded self-tuning

* \[ ] Neural model mag kleine live-bias geven.
* \[ ] Geen hard blocker override.
* \[ ] Geen max exposure override.
* \[ ] Geen exchange freeze override.
* \[ ] Auto-rollback verplicht.

#### L7 - Live autonomous within strict caps

* \[ ] Neural model mag binnen bestaande decisionPipeline zelfstandig live-candidates activeren.
* \[ ] Alleen als alle safety gates groen zijn.
* \[ ] Alleen met capped sizing.
* \[ ] Alleen met one-click disable.
* \[ ] Alleen met daily loss stop.
* \[ ] Alleen na bewezen L6-performance.

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

* \[ ] Lees huidige autonomy level.
* \[ ] Lees modelstatus uit model registry.
* \[ ] Lees performance metrics.
* \[ ] Lees capital governor status.
* \[ ] Lees exchange safety status.
* \[ ] Lees health circuit status.
* \[ ] Lees open positions.
* \[ ] Lees recent loss streak.
* \[ ] Lees calibration drift.
* \[ ] Bepaal toegestane influence.
* \[ ] Blokkeer influence bij safety issues.
* \[ ] Schrijf audit event bij elke neural influence.

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

* \[ ] Governor mag nooit een live order direct plaatsen.
* \[ ] Governor geeft alleen permissies aan decisionPipeline.
* \[ ] LiveBroker wordt nooit direct door neural model aangeroepen.
* \[ ] Alle live acties blijven via bestaande broker/risk/execution flow.

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

* \[ ] Bouw replay engine op bestaande dataRecorder/journal records.
* \[ ] Gebruik bestaande market snapshots.
* \[ ] Gebruik bestaande feature frames.
* \[ ] Gebruik bestaande execution simulation waar mogelijk.
* \[ ] Gebruik PaperBroker-achtige accounting.
* \[ ] Gebruik dezelfde risk policies als echte bot.
* \[ ] Replay mag geen LiveBroker gebruiken.
* \[ ] Replay krijgt eigen `replayRunId`.
* \[ ] Elke replay trade krijgt `simulatedTradeId`.
* \[ ] Replay slaat entry, exit, MFE, MAE, slippage en root cause op.
* \[ ] Replay output wordt bruikbaar voor training.

### Replay modes

* \[ ] `historical\_decision\_replay`: speel bestaande decisions opnieuw af.
* \[ ] `missed\_trade\_replay`: simuleer blocked setups.
* \[ ] `neural\_policy\_replay`: laat neural model eigen keuzes maken.
* \[ ] `exit\_policy\_replay`: test andere exits.
* \[ ] `execution\_policy\_replay`: test andere orderstijlen.
* \[ ] `stress\_replay`: test slechte omstandigheden.

### Acceptance criteria

* \[ ] Replay werkt offline.
* \[ ] Replay gebruikt geen live API keys.
* \[ ] Replay kan 1000+ simulated trades draaien.
* \[ ] Replay produceert model-evaluation metrics.
* \[ ] Replay-resultaten worden niet verward met echte trades.

\---

## 4\. Replay Trading Arena

### Nieuw bestand

```txt
src/ai/neural/replay/neuralReplayArena.js
```

### Doel

Het neural network moet meerdere strategievarianten tegen elkaar kunnen simuleren.

### Arena policies

* \[ ] Baseline bestaande bot.
* \[ ] Entry neural only.
* \[ ] Exit neural only.
* \[ ] Execution neural only.
* \[ ] Entry + exit neural.
* \[ ] Full neural advisory.
* \[ ] Conservative neural.
* \[ ] Aggressive neural, alleen replay.
* \[ ] Random baseline.
* \[ ] Always skip baseline.

### Metrics

* \[ ] total return
* \[ ] profit factor
* \[ ] win rate
* \[ ] max drawdown
* \[ ] average loss
* \[ ] average win
* \[ ] expectancy
* \[ ] exposure time
* \[ ] slippage drag
* \[ ] MFE capture
* \[ ] MAE control
* \[ ] bad veto reduction
* \[ ] false trigger count

### Taken

* \[ ] Maak arena runner.
* \[ ] Run meerdere policies over dezelfde dataset.
* \[ ] Vergelijk neural policies met baseline.
* \[ ] Maak per-regime resultaten.
* \[ ] Maak per-strategy-family resultaten.
* \[ ] Maak per-symbol resultaten.
* \[ ] Sla arena summary op.
* \[ ] Gebruik arena summary voor promotion gates.

\---

## 5\. Replay-to-Paper Promotion

### Doel

Als neural replay goed presteert, mag het nog niet live. Eerst paper.

### Vereisten

* \[ ] Replay verslaat baseline.
* \[ ] Replay drawdown is acceptabel.
* \[ ] Replay heeft genoeg trades.
* \[ ] Replay werkt in meerdere regimes.
* \[ ] Replay is niet alleen goed op één symbol.
* \[ ] Replay calibration is acceptabel.
* \[ ] Dataset quality is voldoende.

### Taken

* \[ ] Maak `replayPromotionGate`.
* \[ ] Geef replay score.
* \[ ] Geef blockers.
* \[ ] Geef aanbevolen autonomy level.
* \[ ] Alleen promoten naar paper autonomous of paper bounded.
* \[ ] Geen directe promotie naar live.

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

* \[ ] entry rationale
* \[ ] risk verdict
* \[ ] execution attribution
* \[ ] position lifecycle
* \[ ] MFE
* \[ ] MAE
* \[ ] PnL
* \[ ] capture efficiency
* \[ ] exit reason
* \[ ] time in trade
* \[ ] regime at entry
* \[ ] regime at exit
* \[ ] data quality
* \[ ] neural predictions at entry
* \[ ] neural predictions during position

### Outputs

* \[ ] entry label
* \[ ] exit label
* \[ ] execution label
* \[ ] sizing label
* \[ ] root cause
* \[ ] learning weight
* \[ ] suggested parameter change
* \[ ] replay case priority

### Taken

* \[ ] Maak outcome labeling.
* \[ ] Koppel outcomes aan neural predictions.
* \[ ] Bereken prediction error.
* \[ ] Bereken learning weight.
* \[ ] Maak feedback frame.
* \[ ] Voeg feedback toe aan training dataset.
* \[ ] Voeg slechte trades toe aan replay queue.
* \[ ] Voeg gemiste trades toe aan replay queue.

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

* \[ ] Detecteer nieuwe positie-data.
* \[ ] Bouw incremental dataset.
* \[ ] Train candidate model.
* \[ ] Evalueer candidate model.
* \[ ] Run replay arena.
* \[ ] Vergelijk met huidige active model.
* \[ ] Maak promotion decision.
* \[ ] Maak rollback decision.
* \[ ] Sla alles op in model registry.
* \[ ] Schrijf audit events.

### Triggers

* \[ ] Na X nieuwe closed paper trades.
* \[ ] Na X nieuwe closed live trades.
* \[ ] Dagelijks op vaste tijd.
* \[ ] Na grote regime drift.
* \[ ] Na model underperformance.
* \[ ] Na operator command.

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

* \[ ] Continuous learner kan trainen zonder live bot te blokkeren.
* \[ ] Continuous learner kan geen live influence verhogen zonder gate.
* \[ ] Continuous learner kan model downgraden bij slechte metrics.
* \[ ] Continuous learner schrijft audit trail.

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

* \[ ] model threshold shift
* \[ ] entry caution bias
* \[ ] size multiplier bias
* \[ ] execution style bias
* \[ ] exit tighten bias
* \[ ] trailing stop bias
* \[ ] take-profit bias
* \[ ] stop-loss bias
* \[ ] strategy family preference
* \[ ] symbol cooldown recommendation
* \[ ] regime caution multiplier

### Parameters die neural nooit direct mag aanpassen

* \[ ] API keys
* \[ ] live trading acknowledgement
* \[ ] max total exposure boven hard cap
* \[ ] exchange protection
* \[ ] reconcile safety
* \[ ] hard safety blockers
* \[ ] minimum live guardrails
* \[ ] operator manual review flags

### Taken

* \[ ] Maak voorstel-object voor elke self-tuning action.
* \[ ] Koppel elk voorstel aan evidence.
* \[ ] Koppel elk voorstel aan rollback condition.
* \[ ] Laat adaptiveGovernance voorstel beoordelen.
* \[ ] Laat parameterGovernor bounded toepassing doen.
* \[ ] Log oude en nieuwe waarde.
* \[ ] Maak auto rollback bij slechte outcomes.

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

* \[ ] Implementeer clamps centraal.
* \[ ] Clamps zijn niet door neural te wijzigen.
* \[ ] Clamps zitten in config + validation.
* \[ ] Dashboard toont actieve neural clamps.
* \[ ] Audit elke clamp toepassing.

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

* \[ ] Replay-resultaten mogen nooit direct LiveBroker aanroepen.
* \[ ] Replay-resultaten mogen alleen promotie voorstellen.
* \[ ] Paper autonomous moet eerst slagen.
* \[ ] Live observe moet eerst slagen.
* \[ ] Live bounded moet eerst slagen.
* \[ ] Pas daarna L7 live autonomous binnen caps.
* \[ ] Maak `neuralLiveExecutionGate`.
* \[ ] Maak `neuralLiveAutonomyReport`.
* \[ ] Vereis `NEURAL\_LIVE\_AUTONOMY\_ACKNOWLEDGED`.

### Live autonomy vereisten

* \[ ] Minimaal aantal replay trades.
* \[ ] Minimaal aantal paper trades.
* \[ ] Minimaal aantal live observe predictions.
* \[ ] Minimaal aantal live bounded trades.
* \[ ] Profit factor boven baseline.
* \[ ] Drawdown onder maximum.
* \[ ] Calibration stabiel.
* \[ ] Geen recente rollback.
* \[ ] Geen health circuit open.
* \[ ] Geen exchange safety warnings.
* \[ ] Geen unresolved intents.
* \[ ] Operator approval of expliciete config acknowledgement.

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

* \[ ] Adapter mag alleen candidate intent maken.
* \[ ] Adapter mag alleen via decisionPipeline.
* \[ ] Adapter mag alleen via riskManager.
* \[ ] Adapter mag alleen via existing broker abstraction.
* \[ ] Adapter mag alleen als live gate allow geeft.
* \[ ] Adapter mag nooit LiveBroker direct aanroepen.
* \[ ] Adapter mag nooit protective order logic overslaan.

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

* \[ ] Elke neural live trade ziet eruit als normale trade met extra neural attribution.
* \[ ] Elke neural live trade heeft volledige audit.
* \[ ] Elke neural live trade heeft rollback/disable path.
* \[ ] Elke neural live trade kan in forensics worden gereplayed.

\---

# Deel 7 - Eigen replay queue en experimenten

## 12\. Neural Replay Queue

### Nieuw bestand

```txt
src/ai/neural/replay/neuralReplayQueue.js
```

### Replay case types

* \[ ] losing\_trade\_replay
* \[ ] missed\_winner\_replay
* \[ ] bad\_veto\_replay
* \[ ] late\_exit\_replay
* \[ ] early\_exit\_replay
* \[ ] execution\_drag\_replay
* \[ ] regime\_shift\_replay
* \[ ] overconfidence\_replay
* \[ ] stale\_data\_replay
* \[ ] near\_threshold\_replay

### Taken

* \[ ] Nieuwe slechte trades automatisch aan replay queue toevoegen.
* \[ ] Gemiste winnaars automatisch toevoegen.
* \[ ] Bad vetoes automatisch toevoegen.
* \[ ] Execution drag trades toevoegen.
* \[ ] Prioriteit berekenen per case.
* \[ ] Replay budget per dag instellen.
* \[ ] Replay resultaten koppelen aan model training.

### Acceptance criteria

* \[ ] Neural model kiest zelf relevante replay cases.
* \[ ] Replay cases blijven gescheiden van echte trades.
* \[ ] Replay output is reproduceerbaar.

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

* \[ ] Maak experiment registry.
* \[ ] Elk self-tuning voorstel wordt experiment.
* \[ ] Experiment krijgt rollback rules.
* \[ ] Experiment krijgt max duration.
* \[ ] Experiment krijgt max trade count.
* \[ ] Experiment eindigt als promote, rollback of expire.
* \[ ] Dashboard/API toont actieve neural experiments.

\---

# Deel 8 - Autonome evaluatie en rollback

## 14\. Neural Auto Rollback

### Nieuw bestand

```txt
src/ai/neural/governance/neuralAutoRollback.js
```

### Rollback triggers

* \[ ] Calibration ECE boven limiet.
* \[ ] Paper/live drawdown boven limiet.
* \[ ] Loss streak boven limiet.
* \[ ] Underperformance vs baseline.
* \[ ] Feature drift boven limiet.
* \[ ] Data quality onder limiet.
* \[ ] Execution slippage boven limiet.
* \[ ] Health circuit open.
* \[ ] Exchange safety warning.
* \[ ] Manual operator rollback.

### Taken

* \[ ] Monitor alle actieve neural experiments.
* \[ ] Monitor alle active neural influence.
* \[ ] Auto-disable bij breach.
* \[ ] Rollback model status.
* \[ ] Rollback parameter changes.
* \[ ] Schrijf audit event.
* \[ ] Maak operator alert.

### Acceptance criteria

* \[ ] Rollback werkt zonder handmatige actie.
* \[ ] Rollback kan geen nieuwe trade openen.
* \[ ] Rollback herstelt laatste veilige staat.
* \[ ] Rollback report toont waarom.

\---

## 15\. Neural Performance Watchdog

### Nieuw bestand

```txt
src/ai/neural/governance/neuralPerformanceWatchdog.js
```

### Taken

* \[ ] Meet neural performance continu.
* \[ ] Vergelijk active model met previous model.
* \[ ] Vergelijk active model met baseline.
* \[ ] Detecteer overconfidence.
* \[ ] Detecteer model drift.
* \[ ] Detecteer regime-specific failure.
* \[ ] Detecteer symbol-specific failure.
* \[ ] Detecteer execution degradation.
* \[ ] Adviseer downgrade of rollback.
* \[ ] Kan influence automatisch pauzeren.

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

* \[ ] Check nieuwe paper trades.
* \[ ] Check nieuwe live trades.
* \[ ] Check nieuwe replay trades.
* \[ ] Check nieuwe blocked setup outcomes.
* \[ ] Check dataset quality.
* \[ ] Plan training job.
* \[ ] Voorkom te vaak trainen.
* \[ ] Train niet tijdens live critical incidents.
* \[ ] Train niet als runtime data corrupt is.
* \[ ] Train niet als feature drift extreem is zonder review.
* \[ ] Sla training job status op.

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

* \[ ] Current autonomy level.
* \[ ] Active neural models.
* \[ ] Active neural experiments.
* \[ ] Replay arena results.
* \[ ] Continuous learning status.
* \[ ] Self-tuning proposals.
* \[ ] Active bounded influences.
* \[ ] Auto rollback status.
* \[ ] Live autonomy readiness.
* \[ ] Neural disabled reason.

### Actieknoppen

* \[ ] Pause neural influence.
* \[ ] Resume neural shadow only.
* \[ ] Run replay arena.
* \[ ] Approve paper experiment.
* \[ ] Reject experiment.
* \[ ] Rollback neural model.
* \[ ] Disable live neural autonomy.
* \[ ] Downgrade to shadow.
* \[ ] Export neural report.

### Niet bouwen

* \[ ] Geen duplicaat van bestaande trading dashboard.
* \[ ] Geen duplicate Windows GUI roadmap.
* \[ ] Alleen neural autonomie en learning tonen.

\---

## 18\. Neural Autonomy Report

### CLI command

```bash
node src/cli.js neural:autonomy-report
```

### Rapport bevat

* \[ ] Current autonomy level.
* \[ ] Waarom dit level wel/niet hoger mag.
* \[ ] Dataset readiness.
* \[ ] Replay readiness.
* \[ ] Paper readiness.
* \[ ] Live observe readiness.
* \[ ] Live bounded readiness.
* \[ ] Active blockers.
* \[ ] Suggested next action.
* \[ ] Risk of increasing autonomy.

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

* \[ ] Voeg config toe.
* \[ ] Valideer config strikt.
* \[ ] Live autonomy standaard uit.
* \[ ] Auto promote live standaard uit.
* \[ ] Self tuning standaard paper-only.
* \[ ] Toon config summary in neural autonomy report.

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

* \[ ] Commands gebruiken bestaande runtime/state infra.
* \[ ] Commands schrijven audit events.
* \[ ] Muterende commands vragen expliciete confirm flag.
* \[ ] Live autonomy commands vereisen acknowledgement.
* \[ ] Replay commands zijn offline-safe.

\---

# Deel 13 - Tests

## 21\. Unit tests

* \[ ] Neural autonomy governor tests.
* \[ ] Replay engine tests.
* \[ ] Replay arena tests.
* \[ ] Position outcome learner tests.
* \[ ] Continuous learner tests.
* \[ ] Self tuning controller tests.
* \[ ] Live execution gate tests.
* \[ ] Auto rollback tests.
* \[ ] Training scheduler tests.
* \[ ] Experiment registry tests.

## 22\. Safety tests

* \[ ] Neural kan hard blocker niet overrulen.
* \[ ] Neural kan exchange freeze niet overrulen.
* \[ ] Neural kan max exposure niet verhogen boven hard cap.
* \[ ] Neural kan LiveBroker niet direct aanroepen.
* \[ ] Replay kan geen echte orders plaatsen.
* \[ ] Live autonomy blijft uit zonder acknowledgement.
* \[ ] Auto rollback schakelt influence uit bij breach.
* \[ ] L7 live autonomy stopt bij daily drawdown.
* \[ ] L7 live autonomy stopt bij unresolved intent.

## 23\. Integration tests

* \[ ] Replay run op fixture data.
* \[ ] Replay arena vergelijkt baseline met neural policy.
* \[ ] Paper autonomous opent alleen paper trades.
* \[ ] Continuous learner traint candidate model.
* \[ ] Candidate model wordt niet gepromoot bij slechte metrics.
* \[ ] Candidate model wordt paper-promotable bij goede metrics.
* \[ ] Live observe heeft geen execution influence.
* \[ ] Live bounded influence blijft binnen clamps.
* \[ ] Rollback herstelt vorige modelstatus.

\---

# Deel 14 - Implementatievolgorde

## Sprint 1 - Autonomy foundation

* \[ ] Neural autonomy level.
* \[ ] Neural autonomy governor.
* \[ ] Config keys.
* \[ ] Neural autonomy report.
* \[ ] Safety tests.

## Sprint 2 - Replay trading engine

* \[ ] Neural replay engine.
* \[ ] Replay queue.
* \[ ] Replay output schema.
* \[ ] Replay metrics.
* \[ ] Replay safety tests.

## Sprint 3 - Replay arena

* \[ ] Replay arena.
* \[ ] Baseline comparison.
* \[ ] Policy comparison.
* \[ ] Replay-to-paper gate.
* \[ ] Arena report.

## Sprint 4 - Continuous learning

* \[ ] Position outcome learner.
* \[ ] Continuous learner.
* \[ ] Training scheduler.
* \[ ] Dataset refresh.
* \[ ] Candidate model evaluation.

## Sprint 5 - Self tuning

* \[ ] Self tuning controller.
* \[ ] Experiment registry.
* \[ ] Bounded influence clamps.
* \[ ] Paper self-tuning.
* \[ ] Auto rollback.

## Sprint 6 - Live observe

* \[ ] Live observe gate.
* \[ ] Live observe reports.
* \[ ] Live autonomy readiness.
* \[ ] Operator controls.

## Sprint 7 - Live bounded / autonomous caps

* \[ ] Live bounded gate.
* \[ ] Live execution adapter.
* \[ ] L7 strict caps.
* \[ ] Daily drawdown stop.
* \[ ] One-click disable.
* \[ ] Full audit and rollback.

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

* \[ ] Neural autonomy levels.
* \[ ] Neural autonomy governor.
* \[ ] Neural replay engine.
* \[ ] Replay queue.
* \[ ] Safety tests dat replay nooit live kan handelen.

Waarom:
Zonder deze laag kan een zelflerend systeem te snel gevaarlijk worden. Met deze laag kan het neural network groeien naar autonomie, maar alleen via bestaande bot-safety, replay, paper, live observe, bounded influence en rollback.

\---

# Eindregel

Het systeem mag uiteindelijk zelf leren, zelf replayen, zelf paper-trades uitvoeren, zelf bounded aanpassingen doen en uiteindelijk live binnen strikte caps handelen.

Maar alleen als:

* \[ ] genoeg positie-data bestaat
* \[ ] replay beter is dan baseline
* \[ ] paper beter is dan baseline
* \[ ] live observe veilig is
* \[ ] live bounded veilig is
* \[ ] safety gates groen zijn
* \[ ] rollback actief is
* \[ ] audit volledig is
* \[ ] operator of config live autonomy expliciet toestaat

