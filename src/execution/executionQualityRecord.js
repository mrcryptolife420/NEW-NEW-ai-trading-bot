export function buildExecutionQualityRecord({
  symbol,
  strategy = null,
  orderStyle = "unknown",
  expected = {},
  actual = {},
  context = {},
  at = new Date().toISOString()
} = {}) {
  const expectedPrice = Number(expected.price || expected.midPrice || 0);
  const actualPrice = Number(actual.price || actual.fillPrice || 0);
  const side = `${actual.side || expected.side || "BUY"}`.toUpperCase();
  const direction = side === "SELL" ? -1 : 1;
  const slippageBps = expectedPrice > 0 && actualPrice > 0
    ? ((actualPrice - expectedPrice) / expectedPrice) * 10000 * direction
    : 0;
  const expectedFee = Number(expected.fee || 0);
  const actualFee = Number(actual.fee || 0);
  return {
    at,
    symbol,
    strategy,
    orderStyle,
    expected: {
      price: expectedPrice || null,
      fee: expectedFee,
      slippageBps: Number(expected.slippageBps || 0),
      fillProbability: Number(expected.fillProbability || 0)
    },
    actual: {
      price: actualPrice || null,
      fee: actualFee,
      quantity: Number(actual.quantity || 0)
    },
    realized: {
      slippageBps,
      feeDelta: actualFee - expectedFee,
      makerTimeout: Boolean(actual.makerTimeout),
      cancelReplaceCount: Number(actual.cancelReplaceCount || 0)
    },
    context: {
      spreadBps: Number(context.spreadBps || 0),
      volatility: Number(context.volatility || 0),
      venue: context.venue || "unknown",
      brokerMode: context.brokerMode || "paper"
    }
  };
}

export function summarizeExecutionQuality(records = []) {
  const safe = records.filter((record) => record?.realized);
  const total = safe.length || 1;
  const avgSlippageBps = safe.reduce((sum, record) => sum + Number(record.realized.slippageBps || 0), 0) / total;
  const makerTimeoutRate = safe.filter((record) => record.realized.makerTimeout).length / total;
  return {
    sampleCount: safe.length,
    avgSlippageBps,
    makerTimeoutRate,
    status: avgSlippageBps > 15 || makerTimeoutRate > 0.4 ? "degraded" : "ready"
  };
}
