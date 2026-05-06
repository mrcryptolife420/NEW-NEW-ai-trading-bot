import {
  buildPaperCandidateLabRecord,
  buildPaperCandidateLabRecords,
  summarizePaperCandidateLab
} from "../src/runtime/paperCandidateLab.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

function candidate(overrides = {}) {
  return {
    id: "candidate-1",
    decisionId: "decision-1",
    symbol: "BTCUSDT",
    setupType: "trend_continuation",
    probability: 0.61,
    threshold: 0.58,
    approved: true,
    topEvidence: [{ id: "trend_strength", score: 0.7 }],
    ...overrides
  };
}

export async function registerPaperCandidateLabTests({ runCheck, assert }) {
  await runCheck("paper candidate lab records blocked candidate without executing", async () => {
    const record = buildPaperCandidateLabRecord({
      candidate: candidate({
        approved: false,
        rootBlocker: "model_confidence_too_low",
        reasons: ["model_confidence_too_low"],
        probability: 0.42,
        threshold: 0.6
      }),
      botMode: "paper"
    });
    assert.equal(record.state, "blocked");
    assert.equal(record.paperEligibility.eligible, true);
    assert.equal(record.blockerFamily, "quality");
    assert.equal(record.executionPermissionChanged, false);
    assert.equal(record.liveBehaviorChanged, false);
  });

  await runCheck("paper candidate lab records approved paper candidate eligibility", async () => {
    const record = buildPaperCandidateLabRecord({
      candidate: candidate({ approved: true }),
      botMode: "paper"
    });
    assert.equal(record.state, "approved");
    assert.equal(record.paperEligibility.eligible, true);
    assert.equal(record.runtimeApplied, true);
    assert.equal(record.featureActivationStage, "paper_only");
  });

  await runCheck("paper candidate lab keeps live mode diagnostics only", async () => {
    const record = buildPaperCandidateLabRecord({
      candidate: candidate({ approved: true }),
      botMode: "live"
    });
    assert.equal(record.diagnosticsOnly, true);
    assert.equal(record.runtimeApplied, false);
    assert.equal(record.paperEligibility.eligible, false);
    assert.equal(record.paperEligibility.reason, "live_diagnostics_only");
    assert.equal(record.executionPermissionChanged, false);
  });

  await runCheck("paper candidate lab keeps hard-safety blocker hard in paper", async () => {
    const record = buildPaperCandidateLabRecord({
      candidate: candidate({
        approved: false,
        rootBlocker: "exchange_truth_freeze",
        reasons: ["exchange_truth_freeze"]
      }),
      botMode: "paper"
    });
    assert.equal(record.hardSafetyBlocker, true);
    assert.equal(record.paperEligibility.eligible, false);
    assert.equal(record.paperEligibility.reason, "hard_safety_blocker");
    assert.equal(record.runtimeApplied, false);
  });

  await runCheck("paper candidate lab is fallback-safe for missing candidate fields", async () => {
    const record = buildPaperCandidateLabRecord({ candidate: {}, botMode: "paper" });
    assert.equal(record.state, "generated");
    assert.equal(record.setupType, "unknown_setup");
    assert.equal(record.explainability.warnings.includes("candidate_missing"), true);
    assert.equal(record.liveBehaviorChanged, false);
  });

  await runCheck("paper candidate lab summary exposes states and dashboard fallback", async () => {
    const records = buildPaperCandidateLabRecords({
      botMode: "paper",
      candidates: [
        candidate({ id: "approved", approved: true }),
        candidate({ id: "blocked", approved: false, rootBlocker: "model_confidence_too_low" }),
        candidate({ id: "shadow", shadowApproved: true })
      ]
    });
    const summary = summarizePaperCandidateLab(records);
    assert.equal(summary.count, 3);
    assert.equal(summary.byState.approved, 1);
    assert.equal(summary.byState.blocked, 1);
    assert.equal(summary.byState.shadow_approved, 1);
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.paperCandidateLabSummary.status, "empty");
    const normalized = normalizeDashboardSnapshotPayload({
      paperLearning: { paperCandidateLabSummary: summary }
    });
    assert.equal(normalized.paperCandidateLabSummary.count, 3);
  });
}
