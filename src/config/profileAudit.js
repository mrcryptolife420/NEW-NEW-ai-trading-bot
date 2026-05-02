function finding({ id, severity = "medium", message, mode = "paper", evidence = {} }) {
  const live = mode === "live";
  return {
    id,
    severity,
    level: severity === "high" ? 1 : severity === "medium" ? 2 : 3,
    message,
    evidence,
    error: live && severity === "high",
    warning: !live || severity !== "high"
  };
}

export function buildConfigProfileAudit(config = {}) {
  const mode = config.botMode === "live" ? "live" : "paper";
  const findings = [];

  if (mode === "live" && !config.enableExchangeProtection) {
    findings.push(finding({
      id: "live_without_exchange_protection",
      severity: "high",
      mode,
      message: "Live mode requires exchange protection.",
      evidence: { enableExchangeProtection: config.enableExchangeProtection }
    }));
  }
  if (mode === "live" && config.adaptiveLearningLiveCoreUpdates) {
    findings.push(finding({
      id: "live_adaptive_core_updates_enabled",
      severity: "high",
      mode,
      message: "Live adaptive core updates must stay disabled unless explicitly reviewed.",
      evidence: { adaptiveLearningLiveCoreUpdates: config.adaptiveLearningLiveCoreUpdates }
    }));
  }
  const experimentalResearchFlags = [
    ["referenceVenueFetchEnabled", config.referenceVenueFetchEnabled],
    ["strategyResearchFetchEnabled", config.strategyResearchFetchEnabled],
    ["enableBreakoutRetestStrategy", config.enableBreakoutRetestStrategy && !config.breakoutRetestPaperOnly]
  ].filter(([, enabled]) => Boolean(enabled));
  if (mode === "live" && experimentalResearchFlags.length) {
    findings.push(finding({
      id: "live_experimental_research_flags_enabled",
      severity: "high",
      mode,
      message: "Experimental research feeds or strategies must not alter live behavior without review.",
      evidence: { flags: experimentalResearchFlags.map(([key]) => key) }
    }));
  }
  if (
    mode === "live"
    && config.thresholdAutoApplyEnabled
    && (
      Number(config.thresholdProbationMinTrades || 0) < 1
      || Number(config.thresholdProbationWindowDays || 0) < 1
      || !Number.isFinite(Number(config.thresholdProbationMaxAvgPnlDropPct))
      || !Number.isFinite(Number(config.thresholdProbationMaxWinRateDrop))
    )
  ) {
    findings.push(finding({
      id: "live_threshold_auto_apply_without_probation",
      severity: "high",
      mode,
      message: "Live threshold auto-apply needs probation constraints.",
      evidence: {
        thresholdAutoApplyEnabled: config.thresholdAutoApplyEnabled,
        thresholdProbationMinTrades: config.thresholdProbationMinTrades,
        thresholdProbationWindowDays: config.thresholdProbationWindowDays
      }
    }));
  }
  if (
    mode !== "live"
    && config.paperExecutionVenue === "binance_demo_spot"
    && config.allowSyntheticMinNotionalExit === false
    && Number(config.paperMinTradeUsdt || 0) < Number(config.minTradeUsdt || 0)
  ) {
    findings.push(finding({
      id: "demo_spot_min_notional_without_synthetic_exit",
      severity: "medium",
      mode,
      message: "Demo spot paper trades below live min trade size can get stuck without synthetic min-notional exit handling.",
      evidence: {
        paperExecutionVenue: config.paperExecutionVenue,
        paperMinTradeUsdt: config.paperMinTradeUsdt,
        minTradeUsdt: config.minTradeUsdt,
        allowSyntheticMinNotionalExit: config.allowSyntheticMinNotionalExit
      }
    }));
  }

  const errors = findings.filter((item) => item.error).map((item) => item.message);
  const warnings = findings.filter((item) => item.warning).map((item) => item.message);
  return {
    status: errors.length ? "error" : warnings.length ? "warning" : "ok",
    findings,
    errors,
    warnings
  };
}
