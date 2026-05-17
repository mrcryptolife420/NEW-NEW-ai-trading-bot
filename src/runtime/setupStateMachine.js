function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bool(value) {
  return value === true || `${value}`.toLowerCase() === "true";
}

function getConfigValue(config = {}, key, fallback = null) {
  return config[key] ?? config[key.charAt(0).toLowerCase() + key.slice(1)] ?? fallback;
}

export function buildSetupStateMachine({
  config = {},
  env = {},
  doctor = {},
  diagnostics = {},
  dashboard = {},
  nowIso = new Date().toISOString()
} = {}) {
  const mode = getConfigValue(config, "botMode", env.BOT_MODE || "paper");
  const envPath = getConfigValue(config, "envPath", diagnostics.envPath || null);
  const profileId = getConfigValue(config, "tradeProfileId", env.TRADE_PROFILE_ID || null);
  const liveAcknowledged = getConfigValue(config, "liveTradingAcknowledged", env.LIVE_TRADING_ACKNOWLEDGED || "") === "I_UNDERSTAND_LIVE_TRADING_RISK";
  const doctorWarnings = arr(doctor.warnings || doctor.failed || doctor.checks).filter((item) => item?.passed === false || item?.status === "warning" || item?.status === "failed");
  const dashboardReachable = dashboard.reachable ?? dashboard.status === "ready" ?? diagnostics.dashboardReachable;
  const reasons = [];
  if (!envPath) reasons.push("env_path_missing");
  if (!profileId) reasons.push("trade_profile_not_selected");
  if (doctorWarnings.length) reasons.push("doctor_warning");
  if (mode === "live" && !liveAcknowledged) reasons.push("live_acknowledgement_missing");
  if (dashboardReachable === false) reasons.push("dashboard_unreachable");
  const state = !envPath
    ? "env_missing"
    : !profileId
      ? "fresh_install"
      : mode === "live" && !liveAcknowledged
        ? "live_locked"
        : doctorWarnings.length
          ? "doctor_warning"
          : dashboardReachable === false
            ? "profile_selected"
            : mode === "live"
              ? "live_preflight_required"
              : "paper_ready";
  return {
    version: 1,
    state,
    generatedAt: nowIso,
    mode,
    profileId,
    envPath,
    liveAcknowledged,
    dashboardReachable: Boolean(dashboardReachable),
    reasons,
    safeDefault: mode !== "live",
    nextActions: reasons.length
      ? reasons.map((reason) => ({
        reason,
        action: reason === "env_path_missing"
          ? "run_setup_wizard"
          : reason === "trade_profile_not_selected"
            ? "select_trade_profile"
            : reason === "live_acknowledgement_missing"
              ? "keep_live_locked_until_acknowledged"
              : reason === "dashboard_unreachable"
                ? "restart_dashboard"
                : "run_doctor"
      }))
      : [{ reason: "ready", action: mode === "live" ? "run_live_preflight" : "start_paper_cycle" }]
  };
}

export function buildProfileDiffPreview({ preview = {}, currentConfig = {}, currentEnv = {} } = {}) {
  const updates = obj(preview.updates);
  const changedKeys = Object.entries(updates)
    .map(([key, nextValue]) => {
      const currentValue = currentEnv[key] ?? currentConfig[key] ?? currentConfig[key.charAt(0).toLowerCase() + key.slice(1)] ?? null;
      return {
        key,
        currentValue,
        nextValue,
        changed: `${currentValue ?? ""}` !== `${nextValue ?? ""}`,
        requiresRestart: true,
        liveImpact: key === "BOT_MODE" && nextValue === "live" || key.includes("LIVE") ? "live_guarded" : "none",
        riskImpact: key === "BOT_MODE" || key.includes("RISK") || key.includes("LIVE") || key.includes("PROMOTE") ? "safety_relevant" : "config"
      };
    })
    .filter((item) => item.changed);
  const liveKeys = changedKeys.filter((item) => item.liveImpact !== "none");
  return {
    ...preview,
    diff: {
      changedCount: changedKeys.length,
      changedKeys,
      liveImpact: liveKeys.length ? "requires_acknowledgement_or_preflight" : "none",
      requiresRestart: changedKeys.some((item) => item.requiresRestart),
      warnings: [
        ...arr(preview.warnings),
        ...(liveKeys.length ? ["Live-impacting profile changes remain locked behind acknowledgement and preflight."] : [])
      ]
    },
    safeApply: {
      allowed: preview.safeDefault !== false && !liveKeys.length,
      denialReasons: preview.safeDefault === false || liveKeys.length ? ["live_profile_requires_acknowledgement"] : [],
      rollbackHint: changedKeys.length ? "Re-apply the previous profile or restore the previous env file values." : null
    }
  };
}

