import fs from "node:fs/promises";
import path from "node:path";
import { backfillTradeLearningAttributions, summarizeLearningAttribution } from "../src/runtime/tradeAttribution.js";

const rootDir = process.cwd();
const runtimeDir = path.join(rootDir, "data", "runtime");
const journalPath = path.join(runtimeDir, "journal.json");
const featureStoreDir = path.join(runtimeDir, "feature-store");

function tradeKey(symbol, at) {
  return `${symbol || ""}::${at || ""}`;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function listFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dirPath, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function normalizeFrameLearningAttribution(frame = {}, resolved = {}) {
  return {
    ...frame,
    learningAttribution: {
      category: resolved.category,
      confidence: resolved.confidence,
      reviewVerdict: resolved.reviewVerdict || null,
      reasons: resolved.reasons || [],
      featureGroups: resolved.featureGroups || [],
      scope: resolved.scope || {}
    }
  };
}

async function backfillJsonlBucket(bucketName, resolvedByKey) {
  const bucketDir = path.join(featureStoreDir, bucketName);
  const files = await listFiles(bucketDir);
  let updatedFrames = 0;
  let updatedFiles = 0;
  for (const filePath of files) {
    const original = await fs.readFile(filePath, "utf8");
    const lines = original.split(/\r?\n/);
    let touched = false;
    const nextLines = lines.map((line) => {
      if (!line.trim()) {
        return line;
      }
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        return line;
      }
      const key = tradeKey(frame.symbol, frame.at);
      const resolved = resolvedByKey.get(key);
      if (!resolved) {
        return line;
      }
      const current = summarizeLearningAttribution(frame.learningAttribution || {});
      if (
        current.category === resolved.category &&
        current.reviewVerdict === resolved.reviewVerdict &&
        current.confidence === resolved.confidence &&
        JSON.stringify(current.reasons || []) === JSON.stringify(resolved.reasons || []) &&
        JSON.stringify(current.featureGroups || []) === JSON.stringify(resolved.featureGroups || []) &&
        JSON.stringify(current.scope || {}) === JSON.stringify(resolved.scope || {})
      ) {
        return line;
      }
      touched = true;
      updatedFrames += 1;
      return JSON.stringify(normalizeFrameLearningAttribution(frame, resolved));
    });
    if (touched) {
      updatedFiles += 1;
      await fs.writeFile(filePath, `${nextLines.join("\n").replace(/\n*$/, "\n")}`, "utf8");
    }
  }
  return { updatedFiles, updatedFrames };
}

async function main() {
  const journal = await readJson(journalPath);
  const { updatedTrades, updatedCount } = backfillTradeLearningAttributions(journal.trades || []);
  journal.trades = updatedTrades;
  await writeJson(journalPath, journal);

  const resolvedByKey = new Map(
    updatedTrades.map((trade) => [
      tradeKey(trade.symbol, trade.exitAt || trade.entryAt || null),
      summarizeLearningAttribution(trade.learningAttribution || {})
    ])
  );

  const tradeFrames = await backfillJsonlBucket("trades", resolvedByKey);
  const learningFrames = await backfillJsonlBucket("learning", resolvedByKey);
  const snapshotFrames = await backfillJsonlBucket("snapshots", resolvedByKey);

  console.log(JSON.stringify({
    tradeCount: updatedTrades.length,
    updatedTrades: updatedCount,
    featureStore: {
      trades: tradeFrames,
      learning: learningFrames,
      snapshots: snapshotFrames
    }
  }, null, 2));
}

await main();
