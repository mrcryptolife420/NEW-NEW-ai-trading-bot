const DAY_MS = 24 * 60 * 60 * 1000;

function buildDataGovernanceCatalog(entries = []) {
  const datasets = {};
  for (const entry of entries) {
    const name = String(entry.name || entry.dataset || "unknown");
    datasets[name] = {
      name,
      owner: String(entry.owner || "runtime"),
      retentionDays: Math.max(1, Number(entry.retentionDays || 30)),
      privacy: String(entry.privacy || "operational"),
      lineage: Array.isArray(entry.lineage) ? [...entry.lineage] : []
    };
  }
  return { datasets };
}

function planRetentionActions({ catalog, datasets = [], now = new Date(), dryRun = true } = {}) {
  const nowMs = new Date(now).getTime();
  return datasets.map((record) => {
    const policy = catalog?.datasets?.[record.dataset] || { retentionDays: 30 };
    const createdAt = new Date(record.createdAt || record.timestamp || now).getTime();
    const ageDays = Math.max(0, Math.floor((nowMs - createdAt) / DAY_MS));
    const expired = ageDays > policy.retentionDays;
    return {
      dataset: record.dataset,
      id: record.id,
      ageDays,
      action: expired ? "archive_or_delete" : "keep",
      dryRun,
      mutatesData: false
    };
  });
}

function buildLineageGraph({ decisions = [], trades = [] } = {}) {
  const nodes = new Map();
  const edges = [];
  for (const decision of decisions) {
    const decisionId = `decision:${decision.id}`;
    nodes.set(decisionId, { id: decisionId, type: "decision", symbol: decision.symbol });
    for (const source of decision.sources || []) {
      const sourceId = `source:${source}`;
      nodes.set(sourceId, { id: sourceId, type: "source" });
      edges.push({ from: sourceId, to: decisionId, relation: "informed" });
    }
  }
  for (const trade of trades) {
    const tradeId = `trade:${trade.id}`;
    const decisionId = `decision:${trade.decisionId}`;
    nodes.set(tradeId, { id: tradeId, type: "trade", symbol: trade.symbol });
    if (nodes.has(decisionId)) {
      edges.push({ from: decisionId, to: tradeId, relation: "executed_as" });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export { buildDataGovernanceCatalog, planRetentionActions, buildLineageGraph };
