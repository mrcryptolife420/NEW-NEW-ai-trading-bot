function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function resolveSide(record = {}) {
  return `${record.side || record.entrySide || "BUY"}`.toUpperCase();
}

function resolvePaperPrice(record = {}) {
  return safeNumber(
    record.paperFillPrice ??
    record.simulatedFillPrice ??
    record.expectedFillPrice ??
    record.paper?.fillPrice,
    Number.NaN
  );
}

function resolveActualPrice(record = {}) {
  return safeNumber(
    record.liveFillPrice ??
    record.demoFillPrice ??
    record.actualFillPrice ??
    record.realizedFillPrice ??
    record.live?.fillPrice,
    Number.NaN
  );
}

function resolveExpectedSlippage(record = {}) {
  return safeNumber(
    record.simulatedSlippageBps ??
    record.expectedSlippageBps ??
    record.entryExecutionAttribution?.expectedSlippageBps,
    Number.NaN
  );
}

function resolveRealizedSlippage(record = {}) {
  return safeNumber(
    record.realizedSlippageBps ??
    record.entrySlippageBps ??
    record.entryExecutionAttribution?.entryTouchSlippageBps,
    Number.NaN
  );
}

function resolveExpectedFeeBps(record = {}) {
  return safeNumber(record.expectedFeeBps ?? record.feeModelBps ?? record.configFeeBps, Number.NaN);
}

function resolveObservedFeeBps(record = {}) {
  return safeNumber(record.observedFeeBps ?? record.observedEntryFeeBps ?? record.observedExitFeeBps, Number.NaN);
}

export function buildPaperLiveParityComparison(record = {}) {
  const paperPrice = resolvePaperPrice(record);
  const actualPrice = resolveActualPrice(record);
  const side = resolveSide(record);
  const hasPricePair = Number.isFinite(paperPrice) && paperPrice > 0 && Number.isFinite(actualPrice) && actualPrice > 0;
  const priceBiasBps = hasPricePair
    ? (side === "SELL"
        ? ((paperPrice - actualPrice) / paperPrice) * 10_000
        : ((actualPrice - paperPrice) / paperPrice) * 10_000)
    : null;
  const expectedSlippageBps = resolveExpectedSlippage(record);
  const realizedSlippageBps = resolveRealizedSlippage(record);
  const slippageBiasBps = Number.isFinite(expectedSlippageBps) && Number.isFinite(realizedSlippageBps)
    ? realizedSlippageBps - expectedSlippageBps
    : null;
  const expectedFeeBps = resolveExpectedFeeBps(record);
  const observedFeeBps = resolveObservedFeeBps(record);
  const feeBiasBps = Number.isFinite(expectedFeeBps) && Number.isFinite(observedFeeBps)
    ? observedFeeBps - expectedFeeBps
    : null;
  const components = [priceBiasBps, slippageBiasBps, feeBiasBps].filter((value) => Number.isFinite(value));
  const optimismBiasBps = components.length
    ? components.reduce((total, value) => total + value, 0) / components.length
    : null;
  return {
    symbol: record.symbol || null,
    side,
    paperPrice: Number.isFinite(paperPrice) ? paperPrice : null,
    actualPrice: Number.isFinite(actualPrice) ? actualPrice : null,
    priceBiasBps,
    expectedSlippageBps: Number.isFinite(expectedSlippageBps) ? expectedSlippageBps : null,
    realizedSlippageBps: Number.isFinite(realizedSlippageBps) ? realizedSlippageBps : null,
    slippageBiasBps,
    expectedFeeBps: Number.isFinite(expectedFeeBps) ? expectedFeeBps : null,
    observedFeeBps: Number.isFinite(observedFeeBps) ? observedFeeBps : null,
    feeBiasBps,
    optimismBiasBps
  };
}

export function buildPaperLiveParitySummary({ comparisons = [], trades = [], minSampleSize = 3 } = {}) {
  const source = arr(comparisons).length ? arr(comparisons) : arr(trades);
  const records = source
    .map((record) => buildPaperLiveParityComparison(record))
    .filter((item) => [item.priceBiasBps, item.slippageBiasBps, item.feeBiasBps].some((value) => Number.isFinite(value)));
  if (!records.length) {
    return {
      status: "warmup",
      sampleSize: 0,
      parityScore: null,
      optimismBiasBps: null,
      fillModelTooOptimistic: false,
      recommendedPaperCalibration: "Verzamel gekoppelde paper-vs-demo/live fill samples voordat paper calibration wordt aangepast.",
      records: []
    };
  }
  const optimismBiasBps = records.reduce((total, item) => total + safeNumber(item.optimismBiasBps, 0), 0) / records.length;
  const slippageBiasSamples = records.map((item) => item.slippageBiasBps).filter((value) => Number.isFinite(value));
  const feeBiasSamples = records.map((item) => item.feeBiasBps).filter((value) => Number.isFinite(value));
  const avgSlippageBiasBps = slippageBiasSamples.length ? slippageBiasSamples.reduce((total, value) => total + value, 0) / slippageBiasSamples.length : 0;
  const avgFeeBiasBps = feeBiasSamples.length ? feeBiasSamples.reduce((total, value) => total + value, 0) / feeBiasSamples.length : 0;
  const fillModelTooOptimistic = optimismBiasBps > 4 || avgSlippageBiasBps > 4 || avgFeeBiasBps > 2;
  const parityScore = clamp(1 - Math.max(0, optimismBiasBps) / 30 - Math.abs(avgSlippageBiasBps) / 60 - Math.abs(avgFeeBiasBps) / 40, 0, 1);
  const status = records.length < minSampleSize
    ? "insufficient_sample"
    : fillModelTooOptimistic
      ? "paper_too_optimistic"
      : parityScore >= 0.72
        ? "aligned"
        : "watch";
  return {
    status,
    sampleSize: records.length,
    parityScore: Number(parityScore.toFixed(4)),
    optimismBiasBps: Number(optimismBiasBps.toFixed(3)),
    avgSlippageBiasBps: Number(avgSlippageBiasBps.toFixed(3)),
    avgFeeBiasBps: Number(avgFeeBiasBps.toFixed(3)),
    fillModelTooOptimistic,
    recommendedPaperCalibration: fillModelTooOptimistic
      ? "Verhoog paper slippage/fee conservatisme diagnostisch; pas live gedrag niet automatisch aan."
      : records.length < minSampleSize
        ? "Meer gekoppelde fill samples verzamelen."
        : "Paper/live fill assumptions blijven monitoren.",
    records: records.slice(0, 8)
  };
}
