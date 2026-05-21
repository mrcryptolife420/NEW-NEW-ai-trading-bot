export function renderTradingQualityPanel(snapshot = {}) {
  const quality = snapshot.tradingQuality || snapshot.dashboard?.tradingQuality || snapshot.report?.tradeQualitySummary || snapshot;
  const exitCard = snapshot.exitIntelligenceV2DecisionCard || snapshot.dashboard?.exitIntelligenceV2DecisionCard || quality.exitIntelligenceV2DecisionCard || quality.exitIntelligence || null;
  const paperCohorts = quality.paperCohorts || quality.paperCohortAutoWatchlist || snapshot.paperCohorts || [];
  const netEdge = quality.netEdgeGate || snapshot.netEdgeGate || null;
  const confluence = quality.confluence || quality.multiTimeframeConfluence || snapshot.confluence || null;
  return [
    `<section id="trading-quality-panel">`,
    `<h2>Trading quality</h2>`,
    `<span id="trading-quality-status">${quality.status || "unknown"}</span>`,
    netEdge ? `<div id="net-edge-gate-card">${netEdge.status || netEdge.decision || "diagnostic"}</div>` : "",
    exitCard ? `<div id="exit-intelligence-v2-card">${exitCard.recommendation || "hold"} (${exitCard.confidence ?? "n/a"})</div>` : `<div id="exit-intelligence-v2-card">no-data</div>`,
    confluence ? `<div id="multi-timeframe-confluence-card">${confluence.confluenceScore ?? confluence.score ?? "n/a"}</div>` : "",
    `<ul id="paper-cohort-watchlist">${paperCohorts.slice(0, 5).map((item) => `<li>${item.setup || item.symbol || "cohort"}: ${item.nextPaperAction || item.nextAction || "observe"}</li>`).join("")}</ul>`,
    `</section>`
  ].join("");
}
