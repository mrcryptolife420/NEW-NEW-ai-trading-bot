import { redactSecrets } from "../utils/redactSecrets.js";

export function buildModelCard(input = {}) {
  const card = {
    modelId: input.modelId || "unknown",
    version: input.version || "0.0.0",
    type: input.type || "unknown",
    purpose: input.purpose || "Not specified",
    trainingDatasetHash: input.trainingDatasetHash || null,
    featureSchemaVersion: input.featureSchemaVersion || null,
    normalizerVersion: input.normalizerVersion || null,
    trainedAt: input.trainedAt || null,
    trainingWindow: input.trainingWindow || null,
    symbols: input.symbols || [],
    regimes: input.regimes || [],
    strategyFamilies: input.strategyFamilies || [],
    metrics: input.metrics || {},
    calibration: input.calibration || {},
    knownWeaknesses: input.knownWeaknesses || [],
    allowedModes: input.allowedModes || ["paper"],
    disallowedModes: input.disallowedModes || ["live"],
    livePermissions: input.livePermissions || { allowed: false },
    rollbackTarget: input.rollbackTarget || null,
    retirementCondition: input.retirementCondition || null,
    operatorNotes: input.operatorNotes || ""
  };
  return redactSecrets(card);
}

export function canPromoteModel(card = {}) {
  return Boolean(card.modelId && card.trainingDatasetHash && card.featureSchemaVersion && card.livePermissions);
}

export function exportModelCardMarkdown(card = {}) {
  const safe = buildModelCard(card);
  return `# Model Card: ${safe.modelId}\n\n- Version: ${safe.version}\n- Type: ${safe.type}\n- Purpose: ${safe.purpose}\n- Training dataset hash: ${safe.trainingDatasetHash || "missing"}\n- Allowed modes: ${safe.allowedModes.join(", ")}\n- Live allowed: ${Boolean(safe.livePermissions?.allowed)}\n`;
}
