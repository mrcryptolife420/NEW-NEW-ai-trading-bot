import crypto from "node:crypto";

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

export function buildReplayContext({ seed = "default", configHash = null, decision = null, marketSnapshot = null, newsSnapshot = null, recorderFrame = null } = {}) {
  const warnings = [];
  if (!configHash) warnings.push("missing_config_hash");
  if (!decision) warnings.push("missing_decision");
  if (!marketSnapshot) warnings.push("missing_market_snapshot");
  if (!recorderFrame) warnings.push("missing_recorder_frame");
  return {
    schemaVersion: 1,
    seed,
    configHash: configHash || null,
    decision: decision || null,
    marketSnapshot: marketSnapshot || null,
    newsSnapshot: newsSnapshot || null,
    recorderFrame: recorderFrame || null,
    warnings
  };
}

export function hashReplayInput(context) {
  return {
    algorithm: "sha256",
    hash: hash(context || {}),
    warnings: Array.isArray(context?.warnings) ? context.warnings : []
  };
}

export function compareReplayOutput({ expectedHash, actualHash } = {}) {
  const expected = typeof expectedHash === "string" ? expectedHash : expectedHash?.hash;
  const actual = typeof actualHash === "string" ? actualHash : actualHash?.hash;
  return {
    deterministic: Boolean(expected && actual && expected === actual),
    expectedHash: expected || null,
    actualHash: actual || null,
    differences: expected && actual && expected !== actual ? ["replay_input_hash_changed"] : []
  };
}
