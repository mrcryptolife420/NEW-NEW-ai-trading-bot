export const RELIABILITY_TARGETS = {
  paper: { marketDataFreshnessMs: 120000, restSuccessRate: 0.95, dashboardApiLatencyMs: 1000, stateWriteSuccessRate: 0.98, auditWriteSuccessRate: 0.98 },
  live: { marketDataFreshnessMs: 30000, userStreamFreshnessMs: 30000, restSuccessRate: 0.99, orderAckLatencyMs: 1500, reconcileFreshnessMs: 300000, stateWriteSuccessRate: 0.995, auditWriteSuccessRate: 0.995 },
  fast: { marketDataFreshnessMs: 5000, streamFreshnessMs: 5000, orderAckLatencyMs: 750, fastExecutionLatencyMs: 250 }
};

export function checkReliabilityTargets({ mode = "paper", metrics = {}, targets = RELIABILITY_TARGETS[mode] || RELIABILITY_TARGETS.paper } = {}) {
  const breaches = [];
  for (const [key, target] of Object.entries(targets)) {
    const value = Number(metrics[key]);
    if (!Number.isFinite(value)) continue;
    const rate = key.toLowerCase().includes("rate");
    const breached = rate ? value < target : value > target;
    if (breached) breaches.push({ key, value, target, severity: mode === "live" || key.includes("Freshness") ? "critical" : "warning" });
  }
  return { status: breaches.some((b) => b.severity === "critical") ? "critical" : breaches.length ? "warning" : "ok", mode, breaches };
}
