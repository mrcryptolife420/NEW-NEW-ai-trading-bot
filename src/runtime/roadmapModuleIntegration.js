import { buildModelBenchmarkDataset, buildModelBenchmarkReport, runModelBenchmark } from "../ai/modelBenchmarkHarness.js";
import { buildDataGovernanceCatalog, buildLineageGraph, planRetentionActions } from "../storage/dataGovernanceCatalog.js";
import { buildExitRefreshPolicy, scoreProtectiveOrderHealth } from "../execution/protectiveOrderHealth.js";
import { buildAccountAllocationPolicy, splitPortfolioBudget, validateBrokerRoute } from "../accounts/accountAllocationPolicy.js";
import { buildAccountingExportManifest, buildTaxLotsFifo, verifyAccountingExport } from "../reporting/accountingEvent.js";
import { buildArchitectureMarkdown, buildRoadmapTraceability, buildRuntimeArchitectureMap } from "../docs/runtimeArchitectureMap.js";
import { buildSloMetrics, buildSloRegistry, evaluateSloStatus, routeSloAlerts } from "../ops/sloRegistry.js";
import { validateStrategyPluginManifest, validateStrategyPluginSource, wrapStrategyPlugin } from "../strategies/pluginLifecycle.js";
import { buildBackupManifest, buildRecoveryDrillPlan, planRestore, verifyRestorePlan } from "./backupRestorePlanner.js";
import { buildLongRunProfileSummary, buildRuntimePerformanceSnapshot, enforceBoundedHistories, evaluatePerformanceBudgets } from "./runtimePerformanceSnapshot.js";
import { buildReconcileEvidenceState, planReconcileSelfHealing } from "../execution/reconcileSelfHealingPlan.js";
import { transitionOrderLifecycle, transitionPositionLifecycle, transitionProtectionLifecycle, validateLifecycleInvariants } from "../execution/orderLifecycleStateMachine.js";
import { requiresLiveConfirmation, simulateOperatorAction } from "./operatorActionSimulator.js";
import { buildActionableUnblockPlan, buildDecisionTruth, dedupeBlockers } from "./decisionTruthEngine.js";
import { buildGuardedLivePlan, buildPromotionEvidenceDossier, scorePromotionReadiness } from "./promotionEvidenceDossier.js";
import { buildDataTrustDecision, buildTrustPolicyMatrix, detectSourceConflicts } from "./dataTrustArbitrator.js";
import { buildEnvTransaction, compileConfigPolicy, previewEnvRollback } from "../config/configPolicyCompiler.js";
import { assertAutofixReplay, buildAutofixReplayPack, buildReplayDriftReport } from "./autofixReplayRegressionLab.js";
import { classifyNoTradeCycle, labelFalseNegative, proposePaperRecoveryProbe } from "./falseNegativeRecoveryEngine.js";
import { buildRuntimeBoundaryMap, buildRuntimeServiceContainer, validateRuntimeBoundaryOwnership } from "./runtimeServiceBoundaries.js";

const MODULE_DEFINITIONS = [
  {
    id: "model_benchmark_harness",
    roadmap: 21,
    domain: "ai",
    title: "Model benchmark harness",
    explanation: "Vergelijkt baseline en kandidaatmodellen zonder stale of hard-safety cases als winst te tellen.",
    systemHook: "AI promotion gates en model-evaluatie.",
    dashboardHook: "Toont benchmark readiness en promotion blockers.",
    evaluate() {
      const dataset = buildModelBenchmarkDataset([{ id: "safe", expectedAction: "buy" }, { id: "stale", expectedAction: "buy", stale: true }]);
      const { results } = runModelBenchmark({ dataset, models: [{ name: "baseline", decisions: { safe: "hold", stale: "buy" } }, { name: "candidate", calibrationError: 0.05, decisions: { safe: "buy", stale: "buy" } }] });
      const report = buildModelBenchmarkReport({ baseline: results[0], candidate: results[1] });
      return { status: report.promotionEligible ? "ready" : "guarded", evidence: [`cases ${dataset.summary.count}`, `blockers ${report.blockers.length}`] };
    }
  },
  {
    id: "data_governance_catalog",
    roadmap: 22,
    domain: "storage",
    title: "Data governance catalog",
    explanation: "Plant retention, lineage en auditbaarheid zonder dry-run data te muteren.",
    systemHook: "Runtime storage, trade journal en read-model governance.",
    dashboardHook: "Toont retention/dataset lineage status.",
    evaluate({ now }) {
      const catalog = buildDataGovernanceCatalog([{ name: "runtime", retentionDays: 30 }]);
      const retention = planRetentionActions({ catalog, datasets: [{ dataset: "runtime", id: "sample", createdAt: now }], now });
      const lineage = buildLineageGraph({ decisions: [{ id: "d1", sources: ["kline"] }], trades: [{ id: "t1", decisionId: "d1" }] });
      return { status: "ready", evidence: [`retention ${retention[0]?.action}`, `lineage edges ${lineage.edges.length}`] };
    }
  },
  {
    id: "protective_order_health",
    roadmap: 23,
    domain: "execution",
    title: "Protective order health",
    explanation: "Controleert stop/target geometrie en blokkeert onveilige cancels zonder replacement.",
    systemHook: "Live/paper exit management en exchange protection.",
    dashboardHook: "Toont protection health en cancel blockers.",
    evaluate({ dashboard }) {
      const position = (dashboard.openPositions || dashboard.positions || [])[0] || {};
      const health = scoreProtectiveOrderHealth({ position, market: { lastPrice: position.lastPrice || position.entryPrice }, exchangeTruth: position.exchangeTruth || {} });
      const policy = buildExitRefreshPolicy({ health, requestedAction: "cancel" });
      return { status: policy.allowed ? health.status : "guarded", evidence: [`health ${health.status}`, policy.allowed ? "cancel guarded ok" : "cancel needs replacement"] };
    }
  },
  {
    id: "account_allocation_policy",
    roadmap: 24,
    domain: "accounts",
    title: "Account allocation policy",
    explanation: "Splitst budget per account en voorkomt live orders richting paper/demo routes.",
    systemHook: "Broker route selectie en portfolio budget control.",
    dashboardHook: "Toont account-route safety en budgetverdeling.",
    evaluate({ config }) {
      const policy = buildAccountAllocationPolicy([{ id: "paper", mode: "paper", maxBudget: 100 }, { id: "live", mode: config.botMode === "live" ? "live" : "paper", venue: config.botMode === "live" ? "binance" : "paper", maxBudget: 100 }]);
      const split = splitPortfolioBudget({ policy, totalBudget: 100 });
      const route = validateBrokerRoute({ account: policy.accounts[0], order: { mode: "live", symbol: "BTCUSDT" } });
      return { status: route.allowed ? "ready" : "guarded", evidence: [`accounts ${split.length}`, route.blockers[0] || "route ok"] };
    }
  },
  {
    id: "accounting_export",
    roadmap: 25,
    domain: "reporting",
    title: "Compliance tax audit export",
    explanation: "Normaliseert fills naar FIFO lots en controleert export-manifesten.",
    systemHook: "Trade reporting, accounting export en audit trail.",
    dashboardHook: "Toont export verify status en paper/live scheiding.",
    evaluate() {
      const events = [{ mode: "paper", symbol: "BTCUSDT", side: "BUY", quantity: 1, price: 100 }, { mode: "paper", symbol: "BTCUSDT", side: "SELL", quantity: 1, price: 110 }];
      const lots = buildTaxLotsFifo(events);
      const manifest = buildAccountingExportManifest(events);
      return { status: verifyAccountingExport(events, manifest).ok ? "ready" : "error", evidence: [`lots ${lots.length}`, `events ${manifest.count}`] };
    }
  },
  {
    id: "runtime_architecture_map",
    roadmap: 26,
    domain: "docs",
    title: "Runtime architecture map",
    explanation: "Genereert module-, route-, command- en testtraceability vanuit een centrale map.",
    systemHook: "Autodocs en architectuurcontracten.",
    dashboardHook: "Toont coverage van modules/routes/tests.",
    evaluate() {
      const map = buildRuntimeArchitectureMap({ modules: [{ path: "src/runtime/tradingBot.js" }], routes: [{ domain: "dashboard" }], commands: [{ domain: "cli" }], tests: [{ domain: "runtime" }] });
      const markdown = buildArchitectureMarkdown(map);
      const trace = buildRoadmapTraceability({ roadmaps: ["roadmap-26"], tests: ["roadmap26"] });
      return { status: markdown.includes("Runtime Architecture Map") ? "ready" : "error", evidence: [`domains ${Object.keys(map.domains).length}`, `trace ${trace.length}`] };
    }
  },
  {
    id: "slo_alert_routing",
    roadmap: 27,
    domain: "ops",
    title: "SLO alert routing",
    explanation: "Evalueert burn-rate en routeert kritieke alerts zonder high-cardinality labels.",
    systemHook: "Ops health, alerting en metrics.",
    dashboardHook: "Toont SLO status, metrics en alert routes.",
    evaluate({ dashboard }) {
      const registry = buildSloRegistry([{ name: "snapshot", metric: "freshness", target: 0.9, alertRoute: "operator" }]);
      const status = evaluateSloStatus({ registry, snapshot: { freshness: dashboard.ops?.dataFreshness?.stale ? 0 : 1 }, mode: dashboard.overview?.mode || "paper" });
      const metrics = buildSloMetrics(status);
      const alerts = routeSloAlerts(status);
      return { status: alerts.length ? "degraded" : "ready", evidence: [`metrics ${metrics.length}`, `alerts ${alerts.length}`] };
    }
  },
  {
    id: "strategy_plugin_lifecycle",
    roadmap: 28,
    domain: "strategies",
    title: "Strategy plugin lifecycle",
    explanation: "Valideert manifests/source en draait plugins standaard in shadow mode.",
    systemHook: "Strategy extension lifecycle.",
    dashboardHook: "Toont plugin safety en lifecycle mode.",
    evaluate() {
      const manifest = validateStrategyPluginManifest({ name: "sample", version: "1", entrypoint: "index.js" });
      const source = validateStrategyPluginSource("export function run(){ return { signal: 'hold' }; }");
      const wrapped = wrapStrategyPlugin({ run: () => ({ signal: "buy", confidence: 0.5 }) });
      return { status: manifest.ok && source.ok && typeof wrapped === "function" ? "ready" : "error", evidence: ["lifecycle shadow", `source ${source.ok ? "safe" : "blocked"}`] };
    }
  },
  {
    id: "backup_restore_planner",
    roadmap: 29,
    domain: "runtime",
    title: "Disaster recovery backup restore",
    explanation: "Bouwt backup manifests en restore dry-runs met live exchange-truth guard.",
    systemHook: "Runtime backup, restore en drill planning.",
    dashboardHook: "Toont restore readiness en live blockers.",
    evaluate({ config }) {
      const backup = buildBackupManifest({ files: [{ path: "runtime.json", sha256: "abc", critical: true }] });
      const plan = planRestore({ current: {}, backup, mode: config.botMode || "paper", dryRun: true });
      const verify = verifyRestorePlan({ ...plan, allowed: true });
      const drills = buildRecoveryDrillPlan({ scenarios: [{ id: "runtime-loss" }] });
      return { status: plan.blocked ? "guarded" : verify.ok ? "ready" : "error", evidence: [`restore ${plan.actions.length}`, `drills ${drills.length}`] };
    }
  },
  {
    id: "runtime_performance_snapshot",
    roadmap: 30,
    domain: "runtime",
    title: "Runtime performance memory profiling",
    explanation: "Meet heap/loop/cache budgetten en begrenst histories zonder audit-events te verliezen.",
    systemHook: "Long-run runtime performance and memory guardrails.",
    dashboardHook: "Toont budget breaches en profiler summary.",
    evaluate() {
      const memory = typeof process !== "undefined" && process.memoryUsage ? process.memoryUsage() : {};
      const snapshot = buildRuntimePerformanceSnapshot({ memory, loops: [10, 20, 30], caches: { snapshot: 1 } });
      const budget = evaluatePerformanceBudgets(snapshot, { heapUsedMb: 4096, loopP95Ms: 1000, cacheKeys: 100 });
      const summary = buildLongRunProfileSummary([snapshot]);
      const bounded = enforceBoundedHistories([{ audit: true }, { id: "sample" }], { maxItems: 1 });
      return { status: budget.ok ? "ready" : "degraded", evidence: [`heap ${Math.round(snapshot.heapUsedMb)}MB`, `audit kept ${bounded.some((item) => item.audit)}`, `samples ${summary.samples}`] };
    }
  },
  {
    id: "reconcile_self_healing",
    roadmap: 31,
    domain: "execution",
    title: "Autonomous reconcile self-healing",
    explanation: "Plant auto-fixes voor bewezen veilige reconcile cases en escaleert harde conflicten.",
    systemHook: "Exchange safety, inventory reconcile en order cleanup.",
    dashboardHook: "Toont auto-resolve/manual-review acties.",
    evaluate({ dashboard }) {
      const manual = Boolean(dashboard.ops?.riskLocks?.manualReviewPending);
      const evidence = buildReconcileEvidenceState({ exchangePosition: manual ? 1 : 0, localPosition: manual ? 2 : 1 });
      const plan = planReconcileSelfHealing(evidence);
      return { status: plan.requiresManualReview ? "guarded" : plan.canAutoResolve ? "ready" : "ready", evidence: [`auto ${plan.canAutoResolve}`, `manual ${plan.requiresManualReview}`] };
    }
  },
  {
    id: "order_lifecycle_state_machine",
    roadmap: 32,
    domain: "execution",
    title: "Order lifecycle state machine",
    explanation: "Valideert order-, position- en protection-state invarianten.",
    systemHook: "Execution intent ledger en protective order lifecycle.",
    dashboardHook: "Toont lifecycle violations en pending actions.",
    evaluate() {
      const order = transitionOrderLifecycle("open", "cancel");
      const position = transitionPositionLifecycle("flat", "entry_fill");
      const protection = transitionProtectionLifecycle("missing", "attach");
      const validation = validateLifecycleInvariants({ order: { state: order.state, executedQty: 0 }, position: { state: "flat" }, protection });
      return { status: validation.ok ? "ready" : "degraded", evidence: [`order ${order.state}`, `position ${position.state}`, `protection ${protection.state}`] };
    }
  },
  {
    id: "operator_action_simulator",
    roadmap: 33,
    domain: "runtime",
    title: "Operator action simulator",
    explanation: "Simuleert operatoracties, toont diff en vereist extra bevestiging voor live acties.",
    systemHook: "Dashboard actions en manager mutations.",
    dashboardHook: "Toont preview/diff/confirmation status.",
    evaluate() {
      const simulation = simulateOperatorAction({ state: { mode: "paper" }, action: { type: "apply_live_profile", mode: "live", patch: { mode: "live" } } });
      return { status: simulation.allowed ? "ready" : "guarded", evidence: [`diff ${simulation.diff.length}`, `live confirm ${requiresLiveConfirmation({ type: "start_live" })}`] };
    }
  },
  {
    id: "decision_truth_engine",
    roadmap: 34,
    domain: "runtime",
    title: "Decision truth and blocker dedup",
    explanation: "Dedupliceert blockers op prioriteit en maakt unblock-acties expliciet.",
    systemHook: "Decision funnel, root blocker en operator diagnostics.",
    dashboardHook: "Toont primaire blocker en actieplan.",
    evaluate({ dashboard }) {
      const blockers = dedupeBlockers([{ reason: dashboard.ops?.rootBlocker?.primaryRootBlocker?.reason || "model_confidence_too_low" }, { reason: "exchange_safety_blocked" }]);
      const truth = buildDecisionTruth({ candidates: dashboard.topDecisions || [], blockers, exchangeTruth: { fresh: true } });
      const plan = buildActionableUnblockPlan(truth);
      return { status: truth.primaryBlocker?.priority >= 90 ? "guarded" : "ready", evidence: [`primary ${truth.primaryBlocker?.reason || "none"}`, `actions ${plan.length}`] };
    }
  },
  {
    id: "promotion_evidence_dossier",
    roadmap: 35,
    domain: "runtime",
    title: "Paper live promotion evidence dossier",
    explanation: "Blokkeert live promotie tot paper evidence, live checks en incidenten schoon zijn.",
    systemHook: "Model/strategy promotion gates.",
    dashboardHook: "Toont readiness blockers en rollback triggers.",
    evaluate({ dashboard }) {
      const trades = dashboard.recentTrades || dashboard.trades || [];
      const dossier = buildPromotionEvidenceDossier({ paperRuns: trades, liveChecks: [{ ok: true }], incidents: [] });
      const readiness = scorePromotionReadiness(dossier, { minSamples: 30 });
      const plan = buildGuardedLivePlan(readiness);
      return { status: plan.allowed ? "ready" : "guarded", evidence: [`samples ${dossier.sampleCount}`, `blockers ${plan.blockers.length}`] };
    }
  },
  {
    id: "market_data_trust_arbitration",
    roadmap: 36,
    domain: "runtime",
    title: "Market data trust arbitration",
    explanation: "Kiest betrouwbare marktbron en scheidt trade-permissie van dashboard-display.",
    systemHook: "Market data trust gates voor entry/exit.",
    dashboardHook: "Toont trusted source, stale sources en conflicts.",
    evaluate() {
      const conflicts = detectSourceConflicts([{ name: "local", price: 100 }, { name: "rest", price: 100.1 }]);
      const decision = buildDataTrustDecision({ sources: [{ name: "rest", price: 100, ageMs: 1, weight: 2 }] });
      const matrix = buildTrustPolicyMatrix({ actions: ["enter_trade", "dashboard_display"] });
      return { status: decision.canTrade ? "ready" : "guarded", evidence: [`trusted ${decision.trustedSource || "none"}`, `conflicts ${conflicts.length}`, `policies ${matrix.length}`] };
    }
  },
  {
    id: "config_policy_compiler",
    roadmap: 37,
    domain: "config",
    title: "Config policy compiler env journal",
    explanation: "Compileert env policy, redigeert secrets en maakt rollback previews.",
    systemHook: "Profile apply, quick settings en env mutations.",
    dashboardHook: "Toont welke settings wijzigen en wat rollback doet.",
    evaluate({ config }) {
      const policy = compileConfigPolicy({ BOT_MODE: { required: true }, BINANCE_API_KEY: { secret: true } });
      const tx = buildEnvTransaction({ before: { BOT_MODE: "paper" }, after: { BOT_MODE: config.botMode || "paper", BINANCE_API_KEY: "set" }, policy });
      const rollback = previewEnvRollback(tx);
      return { status: "ready", evidence: [`changes ${tx.changes.length}`, `rollback mutates ${rollback.mutatesEnv}`] };
    }
  },
  {
    id: "autofix_replay_regression_lab",
    roadmap: 38,
    domain: "runtime",
    title: "Replay driven autofix regression lab",
    explanation: "Replayt autofix incidents en detecteert regressies naar manual review.",
    systemHook: "Self-heal regression checks.",
    dashboardHook: "Toont replay drift en ontbrekende autofix acties.",
    evaluate() {
      const pack = buildAutofixReplayPack({ expectedActions: [{ incidentId: "i1", action: "cancel_unfilled_order" }] });
      const assertion = assertAutofixReplay({ pack, actualActions: [{ incidentId: "i1", action: "cancel_unfilled_order" }] });
      const drift = buildReplayDriftReport({ baseline: pack.expectedActions, candidate: [{ incidentId: "i1", action: "cancel_unfilled_order" }] });
      return { status: assertion.ok ? "ready" : "degraded", evidence: [`missing ${assertion.missing.length}`, `drift ${drift.filter((item) => item.drifted).length}`] };
    }
  },
  {
    id: "false_negative_recovery",
    roadmap: 39,
    domain: "runtime",
    title: "Trading opportunity recovery",
    explanation: "Labelt gemiste soft-blocked kansen en staat alleen paper probes toe zonder hard-safety blocker.",
    systemHook: "No-trade learning en paper recovery probes.",
    dashboardHook: "Toont false-negative label en probe eligibility.",
    evaluate({ dashboard }) {
      const blockers = dashboard.ops?.health?.tradeEntryBlockingReasons || [];
      const cycle = classifyNoTradeCycle({ candidates: dashboard.topDecisions || [{}], blockers });
      const label = labelFalseNegative(cycle, { moveBps: 75 });
      const probe = proposePaperRecoveryProbe(label);
      return { status: probe.allowed ? "ready" : "guarded", evidence: [`class ${cycle.classification}`, `probe ${probe.allowed}`] };
    }
  },
  {
    id: "runtime_service_boundaries",
    roadmap: 40,
    domain: "runtime",
    title: "Runtime modularization boundaries",
    explanation: "Valideert service ownership en voorkomt dependency cycles.",
    systemHook: "Runtime service container boundaries.",
    dashboardHook: "Toont ownership/cycle status.",
    evaluate() {
      const boundaries = buildRuntimeBoundaryMap([{ name: "loop", owns: ["cycle"], dependsOn: ["storage"] }, { name: "storage", owns: ["state"], dependsOn: [] }]);
      const validation = validateRuntimeBoundaryOwnership(boundaries);
      const container = buildRuntimeServiceContainer(boundaries);
      return { status: validation.ok && container.validation.ok ? "ready" : "degraded", evidence: [`services ${boundaries.length}`, `violations ${validation.violations.length}`] };
    }
  }
];

function statusTone(status) {
  if (status === "ready") return "positive";
  if (status === "guarded" || status === "degraded") return "warning";
  if (status === "error") return "negative";
  return "neutral";
}

function evaluateModule(definition, context) {
  try {
    const result = definition.evaluate(context);
    const status = result?.status || "ready";
    return {
      id: definition.id,
      roadmap: definition.roadmap,
      domain: definition.domain,
      title: definition.title,
      status,
      tone: statusTone(status),
      explanation: definition.explanation,
      systemHook: definition.systemHook,
      dashboardHook: definition.dashboardHook,
      evidence: Array.isArray(result?.evidence) ? result.evidence : [],
      updatedAt: context.now
    };
  } catch (error) {
    return {
      id: definition.id,
      roadmap: definition.roadmap,
      domain: definition.domain,
      title: definition.title,
      status: "error",
      tone: "negative",
      explanation: definition.explanation,
      systemHook: definition.systemHook,
      dashboardHook: definition.dashboardHook,
      evidence: [`error ${error.message}`],
      updatedAt: context.now
    };
  }
}

function summarizeModules(modules) {
  const counts = modules.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const attention = modules.filter((item) => ["guarded", "degraded", "error"].includes(item.status));
  return {
    total: modules.length,
    ready: counts.ready || 0,
    guarded: counts.guarded || 0,
    degraded: counts.degraded || 0,
    error: counts.error || 0,
    status: counts.error ? "error" : counts.degraded ? "degraded" : counts.guarded ? "guarded" : "ready",
    attentionIds: attention.map((item) => item.id)
  };
}

function groupModules(modules) {
  return Object.values(modules.reduce((acc, item) => {
    acc[item.domain] ||= { domain: item.domain, modules: [], ready: 0, attention: 0 };
    acc[item.domain].modules.push(item.id);
    if (item.status === "ready") acc[item.domain].ready += 1;
    else acc[item.domain].attention += 1;
    return acc;
  }, {})).sort((a, b) => a.domain.localeCompare(b.domain));
}

export function listRoadmapModuleDefinitions() {
  return MODULE_DEFINITIONS.map(({ evaluate, ...definition }) => ({ ...definition }));
}

export function buildRoadmapModuleSystemSnapshot({ dashboard = {}, config = {}, manager = {}, now = new Date().toISOString() } = {}) {
  const context = { dashboard, config, manager, now };
  const modules = [];
  for (const definition of MODULE_DEFINITIONS) {
    modules.push(evaluateModule(definition, context));
  }
  const summary = summarizeModules(modules);
  return {
    generatedAt: now,
    status: summary.status,
    summary,
    groups: groupModules(modules),
    modules
  };
}
