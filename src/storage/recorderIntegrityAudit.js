import { getSchemaVersion, RECORDER_FRAME_SCHEMA_VERSION } from "./schemaVersion.js";

const KNOWN_FRAME_TYPES = new Set([
  "cycle",
  "decision",
  "trade",
  "learning",
  "reject_review",
  "research",
  "snapshot_manifest",
  "trade_replay",
  "news_history",
  "context_history",
  "dataset_curation"
]);

function issue(code, severity, frameIndex, detail = null) {
  return { code, severity, frameIndex, detail };
}

function validTimestamp(value) {
  return Boolean(value) && Number.isFinite(new Date(value).getTime());
}

function frameId(frame = {}) {
  return frame.id || frame.decisionId || frame.tradeId || null;
}

export function auditRecorderFrames({ frames = [], expectedSchemaVersion = RECORDER_FRAME_SCHEMA_VERSION } = {}) {
  const issues = [];
  const countsByType = {};
  const seenIds = new Map();

  frames.forEach((frame, index) => {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
      issues.push(issue("invalid_frame_object", "corrupt", index));
      return;
    }
    const type = frame.frameType || "unknown";
    countsByType[type] = (countsByType[type] || 0) + 1;
    const version = getSchemaVersion(frame);
    if (!version) {
      issues.push(issue("missing_schema_version", "warning", index, type));
    } else if (version !== expectedSchemaVersion) {
      issues.push(issue("schema_version_mismatch", version > expectedSchemaVersion ? "degraded" : "warning", index, { type, version }));
    }
    if (!validTimestamp(frame.at || frame.createdAt || frame.generatedAt)) {
      issues.push(issue("invalid_timestamp", "degraded", index, type));
    }
    if (!KNOWN_FRAME_TYPES.has(type)) {
      issues.push(issue("unknown_frame_type", "degraded", index, type));
    }
    if (type === "decision" && !(frame.decisionId || frame.id)) {
      issues.push(issue("missing_decision_id", "degraded", index));
    }
    if ((type === "trade" || type === "trade_replay") && !(frame.tradeId || frame.id)) {
      issues.push(issue("missing_trade_id", "degraded", index));
    }
    const id = frameId(frame);
    if (id) {
      if (seenIds.has(`${type}:${id}`)) {
        issues.push(issue("duplicate_id", "corrupt", index, { type, id, firstIndex: seenIds.get(`${type}:${id}`) }));
      } else {
        seenIds.set(`${type}:${id}`, index);
      }
    }
    if (!frame.configHash && ["decision", "trade", "learning", "snapshot_manifest", "trade_replay"].includes(type)) {
      issues.push(issue("missing_config_hash", "warning", index, type));
    }
    const quality = Number(frame.recordQuality?.score ?? frame.recordQuality);
    if (Number.isFinite(quality) && quality < 0.35) {
      issues.push(issue("low_record_quality", "warning", index, { type, quality }));
    }
  });

  const severities = new Set(issues.map((item) => item.severity));
  const status = severities.has("corrupt")
    ? "corrupt"
    : severities.has("degraded")
      ? "degraded"
      : severities.has("warning")
        ? "warning"
        : "ok";
  const recommendedActions = [];
  if (status === "corrupt") recommendedActions.push("quarantine_or_rebuild_corrupt_recorder_frames");
  if (status === "degraded") recommendedActions.push("review_recorder_schema_and_timestamp_quality_before_retraining");
  if (issues.some((item) => item.code === "missing_config_hash")) recommendedActions.push("record_config_hash_on_new_decision_and_trade_frames");
  if (!frames.length) recommendedActions.push("no_recorder_frames_found");

  return {
    status,
    frameCount: frames.length,
    issueCount: issues.length,
    issues,
    countsByType,
    recommendedActions
  };
}
