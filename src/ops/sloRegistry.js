function buildSloRegistry(definitions = []) {
  return definitions.map((definition) => ({
    name: String(definition.name),
    target: Math.max(0, Math.min(1, Number(definition.target || 0.99))),
    liveOnly: Boolean(definition.liveOnly),
    alertRoute: String(definition.alertRoute || "operator"),
    metric: String(definition.metric || definition.name)
  }));
}

function evaluateSloStatus({ registry = [], snapshot = {}, mode = "paper" } = {}) {
  return registry.map((slo) => {
    const current = Number(snapshot[slo.metric] ?? 1);
    const skipped = slo.liveOnly && mode !== "live";
    const burnRate = skipped ? 0 : Math.max(0, (slo.target - current) / Math.max(0.0001, 1 - slo.target));
    return {
      name: slo.name,
      status: skipped ? "skipped" : current >= slo.target ? "ok" : burnRate >= 1 ? "critical" : "warning",
      burnRate,
      alertRoute: slo.alertRoute
    };
  });
}

function buildSloMetrics(statuses = []) {
  return statuses.map((status) => ({
    name: "slo_status",
    labels: { slo: status.name, status: status.status },
    value: status.burnRate
  }));
}

function routeSloAlerts(statuses = []) {
  return statuses
    .filter((status) => status.status === "critical")
    .map((status) => ({ route: status.alertRoute, slo: status.name, severity: "critical" }));
}

export { buildSloRegistry, evaluateSloStatus, buildSloMetrics, routeSloAlerts };
