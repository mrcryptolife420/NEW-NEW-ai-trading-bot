import { buildFundingOiMatrix } from "./derivativesMatrix.js";

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

function ageMs(at, now) {
  const timestamp = Date.parse(at || "");
  const current = Date.parse(now || "");
  if (!Number.isFinite(timestamp) || !Number.isFinite(current)) {
    return null;
  }
  return Math.max(0, current - timestamp);
}

function classifyFunding(rate) {
  if (rate >= 0.00075) {
    return "crowded_long";
  }
  if (rate <= -0.00055) {
    return "short_heavy";
  }
  if (Math.abs(rate) >= 0.00035) {
    return "elevated";
  }
  return "neutral";
}

function classifyOi(deltaPct, accelerationPct) {
  if (deltaPct >= 0.025 && accelerationPct >= 0) {
    return "rising";
  }
  if (deltaPct <= -0.02 || accelerationPct <= -0.025) {
    return "falling";
  }
  return "flat";
}

function classifyBasis(bps, regime = null) {
  if (regime && regime !== "unknown") {
    return regime;
  }
  if (bps >= 8) {
    return "contango";
  }
  if (bps <= -8) {
    return "backwardation";
  }
  return "neutral";
}

export function buildDerivativesContext({
  providerSummary = {},
  marketStructureSummary = {},
  nowIso = new Date().toISOString(),
  maxAgeMs = 15 * 60_000
} = {}) {
  const provider = providerSummary && typeof providerSummary === "object" ? providerSummary : {};
  const providerData = provider?.data || {};
  const fundingRate = num(providerData.funding?.rate ?? marketStructureSummary.fundingRate, 0);
  const fundingAcceleration = num(providerData.funding?.acceleration ?? marketStructureSummary.fundingAcceleration, 0);
  const openInterestDeltaPct = num(
    providerData.openInterest?.deltaPct ?? marketStructureSummary.openInterestChangePct,
    0
  );
  const openInterestAccelerationPct = num(providerData.openInterest?.acceleration, 0);
  const basisBps = num(providerData.basis?.bps ?? marketStructureSummary.basisBps, 0);
  const basisSlopeBps = num(providerData.basis?.slopeBps, 0);
  const liquidationRisk = clamp(
    num(providerData.liquidation?.trapRisk ?? marketStructureSummary.liquidationTrapRisk, 0) * 0.55 +
      num(providerData.liquidation?.magnetStrength ?? marketStructureSummary.liquidationMagnetStrength, 0) * 0.45,
    0,
    1
  );
  const takerImbalance = num(
    providerData.takerImbalance?.medium ?? marketStructureSummary.takerImbalance,
    0
  );
  const matrix = buildFundingOiMatrix({
    fundingRate,
    fundingAcceleration,
    openInterestDeltaPct,
    openInterestAccelerationPct,
    basisBps,
    basisSlopeBps,
    priceChangePct: num(marketStructureSummary.priceChangePct, 0),
    takerImbalance
  });
  const observed = [
    provider.status === "ready" || provider.status === "degraded",
    Number.isFinite(Number(marketStructureSummary.fundingRate)),
    Number.isFinite(Number(marketStructureSummary.basisBps)),
    Number.isFinite(Number(marketStructureSummary.openInterestChangePct)),
    liquidationRisk > 0
  ].filter(Boolean).length;
  const updatedAt = provider.updatedAt || provider.lastUpdatedAt || marketStructureSummary.lastUpdatedAt || null;
  const sourceAgeMs = ageMs(updatedAt, nowIso);
  const warnings = [];
  if (provider.status === "disabled") {
    warnings.push("derivatives_provider_disabled");
  }
  if (observed === 0) {
    warnings.push("derivatives_data_missing");
  }
  if (sourceAgeMs !== null && sourceAgeMs > maxAgeMs) {
    warnings.push("derivatives_data_stale");
  }
  if (Math.abs(fundingRate) >= 0.00075) {
    warnings.push("funding_extreme");
  }
  if (basisBps <= -8) {
    warnings.push("negative_basis");
  }
  if (liquidationRisk >= 0.55) {
    warnings.push("liquidation_risk_elevated");
  }
  const confidence = clamp(
    (provider.status === "ready" ? 0.42 : provider.status === "degraded" ? 0.24 : 0.08) +
      observed * 0.1 -
      (warnings.includes("derivatives_data_stale") ? 0.22 : 0),
    0,
    1
  );
  const status = warnings.includes("derivatives_data_missing")
    ? "unavailable"
    : warnings.includes("derivatives_data_stale")
      ? "stale"
      : confidence >= 0.55
        ? "ready"
        : "degraded";
  return {
    status,
    fundingPressure: classifyFunding(fundingRate),
    openInterestTrend: classifyOi(openInterestDeltaPct, openInterestAccelerationPct),
    basisState: classifyBasis(basisBps, providerData.basis?.regime),
    liquidationRisk,
    warnings,
    confidence,
    fundingOiMatrix: matrix,
    diagnosticsOnly: true,
    livePolicy: "diagnostics_or_conservative_risk_only",
    missingDataBlocksLive: false,
    sourceAgeMs,
    updatedAt,
    inputs: {
      fundingRate,
      fundingAcceleration,
      openInterestDeltaPct,
      openInterestAccelerationPct,
      basisBps,
      basisSlopeBps,
      takerImbalance,
      observedSignals: observed,
      providerWarnings: arr(provider.warnings)
    }
  };
}
