import { AdaptiveGovernanceService } from "../src/runtime/adaptiveGovernanceService.js";

export async function registerAdaptiveGovernanceTests({ runCheck, assert }) {
  await runCheck("adaptive governance auto-applies bounded paper changes on positive outcomes", async () => {
    const service = new AdaptiveGovernanceService({ botMode: "paper" });
    const result = service.evaluateProposal({
      state: {},
      trade: { symbol: "BTCUSDT", brokerMode: "paper", pnlQuote: 12 },
      runtimeApplied: [{ thresholdBias: 0.04, sizeBias: 2 }]
    });
    assert.equal(result.proposal.status, "applied");
    assert.equal(result.state.activeAdaptationVersion, 1);
    assert.equal(result.proposal.runtimeApplied[0].thresholdBias, 0.01);
    assert.equal(result.proposal.runtimeApplied[0].sizeBias, 1.08);
  });

  await runCheck("adaptive governance keeps live proposals in shadow mode", async () => {
    const service = new AdaptiveGovernanceService({ botMode: "live" });
    const result = service.evaluateProposal({
      state: {},
      trade: { symbol: "ETHUSDT", brokerMode: "live", pnlQuote: 20 },
      runtimeApplied: [{ thresholdBias: 0.005 }]
    });
    assert.equal(result.proposal.status, "shadow");
    assert.equal(result.applied, false);
  });

  await runCheck("adaptive governance marks losing paper changes for review and supports rollback", async () => {
    const service = new AdaptiveGovernanceService({ botMode: "paper" });
    const proposal = service.evaluateProposal({
      state: {},
      trade: { symbol: "SOLUSDT", brokerMode: "paper", pnlQuote: -5 },
      runtimeApplied: [{ sizeBias: 0.96 }]
    });
    const promoted = service.evaluateProposal({
      state: proposal.state,
      trade: { symbol: "SOLUSDT", brokerMode: "paper", pnlQuote: 8 },
      runtimeApplied: [{ sizeBias: 0.97 }]
    });
    const rollback = service.rollback(promoted.state, { reason: "operator_review" });
    assert.equal(proposal.proposal.status, "review_required");
    assert.equal(promoted.proposal.version, 2);
    assert.equal(rollback.rollback.status, "rolled_back");
    assert.equal(rollback.state.activeAdaptationVersion, promoted.state.lastKnownGoodVersion);
  });
}
