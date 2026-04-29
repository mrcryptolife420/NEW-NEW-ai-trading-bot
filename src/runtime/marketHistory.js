import { BinanceClient, normalizeKlines } from "../binance/client.js";
import { MarketHistoryStore, analyzeCandles, intervalToMs } from "../storage/marketHistoryStore.js";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveDefaultHistoryDir } from "../config/index.js";

export function createHistoryClient({ config, logger, client = null } = {}) {
  if (client) {
    return client;
  }
  return new BinanceClient({
    apiKey: "",
    apiSecret: "",
    baseUrl: config.binanceApiBaseUrl,
    recvWindow: config.binanceRecvWindow,
    logger
  });
}

export function createHistoryStore({ config, logger, store = null } = {}) {
  if (store) {
    return store;
  }
  return new MarketHistoryStore({
    rootDir: config.historyDir,
    logger,
    partitionGranularity: config.historyPartitionGranularity || "month"
  });
}

async function fetchRangeCandles({ client, symbol, interval, startTime = null, endTime = null, limit = 1000 }) {
  const raw = await client.getKlines(symbol, interval, limit, {
    startTime: startTime == null ? undefined : Number(startTime),
    endTime: endTime == null ? undefined : Number(endTime)
  });
  return normalizeKlines(raw);
}

export async function fetchLatestCandlesPaginated({ client, symbol, interval, targetCount, batchSize = 1000, endTime = null }) {
  const candles = [];
  let cursorEndTime = endTime == null ? null : Number(endTime);
  while (candles.length < targetCount) {
    const remaining = Math.max(1, targetCount - candles.length);
    const batch = await fetchRangeCandles({
      client,
      symbol,
      interval,
      endTime: cursorEndTime,
      limit: Math.min(batchSize, remaining)
    });
    if (!batch.length) {
      break;
    }
    candles.unshift(...batch);
    const oldest = batch[0];
    if (!oldest?.openTime) {
      break;
    }
    cursorEndTime = oldest.openTime - 1;
    if (batch.length < Math.min(batchSize, remaining)) {
      break;
    }
  }
  return candles.slice(-targetCount);
}

export async function fetchHistoricalRangePaginated({ client, symbol, interval, startTime, endTime = null, batchSize = 1000 }) {
  const candles = [];
  const intervalMs = intervalToMs(interval);
  let cursorStartTime = Number(startTime);
  const finalEndTime = endTime == null ? null : Number(endTime);
  while (Number.isFinite(cursorStartTime)) {
    const batch = await fetchRangeCandles({
      client,
      symbol,
      interval,
      startTime: cursorStartTime,
      endTime: finalEndTime,
      limit: batchSize
    });
    if (!batch.length) {
      break;
    }
    candles.push(...batch);
    const newest = batch.at(-1);
    if (!newest?.openTime) {
      break;
    }
    const nextStartTime = newest.openTime + intervalMs;
    if (finalEndTime != null && nextStartTime > finalEndTime) {
      break;
    }
    if (nextStartTime <= cursorStartTime) {
      break;
    }
    cursorStartTime = nextStartTime;
    if (batch.length < batchSize) {
      break;
    }
  }
  return candles;
}

function filterCoverageGaps(gaps = [], { startTime = null, endTime = null } = {}) {
  const lower = startTime == null ? Number.NEGATIVE_INFINITY : Number(startTime);
  const upper = endTime == null ? Number.POSITIVE_INFINITY : Number(endTime);
  return gaps.filter((gap) => gap.endTime >= lower && gap.startTime <= upper);
}

function summarizeVerification(result = {}) {
  return {
    symbol: result.symbol || null,
    interval: result.interval || null,
    count: result.count || 0,
    expectedCount: result.expectedCount || 0,
    coverageRatio: result.coverageRatio == null ? null : Number(result.coverageRatio.toFixed(4)),
    gapCount: result.gapCount || 0,
    duplicateCount: result.duplicateCount || 0,
    stale: Boolean(result.stale),
    freshnessLagCandles: result.freshnessLagCandles == null ? null : result.freshnessLagCandles,
    partitionCount: result.partitionCount || 0,
    partitionGranularity: result.partitionGranularity || null,
    firstOpenTime: result.firstOpenTime || null,
    lastOpenTime: result.lastOpenTime || null,
    latestClosedOpenTime: result.latestClosedOpenTime || null,
    updatedAt: result.updatedAt || null,
    segments: (result.segments || []).slice(0, 12),
    gaps: (result.gaps || []).slice(0, 12),
    recovery: {
      actionCount: result.recovery?.actionCount || 0,
      actions: (result.recovery?.actions || []).slice(0, 6)
    },
    path: result.path || null
  };
}

function summarizeVerificationCollection(items = []) {
  const staleSymbols = items.filter((item) => item.stale).map((item) => item.symbol);
  const gapSymbols = items.filter((item) => (item.gapCount || 0) > 0).map((item) => item.symbol);
  const uncoveredSymbols = items.filter((item) => !(item.count > 0)).map((item) => item.symbol);
  return {
    symbolCount: items.length,
    coveredSymbolCount: items.filter((item) => (item.count || 0) > 0).length,
    staleSymbolCount: staleSymbols.length,
    gapSymbolCount: gapSymbols.length,
    uncoveredSymbolCount: uncoveredSymbols.length,
    partitionedSymbolCount: items.filter((item) => (item.partitionCount || 0) > 1).length,
    staleSymbols,
    gapSymbols,
    uncoveredSymbols,
    status: uncoveredSymbols.length
      ? "missing"
      : staleSymbols.length || gapSymbols.length
        ? "degraded"
        : items.length
          ? "ready"
          : "empty"
  };
}

export async function backfillHistoricalCandles({
  config,
  logger = null,
  symbol,
  interval = null,
  targetCount = null,
  startTime = null,
  endTime = null,
  client = null,
  store = null,
  refreshLatest = true
}) {
  const effectiveInterval = interval || config.klineInterval;
  const intervalMs = intervalToMs(effectiveInterval);
  const effectiveStore = createHistoryStore({ config, logger, store });
  await effectiveStore.init();
  const effectiveClient = createHistoryClient({ config, logger, client });
  const fetchedRanges = [];

  let candles = await effectiveStore.getCandles({ symbol, interval: effectiveInterval });
  if (!candles.length) {
    if (targetCount) {
      const latest = await fetchLatestCandlesPaginated({
        client: effectiveClient,
        symbol,
        interval: effectiveInterval,
        targetCount,
        batchSize: config.historyFetchBatchSize || 1000
      });
      candles = latest;
      if (latest.length) {
        fetchedRanges.push({ kind: "latest", count: latest.length, startTime: latest[0].openTime, endTime: latest.at(-1).openTime });
      }
    } else if (startTime != null) {
      const ranged = await fetchHistoricalRangePaginated({
        client: effectiveClient,
        symbol,
        interval: effectiveInterval,
        startTime,
        endTime,
        batchSize: config.historyFetchBatchSize || 1000
      });
      candles = ranged;
      if (ranged.length) {
        fetchedRanges.push({ kind: "range", count: ranged.length, startTime: ranged[0].openTime, endTime: ranged.at(-1).openTime });
      }
    }
  }

  if (targetCount && candles.length > 0 && candles.length < targetCount) {
    const older = await fetchLatestCandlesPaginated({
      client: effectiveClient,
      symbol,
      interval: effectiveInterval,
      targetCount: targetCount - candles.length,
      batchSize: config.historyFetchBatchSize || 1000,
      endTime: candles[0].openTime - 1
    }).catch(() => []);
    if (older.length) {
      candles = [...older, ...candles];
      fetchedRanges.push({ kind: "older", count: older.length, startTime: older[0].openTime, endTime: older.at(-1).openTime });
    }
  }

  let analysis = analyzeCandles(candles, effectiveInterval);
  const requestedStartTime = startTime != null
    ? Number(startTime)
    : targetCount && candles.length
      ? candles[Math.max(0, candles.length - targetCount)]?.openTime || null
      : null;
  const requestedEndTime = endTime != null ? Number(endTime) : null;
  const gapRanges = filterCoverageGaps(analysis.gaps, { startTime: requestedStartTime, endTime: requestedEndTime }).slice(0, config.historyMaxGapFillRanges || 24);
  for (const gap of gapRanges) {
    const fill = await fetchHistoricalRangePaginated({
      client: effectiveClient,
      symbol,
      interval: effectiveInterval,
      startTime: gap.startTime,
      endTime: gap.endTime,
      batchSize: config.historyFetchBatchSize || 1000
    });
    if (fill.length) {
      candles = [...candles, ...fill];
      fetchedRanges.push({ kind: "gap_fill", count: fill.length, startTime: fill[0].openTime, endTime: fill.at(-1).openTime });
    }
  }

  if (refreshLatest && candles.length) {
    const latestStartTime = candles.at(-1).openTime + intervalMs;
    const newer = await fetchHistoricalRangePaginated({
      client: effectiveClient,
      symbol,
      interval: effectiveInterval,
      startTime: latestStartTime,
      endTime: requestedEndTime,
      batchSize: config.historyFetchBatchSize || 1000
    }).catch(() => []);
    if (newer.length) {
      candles = [...candles, ...newer];
      fetchedRanges.push({ kind: "refresh_latest", count: newer.length, startTime: newer[0].openTime, endTime: newer.at(-1).openTime });
    }
  }

  const verification = await effectiveStore.upsertCandles({ symbol, interval: effectiveInterval, candles });
  const loadedCandles = await effectiveStore.getCandles({
    symbol,
    interval: effectiveInterval,
    startTime: requestedStartTime,
    endTime: requestedEndTime,
    limit: targetCount
  });
  analysis = analyzeCandles(loadedCandles, effectiveInterval);
  return {
    symbol,
    interval: effectiveInterval,
    count: loadedCandles.length,
    fetchedRanges,
    gapCount: verification.gapCount,
    duplicateCount: verification.duplicateCount,
    coverageStart: verification.firstOpenTime,
    coverageEnd: verification.lastOpenTime,
    candles: loadedCandles,
    verification,
    requestedCoverage: {
      startTime: requestedStartTime,
      endTime: requestedEndTime,
      gapCount: analysis.gapCount
    }
  };
}

export async function loadHistoricalCandles({
  config,
  logger = null,
  symbol,
  interval = null,
  targetCount,
  client = null,
  store = null,
  refreshLatest = true
}) {
  const effectiveInterval = interval || config.klineInterval;
  const effectiveClient = createHistoryClient({ config, logger, client });
  if (config.historyCacheEnabled === false) {
    return fetchLatestCandlesPaginated({
      client: effectiveClient,
      symbol,
      interval: effectiveInterval,
      targetCount,
      batchSize: config.historyFetchBatchSize || 1000
    });
  }
  const result = await backfillHistoricalCandles({
    config,
    logger,
    symbol,
    interval,
    targetCount,
    client,
    store,
    refreshLatest
  });
  return result.candles;
}

function parseFlexibleTime(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function parseHistoryArgs(args = [], config = {}) {
  const options = {
    subcommand: (args[0] || "fetch").toLowerCase(),
    interval: config.klineInterval,
    count: null,
    startTime: null,
    endTime: null,
    symbols: [],
    fromDir: null,
    toDir: null,
    dryRun: false
  };
  for (const rawArg of args.slice(1)) {
    const arg = `${rawArg}`.trim();
    if (!arg) {
      continue;
    }
    if (arg.startsWith("--interval=")) {
      options.interval = arg.slice("--interval=".length);
      continue;
    }
    if (arg.startsWith("--count=")) {
      options.count = Number(arg.slice("--count=".length)) || null;
      continue;
    }
    if (arg.startsWith("--start=")) {
      options.startTime = parseFlexibleTime(arg.slice("--start=".length));
      continue;
    }
    if (arg.startsWith("--end=")) {
      options.endTime = parseFlexibleTime(arg.slice("--end=".length));
      continue;
    }
    if (arg.startsWith("--from=")) {
      options.fromDir = arg.slice("--from=".length);
      continue;
    }
    if (arg.startsWith("--to=")) {
      options.toDir = arg.slice("--to=".length);
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    options.symbols.push(arg.toUpperCase());
  }
  return options;
}

function summarizeStorageStatus(storage = {}) {
  return {
    rootDir: storage.rootDir || null,
    status: storage.status || "unknown",
    exists: Boolean(storage.exists),
    readable: Boolean(storage.readable),
    writable: Boolean(storage.writable),
    created: Boolean(storage.created),
    error: storage.error || null,
    checkedAt: storage.checkedAt || null
  };
}

async function listHistoryFiles(rootDir) {
  const files = [];
  async function walk(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files.sort();
}

async function migrateHistoryRoot({ fromDir, toDir, dryRun = false } = {}) {
  const resolvedFromDir = path.resolve(fromDir);
  const resolvedToDir = path.resolve(toDir);
  if (resolvedFromDir === resolvedToDir) {
    return {
      fromDir: resolvedFromDir,
      toDir: resolvedToDir,
      dryRun,
      fileCount: 0,
      copiedCount: 0,
      skippedCount: 0,
      status: "noop",
      note: "Bron en doel voor history migratie zijn identiek."
    };
  }
  const files = await listHistoryFiles(resolvedFromDir);
  let copiedCount = 0;
  let skippedCount = 0;
  for (const filePath of files) {
    const relativePath = path.relative(resolvedFromDir, filePath);
    const targetPath = path.join(resolvedToDir, relativePath);
    const sourceStat = await fs.stat(filePath);
    let targetStat = null;
    try {
      targetStat = await fs.stat(targetPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    if (targetStat?.isFile?.() && targetStat.size === sourceStat.size) {
      skippedCount += 1;
      continue;
    }
    if (!dryRun) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(filePath, targetPath);
    }
    copiedCount += 1;
  }
  return {
    fromDir: resolvedFromDir,
    toDir: resolvedToDir,
    dryRun,
    fileCount: files.length,
    copiedCount,
    skippedCount,
    sampleFiles: files.slice(0, 12).map((filePath) => path.relative(resolvedFromDir, filePath)),
    status: files.length ? "migrated" : "empty",
    note: files.length
      ? dryRun
        ? `Dry-run zag ${files.length} history-bestanden voor migratie.`
        : `${copiedCount} history-bestanden gekopieerd naar de nieuwe root.`
      : "Geen history-bestanden gevonden in de bronmap."
  };
}

async function repairHistorySymbols({
  config,
  logger,
  store,
  symbols = [],
  interval,
  targetCount
}) {
  const client = createHistoryClient({ config, logger });
  const results = [];
  for (const symbol of symbols) {
    const before = summarizeVerification(await store.verifySeries({
      symbol,
      interval,
      referenceNow: new Date().toISOString(),
      freshnessThresholdMultiplier: config.historyVerifyFreshnessMultiplier || 4
    }));
    const needsFetch = !(before.count > 0) || (before.gapCount || 0) > 0 || before.stale;
    let fetchApplied = false;
    let fetchError = null;
    if (needsFetch) {
      try {
        await backfillHistoricalCandles({
          config,
          logger,
          symbol,
          interval,
          targetCount,
          client,
          store,
          refreshLatest: true
        });
        fetchApplied = true;
      } catch (error) {
        fetchError = error?.message || "unknown error";
      }
    }
    const after = summarizeVerification(await store.verifySeries({
      symbol,
      interval,
      referenceNow: new Date().toISOString(),
      freshnessThresholdMultiplier: config.historyVerifyFreshnessMultiplier || 4
    }));
    results.push({
      symbol,
      repairMode: needsFetch ? "local_and_backfill" : "local_only",
      fetchApplied,
      fetchError,
      before,
      after
    });
  }
  return results;
}

export async function runHistoryCommand({ config, logger, args = [] }) {
  const options = parseHistoryArgs(args, config);
  const store = createHistoryStore({ config, logger });
  await store.init();
  const storage = summarizeStorageStatus(store.getRootStatus());
  const symbols = (options.symbols.length ? options.symbols : config.watchlist).slice(0, config.researchMaxSymbols || config.watchlist.length);
  if (options.subcommand === "inspect") {
    const localSymbols = await store.listSeriesSymbols(options.interval);
    return {
      command: "history inspect",
      interval: options.interval,
      historyDir: config.historyDir,
      historyDirSource: config.historyDirSource || "unknown",
      defaultHistoryDir: resolveDefaultHistoryDir(),
      storage,
      localSymbolCount: localSymbols.length,
      localSymbols: localSymbols.slice(0, 20)
    };
  }
  if (options.subcommand === "migrate") {
    const fromDir = options.fromDir || (config.historyDirSource === "env" ? resolveDefaultHistoryDir() : config.historyDir);
    const toDir = options.toDir || config.historyDir;
    const migration = await migrateHistoryRoot({
      fromDir,
      toDir,
      dryRun: options.dryRun
    });
    const targetStore = createHistoryStore({
      config: { ...config, historyDir: migration.toDir },
      logger
    });
    await targetStore.init();
    return {
      command: "history migrate",
      historyDir: config.historyDir,
      historyDirSource: config.historyDirSource || "unknown",
      storage,
      migration,
      targetStorage: summarizeStorageStatus(targetStore.getRootStatus())
    };
  }
  if (options.subcommand === "verify") {
    const summaries = [];
    for (const symbol of symbols) {
      summaries.push(summarizeVerification(await store.verifySeries({
        symbol,
        interval: options.interval,
        referenceNow: new Date().toISOString(),
        freshnessThresholdMultiplier: config.historyVerifyFreshnessMultiplier || 4
      })));
    }
    return {
      command: "history verify",
      interval: options.interval,
      historyDir: config.historyDir,
      historyDirSource: config.historyDirSource || "unknown",
      storage,
      aggregate: summarizeVerificationCollection(summaries),
      symbols: summaries
    };
  }
  if (options.subcommand === "repair") {
    const localSymbols = await store.listSeriesSymbols(options.interval);
    const repairSymbols = (options.symbols.length ? options.symbols : localSymbols.length ? localSymbols : config.watchlist)
      .slice(0, config.researchMaxSymbols || config.watchlist.length);
    const targetCount = options.count || (config.researchCandleLimit || 900);
    const repairs = await repairHistorySymbols({
      config,
      logger,
      store,
      symbols: repairSymbols,
      interval: options.interval,
      targetCount
    });
    return {
      command: "history repair",
      interval: options.interval,
      targetCount,
      historyDir: config.historyDir,
      historyDirSource: config.historyDirSource || "unknown",
      storage,
      aggregate: summarizeVerificationCollection(repairs.map((item) => item.after)),
      symbols: repairs,
      repairedSymbolCount: repairs.filter((item) => item.fetchApplied).length,
      localOnlySymbolCount: repairs.filter((item) => item.repairMode === "local_only").length,
      failedFetchSymbolCount: repairs.filter((item) => item.fetchError).length
    };
  }
  const client = createHistoryClient({ config, logger });
  const targetCount = options.count || (options.subcommand === "backfill" ? (config.researchCandleLimit || 900) : (config.backtestCandleLimit || config.klineLimit || 500));
  const results = [];
  for (const symbol of symbols) {
    const result = await backfillHistoricalCandles({
      config,
      logger,
      symbol,
      interval: options.interval,
      targetCount,
      startTime: options.startTime,
      endTime: options.endTime,
      client,
      store,
      refreshLatest: true
    });
    results.push({
      symbol: result.symbol,
      interval: result.interval,
      count: result.count,
      fetchedRanges: result.fetchedRanges,
      verification: summarizeVerification(result.verification)
    });
  }
  return {
    command: `history ${options.subcommand}`,
    interval: options.interval,
    targetCount,
    startTime: options.startTime,
    endTime: options.endTime,
    historyDir: config.historyDir,
    historyDirSource: config.historyDirSource || "unknown",
    storage,
    aggregate: summarizeVerificationCollection(results.map((item) => item.verification)),
    symbols: results
  };
}
