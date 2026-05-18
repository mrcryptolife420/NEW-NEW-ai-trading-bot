const ACTION_CONTRACTS = [
  { id: "start", path: "/api/start", liveSensitive: false, allowedLifecycleStates: ["ready", "stopped"], auditCategory: "runtime" },
  { id: "stop", path: "/api/stop", liveSensitive: false, allowedLifecycleStates: ["running", "ready", "stopping", "stopped", "degraded"], auditCategory: "runtime" },
  { id: "refresh_analysis", path: "/api/refresh", liveSensitive: false, allowedLifecycleStates: ["ready", "stopped", "degraded"], auditCategory: "runtime" },
  { id: "cycle_once", path: "/api/cycle", liveSensitive: false, allowedLifecycleStates: ["ready", "stopped", "degraded"], auditCategory: "runtime" },
  { id: "research", path: "/api/research", liveSensitive: false, allowedLifecycleStates: ["ready", "stopped", "degraded"], auditCategory: "research", bodyFields: ["symbols"] },
  { id: "mode_set", path: "/api/mode", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "config", bodyFields: ["mode"] },
  { id: "config_profile_preview", path: "/api/config/profile/preview", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded", "stopping"], auditCategory: "config", bodyFields: ["profileId"] },
  { id: "config_profile_apply", path: "/api/config/profile/apply", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopping", "stopped", "degraded"], auditCategory: "config", bodyFields: ["profileId", "liveAcknowledgement"] },
  { id: "config_quick_settings_preview", path: "/api/config/quick-settings/preview", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded", "stopping"], auditCategory: "config", bodyFields: ["updates"] },
  { id: "config_quick_settings_apply", path: "/api/config/quick-settings/apply", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopping", "stopped", "degraded"], auditCategory: "config", bodyFields: ["updates"] },
  { id: "setup_run_checks", path: "/api/setup/run-checks", liveSensitive: false, allowedLifecycleStates: ["ready", "stopped", "degraded"], auditCategory: "setup" },
  { id: "setup_complete", path: "/api/setup/complete", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopping", "stopped", "degraded"], auditCategory: "setup", bodyFields: ["profileId", "liveAcknowledgement"] },
  { id: "setup_reset", path: "/api/setup/reset", liveSensitive: false, allowedLifecycleStates: ["ready", "running", "stopped", "degraded", "stopping"], auditCategory: "setup" },
  { id: "alert_ack", path: "/api/alerts/ack", liveSensitive: false, allowedLifecycleStates: ["ready", "running", "stopped", "degraded", "stopping"], auditCategory: "alert", bodyFields: ["id", "acknowledged", "note"] },
  { id: "alert_silence", path: "/api/alerts/silence", liveSensitive: false, allowedLifecycleStates: ["ready", "running", "stopped", "degraded", "stopping"], auditCategory: "alert", bodyFields: ["id", "minutes"] },
  { id: "alert_resolve", path: "/api/alerts/resolve", liveSensitive: false, allowedLifecycleStates: ["ready", "running", "stopped", "degraded", "stopping"], auditCategory: "alert", bodyFields: ["id", "resolved", "note"] },
  { id: "force_reconcile", path: "/api/ops/force-reconcile", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "ops", bodyFields: ["note"] },
  { id: "position_review", path: "/api/positions/review", liveSensitive: false, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "ops", bodyFields: ["id", "note"] },
  { id: "probe_only", path: "/api/ops/probe-only", liveSensitive: false, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "ops", bodyFields: ["enabled", "minutes", "note"] },
  { id: "diagnostics_action", path: "/api/diagnostics/action", liveSensitive: false, allowedLifecycleStates: ["ready", "stopped", "degraded"], auditCategory: "diagnostics", bodyFields: ["action", "target", "note"] },
  { id: "policy_approve", path: "/api/policies/approve", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "policy", bodyFields: ["id", "action", "note"] },
  { id: "policy_reject", path: "/api/policies/reject", liveSensitive: false, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "policy", bodyFields: ["id", "action", "note"] },
  { id: "policy_revert", path: "/api/policies/revert", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "policy", bodyFields: ["id", "note"] },
  { id: "promotion_approve", path: "/api/promotion/approve", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "promotion", bodyFields: ["symbol", "note"] },
  { id: "promotion_rollback", path: "/api/promotion/rollback", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "promotion", bodyFields: ["symbol", "note"] },
  { id: "promotion_scope_approve", path: "/api/promotion/scope/approve", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "promotion", bodyFields: ["scope", "note"] },
  { id: "promotion_scope_rollback", path: "/api/promotion/scope/rollback", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "promotion", bodyFields: ["scope", "note"] },
  { id: "promotion_probation_decide", path: "/api/promotion/probation/decide", liveSensitive: true, allowedLifecycleStates: ["ready", "running", "stopped", "degraded"], auditCategory: "promotion", bodyFields: ["key", "decision", "note"] }
];

const CONTRACT_BY_PATH = new Map(ACTION_CONTRACTS.map((contract) => [contract.path, contract]));

export function listDashboardActionContracts() {
  return ACTION_CONTRACTS.map((contract) => ({
    method: "POST",
    requiresTrustedMutation: true,
    responseShape: "dashboard_action_result",
    errorShape: "dashboard_action_error",
    eventTopic: contract.auditCategory,
    ...contract,
    bodyFields: [...(contract.bodyFields || [])],
    allowedLifecycleStates: [...contract.allowedLifecycleStates]
  }));
}

export function resolveDashboardActionContract(pathname) {
  const contract = CONTRACT_BY_PATH.get(pathname);
  return contract ? listDashboardActionContracts().find((item) => item.path === pathname) : null;
}

export function buildDashboardActionEnvelope(contract, result, { requestId = null, lifecycleBefore = null, lifecycleAfter = null } = {}) {
  return {
    ...(result && typeof result === "object" && !Array.isArray(result) ? result : { result }),
    action: {
      id: contract?.id || "unknown",
      path: contract?.path || null,
      auditCategory: contract?.auditCategory || "unknown",
      liveSensitive: Boolean(contract?.liveSensitive),
      requestId,
      lifecycleBefore,
      lifecycleAfter,
      status: result?.stop?.pending ? "pending" : "completed"
    }
  };
}
