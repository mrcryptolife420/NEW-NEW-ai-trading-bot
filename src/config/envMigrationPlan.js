const DEPRECATED_KEYS = {
  PAPER_PROFILE: "PAPER_MODE_PROFILE",
  DEMO_TRADING: "PAPER_EXECUTION_VENUE"
};

export function buildEnvMigrationPlan(env = {}) {
  const actions = [];
  for (const [oldKey, newKey] of Object.entries(DEPRECATED_KEYS)) {
    if (oldKey in env) {
      actions.push({
        type: "rename",
        key: oldKey,
        targetKey: newKey,
        value: env[oldKey],
        safeAutomatic: !(newKey in env)
      });
    }
  }
  if (env.BOT_MODE === "live" && `${env.BINANCE_API_BASE_URL || ""}`.includes("demo-api.binance.com")) {
    actions.push({
      type: "block",
      key: "BINANCE_API_BASE_URL",
      reason: "live_mode_demo_endpoint",
      safeAutomatic: false
    });
  }
  if (env.BOT_MODE !== "live" && env.LIVE_TRADING_ACKNOWLEDGED) {
    actions.push({
      type: "clear",
      key: "LIVE_TRADING_ACKNOWLEDGED",
      reason: "stale_live_acknowledgement_outside_live",
      safeAutomatic: true
    });
  }
  return {
    status: actions.some((action) => action.type === "block") ? "blocked" : actions.length ? "changes_available" : "clean",
    dryRun: true,
    actions
  };
}
