import crypto from "node:crypto";
import { REPLAY_RECORD_SCHEMA_VERSION } from "../storage/schemaVersion.js";

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function buildReplayPackManifest({ packType = "general_review", samples = [], configHash = null, dataHash = null, seed = "default", createdAt = new Date().toISOString() } = {}) {
  const sampleIds = samples.map((sample, index) => sample?.id || sample?.decisionId || sample?.tradeId || `sample_${index}`);
  const duplicateIds = [...new Set(sampleIds.filter((id, index) => sampleIds.indexOf(id) !== index))];
  const warnings = [];
  if (!samples.length) warnings.push("missing_samples");
  if (duplicateIds.length) warnings.push("duplicate_sample_ids");
  if (!configHash) warnings.push("missing_config_hash");
  if (!dataHash) warnings.push("missing_data_hash");
  const input = {
    schemaVersion: REPLAY_RECORD_SCHEMA_VERSION,
    packType,
    sampleIds,
    configHash: configHash || null,
    dataHash: dataHash || null,
    seed
  };
  const inputHash = hash(input);
  return {
    manifestId: `replay_pack_${inputHash.slice(0, 16)}`,
    schemaVersion: REPLAY_RECORD_SCHEMA_VERSION,
    packType,
    sampleCount: samples.length,
    sampleIds,
    configHash: configHash || null,
    dataHash: dataHash || null,
    seed,
    createdAt,
    inputHash,
    warnings
  };
}
