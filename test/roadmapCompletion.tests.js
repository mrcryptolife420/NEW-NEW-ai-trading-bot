import { buildMarketDataIntelligence, attachMarketDataIntelligenceToCandidates } from "../src/runtime/marketDataIntelligence.js";
import { buildModelLifecycleDossier, buildModelLifecycleBoard } from "../src/runtime/modelLifecycleDossier.js";
import { buildStrategyExperimentWorkflow, buildStrategyLifecycleBoard } from "../src/runtime/strategyResearchWorkflow.js";
import { buildProfileDiffPreview, buildSetupStateMachine } from "../src/runtime/setupStateMachine.js";
import { buildCapitalProtectionDrills, buildLiveIncidentCommandState } from "../src/runtime/liveIncidentCommand.js";

export async function registerRoadmapCompletionTests({ runCheck, assert }) {
  await runCheck("roadmap 06 market data intelligence blocks missing critical source and annotates candidates", () => {
    const now = "2026-05-17T20:00:00.000Z";
    const intelligence = buildMarketDataIntelligence({
      symbols: ["BTCUSDT"],
      candidates: [{ symbol: "BTCUSDT", at: now }],
      marketSnapshots: {
        BTCUSDT: {
          ticker: { price: 65000, updatedAt: now },
          orderBook: { bid: 64999, ask: 65001, depthConfidence: 0.8 },
          updatedAt: now,
          streamUpdatedAt: now
        }
      },
      providerSummary: {
        providers: [
          { id: "derivatives", role: "required", status: "unavailable", reason: "provider_timeout" },
          { id: "macro", role: "optional", status: "ready" }
        ]
      },
      streamHealth: { status: "ready", publicConnected: true, lastPublicMessageAt: now },
      now
    });
    assert.equal(intelligence.status, "blocked");
    assert.equal(intelligence.symbols[0].providerQuorum.status, "blocked");
    assert.ok(intelligence.symbols[0].hardBlockers.includes("candles_missing"));
    assert.ok(intelligence.symbols[0].hardBlockers.includes("required_provider_missing:derivatives"));
    const annotated = attachMarketDataIntelligenceToCandidates([{ symbol: "BTCUSDT" }], intelligence);
    assert.equal(annotated[0].marketDataIntelligence.status, "blocked");
  });

  await runCheck("roadmap 07 model lifecycle dossier requires rollback-ready governed evidence", () => {
    const dossier = buildModelLifecycleDossier({
      mode: "paper",
      modelRegistry: { readinessScore: 0.8, snapshots: [{ id: "stable-1" }] },
      calibration: { calibrationError: 0.04, tradeCount: 80 },
      offlineTrainer: { readinessScore: 0.75, retrainReadiness: { paper: { readinessScore: 0.7, freshnessScore: 0.8 } } },
      onlineAdaptation: { healthScore: 0.8 },
      canaryGate: { status: "canary", antiOverfitPassed: true, walkForward: { passed: true }, stress: { passed: true } },
      rollbackWatch: { status: "ready", rollbackReady: true, trigger: "canary_drift" },
      proposals: [{ id: "proposal-1" }]
    });
    assert.equal(dossier.status, "canary");
    assert.equal(dossier.calibrationDrift.status, "calibrated");
    assert.equal(dossier.gates.every((gate) => gate.passed), true);
    assert.equal(buildModelLifecycleBoard([dossier]).status, "ready");
  });

  await runCheck("roadmap 08 strategy workflow gates invalid or incomplete research evidence", () => {
    const workflow = buildStrategyExperimentWorkflow({
      experiment: { id: "exp-1", strategyId: "breakout-v1", mode: "paper" },
      strategy: {
        id: "breakout-v1",
        indicators: ["ema", "atr"],
        entryRules: [{ indicator: "ema", operator: ">", value: 1 }],
        exitRules: [{ indicator: "atr", operator: ">", value: 2 }]
      },
      scenarios: [{ id: "exchange_data_stale" }],
      walkForward: { consistency: 0.7 },
      monteCarlo: { riskOfRuin: 0.04 },
      realityGap: { gapScore: 0.1 },
      portfolio: { healthScore: 0.8 },
      tournament: { status: "winner" }
    });
    assert.equal(workflow.status, "retest_required");
    assert.ok(workflow.blockedGates.includes("scenario_pack"));
    assert.equal(buildStrategyLifecycleBoard([workflow]).status, "review_required");
  });

  await runCheck("roadmap 09 setup state and profile diff keep live changes locked", () => {
    const setup = buildSetupStateMachine({
      config: { botMode: "live", envPath: "C:/tmp/.env", tradeProfileId: "guarded-live-template", liveTradingAcknowledged: "" },
      dashboard: { reachable: true }
    });
    assert.equal(setup.state, "live_locked");
    assert.ok(setup.reasons.includes("live_acknowledgement_missing"));
    const diff = buildProfileDiffPreview({
      preview: {
        safeDefault: false,
        updates: { BOT_MODE: "live", LIVE_TRADING_ACKNOWLEDGED: "" },
        warnings: []
      },
      currentConfig: { botMode: "paper" }
    });
    assert.equal(diff.safeApply.allowed, false);
    assert.equal(diff.diff.liveImpact, "requires_acknowledgement_or_preflight");
  });

  await runCheck("roadmap 10 live incident command freezes entries on capital or reconcile risk", () => {
    const drills = buildCapitalProtectionDrills({
      capitalGovernor: { dailyLossLockActive: true },
      panicPlan: { positionsToClose: [] }
    });
    assert.equal(drills.status, "review_required");
    const command = buildLiveIncidentCommandState({
      config: { botMode: "live" },
      readiness: { status: "ready" },
      livePreflight: { status: "ready", allowed: true },
      exchangeSafety: { status: "warning", reconcileRequired: true, blockedSymbols: [{ symbol: "ETHUSDT" }] },
      capitalGovernor: { dailyLossLockActive: true },
      alerts: { items: [{ id: "capital", severity: "critical" }] },
      panicPlan: { positionsToClose: [] },
      positions: [{ symbol: "ETHUSDT", reconcileRequired: true }]
    });
    assert.equal(command.state, "entry_freeze");
    assert.equal(command.severity, "critical");
    assert.ok(command.reasons.includes("capital_protection_review"));
    assert.ok(command.deniedActions.includes("open_new_live_entries_without_review"));
  });
}

