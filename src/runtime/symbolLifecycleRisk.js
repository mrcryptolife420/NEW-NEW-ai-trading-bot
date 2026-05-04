function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, num(value, min)));
}

function finite(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function ageDays(listedAt, nowMs) {
  const listedMs = new Date(listedAt || 0).getTime();
  if (!Number.isFinite(listedMs) || listedMs <= 0) {
    return null;
  }
  return Math.max(0, (nowMs - listedMs) / 86_400_000);
}

function headlineFlags(items = [], symbol = "") {
  const haystack = arr(items).map((item) => `${item.title || item.headline || item.text || item.category || ""}`.toLowerCase());
  const lowerSymbol = `${symbol || ""}`.toLowerCase();
  return {
    delisting: haystack.some((text) => text.includes("delist") || text.includes("trading halt") || text.includes("suspend")),
    listingHype: haystack.some((text) => (text.includes("listing") || text.includes("launchpool") || text.includes("new pair")) && (!lowerSymbol || text.includes(lowerSymbol.toLowerCase().replace("usdt", "")))),
    exploit: haystack.some((text) => text.includes("hack") || text.includes("exploit") || text.includes("incident"))
  };
}

export function buildSymbolLifecycleRisk({
  symbol = "unknown",
  profile = {},
  marketSnapshot = {},
  newsItems = [],
  now = new Date().toISOString(),
  config = {}
} = {}) {
  const nowMs = new Date(now).getTime();
  const listedAgeDays = ageDays(profile.listedAt || profile.firstSeenAt || profile.createdAt, Number.isFinite(nowMs) ? nowMs : Date.now());
  const book = marketSnapshot.book || {};
  const market = marketSnapshot.market || marketSnapshot;
  const stream = marketSnapshot.stream || {};
  const spreadBps = num(book.spreadBps ?? market.spreadBps, 0);
  const depthConfidence = clamp(book.depthConfidence ?? book.localBook?.depthConfidence ?? market.depthConfidence, 0, 1);
  const totalDepthNotional = Math.max(0, num(book.totalDepthNotional ?? book.localBook?.totalDepthNotional ?? market.totalDepthNotional, 0));
  const volumeZ = num(market.volumeZ ?? stream.volumeZ, 0);
  const recentTradeCount = Math.max(0, num(stream.recentTradeCount ?? book.recentTradeCount, 0));
  const spreadStability = clamp(book.spreadStabilityScore ?? market.spreadStabilityScore ?? (spreadBps > 0 ? 1 - spreadBps / 30 : 0.5), 0, 1);
  const stale = Boolean(profile.stale || marketSnapshot.stale || market.stale);
  const flags = headlineFlags(newsItems, symbol);
  const newListingDays = Math.max(1, num(config.symbolLifecycleNewListingDays, 14));
  const youngListingDays = Math.max(newListingDays, num(config.symbolLifecycleYoungListingDays, 45));
  const minDepthUsd = Math.max(1, num(config.symbolLifecycleMinDepthUsd, 45_000));
  const warnings = [];
  const requiredEvidence = [];
  let score = 0;

  if (listedAgeDays == null) {
    warnings.push("missing_listing_age");
    requiredEvidence.push("symbol_first_seen_or_listing_timestamp");
    score += 0.18;
  } else if (listedAgeDays <= newListingDays) {
    warnings.push("new_listing");
    requiredEvidence.push("longer_live_history");
    score += 0.35;
  } else if (listedAgeDays <= youngListingDays) {
    warnings.push("young_listing");
    score += 0.18;
  }
  if (volumeZ >= num(config.symbolLifecycleHypeVolumeZ, 4)) {
    warnings.push("abnormal_volume_spike");
    requiredEvidence.push("post_spike_spread_and_depth_stability");
    score += 0.2;
  }
  if (spreadBps >= num(config.symbolLifecycleWideSpreadBps, 18) || spreadStability < 0.35) {
    warnings.push("spread_instability");
    requiredEvidence.push("stable_spread_history");
    score += 0.22;
  }
  if (depthConfidence < num(config.symbolLifecycleMinDepthConfidence, 0.42) || totalDepthNotional < minDepthUsd) {
    warnings.push("depth_weakness");
    requiredEvidence.push("healthy_local_orderbook_depth");
    score += 0.24;
  }
  if (recentTradeCount <= num(config.symbolLifecycleLowTradeCount, 1)) {
    warnings.push("low_recent_trade_activity");
    score += 0.12;
  }
  if (stale) {
    warnings.push("stale_symbol_profile");
    requiredEvidence.push("fresh_profile_and_market_snapshot");
    score += 0.28;
  }
  if (flags.delisting) {
    warnings.push("delisting_or_halt_warning");
    requiredEvidence.push("operator_review_exchange_notice");
    score += 0.55;
  }
  if (flags.exploit) {
    warnings.push("token_exploit_or_incident_warning");
    requiredEvidence.push("operator_review_incident_news");
    score += 0.35;
  }
  if (flags.listingHype) {
    warnings.push("listing_hype_headline");
    score += 0.18;
  }

  const lifecycleRisk = flags.delisting
    ? "blocked"
    : score >= 0.75
    ? "blocked"
    : score >= 0.5
      ? "high"
      : score >= 0.25
        ? "watch"
        : "low";
  const sizeMultiplier = lifecycleRisk === "blocked"
    ? 0
    : lifecycleRisk === "high"
      ? 0.35
      : lifecycleRisk === "watch"
        ? 0.72
        : 1;

  return {
    symbol,
    lifecycleRisk,
    riskScore: finite(clamp(score, 0, 1)),
    warnings: [...new Set(warnings)],
    sizeMultiplier: finite(sizeMultiplier, 3),
    entryAllowedDiagnostic: lifecycleRisk !== "blocked",
    requiredEvidence: [...new Set(requiredEvidence)],
    universePenalty: finite(1 - sizeMultiplier, 3),
    profile: {
      listedAgeDays: listedAgeDays == null ? null : finite(listedAgeDays, 1),
      spreadBps: finite(spreadBps, 2),
      depthConfidence: finite(depthConfidence, 3),
      totalDepthNotional: finite(totalDepthNotional, 2),
      volumeZ: finite(volumeZ, 2),
      recentTradeCount: Math.round(recentTradeCount),
      spreadStability: finite(spreadStability, 3),
      stale
    },
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
