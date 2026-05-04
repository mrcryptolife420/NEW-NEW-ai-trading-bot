import { buildStrategyLifecycle, STRATEGY_LIFECYCLE_STATES } from "../src/runtime/strategyLifecycle.js";

export async function registerStrategyLifecycleTests({ runCheck, assert }) {
  await runCheck("strategy lifecycle keeps healthy strategy active", async () => {
    const lifecycle = buildStrategyLifecycle({
      strategyId: "trend_following",
      stats: { tradeCount: 28, maxDrawdownPct: 0.025, expectancy: 0.006 },
      failureStats: { badExitRate: 0.1, badVetoRatio: 0.04 },
      paperLiveParity: { score: 0.91 },
      calibration: { error: 0.03 }
    });
    assert.equal(lifecycle.state, "active");
    assert.equal(lifecycle.autoPromotesLive, false);
    assert.equal(lifecycle.liveBehaviorChanged, false);
  });

  await runCheck("strategy lifecycle moves moderate failures to watch", async () => {
    const lifecycle = buildStrategyLifecycle({
      strategyId: "mean_reversion",
      stats: { tradeCount: 18, maxDrawdownPct: 0.06, expectancy: 0.001 },
      failureStats: { badExitRate: 0.38, badVetoRatio: 0.08 },
      calibration: { error: 0.04 }
    });
    assert.equal(lifecycle.state, "watch");
    assert.ok(lifecycle.reasons.some((reason) => reason.code === "drawdown_watch"));
    assert.equal(lifecycle.recommendedAction, "keep_diagnostics_active_and_reduce_confidence_until_evidence_improves");
  });

  await runCheck("strategy lifecycle quarantines repeated severe failures", async () => {
    const lifecycle = buildStrategyLifecycle({
      strategyId: "range_grid",
      stats: { tradeCount: 32, maxDrawdownPct: 0.13, expectancy: -0.008 },
      failureStats: { badExitRate: 0.62, badVetoRatio: 0.49, executionDragCount: 5 },
      calibration: { error: 0.18 }
    });
    assert.equal(lifecycle.state, "quarantine");
    assert.ok(lifecycle.retestRequirements.length > 0);
    assert.ok(lifecycle.reasons.some((reason) => reason.code === "bad_exit_quality_severe"));
  });

  await runCheck("strategy lifecycle retires severe sustained drawdown", async () => {
    const lifecycle = buildStrategyLifecycle({
      strategyId: "crowded_breakout",
      stats: { tradeCount: 44, maxDrawdownPct: 0.22, expectancy: -0.02 },
      failureStats: { badExitRate: 0.5, executionDragCount: 4 },
      previousState: "quarantine"
    });
    assert.equal(lifecycle.state, "retired");
    assert.equal(lifecycle.recommendedAction, "block_new_allocations_and_require_operator_review");
  });

  await runCheck("strategy lifecycle recovers after clean retest", async () => {
    const lifecycle = buildStrategyLifecycle({
      strategyId: "breakout_retest",
      stats: { tradeCount: 24, maxDrawdownPct: 0.018, expectancy: 0.006 },
      failureStats: { badExitRate: 0.08, badVetoRatio: 0.05 },
      paperLiveParity: { score: 0.93 },
      calibration: { error: 0.02 },
      previousState: "quarantine",
      retest: { passed: true, tradeCount: 14 }
    });
    assert.equal(lifecycle.state, "active");
    assert.ok(lifecycle.reasons.some((reason) => reason.code === "retest_passed"));
  });

  await runCheck("strategy lifecycle missing stats require retest samples", async () => {
    const lifecycle = buildStrategyLifecycle({ strategyId: "unknown_strategy" });
    assert.equal(lifecycle.state, "retest_required");
    assert.ok(lifecycle.reasons.some((reason) => reason.code === "insufficient_lifecycle_samples"));
    assert.ok(STRATEGY_LIFECYCLE_STATES.includes(lifecycle.state));
  });

  await runCheck("strategy lifecycle paper-live parity degradation stays shadow only", async () => {
    const lifecycle = buildStrategyLifecycle({
      strategyId: "scalper",
      stats: { tradeCount: 20, maxDrawdownPct: 0.02, expectancy: 0.003 },
      paperLiveParity: { score: 0.55 }
    });
    assert.equal(lifecycle.state, "shadow_only");
    assert.ok(lifecycle.reasons.some((reason) => reason.code === "paper_live_parity_degraded"));
  });
}
