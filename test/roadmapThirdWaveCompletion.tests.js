import { buildModelBenchmarkDataset, buildModelBenchmarkReport, runModelBenchmark } from "../src/ai/modelBenchmarkHarness.js";
import { buildDataGovernanceCatalog, planRetentionActions, buildLineageGraph } from "../src/storage/dataGovernanceCatalog.js";
import { scoreProtectiveOrderHealth, buildExitRefreshPolicy } from "../src/execution/protectiveOrderHealth.js";
import { buildAccountAllocationPolicy, splitPortfolioBudget, validateBrokerRoute } from "../src/accounts/accountAllocationPolicy.js";
import { buildAccountingExportManifest, buildTaxLotsFifo, verifyAccountingExport } from "../src/reporting/accountingEvent.js";
import { buildRuntimeArchitectureMap, buildArchitectureMarkdown, buildRoadmapTraceability } from "../src/docs/runtimeArchitectureMap.js";
import { buildSloRegistry, evaluateSloStatus, buildSloMetrics, routeSloAlerts } from "../src/ops/sloRegistry.js";
import { validateStrategyPluginManifest, validateStrategyPluginSource, wrapStrategyPlugin } from "../src/strategies/pluginLifecycle.js";
import { buildBackupManifest, planRestore, verifyRestorePlan, buildRecoveryDrillPlan } from "../src/runtime/backupRestorePlanner.js";
import { buildRuntimePerformanceSnapshot, evaluatePerformanceBudgets, buildLongRunProfileSummary, enforceBoundedHistories } from "../src/runtime/runtimePerformanceSnapshot.js";
import { buildReconcileEvidenceState, planReconcileSelfHealing } from "../src/execution/reconcileSelfHealingPlan.js";
import { transitionOrderLifecycle, validateLifecycleInvariants } from "../src/execution/orderLifecycleStateMachine.js";
import { simulateOperatorAction, requiresLiveConfirmation } from "../src/runtime/operatorActionSimulator.js";
import { dedupeBlockers, buildDecisionTruth, buildActionableUnblockPlan } from "../src/runtime/decisionTruthEngine.js";
import { buildPromotionEvidenceDossier, scorePromotionReadiness, buildGuardedLivePlan } from "../src/runtime/promotionEvidenceDossier.js";
import { buildDataTrustDecision, buildTrustPolicyMatrix, detectSourceConflicts } from "../src/runtime/dataTrustArbitrator.js";
import { compileConfigPolicy, buildEnvTransaction, previewEnvRollback } from "../src/config/configPolicyCompiler.js";
import { buildAutofixReplayPack, assertAutofixReplay, buildReplayDriftReport } from "../src/runtime/autofixReplayRegressionLab.js";
import { classifyNoTradeCycle, labelFalseNegative, proposePaperRecoveryProbe } from "../src/runtime/falseNegativeRecoveryEngine.js";
import { buildRuntimeBoundaryMap, buildRuntimeServiceContainer, validateRuntimeBoundaryOwnership } from "../src/runtime/runtimeServiceBoundaries.js";

export async function registerRoadmapThirdWaveCompletionTests({ runCheck, assert }) {
  await runCheck("roadmap 21 model benchmark blocks unsafe promotion credit", () => {
    const dataset = buildModelBenchmarkDataset([
      { id: "safe", expectedAction: "buy" },
      { id: "stale", expectedAction: "buy", stale: true },
      { id: "hard", expectedAction: "hold", hardSafety: true }
    ]);
    const { results } = runModelBenchmark({
      dataset,
      models: [
        { name: "base", calibrationError: 0.01, decisions: { safe: "hold", stale: "buy", hard: "hold" } },
        { name: "candidate", calibrationError: 0.2, decisions: { safe: "buy", stale: "buy", hard: "buy" } }
      ]
    });
    const report = buildModelBenchmarkReport({ baseline: results[0], candidate: results[1] });
    assert.equal(dataset.summary.tradableCount, 1);
    assert.equal(results[1].decisions.find((item) => item.caseId === "stale").blockedFromWinCredit, true);
    assert.equal(report.promotionEligible, false);
    assert.ok(report.blockers.includes("calibration_regression"));
    assert.ok(report.blockers.includes("safety_violation"));
  });

  await runCheck("roadmap 22 data governance retention dry-run and lineage are deterministic", () => {
    const catalog = buildDataGovernanceCatalog([{ name: "runtime", retentionDays: 1, privacy: "operational" }]);
    const records = [{ dataset: "runtime", id: "old", createdAt: "2026-05-01T00:00:00.000Z" }];
    const actions = planRetentionActions({ catalog, datasets: records, now: "2026-05-19T00:00:00.000Z", dryRun: true });
    const lineage = buildLineageGraph({ decisions: [{ id: "d1", symbol: "BTCUSDT", sources: ["kline"] }], trades: [{ id: "t1", decisionId: "d1", symbol: "BTCUSDT" }] });
    assert.equal(actions[0].action, "archive_or_delete");
    assert.equal(actions[0].mutatesData, false);
    assert.equal(records.length, 1);
    assert.equal(lineage.edges.length, 2);
  });

  await runCheck("roadmap 23 protective order health blocks unsafe cancel", () => {
    const health = scoreProtectiveOrderHealth({ position: { quantity: 1, entryPrice: 100 }, market: { lastPrice: 100 }, exchangeTruth: { stopPrice: 101, staleMs: 600000 } });
    const policy = buildExitRefreshPolicy({ health, requestedAction: "cancel" });
    assert.equal(health.status, "critical");
    assert.ok(health.blockers.includes("missing_take_profit"));
    assert.equal(policy.allowed, false);
    assert.ok(policy.reasons.includes("protective_cancel_requires_replacement"));
  });

  await runCheck("roadmap 24 account allocation blocks unsafe broker routes", () => {
    const policy = buildAccountAllocationPolicy([{ id: "paper", mode: "paper", maxBudget: 100 }, { id: "live", mode: "live", venue: "binance", maxBudget: 300 }]);
    const split = splitPortfolioBudget({ policy, totalBudget: 200 });
    const route = validateBrokerRoute({ account: policy.accounts[0], order: { mode: "live", symbol: "BTCUSDT" } });
    assert.equal(split.length, 2);
    assert.equal(route.allowed, false);
    assert.ok(route.blockers.includes("live_order_requires_live_account"));
  });

  await runCheck("roadmap 25 accounting export keeps paper and live auditable", () => {
    const events = [
      { id: "b1", mode: "paper", symbol: "BTCUSDT", side: "BUY", quantity: 1, price: 100, timestamp: "2026-05-01T00:00:00.000Z" },
      { id: "s1", mode: "paper", symbol: "BTCUSDT", side: "SELL", quantity: 1, price: 110, timestamp: "2026-05-02T00:00:00.000Z" },
      { id: "l1", mode: "live", symbol: "ETHUSDT", side: "BUY", quantity: 1, price: 50, timestamp: "2026-05-03T00:00:00.000Z" }
    ];
    const lots = buildTaxLotsFifo(events);
    const manifest = buildAccountingExportManifest(events);
    assert.equal(lots[0].realizedPnl, 10);
    assert.deepEqual(manifest.modes, ["live", "paper"]);
    assert.equal(verifyAccountingExport(events, manifest).ok, true);
  });

  await runCheck("roadmap 26 architecture map exposes traceability", () => {
    const map = buildRuntimeArchitectureMap({ modules: [{ path: "src/runtime/tradingBot.js" }], routes: [{ domain: "dashboard" }], commands: [{ domain: "cli" }], tests: [{ domain: "runtime" }] });
    const markdown = buildArchitectureMarkdown(map);
    const trace = buildRoadmapTraceability({ roadmaps: ["roadmap-26"], tests: ["roadmap26.architecture.test"] });
    assert.ok(markdown.includes("Runtime Architecture Map"));
    assert.equal(map.domains.runtime.modules, 1);
    assert.equal(trace[0].status, "implemented");
  });

  await runCheck("roadmap 27 slo registry evaluates burn rate and alert routes", () => {
    const registry = buildSloRegistry([{ name: "protection", metric: "protectionOk", target: 0.99, liveOnly: true, alertRoute: "pager" }]);
    const paper = evaluateSloStatus({ registry, snapshot: { protectionOk: 0 }, mode: "paper" });
    const live = evaluateSloStatus({ registry, snapshot: { protectionOk: 0.5 }, mode: "live" });
    assert.equal(paper[0].status, "skipped");
    assert.equal(live[0].status, "critical");
    assert.equal(routeSloAlerts(live)[0].route, "pager");
    assert.equal(buildSloMetrics(live)[0].labels.slo, "protection");
  });

  await runCheck("roadmap 28 strategy plugin lifecycle rejects unsafe source and defaults shadow", async () => {
    assert.equal(validateStrategyPluginManifest({ name: "test", version: "1", entrypoint: "index.js" }).ok, true);
    assert.equal(validateStrategyPluginSource("process.env.API_KEY; client.placeOrder()").ok, false);
    const wrapped = wrapStrategyPlugin({ run: () => ({ signal: "buy", confidence: 2 }) });
    const result = await wrapped({ symbol: "BTCUSDT" });
    assert.equal(result.lifecycle, "shadow");
    assert.equal(result.blocked, true);
    assert.equal(result.confidence, 1);
  });

  await runCheck("roadmap 29 backup restore plans require exchange truth for live restore", () => {
    const backup = buildBackupManifest({ files: [{ path: "runtime.json", sha256: "abc", critical: true }] });
    const plan = planRestore({ current: { "runtime.json": "old" }, backup, dryRun: true, mode: "live" });
    const drill = buildRecoveryDrillPlan({ scenarios: [{ id: "lost-runtime" }] });
    assert.equal(plan.allowed, false);
    assert.ok(plan.blockers.includes("live_restore_requires_exchange_truth"));
    assert.equal(verifyRestorePlan({ ...plan, allowed: true }).ok, true);
    assert.equal(drill[0].dryRun, true);
  });

  await runCheck("roadmap 30 runtime performance budgets preserve audit history", () => {
    const snapshot = buildRuntimePerformanceSnapshot({ memory: { heapUsedMb: 600 }, loops: [10, 20, 100], caches: { a: 1, b: 2 } });
    const budget = evaluatePerformanceBudgets(snapshot, { heapUsedMb: 500, loopP95Ms: 50, cacheKeys: 1 });
    const bounded = enforceBoundedHistories([{ id: "audit", audit: true }, { id: "old" }, { id: "new" }], { maxItems: 2 });
    assert.equal(budget.ok, false);
    assert.equal(buildLongRunProfileSummary([{ heapUsedMb: 100 }, { heapUsedMb: 120 }, { heapUsedMb: 200 }]).leakSuspected, true);
    assert.ok(bounded.some((item) => item.id === "audit"));
  });

  await runCheck("roadmap 31 reconcile self-healing auto-resolves safe cases only", () => {
    const evidence = buildReconcileEvidenceState({ exchangePosition: 0, localPosition: 1, openOrders: [{ orderId: 1, status: "NEW", executedQty: 0 }] });
    const plan = planReconcileSelfHealing(evidence);
    const conflict = planReconcileSelfHealing({ exchangePosition: 1, localPosition: 2 });
    assert.equal(plan.canAutoResolve, true);
    assert.equal(plan.requiresManualReview, false);
    assert.equal(conflict.requiresManualReview, true);
  });

  await runCheck("roadmap 32 order lifecycle invariants catch stale local position", () => {
    const transition = transitionOrderLifecycle("open", "cancel");
    const invalid = validateLifecycleInvariants({ order: { state: "canceled", executedQty: 0 }, position: { state: "open" } });
    const valid = validateLifecycleInvariants({ order: { state: transition.state, executedQty: 0 }, position: { state: "flat" } });
    assert.equal(transition.state, "canceled");
    assert.equal(invalid.ok, false);
    assert.equal(valid.ok, true);
  });

  await runCheck("roadmap 33 operator simulator requires confirmation for live actions", () => {
    const sim = simulateOperatorAction({ state: { config: { mode: "paper" } }, action: { type: "apply_live_profile", mode: "live", patch: { config: { mode: "live" } } } });
    assert.equal(requiresLiveConfirmation({ type: "start_live" }), true);
    assert.equal(sim.allowed, false);
    assert.equal(sim.diff[0].path, "config.mode");
  });

  await runCheck("roadmap 34 decision truth dedupes blockers by priority", () => {
    const blockers = dedupeBlockers([{ reason: "model_confidence_too_low" }, { reason: "exchange_safety_blocked" }, { reason: "model_confidence_too_low", priority: 10 }]);
    const truth = buildDecisionTruth({ candidates: [{}], blockers, exchangeTruth: { fresh: true } });
    assert.equal(blockers[0].reason, "exchange_safety_blocked");
    assert.equal(truth.primaryBlocker.reason, "exchange_safety_blocked");
    assert.equal(buildActionableUnblockPlan(truth)[0].action, "collect_more_evidence");
  });

  await runCheck("roadmap 35 promotion dossier blocks live until evidence is complete", () => {
    const dossier = buildPromotionEvidenceDossier({ paperRuns: [{ pnl: 1 }], liveChecks: [{ ok: true }], incidents: [] });
    const readiness = scorePromotionReadiness(dossier, { minSamples: 2 });
    const plan = buildGuardedLivePlan(readiness);
    assert.equal(readiness.eligible, false);
    assert.equal(plan.allowed, false);
    assert.ok(plan.rollbackTriggers.includes("reconcile_manual_review"));
  });

  await runCheck("roadmap 36 market data trust arbitration blocks trade but permits display", () => {
    const conflicts = detectSourceConflicts([{ name: "a", price: 100 }, { name: "b", price: 101 }]);
    const decision = buildDataTrustDecision({ sources: [{ name: "local", price: 100, ageMs: 60000 }, { name: "rest", price: 100, ageMs: 1000 }] });
    const matrix = buildTrustPolicyMatrix({ actions: ["enter_trade", "dashboard_display"] });
    assert.equal(conflicts.length, 1);
    assert.equal(decision.canTrade, true);
    assert.equal(decision.canDisplay, true);
    assert.equal(matrix.find((item) => item.action === "dashboard_display").allowsStaleDisplay, true);
  });

  await runCheck("roadmap 37 config policy compiler redacts env transactions", () => {
    const policy = compileConfigPolicy({ API_KEY: { required: true }, PAPER_MODE: { type: "boolean" } });
    const tx = buildEnvTransaction({ before: { API_KEY: "old", PAPER_MODE: "true" }, after: { API_KEY: "new", PAPER_MODE: "false" }, policy });
    const rollback = previewEnvRollback(tx);
    assert.equal(tx.changes.find((item) => item.key === "API_KEY").after, "[redacted]");
    assert.equal(rollback.mutatesEnv, false);
  });

  await runCheck("roadmap 38 autofix replay lab catches manual-review regressions", () => {
    const pack = buildAutofixReplayPack({ expectedActions: [{ incidentId: "i1", action: "cancel_unfilled_order" }] });
    const assertion = assertAutofixReplay({ pack, actualActions: [{ incidentId: "i1", action: "manual_review" }] });
    const drift = buildReplayDriftReport({ baseline: pack.expectedActions, candidate: [{ incidentId: "i1", action: "manual_review" }] });
    assert.equal(assertion.ok, false);
    assert.equal(assertion.regressedToManual.length, 1);
    assert.equal(drift[0].drifted, true);
  });

  await runCheck("roadmap 39 false-negative recovery never probes hard safety blockers", () => {
    const hard = classifyNoTradeCycle({ candidates: [{}], blockers: [{ reason: "exchange_safety_blocked" }] });
    const soft = labelFalseNegative(classifyNoTradeCycle({ candidates: [{}], blockers: [{ reason: "model_confidence_too_low" }] }), { moveBps: 75 });
    assert.equal(proposePaperRecoveryProbe(hard).allowed, false);
    assert.equal(proposePaperRecoveryProbe(soft).allowed, true);
  });

  await runCheck("roadmap 40 runtime service boundaries reject duplicate ownership and cycles", () => {
    const clean = buildRuntimeBoundaryMap([{ name: "loop", owns: ["cycle"], dependsOn: ["storage"] }, { name: "storage", owns: ["state"], dependsOn: [] }]);
    const dirty = buildRuntimeBoundaryMap([{ name: "a", owns: ["state"], dependsOn: ["b"] }, { name: "b", owns: ["state"], dependsOn: ["a"] }]);
    assert.equal(validateRuntimeBoundaryOwnership(clean).ok, true);
    assert.equal(validateRuntimeBoundaryOwnership(dirty).ok, false);
    assert.equal(buildRuntimeServiceContainer(clean).validation.ok, true);
  });
}
