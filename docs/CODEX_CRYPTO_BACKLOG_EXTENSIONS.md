# Codex Crypto Backlog Extensions

Deze aanvullende backlog hoort bij `docs/CODEX_EXECUTION_PLAN.md`. Gebruik dezelfde globale safety-regels:

- Live safety mag nooit versoepeld worden.
- Geen echte Binance orders in tests.
- Geen force-unlock van exchange safety.
- Exchange safety, reconcile, manual review en unresolved execution intents blijven hard blockers.
- Nieuwe tradingfeatures eerst diagnostics/paper/shadow, niet direct agressieve live execution.
- Meerdere open posities moeten mogelijk blijven in gezonde state via `MAX_OPEN_POSITIONS`.
- Geen duplicate modules bouwen als bestaande modules kunnen worden uitgebreid.
- Elke behavior-change krijgt regressietests.
- `npm test` moet slagen voordat iets als afgerond mag worden.

Deze aanbevelingen zijn toegevoegd na extra codebase-checks en zijn bedoeld als vervolg op B1-B12 uit `CODEX_EXECUTION_PLAN.md`.

---

## B13 — Stablecoin depeg en quote-asset risk monitor

Bron: nieuwe analyse / crypto risk improvement
Status: proposed

Doel: USDT/USDC/FDUSD of andere quote-asset risico's detecteren zodat de bot niet blind blijft traden bij stablecoin stress.

- [ ] Maak of update `src/market/stablecoinRisk.js`.
- [ ] Monitor quote-asset deviation, stablecoin spread, abnormal volume, redemption/depeg headline signals en cross-pair stress.
- [ ] Output bevat `stablecoinRisk`, `affectedQuotes`, `depegBps`, `warnings`, `entryPenalty`, `manualReviewRecommended`.
- [ ] Verbind met `safetySnapshot`, `cryptoRegimeRouter` en dashboard summary waar veilig.
- [ ] Voeg tests toe voor normal peg, mild depeg, severe depeg, missing data en stale price source.
- [ ] Docs bijwerken in `docs/TRADING_FEATURE_INVENTORY.md` of `docs/RISK_MANAGEMENT.md`.

Acceptatie:

- [ ] Stablecoin stress kan entries conservatiever maken of manual review adviseren.
- [ ] Geen automatische force-sell of force-unlock.
- [ ] Missing stablecoin data versoepelt live safety niet.
- [ ] `npm test` slaagt.

---

## B14 — Cross-exchange divergence en Binance-local price sanity

Bron: nieuwe analyse / market data quality improvement
Status: proposed

Doel: detecteren wanneer Binance-prijs afwijkt van bredere markt of wanneer lokale feed corrupt/stale lijkt.

- [ ] Maak of update `src/market/crossExchangeDivergence.js`.
- [ ] Provider-interface voor externe reference prices zonder hard dependency.
- [ ] Vergelijk Binance mid/last met reference mid/last.
- [ ] Output bevat `divergenceBps`, `referenceCount`, `confidence`, `warnings`, `staleSources`.
- [ ] Voeg `priceSanityStatus` toe aan data freshness/trading path health indien veilig.
- [ ] Tests toevoegen voor normal divergence, severe divergence, stale reference, missing references en outlier reference.
- [ ] Docs bijwerken in `docs/DATA_INTEGRITY.md` of `docs/TRADING_FEATURE_INVENTORY.md`.

Acceptatie:

- [ ] Severe divergence verlaagt confidence of blokkeert diagnostics volgens config.
- [ ] Geen externe provider vereist om tests te draaien.
- [ ] Geen live behavior agressiever.
- [ ] `npm test` slaagt.

---

## B15 — Microstructure fill simulator voor paper/backtest

Bron: nieuwe analyse / execution realism improvement
Status: proposed

Doel: paper en backtest realistischer maken door fills te simuleren op basis van spread, depth, volume, urgency en order type.

- [ ] Maak of update `src/execution/microstructureFillSimulator.js`.
- [ ] Simuleer maker fill probability, taker slippage, partial fill, queue risk en timeout.
- [ ] Inputs: order type, quantity, notional, spread, book depth, candle volume, volatility, latency.
- [ ] Output bevat `fillProbability`, `expectedSlippageBps`, `partialFillRatio`, `timeoutRisk`, `warnings`.
- [ ] Verbind met paper broker/backtest alleen waar veilig en config-gated.
- [ ] Tests toevoegen voor tight spread, wide spread, thin book, high volatility, maker timeout en partial fill.
- [ ] Docs bijwerken in `docs/BACKTEST_QUALITY.md` of `docs/EXECUTION_SAFETY.md`.

Acceptatie:

- [ ] Paper/backtest worden realistischer, niet optimistischer zonder warning.
- [ ] Geen live execution behavior gewijzigd.
- [ ] `npm test` slaagt.

---

## B16 — Strategy retirement en quarantine lifecycle

Bron: nieuwe analyse / strategy governance improvement
Status: proposed

Doel: strategieën die structureel slecht presteren automatisch naar watch/quarantine/retired diagnostics verplaatsen.

- [ ] Maak of update `src/runtime/strategyLifecycle.js`.
- [ ] States: `active`, `watch`, `quarantine`, `retired`, `shadow_only`, `retest_required`.
- [ ] Criteria: drawdown, bad exit quality, bad veto ratio, poor calibration, poor paper/live parity, repeated execution drag.
- [ ] Output bevat `strategyId`, `state`, `reasons`, `retestRequirements`, `recommendedAction`.
- [ ] Verbind met `antiOverfitGovernor`, `failureLibrary`, `paperLiveParity` en dashboard summary waar veilig.
- [ ] Tests toevoegen voor healthy strategy, watch, quarantine, retired, recovery after retest en missing stats.
- [ ] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [ ] Geen automatische live promotie.
- [ ] Slechte strategieën kunnen diagnostisch worden gedegradeerd of live-blocked volgens bestaande safety policy.
- [ ] `npm test` slaagt.

---

## B17 — Risk-of-ruin en drawdown forecast monitor

Bron: nieuwe analyse / portfolio risk improvement
Status: proposed

Doel: naast actuele drawdown ook verwachte drawdown en risk-of-ruin op basis van trade distribution tonen.

- [ ] Maak of update `src/risk/riskOfRuin.js`.
- [ ] Gebruik historical trade outcomes, avg R, win rate, payoff ratio, streaks en current exposure.
- [ ] Output bevat `riskOfRuinScore`, `expectedDrawdown`, `lossStreakRisk`, `recommendedSizeMultiplier`, `warnings`.
- [ ] Verbind met portfolio risk dashboard en `portfolioScenarioStress` waar veilig.
- [ ] Tests toevoegen voor empty history, positive expectancy, negative expectancy, high variance en high exposure.
- [ ] Docs bijwerken in `docs/RISK_MANAGEMENT.md`.

Acceptatie:

- [ ] Monitor is diagnostics/governance-first.
- [ ] Geen automatische live size increase.
- [ ] Hoge risk-of-ruin mag size verlagen of entries blokkeren volgens config, nooit safety versoepelen.
- [ ] `npm test` slaagt.

---

## B18 — Time-in-market en opportunity cost analyzer

Bron: nieuwe analyse / performance analytics improvement
Status: proposed

Doel: meten of de bot te lang in zwakke trades blijft of kapitaal blokkeert dat beter elders gebruikt had kunnen worden.

- [ ] Maak of update `src/runtime/opportunityCostAnalyzer.js`.
- [ ] Meet time in market, idle capital, position stagnation, missed higher-quality candidates en capital lock.
- [ ] Output bevat `timeInMarket`, `stagnationRisk`, `opportunityCostScore`, `capitalEfficiency`, `recommendedAction`.
- [ ] Verbind met exit intelligence en dashboard summary waar veilig.
- [ ] Tests toevoegen voor fast winner, slow loser, flat stagnant trade, idle capital en missing candidate data.
- [ ] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [ ] Analyzer is diagnostics-first.
- [ ] Geen automatische forced exits zonder bestaande safe exit policy.
- [ ] `npm test` slaagt.

---

## B19 — Tax/performance ledger en realized PnL audit

Bron: nieuwe analyse / accounting and audit improvement
Status: proposed

Doel: realized PnL, fees, fills, cost basis en trade attribution auditable maken voor performance review.

- [ ] Maak of update `src/runtime/performanceLedger.js`.
- [ ] Track realized PnL, fees, cost basis, average entry, partial exits, dust, quote/base conversions en trade attribution.
- [ ] Output bevat per trade en per day summary.
- [ ] Voeg reconciliation checks toe tussen local ledger, fills en account deltas.
- [ ] Tests toevoegen voor partial fills, partial exits, fees in quote/base, dust, break-even en negative PnL.
- [ ] Docs bijwerken in `docs/OPERATOR_COMMANDS.md` of `docs/PERFORMANCE_LEDGER.md`.

Acceptatie:

- [ ] Ledger is audit/read-only first.
- [ ] Geen live execution behavior gewijzigd.
- [ ] `npm test` slaagt.

---

## B20 — Walk-forward deployment report voor strategy changes

Bron: nieuwe analyse / research-to-production improvement
Status: proposed

Doel: voor elke strategy/config wijziging een compact rapport maken met walk-forward, regime split en safety summary voordat het naar paper/canary gaat.

- [ ] Maak of update `src/research/walkForwardDeploymentReport.js`.
- [ ] Combineer backtest metrics, regime split, sample size, failure modes, calibration, anti-overfit verdict en canary gate status.
- [ ] Output bevat `deploymentStatus`, `blockingReasons`, `warnings`, `recommendedNextStep`.
- [ ] Voeg CLI command toe: `node src/cli.js research:deployment-report` indien passend.
- [ ] Tests toevoegen voor not enough samples, weak regime, strong report, failed anti-overfit en missing backtest data.
- [ ] Docs bijwerken in `docs/BACKTEST_QUALITY.md` of `docs/TRADING_QUALITY.md`.

Acceptatie:

- [ ] Rapport is read-only/governance-first.
- [ ] Geen automatische live promotie.
- [ ] `npm test` slaagt.

---

## B21 — API degradation en fallback-mode planner

Bron: nieuwe analyse / runtime reliability improvement
Status: proposed

Doel: als Binance/API/data providers degraderen, moet de bot automatisch uitleggen welke veilige fallback-mode geldt.

- [ ] Maak of update `src/runtime/apiDegradationPlanner.js`.
- [ ] Detecteer REST budget pressure, repeated 429/5xx, stale websocket/user stream, partial data provider outage en latency spikes.
- [ ] Output bevat `degradationLevel`, `allowedModes`, `blockedActions`, `recommendedAction`, `retryAfterMs`.
- [ ] Verbind met tradingPathHealth, requestBudget en safetySnapshot waar veilig.
- [ ] Tests toevoegen voor normal, rate limited, stale stream, partial outage en full outage.
- [ ] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md`.

Acceptatie:

- [ ] Degradatie kan entries blokkeren of observe/protect-only adviseren.
- [ ] Geen force unlock.
- [ ] `npm test` slaagt.

---

## B22 — Strategy explainability snapshot voor elke candidate

Bron: nieuwe analyse / explainability improvement
Status: proposed

Doel: niet alleen uitgevoerde trades, maar ook afgewezen candidates moeten compact uitlegbaar zijn.

- [ ] Maak of update `src/runtime/candidateExplainability.js`.
- [ ] Per candidate output: setupType, top evidence, top conflicts, blocker, score components, regime fit, execution fit, risk fit.
- [ ] Verbind met dashboard top decisions en replay/debug waar veilig.
- [ ] Tests toevoegen voor approved candidate, blocked candidate, missing features, unknown regime en execution conflict.
- [ ] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [ ] Afgewezen kansen zijn uitlegbaar.
- [ ] Geen live behavior gewijzigd.
- [ ] `npm test` slaagt.
