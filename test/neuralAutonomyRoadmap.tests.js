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
}
