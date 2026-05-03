# Codex Additional Recommendations B24-B31

Deze aanvullende MD hoort bij `docs/CODEX_EXECUTION_PLAN.md`.

Belangrijk:

- Nieuwe aanbevelingen moeten uiteindelijk ook zichtbaar/indexed zijn in `docs/CODEX_EXECUTION_PLAN.md`.
- Dit bestand is aangemaakt omdat de hoofdroadmap groot is en veilig direct patchen via tooling riskant kan zijn.
- Gebruik dezelfde globale safety-regels als in `CODEX_EXECUTION_PLAN.md`.
- Geen live safety versoepelen.
- Geen echte Binance orders in tests.
- Geen force-unlock.
- Exchange safety, reconcile, manual review en unresolved execution intents blijven hard blockers.
- Nieuwe features starten als `diagnostics_only`, `shadow_only`, `paper_only` of `governance_only`, nooit direct als agressieve live feature.
- `npm test` moet slagen voordat iets als afgerond wordt gemarkeerd.

---

## B24 — WebSocket heartbeat en stream failover monitor

Bron: nieuwe analyse / runtime reliability improvement  
Status: proposed  
Eerste integratie: `diagnostics_only`

Doel:
Detecteren wanneer websocket/user-data streams stale, disconnected of gedeeltelijk kapot zijn, en veilig terugvallen naar observe/protect-only of REST verification zonder live safety te versoepelen.

- [ ] Maak of update `src/runtime/streamHealthMonitor.js`.
- [ ] Monitor websocket heartbeat, last message age, reconnect count, stream lag en user-data freshness.
- [ ] Output bevat `streamStatus`, `staleStreams`, `lastHealthyAt`, `degradationLevel`, `recommendedAction`.
- [ ] Verbind met `tradingPathHealth`, `apiDegradationPlanner`, `safetySnapshot` en dashboard summary waar veilig.
- [ ] Tests toevoegen voor healthy stream, stale ticker stream, stale user stream, reconnect storm, partial stream outage en missing stream metadata.
- [ ] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md`.

Acceptatie:

- [ ] Stale user/exchange streams kunnen entries blokkeren of protect-only adviseren.
- [ ] Geen force-unlock.
- [ ] Geen echte exchange calls in tests.
- [ ] `npm test` slaagt.

---

## B25 — Order lifecycle en orphan order auditor

Bron: nieuwe analyse / execution safety improvement  
Status: proposed  
Eerste integratie: `governance_only`

Doel:
Elke order moet een duidelijke lifecycle hebben. Orphan orders, unknown open orders en mismatches tussen local state en exchange state moeten zichtbaar en veilig geblokkeerd worden.

- [ ] Maak of update `src/execution/orderLifecycleAuditor.js`.
- [ ] Track states: `created`, `submitted`, `acknowledged`, `partially_filled`, `filled`, `cancel_requested`, `cancelled`, `rejected`, `unknown`, `orphaned`.
- [ ] Detecteer local-only orders, exchange-only orders, duplicate clientOrderIds, stale open orders en unknown protective orders.
- [ ] Output bevat `orphanOrders`, `unknownOrders`, `staleOrders`, `blockingReasons`, `recommendedAction`.
- [ ] Verbind met reconcile/exchange safety waar veilig.
- [ ] Tests toevoegen voor exchange-only order, local-only order, stale order, duplicate clientOrderId, unknown OCO leg en clean state.
- [ ] Docs bijwerken in `docs/EXECUTION_SAFETY.md` of `docs/DEBUG_PLAYBOOK.md`.

Acceptatie:

- [ ] Unknown/orphan protective orders blokkeren nieuwe entries.
- [ ] Geen automatische cancel zonder bestaande safe policy.
- [ ] Geen live safety versoepeld.
- [ ] `npm test` slaagt.

---

## B26 — Position thesis aging en stale-trade monitor

Bron: nieuwe analyse / exit quality improvement  
Status: proposed  
Eerste integratie: `diagnostics_only`

Doel:
Open posities moeten periodiek worden gecontroleerd op stale thesis, time-in-trade, invalidated setup en opportunity cost.

- [ ] Maak of update `src/runtime/positionThesisAging.js`.
- [ ] Meet time since entry, time since thesis refresh, setup invalidation, stagnation, regime drift en missed better candidates.
- [ ] Output bevat `thesisAge`, `staleThesis`, `invalidationWarnings`, `timeStopRisk`, `recommendedAction`.
- [ ] Verbind met `tradeThesis`, `exitPlanHints`, `exitIntelligenceV2` en dashboard summary waar veilig.
- [ ] Tests toevoegen voor fresh winner, stale loser, regime changed, thesis invalidated, missing thesis en missing current price.
- [ ] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [ ] Monitor is diagnostics/governance-first.
- [ ] Geen automatische forced exits zonder bestaande safe exit policy.
- [ ] `npm test` slaagt.

---

## B27 — Signal expiry en alpha-decay gate

Bron: nieuwe analyse / signal quality improvement  
Status: proposed  
Eerste integratie: `shadow_only`

Doel:
Signals/candidates mogen niet eeuwig geldig blijven. De bot moet oude signals laten vervallen afhankelijk van setup-type, regime en volatility.

- [ ] Maak of update `src/runtime/signalExpiry.js`.
- [ ] Definieer expiry per setup-type: breakout sneller, trend continuation medium, swing/range langer.
- [ ] Gebruik volatility, data freshness, last candle time, decision age en regime drift.
- [ ] Output bevat `expired`, `ageMs`, `maxAgeMs`, `expiryReason`, `recommendedAction`.
- [ ] Verbind met candidate ranking/entry finalize waar veilig en eerst diagnostics/shadow.
- [ ] Tests toevoegen voor fresh signal, expired breakout, expired stale data, volatility-shortened expiry en missing timestamps.
- [ ] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [ ] Oude signals worden niet stil als vers behandeld.
- [ ] Geen live aggressiveness increase.
- [ ] `npm test` slaagt.

---

## B28 — Liquidity capacity en market impact estimator

Bron: nieuwe analyse / risk and execution improvement  
Status: proposed  
Eerste integratie: `diagnostics_only`

Doel:
Per symbol inschatten hoeveel notional veilig verhandelbaar is zonder te veel market impact, vooral bij small caps en nacht/weekend-liquidity.

- [ ] Maak of update `src/market/liquidityCapacity.js`.
- [ ] Gebruik spread, orderbook depth, recent volume, volatility, slippage confidence en fill history.
- [ ] Output bevat `maxRecommendedNotional`, `capacityRisk`, `marketImpactBps`, `sizeMultiplier`, `warnings`.
- [ ] Verbind met `entrySizing`, `portfolioCrowding`, `orderStyleAdvisor` en dashboard summary waar veilig.
- [ ] Tests toevoegen voor deep book, thin book, high spread, low volume, missing orderbook en extreme requested size.
- [ ] Docs bijwerken in `docs/RISK_MANAGEMENT.md`.

Acceptatie:

- [ ] Illiquide symbols krijgen lagere size hints of block volgens config.
- [ ] Geen automatische live size increase.
- [ ] `npm test` slaagt.

---

## B29 — Exchange maintenance en incident window guard

Bron: nieuwe analyse / operational safety improvement  
Status: proposed  
Eerste integratie: `governance_only`

Doel:
Exchange maintenance, degraded APIs, delisting/suspension windows en incident periods moeten entries conservatiever maken of blokkeren.

- [ ] Maak of update `src/runtime/exchangeIncidentGuard.js`.
- [ ] Gebruik bestaande news/calendar/eventClassifier waar beschikbaar.
- [ ] Detecteer maintenance window, trading suspension, deposit/withdraw halt, symbol delisting notice en exchange incident.
- [ ] Output bevat `incidentLevel`, `affectedSymbols`, `blockedActions`, `recommendedAction`, `expiresAt`.
- [ ] Verbind met `safetySnapshot`, `tradingPathHealth` en dashboard summary waar veilig.
- [ ] Tests toevoegen voor no incident, maintenance, symbol halt, delisting notice, stale incident en missing provider.
- [ ] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md`.

Acceptatie:

- [ ] Critical incident kan entries blokkeren.
- [ ] Missing provider versoepelt safety niet.
- [ ] Geen force-unlock.
- [ ] `npm test` slaagt.

---

## B30 — Wallet/balance drift en dust monitor

Bron: nieuwe analyse / account reconciliation improvement  
Status: proposed  
Eerste integratie: `governance_only`

Doel:
Account balances, dust, locked funds en local position accounting moeten gecontroleerd worden op drift voordat nieuwe entries worden toegestaan.

- [ ] Maak of update `src/runtime/balanceDriftMonitor.js`.
- [ ] Detecteer local/exchange balance mismatch, locked funds, dust positions, unexpected asset balances en quote balance drift.
- [ ] Output bevat `balanceDriftStatus`, `affectedAssets`, `lockedFunds`, `dustAssets`, `blockingReasons`, `recommendedAction`.
- [ ] Verbind met reconcile/exchange safety en dashboard summary waar veilig.
- [ ] Tests toevoegen voor clean balances, quote drift, base dust, locked funds, unknown asset en missing exchange snapshot.
- [ ] Docs bijwerken in `docs/DEBUG_PLAYBOOK.md` of `docs/EXECUTION_SAFETY.md`.

Acceptatie:

- [ ] Grote balance drift blokkeert nieuwe entries of vraagt manual review.
- [ ] Geen automatische dust conversion tenzij bestaande safe policy expliciet bestaat.
- [ ] Geen live safety versoepeld.
- [ ] `npm test` slaagt.

---

## B31 — Strategy conflict resolver

Bron: nieuwe analyse / strategy orchestration improvement  
Status: proposed  
Eerste integratie: `shadow_only`

Doel:
Als meerdere strategieën tegenstrijdige signalen geven op hetzelfde symbol/regime, moet de bot conflicten expliciet oplossen in plaats van onduidelijk te scoren.

- [ ] Maak of update `src/strategy/strategyConflictResolver.js`.
- [ ] Detecteer long/short conflict, breakout-vs-mean-reversion conflict, trend-vs-range conflict, execution-risk conflict en regime mismatch.
- [ ] Output bevat `conflictLevel`, `winningThesis`, `blockedSetups`, `confidencePenalty`, `reasons`, `recommendedAction`.
- [ ] Verbind met candidate ranking, setupThesis, indicatorRegimeScoring en dashboard summary waar veilig.
- [ ] Tests toevoegen voor no conflict, trend wins, range wins, high conflict blocks, missing thesis en equal-score tie.
- [ ] Docs bijwerken in `docs/TRADING_QUALITY.md`.

Acceptatie:

- [ ] Conflicting strategy signals worden uitlegbaar.
- [ ] High conflict kan entries blokkeren of shadow-only adviseren.
- [ ] Geen live safety versoepeld.
- [ ] `npm test` slaagt.

---

## Codex sync-instructie

Wanneer Codex later veilig `docs/CODEX_EXECUTION_PLAN.md` kan aanpassen:

- [ ] Voeg B24-B31 ook toe aan de hoofdroadmap of indexeer dit bestand expliciet in de hoofdroadmap.
- [ ] Verwijder geen bestaande hoofdroadmap-inhoud.
- [ ] Markeer niets als `[x]` zonder tests en verificatie.
- [ ] Houd alle safety-regels uit de hoofdroadmap leidend.
