import { safeNumber } from "../utils/numberSafety.js";

function buildRuntimePerformanceSnapshot({ memory = {}, loops = [], caches = {} } = {}) {
  return {
    heapUsedMb: safeNumber(memory.heapUsedMb, safeNumber(memory.heapUsed, 0) / 1024 / 1024),
    loopP95Ms: loops.length ? [...loops].map((value) => safeNumber(value, 0)).sort((a, b) => a - b)[Math.floor((loops.length - 1) * 0.95)] : 0,
    cacheKeys: Object.keys(caches).length,
    capturedAt: new Date(0).toISOString()
  };
}

function evaluatePerformanceBudgets(snapshot = {}, budgets = {}) {
  const breaches = [];
  if (snapshot.heapUsedMb > Number(budgets.heapUsedMb || Infinity)) breaches.push("heap_budget_exceeded");
  if (snapshot.loopP95Ms > Number(budgets.loopP95Ms || Infinity)) breaches.push("loop_latency_budget_exceeded");
  if (snapshot.cacheKeys > Number(budgets.cacheKeys || Infinity)) breaches.push("cache_key_budget_exceeded");
  return { ok: breaches.length === 0, breaches };
}

function buildLongRunProfileSummary(samples = []) {
  const heap = samples.map((sample) => Number(sample.heapUsedMb || 0));
  return {
    samples: samples.length,
    maxHeapUsedMb: heap.length ? Math.max(...heap) : 0,
    leakSuspected: heap.length >= 3 && heap[heap.length - 1] > heap[0] * 1.5
  };
}

function enforceBoundedHistories(history = [], { maxItems = 100, preserve = (item) => item.critical || item.audit } = {}) {
  const preserved = history.filter(preserve);
  const remaining = history.filter((item) => !preserve(item)).slice(-Math.max(0, maxItems - preserved.length));
  return [...preserved, ...remaining];
}

export { buildRuntimePerformanceSnapshot, evaluatePerformanceBudgets, buildLongRunProfileSummary, enforceBoundedHistories };
