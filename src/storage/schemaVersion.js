export const RUNTIME_STATE_SCHEMA_VERSION = 7;
export const DECISION_RECORD_SCHEMA_VERSION = 8;
export const TRADE_RECORD_SCHEMA_VERSION = 8;
export const RECORDER_FRAME_SCHEMA_VERSION = 8;
export const INCIDENT_REPORT_SCHEMA_VERSION = 1;
export const REPLAY_RECORD_SCHEMA_VERSION = 1;

export function withSchemaVersion(record, schemaVersion) {
  const version = Number.isFinite(Number(schemaVersion)) ? Number(schemaVersion) : 0;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { schemaVersion: version, value: record ?? null };
  }
  return { ...record, schemaVersion: version };
}

export function getSchemaVersion(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return 0;
  }
  const version = Number(record.schemaVersion);
  return Number.isFinite(version) && version >= 0 ? version : 0;
}

export function isSchemaVersionSupported(record, supportedVersions = []) {
  const supported = new Set((supportedVersions || []).map((version) => Number(version)));
  return supported.has(getSchemaVersion(record));
}

export function currentSchemaVersionForKind(kind) {
  return {
    runtime: RUNTIME_STATE_SCHEMA_VERSION,
    decision: DECISION_RECORD_SCHEMA_VERSION,
    trade: TRADE_RECORD_SCHEMA_VERSION,
    recorder: RECORDER_FRAME_SCHEMA_VERSION,
    recorder_frame: RECORDER_FRAME_SCHEMA_VERSION,
    incident: INCIDENT_REPORT_SCHEMA_VERSION,
    replay: REPLAY_RECORD_SCHEMA_VERSION
  }[kind] || RECORDER_FRAME_SCHEMA_VERSION;
}
