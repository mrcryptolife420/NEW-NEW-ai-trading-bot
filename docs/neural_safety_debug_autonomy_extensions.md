# Aanvullende Neural Safety, Debug en Autonomie Taken

Doel:
- Extra uitbreidingen toevoegen bovenop de autonome neural replay roadmap.
- Focus op debugbaarheid, veiligheid, zelfcontrole, modelkwaliteit en live-risicobeperking.
- Geen dubbele taken uit de vorige roadmaps herhalen.
- Alles afvinkbaar maken zodat het direct als implementatie-checklist kan dienen.

Belangrijk:
Deze taken bouwen verder op het autonome neural systeem, maar voegen vooral extra controlelagen toe zodat het systeem veilig kan blijven leren en zichzelf verbeteren.

---

## 1. Neural Black Box Recorder

### Doel

Altijd exact kunnen terugzien wat het neural network dacht, voorspelde, aanpaste en wat het resultaat was.

### Taken

- [ ] Maak `src/ai/neural/observability/neuralBlackBoxRecorder.js`.
- [ ] Sla per neural beslissing alle input feature IDs op.
- [ ] Sla `featuresHash` op.
- [ ] Sla model ID en model version op.
- [ ] Sla normalizer version op.
- [ ] Sla raw neural output op.
- [ ] Sla confidence op.
- [ ] Sla uncertainty op.
- [ ] Sla toegestane influence op.
- [ ] Sla werkelijk toegepaste influence op.
- [ ] Sla reden op waarom influence wel/niet werd toegepast.
- [ ] Sla risk verdict op.
- [ ] Sla final bot action op.
- [ ] Sla trade outcome op zodra beschikbaar.
- [ ] Koppel recorder entry aan `tradeTraceId`.
- [ ] Koppel recorder entry aan replay run indien van toepassing.
- [ ] Maak queryfunctie per symbol.
- [ ] Maak queryfunctie per model version.
- [ ] Maak queryfunctie per losing trade.
- [ ] Maak queryfunctie per neural influence.
- [ ] Voeg export naar `.json` of `.ndjson` toe.

### Acceptance criteria

- [ ] Elke neural prediction is later volledig terug te vinden.
- [ ] Elke neural live/paper influence is later volledig verklaarbaar.
- [ ] Geen secrets worden opgeslagen.
- [ ] Black box records kunnen gebruikt worden voor replay en audits.

---

## 2. Neural Explainability Layer

### Doel

Niet alleen een score tonen, maar uitleggen waarom het model iets voorspelt.

### Taken

- [ ] Maak `src/ai/neural/explainability/neuralExplainer.js`.
- [ ] Toon top 10 features per neural prediction.
- [ ] Toon featuregroep impact: trend, orderboek, volatility, news, execution, risk.
- [ ] Toon of model vooral bullish of bearish drivers zag.
- [ ] Toon welke features tegen de trade spraken.
- [ ] Toon of confidence laag, medium of hoog is.
- [ ] Toon of model afwijkt van bestaande botlogica.
- [ ] Toon model disagreement met risk manager.
- [ ] Toon model disagreement met execution planner.
- [ ] Toon model disagreement met regime classifier.
- [ ] Voeg compacte uitleg toe aan dashboard/API.
- [ ] Voeg volledige uitleg toe aan forensics report.
- [ ] Sla explanation summary op in black box recorder.

### Voorbeeld output

```json
{
  "modelId": "entry_mlp_v1",
  "score": 0.68,
  "confidence": 0.61,
  "topDrivers": [
    { "feature": "bookPressure", "impact": 0.18, "direction": "support" },
    { "feature": "spreadBps", "impact": 0.11, "direction": "support" },
    { "feature": "realizedVolPct", "impact": 0.09, "direction": "caution" }
  ],
  "summary": "Neural ondersteunt entry door sterke book pressure en lage spread, maar volatility verhoogt risico."
}
```

### Acceptance criteria

- [ ] Geen neural advies zonder uitleg in dashboard.
- [ ] Live influence vereist altijd explanation summary.
- [ ] Uitleg wordt opgeslagen voor latere audit.

---

## 3. Model Personality Profiles

### Doel

Meerdere neural profielen kunnen draaien met verschillend gedrag, zonder safety gates te dupliceren.

### Profielen

- [ ] `conservative`
- [ ] `balanced`
- [ ] `aggressive_paper_only`
- [ ] `recovery_mode`
- [ ] `low_volatility`
- [ ] `high_volatility`
- [ ] `weekend_safe`
- [ ] `thin_liquidity_safe`
- [ ] `breakout_specialist`
- [ ] `mean_reversion_specialist`

### Taken

- [ ] Maak `src/ai/neural/profiles/neuralProfileRegistry.js`.
- [ ] Definieer profielconfig per model.
- [ ] Definieer max influence per profiel.
- [ ] Definieer toegestane modes per profiel.
- [ ] Blokkeer aggressive profiel in live zonder aparte approval.
- [ ] Sla profielkeuze op in model registry.
- [ ] Toon actief profiel in neural dashboard.
- [ ] Voeg replay arena vergelijking per profiel toe.
- [ ] Voeg profiel performance metrics toe.

### Acceptance criteria

- [ ] Elk profiel gebruikt dezelfde safety gates.
- [ ] Profielen kunnen niet zelf safety caps verhogen.
- [ ] Aggressive profiel blijft replay/paper-only tot expliciet bewezen.

---

## 4. Market Shock Simulator

### Doel

Neural modellen testen op extreme scenario's voordat ze live invloed krijgen.

### Shock cases

- [ ] Spread spike.
- [ ] Order book liquidity drop.
- [ ] Websocket disconnect.
- [ ] REST rate-limit pressure.
- [ ] Candle gap down.
- [ ] Candle gap up.
- [ ] Flash crash.
- [ ] News shock.
- [ ] Partial fill.
- [ ] Maker order miss.
- [ ] OCO/protective order failure.
- [ ] Delayed fill.
- [ ] Exchange maintenance warning.
- [ ] Stablecoin depeg scenario.
- [ ] Sudden volatility expansion.
- [ ] Sudden volume collapse.
- [ ] Slippage spike.
- [ ] Data source disagreement.

### Taken

- [ ] Maak `src/ai/neural/replay/marketShockSimulator.js`.
- [ ] Maak shock scenario schema.
- [ ] Voeg shock scenario toe aan replay arena.
- [ ] Draai neural policies tegen shock scenarios.
- [ ] Meet survival rate.
- [ ] Meet drawdown onder stress.
- [ ] Meet false trigger count.
- [ ] Meet emergency exit behavior.
- [ ] Meet execution degradation.
- [ ] Blokkeer promotie als shock test faalt.
- [ ] Toon shock test score in neural autonomy report.

### Acceptance criteria

- [ ] Geen live bounded influence zonder shock test.
- [ ] Shock scenario resultaten zijn reproduceerbaar.
- [ ] Slechte shock performance blokkeert autonomie-verhoging.

---

## 5. Capital Learning Layer

### Doel

Neural network leert niet alleen wanneer instappen, maar ook hoeveel kapitaal verantwoord is.

### Taken

- [ ] Maak `src/ai/neural/capital/neuralCapitalLearner.js`.
- [ ] Leer beste size per strategy family.
- [ ] Leer beste size per regime.
- [ ] Leer beste size per symbol.
- [ ] Leer wanneer size moet worden verlaagd.
- [ ] Leer wanneer volledig skippen beter is.
- [ ] Leer capital efficiency per setup.
- [ ] Leer drawdown sensitivity per setup.
- [ ] Leer recovery-mode sizing.
- [ ] Leer wanneer exposure te geconcentreerd wordt.
- [ ] Geef size recommendations aan capital governor.
- [ ] Laat neural automatisch alleen risico verlagen.
- [ ] Vereis approval om risico te verhogen.
- [ ] Voeg capital learning metrics toe aan dashboard.

### Safetyregel

```txt
Neural mag automatisch risico verlagen.
Neural mag risico verhogen alleen binnen clamps en na governance approval.
```

### Acceptance criteria

- [ ] Neural kan max exposure nooit verhogen.
- [ ] Neural kan size boven hard cap nooit verhogen.
- [ ] Neural risk increase wordt altijd governance proposal.
- [ ] Neural risk reduction mag automatisch als safety action.

---

## 6. Confidence Calibration Trainer

### Doel

Voorkomen dat neural model te zeker wordt van foute voorspellingen.

### Taken

- [ ] Maak `src/ai/neural/calibration/neuralCalibrationTrainer.js`.
- [ ] Meet calibration per model.
- [ ] Meet calibration per regime.
- [ ] Meet calibration per symbol.
- [ ] Meet calibration per strategy family.
- [ ] Maak calibration curves.
- [ ] Bereken Expected Calibration Error.
- [ ] Penalize overconfidence.
- [ ] Verlaag neural influence bij slechte calibration.
- [ ] Blokkeer live promotie bij slechte calibration.
- [ ] Voeg calibration report toe aan dashboard.
- [ ] Voeg calibration drift alerts toe.

### Acceptance criteria

- [ ] 70% confidence moet ongeveer overeenkomen met realistische outcome.
- [ ] Slechte calibration verlaagt autonomie.
- [ ] Live bounded influence vereist calibration onder ingestelde limiet.

---

## 7. Neural Disagreement System

### Doel

Situaties waarin neural en bestaande botlogica het oneens zijn automatisch herkennen en gebruiken als waardevolle training/replay cases.

### Disagreement types

- [ ] Neural zegt entry, bot zegt skip.
- [ ] Bot zegt entry, neural zegt skip.
- [ ] Neural entry positief, execution neural negatief.
- [ ] Neural entry positief, risk manager blokkeert.
- [ ] Neural regime wijkt af van bestaande regime classifier.
- [ ] Neural exit zegt close, bot zegt hold.
- [ ] Neural zegt hold, bot sluit positie.
- [ ] Neural ziet high confidence, model confidence is laag.
- [ ] Neural ziet low confidence, bot confidence is hoog.

### Taken

- [ ] Maak `src/ai/neural/diagnostics/neuralDisagreementDetector.js`.
- [ ] Log alle disagreements.
- [ ] Voeg disagreements toe aan replay queue.
- [ ] Prioriteer disagreements met grote latere PnL impact.
- [ ] Maak disagreement dashboard panel.
- [ ] Maak CLI command `neural:disagreements`.
- [ ] Gebruik disagreement outcomes voor training.
- [ ] Maak bad-veto en false-entry labels vanuit disagreement outcomes.

### Acceptance criteria

- [ ] Disagreement wordt niet automatisch als neural gelijk geïnterpreteerd.
- [ ] Disagreement wordt eerst gereplayed en geëvalueerd.
- [ ] Herhaald goede neural disagreement kan promotie-evidence worden.

---

## 8. Neural Memory per Symbol

### Doel

Het neural network leert dat elk symbool anders beweegt en anders uitgevoerd wordt.

### Symbol memory velden

- [ ] Typical volatility.
- [ ] Typical spread.
- [ ] Typical slippage.
- [ ] Maker fill success rate.
- [ ] False breakout rate.
- [ ] Mean reversion success rate.
- [ ] Best performing session.
- [ ] Worst performing session.
- [ ] Best strategy family.
- [ ] Worst strategy family.
- [ ] News sensitivity.
- [ ] Liquidity shock sensitivity.
- [ ] Average hold time.
- [ ] Exit failure patterns.

### Taken

- [ ] Maak `src/ai/neural/memory/neuralSymbolMemory.js`.
- [ ] Update memory na closed trade.
- [ ] Update memory na replay run.
- [ ] Update memory na execution attribution.
- [ ] Gebruik memory als featuregroep.
- [ ] Voeg memory version toe.
- [ ] Voeg stale memory detection toe.
- [ ] Voeg memory rollback toe.
- [ ] Toon symbol memory in dashboard.
- [ ] Blokkeer live influence bij corrupte/stale memory.

### Acceptance criteria

- [ ] Symbol memory kan geen hard safety rules aanpassen.
- [ ] Symbol memory is input voor neural, geen directe order trigger.
- [ ] Memory updates zijn auditbaar.

---

## 9. Neural Self-Review Agent

### Doel

Periodiek automatisch rapporteren wat het neural network goed en fout deed.

### Rapporten

- [ ] Dagelijkse neural self-review.
- [ ] Wekelijkse neural performance summary.
- [ ] Slechtste neural beslissingen.
- [ ] Beste neural beslissingen.
- [ ] Meest onzekere beslissingen.
- [ ] Grootste disagreements.
- [ ] Grootste missed winners.
- [ ] Grootste false positives.
- [ ] Aanbevolen parameter updates.
- [ ] Aanbevolen rollback of downgrade.
- [ ] Aanbevolen extra replay packs.

### Taken

- [ ] Maak `src/ai/neural/review/neuralSelfReview.js`.
- [ ] Maak daily review command.
- [ ] Maak weekly review command.
- [ ] Schrijf review naar runtime/data recorder.
- [ ] Toon review summary in dashboard.
- [ ] Laat review alleen voorstellen doen, niet direct live wijzigen.
- [ ] Voeg review items toe aan operator approval queue.

### Acceptance criteria

- [ ] Review kan geen trades openen.
- [ ] Review kan geen risk verhogen.
- [ ] Review maakt alleen proposals of downgrade/rollback aanbevelingen.

---

## 10. Data Poisoning en Bad Data Protection

### Doel

Voorkomen dat het neural network leert van slechte, corrupte of misleidende data.

### Detecties

- [ ] Outlier candles.
- [ ] Fake volume spikes.
- [ ] Stale order book.
- [ ] Inconsistent prices tussen bronnen.
- [ ] Corrupte replay records.
- [ ] Missing execution attribution.
- [ ] Abnormale slippage outlier.
- [ ] Exchange maintenance gaps.
- [ ] Extreme spread artifacts.
- [ ] Duplicated records.
- [ ] Time travel / future leakage.
- [ ] Invalid candle ordering.
- [ ] Null/NaN feature bursts.

### Taken

- [ ] Maak `src/ai/neural/data/neuralDataQualityGuard.js`.
- [ ] Score elk training record.
- [ ] Verlaag learning weight bij slechte data.
- [ ] Blokkeer training bij te veel slechte data.
- [ ] Quarantine verdachte records.
- [ ] Maak data-quality report.
- [ ] Voeg bad-data events toe aan audit.
- [ ] Maak CLI command `neural:data-quality`.
- [ ] Voeg dashboard panel toe voor neural data quality.

### Acceptance criteria

- [ ] Training weigert dataset met te veel slechte data.
- [ ] Bad data telt niet zwaar mee.
- [ ] Quarantine is reproduceerbaar en auditbaar.

---

## 11. Neural Sandbox Competitions

### Doel

Meerdere modellen tegen elkaar laten concurreren in replay/paper voordat ze promotie krijgen.

### Modelrollen

- [ ] Champion model.
- [ ] Challenger model.
- [ ] Experimental model.
- [ ] Conservative model.
- [ ] Aggressive paper-only model.
- [ ] Previous stable model.
- [ ] Baseline model.

### Taken

- [ ] Maak `src/ai/neural/competition/neuralCompetitionArena.js`.
- [ ] Run champion vs challenger in replay.
- [ ] Run champion vs challenger in paper shadow.
- [ ] Meet per model performance.
- [ ] Promoveer challenger alleen na evidence.
- [ ] Retire underperforming models.
- [ ] Houd previous stable model beschikbaar.
- [ ] Voeg competition report toe.
- [ ] Maak CLI command `neural:competition`.

### Acceptance criteria

- [ ] Eén model kan niet zonder vergelijking dominant worden.
- [ ] Challenger moet baseline en champion verslaan.
- [ ] Slechte challenger wordt automatisch retired of terug naar shadow gezet.

---

## 12. Live Safety Budget voor Neural

### Doel

Als neural ooit live invloed krijgt, krijgt het een apart klein risicobudget.

### Budgetregels

- [ ] Neural daily max loss.
- [ ] Neural weekly max loss.
- [ ] Neural max trades per day.
- [ ] Neural max exposure.
- [ ] Neural max position fraction.
- [ ] Neural max consecutive losses.
- [ ] Neural max slippage breach count.
- [ ] Neural max unresolved intent count.
- [ ] Neural max drawdown.
- [ ] Neural cooldown na budget breach.

### Taken

- [ ] Maak `src/ai/neural/governance/neuralSafetyBudget.js`.
- [ ] Houd neural-attributed trades apart bij.
- [ ] Houd neural-attributed PnL apart bij.
- [ ] Houd neural drawdown apart bij.
- [ ] Disable neural live influence bij budget breach.
- [ ] Stuur operator alert bij breach.
- [ ] Toon budget in dashboard.
- [ ] Voeg budget aan live autonomy gate toe.

### Acceptance criteria

- [ ] Neural kan niet het volledige botkapitaal riskeren.
- [ ] Neural live influence stopt automatisch bij budget breach.
- [ ] Safety budget kan niet door neural zelf verhoogd worden.

---

## 13. Full Neural State Rollback

### Doel

Niet alleen model weights terugdraaien, maar de volledige neural staat.

### Rollback onderdelen

- [ ] Model weights.
- [ ] Normalizer.
- [ ] Feature schema mapping.
- [ ] Active thresholds.
- [ ] Active self-tuning changes.
- [ ] Active experiments.
- [ ] Autonomy level.
- [ ] Symbol memory.
- [ ] Profile selection.
- [ ] Neural config snapshot.
- [ ] Promotion status.
- [ ] Active influence caps.
- [ ] Replay queue state.

### Taken

- [ ] Maak `src/ai/neural/governance/neuralStateRollback.js`.
- [ ] Maak neural state snapshot vóór elke promotie.
- [ ] Maak neural state snapshot vóór elk experiment.
- [ ] Maak rollback manifest.
- [ ] Maak rollback command.
- [ ] Test rollback volledig.
- [ ] Audit rollback reason.
- [ ] Toon rollback history in dashboard.

### Acceptance criteria

- [ ] Rollback herstelt laatste bewezen goede neural state.
- [ ] Rollback stopt actieve influence.
- [ ] Rollback werkt ook bij gedeeltelijke state corruptie.

---

## 14. Human Approval Queue

### Doel

Alles wat risico verhoogt moet eerst langs een duidelijke approval queue.

### Proposal types

- [ ] Increase autonomy level.
- [ ] Enable paper bounded influence.
- [ ] Enable live observe.
- [ ] Enable live bounded influence.
- [ ] Enable live autonomous caps.
- [ ] Increase size bias.
- [ ] Relax threshold.
- [ ] Change exit behavior.
- [ ] Promote challenger model.
- [ ] Retire champion model.
- [ ] Apply symbol-specific memory influence.
- [ ] Accept high-risk profile.

### Taken

- [ ] Maak `src/ai/neural/governance/neuralApprovalQueue.js`.
- [ ] Elk proposal krijgt evidence.
- [ ] Elk proposal krijgt replay result.
- [ ] Elk proposal krijgt paper result.
- [ ] Elk proposal krijgt expected risk.
- [ ] Elk proposal krijgt rollback rule.
- [ ] Operator kan approve/reject/defer.
- [ ] Approval verloopt na TTL.
- [ ] Approval schrijft audit event.
- [ ] Dashboard toont open proposals.

### Acceptance criteria

- [ ] Geen risk-increasing live change zonder approval.
- [ ] Approval toont genoeg evidence.
- [ ] Rejected proposal wordt niet automatisch opnieuw toegepast zonder nieuwe evidence.

---

## 15. Learning Weight System

### Doel

Niet elke trade of replay case moet even zwaar meetellen.

### Hogere learning weight

- [ ] Goede data quality.
- [ ] Volledige execution attribution.
- [ ] Volledige post-trade path.
- [ ] Repeated pattern failure.
- [ ] Bad veto met sterke outcome.
- [ ] High-confidence wrong prediction.
- [ ] High-value disagreement case.
- [ ] Recent regime-relevant data.

### Lagere learning weight

- [ ] Stale data.
- [ ] Exchange issues.
- [ ] Abnormal news shock.
- [ ] Missing execution attribution.
- [ ] Partial/corrupt data.
- [ ] Very old data.
- [ ] Low liquidity artifact.
- [ ] Replay-only synthetic stress case.

### Taken

- [ ] Maak `src/ai/neural/learning/neuralLearningWeights.js`.
- [ ] Bereken learning weight per record.
- [ ] Sla weight op in dataset.
- [ ] Gebruik weights tijdens training.
- [ ] Toon weight distribution in dataset report.
- [ ] Blokkeer training als weight distribution te scheef is.

### Acceptance criteria

- [ ] Slechte data domineert training niet.
- [ ] Belangrijke failure patterns krijgen meer aandacht.
- [ ] Replay data wordt apart gewogen van echte trade data.

---

## 16. Topprioriteit toevoegingen

Als niet alles tegelijk kan, begin met deze vijf:

- [ ] Neural Black Box Recorder.
- [ ] Neural Explainability Layer.
- [ ] Market Shock Simulator.
- [ ] Neural Disagreement System.
- [ ] Live Safety Budget voor Neural.

Waarom deze vijf:
- Ze maken neural beslissingen uitlegbaar.
- Ze maken fouten traceerbaar.
- Ze testen stress-situaties.
- Ze vinden waardevolle training cases.
- Ze beperken live risico als neural ooit actief mag worden.

---

## 17. Aanbevolen implementatievolgorde

### Sprint 1 - Observability

- [ ] Neural Black Box Recorder.
- [ ] Neural Explainability Layer.
- [ ] Neural Disagreement System.

### Sprint 2 - Data bescherming

- [ ] Data Poisoning en Bad Data Protection.
- [ ] Learning Weight System.
- [ ] Confidence Calibration Trainer.

### Sprint 3 - Stress en replay kwaliteit

- [ ] Market Shock Simulator.
- [ ] Neural Sandbox Competitions.
- [ ] Model Personality Profiles.

### Sprint 4 - Autonomie veiligheid

- [ ] Live Safety Budget voor Neural.
- [ ] Full Neural State Rollback.
- [ ] Human Approval Queue.

### Sprint 5 - Langetermijn zelfverbetering

- [ ] Neural Memory per Symbol.
- [ ] Capital Learning Layer.
- [ ] Neural Self-Review Agent.

---

## 18. Eindcontrole

Deze uitbreiding is klaar wanneer:

- [ ] Elke neural beslissing uitlegbaar is.
- [ ] Elke neural influence traceerbaar is.
- [ ] Slechte data training niet kan vervuilen.
- [ ] Stress-scenario's promotie kunnen blokkeren.
- [ ] Disagreements automatisch replay cases worden.
- [ ] Neural live influence een eigen safety budget heeft.
- [ ] Volledige neural state rollback werkt.
- [ ] Operator approval nodig is voor risicoverhoging.
- [ ] Learning weights voorkomen dat ruis te zwaar meetelt.
