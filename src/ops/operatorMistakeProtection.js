export function evaluateOperatorMistakeProtection(config = {}) {
  const findings = [];
  const add = (id, severity, message) => findings.push({ id, severity, message, blocksLive: severity === "critical" });
  const mode = config.botMode || "paper";
  if (mode === "live" && `${config.binanceApiBaseUrl || ""}`.includes("demo-api")) add("live_mode_demo_endpoint", "critical", "Live mode gebruikt demo endpoint.");
  if (mode === "live" && !config.enableExchangeProtection) add("live_without_exchange_protection", "critical", "Live mode vereist exchange protection.");
  if (mode === "live" && !(config.watchlist || []).length) add("live_empty_watchlist", "critical", "Live mode heeft lege watchlist.");
  if (mode === "live" && config.liveTradingAcknowledged !== "I_UNDERSTAND_LIVE_TRADING_RISK") add("live_ack_missing", "critical", "Live acknowledgement ontbreekt.");
  if (config.apiKeyCanWithdraw) add("withdrawal_permission_active", "critical", "API key lijkt withdrawal permission te hebben.");
  if (config.fastLiveExecutionEnabled) add("fast_live_execution_enabled", "warning", "Fast live execution staat aan.");
  if (config.neuralLiveAutonomyEnabled) add("neural_live_autonomy_enabled", "warning", "Neural live autonomy staat aan.");
  if (mode === "paper" && config.binanceApiKey && config.paperProfileUsesLiveKeys) add("paper_profile_uses_live_keys", "warning", "Paper profile gebruikt live keys.");
  if (Number(config.maxTotalExposurePct || 0) > 0.5) add("max_exposure_above_safe_limit", "critical", "Max exposure ligt boven veilige limiet.");
  return {
    status: findings.some((item) => item.severity === "critical") ? "blocked" : findings.length ? "warning" : "clear",
    findings,
    blocksLive: findings.some((item) => item.blocksLive),
    ignoredWarningsRequireAudit: true,
    riskIncreasingConfirmRequired: findings.some((item) => item.severity === "warning")
  };
}
