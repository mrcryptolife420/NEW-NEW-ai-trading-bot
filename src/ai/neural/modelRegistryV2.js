import { asArray, nowIso, stableId } from "./utils.js";

export function buildNeuralModelCard(input = {}) {
  const createdAt = nowIso(input.createdAt);
  return {
    modelId: input.modelId || stableId("neural_model", [createdAt, input.parentModelId, input.featureSetHash, input.configHash]),
    parentModelId: input.parentModelId || null,
    createdAt,
    trainedOn: input.trainedOn || null,
    featureSetHash: input.featureSetHash || "unknown",
    configHash: input.configHash || "unknown",
    trainingEvents: asArray(input.trainingEvents),
    validationEvents: asArray(input.validationEvents),
    symbols: asArray(input.symbols),
    regimes: asArray(input.regimes),
    metrics: input.metrics || {},
    knownWeaknesses: asArray(input.knownWeaknesses),
    allowedModes: asArray(input.allowedModes).length ? asArray(input.allowedModes) : ["sandbox", "paper"],
    promotionStatus: input.promotionStatus || "candidate",
    rollbackRules: input.rollbackRules || {
      maxDrawdownPct: 0.08,
      minProfitFactor: 1,
      maxCalibrationEce: 0.12
    }
  };
}

export function compareNeuralModelCards(left = {}, right = {}) {
  return {
    leftModelId: left.modelId,
    rightModelId: right.modelId,
    expectancyDelta: Number(right.metrics?.expectancyPct || 0) - Number(left.metrics?.expectancyPct || 0),
    drawdownDelta: Number(right.metrics?.maxDrawdownPct || 0) - Number(left.metrics?.maxDrawdownPct || 0),
    allowedModeDelta: asArray(right.allowedModes).filter((mode) => !asArray(left.allowedModes).includes(mode))
  };
}
