import { clamp } from "../utils/math.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function num(value, digits = 4) {
  return Number(clamp(safeNumber(value, 0), -1_000_000, 1_000_000).toFixed(digits));
}

function timestampMs(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeLocalPrice({ binancePrice = null, marketSnapshot = {}, localPrice = null } = {}) {
  const book = marketSnapshot?.book || {};
  const bid = safeNumber(book.bid ?? marketSnapshot.bid, Number.NaN);
  const ask = safeNumber(book.ask ?? marketSnapshot.ask, Number.NaN);
  const mid = safeNumber(
    binancePrice?.mid ??
      localPrice?.mid ??
      book.mid ??
      marketSnapshot.mid ??
      (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : Number.NaN),
    Number.NaN
  );
  const last = safeNumber(
    binancePrice?.last ??
      localPrice?.last ??
      marketSnapshot.last ??
      marketSnapshot.close ??
      marketSnapshot.market?.close,
    Number.NaN
  );
  const price = Number.isFinite(mid) && mid > 0 ? mid : last;
  return {
    price,
    mid,
    last,
    at: binancePrice?.updatedAt || binancePrice?.at || localPrice?.updatedAt || localPrice?.at || marketSnapshot.updatedAt || marketSnapshot.cachedAt || marketSnapshot.at || null
  };
}

function normalizeReferencePrices(referencePrices = [], nowMs, staleMs) {
  const records = Array.isArray(referencePrices)
    ? referencePrices
    : Object.entries(referencePrices || {}).map(([venue, value]) => ({ venue, ...value }));
  return records
    .map((record) => {
      const bid = safeNumber(record.bid ?? record.bidPrice, Number.NaN);
      const ask = safeNumber(record.ask ?? record.askPrice, Number.NaN);
      const mid = safeNumber(
        record.mid ??
          (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : Number.NaN),
        Number.NaN
      );
      const price = safeNumber(record.price ?? record.last ?? record.close ?? mid, Number.NaN);
      const at = record.updatedAt || record.at || record.timestamp || record.fetchedAt || null;
      const ageMs = Number.isFinite(timestampMs(at)) ? nowMs - timestampMs(at) : Number.NaN;
      return {
        venue: record.venue || record.exchange || record.id || "reference",
        price,
        mid,
        at,
        ageMs,
        stale: !Number.isFinite(ageMs) || ageMs > staleMs
      };
    })
    .filter((record) => Number.isFinite(record.price) && record.price > 0);
}

function median(values) {
  const sorted = arr(values).filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values, fallback = 0) {
  const filtered = arr(values).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((total, value) => total + value, 0) / filtered.length : fallback;
}

function divergenceBps(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= 0) {
    return Number.NaN;
  }
  return Math.abs(left - right) / right * 10_000;
}

export function buildCrossExchangeDivergence({
  symbol = null,
  binancePrice = null,
  localPrice = null,
  marketSnapshot = {},
  referencePrices = [],
  now = null,
  nowIso = null,
  config = {}
} = {}) {
  const currentTime = nowIso || now || new Date().toISOString();
  const nowMs = Number.isFinite(timestampMs(currentTime)) ? timestampMs(currentTime) : Date.now();
  const staleMs = Math.max(60_000, safeNumber(config.crossExchangeReferenceStaleMs, 5 * 60_000));
  const maxDivergenceBps = Math.max(1, safeNumber(config.crossExchangeMaxDivergenceBps, 18));
  const severeDivergenceBps = Math.max(maxDivergenceBps, safeNumber(config.crossExchangeSevereDivergenceBps, 55));
  const minReferences = Math.max(1, safeNumber(config.crossExchangeMinReferences, 2));
  const outlierBps = Math.max(severeDivergenceBps, safeNumber(config.crossExchangeOutlierBps, 150));
  const local = normalizeLocalPrice({ binancePrice, localPrice, marketSnapshot });
  const references = normalizeReferencePrices(referencePrices, nowMs, staleMs);
  const warnings = [];

  if (!Number.isFinite(local.price) || local.price <= 0) {
    warnings.push("missing_binance_local_price");
  }
  if (!references.length) {
    warnings.push("missing_reference_prices");
  }
  const staleSources = references.filter((record) => record.stale).map((record) => record.venue);
  if (staleSources.length) {
    warnings.push("stale_reference_price");
  }

  const freshReferences = references.filter((record) => !record.stale);
  const referenceMedian = median(freshReferences.map((record) => record.price));
  const usableReferences = Number.isFinite(referenceMedian)
    ? freshReferences.filter((record) => divergenceBps(record.price, referenceMedian) <= outlierBps)
    : [];
  const outlierReferences = Number.isFinite(referenceMedian)
    ? freshReferences.filter((record) => divergenceBps(record.price, referenceMedian) > outlierBps)
    : [];
  if (outlierReferences.length) {
    warnings.push("outlier_reference_filtered");
  }

  const referenceMid = average(usableReferences.map((record) => record.price), Number.NaN);
  const divergence = divergenceBps(local.price, referenceMid);
  const referenceCount = usableReferences.length;
  const enoughReferences = referenceCount >= minReferences;
  if (references.length && !enoughReferences) {
    warnings.push("insufficient_reference_count");
  }
  if (Number.isFinite(divergence) && enoughReferences && divergence >= severeDivergenceBps) {
    warnings.push("severe_cross_exchange_divergence");
  } else if (Number.isFinite(divergence) && enoughReferences && divergence > maxDivergenceBps) {
    warnings.push("cross_exchange_divergence_watch");
  }

  const unavailable = !Number.isFinite(local.price) || !references.length;
  const priceSanityStatus = unavailable
    ? "unavailable"
    : staleSources.length === references.length
      ? "stale"
      : !enoughReferences
        ? "degraded"
        : divergence >= severeDivergenceBps
          ? "diverged"
          : divergence > maxDivergenceBps
            ? "watch"
            : "aligned";
  const confidence = unavailable
    ? 0
    : clamp(
      0.35 +
        Math.min(referenceCount, 5) * 0.1 -
        Math.min(0.35, safeNumber(divergence, maxDivergenceBps) / Math.max(severeDivergenceBps, 1) * 0.35) -
        staleSources.length * 0.08,
      0,
      1
    );
  const entryPenalty = priceSanityStatus === "diverged"
    ? 0.36
    : priceSanityStatus === "watch"
      ? 0.14
      : ["stale", "degraded", "unavailable"].includes(priceSanityStatus)
        ? 0.08
        : 0;

  return {
    symbol,
    status: priceSanityStatus === "aligned" ? "ready" : priceSanityStatus,
    priceSanityStatus,
    divergenceBps: Number.isFinite(divergence) ? num(divergence, 2) : null,
    referenceCount,
    confidence: num(confidence),
    warnings: [...new Set(warnings)],
    staleSources,
    entryPenalty: num(entryPenalty),
    manualReviewRecommended: priceSanityStatus === "diverged",
    localPrice: Number.isFinite(local.price) ? num(local.price, 8) : null,
    referenceMid: Number.isFinite(referenceMid) ? num(referenceMid, 8) : null,
    references: usableReferences.map((record) => ({
      venue: record.venue,
      price: num(record.price, 8),
      at: record.at,
      divergenceBps: Number.isFinite(local.price) ? num(divergenceBps(local.price, record.price), 2) : null
    })),
    outlierReferences: outlierReferences.map((record) => record.venue),
    safety: {
      canOnlyTighten: true,
      externalProviderRequired: false,
      forceUnlockAllowed: false,
      liveThresholdReliefAllowed: false
    },
    diagnosticsOnly: true,
    generatedAt: new Date(nowMs).toISOString()
  };
}
