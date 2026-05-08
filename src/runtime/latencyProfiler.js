const STAGES = [
  ["streamToSignalMs", "stream", "signal"],
  ["signalToRiskMs", "signal", "risk"],
  ["riskToIntentMs", "risk", "intent"],
  ["intentToSubmitMs", "intent", "submit"],
  ["submitToAckMs", "submit", "ack"],
  ["ackToFillMs", "ack", "fill"],
  ["dashboardUpdateMs", "signal", "dashboard"]
];

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function timestamp(value) {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values, pct) {
  const sorted = values.map((value) => finite(value, 0)).filter((value) => value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

function stageLatency(item, fromKey, toKey) {
  const direct = item?.[`${fromKey}To${toKey[0].toUpperCase()}${toKey.slice(1)}Ms`];
  if (direct != null) return Math.max(0, finite(direct, 0));
  const from = timestamp(item?.timestamps?.[fromKey] || item?.[`${fromKey}At`]);
  const to = timestamp(item?.timestamps?.[toKey] || item?.[`${toKey}At`]);
  if (from == null || to == null || to < from) return null;
  return to - from;
}

export function buildLatencyProfilerReport({ events = [], runtimeState = {}, now = new Date().toISOString(), limit = 100 } = {}) {
  const rawEvents = Array.isArray(events) && events.length
    ? events
    : Array.isArray(runtimeState.latencyEvents)
      ? runtimeState.latencyEvents
      : Array.isArray(runtimeState.executionLatency?.events)
        ? runtimeState.executionLatency.events
        : [];
  const capped = rawEvents.slice(-Math.max(1, Math.min(1000, Math.trunc(finite(limit, 100)))));
  const stageSamples = Object.fromEntries(STAGES.map(([key]) => [key, []]));

  for (const item of capped) {
    for (const [key, from, to] of STAGES) {
      const value = stageLatency(item, from, to);
      if (value != null && Number.isFinite(value)) {
        stageSamples[key].push(value);
      }
    }
  }

  const stages = Object.fromEntries(Object.entries(stageSamples).map(([key, values]) => [
    key,
    {
      count: values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
    }
  ]));
  const biggest = Object.entries(stages)
    .filter(([, summary]) => summary.count > 0)
    .sort((a, b) => b[1].p95 - a[1].p95)[0];

  return {
    status: capped.length ? "ready" : "empty",
    generatedAt: now,
    eventCount: capped.length,
    stages,
    biggestBottleneck: biggest?.[0] || "insufficient_latency_samples",
    warnings: capped.length ? [] : ["latency_events_missing"],
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
