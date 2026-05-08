import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "../../utils/fs.js";
import { FORBIDDEN_NEURAL_KEYS } from "./safetyBoundLayer.js";
import { nowIso } from "./utils.js";

export const OVERLAY_ALLOWED_KEYS = Object.freeze([
  "MODEL_THRESHOLD",
  "ENTRY_CONFIDENCE_THRESHOLD",
  "featureWeights",
  "strategyWeights",
  "blockerWeights",
  "symbolQuarantine",
  "strategyQuarantine",
  "execution.slippageWeight"
]);

export function buildNeuralOverlay({ proposal = {}, currentOverlay = {}, mode = "paper", expiresAt = null } = {}) {
  const key = proposal.change?.key;
  if (!OVERLAY_ALLOWED_KEYS.includes(key) || FORBIDDEN_NEURAL_KEYS.includes(key)) {
    return { status: "rejected", reasons: ["overlay_key_not_whitelisted"], overlay: currentOverlay };
  }
  if (mode === "live") {
    return { status: "live_review_needed", reasons: ["live_overlay_requires_human_review"], overlay: currentOverlay };
  }
  return {
    status: "ready",
    reasons: [],
    overlay: {
      ...currentOverlay,
      mode,
      disabled: false,
      updatedAt: nowIso(),
      expiresAt: expiresAt || proposal.expiresAt || null,
      changes: {
        ...(currentOverlay.changes || {}),
        [key]: {
          value: proposal.change?.to,
          from: proposal.change?.from,
          proposalId: proposal.proposalId
        }
      }
    }
  };
}

export class NeuralOverlayStore {
  constructor(runtimeDir = "data/runtime") {
    this.dir = path.join(runtimeDir, "neural");
  }

  overlayPath(mode = "paper") {
    return path.join(this.dir, `${mode}-overlay.json`);
  }

  async read(mode = "paper") {
    const content = await fs.readFile(this.overlayPath(mode), "utf8").catch(() => "{}");
    return JSON.parse(content || "{}");
  }

  async write(mode = "paper", overlay = {}) {
    await ensureDir(this.dir);
    await fs.writeFile(this.overlayPath(mode), JSON.stringify(overlay, null, 2), "utf8");
    return overlay;
  }

  async disable(mode = "paper") {
    const overlay = await this.read(mode);
    return this.write(mode, { ...overlay, disabled: true, disabledAt: nowIso() });
  }
}
