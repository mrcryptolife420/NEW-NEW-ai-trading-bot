function num(value, decimals = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(decimals));
}

export function createSnapshotPerformanceTracker({
  totalBudgetMs = 800,
  slowSectionMs = 180,
  sectionBudgets = {}
} = {}) {
  const startedAt = Date.now();
  const sections = [];
  return {
    async time(sectionId, work) {
      const sectionStartedAt = Date.now();
      try {
        return await work();
      } finally {
        const durationMs = Date.now() - sectionStartedAt;
        const budgetMs = Number.isFinite(sectionBudgets[sectionId]) ? sectionBudgets[sectionId] : null;
        sections.push({
          id: sectionId,
          durationMs,
          budgetMs,
          overBudget: budgetMs != null ? durationMs > budgetMs : durationMs > slowSectionMs
        });
      }
    },
    buildSummary() {
      const totalDurationMs = Date.now() - startedAt;
      const slowSections = sections.filter((item) => item.overBudget).map((item) => item.id);
      return {
        totalDurationMs,
        totalBudgetMs,
        slowSectionMs,
        overBudget: totalDurationMs > totalBudgetMs,
        sectionCount: sections.length,
        sections: sections.map((item) => ({
          id: item.id,
          durationMs: num(item.durationMs, 1),
          budgetMs: item.budgetMs,
          overBudget: item.overBudget
        })),
        slowSections,
        note: slowSections.length
          ? `Langzame snapshot-secties: ${slowSections.join(", ")}`
          : "Snapshot binnen budget opgebouwd."
      };
    }
  };
}

export async function refreshDashboardPrerequisites(bot, {
  referenceNow,
  context = "dashboard_snapshot",
  tracker = null
} = {}) {
  const time = async (sectionId, work) => (tracker ? tracker.time(sectionId, work) : work());
  const requestWeight = bot?.client?.getRateLimitState ? bot.client.getRateLimitState() : null;
  const banActive = Boolean(requestWeight?.banActive);
  await time("exchange_truth_audit", async () => {
    if (!banActive) {
      await bot.maybeRunExchangeTruthLoop({ auditOnly: true });
    }
  });
  await time("market_history", async () => {
    await bot.safeRefreshMarketHistorySnapshot({ referenceNow, context });
  });
  await time("scanner_snapshot", async () => {
    if (!banActive) {
      await bot.safeRefreshScannerSnapshot({ referenceNow, context, persist: false });
    }
  });
  if (!banActive && bot.shouldRefreshPortfolioSnapshot(referenceNow)) {
    await time("portfolio_snapshot", async () => {
      await bot.updatePortfolioSnapshot();
    });
  }
}

export function buildDashboardSnapshotContract(buildContract, schemaVersion = 3) {
  return {
    ...buildContract("snapshot", "dashboard_snapshot"),
    schemaVersion,
    dto: "dashboard_snapshot"
  };
}

export function buildDashboardSnapshotMeta({
  referenceNow,
  overview = {},
  serviceSummary = {},
  runtime = {},
  performance = null,
  manualReviewQueue = null,
  schemaVersion = 3
} = {}) {
  return {
    generatedAt: referenceNow,
    lastAnalysisAt: overview.lastAnalysisAt || null,
    lastCycleAt: overview.lastCycleAt || null,
    lastPortfolioUpdateAt: overview.lastPortfolioUpdateAt || null,
    analysisAgeMinutes: overview.lastAnalysisAt ? num((new Date(referenceNow).getTime() - new Date(overview.lastAnalysisAt).getTime()) / 60_000, 1) : null,
    cycleAgeMinutes: overview.lastCycleAt ? num((new Date(referenceNow).getTime() - new Date(overview.lastCycleAt).getTime()) / 60_000, 1) : null,
    portfolioAgeMinutes: overview.lastPortfolioUpdateAt ? num((new Date(referenceNow).getTime() - new Date(overview.lastPortfolioUpdateAt).getTime()) / 60_000, 1) : null,
    dashboardFeedStatus: serviceSummary.dashboardFeeds?.status || "unknown",
    dashboardFeedDegradedCount: serviceSummary.dashboardFeeds?.degradedCount || 0,
    dashboardFeedFailures: Number(runtime.signalFlow?.dashboardFeedFailures || 0),
    dto: {
      name: "dashboard_snapshot",
      schemaVersion
    },
    performance: performance || null,
    manualReviewQueue: manualReviewQueue
      ? {
          pendingCount: manualReviewQueue.pendingCount || 0,
          overdueCount: manualReviewQueue.overdueCount || 0,
          oldestAgeMinutes: manualReviewQueue.oldestAgeMinutes ?? null,
          status: manualReviewQueue.status || "clear"
        }
      : null
  };
}
