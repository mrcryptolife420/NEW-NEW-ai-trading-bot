import {
  buildPaperExitPolicyChallengerDecision,
  comparePaperExitPolicyToActual,
  summarizePaperExitPolicyLab,
  buildPaperExitPolicyLabSummary
} from "../src/runtime/paperExitPolicyLab.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

const NOW = "2026-05-05T12:00:00.000Z";

function position(overrides = {}) {
  return {
    id: "pos-1",
    symbol: "BTCUSDT",
    entryPrice: 100,
    entryAt: "2026-05-05T11:30:00.000Z",
    highestPrice: 105,
    lowestPrice: 99,
    trailingStopPct: 0.012,
    ...overrides
  };
}

function snapshot(price, market = {}, book = {}) {
  return {
    book: {
      bid: price - 0.02,
      ask: price + 0.02,
      mid: price,
      bookPressure: 0.2,
      depthConfidence: 0.9,
      ...book
    },
    market: {
      close: price,
      vwap: 100,
      structureLow: 99,
      structureHigh: 108,
      orderflowToxicityScore: 0.05,
      cvdTrendAlignment: 0.4,
      ...market
    }
  };
}

export async function registerPaperExitPolicyLabTests({ runCheck, assert }) {
  await runCheck("paper exit policy lab suggests trail for early trend winner", async () => {
    const decision = buildPaperExitPolicyChallengerDecision({
      position: position({ highestPrice: 106, lowestPrice: 99.5 }),
      currentPrice: 105,
      marketSnapshot: snapshot(105, {
        vwap: 101,
        structureLow: 101,
        structureHigh: 110,
        cvdTrendAlignment: 0.6
      }),
      config: { maxHoldMinutes: 360 },
      nowIso: NOW
    });
    assert.equal(decision.status, "ready");
    assert.equal(decision.challengerAction, "trail");
    assert.equal(decision.liveBehaviorChanged, false);
  });

  await runCheck("paper exit policy lab suggests exit for failed breakout", async () => {
    const decision = buildPaperExitPolicyChallengerDecision({
      position: position({ marketConditionAtEntry: "failed_breakout", highestPrice: 102, lowestPrice: 97 }),
      currentPrice: 97.5,
      marketSnapshot: snapshot(97.5, {
        vwap: 100,
        structureLow: 99,
        failedBreakoutScore: 0.95,
        structureBreakdownScore: 0.8,
        cvdTrendAlignment: -0.7,
        orderflowToxicityScore: 0.8
      }, {
        bookPressure: -0.8,
        depthConfidence: 0.35
      }),
      config: { maxHoldMinutes: 360 },
      nowIso: NOW
    });
    assert.equal(decision.challengerAction, "exit");
    assert.ok(decision.reasons.includes("structure_invalidation"));
  });

  await runCheck("paper exit policy lab suggests trim or exit for time decay", async () => {
    const decision = buildPaperExitPolicyChallengerDecision({
      position: position({
        entryAt: "2026-05-05T04:00:00.000Z",
        highestPrice: 101,
        lowestPrice: 99.5
      }),
      currentPrice: 100.1,
      marketSnapshot: snapshot(100.1, {
        vwap: 100,
        structureLow: 99,
        structureHigh: 102,
        cvdTrendAlignment: 0.05
      }),
      config: { maxHoldMinutes: 120 },
      nowIso: NOW
    });
    assert.ok(["trim", "exit"].includes(decision.challengerAction));
    assert.ok(decision.scores.timeDecayScore > 0.7);
  });

  await runCheck("paper exit policy lab returns unknown on missing market data", async () => {
    const decision = buildPaperExitPolicyChallengerDecision({
      position: position(),
      currentPrice: null,
      marketSnapshot: {},
      nowIso: NOW
    });
    assert.equal(decision.status, "unknown");
    assert.equal(decision.challengerAction, "unknown");
    assert.ok(decision.reasons.includes("missing_market_data"));
  });

  await runCheck("paper exit policy lab live recommendation never increases position or loosens protection", async () => {
    const decision = buildPaperExitPolicyChallengerDecision({
      mode: "live",
      position: position(),
      currentPrice: 97.5,
      marketSnapshot: snapshot(97.5, {
        failedBreakoutScore: 0.95,
        structureBreakdownScore: 0.8
      }),
      nowIso: NOW
    });
    assert.equal(decision.diagnosticsOnly, true);
    assert.equal(decision.liveCanIncreasePosition, false);
    assert.equal(decision.liveCanLoosenProtection, false);
    assert.equal(decision.liveBehaviorChanged, false);
  });

  await runCheck("paper exit policy lab compares actual paper exit to challenger using trade quality", async () => {
    const challengerDecision = buildPaperExitPolicyChallengerDecision({
      position: position(),
      currentPrice: 105,
      marketSnapshot: snapshot(105),
      nowIso: NOW
    });
    const comparison = comparePaperExitPolicyToActual({
      position: position(),
      trade: {
        id: "trade-1",
        symbol: "BTCUSDT",
        entryPrice: 100,
        exitPrice: 104,
        netPnlPct: 0.04,
        exitReason: "take_profit",
        exitAt: NOW,
        maximumFavorableExcursionPct: 0.06,
        maximumAdverseExcursionPct: -0.01,
        bestPossibleExitPrice: 106,
        worstAdversePrice: 99
      },
      challengerDecision
    });
    assert.equal(comparison.actualAction, "exit");
    assert.equal(comparison.challengerAction, "trail");
    assert.ok(Number.isFinite(comparison.exitEfficiencyPct));
    assert.ok(Number.isFinite(comparison.gaveBackPct));
    const summary = summarizePaperExitPolicyLab([comparison]);
    assert.equal(summary.count, 1);
    assert.equal(summary.liveBehaviorChanged, false);
  });

  await runCheck("paper exit policy lab summary is exposed through report/dashboard fallback", async () => {
    const summary = buildPaperExitPolicyLabSummary({
      positions: [position()],
      trades: [{
        id: "trade-1",
        symbol: "BTCUSDT",
        entryPrice: 100,
        exitPrice: 104,
        netPnlPct: 0.04,
        exitReason: "take_profit",
        exitAt: NOW,
        maximumFavorableExcursionPct: 0.06,
        maximumAdverseExcursionPct: -0.01
      }],
      marketSnapshotsBySymbol: { BTCUSDT: snapshot(105) },
      nowIso: NOW
    });
    const normalized = normalizeDashboardSnapshotPayload({ report: { paperExitPolicyLabSummary: summary } });
    assert.equal(normalized.paperExitPolicyLabSummary.count, 1);
    assert.equal(normalized.paperExitPolicyLabSummary.openDecisionCount, 1);
    assert.equal(normalized.paperExitPolicyLabSummary.diagnosticsOnly, true);
  });
}
