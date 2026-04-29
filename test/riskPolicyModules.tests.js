import { buildSymbolRules } from "../src/binance/symbolFilters.js";
import { RiskManager } from "../src/risk/riskManager.js";
import { buildEdgeScore } from "../src/risk/policies/alphaQualityPolicy.js";
import { buildPermissioningScore } from "../src/risk/policies/governancePolicy.js";
import { applyHardSafetyPolicy } from "../src/risk/policies/hardSafetyPolicy.js";
import { buildSizingPolicySummary } from "../src/risk/policies/sizingPolicy.js";
import { resolvePolicyProfile } from "../src/risk/policyProfiles.js";
import { buildSimplifiedConfidenceAdjudication } from "../src/risk/confidenceAdjudication.js";

function buildTestRules(symbol = "BTCUSDT") {
  return buildSymbolRules({
    symbols: [{
      symbol,
      status: "TRADING",
      baseAsset: symbol.replace("USDT", ""),
      quoteAsset: "USDT",
      filters: [
        { filterType: "LOT_SIZE", minQty: "0.0001", maxQty: "100000", stepSize: "0.0001" },
        { filterType: "MIN_NOTIONAL", minNotional: "5" },
        { filterType: "PRICE_FILTER", minPrice: "0.01", maxPrice: "1000000", tickSize: "0.01" }
      ]
    }]
  })[symbol];
}

export async function registerRiskPolicyModuleTests({
  runCheck,
  assert,
  makeConfig
}) {
  await runCheck("hard safety policy surfaces exchange freeze and ambiguous execution intent", async () => {
    const result = applyHardSafetyPolicy({
      symbol: "BTCUSDT",
      runtime: {
        exchangeSafety: {
          globalFreezeEntries: true,
          blockedSymbols: [{ symbol: "BTCUSDT", reason: "exchange_truth_freeze" }]
        },
        orderLifecycle: {
          executionIntentLedger: {
            unresolvedIntentIds: ["i1"],
            intents: {
              i1: {
                id: "i1",
                status: "ambiguous",
                symbol: "BTCUSDT",
                scope: "symbol"
              }
            }
          }
        }
      }
    });

    assert.equal(result.hardSafetyBlocked, true);
    assert.ok(result.reasons.includes("exchange_safety_blocked"));
    assert.ok(result.reasons.includes("execution_intent_ambiguous"));
    assert.equal(result.primaryReason, "exchange_safety_blocked");
  });

  await runCheck("policy modules expose bounded edge and permissioning scores", async () => {
    const policyProfile = resolvePolicyProfile({
      botMode: "paper",
      strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
      regimeSummary: { regime: "trend" },
      sessionSummary: { session: "us" },
      marketConditionSummary: { conditionId: "breakout_release" }
    });
    const edge = buildEdgeScore({
      score: { probability: 0.66, rawProbability: 0.69 },
      adjudicatedProbability: 0.68,
      threshold: 0.58,
      alphaThreshold: 0.56,
      setupQuality: { score: 0.71 },
      signalQualitySummary: { overallScore: 0.69 },
      confidenceBreakdown: { overallConfidence: 0.66 },
      expectedNetEdge: { expectancyScore: 0.63 },
      lowConfidencePressure: { edgeToThreshold: -0.01 },
      policyProfile,
      botMode: "paper"
    });
    const permissioning = buildPermissioningScore({
      reasons: ["meta_neural_caution"],
      permissioningSummary: {
        hardSafetyBlocked: false,
        governanceReasons: ["meta_neural_caution"],
        executionReasons: [],
        portfolioReasons: [],
        alphaQualityReasons: [],
        primaryRootBlocker: "meta_neural_caution"
      },
      capitalGovernor: { blocked: false, allowProbeEntries: true },
      entryMode: "paper_exploration",
      learningLane: "probe",
      missedTradeTuningApplied: { paperProbeEligible: true },
      policyProfile,
      botMode: "paper"
    });
    const sizing = buildSizingPolicySummary({
      groupedSizing: {
        baseBudget: 25,
        groups: [
          { id: "alpha_conviction", multiplier: 0.94 },
          { id: "execution_pressure", multiplier: 0.88 },
          { id: "portfolio_pressure", multiplier: 0.82 },
          { id: "governance_pressure", multiplier: 0.86 },
          { id: "paper_bootstrap_floor", multiplier: 1.04 }
        ]
      },
      finalQuoteAmount: 11.2,
      effectiveMinTradeUsdt: 10,
      meaningfulSizeFloor: 14,
      paperSizeFloorReason: "bounded_paper_floor",
      entryMode: "paper_exploration",
      policyProfile
    });

    assert.ok(edge.edgeScore > 0.5);
    assert.ok(permissioning.permissioningScore > 0.3);
    assert.equal(permissioning.probeEligible, true);
    assert.equal(sizing.paperBootstrapFloorLift.active, true);
    assert.ok(sizing.components.paperBootstrap);
    assert.ok((edge.profileAlphaEdgeBoost || 0) > 0);
    assert.ok((permissioning.governanceDragBias || 0) >= 0);
    assert.equal(sizing.policyProfile.status, "scoped");
  });

  await runCheck("policy profile resolution falls back cleanly and dampens live mode", async () => {
    const paper = resolvePolicyProfile({
      botMode: "paper",
      strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
      regimeSummary: { regime: "trend" },
      sessionSummary: { session: "us" },
      marketConditionSummary: { conditionId: "breakout_release" }
    });
    const live = resolvePolicyProfile({
      botMode: "live",
      strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
      regimeSummary: { regime: "trend" },
      sessionSummary: { session: "us" },
      marketConditionSummary: { conditionId: "breakout_release" }
    });
    const fallback = resolvePolicyProfile({
      botMode: "paper",
      strategySummary: { family: "unknown_family", activeStrategy: "unknown_strategy" },
      regimeSummary: { regime: "unknown_regime" },
      sessionSummary: { session: "unknown" },
      marketConditionSummary: { conditionId: "unknown_condition" }
    });

    assert.equal(paper.status, "scoped");
    assert.equal(fallback.status, "default");
    assert.ok(Math.abs(live.profile.thresholdShift) <= Math.abs(paper.profile.thresholdShift));
    assert.ok(live.profile.sizeBias <= paper.profile.sizeBias);
  });

  await runCheck("simplified confidence adjudication keeps paper relief out of live and hard safety paths", async () => {
    const paper = buildSimplifiedConfidenceAdjudication({
      score: { probability: 0.56, rawProbability: 0.61 },
      threshold: 0.6,
      baseThreshold: 0.54,
      alphaThreshold: 0.56,
      lowConfidencePressure: {
        primaryDriver: "feature_trust",
        thresholdPenaltyStack: 0.05,
        featureTrustPenalty: 0.04,
        executionCaution: 0.01,
        reliefEligible: true
      },
      setupQuality: { score: 0.74 },
      signalQualitySummary: { overallScore: 0.72 },
      dataQualitySummary: { overallScore: 0.68 },
      confidenceBreakdown: { executionConfidence: 0.7, overallConfidence: 0.69 },
      reasons: [],
      botMode: "paper"
    });
    const live = buildSimplifiedConfidenceAdjudication({
      score: { probability: 0.56, rawProbability: 0.61 },
      threshold: 0.6,
      baseThreshold: 0.54,
      alphaThreshold: 0.56,
      lowConfidencePressure: {
        primaryDriver: "feature_trust",
        thresholdPenaltyStack: 0.05,
        featureTrustPenalty: 0.04,
        executionCaution: 0.01,
        reliefEligible: true
      },
      setupQuality: { score: 0.74 },
      signalQualitySummary: { overallScore: 0.72 },
      dataQualitySummary: { overallScore: 0.68 },
      confidenceBreakdown: { executionConfidence: 0.7, overallConfidence: 0.69 },
      reasons: [],
      botMode: "live"
    });
    const blocked = buildSimplifiedConfidenceAdjudication({
      score: { probability: 0.56, rawProbability: 0.61 },
      threshold: 0.6,
      baseThreshold: 0.54,
      alphaThreshold: 0.56,
      lowConfidencePressure: { primaryDriver: "feature_trust", reliefEligible: true },
      setupQuality: { score: 0.74 },
      signalQualitySummary: { overallScore: 0.72 },
      dataQualitySummary: { overallScore: 0.68 },
      confidenceBreakdown: { executionConfidence: 0.7, overallConfidence: 0.69 },
      reasons: ["exchange_safety_blocked"],
      botMode: "paper"
    });

    assert.ok(paper.paperRelief > 0);
    assert.equal(live.paperRelief, 0);
    assert.equal(blocked.paperReliefEligible, false);
    assert.equal(blocked.reliefBlockedByHardSafety, true);
    assert.ok(paper.finalProbability >= paper.calibratedProbability);
  });

  await runCheck("risk manager keeps hard safety as root blocker while exposing decision scores", async () => {
    const manager = new RiskManager(makeConfig({
      botMode: "paper",
      modelThreshold: 0.55,
      minModelConfidence: 0.55
    }));
    const decision = manager.evaluateEntry({
      symbol: "BTCUSDT",
      score: {
        probability: 0.49,
        rawProbability: 0.5,
        confidence: 0.44,
        calibrationConfidence: 0.42,
        disagreement: 0.12,
        shouldAbstain: false
      },
      marketSnapshot: {
        market: { realizedVolPct: 0.018, atrPct: 0.008, bullishPatternScore: 0.2, bearishPatternScore: 0.08 },
        book: { mid: 100, bid: 99.95, ask: 100.05, spreadBps: 2, bookPressure: 0.16, depthConfidence: 0.8 }
      },
      newsSummary: { riskScore: 0.04, sentimentScore: 0.02, headlines: [] },
      strategySummary: { family: "trend_following", activeStrategy: "ema_trend", fitScore: 0.61, blockers: [] },
      sessionSummary: {},
      selfHealState: {},
      committeeSummary: { agreement: 0.7, netScore: 0.08 },
      timeframeSummary: { alignmentScore: 0.7, blockerReasons: [], enabled: true },
      pairHealthSummary: { score: 0.72 },
      onChainLiteSummary: {},
      divergenceSummary: { averageScore: 0.06, leadBlocker: { status: "clear" } },
      qualityQuorumSummary: {},
      executionCostSummary: {},
      strategyRetirementSummary: {},
      capitalGovernorSummary: { status: "ready", allowEntries: true, sizeMultiplier: 1 },
      runtime: {
        openPositions: [],
        exchangeSafety: { globalFreezeEntries: true, blockedSymbols: [] }
      },
      journal: { trades: [], scaleOuts: [], equitySnapshots: [] },
      balance: { quoteFree: 10000 },
      symbolStats: {},
      portfolioSummary: { reasons: [], advisoryReasons: [], dominantCluster: "majors", maxCorrelation: 0.12 },
      regimeSummary: { regime: "trend" },
      thresholdTuningSummary: {},
      parameterGovernorSummary: {},
      capitalLadderSummary: {},
      nowIso: "2026-04-22T11:30:00.000Z",
      venueConfirmationSummary: {},
      strategyMetaSummary: {},
      strategyAllocationSummary: {},
      baselineCoreSummary: {},
      paperLearningGuidance: {},
      offlineLearningGuidance: {},
      exchangeCapabilitiesSummary: {},
      symbolRules: buildTestRules("BTCUSDT")
    });

    assert.equal(decision.allow, false);
    assert.equal(decision.permissioningSummary.primaryRootBlocker, "exchange_safety_blocked");
    assert.equal(decision.entryDiagnostics.rootBlocker, "exchange_safety_blocked");
    assert.ok(decision.decisionScores.edge.edgeScore >= 0 && decision.decisionScores.edge.edgeScore <= 1);
    assert.ok(decision.decisionScores.permissioning.permissioningScore >= 0 && decision.decisionScores.permissioning.permissioningScore <= 1);
    assert.ok(decision.sizingSummary.policy.components.alphaConviction);
    assert.ok(decision.sizingSummary.policy.components.paperBootstrap);
    assert.ok(decision.policyProfile);
    assert.ok(decision.entryDiagnostics.policyProfile);
  });
}
