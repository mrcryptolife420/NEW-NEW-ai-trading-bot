import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "../utils/redactSecrets.js";
import { normalizeAlertSeverity } from "./alertSeverity.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function summarizeDecision(decision = {}) {
  return {
    symbol: decision.symbol || null,
    allow: Boolean(decision.allow || decision.approved),
    rootBlocker: decision.rootBlocker || decision.primaryRootBlocker || decision.primaryReason || null,
    reasons: arr(decision.reasons || decision.blockerReasons).slice(0, 6)
  };
}

export function buildIncidentReport({
  type = "manual_review",
  severity = "medium",
  configHash = null,
  runtimeState = {},
  alerts = [],
  positions = [],
  intents = [],
  reconcileSummary = null,
  recentDecisions = []
} = {}) {
  const activeAlerts = arr(alerts || runtimeState.alerts).map((alert) => ({
    id: alert.id || alert.type || null,
    severity: normalizeAlertSeverity(alert),
    message: alert.message || alert.title || alert.reason || null
  }));
  const unresolvedIntents = arr(intents || runtimeState.unresolvedIntents).map((intent) => ({
    id: intent.id || null,
    symbol: intent.symbol || null,
    kind: intent.kind || null,
    status: intent.status || "unknown"
  }));
  const report = {
    incidentId: `incident_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    type,
    severity: normalizeAlertSeverity({ severity }),
    summary: `${type} incident with ${activeAlerts.length} alert(s), ${arr(positions).length} position(s), ${unresolvedIntents.length} unresolved intent(s).`,
    configHash,
    openPositions: arr(positions).map((position) => ({
      symbol: position.symbol || null,
      quantity: Number.isFinite(Number(position.quantity)) ? Number(position.quantity) : null,
      status: position.status || position.lifecycleStatus || null
    })),
    unresolvedIntents,
    activeAlerts,
    reconcile: reconcileSummary || runtimeState.exchangeSafety?.autoReconcileSummary || null,
    recentDecisionSummary: arr(recentDecisions || runtimeState.latestDecisions).slice(0, 8).map(summarizeDecision),
    recommendedOperatorActions: []
  };
  if (activeAlerts.some((alert) => alert.severity === "critical")) {
    report.recommendedOperatorActions.push("acknowledge_and_resolve_critical_alerts");
  }
  if (report.reconcile?.manualReviewRequired || report.reconcile?.decision === "NEEDS_MANUAL_REVIEW") {
    report.recommendedOperatorActions.push("complete_manual_reconcile_review");
  }
  if (unresolvedIntents.length) {
    report.recommendedOperatorActions.push("inspect_execution_intents_before_new_entries");
  }
  if (!report.recommendedOperatorActions.length) {
    report.recommendedOperatorActions.push("review_incident_context");
  }
  return redactSecrets(report);
}

export async function writeIncidentReport({ runtimeDir, report }) {
  const incidentDir = path.join(runtimeDir, "incidents");
  await fs.mkdir(incidentDir, { recursive: true });
  const safeId = `${report.incidentId || `incident_${Date.now()}`}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const filePath = path.join(incidentDir, `${safeId}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { filePath };
}

export async function summarizeIncidentReports({ runtimeDir, limit = 12 } = {}) {
  const incidentDir = path.join(runtimeDir, "incidents");
  try {
    const files = (await fs.readdir(incidentDir))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .slice(-limit);
    const reports = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(incidentDir, file), "utf8");
      reports.push(JSON.parse(content));
    }
    return {
      status: reports.length ? "ok" : "empty",
      count: reports.length,
      reports: reports.map((report) => ({
        incidentId: report.incidentId,
        createdAt: report.createdAt,
        type: report.type,
        severity: report.severity,
        summary: report.summary
      }))
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { status: "empty", count: 0, reports: [] };
    }
    return { status: "unavailable", error: error.message, count: 0, reports: [] };
  }
}
