import { buildSymbolQualityDecay, buildSymbolQualityDecaySummary } from "../src/runtime/symbolQualityDecay.js";
import { normalizeDashboardSnapshotPayload } from "../src/runtime/dashboardPayloadNormalizers.js";

export async function registerSymbolQualityDecayTests({ runCheck, assert }) {
  const now = "2026-05-04T10:00:00.000Z";

  await runCheck("symbol quality decay penalizes repeated bad fills without NaN output", async () => {
    const result = buildSymbolQualityDecay({
      symbol: "BADUSDT",
      now,
      trades: [
        { symbol: "BADUSDT", exitAt: now, pnlQuote: -8, executionQualityScore: 0.31, entryExecutionAttribution: { slippageDeltaBps: 8.4 } },
        { symbol: "BADUSDT", exitAt: now, pnlQuote: -5, executionQualityScore: 0.36, entryExecutionAttribution: { realizedTouchSlippageBps: 7.2 } }
      ],
      fills: [
        { symbol: "BADUSDT", at: now, slippageBps: 9.5, makerFillRatio: 0.02 }
      ]
    });

    assert.ok(Number.isFinite(result.qualityScore));
    assert.ok(Number.isFinite(result.rankPenalty));
    assert.ok(result.rankPenalty > 0.2);
    assert.ok(result.cooldownUntil);
    assert.ok(result.reasons.some((reason) => reason.code === "bad_fills"));
    assert.equal(result.diagnosticsOnly, true);
    assert.equal(result.liveBehaviorChanged, false);
  });

  await runCheck("symbol quality decay penalizes repeated blockers and keeps recovery requirements explicit", async () => {
    const result = buildSymbolQualityDecay({
      symbol: "BLOCKUSDT",
      now,
      decisions: [
        { symbol: "BLOCKUSDT", createdAt: now, allow: false, reasons: ["model_confidence_too_low"] },
        { symbol: "BLOCKUSDT", createdAt: now, approved: false, rootBlocker: "meta_followthrough_caution" },
        { symbol: "BLOCKUSDT", createdAt: now, allow: false, blockedReasons: ["data_quality_stale"] },
        { symbol: "BLOCKUSDT", createdAt: now, allow: true, dataQualityScore: 0.7 }
      ]
    });

    assert.ok(result.rankPenalty > 0);
    assert.ok(result.reasons.some((reason) => reason.code === "repeated_blockers"));
    assert.ok(result.recoveryConditions.includes("lower_blocker_rate_for_symbol"));
    assert.ok(result.recoveryConditions.includes("clean_decision_cycles_without_hard_blockers"));
  });

  await runCheck("symbol quality decay recovers after clean cycles and does not permanently blacklist", async () => {
    const weak = buildSymbolQualityDecay({
      symbol: "RECOVERUSDT",
      now,
      trades: [
        { symbol: "RECOVERUSDT", exitAt: now, pnlQuote: -3, executionQualityScore: 0.33, entryExecutionAttribution: { slippageDeltaBps: 7 } },
        { symbol: "RECOVERUSDT", exitAt: now, pnlQuote: -4, executionQualityScore: 0.35, entryExecutionAttribution: { slippageDeltaBps: 8 } }
      ]
    });
    const recovered = buildSymbolQualityDecay({
      symbol: "RECOVERUSDT",
      now,
      decisions: [
        { symbol: "RECOVERUSDT", createdAt: now, allow: true, dataQualityScore: 0.75 },
        { symbol: "RECOVERUSDT", createdAt: now, approved: true, dataQualityScore: 0.8 }
      ],
      trades: [
        { symbol: "RECOVERUSDT", exitAt: now, pnlQuote: 8, netPnlPct: 0.01, executionQualityScore: 0.72, captureEfficiency: 0.55, entryExecutionAttribution: { slippageDeltaBps: 1.2 } },
        { symbol: "RECOVERUSDT", exitAt: now, pnlQuote: 5, netPnlPct: 0.008, executionQualityScore: 0.68, captureEfficiency: 0.48, entryExecutionAttribution: { slippageDeltaBps: 1.6 } }
      ]
    });

    assert.ok(recovered.qualityScore > weak.qualityScore);
    assert.equal(recovered.cooldownUntil, null);
    assert.equal(recovered.status, "healthy");
    assert.equal(recovered.autoPromotesRanking, false);
  });

  await runCheck("symbol quality decay handles missing data with safe unknown status", async () => {
    const result = buildSymbolQualityDecay({ symbol: "EMPTYUSDT", now });

    assert.equal(result.status, "unknown");
    assert.ok(Number.isFinite(result.qualityScore));
    assert.ok(Number.isFinite(result.rankPenalty));
    assert.ok(result.warnings.includes("missing_symbol_quality_data"));
    assert.equal(result.cooldownUntil, null);
  });

  await runCheck("symbol quality decay leaves healthy symbols unpenalized", async () => {
    const result = buildSymbolQualityDecay({
      symbol: "GOODUSDT",
      now,
      decisions: [
        { symbol: "GOODUSDT", createdAt: now, allow: true, dataQualityScore: 0.84 },
        { symbol: "GOODUSDT", createdAt: now, approved: true, dataQualityScore: 0.8 }
      ],
      trades: [
        { symbol: "GOODUSDT", exitAt: now, pnlQuote: 12, netPnlPct: 0.015, executionQualityScore: 0.78, captureEfficiency: 0.62, entryExecutionAttribution: { slippageDeltaBps: 0.8 } },
        { symbol: "GOODUSDT", exitAt: now, pnlQuote: 7, netPnlPct: 0.009, executionQualityScore: 0.7, captureEfficiency: 0.52, entryExecutionAttribution: { slippageDeltaBps: 1.2 } }
      ]
    });

    assert.equal(result.status, "healthy");
    assert.equal(result.rankPenalty, 0);
    assert.equal(result.cooldownUntil, null);
    assert.ok(result.qualityScore >= 0.95);
  });

  await runCheck("symbol quality decay summary is dashboard fallback-safe", async () => {
    const bad = buildSymbolQualityDecay({
      symbol: "BADUSDT",
      now,
      events: [{ symbol: "BADUSDT", at: now, type: "protective_order_issue", status: "stop_limit_stuck" }]
    });
    const summary = buildSymbolQualityDecaySummary({
      now,
      symbols: ["BADUSDT"],
      bySymbol: { BADUSDT: bad }
    });
    const normalized = normalizeDashboardSnapshotPayload({
      symbolQualityDecaySummary: summary
    });

    assert.equal(summary.trackedSymbols, 1);
    assert.equal(normalized.symbolQualityDecaySummary.trackedSymbols, 1);
    assert.equal(normalized.symbolQualityDecaySummary.symbols[0].symbol, "BADUSDT");
  });
}
