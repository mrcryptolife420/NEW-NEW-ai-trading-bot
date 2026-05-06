import { buildTradeOutcomeLabel } from "../ai/tradeLabeler.js";
import { labelExitQuality } from "./exitQuality.js";
import { classifyFailureMode } from "./failureLibrary.js";
import { buildVetoObservation, labelVetoOutcome } from "./vetoOutcome.js";

export const OPERATOR_REVIEW_LABELS = Object.freeze([
  "bad_entry",
  "bad_exit",
  "execution_drag",
  "news_event",
  "bad_data",
  "good_trade",
  "good_block",
  "bad_veto",
  "manual_interference",
  "early_exit",
  "late_exit",
  "stop_too_tight",
  "take_profit_too_close",
  "reconcile_uncertainty"
]);

const TARGET_TYPES = new Set(["trade", "candidate", "veto_observation"]);

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, num(value, min)));
}

function text(value, fallback = "") {
  const result = `${value ?? ""}`.trim();
  return result || fallback;
}

function normalizeLabel(label) {
  return text(label).toLowerCase();
}

function inferTargetType(target = {}) {
  const explicit = text(target.targetType || target.type).toLowerCase();
  if (TARGET_TYPES.has(explicit)) return explicit;
  if (target.tradeId || target.closedAt || target.exitAt) return "trade";
  if (target.vetoOutcome || target.futureMarketPath) return "veto_observation";
  return "candidate";
}

function targetId(target = {}, type = inferTargetType(target)) {
  return text(
    target.targetId ||
      target.id ||
      target.tradeId ||
      target.decisionId ||
      target.candidateId ||
      target.observationId,
    `${type}:unknown`
  );
}

function queueItem({ target = {}, targetType, priority = 40, reason = "review", suggestedLabels = [] } = {}) {
  const type = targetType || inferTargetType(target);
  return {
    itemId: `${type}:${targetId(target, type)}`,
    targetType: type,
    targetId: targetId(target, type),
    symbol: target.symbol || null,
    priority,
    reason,
    suggestedLabels: arr(suggestedLabels).filter((label) => OPERATOR_REVIEW_LABELS.includes(label)),
    diagnosticsOnly: true
  };
}

export function buildOperatorReviewQueue({
  trades = [],
  candidates = [],
  vetoObservations = [],
  limit = 50
} = {}) {
  const items = [];
  for (const trade of arr(trades)) {
    const outcome = buildTradeOutcomeLabel(trade || {});
    const exitQuality = labelExitQuality({ trade });
    const failure = classifyFailureMode({ trade, exitQuality });
    if (outcome.labelScore < 0.45 || exitQuality.label !== "unknown_exit_quality" || failure.failureMode !== "unknown") {
      items.push(queueItem({
        target: trade,
        targetType: "trade",
        priority: failure.failureMode === "reconcile_uncertainty" ? 90 : outcome.labelScore < 0.35 ? 75 : 55,
        reason: failure.failureMode !== "unknown" ? failure.failureMode : exitQuality.label,
        suggestedLabels: [
          failure.failureMode,
          exitQuality.label === "late_exit" ? "late_exit" : null,
          exitQuality.label === "early_exit" ? "early_exit" : null,
          outcome.labelScore >= 0.65 ? "good_trade" : null
        ].filter(Boolean)
      }));
    }
  }
  for (const candidate of arr(candidates)) {
    const reasons = arr(candidate.reasons || candidate.blockerReasons).map((reason) => `${reason}`.toLowerCase());
    if (candidate.approved === false || reasons.length || candidate.reviewRequired) {
      items.push(queueItem({
        target: candidate,
        targetType: "candidate",
        priority: candidate.reviewRequired ? 80 : 45,
        reason: reasons[0] || "blocked_candidate_review",
        suggestedLabels: reasons.some((reason) => reason.includes("data")) ? ["bad_data"] : []
      }));
    }
  }
  for (const raw of arr(vetoObservations)) {
    const observation = raw.observation || buildVetoObservation(raw);
    const outcome = raw.vetoOutcome || labelVetoOutcome({
      observation,
      futureMarketPath: raw.futureMarketPath || {}
    });
    if (["bad_veto", "unknown_veto"].includes(outcome.label)) {
      items.push(queueItem({
        target: { ...raw, observationId: observation.observationId || raw.id },
        targetType: "veto_observation",
        priority: outcome.label === "bad_veto" ? 85 : 45,
        reason: outcome.label,
        suggestedLabels: outcome.label === "bad_veto" ? ["bad_veto"] : []
      }));
    }
  }
  return {
    status: items.length ? "ready" : "empty",
    count: items.length,
    items: items
      .sort((left, right) => right.priority - left.priority || left.itemId.localeCompare(right.itemId))
      .slice(0, Math.max(1, Math.round(num(limit, 50)))),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}

export function buildOperatorReviewLabel({
  target = {},
  label,
  source = "operator",
  reviewer = "operator",
  confidence = 0.75,
  createdAt = new Date().toISOString(),
  botMode = "paper",
  notes = ""
} = {}) {
  const normalizedLabel = normalizeLabel(label);
  const type = inferTargetType(target);
  if (!OPERATOR_REVIEW_LABELS.includes(normalizedLabel)) {
    return {
      ok: false,
      error: "invalid_operator_review_label",
      label: normalizedLabel || null,
      allowedLabels: OPERATOR_REVIEW_LABELS.slice()
    };
  }
  if (!TARGET_TYPES.has(type)) {
    return {
      ok: false,
      error: "invalid_operator_review_target",
      targetType: type
    };
  }
  return {
    ok: true,
    record: {
      recordType: "operator_review_label",
      targetType: type,
      targetId: targetId(target, type),
      symbol: target.symbol || null,
      label: normalizedLabel,
      source: text(source, "operator"),
      reviewer: text(reviewer, "operator"),
      confidence: clamp(confidence, 0, 1),
      notes: text(notes),
      createdAt,
      paperAnalyticsOnly: true,
      diagnosticsOnly: botMode === "live",
      liveBehaviorChanged: false
    }
  };
}

export function summarizeOperatorReviewLabels(labels = []) {
  const records = arr(labels).filter((item) => item?.recordType === "operator_review_label" || item?.label);
  const byLabel = {};
  const byTargetType = {};
  for (const record of records) {
    const label = normalizeLabel(record.label) || "unknown";
    const type = text(record.targetType, "unknown");
    byLabel[label] = (byLabel[label] || 0) + 1;
    byTargetType[type] = (byTargetType[type] || 0) + 1;
  }
  return {
    status: records.length ? "ready" : "empty",
    count: records.length,
    byLabel,
    byTargetType,
    labels: records.slice(-25),
    paperAnalyticsOnly: true,
    liveBehaviorChanged: false
  };
}
