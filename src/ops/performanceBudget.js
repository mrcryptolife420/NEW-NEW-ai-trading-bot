export const PERFORMANCE_BUDGETS_MS = { featureCalculation: 120, riskCheck: 80, neuralInference: 250, policyEngine: 25, brokerRouting: 25, dashboardSnapshot: 500, replayBatch: 2000, scenarioLab: 2000, dataRecorderWrite: 100, auditWrite: 100 };

export function summarizePerformanceBudget(samples = [], budgets = PERFORMANCE_BUDGETS_MS) {
  const byModule = new Map();
  for (const sample of samples) {
    const key = sample.module || "unknown";
    byModule.set(key, [...(byModule.get(key) || []), Number(sample.durationMs || 0)].filter(Number.isFinite));
  }
  const modules = [...byModule.entries()].map(([module, values]) => {
    const sorted = values.sort((a, b) => a - b);
    const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] || 0;
    const p95 = pick(0.95);
    return { module, count: values.length, p50: pick(0.5), p95, p99: pick(0.99), budgetMs: budgets[module] || null, status: budgets[module] && p95 > budgets[module] ? "breach" : "ok" };
  });
  return { status: modules.some((m) => m.status === "breach") ? "warning" : "ok", modules };
}
