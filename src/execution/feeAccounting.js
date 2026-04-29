function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeAsset(asset = "") {
  return `${asset || ""}`.trim().toUpperCase();
}

function resolveTradePrice(trade = {}) {
  return safeNumber(trade.price || trade.fillPrice || trade.avgPrice, 0);
}

function resolveExternalPrice({ asset, quoteAsset, trade = {}, priceResolver = null }) {
  if (!asset || !quoteAsset || asset === quoteAsset || typeof priceResolver !== "function") {
    return null;
  }
  const resolved = priceResolver({
    asset,
    quoteAsset,
    symbol: `${asset}${quoteAsset}`,
    trade
  });
  if (typeof resolved === "number") {
    return Number.isFinite(resolved) && resolved > 0 ? resolved : null;
  }
  const price = safeNumber(resolved?.price || resolved?.mid || resolved?.last || resolved?.bid || resolved?.ask, 0);
  return price > 0 ? price : null;
}

export function normalizeTradeCommissionToQuote({
  trade = {},
  baseAsset = "",
  quoteAsset = "",
  priceResolver = null
} = {}) {
  const commission = safeNumber(trade.commission, 0);
  const commissionAsset = normalizeAsset(trade.commissionAsset);
  const base = normalizeAsset(baseAsset);
  const quote = normalizeAsset(quoteAsset);
  const raw = {
    asset: commissionAsset || null,
    amount: commission
  };
  if (!commission || !commissionAsset) {
    return {
      feeQuote: 0,
      feeQuoteStatus: "none",
      raw
    };
  }
  if (commissionAsset === quote) {
    return {
      feeQuote: commission,
      feeQuoteStatus: "converted",
      conversion: { type: "quote_asset", price: 1 },
      raw
    };
  }
  if (commissionAsset === base) {
    const price = resolveTradePrice(trade);
    if (price > 0) {
      return {
        feeQuote: commission * price,
        feeQuoteStatus: "converted",
        conversion: { type: "base_asset", price },
        raw
      };
    }
  }
  const conversionPrice = resolveExternalPrice({ asset: commissionAsset, quoteAsset: quote, trade, priceResolver });
  if (conversionPrice) {
    return {
      feeQuote: commission * conversionPrice,
      feeQuoteStatus: "converted",
      conversion: { type: "third_asset", symbol: `${commissionAsset}${quote}`, price: conversionPrice },
      raw
    };
  }
  return {
    feeQuote: 0,
    feeQuoteStatus: "unconverted",
    conversion: { type: "unavailable", symbol: `${commissionAsset}${quote}` },
    raw
  };
}

export function resolveObservedFeeBps({ trade = {}, feeQuote = 0 } = {}) {
  const quoteQty = safeNumber(trade.quoteQty || trade.cummulativeQuoteQty, 0);
  const qty = safeNumber(trade.qty || trade.executedQty, 0);
  const price = resolveTradePrice(trade);
  const notional = quoteQty > 0 ? quoteQty : qty * price;
  return notional > 0 ? (safeNumber(feeQuote, 0) / notional) * 10_000 : null;
}

export function summarizeTradeFees({
  trades = [],
  baseAsset = "",
  quoteAsset = "",
  priceResolver = null
} = {}) {
  const breakdown = [];
  let feeQuote = 0;
  let unconvertedCount = 0;
  let baseAssetCommission = 0;
  for (const trade of Array.isArray(trades) ? trades : []) {
    const item = normalizeTradeCommissionToQuote({ trade, baseAsset, quoteAsset, priceResolver });
    const observedFeeBps = resolveObservedFeeBps({ trade, feeQuote: item.feeQuote });
    breakdown.push({
      tradeId: trade.id ?? trade.tradeId ?? null,
      orderId: trade.orderId ?? null,
      commissionAsset: item.raw.asset,
      commission: item.raw.amount,
      feeQuote: item.feeQuote,
      feeQuoteStatus: item.feeQuoteStatus,
      observedFeeBps,
      conversion: item.conversion || null
    });
    feeQuote += item.feeQuote;
    if (item.feeQuoteStatus === "unconverted") {
      unconvertedCount += 1;
    }
    if (normalizeAsset(trade.commissionAsset) === normalizeAsset(baseAsset)) {
      baseAssetCommission += safeNumber(trade.commission, 0);
    }
  }
  const observedFeeBpsValues = breakdown
    .map((item) => item.observedFeeBps)
    .filter((value) => Number.isFinite(value));
  const observedFeeBps = observedFeeBpsValues.length
    ? observedFeeBpsValues.reduce((total, value) => total + value, 0) / observedFeeBpsValues.length
    : null;
  return {
    feeQuote,
    feeQuoteStatus: unconvertedCount ? "partial_unconverted" : "converted",
    unconvertedCount,
    baseAssetCommission,
    breakdown,
    observedFeeBps
  };
}
