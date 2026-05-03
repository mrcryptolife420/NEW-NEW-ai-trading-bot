import { clamp } from "../utils/math.js";
import { buildExitPlanHint } from "./exitPlanHints.js";

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compact(items = []) {
  return items.filter(Boolean).slice(0, 6);
}

const SETUP_LABELS = {
  trend_continuation: "Trend continuation",
  breakout_retest: "Breakout retest",
  mean_reversion: "Mean reversion",
  liquidity_sweep_reclaim: "Liquidity sweep reclaim",
  vwap_reclaim: "VWAP reclaim",
  range_grid: "Range grid",
  failed_breakout_avoidance: "Failed breakout avoidance"
};

export function buildSetupThesis({
  setupType = "trend_continuation",
  features = {},
  regime = "unknown",
  marketSnapshot = {},
  orderBook = {},
  config = {}
} = {}) {
  const resolved = SETUP_LABELS[setupType] ? setupType : "trend_continuation";
  const unknownSetupFallback = resolved !== setupType;
  const direction = n(features.trendScore ?? features.emaSlopeScore ?? features.momentum20, 0) >= -0.05 ? "long" : "avoid_long";
  const spreadBps = n(orderBook.spreadBps ?? marketSnapshot.book?.spreadBps, 0);
  const riskNotes = [];
  if (unknownSetupFallback) {
    riskNotes.push("unknown_setup_fallback");
  }
  if (spreadBps > n(config.maxAcceptableSpreadBps, 18)) {
    riskNotes.push("spread_elevated");
  }
  if (n(features.atrPercentile?.percentile ?? features.atrPercentile, 0.5) > 0.9) {
    riskNotes.push("atr_percentile_extreme");
  }

  const commonAgainst = compact([
    n(features.orderflowDivergence ?? features.cvdDivergenceScore, 0) > 0.35 && "orderflow divergence against setup",
    n(features.choppinessIndex ?? features.choppiness, 50) > 65 && "high choppiness",
    spreadBps > 18 && "spread too wide"
  ]);

  const templates = {
    trend_continuation: {
      thesis: "Continuation is valid only if trend slope, relative strength and pullback quality remain aligned.",
      evidenceFor: compact([
        n(features.emaSlopeScore ?? features.emaTrendSlopePct, 0) > 0 && "EMA slope stack is positive",
        n(features.relativeStrengthVsBtc ?? features.relativeStrength, 0) > 0 && "relative strength is supportive",
        n(features.vwapZScore?.zScore ?? features.vwapZScore, 0) >= -0.5 && "price is not deeply below VWAP"
      ]),
      invalidatesIf: ["EMA stack rolls over", "close loses VWAP/reclaim level", "BTC/ETH context turns risk-off"],
      requiredConfirmation: ["higher low remains intact", "VWAP acceptance persists"],
      failureModesToWatch: ["late_entry", "trend_structure_break", "execution_drag"]
    },
    breakout_retest: {
      thesis: "Breakout is higher quality after retest and reclaim, not on a first-candle chase.",
      evidenceFor: compact([
        n(features.donchianBreakoutScore ?? features.structureBreakScore, 0) > 0.25 && "prior range high is broken",
        n(features.retestQuality ?? features.breakoutRetestQuality, 0) > 0.45 && "retest quality is acceptable",
        n(features.relativeVolume?.value ?? features.relativeVolume, 1) > 1.1 && "volume expanded on breakout"
      ]),
      invalidatesIf: ["close fails below breakout/retest level", "retest low breaks", "orderflow turns bearish"],
      requiredConfirmation: ["retest low holds", "acceptance above breakout level persists"],
      failureModesToWatch: ["failed_breakout", "crowded_breakout", "execution_drag"]
    },
    mean_reversion: {
      thesis: "Mean reversion needs stretched price plus oscillator exhaustion and a clear VWAP/range target.",
      evidenceFor: compact([
        n(features.rsi14 ?? features.rsi, 50) < 40 && "RSI is oversold",
        n(features.vwapZScore?.zScore ?? features.vwapZScore, 0) < -1 && "price is stretched below VWAP",
        n(features.choppinessIndex ?? features.choppiness, 50) > 45 && "range/chop context supports reversion"
      ]),
      invalidatesIf: ["range low fails", "VWAP target collapses", "trend expansion replaces range behavior"],
      requiredConfirmation: ["range boundary holds", "VWAP or range-mid target remains valid"],
      failureModesToWatch: ["trend_expansion_overpowers_reversion", "stop_too_tight", "late_exit"]
    },
    liquidity_sweep_reclaim: {
      thesis: "Sweep reclaim is valid only after liquidity grab, reclaim close and non-bearish orderflow.",
      evidenceFor: compact([
        n(features.liquiditySweepScore ?? features.sweepScore, 0) > 0.3 && "liquidity sweep detected",
        n(features.reclaimScore ?? features.vwapReclaimScore, 0) > 0.35 && "reclaim score is positive",
        n(features.orderBookImbalanceStability?.averageImbalance ?? orderBook.bookPressure, 0) >= -0.15 && "book is not aggressively bearish"
      ]),
      invalidatesIf: ["sweep low breaks", "reclaim candle fully retraces", "book flips ask-heavy"],
      requiredConfirmation: ["sweep low stays protected", "reclaim close is accepted"],
      failureModesToWatch: ["sweep_reclaim_failure", "bad_entry", "execution_drag"]
    },
    vwap_reclaim: {
      thesis: "VWAP reclaim requires acceptance above VWAP with manageable execution cost.",
      evidenceFor: compact([
        n(features.vwapZScore?.zScore ?? features.vwapZScore, 0) > -0.2 && "price reclaimed or is near VWAP",
        n(features.anchoredVwapDistancePct ?? features.anchoredVwap?.distancePct, 0) >= -0.005 && "anchored VWAP is not lost",
        spreadBps <= 18 && "spread is acceptable"
      ]),
      invalidatesIf: ["VWAP reclaim fails", "acceptance above VWAP disappears", "spread widens into entry"],
      requiredConfirmation: ["close remains accepted above VWAP", "spread remains acceptable"],
      failureModesToWatch: ["vwap_reclaim_loss", "premature_exit", "execution_drag"]
    },
    range_grid: {
      thesis: "Range-grid participation is only valid while boundaries remain respected and expansion risk stays low.",
      evidenceFor: compact([
        n(features.rangeBoundaryRespectScore, 0) > 0.45 && "range boundaries are respected",
        n(features.rangeMeanRevertScore, 0) > 0.45 && "mean reversion score is supportive",
        n(features.rangeStabilityScore, 0) > 0.45 && "range stability is acceptable"
      ]),
      invalidatesIf: ["range boundary breaks", "trend expansion starts", "range-grid quarantine activates"],
      requiredConfirmation: ["range stability remains high", "no breakout-release regime appears"],
      failureModesToWatch: ["range_break_against_grid", "quality_trap", "late_exit"]
    },
    failed_breakout_avoidance: {
      thesis: "Failed-breakout avoidance is a no-entry thesis until reclaim, volume acceptance and orderflow repair the setup.",
      evidenceFor: compact([
        n(features.falseBreakoutRisk, 0) > 0.45 && "false breakout risk is elevated",
        n(features.breakoutFollowThroughScore, 0.5) < 0.45 && "breakout follow-through is weak",
        n(features.orderflowDivergence ?? features.cvdDivergenceScore, 0) > 0.35 && "orderflow divergence warns against continuation"
      ]),
      invalidatesIf: ["level is reclaimed with acceptance", "orderflow confirms continuation", "retest quality improves"],
      requiredConfirmation: ["wait for clean reclaim", "avoid first-candle chase"],
      failureModesToWatch: ["bad_veto", "crowded_breakout", "quality_trap"]
    }
  };

  const selected = templates[resolved];
  const evidenceFor = selected.evidenceFor;
  const evidenceAgainst = commonAgainst;
  const exitPlanHint = buildExitPlanHint({
    setupType: resolved,
    features,
    thesis: { setupType: resolved },
    config
  });
  return {
    setupType: resolved,
    direction: resolved === "failed_breakout_avoidance" ? "avoid_long" : direction,
    thesis: selected.thesis,
    evidenceFor,
    evidenceAgainst,
    requiredConfirmation: selected.requiredConfirmation,
    invalidatesIf: selected.invalidatesIf,
    exitPlanHint,
    failureModesToWatch: selected.failureModesToWatch,
    entryQuality: clamp(0.45 + evidenceFor.length * 0.12 - evidenceAgainst.length * 0.11, 0, 1),
    riskNotes,
    regime,
    diagnosticOnly: true
  };
}
