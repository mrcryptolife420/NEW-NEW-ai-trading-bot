import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "../../../utils/fs.js";
import { asArray, finiteNumber, nowIso, stableId } from "../utils.js";

export const LEARNING_EVENT_TYPES = Object.freeze([
  "trade_opened",
  "trade_closed_win",
  "trade_closed_loss",
  "trade_closed_breakeven",
  "missed_trade_good_veto",
  "missed_trade_bad_veto",
  "entry_rejected",
  "entry_allowed",
  "exit_too_early",
  "exit_too_late",
  "stop_loss_hit",
  "take_profit_hit",
  "trailing_stop_hit",
  "slippage_high",
  "spread_block_good",
  "spread_block_bad",
  "neural_prediction_correct",
  "neural_prediction_wrong"
]);

export function buildLearningEvent(input = {}, { clock = null } = {}) {
  const createdAt = nowIso(input.createdAt || clock);
  const type = LEARNING_EVENT_TYPES.includes(input.type) ? input.type : "entry_rejected";
  const decisionId = input.decisionId || input.tradeId || input.positionId || stableId("decision", [createdAt, input.symbol, type]);
  const featuresHash = input.featuresHash || stableId("features", [decisionId, input.symbol, input.strategyId, input.modelVersion]);
  const pnlPct = finiteNumber(input.pnlPct ?? input.netPnlPct, 0);
  const event = {
    eventId: input.eventId || stableId("learn_evt", [createdAt, type, decisionId, input.tradeId]),
    createdAt,
    type,
    symbol: input.symbol || "UNKNOWN",
    timeframe: input.timeframe || "unknown",
    decisionId,
    tradeId: input.tradeId || null,
    positionId: input.positionId || null,
    strategyId: input.strategyId || "unknown",
    regime: input.regime || "unknown",
    session: input.session || "unknown",
    featuresHash,
    marketSnapshotHash: input.marketSnapshotHash || stableId("market", [decisionId, input.symbol, input.timeframe]),
    modelVersion: input.modelVersion || "unknown",
    prediction: input.prediction ?? null,
    actualOutcome: input.actualOutcome || null,
    pnlPct,
    mfePct: finiteNumber(input.mfePct, 0),
    maePct: finiteNumber(input.maePct, 0),
    holdMinutes: finiteNumber(input.holdMinutes, 0),
    entryReason: input.entryReason || null,
    exitReason: input.exitReason || null,
    blockerReasons: asArray(input.blockerReasons).map(String),
    qualityScore: finiteNumber(input.qualityScore, pnlPct),
    label: input.label || inferLearningLabel(type, pnlPct),
    weight: finiteNumber(input.weight, input.tradeId ? 1 : 0.35),
    flags: {
      good_entry: input.good_entry === true || pnlPct > 0.01,
      bad_entry: input.bad_entry === true || pnlPct < -0.01,
      good_rejection: input.good_rejection === true || type.endsWith("_good_veto") || type.endsWith("_good"),
      bad_rejection: input.bad_rejection === true || type.endsWith("_bad_veto") || type.endsWith("_bad"),
      good_exit: input.good_exit === true || ["take_profit_hit", "trailing_stop_hit"].includes(type),
      bad_exit: input.bad_exit === true || ["exit_too_early", "exit_too_late", "stop_loss_hit"].includes(type),
      high_slippage: input.high_slippage === true || type === "slippage_high",
      bad_sizing: input.bad_sizing === true,
      strategy_mismatch: input.strategy_mismatch === true,
      regime_mismatch: input.regime_mismatch === true
    }
  };
  return { event, valid: Boolean(event.decisionId && event.featuresHash), reasons: [] };
}

export function inferLearningLabel(type, pnlPct = 0) {
  if (type.includes("bad_veto") || type.includes("_bad")) return "bad_rejection";
  if (type.includes("good_veto") || type.includes("_good")) return "good_rejection";
  if (type.includes("exit_too")) return "bad_exit";
  if (pnlPct > 0.002) return "good_entry";
  if (pnlPct < -0.002) return "bad_entry";
  return "neutral";
}

export function learningEventStorePath(runtimeDir = "data/runtime") {
  return path.join(runtimeDir, "neural", "learning-events.ndjson");
}

export class LearningEventStore {
  constructor(runtimeDir = "data/runtime") {
    this.filePath = learningEventStorePath(runtimeDir);
  }

  async append(input) {
    const built = buildLearningEvent(input);
    if (!built.valid) {
      return { status: "rejected", reasons: ["missing_decision_or_features_hash"], event: built.event };
    }
    await ensureDir(path.dirname(this.filePath));
    await fs.appendFile(this.filePath, `${JSON.stringify(built.event)}\n`, "utf8");
    return { status: "stored", event: built.event };
  }

  async readRecent({ limit = 200 } = {}) {
    const content = await fs.readFile(this.filePath, "utf8").catch(() => "");
    return content.split(/\r?\n/).filter(Boolean).slice(-limit).map((line) => JSON.parse(line));
  }
}
