import { nowIso } from "../utils/time.js";

function buildId(prefix = "audit") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCodes(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

export class AuditLogService {
  constructor({ store, logger, retentionDays = 30 } = {}) {
    this.store = store;
    this.logger = logger;
    this.retentionDays = retentionDays;
  }

  async init() {
    await this.store?.init?.();
  }

  async record(kind, payload = {}) {
    const event = {
      id: payload.id || buildId(kind),
      at: payload.at || nowIso(),
      kind,
      payloadVersion: 1,
      cycleId: payload.cycleId || null,
      decisionId: payload.decisionId || null,
      mode: payload.mode || "paper",
      symbol: payload.symbol || null,
      status: payload.status || "observed",
      reasonCodes: normalizeCodes(payload.reasonCodes),
      metrics: payload.metrics && typeof payload.metrics === "object" ? payload.metrics : {},
      details: payload.details && typeof payload.details === "object" ? payload.details : {}
    };
    await this.store?.append?.(event);
    this.logger?.debug?.("Audit event recorded", {
      kind: event.kind,
      status: event.status,
      symbol: event.symbol,
      decisionId: event.decisionId
    });
    return event;
  }

  async buildSummary({ limit = 100 } = {}) {
    const events = await this.store?.readRecent?.({ limit }) || [];
    const countsByKind = {};
    const countsByStatus = {};
    const rejectionCounts = {};
    const adaptiveChanges = [];
    const executionFailures = [];
    for (const event of events) {
      countsByKind[event.kind] = (countsByKind[event.kind] || 0) + 1;
      countsByStatus[event.status] = (countsByStatus[event.status] || 0) + 1;
      for (const code of normalizeCodes(event.reasonCodes)) {
        rejectionCounts[code] = (rejectionCounts[code] || 0) + 1;
      }
      if (event.kind === "adaptive_change") {
        adaptiveChanges.push({
          at: event.at,
          symbol: event.symbol,
          status: event.status,
          reasonCodes: event.reasonCodes
        });
      }
      if (event.kind === "execution_result" && event.status !== "executed") {
        executionFailures.push({
          at: event.at,
          symbol: event.symbol,
          status: event.status,
          reasonCodes: event.reasonCodes
        });
      }
    }
    return {
      status: events.length ? "active" : "idle",
      lastEventAt: events[0]?.at || null,
      eventCount: events.length,
      countsByKind,
      countsByStatus,
      topRejectionCodes: Object.entries(rejectionCounts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 6)
        .map(([code, count]) => ({ code, count })),
      recentAdaptiveChanges: adaptiveChanges.slice(0, 5),
      recentExecutionFailures: executionFailures.slice(0, 5)
    };
  }
}
