import { asArray, stableId } from "../utils.js";

export function buildNeuralReplayQueue({ decisions = [], trades = [], incidents = [], maxItems = 100 } = {}) {
  const cases = [];
  for (const trade of asArray(trades)) {
    const loss = Number(trade.netPnlPct ?? trade.pnlPct ?? 0) < 0;
    cases.push({
      caseId: stableId("nr_case", [trade.tradeId, trade.symbol, trade.closedAt]),
      packType: trade.reconcileSummary ? "reconcile_uncertainty" : loss ? "losing_trade_replay" : "winning_trade_replay",
      priority: trade.reconcileSummary ? 95 : loss ? 80 : 35,
      sampleIds: [trade.tradeId].filter(Boolean),
      source: "trade_journal"
    });
  }
  for (const decision of asArray(decisions)) {
    if (decision.approved === false) {
      cases.push({
        caseId: stableId("nr_case", [decision.decisionId, decision.symbol]),
        packType: decision.vetoOutcome === "bad_veto" ? "missed_winner_replay" : "blocked_decision_replay",
        priority: decision.vetoOutcome === "bad_veto" ? 90 : 55,
        sampleIds: [decision.decisionId].filter(Boolean),
        source: "decision"
      });
    }
  }
  for (const incident of asArray(incidents)) {
    cases.push({
      caseId: stableId("nr_case", [incident.incidentId, incident.type]),
      packType: "incident_replay",
      priority: incident.severity === "critical" ? 100 : 70,
      sampleIds: [incident.incidentId].filter(Boolean),
      source: "incident"
    });
  }
  return {
    cases: cases.sort((a, b) => b.priority - a.priority).slice(0, Math.max(0, maxItems)),
    realTradesSeparated: true,
    liveSafe: { placesOrders: false }
  };
}
