import path from "node:path";

const STATUS_VALUES = new Set(["stopped", "running", "paper", "live", "blocked"]);

function text(value, fallback = "") {
  const normalized = value == null ? "" : `${value}`.trim();
  return normalized || fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function resolveTrayStatus({ snapshot = {}, readiness = {} } = {}) {
  const mode = text(snapshot?.dashboard?.overview?.mode || snapshot?.manager?.currentMode, "paper").toLowerCase();
  const runState = text(snapshot?.manager?.runState || snapshot?.dashboard?.ops?.service?.runState, "stopped").toLowerCase();
  const readinessStatus = text(readiness.status || snapshot?.dashboard?.ops?.readiness?.status, "unknown").toLowerCase();
  const entryBlocked = snapshot?.dashboard?.safetySnapshot?.entryPermission?.allowed === false ||
    snapshot?.dashboard?.ops?.exchangeSafety?.entryBlocked === true;

  if (mode === "live") return "live";
  if (readinessStatus && !["ready", "unknown"].includes(readinessStatus)) return "blocked";
  if (entryBlocked) return "blocked";
  if (runState === "running") return mode === "paper" ? "paper" : "running";
  if (["idle", "stopped", "not_running"].includes(runState)) return "stopped";
  return STATUS_VALUES.has(runState) ? runState : "stopped";
}

export function buildWindowsGuiStatus({ snapshot = {}, readiness = {}, config = {}, projectRoot = process.cwd(), now = new Date().toISOString() } = {}) {
  const dashboardUrl = `http://127.0.0.1:${Number(config.dashboardPort || snapshot?.manager?.dashboardPort || 3011)}`;
  const mode = text(snapshot?.dashboard?.overview?.mode || snapshot?.manager?.currentMode || config.botMode, "paper").toLowerCase();
  const exchangeProtectionEnabled = bool(config.enableExchangeProtection, snapshot?.dashboard?.exchange?.protectionEnabled === true);
  const dataFreshness = snapshot?.dashboard?.ops?.dataFreshness || snapshot?.dashboard?.dataFreshnessSummary || {};
  const alerts = snapshot?.dashboard?.ops?.alerts?.alerts || snapshot?.dashboard?.alerts?.items || [];
  const criticalAlerts = Array.isArray(alerts)
    ? alerts.filter((alert) => ["critical", "high"].includes(text(alert.severity, "").toLowerCase()) && !alert.resolvedAt).length
    : 0;

  return {
    status: "ready",
    generatedAt: now,
    connected: true,
    dashboardUrl,
    trayStatus: resolveTrayStatus({ snapshot, readiness }),
    mode,
    liveWarning: mode === "live" ? "Live mode requires explicit confirmations; desktop actions must not bypass dashboard safety gates." : null,
    serviceStatus: text(snapshot?.manager?.runState || snapshot?.dashboard?.ops?.service?.status, "unknown"),
    readiness: {
      ok: readiness.ok !== false,
      status: text(readiness.status || snapshot?.dashboard?.ops?.readiness?.status, "unknown"),
      reasons: Array.isArray(readiness.reasons) ? readiness.reasons : []
    },
    paths: {
      env: path.join(projectRoot, ".env"),
      runtimeData: text(config.runtimeDir, path.join(projectRoot, "data", "runtime"))
    },
    safety: {
      exchangeProtectionEnabled,
      liveActionsRequireConfirmation: true,
      forceTradeAllowed: false,
      exchangeFreezeOverrideAllowed: false,
      reconcileOverrideAllowed: false
    },
    freshness: {
      status: text(dataFreshness.status, "unknown"),
      stale: dataFreshness.status === "stale" || dataFreshness.stale === true,
      sources: dataFreshness.sources || dataFreshness.staleSources || []
    },
    alerts: {
      criticalCount: criticalAlerts
    },
    actions: {
      canStartBot: true,
      canStopBot: true,
      openDashboardAvailable: true
    }
  };
}
