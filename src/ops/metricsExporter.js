import { redactSecrets } from "../utils/redactSecrets.js";

function metricName(name) { return `trading_bot_${name}`.replace(/[^a-zA-Z0-9_:]/g, "_").toLowerCase(); }

export function buildPrometheusMetrics(snapshot = {}) {
  const safe = redactSecrets(snapshot);
  const rows = [];
  const add = (name, value, labels = {}) => {
    if (!Number.isFinite(Number(value))) return;
    const labelText = Object.entries(labels).map(([k, v]) => `${k}="${`${v}`.replaceAll("\"", "'")}"`).join(",");
    rows.push(`${metricName(name)}${labelText ? `{${labelText}}` : ""} ${Number(value)}`);
  };
  add("running", safe.running ? 1 : 0, { mode: safe.mode || "unknown", exchange: safe.exchangeProvider || "unknown" });
  add("open_positions_count", safe.openPositionsCount ?? safe.positions?.length ?? 0);
  add("paper_pnl", safe.paperPnl ?? 0);
  add("live_pnl", safe.livePnl ?? 0);
  add("unrealized_exposure", safe.unrealizedExposure ?? 0);
  add("rest_request_count", safe.restRequestCount ?? 0);
  add("rest_error_count", safe.restErrorCount ?? 0);
  add("rate_limit_pressure", safe.rateLimitPressure ?? 0);
  add("risk_blocker_count", safe.riskBlockerCount ?? 0);
  add("neural_influence_count", safe.neuralInfluenceCount ?? 0);
  add("audit_write_failures", safe.auditWriteFailures ?? 0);
  add("event_loop_lag_ms", safe.eventLoopLagMs ?? 0);
  add("memory_usage_bytes", safe.memoryUsageBytes ?? process.memoryUsage().rss);
  return `${rows.join("\n")}\n`;
}

export function buildMetricsStatus(config = {}) {
  return { enabled: Boolean(config.metricsEnabled), bindLocalOnly: config.metricsBindLocalOnly !== false };
}
