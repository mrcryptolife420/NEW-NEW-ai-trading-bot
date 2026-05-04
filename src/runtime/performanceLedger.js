function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finite(value, digits = 6) {
  return Number(num(value).toFixed(digits));
}

function dayKey(value) {
  const parsed = new Date(value || 0);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "unknown";
}

function tradeId(trade = {}, index = 0) {
  return trade.id || trade.tradeId || trade.positionId || trade.orderId || `trade_${index}`;
}

function tradeSymbol(trade = {}) {
  return trade.symbol || trade.pair || "unknown";
}

function feeQuote(trade = {}) {
  const entryFee = num(trade.entryFeeQuote ?? trade.entryFee ?? trade.feeQuoteEntry, 0);
  const exitFee = num(trade.exitFeeQuote ?? trade.exitFee ?? trade.feeQuoteExit, 0);
  const aggregate = num(trade.feeQuote ?? trade.totalFeeQuote ?? trade.feesQuote, 0);
  return aggregate || entryFee + exitFee;
}

function feeBase(trade = {}) {
  return num(trade.feeBase ?? trade.entryFeeBase ?? trade.baseFee ?? trade.commissionBase, 0);
}

function entryQuantity(trade = {}) {
  return Math.max(0, num(trade.entryQuantity ?? trade.quantity ?? trade.qty ?? trade.baseQty, 0));
}

function exitQuantity(trade = {}) {
  const direct = num(trade.exitQuantity ?? trade.closedQuantity ?? trade.soldQuantity, NaN);
  return Number.isFinite(direct) ? Math.max(0, direct) : entryQuantity(trade);
}

function quoteAmount(...values) {
  for (const value of values) {
    const parsed = num(value, NaN);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function costBasisQuote(trade = {}) {
  const explicit = quoteAmount(trade.costBasisQuote, trade.allocatedCost, trade.totalCost, trade.entryNotional);
  if (explicit > 0) {
    return explicit;
  }
  return entryQuantity(trade) * num(trade.entryPrice ?? trade.averageEntryPrice ?? trade.avgEntryPrice, 0);
}

function proceedsQuote(trade = {}) {
  const explicit = quoteAmount(trade.proceedsQuote, trade.netProceeds, trade.exitNotional, trade.sellNotional);
  if (explicit > 0) {
    return explicit;
  }
  return exitQuantity(trade) * num(trade.exitPrice ?? trade.averageExitPrice ?? trade.avgExitPrice, 0);
}

function realizedPnlQuote(trade = {}) {
  const direct = quoteAmount(trade.realizedPnl, trade.pnlQuote, trade.netPnlQuote);
  if (direct !== 0 || "realizedPnl" in trade || "pnlQuote" in trade || "netPnlQuote" in trade) {
    return direct;
  }
  return proceedsQuote(trade) - costBasisQuote(trade) - feeQuote(trade);
}

function normalizeFill(fill = {}, trade = {}) {
  const side = `${fill.side || fill.type || ""}`.toLowerCase();
  const quantity = Math.max(0, num(fill.quantity ?? fill.qty ?? fill.executedQty, 0));
  const price = num(fill.price ?? fill.avgPrice ?? trade.entryPrice ?? trade.exitPrice, 0);
  return {
    id: fill.id || fill.orderId || fill.tradeId || null,
    side: side || "unknown",
    quantity: finite(quantity),
    price: finite(price),
    quote: finite(num(fill.quoteQty ?? fill.quoteQuantity, quantity * price)),
    feeQuote: finite(num(fill.feeQuote ?? fill.commissionQuote, 0)),
    feeBase: finite(num(fill.feeBase ?? fill.commissionBase, 0))
  };
}

function buildTradeLedgerRecord(trade = {}, index = 0) {
  const fills = arr(trade.fills || trade.executionFills).map((fill) => normalizeFill(fill, trade));
  const costBasis = costBasisQuote(trade);
  const proceeds = proceedsQuote(trade);
  const realizedPnl = realizedPnlQuote(trade);
  const feesQuote = feeQuote(trade) || fills.reduce((total, fill) => total + fill.feeQuote, 0);
  const feesBase = feeBase(trade) || fills.reduce((total, fill) => total + fill.feeBase, 0);
  const entryQty = entryQuantity(trade);
  const closedQty = exitQuantity(trade);
  const dustQuantity = Math.max(0, entryQty - closedQty - feesBase);
  const breakEvenPrice = closedQty > 0 ? (costBasis + feesQuote) / closedQty : 0;
  const pnlPct = costBasis > 0 ? realizedPnl / costBasis : 0;
  const scaleOuts = arr(trade.scaleOuts || trade.partialExits);
  const partialExitCount = scaleOuts.length + Math.max(0, fills.filter((fill) => fill.side.includes("sell")).length - 1);
  const attribution = trade.tradeAttribution || trade.attribution || trade.strategyDecision || {};
  return {
    tradeId: tradeId(trade, index),
    symbol: tradeSymbol(trade),
    brokerMode: trade.brokerMode || trade.mode || "unknown",
    openedAt: trade.entryAt || trade.openedAt || null,
    closedAt: trade.exitAt || trade.closedAt || trade.at || null,
    day: dayKey(trade.exitAt || trade.closedAt || trade.at || trade.entryAt),
    entryQuantity: finite(entryQty),
    closedQuantity: finite(closedQty),
    dustQuantity: finite(dustQuantity),
    costBasisQuote: finite(costBasis, 4),
    proceedsQuote: finite(proceeds, 4),
    averageEntryPrice: finite(entryQty > 0 ? costBasis / entryQty : num(trade.entryPrice, 0), 8),
    averageExitPrice: finite(closedQty > 0 ? proceeds / closedQty : num(trade.exitPrice, 0), 8),
    breakEvenPrice: finite(breakEvenPrice, 8),
    realizedPnlQuote: finite(realizedPnl, 4),
    realizedPnlPct: finite(pnlPct),
    feesQuote: finite(feesQuote, 6),
    feesBase: finite(feesBase, 8),
    partialExitCount,
    fillCount: fills.length,
    fills,
    attribution: {
      strategy: attribution.strategy || attribution.activeStrategy || trade.strategyAtEntry || "unknown",
      family: attribution.family || trade.strategyFamily || "unknown",
      regime: attribution.regime || trade.regimeAtEntry || "unknown"
    },
    labels: [
      Math.abs(realizedPnl) <= Math.max(0.01, costBasis * 0.0001) ? "break_even" : realizedPnl > 0 ? "positive_pnl" : "negative_pnl",
      partialExitCount > 0 ? "partial_exit" : "full_exit",
      dustQuantity > 0 ? "dust_remaining" : "no_dust"
    ]
  };
}

function summarizeByDay(records = []) {
  const buckets = new Map();
  for (const record of records) {
    const key = record.day || "unknown";
    if (!buckets.has(key)) {
      buckets.set(key, {
        day: key,
        tradeCount: 0,
        realizedPnlQuote: 0,
        feesQuote: 0,
        costBasisQuote: 0,
        proceedsQuote: 0,
        winCount: 0,
        lossCount: 0
      });
    }
    const bucket = buckets.get(key);
    bucket.tradeCount += 1;
    bucket.realizedPnlQuote += record.realizedPnlQuote;
    bucket.feesQuote += record.feesQuote;
    bucket.costBasisQuote += record.costBasisQuote;
    bucket.proceedsQuote += record.proceedsQuote;
    if (record.realizedPnlQuote > 0) bucket.winCount += 1;
    if (record.realizedPnlQuote < 0) bucket.lossCount += 1;
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    realizedPnlQuote: finite(bucket.realizedPnlQuote, 4),
    feesQuote: finite(bucket.feesQuote, 6),
    costBasisQuote: finite(bucket.costBasisQuote, 4),
    proceedsQuote: finite(bucket.proceedsQuote, 4),
    winRate: finite(bucket.tradeCount ? bucket.winCount / bucket.tradeCount : 0)
  })).sort((left, right) => left.day.localeCompare(right.day));
}

function reconcileLedger({ records, accountDeltas = [], fills = [] } = {}) {
  const issues = [];
  const ledgerPnl = records.reduce((total, record) => total + record.realizedPnlQuote, 0);
  const accountPnl = arr(accountDeltas).reduce((total, item) => total + num(item.realizedPnl ?? item.pnlQuote ?? item.deltaQuote, 0), 0);
  const fillCount = arr(fills).length || records.reduce((total, record) => total + record.fillCount, 0);
  const recordFillCount = records.reduce((total, record) => total + record.fillCount, 0);
  if (arr(accountDeltas).length && Math.abs(ledgerPnl - accountPnl) > 0.05) {
    issues.push({ code: "ledger_account_delta_mismatch", severity: "warning", ledgerPnl: finite(ledgerPnl), accountPnl: finite(accountPnl) });
  }
  if (fillCount && recordFillCount && Math.abs(fillCount - recordFillCount) > 0) {
    issues.push({ code: "ledger_fill_count_mismatch", severity: "warning", fillCount, recordFillCount });
  }
  for (const record of records) {
    if (!Number.isFinite(record.realizedPnlQuote) || !Number.isFinite(record.costBasisQuote)) {
      issues.push({ code: "non_finite_ledger_value", severity: "corrupt", tradeId: record.tradeId });
    }
    if (record.dustQuantity > Math.max(0.000001, record.entryQuantity * 0.02)) {
      issues.push({ code: "large_dust_residual", severity: "warning", tradeId: record.tradeId, dustQuantity: record.dustQuantity });
    }
  }
  return {
    status: issues.some((item) => item.severity === "corrupt") ? "corrupt" : issues.length ? "warning" : "ok",
    issues,
    ledgerPnlQuote: finite(ledgerPnl, 4),
    accountPnlQuote: finite(accountPnl, 4),
    checkedAccountDeltas: arr(accountDeltas).length,
    checkedFills: fillCount
  };
}

export function buildPerformanceLedger({
  trades = [],
  accountDeltas = [],
  fills = [],
  generatedAt = new Date().toISOString()
} = {}) {
  const records = arr(trades).map((trade, index) => buildTradeLedgerRecord(trade, index));
  const dailySummary = summarizeByDay(records);
  const reconciliation = reconcileLedger({ records, accountDeltas, fills });
  return {
    generatedAt,
    status: reconciliation.status,
    tradeCount: records.length,
    realizedPnlQuote: finite(records.reduce((total, record) => total + record.realizedPnlQuote, 0), 4),
    feesQuote: finite(records.reduce((total, record) => total + record.feesQuote, 0), 6),
    dustTradeCount: records.filter((record) => record.dustQuantity > 0).length,
    partialExitTradeCount: records.filter((record) => record.partialExitCount > 0).length,
    trades: records,
    dailySummary,
    reconciliation,
    readOnly: true,
    liveBehaviorChanged: false
  };
}
