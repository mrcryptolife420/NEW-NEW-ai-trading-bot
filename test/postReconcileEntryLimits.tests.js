import {
  applyPostReconcileEntryLimits,
  buildPostReconcileProbationStatus,
  resolvePostReconcileProbationState
} from "../src/risk/postReconcileEntryLimits.js";

const baseConfig = {
  botMode: "paper",
  maxOpenPositions: 5,
  postReconcileMaxOpenPositions: 2,
  postReconcilePaperMaxOpenPositions: 3,
  postReconcileMaxNewEntriesPerCycle: 1,
  postReconcileMaxTotalExposureMultiplier: 0.5,
  postReconcileLiveSizeMultiplier: 0.25,
  postReconcilePaperSizeMultiplier: 0.5
};

function positions(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `pos-${index + 1}`,
    symbol: `TEST${index + 1}USDT`
  }));
}

export async function registerPostReconcileEntryLimitsTests({ runCheck, assert }) {
  await runCheck("healthy normal state allows multiple positions up to MAX_OPEN_POSITIONS", async () => {
    const result = applyPostReconcileEntryLimits({
      config: baseConfig,
      probationState: { status: "completed" },
      proposedEntry: { botMode: "paper" },
      openPositions: positions(4),
      entriesThisCycle: 4
    });
    assert.equal(result.active, false);
    assert.equal(result.allowed, true);
    assert.equal(result.maxOpenPositionsDuringProbation, 5);
    assert.equal(result.remainingSlots, 1);
    assert.equal(result.sizeMultiplier, 1);
  });

  await runCheck("post reconcile probation allows second position when limit is two", async () => {
    const result = applyPostReconcileEntryLimits({
      config: { ...baseConfig, botMode: "live" },
      probationState: { active: true, status: "active" },
      proposedEntry: { botMode: "live" },
      openPositions: positions(1),
      entriesThisCycle: 0
    });
    assert.equal(result.allowed, true);
    assert.equal(result.maxOpenPositionsDuringProbation, 2);
    assert.equal(result.remainingSlots, 1);
  });

  await runCheck("post reconcile probation blocks third position when limit is two", async () => {
    const result = applyPostReconcileEntryLimits({
      config: { ...baseConfig, botMode: "live" },
      probationState: { active: true, status: "active" },
      proposedEntry: { botMode: "live" },
      openPositions: positions(2),
      entriesThisCycle: 0
    });
    assert.equal(result.allowed, false);
    assert.equal(result.blockedReason, "post_reconcile_max_positions_reached");
    assert.equal(result.remainingSlots, 0);
  });

  await runCheck("post reconcile per-cycle limit blocks second new entry in same cycle", async () => {
    const result = applyPostReconcileEntryLimits({
      config: baseConfig,
      probationState: { active: true, status: "active" },
      proposedEntry: { botMode: "paper" },
      openPositions: positions(1),
      entriesThisCycle: 1
    });
    assert.equal(result.allowed, false);
    assert.equal(result.blockedReason, "post_reconcile_cycle_entry_limit");
  });

  await runCheck("completed probation uses normal maxOpenPositions again", async () => {
    const result = buildPostReconcileProbationStatus({
      config: baseConfig,
      runtime: { openPositions: positions(3), postReconcileProbation: { active: false, status: "completed" } }
    });
    assert.equal(result.status, "inactive");
    assert.equal(result.postReconcileMaxOpenPositions, 5);
    assert.equal(result.currentOpenPositions, 3);
    assert.equal(result.remainingProbationSlots, 2);
  });

  await runCheck("live probation uses stricter live size multiplier", async () => {
    const result = applyPostReconcileEntryLimits({
      config: { ...baseConfig, botMode: "live" },
      probationState: { active: true },
      proposedEntry: { botMode: "live" },
      openPositions: [],
      entriesThisCycle: 0
    });
    assert.equal(result.allowed, true);
    assert.equal(result.sizeMultiplier, 0.25);
    assert.equal(result.maxTotalExposureMultiplier, 0.5);
  });

  await runCheck("paper probation tags entries as post_reconcile_probe", async () => {
    const result = applyPostReconcileEntryLimits({
      config: baseConfig,
      probationState: { active: true },
      proposedEntry: { botMode: "paper" },
      openPositions: positions(1),
      entriesThisCycle: 0
    });
    assert.equal(result.allowed, true);
    assert.equal(result.sizeMultiplier, 0.5);
    assert.equal(result.tags.includes("post_reconcile_probe"), true);
  });

  await runCheck("exchange safety red blocks all new entries", async () => {
    const result = applyPostReconcileEntryLimits({
      config: baseConfig,
      probationState: { active: true, exchangeSafetyRed: true },
      proposedEntry: { botMode: "paper" },
      openPositions: [],
      entriesThisCycle: 0
    });
    assert.equal(result.allowed, false);
    assert.equal(result.blockedReason, "exchange_safety_blocked");
  });

  await runCheck("unresolved execution intent blocks all new entries", async () => {
    const result = applyPostReconcileEntryLimits({
      config: baseConfig,
      probationState: { active: true, unresolvedIntent: true },
      proposedEntry: { botMode: "paper" },
      openPositions: [],
      entriesThisCycle: 0
    });
    assert.equal(result.allowed, false);
    assert.equal(result.blockedReason, "post_reconcile_unresolved_safety_state");
  });

  await runCheck("manual review position blocks all new entries", async () => {
    const result = applyPostReconcileEntryLimits({
      config: baseConfig,
      probationState: { active: true },
      proposedEntry: { botMode: "paper" },
      openPositions: [{ id: "pos-1", symbol: "BTCUSDT", manualReviewRequired: true }],
      entriesThisCycle: 0
    });
    assert.equal(result.allowed, false);
    assert.equal(result.blockedReason, "post_reconcile_unresolved_safety_state");
  });

  await runCheck("runtime exchange safety probation state resolves from nested state", async () => {
    const state = resolvePostReconcileProbationState({
      exchangeSafety: {
        postReconcileProbation: { active: true, reason: "clear_exchange_safety_block" }
      }
    });
    assert.equal(state.active, true);
    assert.equal(state.reason, "clear_exchange_safety_block");
  });
}
