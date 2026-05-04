# Trading Quality Diagnostics

This patch adds a diagnostics-first trading-quality layer. It is designed to improve operator review, paper learning, and backtest analysis without making live trading more aggressive.

## Modules

- `src/strategy/advancedIndicators.js` contains fallback-safe pure helpers for anchored VWAP, EMA slope stack, relative volume, squeeze state, ATR percentile, VWAP Z-score, OBV divergence, spread percentile, and order-book imbalance stability.
- `src/strategy/indicatorRegimeScoring.js` scores whether indicators fit the current regime/setup. It separates supporting indicators, conflicts, and warnings.
- `src/strategy/setupThesis.js` builds compact thesis diagnostics for trend continuation, breakout retest, mean reversion, liquidity sweep reclaim, and VWAP reclaim.
- `src/strategy/exitPlanHints.js` provides setup-aware exit planning hints such as invalidation type, time stop, partial take-profit, and trail activation.
- `src/risk/portfolioCrowding.js` detects duplicate symbol blocks and portfolio crowding without disabling normal multi-position support.
- `src/backtest/backtestMetrics.js` computes quality metrics such as expectancy, profit factor, drawdown, average R, fee drag, slippage drag, and sample-size warning.
- `src/runtime/learningEvidencePipeline.js` connects trade thesis, exit quality, veto outcome, failure library, regime confusion, trade autopsy, and replay-pack priority into one fallback-safe evidence record.
- `src/ai/antiOverfitGovernor.js` blocks unsafe research/paper proposals such as low-sample threshold relief, size increases based only on recent paper wins, paper-only evidence promoted to live, coupled threshold relief plus bigger size, and promotions when calibration worsens.
- `src/ai/confidenceCalibration.js` builds diagnostics-first confidence buckets, compares average confidence with realized outcomes, flags overconfidence/underconfidence, and feeds calibration risk into anti-overfit promotion review.
- `src/runtime/cryptoRegimeRouter.js` maps broader crypto context into diagnostics/shadow-first regimes: BTC-led trend, ETH-led trend, alt rotation, range chop, liquidity vacuum, crash risk, and news shock. It outputs allowed/blocked setup-family guidance, size hints, confidence penalty, warnings, and indicator-regime fit without changing entry permission or live execution.
- `src/runtime/candidateExplainability.js` builds compact diagnostics for approved and rejected candidates. It surfaces setup type, top evidence, conflicts, blocker, score components, regime fit, execution fit, and risk fit without changing ranking, sizing, or execution.
- `src/runtime/strategyRetirementEngine.js` now exposes `buildStrategyLifecycle`, with the compatibility entrypoint `src/runtime/strategyLifecycle.js`. It classifies strategies as `active`, `watch`, `quarantine`, `retired`, `shadow_only`, or `retest_required` from drawdown, bad exits, bad vetoes, calibration, paper/live parity, execution drag, anti-overfit review, and retest evidence. The output is diagnostics-first and does not auto-promote live behavior.
- `src/runtime/opportunityCostAnalyzer.js` measures time-in-market, stagnant positions, idle capital, missed higher-quality candidates, capital efficiency, and opportunity-cost score. It provides review hints only; it never performs forced exits.
- `src/news/shockCircuitBreaker.js` adds a conservative news/social shock layer on top of existing event classification. It detects hacks/exploits, delisting or halt risk, regulatory shocks, listing hype, stale news providers, and abnormal headline velocity. Positive news does not loosen live thresholds; critical shocks can only add caution/manual-review or stricter policy behavior when explicitly enabled.
- `src/runtime/symbolQualityDecay.js` adds adaptive symbol quality decay. It tracks repeated blockers, bad fills, stop-limit-stuck events, poor slippage, low data quality, bad veto outcomes, bad exit quality, and clean recovery evidence. It outputs `qualityScore`, `cooldownUntil`, `rankPenalty`, reasons, recovery conditions, and universe/scan hints. The helper is diagnostics-first and never auto-increases ranking.

## Runtime Visibility

Dashboard decision cards can now include `tradingQualitySummary` with:

- `topSetupType`
- `regimeFit`
- `bestEvidence`
- `mainConflict`
- `portfolioCrowdingRisk`
- `exitPlanHint`
- `learningEvidenceSummary`
- `confidenceCalibrationSummary`
- `antiOverfitSummary`
- `backtestQualitySummary`
- `candidateExplainabilitySummary`
- `strategyLifecycleSummary`
- `opportunityCostSummary`
- `newsShockSummary`
- `symbolQualityDecaySummary`

The dashboard normalizer treats the summary as optional, so older snapshots remain valid.

## Safety Rules

- Live safety is unchanged and remains stricter than paper.
- Exchange safety, reconcile, manual review, unresolved execution intents, and health-circuit blockers remain hard blockers.
- New positive indicator diagnostics do not lower live thresholds or bypass risk gates.
- Portfolio crowding reduces size or blocks duplicates/extreme crowding; it does not impose a hardcoded one-position mode.
- Post-reconcile probation continues to use configurable multi-position limits instead of max-one assumptions.
- Anti-overfit governance is advisory/blocking for proposed changes; it does not auto-promote or auto-apply live changes.
- Confidence calibration can block model/parameter promotion through governance, but it does not force live threshold, sizing, or execution changes.
- Crypto regime routing is diagnostics/shadow-first. It does not clear exchange safety, lower thresholds, increase live size, or bypass hard blockers.
- Candidate explainability is read-only diagnostics. It explains candidates and rejected setups but does not approve entries, clear blockers, or change order behavior.
- Strategy lifecycle diagnostics can recommend watch/quarantine/retire/retest states, but they do not automatically promote a strategy to live or bypass exchange safety, reconcile, manual review, unresolved intents, or risk limits.
- Opportunity-cost diagnostics can recommend exit/trim review under existing exit policy, but they do not force exits, cancel orders, bypass protection, or change live execution behavior.
- News shock diagnostics can add entry penalty/manual-review recommendations. They do not clear blockers, force entries, or increase live aggressiveness.
- Symbol quality decay can lower ranking/exposure diagnostics or suggest cooldown review for temporarily weak symbols. It does not blacklist permanently, auto-promote recovered symbols, clear hard safety blockers, or place orders.
