# Roadmap: Neural Autonomy Engine voor self-learning trading bot

Repo: `mrcryptolife420/NEW-NEW-ai-trading-bot`
Datum: 2026-05-08
Doel: het bestaande neural/learning systeem uitbreiden naar een veilig zelflerend systeem dat gewichten, gates en parameters kan aanpassen op basis van trade-resultaten, fast replay en backtests, vóór paper mode en nooit onveilig direct live.

---

## 1. Korte visie

Je wil eigenlijk dit:

1. Bot doet trades of ziet gemiste trades.
2. Neural systeem leert uit:
   - winners
   - losers
   - gemiste kansen
   - slechte veto’s
   - goede veto’s
   - exits
   - slippage
   - drawdown
   - paper/demo resultaten
3. Neural systeem maakt zelf voorstellen:
   - safe gates aanpassen
   - thresholds aanpassen
   - strategy weights aanpassen
   - feature weights aanpassen
   - position sizing bias aanpassen
   - exit logic aanpassen
   - blocker-strengheid aanpassen
4. Voorstellen gaan eerst door:
   - fast replay
   - backtest
   - stress scenario’s
   - counterfactual tests
   - shadow evaluation
5. Alleen als alles veilig is:
   - automatisch toepassen in sandbox
   - daarna paper mode
   - daarna eventueel handmatige live review
6. Alles is auditbaar en rollbackbaar.

Belangrijk: dit mag niet betekenen dat neural “zomaar alles mag veranderen”. Het moet een **Neural Autonomy Engine met governance** worden.

---

## 2. Wat er al aanwezig lijkt

De bestaande config heeft al veel bouwblokken:

- adaptive learning
- paper core updates
- transformer challenger
- sequence challenger
- meta neural learning rates
- exit neural learning rates
- execution neural learning rates
- strategy meta learning
- multi-agent committee
- RL execution
- calibration
- model promotion thresholds
- threshold auto apply
- parameter governor
- neural replay engine
- neural continuous learning flags
- neural self tuning flags
- neural auto promote flags
- neural rollback thresholds
- neural live autonomy flags

De belangrijkste lacune is niet “meer flags”, maar een **volledige pipeline** die bewijst dat een wijziging veilig en beter is vóór hij toegepast wordt.

---

## 3. Kernprincipe

Niet dit:

```text
neural ziet verlies -> past meteen live risk gate aan
```

Wel dit:

```text
trade outcome
  -> learning event
  -> neural proposal
  -> safety bounds
  -> fast replay
  -> walk-forward backtest
  -> stress scenarios
  -> shadow comparison
  -> paper sandbox
  -> probation
  -> promotion
  -> rollback guard
```

---

# P0 — Neural Autonomy Engine ontwerpen

## Doel

Eén centrale engine die alle neural wijzigingen beheert.

## Nieuwe module

```text
src/neural/autonomyEngine.js
```

## Verantwoordelijkheden

- [ ] trade outcomes verzamelen
- [ ] learning events maken
- [ ] neural proposals maken
- [ ] safety bounds toepassen
- [ ] fast replay starten
- [ ] backtest starten
- [ ] proposal score berekenen
- [ ] proposal accepteren/weigeren
- [ ] sandbox apply
- [ ] paper apply
- [ ] rollback triggeren
- [ ] audit log schrijven

## Dataflow

```text
closed trade / missed trade / veto outcome / exit outcome
  -> LearningEvent
  -> NeuralFeatureAttribution
  -> ProposalGenerator
  -> SafetyBoundedMutation
  -> FastReplayBatch
  -> WalkForwardBacktest
  -> StressScenarioPack
  -> ShadowScore
  -> PromotionDecision
  -> PaperSandboxApply
```

## Acceptatie

- [ ] Geen enkele neural wijziging gebeurt buiten deze engine.
- [ ] Elke wijziging heeft een proposal id.
- [ ] Elke wijziging is rollbackbaar.
- [ ] Elke wijziging heeft evidence.

---

# P0 — Learning Event Store

## Probleem

Het neural systeem heeft kwalitatieve trainingsdata nodig. Niet alleen trades, maar ook gemiste trades en veto’s.

## Nieuwe bestanden

```text
src/neural/learningEventStore.js
data/runtime/neural/learning-events.ndjson
```

## Event types

- [ ] `trade_opened`
- [ ] `trade_closed_win`
- [ ] `trade_closed_loss`
- [ ] `trade_closed_breakeven`
- [ ] `missed_trade_good_veto`
- [ ] `missed_trade_bad_veto`
- [ ] `entry_rejected`
- [ ] `entry_allowed`
- [ ] `exit_too_early`
- [ ] `exit_too_late`
- [ ] `stop_loss_hit`
- [ ] `take_profit_hit`
- [ ] `trailing_stop_hit`
- [ ] `slippage_high`
- [ ] `spread_block_good`
- [ ] `spread_block_bad`
- [ ] `neural_prediction_correct`
- [ ] `neural_prediction_wrong`

## Elk event bevat

- [ ] `eventId`
- [ ] `createdAt`
- [ ] `symbol`
- [ ] `timeframe`
- [ ] `decisionId`
- [ ] `tradeId`
- [ ] `positionId`
- [ ] `strategyId`
- [ ] `regime`
- [ ] `session`
- [ ] `featuresHash`
- [ ] `marketSnapshotHash`
- [ ] `modelVersion`
- [ ] `prediction`
- [ ] `actualOutcome`
- [ ] `pnlPct`
- [ ] `mfePct`
- [ ] `maePct`
- [ ] `holdMinutes`
- [ ] `entryReason`
- [ ] `exitReason`
- [ ] `blockerReasons`
- [ ] `qualityScore`
- [ ] `label`
- [ ] `weight`

## Labels

- [ ] `good_entry`
- [ ] `bad_entry`
- [ ] `good_rejection`
- [ ] `bad_rejection`
- [ ] `good_exit`
- [ ] `bad_exit`
- [ ] `high_slippage`
- [ ] `bad_sizing`
- [ ] `strategy_mismatch`
- [ ] `regime_mismatch`

## Acceptatie

- [ ] Elke gesloten trade maakt learning event.
- [ ] Elke gemiste trade kan learning event worden.
- [ ] Elk event is later replaybaar.
- [ ] Geen event zonder `decisionId` of `featuresHash`.

---

# P0 — Neural Proposal systeem

## Doel

Het neural netwerk mag niet direct config veranderen. Het moet voorstellen maken.

## Nieuwe module

```text
src/neural/proposalEngine.js
```

## Proposal types

- [ ] `threshold_adjustment`
- [ ] `safe_gate_tighten`
- [ ] `safe_gate_relax_paper_only`
- [ ] `feature_weight_adjustment`
- [ ] `strategy_weight_adjustment`
- [ ] `position_size_bias`
- [ ] `exit_logic_adjustment`
- [ ] `stop_loss_multiplier_adjustment`
- [ ] `take_profit_multiplier_adjustment`
- [ ] `trailing_stop_adjustment`
- [ ] `blocker_weight_adjustment`
- [ ] `regime_filter_adjustment`
- [ ] `session_filter_adjustment`
- [ ] `symbol_quarantine`
- [ ] `strategy_quarantine`
- [ ] `model_candidate_promotion`
- [ ] `model_rollback`

## Proposal schema

```json
{
  "proposalId": "neural-prop-...",
  "createdAt": "...",
  "type": "threshold_adjustment",
  "scope": {
    "mode": "paper",
    "symbol": "BTCUSDT",
    "strategy": "breakout",
    "regime": "high_volatility"
  },
  "change": {
    "key": "MODEL_THRESHOLD",
    "from": 0.52,
    "to": 0.515,
    "delta": -0.005
  },
  "reason": "bad_veto_rate_high",
  "evidence": {
    "events": 84,
    "wins": 37,
    "losses": 22,
    "badVetoCount": 11,
    "expectedImprovement": 0.031
  },
  "risk": {
    "maxDrawdownDelta": 0.006,
    "exposureDelta": 0.02,
    "safetyImpact": "paper_only_relaxation"
  },
  "status": "proposed"
}
```

## Acceptatie

- [ ] Elke neural wijziging begint als proposal.
- [ ] Proposal bevat reason en evidence.
- [ ] Proposal bevat scope.
- [ ] Proposal bevat risk impact.
- [ ] Proposal status is traceerbaar.

---

# P0 — Safety Bound Layer

## Probleem

Je wil “alles zelf aanpassen”, maar zonder grenzen kan een model zichzelf kapot optimaliseren.

## Doel

Neural mag alleen binnen harde grenzen aanpassen.

## Nieuwe module

```text
src/neural/safetyBoundLayer.js
```

## Hard bounds

- [ ] Neural mag `BOT_MODE` nooit zelf naar `live` zetten.
- [ ] Neural mag `LIVE_TRADING_ACKNOWLEDGED` nooit zetten.
- [ ] Neural mag API keys nooit wijzigen.
- [ ] Neural mag `MAX_DAILY_DRAWDOWN` nooit verhogen.
- [ ] Neural mag `MAX_TOTAL_EXPOSURE_FRACTION` nooit verhogen zonder human approval.
- [ ] Neural mag live position size nooit verhogen.
- [ ] Neural mag paper-only gates beperkt relaxen.
- [ ] Neural mag safety gates altijd strenger maken.
- [ ] Neural mag een symbol/strategy altijd quarantainen.
- [ ] Neural mag live autonomy nooit activeren.
- [ ] Neural mag rollback altijd triggeren.
- [ ] Neural mag alleen binnen `neuralMaxThresholdDelta`.
- [ ] Neural mag alleen binnen `neuralMaxSizeMultiplierDelta`.

## Modes

### `observe`

- [ ] alleen voorstellen
- [ ] niets toepassen

### `shadow`

- [ ] voorstellen worden shadow getest
- [ ] geen runtime wijzigingen

### `paper_sandbox`

- [ ] wijzigingen gelden alleen in sandbox replay/backtest

### `paper_apply`

- [ ] wijzigingen mogen in paper mode runtime

### `live_review`

- [ ] alleen human review
- [ ] geen auto-apply

## Acceptatie

- [ ] Proposal buiten bounds wordt geweigerd.
- [ ] Alle weigeringen worden gelogd.
- [ ] Live safety kan niet automatisch verzwakken.

---

# P0 — Fast Neural Replay Engine

## Doel

Voordat een neural wijziging in paper mode getest wordt, moet hij snel door historische cases.

## Nieuwe module

```text
src/neural/fastReplayEngine.js
```

## Input

- [ ] laatste closed trades
- [ ] missed trades
- [ ] bad veto cases
- [ ] near-threshold decisions
- [ ] high confidence losers
- [ ] low confidence winners
- [ ] regime-specific samples
- [ ] symbol-specific samples

## Replay stages

1. [ ] Reconstruct decision features.
2. [ ] Apply current model.
3. [ ] Apply proposed mutation.
4. [ ] Compare:
   - [ ] expected entries
   - [ ] blocked bad trades
   - [ ] unlocked good trades
   - [ ] false positives
   - [ ] false negatives
   - [ ] drawdown impact
   - [ ] calibration impact
5. [ ] Score proposal.

## Replay metrics

- [ ] baseline expectancy
- [ ] proposed expectancy
- [ ] delta expectancy
- [ ] win-rate delta
- [ ] max drawdown delta
- [ ] ECE/calibration delta
- [ ] bad veto reduction
- [ ] bad entry increase
- [ ] trade frequency delta
- [ ] exposure delta
- [ ] risk-adjusted score
- [ ] confidence interval

## Acceptatie

- [ ] Elke proposal doorloopt fast replay.
- [ ] Proposal faalt als drawdown slechter wordt boven limiet.
- [ ] Proposal faalt als calibration slechter wordt boven limiet.
- [ ] Replay resultaat is opgeslagen.

---

# P0 — Walk-forward Neural Backtest

## Probleem

Fast replay is snel, maar kan overfit zijn. Je hebt walk-forward nodig.

## Nieuwe module

```text
src/neural/neuralWalkForward.js
```

## Procedure

- [ ] Split historische data in windows.
- [ ] Train/adjust op window A.
- [ ] Test op window B.
- [ ] Schuif door.
- [ ] Verzamel out-of-sample metrics.
- [ ] Vergelijk baseline versus proposed.
- [ ] Penaliseer overfitting.

## Gates

Proposal mag alleen door als:

- [ ] out-of-sample expectancy beter is
- [ ] max drawdown niet slechter dan limiet
- [ ] trade count voldoende is
- [ ] ECE/calibration niet slechter
- [ ] improvement niet alleen op 1 symbol komt
- [ ] niet alleen in 1 regime werkt
- [ ] stress scenario niet faalt

## Acceptatie

- [ ] Geen proposal naar paper zonder walk-forward pass.
- [ ] Walk-forward resultaten zijn reproduceerbaar met seed.
- [ ] Dashboard toont walk-forward score.

---

# P0 — Neural Stress Test Pack

## Doel

Elke neural wijziging testen op moeilijke scenario’s.

## Scenario’s

- [ ] flash crash
- [ ] slow bleed
- [ ] fake breakout
- [ ] choppy range
- [ ] spread shock
- [ ] volatility spike
- [ ] trend reversal
- [ ] liquidation wick
- [ ] low liquidity weekend
- [ ] API stale data
- [ ] partial fills
- [ ] slippage burst
- [ ] correlated market dump
- [ ] BTC dominance shock
- [ ] funding/OI divergence

## Fail conditions

- [ ] max drawdown breach
- [ ] too many entries
- [ ] repeated stop losses
- [ ] position size too high
- [ ] exits too late
- [ ] calibration collapse
- [ ] neural confidence too high during bad regime
- [ ] live safety violation attempt

## Acceptatie

- [ ] Elk proposal draait minstens 5 stress packs.
- [ ] High-risk proposals draaien alle packs.
- [ ] Falen betekent geen paper apply.

---

# P0 — Promotion pipeline

## Doel

Neural wijzigingen gaan door duidelijke stages.

## Stages

```text
proposed
  -> bounds_checked
  -> replay_passed
  -> backtest_passed
  -> stress_passed
  -> shadow_active
  -> paper_sandbox
  -> paper_probation
  -> paper_promoted
  -> live_review_needed
```

## Checklist

- [ ] Maak `src/neural/promotionPipeline.js`.
- [ ] Elke stage heeft criteria.
- [ ] Elke stage schrijft audit event.
- [ ] Dashboard toont stage.
- [ ] Rollback kan vanaf elke stage.
- [ ] Proposal expiret na X dagen als niet gepromoveerd.

## Acceptatie

- [ ] Geen directe sprong van proposal naar paper.
- [ ] Elke promotie is verklaarbaar.
- [ ] Elke promotie kan teruggedraaid worden.

---

# P1 — Safe gate optimizer

## Doel

Het neural netwerk mag safe gates aanpassen, maar gecontroleerd.

## Gate types

- [ ] spread gate
- [ ] volatility gate
- [ ] net edge gate
- [ ] failed breakout gate
- [ ] funding/OI gate
- [ ] leadership gate
- [ ] session gate
- [ ] news/event gate
- [ ] cooldown gate
- [ ] confidence gate
- [ ] risk/reward gate
- [ ] max hold gate
- [ ] exit intelligence gate

## Mogelijke acties

### Strenger maken

Mag sneller:

- [ ] hogere confidence threshold
- [ ] lagere max spread
- [ ] lagere max exposure
- [ ] extra cooldown
- [ ] symbol quarantine
- [ ] strategy quarantine

### Relaxen

Alleen paper/sandbox:

- [ ] confidence iets lager
- [ ] blocker weight iets lager
- [ ] meer probes
- [ ] minder cooldown
- [ ] hogere tolerated spread binnen paper bound

## Per-gate metadata

Elke gate krijgt:

- [ ] `gateId`
- [ ] `currentValue`
- [ ] `minAllowed`
- [ ] `maxAllowed`
- [ ] `neuralMutable`
- [ ] `liveMutable`
- [ ] `paperMutable`
- [ ] `maxDeltaPerProposal`
- [ ] `maxDeltaPerDay`
- [ ] `rollbackTrigger`

## Acceptatie

- [ ] Neural kan alleen mutable gates wijzigen.
- [ ] Live gate relaxation is nooit automatisch.
- [ ] Paper gate relaxation heeft replay evidence.

---

# P1 — Weight optimizer

## Doel

Neural mag gewichten aanpassen voor features, strategieën en committee agents.

## Gewichtscategorieën

- [ ] feature weights
- [ ] strategy weights
- [ ] regime weights
- [ ] session weights
- [ ] symbol weights
- [ ] exit component weights
- [ ] execution style weights
- [ ] committee agent weights
- [ ] blocker weights

## Constraints

- [ ] weights normaliseren naar 1.0 of vaste range.
- [ ] max change per proposal.
- [ ] max change per day.
- [ ] min evidence per scope.
- [ ] no single feature dominates.
- [ ] no single strategy dominates without probation.
- [ ] high correlation penalty.
- [ ] stale feature penalty.
- [ ] overfitting penalty.

## Optimizers

- [ ] Bayesian optimizer voor thresholds.
- [ ] Online logistic/linear update voor feature weights.
- [ ] Contextual bandit voor strategy selection.
- [ ] Thompson sampling voor paper probes.
- [ ] Conservative policy improvement voor gates.
- [ ] RL alleen voor execution style, niet voor safety limits.

## Acceptatie

- [ ] Weight changes zijn klein en traceerbaar.
- [ ] Overfit changes worden geweigerd.
- [ ] Dashboard toont before/after weights.

---

# P1 — Counterfactual learning

## Doel

Leren uit trades die niet genomen zijn.

## Cases

- [ ] Bot blokkeerde trade, maar prijs ging daarna goed omhoog.
- [ ] Bot nam trade, maar gate had hem moeten blokkeren.
- [ ] Bot exit te vroeg.
- [ ] Bot exit te laat.
- [ ] Bot size te groot.
- [ ] Bot size te klein.
- [ ] Bot negeerde regime change.
- [ ] Bot vertrouwde stale data.

## Implementatie

- [ ] Sla blocked decisions op.
- [ ] Volg outcome na 30/60/90/180 minuten.
- [ ] Label:
  - [ ] good block
  - [ ] bad block
  - [ ] good entry
  - [ ] bad entry
- [ ] Gebruik labels voor gate optimizer.
- [ ] Gebruik labels voor feature attribution.
- [ ] Counterfactuals krijgen lager gewicht dan echte trades.

## Acceptatie

- [ ] Neural leert ook uit gemiste kansen.
- [ ] Bad veto rate wordt meetbaar.
- [ ] Gate relax proposals komen uit counterfactual evidence.

---

# P1 — Neural credit assignment

## Probleem

Na een trade moet je weten welke onderdelen verantwoordelijk waren.

## Doel

Attribution per feature/gate/strategy/agent.

## Methoden

- [ ] simple contribution scoring
- [ ] permutation importance op replay cases
- [ ] SHAP-like local attribution light
- [ ] ablation replay
- [ ] regret attribution
- [ ] exit attribution
- [ ] execution attribution

## Output

Voor elke trade:

- [ ] top positive features
- [ ] top negative features
- [ ] gate impact
- [ ] strategy impact
- [ ] neural impact
- [ ] exit impact
- [ ] execution impact
- [ ] what changed outcome most

## Acceptatie

- [ ] Neural proposals verwijzen naar attribution.
- [ ] Dashboard toont “waarom ging dit fout/goed?”
- [ ] Geen blind weight tuning.

---

# P1 — Neural sandbox environment

## Doel

Een aparte omgeving waarin neural alles mag proberen zonder paper/live runtime te beïnvloeden.

## Nieuwe directories

```text
data/runtime/neural/sandbox/
data/runtime/neural/proposals/
data/runtime/neural/replay-results/
data/runtime/neural/model-candidates/
data/runtime/neural/promotions/
```

## Sandbox regels

- [ ] Geen live endpoints.
- [ ] Geen runtime `.env` wijziging.
- [ ] Eigen config overlay.
- [ ] Eigen model registry.
- [ ] Eigen ledger.
- [ ] Eigen replay reports.
- [ ] Cleanup/retention.

## CLI

```bash
node src/cli.js neural:sandbox:run
node src/cli.js neural:sandbox:status
node src/cli.js neural:sandbox:clear
```

## Acceptatie

- [ ] Neural kan agressief leren in sandbox.
- [ ] Paper runtime blijft onaangetast.
- [ ] Sandbox resultaten zijn exporteerbaar.

---

# P1 — Model registry v2

## Doel

Elke neural/model variant is versieerbaar.

## Model card fields

- [ ] `modelId`
- [ ] `parentModelId`
- [ ] `createdAt`
- [ ] `trainedOn`
- [ ] `featureSetHash`
- [ ] `configHash`
- [ ] `trainingEvents`
- [ ] `validationEvents`
- [ ] `symbols`
- [ ] `regimes`
- [ ] `metrics`
- [ ] `knownWeaknesses`
- [ ] `allowedModes`
- [ ] `promotionStatus`
- [ ] `rollbackRules`

## Commands

```bash
node src/cli.js neural:model:list
node src/cli.js neural:model:card <id>
node src/cli.js neural:model:compare <a> <b>
node src/cli.js neural:model:rollback <id>
```

## Acceptatie

- [ ] Geen neural model zonder model card.
- [ ] Je kunt model A/B vergelijken.
- [ ] Rollback is getest.

---

# P1 — Neural dashboard

## Panels

- [ ] Neural autonomy status
- [ ] Active model
- [ ] Active proposals
- [ ] Replay queue
- [ ] Last replay result
- [ ] Backtest score
- [ ] Stress score
- [ ] Paper probation status
- [ ] Current mutable gates
- [ ] Current feature weights
- [ ] Recent neural changes
- [ ] Rollback button
- [ ] Freeze neural button

## Indicators

- [ ] `observe`
- [ ] `shadow`
- [ ] `sandbox`
- [ ] `paper applying`
- [ ] `probation`
- [ ] `blocked`
- [ ] `rollback needed`

## Acceptatie

- [ ] Operator ziet wat neural aan het doen is.
- [ ] Neural kan tijdelijk gefreezed worden.
- [ ] Elke change is zichtbaar.

---

# P1 — Neural safety auditor

## Doel

Een aparte auditor die neural voorstellen beoordeelt.

## Module

```text
src/neural/neuralSafetyAuditor.js
```

## Checks

- [ ] forbidden key changes
- [ ] live risk weakening
- [ ] max delta per proposal
- [ ] max delta per day
- [ ] insufficient evidence
- [ ] overfitting
- [ ] regime concentration
- [ ] symbol concentration
- [ ] calibration degradation
- [ ] drawdown degradation
- [ ] exposure increase
- [ ] conflict with current risk locks
- [ ] conflict with panic stop
- [ ] conflict with live mode guardrails

## Output

```json
{
  "allowed": false,
  "reasons": ["insufficient_evidence", "drawdown_degradation"],
  "safeAlternative": {
    "type": "tighten_only",
    "change": {}
  }
}
```

## Acceptatie

- [ ] Safety auditor kan proposal blokkeren.
- [ ] Auditor output staat in dashboard.
- [ ] Tests dekken forbidden changes.

---

# P1 — Auto rollback

## Doel

Als neural wijziging slechter werkt in paper, automatisch rollback.

## Triggers

- [ ] loss streak >= threshold
- [ ] drawdown > threshold
- [ ] ECE/calibration slechter
- [ ] win rate drop
- [ ] expectancy drop
- [ ] increased bad entries
- [ ] higher slippage
- [ ] invariant failure
- [ ] panic stop
- [ ] operator manual rollback

## Rollback doet

- [ ] vorige weights herstellen
- [ ] vorige gates herstellen
- [ ] proposal status `rolled_back`
- [ ] event log schrijven
- [ ] dashboard alert
- [ ] model candidate quarantainen

## Acceptatie

- [ ] Slechte neural wijziging wordt automatisch teruggedraaid.
- [ ] Rollback is reproduceerbaar.
- [ ] Rollback reden is zichtbaar.

---

# P2 — Fast replay architecture

## Performance doel

Replay moet snel genoeg zijn om veel voorstellen te testen.

## Checklist

- [ ] Replay cases compact opslaan.
- [ ] Feature snapshots cachen.
- [ ] Pure decision function maken.
- [ ] Geen netwerkcalls in replay.
- [ ] Geen disk writes per case, alleen batch.
- [ ] Parallel replay workers.
- [ ] Deterministische RNG.
- [ ] Memory budget.
- [ ] Replay progress status.

## Metrics

- [ ] cases/sec
- [ ] total cases
- [ ] failed cases
- [ ] skipped cases
- [ ] duration
- [ ] memory
- [ ] score

## Acceptatie

- [ ] 500 replay cases binnen redelijke tijd.
- [ ] Replay is deterministic.
- [ ] Replay kan in desktop GUI gestart worden.

---

# P2 — Neural “curriculum learning”

## Doel

Neural leert eerst veilig en simpel, daarna moeilijker.

## Fases

### Fase 1: Observe

- [ ] alleen voorspellen
- [ ] geen wijzigingen
- [ ] meet accuracy

### Fase 2: Shadow

- [ ] proposals maken
- [ ] vergelijken met baseline
- [ ] geen apply

### Fase 3: Sandbox

- [ ] proposals testen in replay/backtest
- [ ] geen paper runtime apply

### Fase 4: Paper

- [ ] kleine paper-only wijzigingen
- [ ] probation

### Fase 5: Paper autonomous

- [ ] meerdere wijzigingen per dag toegestaan binnen limiet
- [ ] auto rollback

### Fase 6: Live advisory

- [ ] alleen suggesties voor live
- [ ] human approval vereist

## Acceptatie

- [ ] Neural kan niet te snel escaleren.
- [ ] Elke fase heeft unlock criteria.
- [ ] Dashboard toont huidige fase.

---

# P2 — Offline training dataset builder

## Doel

Betere datasets maken voor neural training.

## Dataset bevat

- [ ] closed trades
- [ ] blocked decisions
- [ ] near misses
- [ ] replay cases
- [ ] scenario cases
- [ ] synthetic stress cases
- [ ] market regimes
- [ ] feature snapshots
- [ ] labels

## Commands

```bash
node src/cli.js neural:dataset:build
node src/cli.js neural:dataset:inspect
node src/cli.js neural:dataset:export
```

## Dataset quality checks

- [ ] class balance
- [ ] symbol diversity
- [ ] regime diversity
- [ ] no leakage
- [ ] no duplicate decisions
- [ ] enough negative cases
- [ ] enough positive cases

## Acceptatie

- [ ] Neural traint niet op rommeldata.
- [ ] Dataset quality score zichtbaar.
- [ ] Training faalt bij slechte dataset.

---

# P2 — Anti-overfitting guard

## Probleem

Zelflerende trading bots overfitten snel op recente trades.

## Guards

- [ ] minimum sample size
- [ ] out-of-sample validation
- [ ] walk-forward validation
- [ ] regime diversity requirement
- [ ] symbol diversity requirement
- [ ] maximum proposal frequency
- [ ] half-life weighting
- [ ] complexity penalty
- [ ] rollback on degradation
- [ ] quarantine on repeated failed proposals

## Acceptatie

- [ ] Neural mag geen wijziging baseren op 1-2 trades.
- [ ] Proposal krijgt overfit score.
- [ ] Hoge overfit score blokkeert apply.

---

# P2 — Safe self-modifying config overlay

## Probleem

Neural moet niet direct `.env` aanpassen.

## Doel

Neural gebruikt overlays, niet `.env`.

## Bestanden

```text
data/runtime/neural/active-overlay.json
data/runtime/neural/paper-overlay.json
data/runtime/neural/sandbox-overlay.json
```

## Regels

- [ ] `.env` blijft operator-owned.
- [ ] Neural schrijft alleen overlay.
- [ ] Overlay is mode-scoped.
- [ ] Overlay is rollbackable.
- [ ] Overlay heeft expiry.
- [ ] Overlay mag alleen whitelisted keys.
- [ ] Dashboard toont overlay diff.

## Acceptatie

- [ ] Neural raakt `.env` niet aan.
- [ ] Operator kan overlay uitschakelen.
- [ ] Reboot behoudt of reset overlay volgens policy.

---

# P2 — Neural policy language

## Doel

Duidelijke regels voor wat neural mag doen.

## Voorbeeld policy

```json
{
  "mode": "paper",
  "allowedMutations": [
    "threshold_adjustment",
    "feature_weight_adjustment",
    "strategy_weight_adjustment",
    "safe_gate_tighten",
    "safe_gate_relax_paper_only"
  ],
  "forbiddenKeys": [
    "BOT_MODE",
    "LIVE_TRADING_ACKNOWLEDGED",
    "BINANCE_API_KEY",
    "BINANCE_API_SECRET"
  ],
  "maxDailyProposals": 10,
  "maxDailyApplies": 3,
  "requiresReplay": true,
  "requiresBacktest": true,
  "requiresStress": true
}
```

## Acceptatie

- [ ] Policy is machine-readable.
- [ ] Dashboard toont active policy.
- [ ] Tests bewijzen forbidden mutations.

---

# P2 — Multi-objective scoring

## Probleem

Niet alleen winst telt. Safety telt ook.

## Score componenten

- [ ] expectancy
- [ ] win rate
- [ ] profit factor
- [ ] max drawdown
- [ ] volatility
- [ ] calibration ECE
- [ ] false positive rate
- [ ] false negative rate
- [ ] trade frequency
- [ ] slippage
- [ ] exposure
- [ ] regime robustness
- [ ] symbol diversity
- [ ] operator risk preference

## Proposal score

```text
score =
  expectancy_gain
  - drawdown_penalty
  - calibration_penalty
  - overfit_penalty
  - exposure_penalty
  + bad_veto_reduction
  + robustness_bonus
```

## Acceptatie

- [ ] Proposal met meer winst maar veel meer drawdown wordt geweigerd.
- [ ] Score is uitlegbaar.
- [ ] Operator kan score components zien.

---

# P2 — Neural command set

## CLI commands

```bash
node src/cli.js neural:status
node src/cli.js neural:freeze
node src/cli.js neural:unfreeze
node src/cli.js neural:events
node src/cli.js neural:proposals
node src/cli.js neural:proposal <id>
node src/cli.js neural:replay <proposalId>
node src/cli.js neural:backtest <proposalId>
node src/cli.js neural:stress <proposalId>
node src/cli.js neural:promote <proposalId>
node src/cli.js neural:rollback <proposalId>
node src/cli.js neural:overlay:show
node src/cli.js neural:overlay:disable
```

## Acceptatie

- [ ] Alles wat neural doet is via CLI inspecteerbaar.
- [ ] GUI is niet de enige manier om controle te houden.
- [ ] Freeze/rollback kan altijd.

---

# P2 — Testplan

## Unit tests

- [ ] learning event schema
- [ ] proposal schema
- [ ] safety bounds
- [ ] forbidden keys
- [ ] gate mutation bounds
- [ ] weight normalization
- [ ] proposal scoring
- [ ] replay comparison
- [ ] overfit guard
- [ ] overlay merge
- [ ] rollback

## Integration tests

- [ ] closed trade -> learning event
- [ ] learning event -> proposal
- [ ] proposal -> replay
- [ ] replay pass -> backtest
- [ ] backtest pass -> shadow
- [ ] shadow pass -> paper overlay
- [ ] bad paper result -> rollback
- [ ] panic stop blocks neural apply
- [ ] live mode blocks neural relaxation

## Scenario tests

- [ ] flash crash proposal blocked
- [ ] fake breakout gate tightened
- [ ] bad veto gate relaxed only in paper
- [ ] high slippage execution weight changed
- [ ] drawdown increase blocks proposal
- [ ] overfit proposal blocked

## Acceptatie

- [ ] Neural pipeline werkt end-to-end in test.
- [ ] Geen proposal kan safety overslaan.
- [ ] Rollback tests slagen.

---

# P3 — Later: echte neural architectuur verbeteren

## Model types

Afhankelijk van hoeveel data je hebt:

### Weinig data

- [ ] online logistic model
- [ ] contextual bandit
- [ ] simple neural MLP
- [ ] Bayesian threshold optimizer

### Meer data

- [ ] temporal convolution model
- [ ] transformer encoder voor candles
- [ ] regime classifier
- [ ] meta-model voor ensemble weighting
- [ ] exit timing model
- [ ] slippage prediction model

### Veel data

- [ ] offline RL voor execution
- [ ] sequence-to-action model
- [ ] portfolio allocation network
- [ ] multi-agent ensemble

## Mijn voorkeur

Begin niet met één grote black-box AI. Bouw dit:

```text
Feature model
+ Regime model
+ Entry quality model
+ Exit quality model
+ Execution cost model
+ Risk governor
+ Meta decision model
```

Waarom:

- [ ] beter uitlegbaar
- [ ] makkelijker te testen
- [ ] veiliger
- [ ] minder overfit
- [ ] makkelijker rollback
- [ ] elke component kan apart leren

---

# P3 — Wat ik anders zou doen dan “één groot neural network”

## Niet doen

- [ ] Eén model dat alles tegelijk beslist.
- [ ] Neural direct `.env` laten aanpassen.
- [ ] Neural direct live gates laten relaxen.
- [ ] Neural leren uit alleen win/loss.
- [ ] Paper resultaten zonder stress test vertrouwen.
- [ ] Auto-promote naar live zonder human review.

## Wel doen

- [ ] Modulaire neural agents.
- [ ] Conservative policy improvement.
- [ ] Proposal-based self tuning.
- [ ] Paper-only overlays.
- [ ] Fast replay vóór paper.
- [ ] Walk-forward vóór paper.
- [ ] Stress tests vóór paper.
- [ ] Auto rollback.
- [ ] Model cards.
- [ ] Full audit trail.

---

# Implementatievolgorde

## Fase 1 — Foundations

- [ ] Learning Event Store
- [ ] Proposal Engine
- [ ] Safety Bound Layer
- [ ] Neural overlay systeem
- [ ] Neural dashboard status
- [ ] Freeze/rollback commands

## Fase 2 — Replay vóór paper

- [ ] Fast Replay Engine
- [ ] Replay case builder
- [ ] Proposal scoring
- [ ] Counterfactual labels
- [ ] Replay dashboard

## Fase 3 — Backtest en stress

- [ ] Walk-forward neural backtest
- [ ] Stress scenario pack
- [ ] Overfitting guard
- [ ] Multi-objective scoring

## Fase 4 — Paper autonomy

- [ ] Paper sandbox apply
- [ ] Paper probation
- [ ] Auto rollback
- [ ] Weight optimizer
- [ ] Safe gate optimizer

## Fase 5 — Governance

- [ ] Model registry v2
- [ ] Model cards
- [ ] Promotion pipeline
- [ ] Audit reports
- [ ] Human approval for live

---

# Minimale MVP

Als je snel wil starten, bouw eerst dit:

- [ ] `learning-events.ndjson`
- [ ] `proposalEngine`
- [ ] `safetyBoundLayer`
- [ ] `fastReplayEngine`
- [ ] `neural-overlay.json`
- [ ] dashboard panel voor proposals
- [ ] CLI `neural:proposals`
- [ ] CLI `neural:rollback`
- [ ] tests voor forbidden keys
- [ ] tests voor replay pass/fail

Met deze MVP kan neural al veilig leren en voorstellen doen zonder paper/live kapot te maken.

---

# Definitieve acceptatiecriteria

Het systeem is klaar wanneer:

- [ ] Neural maakt proposals, geen directe config edits.
- [ ] Elke proposal heeft evidence.
- [ ] Elke proposal gaat door safety bounds.
- [ ] Elke proposal gaat door fast replay.
- [ ] Elke paper proposal gaat door walk-forward.
- [ ] Elke risky proposal gaat door stress scenarios.
- [ ] Neural gebruikt overlays, niet `.env`.
- [ ] Operator kan neural freeze doen.
- [ ] Operator kan rollback doen.
- [ ] Dashboard toont active proposals.
- [ ] Dashboard toont current neural weights/gates.
- [ ] Bad proposals worden automatisch geweigerd.
- [ ] Slechte paper outcomes triggeren rollback.
- [ ] Live mode krijgt alleen suggestions, geen auto-apply.
- [ ] Alle neural actions zijn auditbaar.

---

# Belangrijkste veiligheidsregel

Neural mag sneller leren, maar niet sneller risico nemen.

De juiste volgorde is:

```text
learn fast
simulate faster
apply slowly
rollback immediately
never weaken live safety automatically
```
