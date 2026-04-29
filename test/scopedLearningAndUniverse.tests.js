import { BadVetoLearningService } from "../src/runtime/badVetoLearningService.js";
import { scoreUniverseEntries } from "../src/runtime/universeScorer.js";
import { buildAdaptiveParameterOptimization } from "../src/runtime/adaptiveParameterOptimizer.js";

export async function registerScopedLearningAndUniverseTests({
  runCheck,
  assert,
  TradingBot,
  makeConfig
}) {
  await runCheck("bad-veto learning emits scoped paper recommendations only with enough evidence", async () => {
    const service = new BadVetoLearningService({
      config: {
        botMode: "paper",
        badVetoMinRejectCount: 4,
        badVetoMinFalseNegativeRate: 0.55,
        badVetoMinAverageMissedR: 0.75
      },
      dataRecorder: {
        async loadRejectedDecisionReview() {
          return {
            status: "active",
            blockerStats: [{
              blocker: "meta_followthrough_caution",
              blockerStage: "governance_gate",
              rejectCount: 6,
              falseNegativeRate: 0.66,
              averageMissedR: 1.08,
              averageEdgeScore: 0.71
            }],
            decisions: [{
              rootBlocker: "meta_followthrough_caution",
              blockerStage: "governance_gate",
              family: "breakout",
              strategy: "market_structure_break",
              regime: "trend",
              session: "us",
              marketCondition: { conditionId: "breakout_release" }
            }]
          };
        }
      }
    });

    const review = await service.buildReview();
    assert.equal(review.recommendations.length, 1);
    assert.equal(review.recommendations[0].recommendation, "bounded_paper_soften");
    assert.equal(review.recommendations[0].family, "breakout");
  });

  await runCheck("bad-veto learning keeps live mode strict and ignores weak samples", async () => {
    const liveService = new BadVetoLearningService({
      config: { botMode: "live" },
      dataRecorder: {
        async loadRejectedDecisionReview() {
          return {
            status: "active",
            blockerStats: [{
              blocker: "meta_followthrough_caution",
              blockerStage: "governance_gate",
              rejectCount: 10,
              falseNegativeRate: 0.8,
              averageMissedR: 1.2
            }],
            decisions: [{ rootBlocker: "meta_followthrough_caution", blockerStage: "governance_gate" }]
          };
        }
      }
    });
    const weakPaperService = new BadVetoLearningService({
      config: { botMode: "paper", badVetoMinRejectCount: 6 },
      dataRecorder: {
        async loadRejectedDecisionReview() {
          return {
            status: "active",
            blockerStats: [{
              blocker: "committee_veto",
              blockerStage: "governance_gate",
              rejectCount: 3,
              falseNegativeRate: 0.67,
              averageMissedR: 1.1
            }],
            decisions: [{ rootBlocker: "committee_veto", blockerStage: "governance_gate" }]
          };
        }
      }
    });

    const liveReview = await liveService.buildReview();
    const weakReview = await weakPaperService.buildReview();
    assert.equal(liveReview.recommendations.length, 0);
    assert.equal(weakReview.recommendations.length, 0);
  });

  await runCheck("universe scorer prefers cleaner execution and stronger paper expectancy", async () => {
    const ranked = scoreUniverseEntries({
      entries: [
        { symbol: "BADUSDT", marketCapRank: 10 },
        { symbol: "GOODUSDT", marketCapRank: 30 }
      ],
      runtime: {
        universeTelemetry: {
          BADUSDT: { spreadStabilityScore: 0.34, sessionExecutionQuality: 0.38 },
          GOODUSDT: { spreadStabilityScore: 0.82, sessionExecutionQuality: 0.78 }
        },
        latestBlockedSetups: [
          { symbol: "BADUSDT", allow: false, reasons: ["meta_gate_caution"], strategySummary: { fitScore: 0.42 } },
          { symbol: "BADUSDT", allow: false, reasons: ["trade_size_below_minimum"], strategySummary: { fitScore: 0.44 } }
        ],
        latestDecisions: [
          { symbol: "GOODUSDT", allow: true, strategySummary: { fitScore: 0.74 } }
        ]
      },
      journal: {
        trades: [
          {
            symbol: "GOODUSDT",
            pnlPct: 0.034,
            sessionAtEntry: "us",
            entryExecutionAttribution: { realizedSpreadBps: 1.1, slippageDeltaBps: 0.6 }
          },
          {
            symbol: "BADUSDT",
            pnlPct: -0.012,
            sessionAtEntry: "us",
            entryExecutionAttribution: { realizedSpreadBps: 5.2, slippageDeltaBps: 4.1 }
          }
        ]
      },
      sessionId: "us"
    });

    assert.equal(ranked[0].symbol, "GOODUSDT");
    assert.ok((ranked[0].universeScoreDrivers.paperExpectancyScore || 0) > (ranked[1].universeScoreDrivers.paperExpectancyScore || 0));
    assert.ok((ranked[0].universeScoreDrivers.blockerNoisePenalty || 0) < (ranked[1].universeScoreDrivers.blockerNoisePenalty || 0));
  });

  await runCheck("adaptive optimizer builds different candidate sets for different scopes", async () => {
    const trades = [];
    for (let index = 0; index < 8; index += 1) {
      trades.push({
        symbol: "AAAUSDT",
        entryAt: `2026-04-20T0${index}:00:00.000Z`,
        exitAt: `2026-04-20T1${index}:00:00.000Z`,
        pnlQuote: 4 + index,
        pnlPct: 0.01 + index * 0.001,
        strategyDecision: { family: "breakout", activeStrategy: "market_structure_break" },
        strategyAtEntry: "market_structure_break",
        regimeAtEntry: "trend",
        sessionAtEntry: "us",
        marketConditionAtEntry: "breakout_release",
        entryRationale: { probability: 0.64, threshold: 0.56 }
      });
      trades.push({
        symbol: "BBBUSDT",
        entryAt: `2026-04-21T0${index}:00:00.000Z`,
        exitAt: `2026-04-21T1${index}:00:00.000Z`,
        pnlQuote: index % 2 === 0 ? 1 : -1,
        pnlPct: index % 2 === 0 ? 0.004 : -0.004,
        strategyDecision: { family: "mean_reversion", activeStrategy: "zscore_reversion" },
        strategyAtEntry: "zscore_reversion",
        regimeAtEntry: "range",
        sessionAtEntry: "asia",
        marketConditionAtEntry: "range_acceptance",
        entryRationale: { probability: 0.58, threshold: 0.56 }
      });
    }

    const optimization = buildAdaptiveParameterOptimization({
      journal: { trades },
      config: {
        botMode: "paper",
        adaptiveLearningParameterOptimizationMinTrades: 12,
        adaptiveLearningScopedMinTrades: 6
      },
      nowIso: "2026-04-22T12:00:00.000Z"
    });

    assert.ok((optimization.scopedCandidates || []).length >= 2);
    const breakoutScope = optimization.scopedCandidates.find((item) => item.scope.family === "breakout");
    const reversionScope = optimization.scopedCandidates.find((item) => item.scope.family === "mean_reversion");
    assert.ok(breakoutScope);
    assert.ok(reversionScope);
    assert.notEqual(breakoutScope.topCandidate.thresholdShift, reversionScope.topCandidate.thresholdShift);
  });

  await runCheck("offline learning guidance consumes scoped optimizer candidates only in paper mode", async () => {
    const bot = new TradingBot({
      config: makeConfig({ botMode: "paper" }),
      logger: { info() {}, warn() {}, error() {}, debug() {} }
    });
    bot.runtime = {
      offlineTrainer: {
        parameterOptimization: {
          scopedCandidates: [{
            scope: {
              family: "breakout",
              regime: "trend",
              session: "us",
              condition: "breakout_release"
            },
            tradeCount: 10,
            status: "active",
            topCandidate: {
              id: "continuation_bias:breakout|trend|us|breakout_release",
              thresholdShift: -0.01,
              sizeMultiplier: 1.08,
              maxHoldMultiplier: 1.08,
              exitAggressiveness: 0.94,
              score: 0.68,
              avgPnl: 3.2
            }
          }]
        },
        outcomeScopeScorecards: {},
        featureGovernance: {},
        falsePositivePatternLibrary: {},
        strategyReweighting: {},
        strategyPromotionEngine: {}
      },
      ops: { paperLearning: {} },
      onlineAdaptation: {},
      rejectAdaptiveLearning: {},
      selfHeal: {}
    };

    const guidance = bot.buildOfflineLearningGuidance({
      strategySummary: { family: "breakout", activeStrategy: "market_structure_break" },
      regimeSummary: { regime: "trend" },
      sessionSummary: { session: "us" },
      marketConditionSummary: { conditionId: "breakout_release" },
      rawFeatures: {},
      offlineTrainerSummary: bot.runtime.offlineTrainer
    });

    assert.equal((guidance.scopedOptimizerCandidates || []).length, 1);
    assert.ok((guidance.scopedOptimizerConfidence || 0) > 0);
    assert.ok((guidance.scopedOptimizerSizeBias || 1) >= 1);
  });
}
