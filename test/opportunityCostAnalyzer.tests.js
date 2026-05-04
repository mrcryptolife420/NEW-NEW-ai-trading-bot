import { buildOpportunityCostAnalysis } from "../src/runtime/opportunityCostAnalyzer.js";

const NOW = "2026-05-04T12:00:00.000Z";

export async function registerOpportunityCostAnalyzerTests({ runCheck, assert }) {
  await runCheck("opportunity cost analyzer keeps fast winner low risk", async () => {
    const summary = buildOpportunityCostAnalysis({
      now: NOW,
      openPositions: [{
        symbol: "BTCUSDT",
        entryAt: "2026-05-04T11:40:00.000Z",
        entryPrice: 100,
        markPrice: 103,
        quantity: 1,
        entryQuality: 0.78
      }]
    });
    assert.equal(summary.status, "ok");
    assert.ok(summary.opportunityCostScore < 0.45);
    assert.equal(summary.forcedExit, false);
  });

  await runCheck("opportunity cost analyzer flags slow loser", async () => {
    const summary = buildOpportunityCostAnalysis({
      now: NOW,
      openPositions: [{
        symbol: "ETHUSDT",
        entryAt: "2026-05-03T20:00:00.000Z",
        entryPrice: 100,
        markPrice: 96,
        quantity: 5,
        entryQuality: 0.45
      }],
      candidates: [{ symbol: "SOLUSDT", netExecutableExpectancyScore: 0.82 }]
    });
    assert.equal(summary.status, "high");
    assert.equal(summary.worstPosition.symbol, "ETHUSDT");
    assert.equal(summary.worstPosition.forcedExit, false);
  });

  await runCheck("opportunity cost analyzer detects flat stagnant trade", async () => {
    const summary = buildOpportunityCostAnalysis({
      now: NOW,
      openPositions: [{
        symbol: "BNBUSDT",
        entryAt: "2026-05-04T00:00:00.000Z",
        entryPrice: 100,
        markPrice: 100.05,
        quantity: 10,
        maximumFavorableExcursionPct: 0.014
      }],
      config: { opportunityCostStaleHoldMinutes: 480 }
    });
    assert.ok(["watch", "high"].includes(summary.status));
    assert.ok(summary.stagnationRisk >= 0.45);
  });

  await runCheck("opportunity cost analyzer surfaces idle capital with strong candidate", async () => {
    const summary = buildOpportunityCostAnalysis({
      openPositions: [],
      candidates: [{ symbol: "XRPUSDT", probability: 0.88 }],
      accountEquity: 1_000,
      idleQuote: 800
    });
    assert.ok(["watch", "high"].includes(summary.status));
    assert.ok(summary.idleCapitalRisk > 0);
    assert.equal(summary.timeInMarket.openPositionCount, 0);
  });

  await runCheck("opportunity cost analyzer tolerates missing candidate data", async () => {
    const summary = buildOpportunityCostAnalysis({
      now: NOW,
      openPositions: [{ symbol: "ADAUSDT", entryAt: null, quantity: 0 }],
      candidates: [null, {}]
    });
    assert.ok(Number.isFinite(summary.opportunityCostScore));
    assert.equal(summary.liveBehaviorChanged, false);
    assert.equal(summary.diagnosticsOnly, true);
  });
}
