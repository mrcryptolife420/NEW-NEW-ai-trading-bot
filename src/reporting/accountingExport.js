function csvEscape(value) {
  return `"${`${value ?? ""}`.replaceAll("\"", "\"\"")}"`;
}

export function buildAccountingExport({ trades = [], mode = "live", format = "json" } = {}) {
  const filtered = trades.filter((trade) => (trade.mode || trade.brokerMode || mode) === mode);
  const rows = filtered.map((trade) => ({
    tradeId: trade.tradeId,
    symbol: trade.symbol,
    base: trade.baseAsset || trade.symbol?.replace(/USDT$/, ""),
    quote: trade.quoteAsset || "USDT",
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    realizedPnl: Number(trade.realizedPnl ?? trade.pnlQuote ?? 0) || 0,
    fees: Number(trade.fees ?? trade.totalFees ?? 0) || 0,
    mode,
    executionVenue: trade.executionVenue || trade.brokerMode || mode
  }));
  if (format === "csv") {
    const header = Object.keys(rows[0] || { tradeId: "", symbol: "", realizedPnl: "", fees: "" });
    return { mode, format, content: [header.join(","), ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n"), rows: rows.length };
  }
  return { mode, format: "json", rows, stateMutated: false };
}
