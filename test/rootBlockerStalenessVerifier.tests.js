import { verifyRootBlockerStaleness } from "../src/runtime/rootBlockerStalenessVerifier.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

const now = "2026-05-06T12:00:00.000Z";

export async function registerRootBlockerStalenessVerifierTests({ runCheck, assert }) {
  await runCheck("fresh hard blocker is not stale", async () => {
    const summary = verifyRootBlockerStaleness({
      now,
      rootBlockers: [{
        reason: "exchange_truth_freeze",
        source: "exchangeTruth",
        firstSeenAt: "2026-05-06T11:59:00.000Z",
        lastEvidenceAt: "2026-05-06T11:59:30.000Z"
      }],
      dataFreshness: { status: "fresh", staleSources: [] },
      tradingPathHealth: { status: "active", feedFresh: true, cycleFresh: true }
    });
    assert.equal(summary.status, "blocked");
    assert.equal(summary.rootBlockers[0].hardSafety, true);
    assert.equal(summary.rootBlockers[0].staleSuspected, false);
    assert.equal(summary.entryUnlockEligible, false);
    assert.ok(summary.requiredEvidence.includes("fresh_account_snapshot"));
  });

  await runCheck("old dashboard-only blocker can be stale suspected without unlock", async () => {
    const summary = verifyRootBlockerStaleness({
      now,
      rootBlockers: [{
        reason: "dashboard_polling_stale",
        source: "dashboard",
        firstSeenAt: "2026-05-06T11:20:00.000Z",
        lastEvidenceAt: "2026-05-06T11:20:00.000Z"
      }],
      dataFreshness: { status: "fresh", staleSources: [], lastUpdatedAt: "2026-05-06T11:59:50.000Z" },
      tradingPathHealth: { status: "active", feedFresh: true, cycleFresh: true, lastCycleAt: "2026-05-06T11:59:45.000Z" },
      config: { rootBlockerStaleAfterMs: 10 * 60_000 }
    });
    assert.equal(summary.status, "stale_suspected");
    assert.equal(summary.staleSuspected, true);
    assert.equal(summary.entryUnlockEligible, false);
    assert.equal(summary.forceUnlockAvailable, false);
    assert.equal(summary.rootBlockers[0].safeNextAction, "refresh_runtime_snapshot_and_verify_blocker_source");
  });

  await runCheck("exchange safety blocker requires reconcile evidence", async () => {
    const summary = verifyRootBlockerStaleness({
      now,
      rootBlockers: [{
        reason: "exchange_safety_blocked",
        source: "exchangeSafety",
        firstSeenAt: "2026-05-06T10:00:00.000Z"
      }],
      dataFreshness: { status: "fresh", staleSources: [] },
      tradingPathHealth: { status: "active", feedFresh: true, cycleFresh: true }
    });
    assert.equal(summary.status, "blocked");
    assert.equal(summary.rootBlockers[0].staleSuspected, false);
    assert.ok(summary.rootBlockers[0].requiredEvidence.includes("auto_reconcile_plan_without_blocking_reasons"));
    assert.equal(summary.rootBlockers[0].safeNextAction, "run_reconcile_plan_and_exchange_safety_status");
  });

  await runCheck("unresolved intent blocks stale suspicion", async () => {
    const summary = verifyRootBlockerStaleness({
      now,
      rootBlockers: [{
        reason: "dashboard_polling_stale",
        source: "dashboard",
        firstSeenAt: "2026-05-06T11:00:00.000Z"
      }],
      intents: [{ id: "intent-1", status: "ambiguous", kind: "entry" }],
      dataFreshness: { status: "fresh", staleSources: [] },
      tradingPathHealth: { status: "active", feedFresh: true, cycleFresh: true }
    });
    assert.equal(summary.status, "blocked");
    assert.equal(summary.staleSuspected, false);
    assert.ok(summary.stillBlockedReasons.includes("unresolved_execution_intents"));
    assert.equal(summary.entryUnlockEligible, false);
  });

  await runCheck("missing evidence never unlocks entries", async () => {
    const summary = verifyRootBlockerStaleness({
      now,
      rootBlockers: [{
        reason: "no_decision_snapshot_created",
        source: "runtime",
        firstSeenAt: "2026-05-06T11:00:00.000Z"
      }],
      dataFreshness: { status: "unknown", staleSources: [] },
      tradingPathHealth: { status: "stale", feedFresh: false, cycleFresh: false }
    });
    assert.equal(summary.status, "active");
    assert.equal(summary.staleSuspected, false);
    assert.equal(summary.entryUnlockEligible, false);
    assert.ok(summary.rootBlockers[0].blockersToClear.includes("fresh_evidence_not_available"));
  });

  await runCheck("dashboard normalizer keeps root blocker staleness optional", async () => {
    const empty = normalizeDashboardSnapshotPayload({});
    assert.equal(empty.rootBlockerStalenessSummary.status, "unavailable");
    const summary = verifyRootBlockerStaleness({
      now,
      rootBlockers: [{ reason: "dashboard_polling_stale", source: "dashboard", firstSeenAt: "2026-05-06T11:00:00.000Z" }],
      dataFreshness: { status: "fresh", staleSources: [] },
      tradingPathHealth: { status: "active", feedFresh: true, cycleFresh: true }
    });
    const normalized = normalizeDashboardSnapshotPayload({ rootBlockerStalenessSummary: summary });
    assert.equal(normalized.rootBlockerStalenessSummary.status, "stale_suspected");
    assert.equal(normalized.rootBlockerStalenessSummary.entryUnlockEligible, false);
  });
}
