import fs from "node:fs";
import path from "node:path";
import { RiskManager } from "../src/risk/riskManager.js";

function parseJsonFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  let content = buffer.toString("utf8");
  if (content.includes("\u0000")) {
    content = buffer.toString("utf16le");
  }
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return JSON.parse(content);
}

function topCounts(map, limit = 8) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => ({ id, count }));
}

function summarizeBlockedSetups(report = {}) {
  const items = Array.isArray(report.recentBlockedSetups) ? report.recentBlockedSetups : [];
  const reasons = {};
  const threshold = {};
  const sizing = {};
  const root = {};
  for (const item of items) {
    for (const reason of item.reasons || []) {
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
    const diagnostics = item.entryDiagnostics || {};
    if (diagnostics.rootBlocker) {
      root[diagnostics.rootBlocker] = (root[diagnostics.rootBlocker] || 0) + 1;
    }
    for (const contributor of diagnostics.thresholds?.rankedContributors || []) {
      threshold[contributor.id] = (threshold[contributor.id] || 0) + Math.abs(contributor.value || 0);
    }
    for (const contributor of diagnostics.sizing?.topCompressionContributors || []) {
      sizing[contributor.id] = (sizing[contributor.id] || 0) + (contributor.effect || 0);
    }
  }
  return {
    blockedCount: items.length,
    topReasons: topCounts(reasons, 10),
    topRootBlockers: topCounts(root, 6),
    topThresholdInflation: topCounts(threshold, 8),
    topSizeCompression: topCounts(sizing, 8)
  };
}

function extractGateRows(report = {}) {
  const items = Array.isArray(report.recentBlockedSetups) ? report.recentBlockedSetups : [];
  return items.map((item) => {
    const diagnostics = item.entryDiagnostics || {};
    return {
      key: `${item.symbol || "unknown"}::${item.strategy || item.setupStyle || "unknown"}`,
      symbol: item.symbol || null,
      strategy: item.strategy || null,
      probability: item.probability ?? diagnostics.probability ?? null,
      adjudicatedProbability: diagnostics.adjudicatedProbability ?? null,
      alphaThreshold: item.alphaThreshold ?? diagnostics.thresholds?.alphaThreshold ?? null,
      effectiveThreshold: item.threshold ?? diagnostics.thresholds?.effectiveThreshold ?? null,
      rootBlocker: diagnostics.rootBlocker || (item.reasons || [])[0] || null,
      topThresholdContributors: (diagnostics.thresholds?.rankedContributors || []).slice(0, 3),
      topSizeCompressionContributors: (diagnostics.sizing?.topCompressionContributors || []).slice(0, 3),
      allow: Boolean(item.allow),
      reasons: item.reasons || []
    };
  });
}

function compareGateRows(beforeRows = [], afterRows = []) {
  const beforeMap = new Map(beforeRows.map((row) => [row.key, row]));
  const afterMap = new Map(afterRows.map((row) => [row.key, row]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];
  return keys.map((key) => ({
    key,
    before: beforeMap.get(key) || null,
    after: afterMap.get(key) || null
  }));
}

function makeReplayConfig(overrides = {}) {
  return {
    botMode: "paper",
    startingCash: 10000,
    maxOpenPositions: 5,
    modelThreshold: 0.56,
    minModelConfidence: 0.56,
    strategyMinConfidence: 0.55,
    riskPerTrade: 0.01,
    maxPositionFraction: 0.1,
    minTradeUsdt: 25,
    paperMinTradeUsdt: 20,
    maxSpreadBps: 20,
    maxRealizedVolPct: 0.035,
    maxDailyDrawdown: 0.08,
    stopLossPct: 0.018,
    takeProfitPct: 0.03,
    entryCooldownMinutes: 0,
    paperExplorationEnabled: false,
    paperRecoveryProbeEnabled: false,
    enableConfidenceAdjudication: true,
    ...overrides
  };
}

function fixturePayload({
  symbol = "ETHUSDT",
  probability = 0.52,
  rawProbability = 0.55,
  disagreement = 0.05,
  featureTrustPenalty = 0.06,
  featureSource = "pruning_drop_candidate",
  setupScore = 0.68,
  signalScore = 0.67,
  dataScore = 0.6,
  structureRisk = 0.16,
  contextRisk = 0.08
} = {}) {
  return {
    symbol,
    score: {
      probability,
      rawProbability,
      calibrationConfidence: 0.69,
      disagreement,
      shouldAbstain: false,
      calibrator: { warmupProgress: 0.95, globalConfidence: 0.92 },
      transformer: { probability: probability - 0.01, confidence: 0.2 }
    },
    marketSnapshot: {
      book: { spreadBps: 2.4, bookPressure: 0.14, microPriceEdgeBps: 0.2, depthConfidence: 0.76, mid: 2400 },
      market: {
        close: 2400,
        lastPrice: 2400,
        realizedVolPct: 0.012,
        atrPct: 0.008,
        bearishPatternScore: contextRisk * 0.4,
        bullishPatternScore: 0.12,
        dominantPattern: "none",
        bullishBosActive: 1,
        bosStrengthScore: 0.58,
        fvgRespectScore: 0.55,
        cvdConfirmationScore: 0.54,
        cvdDivergenceScore: 0.07,
        breakoutFollowThroughScore: 0.53,
        volumeAcceptanceScore: 0.64,
        anchoredVwapAcceptanceScore: 0.66,
        trendQualityScore: 0.63,
        closeLocationQuality: 0.62
      }
    },
    newsSummary: { riskScore: contextRisk, sentimentScore: 0.05, eventBullishScore: 0.01, eventBearishScore: 0, socialSentiment: 0.02, socialRisk: 0 },
    announcementSummary: { riskScore: contextRisk * 0.5, sentimentScore: 0 },
    marketStructureSummary: { riskScore: structureRisk, signalScore: 0.1, crowdingBias: 0.02, fundingRate: 0.00001, liquidationImbalance: 0, liquidationIntensity: 0 },
    marketSentimentSummary: { riskScore: 0.22, contrarianScore: 0.11 },
    volatilitySummary: { riskScore: 0.26, ivPremium: 2.2 },
    calendarSummary: { riskScore: 0.06, bullishScore: 0, urgencyScore: 0.01 },
    committeeSummary: { agreement: 0.67, probability: probability - 0.005, netScore: 0.01, sizeMultiplier: 1, confidence: 0.72, vetoes: [] },
    rlAdvice: { sizeMultiplier: 1, confidence: 0.4, expectedReward: 0.012 },
    strategySummary: {
      activeStrategy: "ema_trend",
      family: "trend_following",
      fitScore: setupScore,
      confidence: setupScore,
      blockers: [],
      agreementGap: 0.03,
      optimizer: { sampleSize: 0, sampleConfidence: 0 }
    },
    signalQualitySummary: { overallScore: signalScore, structureQuality: Math.max(0.5, signalScore - 0.06), executionViability: Math.max(0.5, signalScore - 0.08) },
    dataQualitySummary: { overallScore: dataScore },
    sessionSummary: { blockerReasons: [], lowLiquidity: false, riskScore: 0.03, sizeMultiplier: 1 },
    driftSummary: { blockerReasons: [], severity: 0.14 },
    selfHealState: { mode: "normal", active: false, sizeMultiplier: 1, thresholdPenalty: 0, lowRiskOnly: false, learningAllowed: true },
    metaSummary: { action: "pass", score: 0.65, dailyTradeCount: 0, sizeMultiplier: 1, thresholdPenalty: 0.012 },
    timeframeSummary: { alignmentScore: 0.67, blockerReasons: [] },
    runtime: { openPositions: [] },
    journal: { trades: [] },
    balance: { quoteFree: 14000, equity: 14000 },
    symbolStats: { avgPnlPct: 0.01 },
    portfolioSummary: { sizeMultiplier: 1, maxCorrelation: 0, reasons: [], currentExposure: 0, totalEquity: 14000 },
    symbolRules: {
      minNotional: 5,
      minQty: 0.001,
      stepSize: 0.001,
      tickSize: 0.01
    },
    regimeSummary: { regime: "trend", confidence: 0.71 },
    offlineLearningGuidance: {
      active: true,
      featureTrustPenalty,
      featurePenalty: featureTrustPenalty,
      executionCaution: 0.02,
      featurePressureSources: [{ source: featureSource, penalty: Math.max(0.014, featureTrustPenalty * 0.25) }],
      impactedFeatureGroups: [{ group: "momentum", penalty: Math.max(0.012, featureTrustPenalty * 0.2) }]
    },
    nowIso: "2026-03-08T12:00:00.000Z"
  };
}

function runFixtureBatch(configOverrides = {}) {
  const manager = new RiskManager(makeReplayConfig(configOverrides));
  const fixtures = [
    { id: "feature_trust_near_miss", payload: fixturePayload({ probability: 0.522, rawProbability: 0.558, featureTrustPenalty: 0.085, featureSource: "pruning_drop_candidate" }) },
    { id: "pruning_guard_echo", payload: fixturePayload({ probability: 0.519, rawProbability: 0.553, featureTrustPenalty: 0.078, featureSource: "pruning_guard_only" }) },
    { id: "inverse_attribution_echo", payload: fixturePayload({ probability: 0.517, rawProbability: 0.549, featureTrustPenalty: 0.073, featureSource: "inverse_attribution" }) },
    { id: "threshold_stack_near_miss", payload: fixturePayload({ probability: 0.512, rawProbability: 0.541, featureTrustPenalty: 0.03 }) },
    { id: "true_weak_reject", payload: fixturePayload({ probability: 0.36, rawProbability: 0.38, disagreement: 0.19, featureTrustPenalty: 0.11, setupScore: 0.44, signalScore: 0.42, dataScore: 0.46, structureRisk: 0.58, contextRisk: 0.34 }) },
    { id: "high_risk_context_reject", payload: fixturePayload({ probability: 0.49, rawProbability: 0.53, disagreement: 0.18, featureTrustPenalty: 0.06, setupScore: 0.58, signalScore: 0.55, dataScore: 0.54, structureRisk: 0.76, contextRisk: 0.31 }) }
  ];
  return fixtures.map(({ id, payload }) => {
    const decision = manager.evaluateEntry(payload);
    const diagnostics = decision.entryDiagnostics || {};
    return {
      id,
      allow: decision.allow,
      alphaStatus: decision.decisionBoundary?.alpha?.status || null,
      probability: diagnostics.probability ?? null,
      adjudicatedProbability: diagnostics.adjudicatedProbability ?? null,
      alphaThreshold: diagnostics.thresholds?.alphaThreshold ?? null,
      effectiveThreshold: diagnostics.thresholds?.effectiveThreshold ?? null,
      topThresholdContributors: (diagnostics.thresholds?.rankedContributors || []).slice(0, 3),
      rootBlocker: diagnostics.rootBlocker || null,
      topSizeCompressionContributors: (diagnostics.sizing?.topCompressionContributors || []).slice(0, 3),
      reasons: decision.reasons || []
    };
  });
}

function summarizeFixtureOutcomes(rows = []) {
  return {
    total: rows.length,
    allowed: rows.filter((item) => item.allow).length,
    alphaWanted: rows.filter((item) => item.alphaStatus === "wanted_trade").length,
    modelLowBlocks: rows.filter((item) => item.reasons.includes("model_confidence_too_low")).length,
    sizeMinimumBlocks: rows.filter((item) => item.reasons.includes("trade_size_below_minimum")).length,
    sizeInvalidBlocks: rows.filter((item) => item.reasons.includes("trade_size_invalid")).length
  };
}

function main() {
  const cwd = process.cwd();
  const beforePathArg = process.argv[2] || "strict_after_report.json";
  const afterPathArg = process.argv[3] || "strict_after_report_v2.json";
  const beforePath = path.resolve(cwd, beforePathArg);
  const afterPath = path.resolve(cwd, afterPathArg);

  const output = {
    snapshots: null,
    replay: null
  };

  if (fs.existsSync(beforePath) && fs.existsSync(afterPath)) {
    const beforeReport = parseJsonFile(beforePath);
    const afterReport = parseJsonFile(afterPath);
    const beforeRows = extractGateRows(beforeReport);
    const afterRows = extractGateRows(afterReport);
    output.snapshots = {
      beforeFile: beforePathArg,
      afterFile: afterPathArg,
      before: summarizeBlockedSetups(beforeReport),
      after: summarizeBlockedSetups(afterReport),
      gateReplay: compareGateRows(beforeRows, afterRows).slice(0, 20)
    };
  }

  const baselineRows = runFixtureBatch({
    enableFeatureTrustEchoDampening: false,
    enableStrictQualitySizeLift: false
  });
  const improvedRows = runFixtureBatch({
    enableFeatureTrustEchoDampening: true,
    enableStrictQualitySizeLift: true
  });
  output.replay = {
    baseline: {
      summary: summarizeFixtureOutcomes(baselineRows),
      rows: baselineRows
    },
    improved: {
      summary: summarizeFixtureOutcomes(improvedRows),
      rows: improvedRows
    }
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
