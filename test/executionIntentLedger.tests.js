import {
  beginExecutionIntent,
  buildExecutionIntentBlockers,
  recoverStaleExecutionIntents
} from "../src/execution/executionIntentLedger.js";

export async function registerExecutionIntentLedgerTests({
  runCheck,
  assert
}) {
  await runCheck("execution intent ledger dedupes unresolved actions and recovers stale intents", async () => {
    const runtime = { orderLifecycle: {} };
    const first = beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "BTCUSDT",
      positionId: "pos-1",
      idempotencyKey: "entry_open"
    });
    assert.equal(first.duplicateUnresolved, false);
    assert.ok(first.intent?.id);

    const duplicate = beginExecutionIntent(runtime, {
      kind: "entry",
      symbol: "BTCUSDT",
      positionId: "pos-1",
      idempotencyKey: "entry_open"
    });
    assert.equal(duplicate.duplicateUnresolved, true);
    assert.equal(duplicate.intent?.id, first.intent?.id);

    const recovered = recoverStaleExecutionIntents(runtime, {
      reason: "unclean_restart",
      at: "2026-04-22T10:00:00.000Z"
    });
    assert.equal(recovered, 1);

    const blockers = buildExecutionIntentBlockers(runtime);
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].symbol, "BTCUSDT");
    assert.equal(blockers[0].scope, "symbol");
    assert.equal(blockers[0].reason, "unclean_restart");
    assert.equal(blockers[0].resumeRequired, true);
  });
}
