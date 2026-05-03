import crypto from "node:crypto";

function seedToUint32(seed) {
  const hash = crypto.createHash("sha256").update(`${seed ?? "default"}`).digest();
  return hash.readUInt32BE(0) || 1;
}

export function createSeededRandom(seed) {
  let state = seedToUint32(seed);
  return function nextRandom() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createDeterministicId(prefix, seed, index = 0) {
  const safePrefix = `${prefix || "id"}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "id";
  const digest = crypto.createHash("sha256").update(`${seed ?? "default"}:${index}`).digest("hex").slice(0, 12);
  return `${safePrefix}_${digest}`;
}
