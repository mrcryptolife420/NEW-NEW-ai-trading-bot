import { buildPerformanceLedger } from "../src/runtime/performanceLedger.js";

export async function registerPerformanceLedgerTests({ runCheck, assert }) {
  await runCheck("performance ledger handles partial fills with quote fees", async () => {
    const ledger = buildPerformanceLedger({
      generatedAt: "2026-05-04T12:00:00.000Z",
      trades: [{
        id: "t1",
        symbol: "BTCUSDT",
        entryAt: "2026-05-04T09:00:00.000Z",
        exitAt: "2026-05-04T10:00:00.000Z",
        quantity: 0.1,
        closedQuantity: 0.1,
        entryPrice: 100_000,
        exitPrice: 101_000,
        entryFeeQuote: 10,
        exitFeeQuote: 10,
        fills: [
          { side: "buy", quantity: 0.05, price: 100_000, feeQuote: 5 },
          { side: "buy", quantity: 0.05, price: 100_000, feeQuote: 5 },
          { side: "sell", quantity: 0.1, price: 101_000, feeQuote: 10 }
        ]
      }]
    });
    assert.equal(ledger.status, "ok");
    assert.equal(ledger.trades[0].fillCount, 3);
    assert.equal(ledger.trades[0].feesQuote, 20);
    assert.equal(ledger.trades[0].realizedPnlQuote, 80);
  });

  await runCheck("performance ledger tracks partial exits and dust", async () => {
    const ledger = buildPerformanceLedger({
      trades: [{
        id: "t2",
        symbol: "ETHUSDT",
        entryAt: "2026-05-04T09:00:00.000Z",
        exitAt: "2026-05-04T11:00:00.000Z",
        entryQuantity: 2,
        closedQuantity: 1.4,
        entryPrice: 2_000,
        exitPrice: 2_050,
        feeBase: 0.01,
        partialExits: [{ quantity: 0.7 }, { quantity: 0.7 }]
      }]
    });
    assert.equal(ledger.partialExitTradeCount, 1);
    assert.equal(ledger.trades[0].partialExitCount, 2);
    assert.ok(ledger.trades[0].dustQuantity > 0);
    assert.ok(ledger.reconciliation.issues.some((issue) => issue.code === "large_dust_residual"));
  });

  await runCheck("performance ledger handles base fees and break-even", async () => {
    const ledger = buildPerformanceLedger({
      trades: [{
        id: "t3",
        symbol: "BNBUSDT",
        entryAt: "2026-05-03T09:00:00.000Z",
        exitAt: "2026-05-03T10:00:00.000Z",
        quantity: 10,
        closedQuantity: 9.99,
        costBasisQuote: 6_000,
        proceedsQuote: 6_000,
        feeBase: 0.01
      }]
    });
    assert.ok(ledger.trades[0].labels.includes("break_even"));
    assert.equal(ledger.trades[0].feesBase, 0.01);
    assert.ok(Number.isFinite(ledger.trades[0].breakEvenPrice));
  });

  await runCheck("performance ledger summarizes negative PnL by day", async () => {
    const ledger = buildPerformanceLedger({
      trades: [
        { id: "t4", symbol: "SOLUSDT", exitAt: "2026-05-02T10:00:00.000Z", costBasisQuote: 1_000, proceedsQuote: 940, feeQuote: 2 },
        { id: "t5", symbol: "XRPUSDT", exitAt: "2026-05-02T11:00:00.000Z", costBasisQuote: 500, proceedsQuote: 525, feeQuote: 1 }
      ]
    });
    assert.equal(ledger.dailySummary.length, 1);
    assert.equal(ledger.dailySummary[0].day, "2026-05-02");
    assert.equal(ledger.dailySummary[0].tradeCount, 2);
    assert.equal(ledger.realizedPnlQuote, -38);
  });

  await runCheck("performance ledger reconciliation catches account delta mismatch", async () => {
    const ledger = buildPerformanceLedger({
      trades: [{ id: "t6", symbol: "ADAUSDT", exitAt: "2026-05-02T10:00:00.000Z", costBasisQuote: 100, proceedsQuote: 110 }],
      accountDeltas: [{ realizedPnl: 2 }]
    });
    assert.equal(ledger.status, "warning");
    assert.ok(ledger.reconciliation.issues.some((issue) => issue.code === "ledger_account_delta_mismatch"));
    assert.equal(ledger.readOnly, true);
    assert.equal(ledger.liveBehaviorChanged, false);
  });
}
