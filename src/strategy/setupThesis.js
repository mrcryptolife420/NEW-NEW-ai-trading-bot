import { clamp } from "../utils/math.js";

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
  vwap_reclaim: "VWAP reclaim"
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
  const direction = n(features.trendScore ?? features.emaSlopeScore ?? features.momentum20, 0) >= -0.05 ? "long" : "avoid_long";
  const spreadBps = n(orderBook.spreadBps ?? marketSnapshot.book?.spreadBps, 0);
  const riskNotes = [];
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
      invalidatesIf: ["EMA stack rolls over", "close loses VWAP/reclaim level", "BTC/ETH context turns risk-off"]
    },
    breakout_retest: {
      thesis: "Breakout is higher quality after retest and reclaim, not on a first-candle chase.",
      evidenceFor: compact([
        n(features.donchianBreakoutScore ?? features.structureBreakScore, 0) > 0.25 && "prior range high is broken",
        n(features.retestQuality ?? features.breakoutRetestQuality, 0) > 0.45 && "retest quality is acceptable",
        n(features.relativeVolume?.value ?? features.relativeVolume, 1) > 1.1 && "volume expanded on breakout"
      ]),
      invalidatesIf: ["close fails below breakout/retest level", "retest low breaks", "orderflow turns bearish"]
    },
    mean_reversion: {
      thesis: "Mean reversion needs stretched price plus oscillator exhaustion and a clear VWAP/range target.",
      evidenceFor: compact([
        n(features.rsi14 ?? features.rsi, 50) < 40 && "RSI is oversold",
        n(features.vwapZScore?.zScore ?? features.vwapZScore, 0) < -1 && "price is stretched below VWAP",
        n(features.choppinessIndex ?? features.choppiness, 50) > 45 && "range/chop context supports reversion"
      ]),
      invalidatesIf: ["range low fails", "VWAP target collapses", "trend expansion replaces range behavior"]
    },
    liquidity_sweep_reclaim: {
      thesis: "Sweep reclaim is valid only after liquidity grab, reclaim close and non-bearish orderflow.",
      evidenceFor: compact([
        n(features.liquiditySweepScore ?? features.sweepScore, 0) > 0.3 && "liquidity sweep detected",
        n(features.reclaimScore ?? features.vwapReclaimScore, 0) > 0.35 && "reclaim score is positive",
        n(features.orderBookImbalanceStability?.averageImbalance ?? orderBook.bookPressure, 0) >= -0.15 && "book is not aggressively bearish"
      ]),
      invalidatesIf: ["sweep low breaks", "reclaim candle fully retraces", "book flips ask-heavy"]
    },
    vwap_reclaim: {
      thesis: "VWAP reclaim requires acceptance above VWAP with manageable execution cost.",
      evidenceFor: compact([
        n(features.vwapZScore?.zScore ?? features.vwapZScore, 0) > -0.2 && "price reclaimed or is near VWAP",
        n(features.anchoredVwapDistancePct ?? features.anchoredVwap?.distancePct, 0) >= -0.005 && "anchored VWAP is not lost",
        spreadBps <= 18 && "spread is acceptable"
      ]),
      invalidatesIf: ["VWAP reclaim fails", "acceptance above VWAP disappears", "spread widens into entry"]
    }
  };

  const selected = templates[resolved];
  const evidenceFor = selected.evidenceFor;
  const evidenceAgainst = commonAgainst;
  return {
    setupType: resolved,
    direction,
    thesis: selected.thesis,
    evidenceFor,
    evidenceAgainst,
    invalidatesIf: selected.invalidatesIf,
    entryQuality: clamp(0.45 + evidenceFor.length * 0.12 - evidenceAgainst.length * 0.11, 0, 1),
    riskNotes,
    regime,
    diagnosticOnly: true
  };
}
