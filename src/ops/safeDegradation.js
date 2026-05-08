export const DEGRADATION_RULES = {
  news: { disables: ["news_based_entries"], severity: "warning", recovery: "news_provider_success" },
  neural: { disables: ["neural_influence"], severity: "warning", recovery: "neural_inference_success" },
  stream: { disables: ["fast_execution"], severity: "critical", recovery: "stream_fresh" },
  local_book: { disables: ["entries_or_reduce_size"], severity: "critical", recovery: "local_book_fresh" },
  user_stream: { disables: ["live_entries"], severity: "critical", recovery: "user_stream_fresh" },
  audit_write: { disables: ["live_entries"], severity: "critical", recovery: "audit_write_success" },
  state_write: { disables: ["live_entries"], severity: "critical", recovery: "state_write_success" },
  reconcile: { disables: ["new_live_entries"], severity: "critical", recovery: "reconcile_success" },
  metrics: { disables: [], severity: "warning", recovery: "metrics_export_success" }
};

export function buildSafeDegradationStatus(failures = {}) {
  const active = Object.entries(failures).filter(([, value]) => Boolean(value)).map(([key]) => ({ key, ...(DEGRADATION_RULES[key] || { disables: [], severity: "warning", recovery: `${key}_recovered` }) }));
  return { status: active.some((item) => item.severity === "critical") ? "critical" : active.length ? "warning" : "ok", active, liveEntriesBlocked: active.some((item) => item.disables.includes("live_entries") || item.disables.includes("new_live_entries")) };
}
