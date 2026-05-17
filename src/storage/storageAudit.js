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

async function statFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  return stat?.isFile?.() ? stat : null;
}

async function loadJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function listFilesRecursive(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const groups = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    return entry.isFile() ? [fullPath] : [];
  }));
  return groups.flat();
}

function retentionFamily(filePath = "", runtimeDir = ".") {
  const rel = path.relative(runtimeDir, filePath).replaceAll("\\", "/");
  if (rel.startsWith("audit/")) return "audit_logs";
  if (rel.startsWith("feature-store/")) return "recorder_frames";
  if (rel.startsWith("replay") || rel.startsWith("replay-packs/")) return "replay_packs";
  if (/read-model\.sqlite|\.sqlite(-wal|-shm)?$/i.test(rel)) return "readmodel";
  if (/runtime.*snapshot|runtime\.json|journal\.json/i.test(rel)) return "runtime_snapshots";
  return "runtime_misc";
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

export async function buildStorageRetentionReport({ runtimeDir, largestLimit = 10 } = {}) {
  const root = runtimeDir || ".";
  const files = await listFilesRecursive(root);
  const records = [];
  for (const filePath of files) {
    const stat = await statFile(filePath);
    if (!stat) continue;
    records.push({
      path: filePath,
      relativePath: path.relative(root, filePath).replaceAll("\\", "/"),
      family: retentionFamily(filePath, root),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      ageDays: Number(((Date.now() - stat.mtime.getTime()) / 86_400_000).toFixed(2))
    });
  }
  const familySummaries = Object.values(records.reduce((acc, record) => {
    acc[record.family] ||= { family: record.family, count: 0, totalBytes: 0 };
    acc[record.family].count += 1;
    acc[record.family].totalBytes += record.sizeBytes;
    return acc;
  }, {})).sort((left, right) => right.totalBytes - left.totalBytes);
  const totalBytes = records.reduce((sum, record) => sum + record.sizeBytes, 0);
  const largestFiles = records
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, Math.max(1, Math.min(50, Number(largestLimit) || 10)));
  const retentionWarnings = [];
  if (totalBytes > 512 * 1024 * 1024) retentionWarnings.push("runtime_storage_above_512mb");
  if (largestFiles.some((file) => file.sizeBytes > 128 * 1024 * 1024)) retentionWarnings.push("large_single_runtime_file");
  const safeCleanupCandidates = records
    .filter((file) => ["audit_logs", "recorder_frames", "replay_packs"].includes(file.family))
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, 20)
    .map((file) => ({
      relativePath: file.relativePath,
      family: file.family,
      sizeBytes: file.sizeBytes,
      ageDays: file.ageDays,
      action: "review_before_manual_archive_or_delete"
    }));
  const cleanupPlan = {
    status: safeCleanupCandidates.length ? "review_available" : "empty",
    readOnly: true,
    autoDelete: false,
    steps: [
      "run_storage_retention_before_cleanup",
      "archive_recorder_or_audit_files_only_after_export",
      "never_delete_runtime_journal_model_or_readmodel_without_backup",
      "rerun_readmodel_status_after_manual_archive"
    ],
    candidates: safeCleanupCandidates
  };
  const expectedArchiveBytes = safeCleanupCandidates.reduce((sum, file) => sum + file.sizeBytes, 0);
  const restoreStatus = await loadJson(path.join(root, "restore-test-status.json"), null);
  const backupFiles = records
    .filter((file) => /backup/i.test(file.relativePath) && /\.json(\.gz)?$/i.test(file.relativePath))
    .sort((left, right) => new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime());
  const backupEvidence = {
    status: backupFiles.length ? "present" : "required",
    latestBackupPath: backupFiles[0]?.relativePath || null,
    latestBackupAt: backupFiles[0]?.modifiedAt || null,
    backupCount: backupFiles.length,
    requiredBeforeArchive: true,
    readOnly: true
  };
  const restoreTestEvidence = {
    status: restoreStatus?.lastSuccessfulAt ? "present" : "required",
    lastSuccessfulAt: restoreStatus?.lastSuccessfulAt || null,
    lastRunAt: restoreStatus?.lastRunAt || null,
    requiredBeforeArchive: true,
    readOnly: true
  };
  const protectedFamilies = ["readmodel", "runtime_snapshots"];
  const protectedFiles = records
    .filter((file) => protectedFamilies.includes(file.family))
    .map((file) => file.relativePath)
    .sort();
  const archiveBatchManifest = {
    status: safeCleanupCandidates.length ? "ready_for_manual_export" : "empty",
    readOnly: true,
    manualOnly: true,
    generatedAt: new Date().toISOString(),
    candidateFamilies: [...new Set(safeCleanupCandidates.map((file) => file.family))].sort(),
    candidateCount: safeCleanupCandidates.length,
    expectedSpaceGainBytes: expectedArchiveBytes,
    protectedFiles,
    validationAfterArchive: [
      "run_readmodel_status",
      "run_storage_retention",
      "run_ops_readiness",
      "start_paper_mode_before_live_review"
    ]
  };
  const archivePlan = {
    status: safeCleanupCandidates.length ? "ready_for_manual_review" : "empty",
    readOnly: true,
    autoDelete: false,
    archiveDir: path.join(root, "archive", "manual-retention-review"),
    backupRequired: true,
    restorePrecheckRequired: true,
    backupEvidence,
    restoreTestEvidence,
    postArchiveValidation: archiveBatchManifest.validationAfterArchive,
    candidateCount: safeCleanupCandidates.length,
    expectedSpaceGainBytes: expectedArchiveBytes,
    expectedSpaceGainPct: totalBytes > 0 ? Number(((expectedArchiveBytes / totalBytes) * 100).toFixed(2)) : 0,
    commands: safeCleanupCandidates.slice(0, 5).map((file) => ({
      relativePath: file.relativePath,
      action: "manual_archive_candidate",
      requiresBackupFirst: true,
      dryRunOnly: true
    }))
  };
  const restorePrecheck = {
    status: records.some((file) => file.relativePath === "runtime.json" || file.relativePath === "journal.json") ? "ready" : "warning",
    readOnly: true,
    backupEvidenceRequired: true,
    restoreTestTimestampRequired: true,
    backupEvidence,
    restoreTestEvidence,
    restoreTestTimestamp: restoreTestEvidence.lastSuccessfulAt,
    requiredBeforeCleanup: [
      "state_backup_exists",
      "restore_test_recent",
      "readmodel_status_captured",
      "bot_stopped_or_idle_before_manual_archive"
    ],
    warnings: [
      ...(!records.some((file) => file.relativePath === "runtime.json") ? ["runtime_json_missing"] : []),
      ...(!records.some((file) => file.relativePath === "journal.json") ? ["journal_json_missing"] : [])
    ]
  };
  return {
    status: retentionWarnings.length ? "warning" : "ready",
    runtimeDir: root,
    totalBytes,
    fileCount: records.length,
    familySummaries,
    largestFiles,
    retentionWarnings,
    safeCleanupCandidates,
    cleanupPlan,
    archivePlan,
    archiveBatchManifest,
    restorePrecheck,
    readOnly: true,
    autoDelete: false
  };
}
