export async function registerDashboardClosedTradeMetricsTests({ runCheck, assert, TradingBot, makeConfig }) {
  await runCheck("dashboard closed trades reconstruct non-zero MFE MAE and exit efficiency for legacy trade rows", () => {
    const bot = Object.create(TradingBot.prototype);
    bot.config = makeConfig({ botMode: "paper" });

    const legacyWinner = bot.buildDashboardTradeView(bot.buildTradeView({
      id: "legacy-win",
      symbol: "BTCUSDT",
      entryAt: "2026-05-20T10:00:00.000Z",
      exitAt: "2026-05-20T10:15:00.000Z",
      entryPrice: 100,
      exitPrice: 103,
      quantity: 1,
      totalCost: 100,
      proceeds: 103,
      pnlQuote: 3,
      netPnlPct: 0.03,
      maximumFavorableExcursionPct: 0,
      maximumAdverseExcursionPct: 0,
      exitEfficiencyPct: 0
    }));
    const legacyLoser = bot.buildDashboardTradeView(bot.buildTradeView({
      id: "legacy-loss",
      symbol: "ETHUSDT",
      entryAt: "2026-05-20T10:00:00.000Z",
      exitAt: "2026-05-20T10:15:00.000Z",
      entryPrice: 100,
      exitPrice: 98,
      quantity: 1,
      totalCost: 100,
      proceeds: 98,
      pnlQuote: -2,
      netPnlPct: -0.02
    }));

    assert.equal(legacyWinner.maximumFavorableExcursionPct, 0.03);
    assert.equal(legacyWinner.exitEfficiencyPct, 1);
    assert.notEqual(legacyWinner.tradeQualityLabel, "bad_entry_bad_exit");
    assert.equal(legacyLoser.maximumAdverseExcursionPct, -0.02);
  });
}
