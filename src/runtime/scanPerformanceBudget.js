export function buildScanPerformanceBudget({
  maxSymbols = 80,
  maxRestWeight = 600,
  maxComputeMs = 20_000,
  minWatchlistCoverage = 0.8,
  requestPressure = 0,
  latencyMs = 0
} = {}) {
  const pressure = Math.max(Number(requestPressure || 0), Number(latencyMs || 0) / Math.max(1, maxComputeMs));
  return {
    maxSymbols: Math.max(1, Number(maxSymbols || 1)),
    maxRestWeight: Math.max(1, Number(maxRestWeight || 1)),
    maxComputeMs: Math.max(1, Number(maxComputeMs || 1)),
    minWatchlistCoverage: Math.min(1, Math.max(0, Number(minWatchlistCoverage || 0))),
    pressure,
    status: pressure > 0.9 ? "critical" : pressure > 0.7 ? "degraded" : "ready"
  };
}

export function planUniverseScan(symbols = [], budget = buildScanPerformanceBudget()) {
  const ranked = [...symbols].map((item) => typeof item === "string" ? { symbol: item } : item)
    .sort((a, b) => Number(b.priority || b.score || 0) - Number(a.priority || a.score || 0));
  const selected = ranked.slice(0, budget.maxSymbols);
  const skipped = ranked.slice(budget.maxSymbols).map((item) => ({
    symbol: item.symbol,
    reason: "scan_symbol_budget_exceeded"
  }));
  return {
    status: budget.status,
    selected,
    skipped,
    budget,
    selectedCount: selected.length,
    skippedCount: skipped.length
  };
}
