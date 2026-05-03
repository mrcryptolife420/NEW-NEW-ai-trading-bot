import { currentSchemaVersionForKind, getSchemaVersion, withSchemaVersion } from "../schemaVersion.js";

export function migrateRecord(record, {
  kind = "recorder_frame",
  fromVersion = null,
  toVersion = null,
  now = new Date().toISOString()
} = {}) {
  const targetVersion = toVersion != null && Number.isFinite(Number(toVersion))
    ? Number(toVersion)
    : currentSchemaVersionForKind(kind);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      status: "fallback",
      record: withSchemaVersion({}, targetVersion),
      warnings: ["corrupt_or_non_object_record"],
      error: "record_not_object"
    };
  }

  const detectedVersion = fromVersion == null ? getSchemaVersion(record) : Number(fromVersion);
  if (detectedVersion > targetVersion) {
    return {
      status: "unsupported_future_version",
      record,
      warnings: [`${kind}_schema_version_${detectedVersion}_newer_than_supported_${targetVersion}`],
      error: "unsupported_future_schema_version"
    };
  }

  if (detectedVersion === targetVersion) {
    return {
      status: "current",
      record,
      warnings: []
    };
  }

  return {
    status: "migrated",
    record: {
      ...record,
      schemaVersion: targetVersion,
      migration: {
        migratedFrom: Number.isFinite(detectedVersion) ? detectedVersion : 0,
        migratedAt: now,
        migrationWarnings: detectedVersion ? [] : ["missing_schema_version_assumed_legacy"]
      }
    },
    warnings: detectedVersion ? [] : ["missing_schema_version_assumed_legacy"]
  };
}
