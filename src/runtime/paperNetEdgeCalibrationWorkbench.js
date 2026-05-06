import { buildNetEdgeGate } from "./netEdgeGate.js";
import { simulateMicrostructureFill } from "../execution/microstructureFillSimulator.js";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finite(value, digits = 4) {
  return Number(num(value, 0).toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, num(value, min)));
}

function text(value, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function adverseSlippageBps({ side = "BUY", expectedPrice = 0, fillPrice = 0 } = {}) {
  const expected = num(expectedPrice, 0);
  const fill = num(fillPrice, 0);
  if (expected <= 0 || fill <= 0) return 0;
  const raw = `${side}`.toUpperCase() === "SELL"
    ? ((expected - fill) / expected) * 10_000
    : ((fill - expected) / expected) * 10_000;
  return Math.max(0, raw);
}

function resolveFeeBps(sample = {}) {
  const direct = sample.realizedFeeBps ?? sample.feeBps ?? sample.trade?.feeBps ?? sample.trade?.observedFeeBps;
  if (Number.isFinite(Number(direct))) return Math.max(0, Number(direct));
  const feeQuote = num(sample.feeQuote ?? sample.trade?.feeQuote, 0);
  const notional = num(sample.notional ?? sample.trade?.quoteQty ?? sample.trade?.cummulativeQuoteQty, 0);
  return notional > 0 ? (feeQuote / notional) * 10_000 : 0;
}

function resolveRealizedSlippageBps(sample = {}) {
  const direct = sample.realizedSlippageBps ?? sample.slippageBps ?? sample.trade?.slippageBps;
  if (Number.isFinite(Number(direct))) return Math.max(0, Number(direct));
  return adverseSlippageBps({
    side: sample.side || sample.trade?.side,
    expectedPrice: sample.expectedPrice || sample.expectedFillPrice || sample.trade?.expectedPrice,
    fillPrice: sample.fillPrice || sample.trade?.fillPrice || sample.trade?.price
  });
}

function buildSimulation(sample = {}) {
  if (sample.simulation && typeof sample.simulation === "object") {
    return {
      expectedSlippageBps: Math.max(0, num(sample.simulation.expectedSlippageBps, 0)),
      fillProbability: clamp(sample.simulation.fillProbability ?? 1, 0, 1),
      liquidityScore: clamp(sample.simulation.liquidityScore ?? 1, 0, 1),
      warnings: arr(sample.simulation.warnings)
    };
  }
  const micro = sample.microstructure || sample.orderBook || sample.marketSnapshot;
  return simulateMicrostructureFill({
    orderType: sample.orderStyle || sample.orderType || sample.style || "market",
    quantity: sample.quantity || sample.qty,
    notional: sample.notional || sample.quoteQty,
    spreadBps: sample.spreadBps ?? micro?.spreadBps ?? micro?.book?.spreadBps,
    bookDepthUsd: sample.bookDepthUsd ?? micro?.bookDepthUsd ?? micro?.totalDepthNotional ?? micro?.book?.totalDepthNotional,
    candleVolumeUsd: sample.candleVolumeUsd ?? micro?.candleVolumeUsd ?? micro?.volumeUsd,
    volatilityPct: sample.volatilityPct ?? micro?.realizedVolPct,
    latencyMs: sample.latencyMs,
    urgency: sample.urgency,
    makerQueuePosition: sample.makerQueuePosition
  });
}

function sampleKey(sample = {}) {
  return [
    text(sample.symbol, "UNKNOWN").toUpperCase(),
    text(sample.session || sample.utcSession || "unknown_session"),
    text(sample.orderStyle || sample.orderType || sample.style || "unknown_style")
  ].join("|");
}

function average(values = []) {
  const finiteValues = values.map((value) => Number(value)).filter(Number.isFinite);
  return finiteValues.length ? finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length : 0;
}

function percentile(values = [], pct = 0.95) {
  const sorted = values.map((value) => Number(value)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * pct) - 1));
  return sorted[index];
}

function classifyGroup(group, config = {}) {
  const maxSlippageErrorBps = num(config.paperNetEdgeMaxSlippageErrorBps, 6);
  const highFeeBps = num(config.paperNetEdgeHighFeeBps, 18);
  const minFillConfidence = num(config.paperNetEdgeMinFillConfidence, 0.55);
  const warnings = [];
  const recommendations = [];
  if (group.avgFeeBps >= highFeeBps) {
    warnings.push("high_realized_fee_drag");
    recommendations.push("review_fee_model_or_symbol_fee_tier");
  }
  if (group.avgSlippageErrorBps >= maxSlippageErrorBps) {
    warnings.push("slippage_model_underestimates_drag");
    recommendations.push("raise_paper_slippage_assumption_for_scope");
  }
  if (group.avgFillConfidence < minFillConfidence) {
    warnings.push("low_fill_confidence");
    recommendations.push("reduce_paper_fill_confidence_or_prefer_safer_order_style");
  }
  if (group.avgNetEdgeBps < 0) {
    warnings.push("negative_realized_net_edge");
    recommendations.push("review_net_edge_gate_before_trusting_scope");
  }
  return {
    warnings: [...new Set(warnings)],
    recommendations: [...new Set(recommendations)]
  };
}

function normalizeSample(sample = {}, { config = {}, botMode = "paper" } = {}) {
  const realizedFeeBps = resolveFeeBps(sample);
  const realizedSlippageBps = resolveRealizedSlippageBps(sample);
  const simulation = buildSimulation(sample);
  const simulatedFeeBps = Math.max(0, num(sample.simulatedFeeBps ?? sample.expectedFeeBps ?? sample.candidate?.expectedNetEdge?.feeBps, realizedFeeBps));
  const simulatedSlippageBps = Math.max(0, num(sample.simulatedSlippageBps ?? sample.expectedSlippageBps ?? simulation.expectedSlippageBps, 0));
  const realizedDragBps = realizedFeeBps + realizedSlippageBps;
  const simulatedDragBps = simulatedFeeBps + simulatedSlippageBps;
  const slippageErrorBps = Math.max(0, realizedSlippageBps - simulatedSlippageBps);
  const netEdge = buildNetEdgeGate({
    botMode,
    config,
    candidate: {
      ...(sample.candidate || {}),
      expectedNetEdge: {
        ...(sample.candidate?.expectedNetEdge || {}),
        feeBps: realizedFeeBps,
        slippageBps: realizedSlippageBps
      }
    }
  });
  const fillConfidence = clamp(
    sample.fillConfidence ?? sample.fillProbability ?? simulation.fillProbability,
    0,
    1
  );
  return {
    sampleId: sample.id || sample.sampleId || null,
    symbol: text(sample.symbol, "UNKNOWN").toUpperCase(),
    session: text(sample.session || sample.utcSession || "unknown_session"),
    orderStyle: text(sample.orderStyle || sample.orderType || sample.style || "unknown_style"),
    realizedFeeBps: finite(realizedFeeBps, 2),
    realizedSlippageBps: finite(realizedSlippageBps, 2),
    simulatedFeeBps: finite(simulatedFeeBps, 2),
    simulatedSlippageBps: finite(simulatedSlippageBps, 2),
    realizedDragBps: finite(realizedDragBps, 2),
    simulatedDragBps: finite(simulatedDragBps, 2),
    dragErrorBps: finite(realizedDragBps - simulatedDragBps, 2),
    slippageErrorBps: finite(slippageErrorBps, 2),
    fillConfidence: finite(fillConfidence, 3),
    liquidityScore: finite(simulation.liquidityScore ?? 1, 3),
    netEdgeBps: finite(netEdge.netEdgeBps, 2),
    netEdgeStatus: netEdge.status,
    simulationWarnings: arr(simulation.warnings)
  };
}

export function buildPaperNetEdgeCalibrationWorkbench({
  samples = [],
  config = {},
  botMode = config.botMode || "paper"
} = {}) {
  const normalized = arr(samples).map((sample) => normalizeSample(sample, { config, botMode }));
  const groups = new Map();
  for (const sample of normalized) {
    const key = sampleKey(sample);
    const current = groups.get(key) || {
      key,
      symbol: sample.symbol,
      session: sample.session,
      orderStyle: sample.orderStyle,
      samples: []
    };
    current.samples.push(sample);
    groups.set(key, current);
  }

  const groupSummaries = [...groups.values()].map((group) => {
    const summary = {
      key: group.key,
      symbol: group.symbol,
      session: group.session,
      orderStyle: group.orderStyle,
      sampleCount: group.samples.length,
      avgFeeBps: finite(average(group.samples.map((sample) => sample.realizedFeeBps)), 2),
      avgSlippageBps: finite(average(group.samples.map((sample) => sample.realizedSlippageBps)), 2),
      avgSimulatedSlippageBps: finite(average(group.samples.map((sample) => sample.simulatedSlippageBps)), 2),
      avgSlippageErrorBps: finite(average(group.samples.map((sample) => sample.slippageErrorBps)), 2),
      p95DragErrorBps: finite(percentile(group.samples.map((sample) => sample.dragErrorBps), 0.95), 2),
      avgFillConfidence: finite(average(group.samples.map((sample) => sample.fillConfidence)), 3),
      avgLiquidityScore: finite(average(group.samples.map((sample) => sample.liquidityScore)), 3),
      avgNetEdgeBps: finite(average(group.samples.map((sample) => sample.netEdgeBps)), 2)
    };
    const classification = classifyGroup(summary, config);
    return {
      ...summary,
      warnings: classification.warnings,
      recommendations: classification.recommendations
    };
  }).sort((left, right) => right.warnings.length - left.warnings.length || left.key.localeCompare(right.key));

  const allWarnings = [...new Set(groupSummaries.flatMap((group) => group.warnings))];
  const allRecommendations = [...new Set(groupSummaries.flatMap((group) => group.recommendations))];
  const status = !normalized.length
    ? "empty"
    : allWarnings.length
      ? "warning"
      : "ready";

  return {
    status,
    botMode,
    sampleCount: normalized.length,
    groupCount: groupSummaries.length,
    groups: groupSummaries,
    warnings: allWarnings,
    recommendations: allRecommendations,
    diagnosticsOnly: botMode === "live",
    paperOnly: botMode !== "live",
    liveBehaviorChanged: false,
    liveThresholdReliefAllowed: false,
    liveGateEnabled: false
  };
}

export function summarizePaperNetEdgeCalibration(input = {}) {
  return buildPaperNetEdgeCalibrationWorkbench(input);
}
