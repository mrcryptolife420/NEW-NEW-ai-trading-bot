function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = "") {
  const result = `${value ?? ""}`.trim();
  return result || fallback;
}

function normalizeSymbol(value) {
  return text(value).toUpperCase();
}

function key(symbol, timeframe) {
  return `${normalizeSymbol(symbol)}|${text(timeframe, "1m")}`;
}

function coverageFor({ historyCoverage = {}, symbol, timeframe }) {
  const normalizedKey = key(symbol, timeframe);
  const byKey = historyCoverage[normalizedKey] || historyCoverage[`${normalizeSymbol(symbol)}:${timeframe}`];
  const bySymbol = historyCoverage[normalizeSymbol(symbol)]?.[timeframe] || historyCoverage[normalizeSymbol(symbol)];
  const source = byKey || bySymbol || {};
  const candleCount = num(source.candleCount ?? source.count ?? source.candles, 0);
  return {
    candleCount,
    from: source.from || source.firstOpenTime || null,
    to: source.to || source.lastOpenTime || null,
    status: source.status || (candleCount > 0 ? "present" : "missing")
  };
}

function estimateRequestWeight(missingCandles, candlesPerRequest = 1000, weightPerRequest = 2) {
  const requests = Math.ceil(Math.max(0, missingCandles) / Math.max(1, candlesPerRequest));
  return {
    requests,
    estimatedWeight: requests * Math.max(1, weightPerRequest)
  };
}

export function buildPaperReplayCoverageAutopilot({
  symbols = [],
  timeframes = ["1m"],
  requiredCandles = 500,
  historyCoverage = {},
  requestBudget = {},
  strategies = [],
  config = {},
  botMode = "paper"
} = {}) {
  const resolvedSymbols = [...new Set(arr(symbols).map(normalizeSymbol).filter(Boolean))];
  const resolvedTimeframes = [...new Set(arr(timeframes).map((item) => text(item, "1m")).filter(Boolean))];
  const required = Math.max(1, Math.round(num(requiredCandles, config.paperReplayRequiredCandles || 500)));
  const maxPlanWeight = Math.max(1, Math.round(num(config.paperReplayMaxBackfillWeight, requestBudget.remainingWeight1m ?? requestBudget.availableWeight ?? 120)));
  const candlesPerRequest = Math.max(1, Math.round(num(config.paperReplayCandlesPerRequest, 1000)));
  const rows = [];
  const backfillPlan = [];
  let plannedWeight = 0;

  for (const symbol of resolvedSymbols) {
    for (const timeframe of resolvedTimeframes) {
      const coverage = coverageFor({ historyCoverage, symbol, timeframe });
      const missingCandles = Math.max(0, required - coverage.candleCount);
      const ratio = Math.min(1, coverage.candleCount / required);
      const estimate = estimateRequestWeight(missingCandles, candlesPerRequest, config.paperReplayWeightPerRequest || 2);
      const capped = plannedWeight + estimate.estimatedWeight > maxPlanWeight;
      const rowStatus = missingCandles <= 0 ? "usable" : coverage.candleCount <= 0 ? "blocked" : "weak";
      rows.push({
        symbol,
        timeframe,
        requiredCandles: required,
        candleCount: coverage.candleCount,
        missingCandles,
        coverageRatio: Number(ratio.toFixed(4)),
        status: rowStatus,
        from: coverage.from,
        to: coverage.to,
        requestEstimate: estimate,
        backfillCapped: Boolean(capped && missingCandles > 0)
      });
      if (missingCandles > 0 && !capped) {
        plannedWeight += estimate.estimatedWeight;
        backfillPlan.push({
          symbol,
          timeframe,
          missingCandles,
          requests: estimate.requests,
          estimatedWeight: estimate.estimatedWeight,
          dryRun: true,
          action: "backfill_historical_candles"
        });
      }
    }
  }

  const blocked = rows.filter((row) => row.status === "blocked");
  const weak = rows.filter((row) => row.status === "weak");
  const capped = rows.filter((row) => row.backfillCapped);
  const strategyTags = arr(strategies).map((strategy) => {
    const strategySymbols = arr(strategy.symbols || resolvedSymbols).map(normalizeSymbol);
    const affected = rows.filter((row) => strategySymbols.includes(row.symbol) && row.status !== "usable");
    return {
      strategy: strategy.id || strategy.strategy || strategy.family || "unknown_strategy",
      tags: affected.length ? ["replay_coverage_weak"] : [],
      affectedSymbols: [...new Set(affected.map((row) => row.symbol))]
    };
  });
  const status = !resolvedSymbols.length
    ? "empty"
    : blocked.length
      ? "blocked"
      : weak.length || capped.length
        ? "weak"
        : "usable";

  return {
    status,
    botMode,
    symbols: rows,
    backfillPlan,
    plannedWeight,
    maxPlanWeight,
    strategyTags,
    warnings: [
      ...(!resolvedSymbols.length ? ["empty_symbol_set"] : []),
      ...(blocked.length ? ["empty_history_detected"] : []),
      ...(weak.length ? ["partial_history_detected"] : []),
      ...(capped.length ? ["request_budget_cap_prevents_full_backfill_plan"] : [])
    ],
    paperOnly: botMode !== "live",
    diagnosticsOnly: botMode === "live",
    liveBehaviorChanged: false,
    dryRunOnly: true
  };
}

export function summarizePaperReplayCoverage(input = {}) {
  return buildPaperReplayCoverageAutopilot(input);
}
