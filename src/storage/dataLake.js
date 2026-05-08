import crypto from "node:crypto";

export const DATASET_LAYERS = ["raw", "cleaned", "features", "labels", "replay", "model_ready", "archives"];

export function buildDatasetManifest({ id = "dataset", layer = "raw", records = [], parents = [], quality = {} } = {}) {
  const normalizedLayer = DATASET_LAYERS.includes(layer) ? layer : "raw";
  const hash = crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
  return { id, layer: normalizedLayer, hash, parents, recordCount: records.length, qualityScore: Number(quality.score ?? 0), quality, createdAt: new Date(0).toISOString() };
}

export function buildDataLakeReport(manifests = []) {
  const byLayer = Object.fromEntries(DATASET_LAYERS.map((layer) => [layer, manifests.filter((item) => item.layer === layer).length]));
  return { status: "ok", layers: DATASET_LAYERS, byLayer, manifests: manifests.map(({ id, layer, hash, recordCount, qualityScore }) => ({ id, layer, hash, recordCount, qualityScore })) };
}
