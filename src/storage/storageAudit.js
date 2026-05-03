import fs from "node:fs/promises";
import path from "node:path";
import { listFiles } from "../utils/fs.js";
import { auditRecorderFrames } from "./recorderIntegrityAudit.js";

const RECORDER_BUCKETS = ["cycles", "decisions", "trades", "learning", "rejectReviews", "research", "snapshots", "news", "contexts", "datasets"];

async function readJsonlFiles(files = [], maxRecords = 500) {
  const records = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    for (const line of content.split(/\r?\n/).filter(Boolean)) {
      try {
        records.push(JSON.parse(line));
      } catch {
        records.push({ frameType: "unknown", at: null, parseError: true });
      }
      if (records.length >= maxRecords) return records;
    }
  }
  return records;
}

export async function loadRecentRecorderFrames({ runtimeDir, maxFilesPerBucket = 3, maxRecords = 500 } = {}) {
  const rootDir = path.join(runtimeDir || ".", "feature-store");
  const groups = await Promise.all(RECORDER_BUCKETS.map(async (bucket) => {
    const live = await listFiles(path.join(rootDir, bucket));
    const archive = await listFiles(path.join(rootDir, "archive", bucket));
    return [...live, ...archive].filter((filePath) => filePath.endsWith(".jsonl")).sort().reverse().slice(0, maxFilesPerBucket);
  }));
  return readJsonlFiles(groups.flat(), maxRecords);
}

export async function buildRecorderAuditSummary({ runtimeDir, maxRecords = 500 } = {}) {
  const frames = await loadRecentRecorderFrames({ runtimeDir, maxRecords });
  return auditRecorderFrames({ frames });
}

export async function buildStorageAuditSummary({ runtimeDir } = {}) {
  const files = await Promise.all([
    listFiles(runtimeDir || "."),
    listFiles(path.join(runtimeDir || ".", "audit")),
    listFiles(path.join(runtimeDir || ".", "feature-store", "decisions")),
    listFiles(path.join(runtimeDir || ".", "feature-store", "trades"))
  ]);
  const counts = {
    runtimeRootFiles: files[0].length,
    auditFiles: files[1].length,
    decisionFrameFiles: files[2].length,
    tradeFrameFiles: files[3].length
  };
  const hasRuntime = files[0].some((filePath) => path.basename(filePath) === "runtime.json");
  const hasJournal = files[0].some((filePath) => path.basename(filePath) === "journal.json");
  const warnings = [];
  if (!hasRuntime) warnings.push("runtime_snapshot_missing");
  if (!hasJournal) warnings.push("journal_snapshot_missing");
  return {
    status: warnings.length ? "warning" : "ok",
    runtimeDir: runtimeDir || null,
    counts,
    warnings,
    readOnly: true
  };
}
