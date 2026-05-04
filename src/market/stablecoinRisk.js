import { clamp } from "../utils/math.js";

const DEFAULT_QUOTES = ["USDT", "USDC", "FDUSD", "DAI", "TUSD"];

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

function upper(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function lowerText(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.toLowerCase();
  }
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function unique(values) {
  return [...new Set(arr(values).filter(Boolean))];
}

function timeMs(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getSourceAt(source = {}) {
  return source.updatedAt || source.fetchedAt || source.at || source.timestamp || null;
}

function normalizePriceSources(priceSources = {}, nowMs, staleMs) {
  const sources = [];
  if (Array.isArray(priceSources)) {
    for (const source of priceSources) {
      sources.push(source);
    }
  } else if (priceSources && typeof priceSources === "object") {
    for (const [quote, source] of Object.entries(priceSources)) {
      if (Array.isArray(source)) {
        for (const item of source) sources.push({ quote, ...item });
      } else {
        sources.push({ quote, ...source });
      }
    }
  }
  return sources
    .map((source) => {
      const quote = upper(source.quote || source.asset || source.symbol?.replace(/USD[TCD]*$/, ""));
      const price = safeNumber(source.price ?? source.mid ?? source.last ?? source.close, Number.NaN);
      const at = getSourceAt(source);
      const ageMs = Number.isFinite(timeMs(at)) ? nowMs - timeMs(at) : Number.NaN;
      return {
        quote,
        price,
        at,
        ageMs,
        stale: !Number.isFinite(ageMs) || ageMs > staleMs,
        source: source.source || source.provider || "unknown"
      };
    })
    .filter((source) => source.quote && Number.isFinite(source.price));
}

function normalizeSpreadSources(spreadSources = {}) {
  const sources = [];
  if (Array.isArray(spreadSources)) {
    for (const source of spreadSources) sources.push(source);
  } else if (spreadSources && typeof spreadSources === "object") {
    for (const [quote, source] of Object.entries(spreadSources)) {
      sources.push({ quote, ...source });
    }
  }
  return sources.map((source) => ({
    quote: upper(source.quote || source.asset),
    spreadBps: Math.abs(safeNumber(source.spreadBps ?? source.crossSpreadBps ?? source.basisBps, 0)),
    volumeZ: safeNumber(source.volumeZ ?? source.abnormalVolumeZ, 0)
  })).filter((source) => source.quote);
}

function hasHeadlineRisk(headlines, quote) {
  const quoteText = quote.toLowerCase();
  return arr(headlines).some((item) => {
    const text = lowerText(item);
    return text.includes(quoteText) &&
      (text.includes("depeg") ||
        text.includes("redemption") ||
        text.includes("redeem") ||
        text.includes("insolven") ||
        text.includes("halt") ||
        text.includes("freeze") ||
        text.includes("reserve") ||
        text.includes("attestation"));
  });
}

function quoteStressFromSources({ quote, priceSources, spreadSources, headlines, config }) {
  const quotePrices = priceSources.filter((source) => source.quote === quote);
  const quoteSpreads = spreadSources.filter((source) => source.quote === quote);
  const warnings = [];
  if (!quotePrices.length) {
    warnings.push("missing_price_source");
  }
  const staleCount = quotePrices.filter((source) => source.stale).length;
  if (quotePrices.length && staleCount === quotePrices.length) {
    warnings.push("stale_price_source");
  }
  const prices = quotePrices.map((source) => source.price);
  const maxDeviationBps = prices.length
    ? Math.max(...prices.map((price) => Math.abs(price - 1) * 10_000))
    : 0;
  const spreadBps = quoteSpreads.length
    ? Math.max(...quoteSpreads.map((source) => source.spreadBps))
    : 0;
  const volumeZ = quoteSpreads.length
    ? Math.max(...quoteSpreads.map((source) => Math.abs(source.volumeZ)))
    : 0;
  const headlineRisk = hasHeadlineRisk(headlines, quote);
  if (headlineRisk) {
    warnings.push("depeg_or_redemption_headline");
  }
  if (spreadBps >= safeNumber(config.stablecoinRiskSpreadWarnBps, 18)) {
    warnings.push("stablecoin_spread_widening");
  }
  if (volumeZ >= safeNumber(config.stablecoinRiskVolumeZWarn, 3)) {
    warnings.push("abnormal_stablecoin_volume");
  }
  return {
    quote,
    depegBps: num(maxDeviationBps, 2),
    spreadBps: num(spreadBps, 2),
    volumeZ: num(volumeZ, 2),
    headlineRisk,
    stale: warnings.includes("stale_price_source"),
    missing: warnings.includes("missing_price_source"),
    warnings
  };
}

function classifyRisk(maxDepegBps, warningCount, severe, missingOnly) {
  if (missingOnly) return "unknown";
  if (severe) return "severe";
  if (maxDepegBps >= 45 || warningCount >= 3) return "elevated";
  if (maxDepegBps >= 15 || warningCount >= 1) return "mild";
  return "normal";
}

export function buildStablecoinRisk({
  priceSources = {},
  spreadSources = {},
  headlines = [],
  quoteAssets = DEFAULT_QUOTES,
  now = null,
  nowIso = null,
  config = {}
} = {}) {
  const currentTime = nowIso || now || new Date().toISOString();
  const nowMs = Number.isFinite(timeMs(currentTime)) ? timeMs(currentTime) : Date.now();
  const staleMs = Math.max(60_000, safeNumber(config.stablecoinRiskStaleMs, 10 * 60_000));
  const quotes = unique(arr(quoteAssets).length ? quoteAssets.map(upper) : DEFAULT_QUOTES);
  const normalizedPrices = normalizePriceSources(priceSources, nowMs, staleMs);
  const normalizedSpreads = normalizeSpreadSources(spreadSources);
  const affectedQuotes = [];
  const quoteSummaries = {};

  for (const quote of quotes) {
    const summary = quoteStressFromSources({
      quote,
      priceSources: normalizedPrices,
      spreadSources: normalizedSpreads,
      headlines,
      config
    });
    quoteSummaries[quote] = summary;
    if (summary.depegBps > 0 || summary.warnings.length) {
      affectedQuotes.push(quote);
    }
  }

  const depegBps = Math.max(0, ...Object.values(quoteSummaries).map((item) => safeNumber(item.depegBps, 0)));
  const severe = depegBps >= safeNumber(config.stablecoinRiskSevereDepegBps, 90) ||
    Object.values(quoteSummaries).some((item) => item.headlineRisk && item.depegBps >= safeNumber(config.stablecoinRiskHeadlineSevereBps, 35));
  const warningCodes = unique(Object.values(quoteSummaries).flatMap((item) => item.warnings));
  const hasOnlyMissing = affectedQuotes.length > 0 &&
    Object.values(quoteSummaries).every((item) => item.missing || (!item.depegBps && item.warnings.length === 0));
  const stablecoinRisk = classifyRisk(depegBps, warningCodes.length, severe, hasOnlyMissing);
  const basePenalty = stablecoinRisk === "severe"
    ? 0.45
    : stablecoinRisk === "elevated"
      ? 0.26
      : stablecoinRisk === "mild"
        ? 0.1
        : stablecoinRisk === "unknown"
          ? 0.08
          : 0;
  const entryPenalty = clamp(basePenalty + Math.min(0.16, warningCodes.length * 0.03), 0, 0.75);
  const manualReviewRecommended = stablecoinRisk === "severe" ||
    warningCodes.includes("depeg_or_redemption_headline") ||
    warningCodes.includes("stale_price_source");

  return {
    status: normalizedPrices.length ? "ready" : "degraded",
    stablecoinRisk,
    affectedQuotes: affectedQuotes.filter((quote) => {
      const item = quoteSummaries[quote];
      return item.depegBps >= 1 || item.warnings.length;
    }),
    depegBps: num(depegBps, 2),
    warnings: warningCodes,
    entryPenalty: num(entryPenalty),
    manualReviewRecommended,
    quoteSummaries,
    staleSources: normalizedPrices.filter((source) => source.stale).map((source) => `${source.quote}:${source.source}`),
    evidence: {
      priceSourceCount: normalizedPrices.length,
      spreadSourceCount: normalizedSpreads.length,
      headlineCount: arr(headlines).length,
      staleMs
    },
    safety: {
      canOnlyTighten: true,
      forceSellAllowed: false,
      forceUnlockAllowed: false,
      liveThresholdReliefAllowed: false
    },
    diagnosticsOnly: true,
    generatedAt: new Date(nowMs).toISOString()
  };
}
