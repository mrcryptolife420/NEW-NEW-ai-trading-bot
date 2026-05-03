import crypto from "node:crypto";
import { redactSecrets } from "../utils/redactSecrets.js";

const DEFAULT_HASH_KEYS = [
  "botMode",
  "operatorMode",
  "paperModeProfile",
  "paperExecutionVenue",
  "modelThreshold",
  "minModelConfidence",
  "riskPerTrade",
  "maxOpenPositions",
  "maxPositionFraction",
  "maxTotalExposureFraction",
  "minTradeUsdt",
  "paperMinTradeUsdt",
  "enableExchangeProtection",
  "adaptiveLearningLiveCoreUpdates",
  "thresholdAutoApplyEnabled",
  "thresholdProbationMinTrades",
  "thresholdProbationWindowDays",
  "enableDynamicExitLevels",
  "dynamicExitPaperOnly"
];

const SECRET_KEY_PATTERN = /(api[_-]?key|api[_-]?secret|secret|token|webhook|authorization|signature|password)/i;

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildConfigHashInput(config = {}, keys = DEFAULT_HASH_KEYS) {
  const input = {};
  for (const key of keys) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      input[key] = config[key];
    }
  }
  return redactSecrets(input);
}

export function buildConfigHash(config = {}, { keys = DEFAULT_HASH_KEYS } = {}) {
  const input = buildConfigHashInput(config, keys);
  const serialized = stableSerialize(input);
  return {
    algorithm: "sha256",
    hash: crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 16),
    input
  };
}
