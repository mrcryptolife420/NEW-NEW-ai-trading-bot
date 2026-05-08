import { buildNeuralAutonomyReport, evaluateNeuralAutonomyGovernor } from "../src/ai/neural/neuralAutonomyGovernor.js";
import { runNeuralReplay } from "../src/ai/neural/replay/neuralReplayEngine.js";
import { runNeuralReplayArena } from "../src/ai/neural/replay/neuralReplayArena.js";
import { evaluateReplayPromotionGate } from "../src/ai/neural/replay/replayPromotionGate.js";
import { buildNeuralReplayQueue } from "../src/ai/neural/replay/neuralReplayQueue.js";
import { buildPositionOutcomeFeedback } from "../src/ai/neural/learning/positionOutcomeLearner.js";
import { evaluateNeuralContinuousLearning } from "../src/ai/neural/learning/neuralContinuousLearner.js";
import { applyNeuralTuningClamp } from "../src/ai/neural/learning/neuralSelfTuningController.js";
import { evaluateNeuralLiveExecutionGate } from "../src/ai/neural/live/neuralLiveExecutionGate.js";
import { buildNeuralLiveExecutionIntent } from "../src/ai/neural/live/neuralLiveExecutionAdapter.js";
import { createNeuralExperiment, updateNeuralExperiment } from "../src/ai/neural/experiments/neuralExperimentRegistry.js";
import { evaluateNeuralAutoRollback } from "../src/ai/neural/governance/neuralAutoRollback.js";
import { buildNeuralPerformanceWatchdog } from "../src/ai/neural/governance/neuralPerformanceWatchdog.js";
import { evaluateNeuralTrainingSchedule } from "../src/ai/neural/training/neuralTrainingScheduler.js";
import { buildLearningEvent } from "../src/ai/neural/learning/learningEventStore.js";
import { buildNeuralProposal, generateNeuralProposals } from "../src/ai/neural/proposalEngine.js";
import { applySafetyBounds } from "../src/ai/neural/safetyBoundLayer.js";
import { auditNeuralProposal } from "../src/ai/neural/neuralSafetyAuditor.js";
import { runFastNeuralReplay } from "../src/ai/neural/fastReplayEngine.js";
import { runNeuralWalkForward } from "../src/ai/neural/neuralWalkForward.js";
import { runNeuralStressScenarios } from "../src/ai/neural/stressScenarioEngine.js";
import { advanceNeuralPromotion, triggerNeuralRollback } from "../src/ai/neural/promotionPipeline.js";
import { buildNeuralOverlay } from "../src/ai/neural/overlayStore.js";
import { runNeuralAutonomyEngine } from "../src/ai/neural/autonomyEngine.js";
import { buildNeuralModelCard, compareNeuralModelCards } from "../src/ai/neural/modelRegistryV2.js";

export function registerNeuralAutonomyRoadmapTests({ runCheck, assert }) {
  runCheck("neural autonomy governor keeps hard safety dominant", () => {
    const result = evaluateNeuralAutonomyGovernor({
      config: { neuralAutonomyEnabled: true, neuralAutonomyLevel: 7, botMode: "paper" },
      hardBlockers: ["exchange_truth_freeze"]
    });
    assert.equal(result.canInfluencePaper, false);
    assert.equal(result.canInfluenceLive, false);
    assert.equal(result.canPlaceOrdersDirectly, false);
    assert.equal(result.reasons.includes("hard_safety_blocks_neural_trade_impact"), true);
  });

  runCheck("neural autonomy report blocks live without explicit neural approval", () => {
    const report = buildNeuralAutonomyReport({
      config: { neuralAutonomyEnabled: true, neuralAutonomyLevel: 7, botMode: "live" },
      botMode: "live",
      liveReadiness: { status: "ready" }
    });
    assert.equal(report.governance.canInfluenceLive, false);
    assert.equal(report.liveSafety.directBrokerCallsAllowed, false);
  });

  runCheck("neural replay engine creates offline simulated trades only", () => {
    const result = runNeuralReplay({
      records: [{ tradeId: "t1", symbol: "BTCUSDT", entryPrice: 100, exitPrice: 103, mfePct: 0.04, maePct: -0.01 }],
      policy: { id: "p1", feePct: 0.001, slippagePct: 0.001 }
    });
    assert.equal(result.metrics.trades, 1);
    assert.equal(result.simulatedTrades[0].isRealTrade, false);
    assert.equal(result.liveSafe.usesLiveBroker, false);
    assert.equal(Number.isFinite(result.metrics.avgNetPnlPct), true);
  });

  runCheck("neural replay arena and promotion gate only recommend paper stage", () => {
    const records = Array.from({ length: 60 }, (_, index) => ({ tradeId: `t${index}`, symbol: "ETHUSDT", entryPrice: 100, exitPrice: 102 }));
    const arena = runNeuralReplayArena({ records, baselinePolicy: { feePct: 0.01 }, challengerPolicies: [{ id: "better", feePct: 0.001 }] });
    const gate = evaluateReplayPromotionGate({ arenaResult: arena, config: { neuralReplayMinTrades: 50, neuralReplayMinBaselineDelta: 0.001 } });
    assert.equal(gate.status, "paper_candidate");
    assert.equal(gate.recommendedMaxStage, "paper_only");
    assert.equal(gate.livePromotionAllowed, false);
  });

  runCheck("neural outcome learner and queue prioritize losses and bad vetoes", () => {
    const feedback = buildPositionOutcomeFeedback({ trade: { tradeId: "loss", symbol: "SOLUSDT", netPnlPct: -0.03 }, neuralPrediction: { expectedPnlPct: 0.02 } });
    const queue = buildNeuralReplayQueue({ trades: [{ tradeId: "loss", netPnlPct: -0.03 }], decisions: [{ decisionId: "d1", approved: false, vetoOutcome: "bad_veto" }] });
    assert.equal(feedback.replayPriority, "high");
    assert.equal(queue.cases[0].priority >= 80, true);
    assert.equal(queue.realTradesSeparated, true);
  });

  runCheck("neural continuous learner and training scheduler remain offline candidate only", () => {
    const learner = evaluateNeuralContinuousLearning({
      config: { neuralContinuousLearningEnabled: true, neuralRetrainMaxPerDay: 2 },
      stats: { newReplayCases: 250, trainingsToday: 0 },
      datasetQuality: { status: "usable" }
    });
    const training = evaluateNeuralTrainingSchedule({
      config: { neuralContinuousLearningEnabled: true, neuralRetrainMaxPerDay: 2 },
      stats: { newReplayCases: 250, trainingsToday: 0 },
      dataQuality: { status: "usable" }
    });
    assert.equal(learner.shouldTrain, true);
    assert.equal(learner.livePromotionAllowed, false);
    assert.equal(training.job.canPromoteLive, false);
  });

  runCheck("neural self tuning clamps and refuses safety parameters", () => {
    const result = applyNeuralTuningClamp({
      proposal: { current: { threshold: 0.5 }, changes: { threshold: 0.7, enableExchangeProtection: false } },
      config: { neuralMaxThresholdDelta: 0.03, neuralSelfTuningPaperOnly: true },
      botMode: "paper"
    });
    assert.equal(result.allowedChanges.threshold, 0.53);
    assert.equal(result.blockedChanges[0].reason, "forbidden_safety_or_secret_param");
  });

  runCheck("neural live gate and adapter never call broker directly", () => {
    const gate = evaluateNeuralLiveExecutionGate({
      config: { neuralLiveAutonomyEnabled: false },
      stats: { paperTrades: 100, liveTradesObserved: 50 }
    });
    const adapter = buildNeuralLiveExecutionIntent({ candidate: { symbol: "BTCUSDT" }, config: { neuralLiveAutonomyEnabled: false } });
    assert.equal(gate.canSubmitLiveIntent, false);
    assert.equal(gate.canCallLiveBrokerDirectly, false);
    assert.equal(adapter.directLiveBrokerCall, false);
  });

  runCheck("neural experiments, watchdog, and rollback are diagnostics-only controls", () => {
    const experiment = createNeuralExperiment({ scope: "paper", policyId: "p1", configHash: "cfg" });
    const rolled = updateNeuralExperiment(experiment, { type: "rollback" });
    const rollback = evaluateNeuralAutoRollback({ activeExperiment: rolled, metrics: { drawdownPct: 0.2 }, config: { neuralRollbackMaxDrawdownPct: 0.08 } });
    const watchdog = buildNeuralPerformanceWatchdog({ active: { profitFactor: 0.8, ece: 0.2 }, baseline: { profitFactor: 1.1 }, previous: { ece: 0.05 } });
    assert.equal(rolled.status, "rolled_back");
    assert.equal(rollback.status, "rollback_recommended");
    assert.equal(rollback.canOpenTrades, false);
    assert.equal(watchdog.status, "rollback_watch");
  });

  runCheck("neural learning events carry replayable decision and feature identity", () => {
    const { event, valid } = buildLearningEvent({ type: "trade_closed_win", symbol: "BTCUSDT", decisionId: "d1", tradeId: "t1", featuresHash: "fh1", pnlPct: 0.02 });
    assert.equal(valid, true);
    assert.equal(event.decisionId, "d1");
    assert.equal(event.featuresHash, "fh1");
    assert.equal(event.label, "good_entry");
  });

  runCheck("neural proposal engine creates evidence-backed paper-safe proposals", () => {
    const events = sampleNeuralEvents();
    const generated = generateNeuralProposals({ events, currentConfig: { modelThreshold: 0.52 } });
    assert.equal(generated.proposals.length >= 1, true);
    assert.equal(generated.proposals[0].proposalId.startsWith("neural_prop_"), true);
    assert.equal(generated.proposals[0].evidence.events, events.length);
    assert.equal(generated.proposals[0].scope.mode, "paper");
  });

  runCheck("neural safety bounds reject forbidden keys and live relaxation", () => {
    const events = sampleNeuralEvents();
    const forbidden = buildNeuralProposal({ type: "threshold_adjustment", scope: { mode: "paper" }, change: { key: "BINANCE_API_KEY", from: 0, to: 1, delta: 1 }, events });
    const liveRelax = buildNeuralProposal({ type: "safe_gate_relax_paper_only", scope: { mode: "live" }, change: { key: "MODEL_THRESHOLD", from: 0.52, to: 0.515, delta: -0.005 }, events });
    assert.equal(applySafetyBounds(forbidden).allowed, false);
    assert.equal(applySafetyBounds(forbidden).reasons.includes("forbidden_key_change"), true);
    assert.equal(applySafetyBounds(liveRelax, { botMode: "live" }).reasons.includes("live_safety_relaxation_requires_human_review"), true);
  });

  runCheck("neural replay walk-forward stress and promotion cannot skip stages", () => {
    const events = sampleNeuralEvents();
    const proposal = buildNeuralProposal({ type: "safe_gate_tighten", scope: { mode: "paper" }, change: { key: "MODEL_THRESHOLD", from: 0.52, to: 0.525, delta: 0.005 }, events });
    const bounds = applySafetyBounds(proposal);
    const replay = runFastNeuralReplay({ proposal, cases: events, policy: { minReplayCases: 5 } });
    const walkForward = runNeuralWalkForward({ proposal, cases: events, windowSize: 5, policy: { minWindows: 2, minSymbols: 1, minRegimes: 1 } });
    const stress = runNeuralStressScenarios({ proposal });
    const promotion = advanceNeuralPromotion({ proposal, bounds, replay, walkForward, stress, shadow: true });
    assert.equal(bounds.allowed, true);
    assert.equal(replay.status, "passed");
    assert.equal(walkForward.status, "passed");
    assert.equal(stress.status, "passed");
    assert.equal(promotion.stage, "paper_sandbox");
    assert.equal(promotion.proposal.rollbackable, true);
  });

  runCheck("neural auditor blocks insufficient evidence and exposes dashboard reasons", () => {
    const proposal = buildNeuralProposal({ type: "feature_weight_adjustment", scope: { mode: "paper" }, change: { key: "featureWeights", from: 0.2, to: 0.21, delta: 0.01 }, events: sampleNeuralEvents().slice(0, 2) });
    const audit = auditNeuralProposal({ proposal });
    assert.equal(audit.allowed, false);
    assert.equal(audit.reasons.includes("insufficient_evidence"), true);
    assert.equal(audit.dashboard.stage, "blocked");
  });

  runCheck("neural overlays are whitelisted mode-scoped and rollbackable", () => {
    const proposal = buildNeuralProposal({ type: "safe_gate_tighten", scope: { mode: "paper" }, change: { key: "MODEL_THRESHOLD", from: 0.52, to: 0.525, delta: 0.005 }, events: sampleNeuralEvents() });
    const overlay = buildNeuralOverlay({ proposal, mode: "paper" });
    const rollback = triggerNeuralRollback({ proposal, previousOverlay: overlay.overlay, reason: "test_rollback" });
    assert.equal(overlay.status, "ready");
    assert.equal(overlay.overlay.mode, "paper");
    assert.equal(rollback.status, "rolled_back");
    assert.equal(rollback.auditEvent.reason, "test_rollback");
  });

  runCheck("neural autonomy engine runs end-to-end without live or env mutation", () => {
    const events = sampleNeuralEvents();
    const result = runNeuralAutonomyEngine({ rawEvents: events, currentConfig: { modelThreshold: 0.52 }, replayCases: events, botMode: "paper", policy: { minReplayCases: 5, minWindows: 2, minSymbols: 1, minRegimes: 1 } });
    assert.equal(result.bounds.allowed, true);
    assert.equal(result.replay.liveSafe.placesOrders, false);
    assert.equal(["paper_overlay_ready", "paper_sandbox"].includes(result.status), true);
    assert.equal(result.overlay.overlay.mode, "paper");
  });

  runCheck("neural model cards are versioned and comparable", () => {
    const baseline = buildNeuralModelCard({ modelId: "base", metrics: { expectancyPct: 0.01, maxDrawdownPct: 0.03 }, allowedModes: ["sandbox", "paper"] });
    const challenger = buildNeuralModelCard({ parentModelId: "base", metrics: { expectancyPct: 0.02, maxDrawdownPct: 0.04 }, allowedModes: ["sandbox", "paper"] });
    const diff = compareNeuralModelCards(baseline, challenger);
    assert.equal(challenger.parentModelId, "base");
    assert.equal(diff.expectancyDelta > 0, true);
    assert.equal(diff.drawdownDelta > 0, true);
  });
}

function sampleNeuralEvents() {
  return Array.from({ length: 30 }, (_, index) => ({
    type: index % 3 === 0 ? "missed_trade_bad_veto" : "trade_closed_win",
    decisionId: `d${index}`,
    tradeId: index % 3 === 0 ? null : `t${index}`,
    symbol: index % 2 === 0 ? "BTCUSDT" : "ETHUSDT",
    timeframe: "15m",
    strategyId: index % 2 === 0 ? "breakout" : "pullback",
    regime: index % 2 === 0 ? "trend" : "range",
    featuresHash: `fh${index}`,
    pnlPct: index % 3 === 0 ? -0.004 : 0.012,
    label: index % 3 === 0 ? "bad_rejection" : "good_entry",
    flags: { high_slippage: index % 10 === 0 }
  }));
}
