import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, listFiles, loadJson, removeFile, saveJson } from "../utils/fs.js";

const STORE_VERSION = 2;

function arr(value) {
  return Array.isArray(value) ? value : [];
}

export function intervalToMs(interval = "15m") {
  const match = /^([0-9]+)([mhdwM])$/i.exec(`${interval}`.trim());
  if (!match) {
    throw new Error(`Unsupported interval: ${interval}`);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
    M: 30 * 86_400_000
  };
  return amount * (multipliers[match[2]] || multipliers[unit]);
}

function normalizeCandle(candle = {}) {
  return {
    openTime: Number(candle.openTime || 0),
    closeTime: Number(candle.closeTime || 0),
    open: Number(candle.open || 0),
    high: Number(candle.high || 0),
    low: Number(candle.low || 0),
    close: Number(candle.close || 0),
    volume: Number(candle.volume || 0)
  };
}

function dedupeCandles(candles = []) {
  const map = new Map();
  for (const candle of candles || []) {
    const normalized = normalizeCandle(candle);
    if (!normalized.openTime) {
      continue;
    }
    map.set(normalized.openTime, normalized);
  }
  return [...map.values()].sort((left, right) => left.openTime - right.openTime);
}

export function analyzeCandles(candles = [], interval = "15m") {
  const intervalMs = typeof interval === "number" ? interval : intervalToMs(interval);
  const sorted = [...(candles || [])]
    .map(normalizeCandle)
    .filter((item) => item.openTime > 0)
    .sort((left, right) => left.openTime - right.openTime);
  let duplicateCount = 0;
  const gaps = [];
  const segments = [];
  let segmentStart = sorted[0]?.openTime || null;
  let segmentCount = sorted.length ? 1 : 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const delta = current.openTime - previous.openTime;
    if (delta === 0) {
      duplicateCount += 1;
      continue;
    }
    if (delta > intervalMs) {
      segments.push({
        startTime: segmentStart,
        endTime: previous.openTime,
        count: segmentCount
      });
      segmentStart = current.openTime;
      segmentCount = 1;
      const missingCandles = Math.max(1, Math.round(delta / intervalMs) - 1);
      gaps.push({
        startTime: previous.openTime + intervalMs,
        endTime: current.openTime - intervalMs,
        missingCandles
      });
      continue;
    }
    segmentCount += 1;
  }
  if (segmentStart != null) {
    segments.push({
      startTime: segmentStart,
      endTime: sorted.at(-1)?.openTime || segmentStart,
      count: segmentCount
    });
  }
  const expectedCount = sorted.length && intervalMs > 0
    ? Math.round((sorted.at(-1).openTime - sorted[0].openTime) / intervalMs) + 1
    : sorted.length;
  return {
    intervalMs,
    count: sorted.length,
    duplicateCount,
    gapCount: gaps.length,
    gaps,
    segments,
    expectedCount,
    coverageRatio: expectedCount > 0 ? sorted.length / expectedCount : 1,
    firstOpenTime: sorted[0]?.openTime || null,
    lastOpenTime: sorted.at(-1)?.openTime || null,
    candles: sorted
  };
}

function buildEmptySeries(symbol, interval, partitionGranularity = "month") {
  return {
    version: STORE_VERSION,
    source: "binance_spot",
    symbol,
    interval,
    intervalMs: intervalToMs(interval),
    updatedAt: null,
    partitionGranularity,
    partitions: [],
    candles: []
  };
}

function partitionKeyForOpenTime(openTime, partitionGranularity = "month") {
  const date = new Date(Number(openTime));
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return partitionGranularity === "day" ? `${year}-${month}-${day}` : `${year}-${month}`;
}

function partitionStartsAt(partitionId, partitionGranularity = "month") {
  if (partitionGranularity === "day") {
    return new Date(`${partitionId}T00:00:00.000Z`).getTime();
  }
  return new Date(`${partitionId}-01T00:00:00.000Z`).getTime();
}

function partitionEndsAt(partitionId, partitionGranularity = "month", intervalMs = 60_000) {
  const start = partitionStartsAt(partitionId, partitionGranularity);
  const next = new Date(start);
  if (partitionGranularity === "day") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next.getTime() - intervalMs;
}

function buildPartitionMetadata(partitionId, candles = [], partitionGranularity = "month", intervalMs = 60_000) {
  const normalized = dedupeCandles(candles);
  return {
    id: partitionId,
    startTime: normalized[0]?.openTime || partitionStartsAt(partitionId, partitionGranularity),
    endTime: normalized.at(-1)?.openTime || partitionEndsAt(partitionId, partitionGranularity, intervalMs),
    count: normalized.length,
    updatedAt: new Date().toISOString()
  };
}

function filterPartitionMetas(partitions = [], { startTime = null, endTime = null } = {}) {
  const lower = startTime == null ? Number.NEGATIVE_INFINITY : Number(startTime);
  const upper = endTime == null ? Number.POSITIVE_INFINITY : Number(endTime);
  return arr(partitions).filter((item) => (item.endTime || Number.NEGATIVE_INFINITY) >= lower && (item.startTime || Number.POSITIVE_INFINITY) <= upper);
}

function buildFreshnessSummary(lastOpenTime, intervalMs, referenceNow, freshnessThresholdMultiplier = 4) {
  const referenceTime = new Date(referenceNow).getTime();
  const lastOpen = Number(lastOpenTime);
  if (!Number.isFinite(referenceTime) || !Number.isFinite(lastOpen) || !intervalMs) {
    return {
      latestClosedOpenTime: null,
      freshnessLagCandles: null,
      freshnessLagMs: null,
      stale: false
    };
  }
  const latestClosedOpenTime = Math.floor((referenceTime - intervalMs) / intervalMs) * intervalMs;
  const freshnessLagMs = Math.max(0, latestClosedOpenTime - lastOpen);
  const freshnessLagCandles = Math.max(0, Math.round(freshnessLagMs / intervalMs));
  return {
    latestClosedOpenTime,
    freshnessLagCandles,
    freshnessLagMs,
    stale: freshnessLagCandles > Math.max(0, Number(freshnessThresholdMultiplier || 4))
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MarketHistoryStore {
  constructor({ rootDir, logger = null, partitionGranularity = "month", renameFile = null } = {}) {
    this.rootDir = rootDir;
    this.logger = logger;
    this.partitionGranularity = ["day", "month"].includes(partitionGranularity) ? partitionGranularity : "month";
    this.recoveryActions = [];
    this.renameFile = renameFile || ((fromPath, toPath) => fs.rename(fromPath, toPath));
    this.rootStatus = {
      rootDir: path.resolve(rootDir || "."),
      source: "runtime",
      status: "unknown",
      exists: false,
      readable: false,
      writable: false,
      created: false,
      error: null,
      checkedAt: null
    };
  }

  async init() {
    await ensureDir(this.rootDir);
    await this.inspectRootDir();
  }

  legacySeriesPath(symbol, interval) {
    return path.join(this.rootDir, "binance", "spot", "klines", interval, `${symbol}.json`);
  }

  seriesDir(symbol, interval) {
    return path.join(this.rootDir, "binance", "spot", "klines", interval, symbol);
  }

  seriesPath(symbol, interval) {
    return path.join(this.seriesDir(symbol, interval), "manifest.json");
  }

  partitionDir(symbol, interval) {
    return path.join(this.seriesDir(symbol, interval), "parts");
  }

  partitionPath(symbol, interval, partitionId) {
    return path.join(this.partitionDir(symbol, interval), `${partitionId}.json`);
  }

  isRecoverableCorruption(error) {
    return ["null_bytes", "invalid_json", "empty_file"].includes(error?.corruptionKind);
  }

  isLockError(error) {
    return ["EPERM", "EACCES", "EBUSY"].includes(error?.code);
  }

  getRootStatus() {
    return {
      ...this.rootStatus,
      rootDir: path.resolve(this.rootDir)
    };
  }

  async inspectRootDir() {
    const resolvedRootDir = path.resolve(this.rootDir);
    const status = {
      rootDir: resolvedRootDir,
      source: "runtime",
      status: "unknown",
      exists: false,
      readable: false,
      writable: false,
      created: false,
      error: null,
      checkedAt: new Date().toISOString()
    };
    try {
      await ensureDir(resolvedRootDir);
      status.exists = true;
      try {
        await fs.access(resolvedRootDir, fsConstants.R_OK);
        status.readable = true;
      } catch (error) {
        status.error = error?.message || status.error;
      }
      const probePath = path.join(resolvedRootDir, `.history-write-probe-${process.pid}-${Date.now()}.tmp`);
      try {
        await fs.writeFile(probePath, "ok\n", "utf8");
        await fs.unlink(probePath);
        status.writable = true;
      } catch (error) {
        status.error = error?.message || status.error;
      }
      status.status = status.writable ? "ready" : status.readable ? "degraded" : "blocked";
    } catch (error) {
      status.status = "blocked";
      status.error = error?.message || "unknown error";
    }
    this.rootStatus = status;
    return this.getRootStatus();
  }

  async quarantineCorruptFile(filePath, atIso = new Date().toISOString()) {
    if (!filePath) {
      return {
        status: "skipped",
        quarantinePath: null,
        errorCode: null
      };
    }
    const resolvedRootDir = path.resolve(this.rootDir);
    const resolvedFilePath = path.resolve(filePath);
    if (!resolvedFilePath.startsWith(resolvedRootDir)) {
      return {
        status: "skipped",
        quarantinePath: null,
        errorCode: "OUTSIDE_ROOT"
      };
    }
    const stamp = atIso.replaceAll(":", "-");
    const quarantinePath = `${resolvedFilePath}.corrupt-${stamp}`;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await this.renameFile(resolvedFilePath, quarantinePath);
        return {
          status: "renamed",
          quarantinePath,
          errorCode: null,
          attempts: attempt
        };
      } catch (error) {
        if (error.code === "ENOENT") {
          return {
            status: "missing",
            quarantinePath: null,
            errorCode: error.code,
            attempts: attempt
          };
        }
        if (this.isLockError(error)) {
          if (attempt < 4) {
            await sleep(25 * attempt);
            continue;
          }
          return {
            status: "deferred",
            quarantinePath: null,
            errorCode: error.code,
            message: error.message,
            attempts: attempt
          };
        }
        throw error;
      }
    }
  }

  noteRecoveryAction(action = {}) {
    this.recoveryActions.push({
      ...action,
      at: action.at || new Date().toISOString()
    });
    this.recoveryActions = this.recoveryActions.slice(-40);
  }

  consumeRecoveryActions(filter = null) {
    const actions = [...this.recoveryActions];
    if (!filter) {
      this.recoveryActions = [];
      return actions;
    }
    const matched = [];
    const kept = [];
    for (const action of actions) {
      if (filter(action)) {
        matched.push(action);
      } else {
        kept.push(action);
      }
    }
    this.recoveryActions = kept;
    return matched;
  }

  async cleanupManifestPartitions({ symbol, interval, partitionIds = [] } = {}) {
    if (!partitionIds.length) {
      return null;
    }
    const manifestPath = this.seriesPath(symbol, interval);
    const manifest = await loadJson(manifestPath, null);
    if (!manifest) {
      return null;
    }
    const blockedIds = new Set(partitionIds);
    const nextManifest = {
      ...manifest,
      updatedAt: new Date().toISOString(),
      partitions: arr(manifest.partitions).filter((item) => !blockedIds.has(item.id))
    };
    await saveJson(manifestPath, nextManifest);
    return nextManifest;
  }

  async rebuildManifestFromPartitions({ symbol, interval, atIso = new Date().toISOString() } = {}) {
    const intervalMs = intervalToMs(interval);
    const partitionFiles = await listFiles(this.partitionDir(symbol, interval));
    const partitions = [];
    for (const filePath of partitionFiles) {
      const partitionId = path.basename(filePath, ".json");
      try {
        const payload = await loadJson(filePath, null);
        const candles = dedupeCandles(payload?.candles || []);
        if (!candles.length) {
          continue;
        }
        partitions.push(buildPartitionMetadata(partitionId, candles, this.partitionGranularity, intervalMs));
      } catch (error) {
        if (!this.isRecoverableCorruption(error)) {
          throw error;
        }
        const quarantine = await this.quarantineCorruptFile(error.filePath || filePath, atIso);
        const actionType = quarantine.status === "deferred" ? "partition_quarantine_deferred" : "partition_quarantined";
        this.logger?.warn?.("Market history partition quarantined during manifest rebuild", {
          symbol,
          interval,
          partitionId,
          filePath: error.filePath || filePath,
          quarantinePath: quarantine.quarantinePath,
          quarantineStatus: quarantine.status,
          errorCode: quarantine.errorCode,
          corruptionKind: error.corruptionKind
        });
        this.noteRecoveryAction({
          type: actionType,
          symbol,
          interval,
          partitionId,
          filePath: error.filePath || filePath,
          quarantinePath: quarantine.quarantinePath,
          quarantineStatus: quarantine.status,
          errorCode: quarantine.errorCode,
          corruptionKind: error.corruptionKind,
          at: atIso
        });
      }
    }
    partitions.sort((left, right) => (left.startTime || 0) - (right.startTime || 0));
    const rebuiltManifest = {
      ...buildEmptySeries(symbol, interval, this.partitionGranularity),
      intervalMs,
      updatedAt: atIso,
      partitions
    };
    await saveJson(this.seriesPath(symbol, interval), rebuiltManifest);
    this.noteRecoveryAction({
      type: "manifest_rebuilt",
      symbol,
      interval,
      partitionCount: partitions.length,
      at: atIso
    });
    return rebuiltManifest;
  }

  async loadPartition({ symbol, interval, partitionId }) {
    const filePath = this.partitionPath(symbol, interval, partitionId);
    try {
      const payload = await loadJson(filePath, null);
      return dedupeCandles(payload?.candles || []);
    } catch (error) {
      if (!this.isRecoverableCorruption(error)) {
        throw error;
      }
      const atIso = new Date().toISOString();
      const quarantine = await this.quarantineCorruptFile(error.filePath || filePath, atIso);
      const actionType = quarantine.status === "deferred" ? "partition_quarantine_deferred" : "partition_quarantined";
      this.logger?.warn?.("Market history partition quarantined", {
        symbol,
        interval,
        partitionId,
        filePath: error.filePath || filePath,
        quarantinePath: quarantine.quarantinePath,
        quarantineStatus: quarantine.status,
        errorCode: quarantine.errorCode,
        corruptionKind: error.corruptionKind
      });
      this.noteRecoveryAction({
        type: actionType,
        symbol,
        interval,
        partitionId,
        filePath: error.filePath || filePath,
        quarantinePath: quarantine.quarantinePath,
        quarantineStatus: quarantine.status,
        errorCode: quarantine.errorCode,
        corruptionKind: error.corruptionKind,
        at: atIso
      });
      return [];
    }
  }

  async maybeMigrateLegacySeries(symbol, interval) {
    let manifest = null;
    try {
      manifest = await loadJson(this.seriesPath(symbol, interval), null);
    } catch (error) {
      if (!this.isRecoverableCorruption(error)) {
        throw error;
      }
      manifest = null;
    }
    if (manifest) {
      return;
    }
    const legacy = await loadJson(this.legacySeriesPath(symbol, interval), null);
    if (!legacy?.candles?.length) {
      return;
    }
    await this.saveSeries({
      ...buildEmptySeries(symbol, interval, this.partitionGranularity),
      ...legacy,
      symbol,
      interval,
      partitionGranularity: this.partitionGranularity,
      candles: dedupeCandles(legacy.candles || [])
    });
    await removeFile(this.legacySeriesPath(symbol, interval));
  }

  async loadManifest({ symbol, interval }) {
    await this.maybeMigrateLegacySeries(symbol, interval);
    let loaded;
    try {
      loaded = await loadJson(this.seriesPath(symbol, interval), buildEmptySeries(symbol, interval, this.partitionGranularity));
    } catch (error) {
      if (!this.isRecoverableCorruption(error)) {
        throw error;
      }
      const atIso = new Date().toISOString();
      const filePath = error.filePath || this.seriesPath(symbol, interval);
      const quarantine = await this.quarantineCorruptFile(filePath, atIso);
      const actionType = quarantine.status === "deferred" ? "manifest_quarantine_deferred" : "manifest_quarantined";
      this.logger?.warn?.("Market history manifest quarantined", {
        symbol,
        interval,
        filePath,
        quarantinePath: quarantine.quarantinePath,
        quarantineStatus: quarantine.status,
        errorCode: quarantine.errorCode,
        corruptionKind: error.corruptionKind
      });
      this.noteRecoveryAction({
        type: actionType,
        symbol,
        interval,
        filePath,
        quarantinePath: quarantine.quarantinePath,
        quarantineStatus: quarantine.status,
        errorCode: quarantine.errorCode,
        corruptionKind: error.corruptionKind,
        at: atIso
      });
      loaded = await this.rebuildManifestFromPartitions({ symbol, interval, atIso });
    }
    return {
      ...buildEmptySeries(symbol, interval, loaded?.partitionGranularity || this.partitionGranularity),
      ...(loaded || {}),
      symbol,
      interval,
      intervalMs: intervalToMs(interval),
      partitionGranularity: loaded?.partitionGranularity || this.partitionGranularity,
      partitions: arr(loaded?.partitions).sort((left, right) => (left.startTime || 0) - (right.startTime || 0))
    };
  }

  async loadSeries({ symbol, interval, startTime = null, endTime = null }) {
    const manifest = await this.loadManifest({ symbol, interval });
    const selectedPartitions = filterPartitionMetas(manifest.partitions || [], { startTime, endTime });
    const candles = [];
    for (const partition of selectedPartitions) {
      candles.push(...await this.loadPartition({ symbol, interval, partitionId: partition.id }));
    }
    const recoveryActions = this.consumeRecoveryActions((action) =>
      action?.symbol === symbol
      && action?.interval === interval
      && [
        "partition_quarantined",
        "partition_quarantine_deferred",
        "manifest_quarantined",
        "manifest_quarantine_deferred",
        "manifest_rebuilt"
      ].includes(action?.type)
    );
    const quarantinedPartitions = recoveryActions.filter((action) => ["partition_quarantined", "partition_quarantine_deferred"].includes(action.type));
    if (quarantinedPartitions.length) {
      await this.cleanupManifestPartitions({
        symbol,
        interval,
        partitionIds: quarantinedPartitions.map((item) => item.partitionId).filter(Boolean)
      });
    }
    return {
      ...manifest,
      candles: dedupeCandles(candles),
      recovery: {
        actionCount: recoveryActions.length,
        actions: recoveryActions.slice(0, 6)
      }
    };
  }

  async listSeriesSymbols(interval) {
    const intervalDir = path.join(this.rootDir, "binance", "spot", "klines", interval);
    try {
      const items = await fs.readdir(intervalDir, { withFileTypes: true });
      return items
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .filter(Boolean)
        .sort();
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async saveSeries(series = {}) {
    const next = {
      ...buildEmptySeries(series.symbol, series.interval, series.partitionGranularity || this.partitionGranularity),
      ...series,
      intervalMs: intervalToMs(series.interval),
      partitionGranularity: series.partitionGranularity || this.partitionGranularity,
      candles: dedupeCandles(series.candles || [])
    };
    const partitionMap = new Map();
    for (const candle of next.candles || []) {
      const partitionId = partitionKeyForOpenTime(candle.openTime, next.partitionGranularity);
      if (!partitionMap.has(partitionId)) {
        partitionMap.set(partitionId, []);
      }
      partitionMap.get(partitionId).push(candle);
    }
    const partitionIds = [...partitionMap.keys()].sort();
    const existingFiles = await listFiles(this.partitionDir(next.symbol, next.interval));
    const activeFiles = new Set();
    const partitions = [];
    for (const partitionId of partitionIds) {
      const candles = dedupeCandles(partitionMap.get(partitionId) || []);
      const partitionPayload = {
        version: STORE_VERSION,
        symbol: next.symbol,
        interval: next.interval,
        partitionId,
        partitionGranularity: next.partitionGranularity,
        updatedAt: new Date().toISOString(),
        candles
      };
      const partitionFile = this.partitionPath(next.symbol, next.interval, partitionId);
      activeFiles.add(partitionFile);
      await saveJson(partitionFile, partitionPayload);
      partitions.push(buildPartitionMetadata(partitionId, candles, next.partitionGranularity, next.intervalMs));
    }
    for (const filePath of existingFiles) {
      if (!activeFiles.has(filePath)) {
        await removeFile(filePath);
      }
    }
    const manifest = {
      ...next,
      version: STORE_VERSION,
      updatedAt: new Date().toISOString(),
      partitions,
      candles: undefined
    };
    await saveJson(this.seriesPath(next.symbol, next.interval), manifest);
    return {
      ...manifest,
      candles: next.candles
    };
  }

  async upsertCandles({ symbol, interval, candles = [] }) {
    const existing = await this.loadSeries({ symbol, interval });
    const mergedCandles = dedupeCandles([...(existing.candles || []), ...(candles || [])]);
    const saved = await this.saveSeries({
      ...existing,
      updatedAt: new Date().toISOString(),
      candles: mergedCandles
    });
    return this.verifySeries({ symbol, interval, series: saved });
  }

  async getCandles({ symbol, interval, startTime = null, endTime = null, limit = null }) {
    const series = await this.loadSeries({ symbol, interval, startTime, endTime });
    let candles = series.candles || [];
    if (startTime != null) {
      candles = candles.filter((item) => item.openTime >= Number(startTime));
    }
    if (endTime != null) {
      candles = candles.filter((item) => item.openTime <= Number(endTime));
    }
    if (Number.isFinite(limit) && limit > 0 && candles.length > limit) {
      candles = candles.slice(-limit);
    }
    return candles;
  }

  async verifySeries({ symbol, interval, series = null, referenceNow = new Date().toISOString(), freshnessThresholdMultiplier = 4 } = {}) {
    const loaded = series || await this.loadSeries({ symbol, interval });
    const analysis = analyzeCandles(loaded.candles || [], interval);
    const freshness = buildFreshnessSummary(analysis.lastOpenTime, analysis.intervalMs, referenceNow, freshnessThresholdMultiplier);
    return {
      symbol,
      interval,
      count: analysis.count,
      expectedCount: analysis.expectedCount,
      coverageRatio: analysis.coverageRatio,
      duplicateCount: analysis.duplicateCount,
      gapCount: analysis.gapCount,
      gaps: analysis.gaps,
      segments: analysis.segments,
      firstOpenTime: analysis.firstOpenTime,
      lastOpenTime: analysis.lastOpenTime,
      latestClosedOpenTime: freshness.latestClosedOpenTime,
      freshnessLagCandles: freshness.freshnessLagCandles,
      freshnessLagMs: freshness.freshnessLagMs,
      stale: freshness.stale,
      updatedAt: loaded.updatedAt || null,
      partitionGranularity: loaded.partitionGranularity || this.partitionGranularity,
      partitionCount: arr(loaded.partitions).length,
      partitions: arr(loaded.partitions).map((item) => ({
        id: item.id,
        startTime: item.startTime || null,
        endTime: item.endTime || null,
        count: item.count || 0,
        updatedAt: item.updatedAt || null
      })),
      recovery: {
        actionCount: loaded.recovery?.actionCount || 0,
        actions: arr(loaded.recovery?.actions || []).slice(0, 6)
      },
      path: this.seriesPath(symbol, interval)
    };
  }
}
