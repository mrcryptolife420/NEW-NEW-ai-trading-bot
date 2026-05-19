function buildBackupManifest({ files = [], createdAt = new Date(0).toISOString() } = {}) {
  return {
    createdAt,
    files: files.map((file) => ({
      path: String(file.path),
      sha256: String(file.sha256 || ""),
      category: String(file.category || "runtime")
    })),
    criticalCount: files.filter((file) => file.critical).length
  };
}

function planRestore({ current = {}, backup = {}, dryRun = true, exchangeTruth = null, mode = "paper" } = {}) {
  const requiresExchangeTruth = mode === "live";
  const blocked = requiresExchangeTruth && !exchangeTruth;
  const actions = (backup.files || []).map((file) => ({
    path: file.path,
    action: current[file.path] === file.sha256 ? "keep" : "restore",
    dryRun,
    mutatesData: !dryRun
  }));
  return {
    allowed: !blocked,
    blocked,
    blockers: blocked ? ["live_restore_requires_exchange_truth"] : [],
    actions
  };
}

function verifyRestorePlan(plan = {}) {
  return {
    ok: Boolean(plan.allowed) && !plan.actions?.some((action) => action.action === "restore" && action.mutatesData && action.dryRun),
    restoreCount: (plan.actions || []).filter((action) => action.action === "restore").length
  };
}

function buildRecoveryDrillPlan({ scenarios = [] } = {}) {
  return scenarios.map((scenario, index) => ({
    id: scenario.id || `drill-${index + 1}`,
    mode: scenario.mode || "paper",
    dryRun: true,
    expectedEvidence: ["backup_manifest", "restore_plan", "verification"]
  }));
}

export { buildBackupManifest, planRestore, verifyRestorePlan, buildRecoveryDrillPlan };
