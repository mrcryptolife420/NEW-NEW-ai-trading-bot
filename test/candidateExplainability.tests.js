import { buildCandidateExplainability, summarizeCandidateExplainability } from "../src/runtime/candidateExplainability.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerCandidateExplainabilityTests({ runCheck, assert }) {
  await runCheck("candidate explainability summarizes approved candidate", async () => {
    const view = buildCandidateExplainability({
      symbol: "BTCUSDT",
      setupType: "breakout_retest",
      approved: true,
      probability: 0.64,
      threshold: 0.6,
      confidence: 0.71,
      regime: "trend",
      indicatorRegimeSummary: {
        score: 0.77,
        supportingIndicators: [{ id: "ema_slope_stack", score: 0.4, reason: "trend aligned" }]
      },
      executionPlan: { spreadBps: 5, expectedSlippageBps: 3, confidence: 0.82, style: "maker_limit" },
      risk: { allowed: true, score: 0.78 }
    });
    assert.equal(view.symbol, "BTCUSDT");
    assert.equal(view.setupType, "breakout_retest");
    assert.equal(view.approved, true);
    assert.equal(view.blocker, null);
    assert.ok(view.topEvidence.some((item) => item.id === "ema_slope_stack"));
    assert.equal(Number.isFinite(view.scoreComponents.probability), true);
  });

  await runCheck("candidate explainability summarizes blocked candidate", async () => {
    const view = buildCandidateExplainability({
      symbol: "ETHUSDT",
      strategyFamily: "trend_following",
      approved: false,
      rootBlocker: "exchange_safety_blocked",
      reasons: ["exchange_safety_blocked"],
      risk: { status: "blocked", reasons: ["exchange_safety_blocked"] },
      indicatorRegimeSummary: {
        conflictingIndicators: [{ id: "high_choppiness", score: -0.5, reason: "chop blocks breakout" }]
      }
    });
    assert.equal(view.approved, false);
    assert.equal(view.blocker, "exchange_safety_blocked");
    assert.ok(view.topConflicts.some((item) => item.id === "high_choppiness"));
    assert.equal(view.riskFit.status, "blocked");
  });

  await runCheck("candidate explainability is fallback-safe for missing features", async () => {
    const view = buildCandidateExplainability({});
    assert.equal(view.symbol, "UNKNOWN");
    assert.equal(view.setupType, "unknown_setup");
    assert.ok(view.warnings.includes("candidate_missing"));
    assert.equal(Object.values(view.scoreComponents).every((value) => Number.isFinite(value)), true);
  });

  await runCheck("candidate explainability warns on unknown regime", async () => {
    const view = buildCandidateExplainability({
      symbol: "SOLUSDT",
      setupType: "mean_reversion",
      probability: Number.NaN,
      threshold: Number.POSITIVE_INFINITY,
      executionPlan: { spreadBps: 4, expectedSlippageBps: 2 }
    });
    assert.ok(view.warnings.includes("regime_unknown"));
    assert.equal(Object.values(view.scoreComponents).every((value) => Number.isFinite(value)), true);
  });

  await runCheck("candidate explainability surfaces execution conflict", async () => {
    const view = buildCandidateExplainability({
      symbol: "DOGEUSDT",
      setupType: "breakout",
      regime: "breakout",
      executionPlan: { spreadBps: 52, expectedSlippageBps: 24, style: "market_prohibited" },
      indicatorRegimeSummary: { score: 0.52 }
    });
    assert.ok(view.executionFit.conflicts.includes("spread_too_high"));
    assert.ok(view.executionFit.conflicts.includes("slippage_too_high"));
    assert.ok(view.topConflicts.some((item) => item.id === "market_order_prohibited"));
  });

  await runCheck("candidate explainability summary handles multiple candidates", async () => {
    const summary = summarizeCandidateExplainability([
      { symbol: "BTCUSDT", approved: true, regime: "trend" },
      { symbol: "ETHUSDT", approved: false, blocker: "model_confidence_too_low" }
    ]);
    assert.equal(summary.status, "ready");
    assert.equal(summary.count, 2);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("dashboard normalizer keeps candidate explainability optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.candidateExplainabilitySummary.status, "unavailable");
    const nested = normalizeDashboardSnapshotPayload({
      explainability: {
        candidateExplainabilitySummary: { status: "ready", count: 1, items: [{ symbol: "BTCUSDT" }] }
      }
    });
    assert.equal(nested.candidateExplainabilitySummary.status, "ready");
    assert.equal(nested.candidateExplainabilitySummary.count, 1);
  });
}
