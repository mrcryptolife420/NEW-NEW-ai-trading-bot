import { buildFundingOiMatrix } from "../market/derivativesMatrix.js";
import { buildLeadershipContext } from "../market/leadershipContext.js";
import { detectFailedBreakout } from "../strategy/failedBreakoutDetector.js";
import { buildNetEdgeGate } from "./netEdgeGate.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function firstFinite(values = [], fallback = 0) {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function disabled(id, reason = "config_disabled") {
  return {
    id,
    enabled: false,
    status: "disabled",
    runtimeApplied: false,
    diagnosticOnly: true,
    reason
  };
}

function diagnosticFailure(id, error) {
  return {
    id,
    enabled: true,
    status: "degraded",
    runtimeApplied: false,
    diagnosticOnly: true,
    reason: "diagnostic_failed",
    note: error?.message || "Diagnostic calculation failed."
  };
}

function resolveSnapshot(candidate = {}) {
  const decision = candidate.decision || candidate;
  const marketSnapshot = candidate.marketSnapshot || decision.marketSnapshot || {};
  const market = marketSnapshot.market || candidate.market || decision.market || {};
  const book = marketSnapshot.book || candidate.book || candidate.orderBook || decision.orderBook || {};
  const stream = candidate.streamFeatures || decision.streamFeatures || marketSnapshot.stream || decision.streamSnapshot || {};
  return { decision, marketSnapshot, market, book, stream };
}

function buildDiagnosticNetEdge({ candidate = {}, config = {}, botMode = "paper" } = {}) {
  if (config.enableNetEdgeGate !== true) {
    return disabled("net_edge_gate");
  }
  const { decision } = resolveSnapshot(candidate);
  try {
    const gate = buildNetEdgeGate({
      botMode,
      config,
      candidate: {
        ...candidate,
        expectedNetEdge: decision.expectedNetEdge || candidate.expectedNetEdge || {},
        score: candidate.score || { probability: candidate.probability },
        threshold: decision.threshold ?? candidate.threshold,
        effectiveThreshold: decision.effectiveThreshold ?? candidate.effectiveThreshold,
        execution: decision.executionPlan || candidate.executionPlan || {},
        executionPlan: decision.executionPlan || candidate.executionPlan || {},
        executionCost: decision.executionCostBudgetApplied || candidate.executionCost || {}
      },
      executionFeedback: decision.executionQualityMemory || candidate.executionQualityMemory || candidate.executionFeedback || null
    });
    return {
      ...gate,
      id: "net_edge_gate",
      runtimeApplied: false,
      diagnosticOnly: true,
      wouldBlock: Boolean(gate.block),
      block: false,
      liveBehaviorPolicy: "diagnostics_only_batch_3"
    };
  } catch (error) {
    return diagnosticFailure("net_edge_gate", error);
  }
}

function buildDiagnosticFailedBreakout({ candidate = {}, config = {} } = {}) {
  if (config.enableFailedBreakoutDetector !== true) {
    return disabled("failed_breakout_detector");
  }
  const { market, book, stream } = resolveSnapshot(candidate);
  try {
    const result = detectFailedBreakout({
      market,
      book,
      stream,
      timeframeSummary: candidate.timeframeSummary || candidate.timeframe || {},
      config
    });
    return {
      id: "failed_breakout_detector",
      enabled: true,
      runtimeApplied: false,
      diagnosticOnly: true,
      ...result
    };
  } catch (error) {
    return diagnosticFailure("failed_breakout_detector", error);
  }
}

function buildDiagnosticFundingOiMatrix({ candidate = {}, config = {} } = {}) {
  if (config.enableFundingOiMatrix !== true) {
    return disabled("funding_oi_matrix");
  }
  const { market, stream } = resolveSnapshot(candidate);
  const structure = candidate.marketStructureSummary || candidate.marketStructure || {};
  const derivatives = candidate.marketProviderSummary?.derivatives || candidate.marketProviders?.derivatives || {};
  try {
    const result = buildFundingOiMatrix({
      fundingRate: firstFinite([structure.fundingRate, market.fundingRate, derivatives.fundingRate], 0),
      fundingAcceleration: firstFinite([structure.fundingAcceleration, market.fundingAcceleration, derivatives.fundingAcceleration], 0),
      openInterestDeltaPct: firstFinite([structure.openInterestDeltaPct, market.openInterestDeltaPct, derivatives.openInterestDeltaPct], 0),
      openInterestAccelerationPct: firstFinite([
        structure.openInterestAccelerationPct,
        market.openInterestAccelerationPct,
        derivatives.openInterestAccelerationPct
      ], 0),
      basisBps: firstFinite([structure.basisBps, market.basisBps, derivatives.basisBps], 0),
      basisSlopeBps: firstFinite([structure.basisSlopeBps, market.basisSlopeBps, derivatives.basisSlopeBps], 0),
      priceChangePct: firstFinite([market.priceChangePct, market.momentum20, market.momentum5], 0),
      takerImbalance: firstFinite([structure.takerImbalance, market.takerImbalance, stream.tradeFlowImbalance], 0)
    });
    return {
      id: "funding_oi_matrix",
      enabled: true,
      runtimeApplied: false,
      diagnosticOnly: true,
      ...result
    };
  } catch (error) {
    return diagnosticFailure("funding_oi_matrix", error);
  }
}

function buildDiagnosticLeadership({ candidate = {}, config = {} } = {}) {
  const leadershipEnabled = config.enableLeadershipContext === true;
  const divergenceEnabled = config.enableSpotFuturesDivergence === true;
  if (!leadershipEnabled && !divergenceEnabled) {
    return {
      leadershipContext: disabled("leadership_context"),
      spotFuturesDivergence: disabled("spot_futures_divergence")
    };
  }
  const { market, book } = resolveSnapshot(candidate);
  const macro = candidate.marketProviderSummary?.macro || candidate.marketProviders?.macro || {};
  const crossExchange = candidate.marketProviderSummary?.crossExchange || candidate.marketProviders?.crossExchange || {};
  const globalContext = candidate.globalMarketContextSummary || candidate.globalMarketContext || {};
  const structure = candidate.marketStructureSummary || candidate.marketStructure || {};
  const spotPrice = firstFinite([book.mid, book.bid, market.close, candidate.price, candidate.currentPrice], Number.NaN);
  const futuresPrice = firstFinite([
    crossExchange.futuresPrice,
    crossExchange.referencePrice,
    structure.futuresPrice,
    market.futuresPrice
  ], Number.NaN);
  try {
    const context = buildLeadershipContext({
      symbol: candidate.symbol || "",
      symbolReturnPct: firstFinite([market.priceChangePct, market.momentum20, market.momentum5], 0),
      btcReturnPct: firstFinite([globalContext.btcReturnPct, macro.btcReturnPct, market.btcReturnPct], 0),
      ethReturnPct: firstFinite([globalContext.ethReturnPct, macro.ethReturnPct, market.ethReturnPct], 0),
      sectorReturnPct: firstFinite([macro.sectorReturnPct, market.sectorReturnPct, market.sectorRelativeStrength], 0),
      spotPrice,
      futuresPrice,
      sectorBreadth: firstFinite([macro.sectorBreadth, globalContext.sectorBreadth, market.sectorBreadth], 0.5),
      sectorMomentum: firstFinite([macro.sectorMomentum, market.sectorMomentum], 0)
    });
    const spotFuturesDivergence = divergenceEnabled
      ? {
          id: "spot_futures_divergence",
          enabled: true,
          runtimeApplied: false,
          diagnosticOnly: true,
          status: Number.isFinite(spotPrice) && Number.isFinite(futuresPrice) ? context.divergenceState : "unavailable",
          divergenceState: context.divergenceState,
          spotFuturesDivergenceBps: context.spotFuturesDivergenceBps,
          reason: Number.isFinite(spotPrice) && Number.isFinite(futuresPrice) ? null : "spot_or_futures_price_missing"
        }
      : disabled("spot_futures_divergence");
    return {
      leadershipContext: leadershipEnabled
        ? {
            id: "leadership_context",
            enabled: true,
            runtimeApplied: false,
            diagnosticOnly: true,
            status: context.leadershipState,
            ...context
          }
        : disabled("leadership_context"),
      spotFuturesDivergence
    };
  } catch (error) {
    return {
      leadershipContext: diagnosticFailure("leadership_context", error),
      spotFuturesDivergence: diagnosticFailure("spot_futures_divergence", error)
    };
  }
}

export function buildDecisionSupportDiagnostics({
  candidate = {},
  config = {},
  botMode = config.botMode || "paper"
} = {}) {
  const netEdgeGate = buildDiagnosticNetEdge({ candidate, config, botMode });
  const failedBreakoutDetector = buildDiagnosticFailedBreakout({ candidate, config });
  const fundingOiMatrix = buildDiagnosticFundingOiMatrix({ candidate, config });
  const { leadershipContext, spotFuturesDivergence } = buildDiagnosticLeadership({ candidate, config });
  const items = [netEdgeGate, failedBreakoutDetector, fundingOiMatrix, leadershipContext, spotFuturesDivergence];
  const enabledItems = items.filter((item) => item.enabled);
  const degradedItems = enabledItems.filter((item) => ["degraded", "unavailable"].includes(item.status));
  return {
    status: enabledItems.length
      ? degradedItems.length
        ? "degraded"
        : "ready"
      : "disabled",
    runtimeApplied: false,
    diagnosticOnly: true,
    netEdgeGate,
    failedBreakoutDetector,
    fundingOiMatrix,
    leadershipContext,
    spotFuturesDivergence,
    summary: {
      enabledCount: enabledItems.length,
      degradedCount: degradedItems.length,
      netEdgeBps: netEdgeGate.netEdgeBps == null ? null : num(netEdgeGate.netEdgeBps, 2),
      failedBreakoutRisk: failedBreakoutDetector.failedBreakoutRisk == null ? null : num(failedBreakoutDetector.failedBreakoutRisk),
      fundingOiStatus: fundingOiMatrix.status || null,
      leadershipState: leadershipContext.leadershipState || leadershipContext.status || null,
      spotFuturesDivergenceState: spotFuturesDivergence.divergenceState || spotFuturesDivergence.status || null
    }
  };
}
