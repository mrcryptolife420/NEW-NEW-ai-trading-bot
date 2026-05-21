import { clampNumber, roundNumber, safeNumber } from "../utils/numberSafety.js";

function scoreFrame(frame = {}) {
  const trend = safeNumber(frame.trendScore ?? frame.trend ?? frame.momentum, 0);
  const momentum = safeNumber(frame.momentumScore ?? frame.momentum, trend);
  const volatilityPenalty = Math.max(0, safeNumber(frame.volatilityRisk ?? frame.chopRisk ?? 0, 0));
  const orderflow = safeNumber(frame.orderflowScore ?? frame.orderflow ?? 0, 0);
  return clampNumber(0.42 * trend + 0.28 * momentum + 0.18 * orderflow + 0.12 * (1 - volatilityPenalty), 0, 1, 0.5);
}

export function buildMultiTimeframeConfluence({ frames = {}, minAgreement = 0.52 } = {}) {
  const entries = Object.entries(frames || {}).filter(([, value]) => value && typeof value === "object");
  if (!entries.length) {
    return {
      confluenceScore: 0,
      confluenceDrivers: [],
      timeframeDisagreements: ["missing_timeframes"],
      status: "insufficient_data",
      paperOnly: true,
      livePolicy: "diagnostics_or_additional_blocker_only"
    };
  }
  const scored = entries.map(([timeframe, frame]) => ({ timeframe, score: scoreFrame(frame), frame }));
  const confluenceScore = roundNumber(scored.reduce((sum, item) => sum + item.score, 0) / scored.length, 4);
  const confluenceDrivers = scored
    .slice()
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((item) => ({ timeframe: item.timeframe, score: roundNumber(item.score, 4) }));
  const direction = confluenceScore >= minAgreement ? "bullish" : confluenceScore <= 1 - minAgreement ? "bearish" : "mixed";
  const timeframeDisagreements = scored
    .filter((item) => direction === "bullish" ? item.score < 0.45 : direction === "bearish" ? item.score > 0.55 : Math.abs(item.score - confluenceScore) > 0.22)
    .map((item) => item.timeframe);
  return {
    confluenceScore,
    confluenceDrivers,
    timeframeDisagreements,
    status: timeframeDisagreements.length ? "mixed" : "aligned",
    direction,
    paperOnly: true,
    livePolicy: "diagnostics_or_additional_blocker_only"
  };
}

export function attachMultiTimeframeConfluence(candidate = {}, context = {}) {
  const frames = candidate.timeframes || candidate.multiTimeframe || context.timeframes || context.multiTimeframe || {};
  const confluence = buildMultiTimeframeConfluence({ frames, minAgreement: context.minAgreement });
  return {
    ...candidate,
    confluenceScore: confluence.confluenceScore,
    confluenceDrivers: confluence.confluenceDrivers,
    timeframeDisagreements: confluence.timeframeDisagreements,
    multiTimeframeConfluence: confluence
  };
}
