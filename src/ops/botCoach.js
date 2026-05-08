export function buildBotCoachSummary({ blockers = [], alerts = [], performanceIssues = [], dataQualityIssues = [], exchangeIssues = [], neuralProposals = [] } = {}) {
  const issues = [
    ...blockers.map((item) => ({ type: "blocker", item })),
    ...alerts.map((item) => ({ type: "alert", item })),
    ...exchangeIssues.map((item) => ({ type: "exchange", item })),
    ...dataQualityIssues.map((item) => ({ type: "data_quality", item })),
    ...performanceIssues.map((item) => ({ type: "performance", item })),
    ...neuralProposals.map((item) => ({ type: "neural", item }))
  ];
  const primary = issues[0];
  return {
    status: primary ? "action_recommended" : "ok",
    summary: primary ? `Bot activity is constrained by ${primary.type}: ${primary.item.reason || primary.item.code || primary.item.message || "unknown"}.` : "No immediate safety action is required.",
    nextBestSafeAction: primary ? safeActionFor(primary.type) : "Keep monitoring dashboard freshness and audit health.",
    runbook: `/runbooks/${primary?.type || "normal-operations"}`,
    opensTrades: false,
    raisesRisk: false
  };
}

function safeActionFor(type) {
  return ({
    blocker: "Inspect blocker reason distribution before changing thresholds.",
    alert: "Resolve the active alert and rerun doctor.",
    exchange: "Keep live entries paused until exchange health recovers.",
    data_quality: "Refresh market data and verify feed freshness.",
    performance: "Disable optional slow modules before enabling fast execution.",
    neural: "Keep neural proposals in shadow mode until reviewed."
  })[type] || "Review operator dashboard before taking action.";
}
