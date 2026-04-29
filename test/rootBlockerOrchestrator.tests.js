import { buildRootBlockerOrchestrator } from "../src/runtime/rootBlockerOrchestrator.js";

export async function registerRootBlockerOrchestratorTests({
  runCheck,
  assert
}) {
  await runCheck("root blocker orchestrator prioritizes systemic freezes above symbol blockers", async () => {
    const summary = buildRootBlockerOrchestrator({
      runtime: {
        orderLifecycle: {
          pendingActions: [
            { id: "mr-1", symbol: "ETHUSDT", state: "manual_review", reason: "hard_inventory_conflict" }
          ],
          executionIntentLedger: {
            unresolvedIntentIds: ["intent-1"],
            intents: {
              "intent-1": {
                id: "intent-1",
                kind: "exit",
                symbol: "BTCUSDT",
                scope: "symbol",
                status: "ambiguous",
                ambiguityReason: "submit_timeout"
              }
            }
          }
        }
      },
      exchangeTruth: {
        freezeEntries: true,
        orphanedSymbols: ["ADAUSDT"],
        missingRuntimeSymbols: [],
        unmatchedOrderSymbols: []
      },
      exchangeSafety: {
        globalFreezeEntries: false,
        blockedSymbols: [{ symbol: "SOLUSDT" }]
      },
      capitalGovernor: {
        allowEntries: true
      },
      readiness: {
        reasons: ["exchange_truth_freeze", "lifecycle_attention_required"]
      },
      service: {}
    });

    assert.equal(summary.primaryRootBlocker?.reason, "exchange_truth_freeze");
    assert.ok(summary.blockedSymbols.some((item) => item.symbol === "BTCUSDT"));
    assert.ok(summary.blockedSymbols.some((item) => item.symbol === "ETHUSDT"));
    assert.ok(summary.blockerGraph.some((item) => item.reason === "execution_intent_ambiguous"));
  });

  await runCheck("root blocker orchestrator keeps symbol-scoped blockers local when no global freeze exists", async () => {
    const summary = buildRootBlockerOrchestrator({
      runtime: {
        orderLifecycle: {
          pendingActions: [
            { id: "rr-1", symbol: "XRPUSDT", state: "reconcile_required", reason: "protection_missing" }
          ],
          executionIntentLedger: {
            unresolvedIntentIds: [],
            intents: {}
          }
        }
      },
      exchangeTruth: { freezeEntries: false },
      exchangeSafety: { globalFreezeEntries: false, blockedSymbols: [] },
      capitalGovernor: { allowEntries: true },
      readiness: { reasons: [] },
      service: {}
    });

    assert.equal(summary.primaryRootBlocker?.reason, "reconcile_required");
    assert.equal(summary.globalBlockers.length, 0);
    assert.equal(summary.blockedSymbols[0]?.symbol, "XRPUSDT");
  });
}
