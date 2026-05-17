# Paper/Demo Wiring Matrix

Statusbron voor paper/demo/live wiring. Dit bestand dedupliceert de open items uit `paper_demo_mode_wiring_roadmap.md`, `FEATURE_COMPLETION_PLAN.md`, `IMPLEMENTATION_MATRIX.md`, `CODEX_ADDITIONAL_RECOMMENDATIONS_B24_B31.md` en `RECOMMENDED_UPDATES.md`.

Statuswaarden:

- `PAPER_CONNECTED`: werkt in paper mode zonder live private keys.
- `DEMO_CONNECTED`: werkt in paper mode via Binance Spot demo endpoint.
- `SHADOW_ONLY`: berekent advies of diagnose, maar stuurt geen orders.
- `DIAGNOSTIC_ONLY`: observability/audit-only, geen trading-impact.
- `READ_ONLY`: gebruikt alleen publieke of lokale data.
- `LIVE_GATED`: alleen live na expliciete live preflight/acknowledgement.
- `MISSING`: ontbreekt of is nog niet bewezen.
- `NOT_REQUIRED`: niet van toepassing voor paper/demo.

## Core Matrix

| Feature | Runtime path | Paper status | Demo status | Live status | Tests | Dashboard | Actie |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mode defaults | Config -> TradingBot | `PAPER_CONNECTED` | `DEMO_CONNECTED` | `LIVE_GATED` | config + broker factory tests | Mode summary | Blijvend bewaken via qa scripts. |
| Broker routing | Strategy/Risk -> `createBroker` -> broker | `PAPER_CONNECTED` | `DEMO_CONNECTED` | `LIVE_GATED` | broker factory + order routing audit | Broker diagnostics | Bevestig of dunne `ExecutionRouter` nog waarde toevoegt. |
| Internal paper broker | PaperBroker -> paper fill -> paper position | `PAPER_CONNECTED` | `NOT_REQUIRED` | `NOT_REQUIRED` | paper lifecycle tests | Positions/trades | Voeg smoke bewijs voor persistence/readmodel toe. |
| Demo paper broker | DemoPaperBroker -> Binance demo spot | `NOT_REQUIRED` | `DEMO_CONNECTED` | `NOT_REQUIRED` | demo/live broker tests | Broker venue | Voeg demo metadata smoke toe zonder live orders. |
| Live broker | LiveBroker -> Binance private endpoints | `LIVE_GATED` | `LIVE_GATED` | `LIVE_GATED` | live preflight + no-live-leak tests | Live preflight | Blijf strenger dan paper/demo. |
| Binance private order guard | BinanceClient mutating order endpoints | `PAPER_CONNECTED` | `DEMO_CONNECTED` | `LIVE_GATED` | private order mutation tests | Safety/readiness | Geen muterende live endpoint calls buiten live/demo guard. |
| Order routing audit | Static scan src/scripts/test | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | `debug:order-routing` | n/a | CI blijft falen bij `UNSAFE`. |
| Signal generation | Market snapshot -> candidate evaluation | `PAPER_CONNECTED` | `PAPER_CONNECTED` | `LIVE_GATED` | decision pipeline/candidate tests | Signal flow | Paper smoke moet zonder live keys aantonen. |
| Risk gates | RiskManager -> blockers/sizing | `PAPER_CONNECTED` | `PAPER_CONNECTED` | `LIVE_GATED` | risk/safety tests | Blockers/root cause | Geen threshold tweaks zonder bewijs. |
| Order lifecycle auditor | Local/exchange/paper order state audit | `SHADOW_ONLY` | `SHADOW_ONLY` | `LIVE_GATED` | order lifecycle tests | Safety summary | Sterker koppelen aan reconcile/exchange safety. |
| Execution intent ledger | Intent start/resolve/fail | `PAPER_CONNECTED` | `DEMO_CONNECTED` | `LIVE_GATED` | intent ledger tests | Lifecycle panel | Blokkeer entries bij unresolved intents. |
| Exchange safety reconciler | Exchange/runtime drift audit | `DIAGNOSTIC_ONLY` | `SHADOW_ONLY` | `LIVE_GATED` | exchange safety tests | Exchange truth | Orphan/unknown states operator-zichtbaar maken. |
| Stream health evidence | Stream/rest fallback health | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | `LIVE_GATED` | stream health tests | Runtime health | Stale state koppelen aan trading path health. |
| Data quality score v2 | Candles/ticker/orderbook quality | `SHADOW_ONLY` | `SHADOW_ONLY` | `SHADOW_ONLY` | data quality tests | Data integrity | Slechte data mag safety niet versoepelen. |
| Drift monitor | Feature/source/local-book drift | `SHADOW_ONLY` | `SHADOW_ONLY` | `LIVE_GATED` | drift/model tests | Adaptive health | Koppel aan promotion blocking. |
| API degradation planner | REST budget/degradation advice | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | `LIVE_GATED` | api degradation tests | Ops health | Recommended action altijd tonen. |
| Dashboard snapshot/readmodel | Runtime -> readmodel/dashboard payload | `PAPER_CONNECTED` | `DEMO_CONNECTED` | `LIVE_GATED` | dashboard contract tests | Dashboard | Mode/freshness/venue expliciet tonen. |
| Security/secret scan | scripts/scan-secrets + report | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | secret/security tests | n/a | CLI security audit later uitbreiden. |
| Dependency/runtime health | Dependency analyzer | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | `DIAGNOSTIC_ONLY` | package script/deps checks | n/a | Runtime version guard later toevoegen. |

## Known Gaps

| Gap | Status | Implementatievolgorde | Acceptatie |
| --- | --- | --- | --- |
| Paper/demo end-to-end smoke met persistence/readmodel bewijs | `MISSING` | 1 | Test bewijst decision -> paper fill -> persisted position/trade -> dashboard/readmodel metadata. |
| Volledige metadata op decisions/orders/fills/positions | `MISSING` | 2 | `decisionId`, `simulationId`, `paperModeProfile`, `sourceFeature`, `brokerMode`, `executionVenue` aanwezig of bewust `NOT_REQUIRED`. |
| ExecutionRouter besluit | `MISSING` | 3 | Vastleggen of `createBroker` router genoeg is; zo niet dunne wrapper zonder live behavior change. |
| Orphan/unknown order operator visibility | `MISSING` | 4 | Dashboard/readiness toont orphan/stale/unknown order reasons en recommended action. |
| Clock skew monitor | `MISSING` | 5 | Governance-only monitor met blocking reasons en tests. |
| Exchange incident guard | `MISSING` | 6 | Governance-only incident window guard met stale-provider safe fallback. |
| Balance drift/dust monitor | `MISSING` | 7 | Governance-only drift monitor met manual review/blocking recommendations. |
| Signal expiry / alpha decay | `MISSING` | 8 | Shadow-only expiry diagnostics, geen live aggressiveness increase. |
| Liquidity capacity / market impact | `MISSING` | 9 | Diagnostics-first size hints, geen automatische live size increase. |
| Strategy conflict resolver | `MISSING` | 10 | Shadow-only conflict reasons en confidence penalty. |
| Position thesis aging | `MISSING` | 11 | Diagnostics-only stale thesis and time-stop risk output. |
| Decision replay diff | `MISSING` | 12 | Governance-only diff with `requiresReview` for safety/risk changes. |

## Next Implementation Order

1. Voeg `qa:paper`, `qa:demo`, `test:paper-safety` en `test:no-live-leak` scripts toe.
2. Maak een deterministic paper smoke test die geen echte Binance calls gebruikt.
3. Breid paper/demo metadata contract uit voor orders, fills, positions en dashboard views.
4. Koppel order lifecycle audit aan exchange safety/readiness summary.
5. Voeg governance-only clock skew, exchange incident en balance drift monitors toe.
