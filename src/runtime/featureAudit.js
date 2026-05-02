import fs from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "data", "dist", "coverage", ".next"]);
const ENV_KEY_OVERRIDES = {
  enableOnChainLiteContext: "ENABLE_ONCHAIN_LITE_CONTEXT"
};

const TARGET_FEATURES = [
  {
    id: "indicator_feature_registry",
    flags: ["enableIndicatorFeatureRegistry", "enableIndicatorRegistryPaperScoring"],
    modules: ["src/strategy/indicatorFeatureRegistry.js"],
    expectedRuntimeRefs: ["buildIndicatorFeaturePack", "applyIndicatorRegistryPaperScoring"],
    docs: ["docs/INDICATOR_REGISTRY.md"],
    tests: ["test/indicatorFeatureRegistry.tests.js"],
    dashboardExpected: true,
    priority: "P3",
    completionPlan: "Add read-only candidate/dashboard visibility for indicator pack usage, top feature drivers, and missing/stale feature quality before treating this feature as complete.",
    filesToChange: ["src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js"],
    testsToAdd: ["test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["candidate.indicatorRegistry", "candidate.topPositiveFeatures", "candidate.topNegativeFeatures", "candidate.missingIndicatorFeatures"],
    liveBehaviorPolicy: "No live behavior change; existing paper-scoring flag remains the only scoring gate.",
    note: "Indicator pack is computed in indicators and paper-scoring is gated in strategyRouter."
  },
  {
    id: "dynamic_exit_levels",
    flags: ["enableDynamicExitLevels", "dynamicExitPaperOnly"],
    modules: ["src/risk/dynamicExitLevels.js"],
    expectedRuntimeRefs: ["buildDynamicExitLevels", "dynamicExitLevelsAtEntry"],
    tests: ["test/dynamicExitLevels.tests.js"],
    dashboardExpected: true,
    liveRisk: true,
    priority: "P3",
    completionPlan: "Expose existing dynamic stop/target suggestions on open positions and reports before any live-risk review.",
    filesToChange: ["src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js", "src/runtime/reportBuilder.js"],
    testsToAdd: ["test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["position.dynamicExitLevels", "position.suggestedStopPct", "position.suggestedTakeProfitPct"],
    liveBehaviorPolicy: "No live behavior change in the completion batch; live remains conservative while dynamicExitPaperOnly is true.",
    note: "Live remains conservative unless dynamicExitPaperOnly is false."
  },
  {
    id: "exit_intelligence_v2",
    flags: ["enableExitIntelligence"],
    modules: ["src/risk/exitIntelligenceV2.js"],
    expectedRuntimeRefs: ["buildExitIntelligenceV2", "exitIntelligenceV2"],
    tests: ["test/exitIntelligenceV2.tests.js"],
    dashboardExpected: true,
    liveRisk: true,
    priority: "P3",
    completionPlan: "Expose existing v2 exit recommendation and component scores in operator surfaces before changing execution posture.",
    filesToChange: ["src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js", "src/runtime/reportBuilder.js"],
    testsToAdd: ["test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["position.exitIntelligenceV2", "position.exitQuality", "position.currentExitRecommendation"],
    liveBehaviorPolicy: "No live behavior change in the completion batch; future live use may only tighten exits after review.",
    note: "Shared exit flag gates legacy exit intelligence plus v2 risk output."
  },
  {
    id: "trade_quality_analytics",
    flags: [],
    modules: ["src/runtime/tradeQualityAnalytics.js"],
    expectedRuntimeRefs: ["buildTradeQualityAnalytics", "updateOpenPositionExcursion"],
    tests: ["test/tradeQualityAnalytics.tests.js"],
    dashboardExpected: true,
    priority: "P3",
    completionPlan: "Surface existing MFE/MAE/exit-efficiency analytics in dashboard/report summaries.",
    filesToChange: ["src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js", "src/runtime/reportBuilder.js"],
    testsToAdd: ["test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["trade.maximumFavorableExcursionPct", "trade.maximumAdverseExcursionPct", "trade.exitEfficiencyPct", "report.tradeQualitySummary"],
    liveBehaviorPolicy: "No live behavior change; analytics are observational and journal/report-only.",
    note: "No feature flag; this is persistent analytics around closed/open trade quality."
  },
  {
    id: "breakout_retest",
    flags: ["enableBreakoutRetestStrategy", "breakoutRetestPaperOnly"],
    modules: ["src/strategy/strategyRouter.js"],
    expectedRuntimeRefs: ["evaluateBreakoutRetest", "enableBreakoutRetestStrategy"],
    tests: ["test/breakoutRetestStrategy.tests.js"],
    dashboardExpected: false,
    liveRisk: true,
    allowModuleInternalRuntime: true,
    priority: "P4",
    completionPlan: "Keep paper-only default and add live-risk-review documentation before any live enablement discussion.",
    filesToChange: ["docs/FEATURE_COMPLETION_PLAN.md"],
    testsToAdd: [],
    missingDashboardFields: [],
    liveBehaviorPolicy: "No live auto-promotion; paper-only remains the safe default.",
    note: "Strategy is explicitly paper-only by default."
  },
  {
    id: "net_edge_gate",
    flags: ["enableNetEdgeGate", "netEdgeGateLiveBlockOnly"],
    modules: ["src/runtime/netEdgeGate.js"],
    expectedRuntimeRefs: ["buildNetEdgeGate"],
    tests: ["test/decisionSupportFoundation.tests.js"],
    dashboardExpected: true,
    liveRisk: true,
    expectedUnusedUntilIntegrated: true,
    priority: "P1",
    completionPlan: "Wire module into candidate diagnostics first; only after review may it become a stricter live block, never live relief.",
    filesToChange: ["src/runtime/candidateRanking.js", "src/risk/riskManager.js", "src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js"],
    testsToAdd: ["test/netEdgeGateIntegration.tests.js", "test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["candidate.netEdgeGate", "decision.netEdgeGate", "candidate.netExecutableExpectancyScore"],
    liveBehaviorPolicy: "Future live behavior may only block or add caution when enabled; no threshold lowering or softening.",
    note: "Module/config/tests exist, but runtime callsite is not wired yet."
  },
  {
    id: "failed_breakout_detector",
    flags: ["enableFailedBreakoutDetector"],
    modules: ["src/strategy/failedBreakoutDetector.js"],
    expectedRuntimeRefs: ["detectFailedBreakout"],
    tests: ["test/decisionSupportFoundation.tests.js"],
    dashboardExpected: true,
    expectedUnusedUntilIntegrated: true,
    priority: "P1",
    completionPlan: "Use the central detector in diagnostics to replace scattered inline interpretation before any gating change.",
    filesToChange: ["src/strategy/strategyRouter.js", "src/risk/riskManager.js", "src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js"],
    testsToAdd: ["test/failedBreakoutDetectorIntegration.tests.js", "test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["candidate.failedBreakoutDetector", "candidate.falseBreakoutRisk"],
    liveBehaviorPolicy: "Future live behavior may only add caution/blocking for negative evidence; no positive live relief.",
    note: "Central detector exists, while risk/strategy still use older inline failed-breakout logic."
  },
  {
    id: "funding_oi_matrix",
    flags: ["enableFundingOiMatrix"],
    modules: ["src/market/derivativesMatrix.js"],
    expectedRuntimeRefs: ["buildFundingOiMatrix"],
    tests: ["test/decisionSupportFoundation.tests.js"],
    dashboardExpected: true,
    expectedUnusedUntilIntegrated: true,
    priority: "P1",
    completionPlan: "Wire derivatives matrix into market-context diagnostics with degraded-provider fallback before risk consumption.",
    filesToChange: ["src/market/providers/derivativesContextProvider.js", "src/strategy/features.js", "src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js"],
    testsToAdd: ["test/fundingOiMatrixIntegration.tests.js", "test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["marketContext.fundingOiMatrix", "marketContext.fundingOiMatrixStatus"],
    liveBehaviorPolicy: "Diagnostics first; future live use may only add negative risk drag when data quality is sufficient.",
    note: "Pure derivatives matrix exists but is not yet fed into market features/risk."
  },
  {
    id: "spot_futures_divergence",
    flags: ["enableSpotFuturesDivergence"],
    modules: ["src/market/leadershipContext.js"],
    expectedRuntimeRefs: ["spotFuturesDivergenceBps", "enableSpotFuturesDivergence"],
    tests: ["test/decisionSupportFoundation.tests.js"],
    dashboardExpected: true,
    expectedUnusedUntilIntegrated: true,
    priority: "P1",
    completionPlan: "Expose spot/futures divergence from leadership context into market diagnostics with safe missing-reference fallback.",
    filesToChange: ["src/market/leadershipContext.js", "src/runtime/tradingBot.js", "src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js"],
    testsToAdd: ["test/leadershipContextIntegration.tests.js", "test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["marketContext.spotFuturesDivergence", "marketContext.spotFuturesDivergenceStatus"],
    liveBehaviorPolicy: "Diagnostics first; future live use may only add caution for adverse divergence.",
    note: "Leadership module can compute divergence, but the flag is not wired into runtime context."
  },
  {
    id: "leadership_context",
    flags: ["enableLeadershipContext"],
    modules: ["src/market/leadershipContext.js"],
    expectedRuntimeRefs: ["buildLeadershipContext"],
    tests: ["test/decisionSupportFoundation.tests.js"],
    dashboardExpected: true,
    expectedUnusedUntilIntegrated: true,
    priority: "P1",
    completionPlan: "Feed BTC/ETH leadership context into candidate and market diagnostics before ranking or risk use.",
    filesToChange: ["src/market/leadershipContext.js", "src/runtime/tradingBot.js", "src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js"],
    testsToAdd: ["test/leadershipContextIntegration.tests.js", "test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["candidate.leadershipContext", "marketContext.btcEthLeadership"],
    liveBehaviorPolicy: "Diagnostics first; positive signals cannot lower live thresholds without a separate review.",
    note: "Pure module exists but is not yet consumed by scanner/risk outside tests."
  },
  {
    id: "sector_rotation",
    flags: ["enableSectorRotation"],
    modules: ["src/market/leadershipContext.js"],
    expectedRuntimeRefs: ["sectorRotationScore", "enableSectorRotation"],
    tests: ["test/decisionSupportFoundation.tests.js"],
    dashboardExpected: true,
    expectedUnusedUntilIntegrated: true,
    priority: "P3",
    completionPlan: "Expose existing sector score and flag state in market dashboard/report surfaces.",
    filesToChange: ["src/runtime/dashboardSnapshotBuilder.js", "src/dashboard/public/app.js", "src/runtime/reportBuilder.js"],
    testsToAdd: ["test/dashboardSnapshot.tests.js"],
    missingDashboardFields: ["marketContext.sectorRotation", "marketContext.sectorRotationScore"],
    liveBehaviorPolicy: "No live behavior change; keep as market diagnostics until evidence supports allocator use.",
    note: "Sector score exists inside leadership context; the dedicated flag is not wired."
  },
  {
    id: "walk_forward_backtest",
    flags: [],
    modules: ["src/runtime/walkForwardBacktest.js"],
    expectedRuntimeRefs: ["runBacktestWalkForward", "backtest:walkforward"],
    docs: ["docs/BACKTESTING.md"],
    tests: ["test/walkForwardBacktest.tests.js"],
    dashboardExpected: false,
    priority: "complete",
    completionPlan: "No feature-completion work needed beyond regression protection.",
    filesToChange: [],
    testsToAdd: [],
    missingDashboardFields: [],
    liveBehaviorPolicy: "Offline only; no live behavior.",
    note: "Offline CLI/reporting path only; no live behavior."
  }
];

function camelToEnvKey(key = "") {
  if (ENV_KEY_OVERRIDES[key]) {
    return ENV_KEY_OVERRIDES[key];
  }
  return `${key || ""}`
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

function isFeatureFlagKey(key = "") {
  return /^enable[A-Z]/.test(key) ||
    /Enabled$/.test(key) ||
    /PaperOnly$/.test(key) ||
    /^block[A-Z]/.test(key) ||
    /^allow[A-Z]/.test(key);
}

async function pathExists(projectRoot, relativePath) {
  try {
    await fs.access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root, current = root, files = []) {
  let entries = [];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(root, fullPath, files);
    } else if (
      entry.isFile() &&
      !/^tmp[_-]/i.test(entry.name) &&
      /\.(js|mjs|json|md|example|cmd)$/i.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

async function buildSourceIndex(projectRoot) {
  const files = await walkFiles(projectRoot);
  const entries = [];
  for (const file of files) {
    let content = "";
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    entries.push({
      file,
      relativePath: path.relative(projectRoot, file).replace(/\\/g, "/"),
      content
    });
  }
  return entries;
}

function findRefs(entries = [], token = "") {
  if (!token) {
    return [];
  }
  return entries
    .filter((entry) => entry.content.includes(token))
    .map((entry) => entry.relativePath)
    .sort((left, right) => left.localeCompare(right));
}

function filterRuntimeRefs(paths = []) {
  return paths.filter((file) => (
    file.startsWith("src/") &&
    !file.startsWith("src/config/") &&
    !file.includes("/featureAudit.js")
  ));
}

function filterTestRefs(paths = []) {
  return paths.filter((file) => file.startsWith("test/"));
}

function filterDashboardRefs(paths = []) {
  return paths.filter((file) => file.includes("dashboard"));
}

async function readEnvExampleKeys(projectRoot) {
  try {
    const content = await fs.readFile(path.join(projectRoot, ".env.example"), "utf8");
    return new Set(
      content
        .split(/\r?\n/)
      .map((line) => line.trim().replace(/^#\s*/, ""))
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => line.split("=")[0]?.trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function classifyFeature({ modulesPresent, runtimeRefs, testsPresent, dashboardRefs, definition }) {
  const classifications = [];
  if (!modulesPresent) {
    classifications.push("config_only");
  } else if (!runtimeRefs.length && definition.flags?.length) {
    classifications.push("module_exists_but_unused");
  } else if (!runtimeRefs.length) {
    classifications.push("partial");
  }
  if (!testsPresent) {
    classifications.push("missing_tests");
  }
  if (definition.dashboardExpected && !dashboardRefs.length) {
    classifications.push("missing_dashboard");
  }
  if (definition.liveRisk) {
    classifications.push("live_risk_review_needed");
  }
  if (!classifications.length) {
    classifications.push("complete");
  }
  return classifications;
}

function classifyFlag({ key, refs, envPresent, mappedFeature = null }) {
  const runtimeRefs = filterRuntimeRefs(refs);
  const testRefs = filterTestRefs(refs);
  const classifications = [];
  if (!envPresent) {
    classifications.push("config_only");
  }
  if (!runtimeRefs.length) {
    classifications.push("config_only");
  }
  if (!testRefs.length) {
    classifications.push("missing_tests");
  }
  if (mappedFeature?.liveRisk) {
    classifications.push("live_risk_review_needed");
  }
  if (!classifications.length) {
    classifications.push("complete");
  }
  return {
    key,
    envKey: camelToEnvKey(key),
    envPresent,
    valueType: "boolean",
    currentValue: null,
    classifications: [...new Set(classifications)],
    referencedIn: refs
  };
}

function derivePriority(classifications = [], definition = {}) {
  if (definition.priority) {
    return definition.priority;
  }
  if (classifications.includes("complete")) {
    return "complete";
  }
  if (classifications.includes("config_only") || classifications.includes("module_exists_but_unused")) {
    return "P1";
  }
  if (classifications.includes("missing_dashboard") || classifications.includes("missing_tests")) {
    return "P3";
  }
  if (classifications.includes("live_risk_review_needed")) {
    return "P4";
  }
  return "P4";
}

function buildPriorityReasons(classifications = []) {
  const reasons = [];
  if (classifications.includes("config_only")) {
    reasons.push("config_exists_but_behavior_or_env_is_incomplete");
  }
  if (classifications.includes("module_exists_but_unused")) {
    reasons.push("module_exists_but_runtime_callsite_is_missing");
  }
  if (classifications.includes("missing_dashboard")) {
    reasons.push("operator_visibility_missing");
  }
  if (classifications.includes("missing_tests")) {
    reasons.push("test_coverage_missing");
  }
  if (classifications.includes("live_risk_review_needed")) {
    reasons.push("live_risk_review_required_before_live_behavior_change");
  }
  if (classifications.includes("complete")) {
    reasons.push("complete_by_audit_contract");
  }
  return reasons;
}

function buildConfigStatus(flags = []) {
  const missingConfigKeys = flags.filter((flag) => !flag.configured).map((flag) => flag.key);
  const missingEnvKeys = flags.filter((flag) => !flag.envPresent).map((flag) => flag.envKey);
  return {
    flagCount: flags.length,
    configured: missingConfigKeys.length === 0,
    envDocumented: missingEnvKeys.length === 0,
    missingConfigKeys,
    missingEnvKeys,
    status: missingConfigKeys.length || missingEnvKeys.length ? "incomplete" : "complete"
  };
}

export async function buildFeatureAudit({ config = {}, projectRoot = process.cwd() } = {}) {
  const entries = await buildSourceIndex(projectRoot);
  const envKeys = await readEnvExampleKeys(projectRoot);
  const featureFlags = Object.keys(config)
    .filter(isFeatureFlagKey)
    .filter((key) => typeof config[key] === "boolean" || config[key] === null)
    .sort((left, right) => left.localeCompare(right));
  const featureByFlag = new Map();
  for (const definition of TARGET_FEATURES) {
    for (const flag of definition.flags || []) {
      featureByFlag.set(flag, definition);
    }
  }

  const flags = featureFlags.map((key) => {
    const refs = findRefs(entries, key);
    const result = classifyFlag({
      key,
      refs,
      envPresent: envKeys.has(camelToEnvKey(key)),
      mappedFeature: featureByFlag.get(key) || null
    });
    result.currentValue = config[key];
    return result;
  });

  const features = [];
  for (const definition of TARGET_FEATURES) {
    const modules = [];
    for (const modulePath of definition.modules || []) {
      modules.push({ path: modulePath, exists: await pathExists(projectRoot, modulePath) });
    }
    const expectedRefs = definition.expectedRuntimeRefs || [];
    const allRefs = [...new Set(expectedRefs.flatMap((token) => findRefs(entries, token)))].sort((left, right) => left.localeCompare(right));
    const rawRuntimeRefs = filterRuntimeRefs(allRefs);
    const runtimeRefs = rawRuntimeRefs.filter((file) => (
      definition.allowModuleInternalRuntime || !(definition.modules || []).includes(file)
    ));
    const testRefs = [
      ...new Set([
        ...filterTestRefs(allRefs),
        ...(definition.tests || []).filter((testPath) => entries.some((entry) => entry.relativePath === testPath))
      ])
    ].sort((left, right) => left.localeCompare(right));
    const dashboardRefs = filterDashboardRefs(allRefs);
    const docs = [];
    for (const docPath of definition.docs || []) {
      docs.push({ path: docPath, exists: await pathExists(projectRoot, docPath) });
    }
    const classifications = classifyFeature({
      modulesPresent: modules.every((item) => item.exists),
      runtimeRefs,
      testsPresent: testRefs.length > 0,
      dashboardRefs,
      definition
    });
    const featureFlags = (definition.flags || []).map((key) => ({
      key,
      envKey: camelToEnvKey(key),
      configured: Object.prototype.hasOwnProperty.call(config, key),
      currentValue: config[key],
      envPresent: envKeys.has(camelToEnvKey(key))
    }));
    features.push({
      id: definition.id,
      flags: featureFlags,
      classifications,
      status: classifications[0],
      priority: derivePriority(classifications, definition),
      priorityReasons: buildPriorityReasons(classifications),
      completionPlan: definition.completionPlan || "Review integration status before adding behavior.",
      filesToChange: definition.filesToChange || [],
      testsToAdd: definition.testsToAdd || [],
      missingDashboardFields: definition.missingDashboardFields || [],
      liveBehaviorPolicy: definition.liveBehaviorPolicy || (definition.liveRisk
        ? "Live behavior requires a separate risk review before changes."
        : "No live behavior change required by this audit item."),
      configStatus: buildConfigStatus(featureFlags),
      modules,
      runtimeRefs,
      testRefs,
      dashboardRefs,
      docs,
      note: definition.note || null
    });
  }

  const counts = {};
  for (const item of [...features, ...flags]) {
    for (const classification of item.classifications || []) {
      counts[classification] = (counts[classification] || 0) + 1;
    }
  }
  const incompleteFeatures = features.filter((feature) => !feature.classifications.includes("complete"));
  return {
    status: incompleteFeatures.length ? "review_required" : "complete",
    generatedAt: new Date().toISOString(),
    featureFlagCount: flags.length,
    auditedFeatureCount: features.length,
    classificationCounts: counts,
    flags,
    features,
    findings: incompleteFeatures.map((feature) => ({
      id: feature.id,
      classifications: feature.classifications,
      note: feature.note,
      nextSafeAction: feature.classifications.includes("module_exists_but_unused")
        ? "wire_module_into_diagnostics_or_remove_flag_in_future_patch"
        : feature.classifications.includes("missing_dashboard")
          ? "add_operator_surface_before_treating_feature_as_complete"
          : "review_integration_status"
    }))
  };
}
