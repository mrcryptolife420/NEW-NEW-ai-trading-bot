import { evaluateAntiOverfitGovernor } from "../ai/antiOverfitGovernor.js";
import { clamp } from "../utils/math.js";

export const STRATEGY_LIFECYCLE_STATES = Object.freeze([
  "active",
  "watch",
  "quarantine",
  "retired",
  "shadow_only",
  "retest_required"
]);

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function num(value, digits = 4) {
  return Number(safeNumber(value).toFixed(digits));
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function average(values = [], fallback = 0) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : fallback;
}

function ratio(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function hasStatus(value, status) {
  return `${value || ""}`.toLowerCase() === status;
}

function addReason(reasons, code, detail = {}) {
  reasons.push({ code, ...detail });
}

function buildLifecycleRetestRequirements({ state, previousState, config = {} } = {}) {
  if (!["quarantine", "retired", "shadow_only", "retest_required"].includes(state)) {
    return [];
  }
  const minSamples = Math.max(1, Math.round(safeNumber(config.strategyLifecycleRetestMinTrades, 12)));
  const maxDrawdown = ratio(config.strategyLifecycleRetestMaxDrawdownPct, 0.05);
  return [
    `collect_${minSamples}_paper_or_shadow_trades`,
    `max_drawdown_at_or_below_${num(maxDrawdown * 100, 1)}pct`,
    "no_hard_safety_or_reconcile_conflicts",
    "paper_live_parity_not_degraded",
    previousState === "retired" ? "operator_review_required_before_any_live_candidate" : "operator_review_before_live_impact"
  ];
}

export function buildStrategyLifecycle({
  strategyId = "unknown",
  stats = {},
  failureStats = {},
  paperLiveParity = {},
  calibration = {},
  antiOverfit = null,
  proposedChanges = [],
  retest = {},
  previousState = null,
  config = {}
} = {}) {
  const id = strategyId || stats.strategyId || stats.id || "unknown";
  const minTrades = Math.max(1, Math.round(safeNumber(config.strategyLifecycleMinTrades, 8)));
  const tradeCount = Math.max(0, Math.round(safeNumber(stats.tradeCount ?? stats.trades ?? stats.sampleSize, 0)));
  const maxDrawdown = ratio(stats.maxDrawdownPct ?? stats.maxDrawdown ?? stats.drawdownPct, 0);
  const expectancy = safeNumber(stats.expectancy ?? stats.avgNetPnl ?? stats.avgPnlPct, 0);
  const badExitRate = ratio(failureStats.badExitRate ?? failureStats.bad_exit_rate ?? stats.badExitRate, 0);
  const badVetoRatio = ratio(failureStats.badVetoRatio ?? failureStats.bad_veto_ratio ?? stats.badVetoRatio, 0);
  const executionDragCount = Math.max(0, Math.round(safeNumber(
    failureStats.executionDragCount ?? failureStats.execution_drag_count ?? stats.executionDragCount,
    0
  )));
  const executionDragBps = safeNumber(
    failureStats.executionDragBps ?? stats.executionDragBps ?? stats.avgExecutionDragBps,
    0
  );
  const calibrationError = ratio(
    calibration.error ?? calibration.calibrationError ?? calibration.brierDelta ?? calibration.delta,
    0
  );
  const parityScore = safeNumber(paperLiveParity.score ?? paperLiveParity.parityScore, 1);
  const parityMismatch = ratio(
    paperLiveParity.mismatchRate ?? paperLiveParity.driftPct ?? paperLiveParity.driftRatio,
    0
  );
  const watchDrawdown = ratio(config.strategyLifecycleWatchDrawdownPct, 0.05);
  const quarantineDrawdown = ratio(config.strategyLifecycleQuarantineDrawdownPct, 0.1);
  const retireDrawdown = ratio(config.strategyLifecycleRetireDrawdownPct, 0.18);
  const badExitWatch = ratio(config.strategyLifecycleBadExitWatchRate, 0.35);
  const badExitQuarantine = ratio(config.strategyLifecycleBadExitQuarantineRate, 0.55);
  const badVetoWatch = ratio(config.strategyLifecycleBadVetoWatchRate, 0.25);
  const badVetoQuarantine = ratio(config.strategyLifecycleBadVetoQuarantineRate, 0.45);
  const calibrationWatch = ratio(config.strategyLifecycleCalibrationWatchError, 0.08);
  const calibrationQuarantine = ratio(config.strategyLifecycleCalibrationQuarantineError, 0.16);
  const parityQuarantineScore = safeNumber(config.strategyLifecycleParityQuarantineScore, 0.62);
  const parityMismatchWatch = ratio(config.strategyLifecycleParityMismatchWatchRate, 0.08);
  const parityMismatchQuarantine = ratio(config.strategyLifecycleParityMismatchQuarantineRate, 0.16);
  const executionDragWatchCount = Math.max(1, Math.round(safeNumber(config.strategyLifecycleExecutionDragWatchCount, 2)));
  const executionDragQuarantineCount = Math.max(1, Math.round(safeNumber(config.strategyLifecycleExecutionDragQuarantineCount, 4)));
  const executionDragQuarantineBps = safeNumber(config.strategyLifecycleExecutionDragQuarantineBps, 22);
  const reasons = [];
  const warnings = [];

  if (tradeCount < minTrades) {
    addReason(reasons, "insufficient_lifecycle_samples", { tradeCount, minTrades });
  }
  if (maxDrawdown >= watchDrawdown) {
    addReason(reasons, maxDrawdown >= quarantineDrawdown ? "drawdown_severe" : "drawdown_watch", { maxDrawdown: num(maxDrawdown) });
  }
  if (badExitRate >= badExitWatch) {
    addReason(reasons, badExitRate >= badExitQuarantine ? "bad_exit_quality_severe" : "bad_exit_quality_watch", { badExitRate: num(badExitRate) });
  }
  if (badVetoRatio >= badVetoWatch) {
    addReason(reasons, badVetoRatio >= badVetoQuarantine ? "bad_veto_ratio_severe" : "bad_veto_ratio_watch", { badVetoRatio: num(badVetoRatio) });
  }
  if (calibrationError >= calibrationWatch || hasStatus(calibration.status, "degraded") || hasStatus(calibration.status, "blocked")) {
    addReason(reasons, calibrationError >= calibrationQuarantine || hasStatus(calibration.status, "blocked")
      ? "poor_calibration_severe"
      : "poor_calibration_watch", { calibrationError: num(calibrationError) });
  }
  if (parityScore < 1 && parityScore <= parityQuarantineScore) {
    addReason(reasons, "paper_live_parity_degraded", { parityScore: num(parityScore) });
  } else if (parityMismatch >= parityMismatchWatch) {
    addReason(reasons, parityMismatch >= parityMismatchQuarantine
      ? "paper_live_parity_mismatch_severe"
      : "paper_live_parity_mismatch_watch", { parityMismatch: num(parityMismatch) });
  }
  if (executionDragCount >= executionDragWatchCount || executionDragBps >= executionDragQuarantineBps) {
    addReason(reasons, executionDragCount >= executionDragQuarantineCount || executionDragBps >= executionDragQuarantineBps
      ? "repeated_execution_drag_severe"
      : "repeated_execution_drag_watch", { executionDragCount, executionDragBps: num(executionDragBps, 2) });
  }

  const antiOverfitReview = antiOverfit || evaluateAntiOverfitGovernor({
    proposedChanges,
    evidence: {
      sampleSize: tradeCount,
      calibrationDelta: calibrationError,
      source: stats.evidenceSource || "paper"
    },
    config
  });
  if (antiOverfitReview.status === "blocked") {
    addReason(reasons, "anti_overfit_blocked", { blockedChanges: antiOverfitReview.blockedChanges?.length || 0 });
  }

  const severeCodes = new Set([
    "drawdown_severe",
    "bad_exit_quality_severe",
    "bad_veto_ratio_severe",
    "poor_calibration_severe",
    "paper_live_parity_degraded",
    "paper_live_parity_mismatch_severe",
    "repeated_execution_drag_severe"
  ]);
  const severeCount = reasons.filter((reason) => severeCodes.has(reason.code)).length;
  const hasParityIssue = reasons.some((reason) => reason.code.startsWith("paper_live_parity"));
  const hasMissingSamplesOnly = reasons.length === 1 && reasons[0].code === "insufficient_lifecycle_samples";
  const retestPassed = Boolean(retest.passed || retest.status === "passed");
  const retestCompleted = Boolean(retest.completed || retest.status === "passed" || retest.status === "failed");

  let state = "active";
  if (stats.retireRecommended || maxDrawdown >= retireDrawdown || (previousState === "quarantine" && severeCount >= 2 && tradeCount >= minTrades)) {
    state = "retired";
  } else if (["quarantine", "retired"].includes(previousState) && !retestPassed) {
    state = "retest_required";
  } else if (hasMissingSamplesOnly) {
    state = "retest_required";
  } else if (severeCount >= 2 || (severeCount >= 1 && tradeCount >= minTrades && expectancy < 0)) {
    state = "quarantine";
  } else if (hasParityIssue || hasStatus(paperLiveParity.status, "degraded")) {
    state = "shadow_only";
  } else if (reasons.length || antiOverfitReview.status === "blocked") {
    state = "watch";
  }

  if (retestPassed && ["quarantine", "retired", "retest_required"].includes(previousState || "") && severeCount === 0 && !hasMissingSamplesOnly) {
    state = "active";
    addReason(reasons, "retest_passed", { retestTrades: retest.tradeCount ?? retest.sampleSize ?? null });
  } else if (retestCompleted && !retestPassed && ["quarantine", "retired", "retest_required"].includes(previousState || "")) {
    state = "retest_required";
    addReason(reasons, "retest_failed", {});
  }

  if (state === "retired") {
    warnings.push("retired_strategy_requires_operator_review_before_reactivation");
  }
  if (state === "quarantine") {
    warnings.push("quarantined_strategy_should_remain_shadow_or_paper_until_retest_passes");
  }

  const recommendedAction = {
    active: "keep_strategy_available_under_existing_risk_limits",
    watch: "keep_diagnostics_active_and_reduce_confidence_until_evidence_improves",
    quarantine: "route_strategy_to_shadow_or_paper_retest_only",
    retired: "block_new_allocations_and_require_operator_review",
    shadow_only: "keep_strategy_shadow_only_until_paper_live_parity_recovers",
    retest_required: "collect_retest_samples_before_new_allocation"
  }[state];

  return {
    strategyId: id,
    state,
    reasons,
    retestRequirements: buildLifecycleRetestRequirements({ state, previousState, config }),
    recommendedAction,
    warnings,
    evidence: {
      tradeCount,
      minTrades,
      maxDrawdown: num(maxDrawdown),
      expectancy: num(expectancy),
      badExitRate: num(badExitRate),
      badVetoRatio: num(badVetoRatio),
      executionDragCount,
      executionDragBps: num(executionDragBps, 2),
      calibrationError: num(calibrationError),
      parityScore: num(parityScore),
      parityMismatch: num(parityMismatch),
      antiOverfitStatus: antiOverfitReview.status
    },
    diagnosticsOnly: true,
    autoPromotesLive: false,
    liveBehaviorChanged: false
  };
}

function buildStatusTriggers({
  provisionalStatus = "active",
  governanceScore = 0,
  cooldownFloor = 0.47,
  retireFloor = 0.33,
  negativePnl = false,
  falseNegativeHeavy = false,
  falsePositiveHeavy = false,
  lowReview = false,
  hasCooldownHint = false
} = {}) {
  const triggers = [];
  if (provisionalStatus === "retire") {
    if (governanceScore <= retireFloor) {
      triggers.push("governance_score_below_retire_floor");
    }
    if (negativePnl && falsePositiveHeavy && lowReview) {
      triggers.push("negative_pnl_false_positive_bias_low_review");
    }
    return triggers;
  }
  if (provisionalStatus === "cooldown") {
    if (governanceScore <= cooldownFloor) {
      triggers.push("governance_score_below_cooldown_floor");
    }
    if (hasCooldownHint) {
      triggers.push("offline_trainer_cooldown_hint");
    }
    if (negativePnl) {
      triggers.push("negative_realized_pnl");
    }
    if (falseNegativeHeavy) {
      triggers.push("false_negative_rate_high");
    }
  }
  return triggers;
}

function buildPolicyNote({
  stale = false,
  status = "active",
  triggers = [],
  policy = {},
  cooldownFloor = 0.47,
  retireFloor = 0.33
} = {}) {
  if (stale) {
    return "Historische strategy-governance is stale; cooldown telt nu alleen nog als observatie.";
  }
  if (status === "retire") {
    if (triggers.includes("negative_pnl_false_positive_bias_low_review")) {
      return `Retire actief: realized PnL ${num(policy.realizedPnl, 2)} met false-positive rate ${num(policy.falsePositiveRate)} en reviewscore ${num(policy.avgReviewScore)}.`;
    }
    if (triggers.includes("governance_score_below_retire_floor")) {
      return `Retire actief: governance ${num(average(policy.governanceScores, 0), 4)} ligt onder retire-floor ${num(retireFloor, 2)}.`;
    }
    return "Governance score zakte te ver weg voor nieuwe allocatie.";
  }
  if (status === "cooldown") {
    const details = [];
    if (triggers.includes("governance_score_below_cooldown_floor")) {
      details.push(`governance ${num(average(policy.governanceScores, 0), 4)} < ${num(cooldownFloor, 2)}`);
    }
    if (triggers.includes("negative_realized_pnl")) {
      details.push(`realized PnL ${num(policy.realizedPnl, 2)}`);
    }
    if (triggers.includes("false_negative_rate_high")) {
      details.push(`false-negative rate ${num(policy.falseNegativeRate)}`);
    }
    if (triggers.includes("offline_trainer_cooldown_hint")) {
      details.push("offline trainer hint cooldown");
    }
    return details.length
      ? `Cooldown actief: ${details.join(" | ")}.`
      : "Strategie blijft actief maar met lagere prioriteit.";
  }
  return policy.noteSeeds?.[0] || "Geen retirement-actie nodig.";
}

function buildLatestTradeMap(journal = {}) {
  const latest = new Map();
  for (const trade of arr(journal.trades || [])) {
    const strategyId = trade.strategyAtEntry || trade.strategyDecision?.activeStrategy || trade.entryRationale?.strategy?.activeStrategy || "unknown";
    const tradeAt = trade.exitAt || trade.entryAt || null;
    const tradeMs = new Date(tradeAt || 0).getTime();
    if (!Number.isFinite(tradeMs)) {
      continue;
    }
    const previousMs = latest.get(strategyId)?.tradeMs || 0;
    if (tradeMs > previousMs) {
      latest.set(strategyId, { tradeAt, tradeMs });
    }
  }
  return latest;
}

export function buildStrategyRetirementSnapshot({
  report = {},
  offlineTrainer = {},
  journal = {},
  config = {},
  nowIso = new Date().toISOString()
} = {}) {
  const policies = new Map();
  const minTrades = safeNumber(config.strategyRetirementMinTrades, 4);
  const cooldownFloor = safeNumber(config.strategyRetirementGovernanceCooldown, 0.47);
  const retireFloor = safeNumber(config.strategyRetirementGovernanceRetire, 0.33);
  const retirementMaxIdleHours = safeNumber(config.strategyRetirementMaxIdleHours, 120);
  const nowMs = new Date(nowIso).getTime();
  const latestTradeMap = buildLatestTradeMap(journal);

  const getPolicy = (id) => {
    const key = id || "unknown";
    if (!policies.has(key)) {
      policies.set(key, {
        id: key,
        tradeCount: 0,
        realizedPnl: 0,
        winRate: 0,
        avgReviewScore: 0,
        avgPnlPct: 0,
        governanceScores: [],
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        statusHints: [],
        noteSeeds: []
      });
    }
    return policies.get(key);
  };

  for (const item of arr(report.tradeQualityReview?.strategyScorecards || [])) {
    const policy = getPolicy(item.id);
    policy.tradeCount = Math.max(policy.tradeCount, item.tradeCount || 0);
    policy.realizedPnl = item.realizedPnl || policy.realizedPnl;
    policy.winRate = item.winRate || policy.winRate;
    policy.avgReviewScore = item.avgReviewScore || policy.avgReviewScore;
    policy.governanceScores.push(item.governanceScore || 0);
    if ((item.falseNegativeCount || 0) > 0) {
      policy.noteSeeds.push(`${item.falseNegativeCount} missed winner(s) in recent quality review.`);
    }
  }

  for (const item of arr(offlineTrainer.strategyScorecards || [])) {
    const policy = getPolicy(item.id);
    policy.tradeCount = Math.max(policy.tradeCount, item.tradeCount || 0);
    policy.realizedPnl = safeNumber(policy.realizedPnl, item.realizedPnl || 0) || (item.realizedPnl || 0);
    policy.winRate = Math.max(policy.winRate, item.winRate || 0);
    policy.avgPnlPct = item.avgMovePct || policy.avgPnlPct;
    policy.falsePositiveRate = Math.max(policy.falsePositiveRate, item.falsePositiveRate || 0);
    policy.falseNegativeRate = Math.max(policy.falseNegativeRate, item.falseNegativeRate || 0);
    policy.governanceScores.push(item.governanceScore || 0);
    policy.statusHints.push(item.status || "observe");
    if ((item.falsePositiveCount || 0) > 0) {
      policy.noteSeeds.push(`${item.falsePositiveCount} false positive(s) drukken de governance score.`);
    }
  }

  for (const item of arr(report.attribution?.strategies || [])) {
    const policy = getPolicy(item.id);
    policy.tradeCount = Math.max(policy.tradeCount, item.tradeCount || 0);
    policy.realizedPnl = safeNumber(item.realizedPnl, policy.realizedPnl);
    policy.winRate = Math.max(policy.winRate, item.winRate || 0);
    policy.avgPnlPct = item.averagePnlPct || policy.avgPnlPct;
  }

  for (const trade of arr(journal.trades || []).slice(-24)) {
    const policy = getPolicy(trade.strategyAtEntry || trade.entryRationale?.strategy?.activeStrategy || "unknown");
    if ((trade.pnlQuote || 0) < 0) {
      policy.noteSeeds.push(`${trade.symbol} sloot recent negatief.`);
    }
  }

  const entries = [...policies.values()]
    .map((policy) => {
      const latestTrade = latestTradeMap.get(policy.id) || null;
      const lastTradeAgeHours = latestTrade && Number.isFinite(nowMs)
        ? (nowMs - latestTrade.tradeMs) / 3_600_000
        : null;
      const stale = Number.isFinite(lastTradeAgeHours) && lastTradeAgeHours > retirementMaxIdleHours;
      const governanceScore = average(policy.governanceScores, policy.tradeCount >= minTrades ? 0.5 : 0.42);
      const negativePnl = (policy.realizedPnl || 0) < 0;
      const lowReview = (policy.avgReviewScore || 0) > 0 ? (policy.avgReviewScore || 0) < 0.45 : false;
      const falsePositiveHeavy = (policy.falsePositiveRate || 0) >= 0.34;
      const falseNegativeHeavy = (policy.falseNegativeRate || 0) >= 0.28;
      const hasCooldownHint = policy.statusHints.includes("cooldown");
      const hasWarmupOnly = policy.tradeCount < minTrades;
      const provisionalStatus = hasWarmupOnly
        ? "observe"
        : governanceScore <= retireFloor || (negativePnl && falsePositiveHeavy && lowReview)
          ? "retire"
          : governanceScore <= cooldownFloor || hasCooldownHint || falseNegativeHeavy
            ? "cooldown"
            : "active";
      const statusTriggers = buildStatusTriggers({
        provisionalStatus,
        governanceScore,
        cooldownFloor,
        retireFloor,
        negativePnl,
        falseNegativeHeavy,
        falsePositiveHeavy,
        lowReview,
        hasCooldownHint
      });
      const status = stale && ["cooldown", "retire"].includes(provisionalStatus)
        ? "observe"
        : provisionalStatus;
      const sizeMultiplier = status === "retire" ? 0 : status === "cooldown" ? 0.72 : 1;
      const confidence = clamp(0.34 + Math.min(policy.tradeCount, 10) * 0.05, 0.34, 0.94);
      return {
        id: policy.id,
        tradeCount: policy.tradeCount,
        realizedPnl: num(policy.realizedPnl, 2),
        winRate: num(policy.winRate),
        avgReviewScore: num(policy.avgReviewScore),
        avgPnlPct: num(policy.avgPnlPct),
        governanceScore: num(governanceScore),
        falsePositiveRate: num(policy.falsePositiveRate),
        falseNegativeRate: num(policy.falseNegativeRate),
        confidence: num(confidence),
        stale,
        latestTradeAt: latestTrade?.tradeAt || null,
        lastTradeAgeHours: Number.isFinite(lastTradeAgeHours) ? num(lastTradeAgeHours, 1) : null,
        status,
        statusTriggers,
        sizeMultiplier: num(sizeMultiplier, 3),
        note: buildPolicyNote({
          stale,
          status,
          triggers: statusTriggers,
          policy,
          cooldownFloor,
          retireFloor
        })
      };
    })
    .sort((left, right) => {
      const severity = { retire: 0, cooldown: 1, observe: 2, active: 3 };
      const severityDelta = (severity[left.status] || 9) - (severity[right.status] || 9);
      return severityDelta !== 0 ? severityDelta : (left.governanceScore || 0) - (right.governanceScore || 0);
    });

  const retireCount = entries.filter((item) => item.status === "retire").length;
  const cooldownCount = entries.filter((item) => item.status === "cooldown").length;
  const activeCount = entries.filter((item) => item.status === "active").length;

  return {
    generatedAt: nowIso,
    status: retireCount
      ? "blocked"
      : cooldownCount
        ? "watch"
        : entries.length
          ? "ready"
          : "warmup",
    retireCount,
    cooldownCount,
    activeCount,
    policies: entries.slice(0, 12),
    blockedStrategies: entries.filter((item) => item.status === "retire").map((item) => item.id),
    cooldownStrategies: entries.filter((item) => item.status === "cooldown").map((item) => item.id),
    notes: [
      retireCount
        ? `${retireCount} strategie(en) zijn tijdelijk uit roulatie gehaald.`
        : "Geen strategie staat momenteel op retire.",
      cooldownCount
        ? `${cooldownCount} strategie(en) draaien in cooldown met lagere allocatie.`
        : "Geen actieve strategy cooldowns gedetecteerd.",
      activeCount
        ? `${activeCount} strategie(en) blijven inzetbaar volgens governance.`
        : "Nog geen duidelijke active strategy pool zichtbaar."
    ]
  };
}
