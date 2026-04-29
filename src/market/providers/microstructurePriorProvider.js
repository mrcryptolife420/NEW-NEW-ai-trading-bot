import { clamp } from "../../utils/math.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value, 0).toFixed(digits));
}

export function buildMicrostructurePriorProvider({
  enabled = true,
  marketSnapshot = {},
  sessionSummary = {},
  executionFeedback = {}
} = {}) {
  if (!enabled) {
    return {
      id: "microstructure_priors",
      status: "disabled",
      enabled: false,
      score: 0,
      note: "Microstructure-prior provider disabled.",
      data: {}
    };
  }
  const spreadBps = safeNumber(marketSnapshot?.book?.spreadBps, Number.NaN);
  const depthConfidence = safeNumber(marketSnapshot?.book?.depthConfidence, Number.NaN);
  const queueRefreshScore = safeNumber(marketSnapshot?.book?.queueRefreshScore, Number.NaN);
  const sessionRisk = safeNumber(sessionSummary?.riskScore, Number.NaN);
  const priorScore = clamp(
    (Number.isFinite(depthConfidence) ? depthConfidence * 0.38 : 0.19) +
      (Number.isFinite(spreadBps) ? Math.max(0, 1 - spreadBps / 25) * 0.22 : 0.11) +
      (Number.isFinite(queueRefreshScore) ? clamp((queueRefreshScore + 1) / 2, 0, 1) * 0.16 : 0.08) +
      (1 - safeNumber(executionFeedback.executionPainScore, 0.3)) * 0.16 -
      safeNumber(sessionRisk, 0.15) * 0.08,
    0,
    1
  );
  const availableSignals = [spreadBps, depthConfidence, queueRefreshScore].filter((value) => Number.isFinite(value)).length;
  const status = availableSignals >= 2
    ? "ready"
    : availableSignals >= 1 || executionFeedback?.sampleSize > 0
      ? "degraded"
      : "unavailable";
  return {
    id: "microstructure_priors",
    status,
    enabled: true,
    score: num(priorScore),
    note: status === "ready"
      ? "Session microstructure prior built from orderbook and execution-memory context."
      : status === "degraded"
        ? "Session microstructure prior partially available."
        : "Session microstructure prior unavailable.",
    data: {
      score: num(priorScore),
      spreadBps: Number.isFinite(spreadBps) ? num(spreadBps, 2) : null,
      depthConfidence: Number.isFinite(depthConfidence) ? num(depthConfidence, 4) : null,
      queueRefreshScore: Number.isFinite(queueRefreshScore) ? num(queueRefreshScore, 4) : null,
      session: sessionSummary?.session || null,
      regime: sessionRisk >= 0.6 ? "fragile" : "stable"
    }
  };
}
