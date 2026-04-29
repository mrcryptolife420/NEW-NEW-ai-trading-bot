import { z } from "zod";

function inferArraySchema(values = []) {
  if (!values.length) {
    return z.array(z.any());
  }
  const first = values[0];
  if (typeof first === "string") {
    return z.array(z.string());
  }
  if (typeof first === "number") {
    return z.array(z.number().finite());
  }
  if (typeof first === "boolean") {
    return z.array(z.boolean());
  }
  if (Array.isArray(first)) {
    return z.array(inferArraySchema(first));
  }
  if (first && typeof first === "object") {
    return z.array(z.record(z.string(), z.any()));
  }
  return z.array(z.any());
}

function inferSchemaFromDefault(defaultValue) {
  if (typeof defaultValue === "string") {
    return z.string();
  }
  if (typeof defaultValue === "number") {
    return z.number().finite();
  }
  if (typeof defaultValue === "boolean") {
    return z.boolean();
  }
  if (Array.isArray(defaultValue)) {
    return inferArraySchema(defaultValue);
  }
  if (defaultValue == null) {
    return z.any().nullable();
  }
  if (typeof defaultValue === "object") {
    return z.record(z.string(), z.any());
  }
  return z.any();
}

const RANGE_RULES = {
  maxOpenPositions: [1, 20],
  maxPositionFraction: [0.001, 1],
  maxTotalExposureFraction: [0.01, 1],
  riskPerTrade: [0.0001, 0.2],
  maxDailyDrawdown: [0.001, 0.5],
  minModelConfidence: [0, 1],
  modelThreshold: [0, 1],
  stopLossPct: [0.001, 0.2],
  takeProfitPct: [0.001, 0.5],
  trailingStopPct: [0.001, 0.2],
  minTradeUsdt: [1, 100000000],
  paperMinTradeUsdt: [1, 100000000],
  tradingIntervalSeconds: [1, 86400],
  dashboardPort: [1, 65535],
  watchlistTopN: [1, 1000],
  dynamicWatchlistMinSymbols: [1, 1000],
  maxSpreadBps: [0, 5000],
  maxRealizedVolPct: [0, 1],
  historyFetchBatchSize: [1, 5000],
  historyMaxGapFillRanges: [1, 1000],
  historyVerifyFreshnessMultiplier: [1, 20],
  adaptiveLearningCoreLearningRate: [0, 1],
  adaptiveLearningMaxThresholdShift: [0, 0.5],
  adaptiveLearningMaxSizeBias: [0, 1],
  strategyMinConfidence: [0, 1],
  committeeMinConfidence: [0, 1],
  committeeMinAgreement: [0, 1],
  dashboardEquityPointLimit: [1, 20000],
  dashboardCyclePointLimit: [1, 20000],
  dashboardDecisionLimit: [1, 500],
  executionCalibrationMinLiveTrades: [1, 1000],
  executionCalibrationLookbackTrades: [1, 1000],
  executionCalibrationMaxBpsAdjust: [0, 1000],
  serviceRestartDelaySeconds: [1, 86400],
  serviceRestartBackoffMultiplier: [1, 100],
  serviceRestartMaxDelaySeconds: [1, 86400],
  serviceMaxRestartsPerHour: [1, 10000]
};

function applyRangeRule(key, schema) {
  const range = RANGE_RULES[key];
  if (!range) {
    return schema;
  }
  const [min, max] = range;
  return schema.min(min).max(max);
}

function buildDefaultsShape(defaults = {}) {
  const shape = {};
  for (const [key, value] of Object.entries(defaults)) {
    const baseSchema = inferSchemaFromDefault(value);
    shape[key] = typeof value === "number" ? applyRangeRule(key, baseSchema) : baseSchema;
  }
  return shape;
}

export function createConfigSchema(defaults = {}) {
  const defaultShape = buildDefaultsShape(defaults);
  return z.object({
    ...defaultShape,
    projectRoot: z.string().min(1),
    runtimeDir: z.string().min(1),
    historyDir: z.string().min(1),
    historyDirSource: z.enum(["env", "default"]),
    envPath: z.string().min(1),
    binanceApiKey: z.string().optional(),
    binanceApiSecret: z.string().optional(),
    exchangeCapabilities: z.record(z.string(), z.any()),
    symbolMetadata: z.record(z.string(), z.array(z.string())),
    symbolProfiles: z.record(z.string(), z.any()),
    marketCapRanks: z.record(z.string(), z.number().finite()),
    validation: z.any().optional()
  }).passthrough();
}

export function parseNormalizedConfig(config = {}, defaults = {}) {
  return createConfigSchema(defaults).parse(config);
}
