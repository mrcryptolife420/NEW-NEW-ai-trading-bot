# Binance Bot Masterplan Reconciliation & Implementation Plan

**Datum:** 2026-10-02  
**Status:** ready for implementation after review  
**Branch:** `plan/masterplan-reconciliation-2026-10-02`  
**Repo:** `mrcryptolife420/NEW-NEW-ai-trading-bot`

## Doel

Bouw verder op de bestaande Binance trading-bot in plaats van opnieuw te beginnen. Dit plan koppelt de nieuwere masterplan-keuzes aan de huidige Node.js/ESM codebase en maakt de eerstvolgende implementatievolgorde expliciet, testbaar en veilig.

Vaststaande productkeuzes:

- Binance Spot als primaire exchange.
- Eerst Binance Spot Demo Mode / paper-safe execution; geen echte live orders tijdens deze roadmap.
- De architectuur moet alle **eligible/tradable Binance Spot symbols** kunnen ontdekken en behandelen. Een bounded active universe mag gebruikt worden om REST/rate-limit druk te beheersen; dit mag geen hard-coded coin whitelist worden.
- Meerdere gelijktijdige open orders per symbol moeten ondersteund kunnen worden, met expliciete globale en per-symbol limieten.
- Multi-agent analyse en besluitvorming komt bovenop de bestaande runtime, maar agents krijgen niet rechtstreeks exchange-write rechten.
- Eén centrale risk/execution boundary blijft eigenaar van ordermutaties.
- Codex/agents mogen later codewijzigingen voorstellen, maar uitsluitend via een gecontroleerde branch -> tests -> review -> merge workflow; geen runtime self-modifying production code.
- Paperclip kan later de agent-workflow orkestreren.
- Jev/extra AI-learning orchestration blijft later dan de core trading- en safety-foundation.

## Huidige codebase: wat al bestaat

De repo is geen lege Phase-0 codebase meer. De huidige basis bevat onder andere:

- CLI via `src/cli.js` en `src/cli/runCli.js`.
- Runtime orchestration via `src/runtime/botManager.js` en `src/runtime/tradingBot.js`.
- Exchange abstraction via `src/exchange/adapters/ExchangeAdapter.js`.
- Binance adapter via `src/exchange/adapters/binance/BinanceExchangeAdapter.js`.
- Paper adapter en synthetic adapter naast Binance.
- Demo launcher via `scripts/run-mode.mjs`.
- `npm run demo`, `demo:once`, `demo:doctor`, `demo:audit`.
- Demo mode zet `BOT_MODE=paper` en `PAPER_EXECUTION_VENUE=binance_demo_spot`.
- Binance Demo REST base URL is al configureerbaar via `https://demo-api.binance.com`.
- Universe/scanner code bestaat via o.a. `src/runtime/marketScanner.js`, `src/runtime/watchlistResolver.js`, `src/runtime/universeSelector.js`, `src/runtime/universeScorer.js` en `src/runtime/scanPlanner.js`.
- Safety/QA scripts bestaan, inclusief `test:no-live-leak`, `test:paper-safety`, `qa:demo`, `qa:quick`, `qa` en `qa:strict`.
- CI workflows bestaan onder `.github/workflows/`.
- Roadmaps 01-40 zijn als voltooid gedocumenteerd; `docs/roadmap-41-codebase-next-updates-2026-05-21.md` is de bestaande open vervolgroadmap.

Daarom wordt het oude idee “eerst Phase 0 vanaf nul bouwen” vervangen door: **baseline verifiëren -> gaps tegen het nieuwe masterplan bepalen -> incrementeel implementeren**.

---

# Milestone 0 — Baseline freeze en safety proof

## Doel

Voor we architectuur wijzigen, bewijzen dat de huidige branch veilig en reproduceerbaar is en leggen we een baseline vast.

## Files

- Inspect: `package.json`
- Inspect: `scripts/run-mode.mjs`
- Inspect: `src/cli/runCli.js`
- Inspect: `src/runtime/botManager.js`
- Inspect: `src/runtime/tradingBot.js`
- Inspect: `src/execution/**`
- Inspect: `src/exchange/**`
- Inspect: `src/binance/**`
- Inspect: `src/runtime/marketScanner.js`
- Inspect: `src/runtime/universeSelector.js`
- Inspect: `src/runtime/watchlistResolver.js`
- Inspect: `.github/workflows/ci.yml`
- Inspect: `.github/workflows/test.yml`
- Update/Create if needed: `docs/Md rapports/2026-10-02-masterplan-gap-audit.md`

## Commands

```bash
npm ci
npm run check:critical
npm run check:syntax
npm run check:imports
npm run typecheck
npm run lint
npm run test:safety
npm run test:paper-safety
npm run test:no-live-leak
npm run demo:audit
```

Do **not** run `npm run live` and do not execute real exchange writes.

## Acceptance

- Alle safety checks groen, of failures zijn gedocumenteerd voordat andere wijzigingen beginnen.
- Geen secrets in logs/output.
- Demo path kan geïnspecteerd worden zonder real live ordermutation.
- Er ligt één gap-audit met: already complete / partial / missing / conflict with new masterplan.

## Commit

`docs: record masterplan baseline and gap audit`

---

# Milestone 1 — Maak Demo Mode een first-class execution mode

## Probleem

`scripts/run-mode.mjs` behandelt Demo veilig als `BOT_MODE=paper` met `PAPER_EXECUTION_VENUE=binance_demo_spot`, maar `BinanceExchangeAdapter` initialiseert zijn adaptermetadata momenteel als `mode: "live"`. Zelfs als de hogere execution boundary veilig is, is die semantiek te ambigu voor agents, dashboards en toekomstige safety checks.

## Doel

Demo moet technisch én semantisch herkenbaar zijn zonder live safety af te zwakken.

## Files

- Modify: `src/exchange/adapters/binance/BinanceExchangeAdapter.js`
- Inspect/Modify: `src/exchange/adapters/ExchangeAdapter.js`
- Inspect/Modify: exchange adapter factory/provider file discovered during Milestone 0
- Inspect/Modify: `scripts/run-mode.mjs`
- Inspect/Modify: `src/config/index.js`
- Inspect/Modify: `src/config/validate.js`
- Test/Create: `test/binanceDemoMode.tests.js`
- Test/Extend: existing no-live-leak / paper safety tests

## TDD sequence

1. Write a failing test proving that a Demo adapter/runtime reports mode/venue as demo-safe rather than live.
2. Write a failing test proving Demo cannot route to a production Binance base URL when the demo profile is active.
3. Write a failing test proving `npm run demo` remains `BOT_MODE=paper` or equivalent safety class.
4. Implement the smallest adapter/config changes needed.
5. Re-run the targeted tests.
6. Run `npm run test:no-live-leak` and `npm run qa:demo`.

## Acceptance

- Dashboard/health/adapter metadata can distinguish `paper-internal`, `binance-demo-spot`, and `live`.
- Demo still uses the existing paper safety boundary.
- No production API endpoint can be selected accidentally from the demo profile.
- No new live write capability is introduced.

## Commit

`feat: make Binance demo mode explicit and safety-testable`

---

# Milestone 2 — All-Binance-Spot capability without unsafe full-universe pressure

## Probleem

De huidige config bevat een bounded universe (bijvoorbeeld `UNIVERSE_MAX_SYMBOLS`) en de runtime heeft al universe/scanner code. Ons productdoel is dat de bot **elke eligible Binance Spot coin/pair kan traden**, niet dat elke cycle onbeperkt honderden symbols met zware REST-calls moet scannen.

## Doel

Scheid twee concepten expliciet:

1. **Tradable capability universe:** alle actuele Spot symbols die Binance als trading-enabled rapporteert en die door onze quote/risk/rule filters komen.
2. **Active scan universe:** een dynamische bounded subset die rate limits, liquidity, data quality en compute budget respecteert.

Geen hard-coded BTC/ETH/top-N whitelist als architecturale beperking.

## Files

- Inspect/Modify: `src/runtime/marketScanner.js`
- Inspect/Modify: `src/runtime/watchlistResolver.js`
- Inspect/Modify: `src/runtime/universeSelector.js`
- Inspect/Modify: `src/runtime/universeScorer.js`
- Inspect/Modify: `src/runtime/scanPlanner.js`
- Inspect/Modify: `src/runtime/restBudgetGovernor.js`
- Inspect/Modify: Binance exchange-info/rules client under `src/binance/**`
- Inspect/Modify: `src/config/index.js`
- Inspect/Modify: `src/config/validate.js`
- Test/Create: `test/tradableUniverse.tests.js`
- Test/Extend: market scanner / REST budget tests

## TDD sequence

1. Test that exchange-info symbols with `status != TRADING` are rejected.
2. Test that Spot-ineligible products are rejected.
3. Test that any valid newly-listed Spot symbol can enter the capability universe without code changes.
4. Test that quote-asset/risk filters are configuration-driven.
5. Test that the active scan universe can remain bounded while the capability universe remains complete.
6. Test rate-limit behavior for a large synthetic exchange-info set.
7. Implement capability-universe + active-universe separation.

## Acceptance

- Newly listed eligible Spot symbols require no source-code whitelist update.
- Delisted/paused symbols cannot receive new orders.
- Scanner remains bounded and respects the REST budget governor.
- Capability count and active-scan count are separately visible in diagnostics.

## Commit

`feat: separate full Spot capability universe from active scanner`

---

# Milestone 3 — Multiple simultaneous open orders per symbol

## Doel

Support meerdere open orders voor hetzelfde symbol op een expliciete, bounded en reconcilable manier.

## Design rule

Geen “one position = one order” aanname meer op execution/storage boundaries. Een position/strategy leg kan meerdere child orders hebben. Elke order heeft minimaal een unieke local intent/idempotency key en exchange order id wanneer beschikbaar.

## Files

- Inspect/Modify: `src/execution/**`
- Inspect/Modify: order manager/router discovered in Milestone 0
- Inspect/Modify: `src/services/**` position/PnL lifecycle
- Inspect/Modify: `src/storage/**`
- Inspect/Modify: dashboard order projections
- Modify: `src/config/index.js`
- Modify: `src/config/validate.js`
- Create/Extend tests: `test/multiOrderPerSymbol.tests.js`
- Extend: `test/liveBrokerSafety.tests.js` or current equivalent

## New config contracts

Proposed names; use existing naming conventions if equivalents already exist:

```text
MAX_OPEN_ORDERS_GLOBAL
MAX_OPEN_ORDERS_PER_SYMBOL
MAX_PENDING_ENTRY_ORDERS_PER_SYMBOL
MAX_PENDING_EXIT_ORDERS_PER_SYMBOL
```

## TDD sequence

1. Test two valid pending orders can coexist for one symbol in paper/demo.
2. Test duplicate intent/idempotency key is rejected.
3. Test per-symbol limit blocks N+1 without affecting other symbols.
4. Test global limit blocks N+1 globally.
5. Test partial fills preserve remaining child order state.
6. Test cancel-one does not cancel unrelated sibling orders.
7. Test reconciliation after restart rebuilds all open-order state.
8. Test paper/demo path never leaks into live broker mutation.

## Acceptance

- Multiple open orders per symbol work in paper/demo.
- Global/per-symbol risk caps are mandatory and validated.
- Restart/reconcile does not lose or duplicate orders.
- Dashboard/reporting shows all child orders, not only one aggregate order.

## Commit

`feat: support bounded multi-order lifecycle per symbol`

---

# Milestone 4 — Multi-agent decision architecture

## Doel

Agents mogen gespecialiseerde analyses uitvoeren, maar exchange writes blijven achter één deterministic safety boundary.

## Agent roles — first safe version

- Market/universe analyst
- Technical/strategy analyst
- Risk analyst
- Execution-quality analyst
- Portfolio/capital allocator
- Regime/context analyst
- Critic/adversarial reviewer
- Coordinator/decision synthesizer

## Contract

Agents produceren **structured proposals/intents**, geen orders rechtstreeks.

Example conceptual contract:

```json
{
  "symbol": "ETHUSDT",
  "action": "buy|sell|hold|cancel|amend",
  "confidence": 0.0,
  "strategyId": "...",
  "reasonCodes": ["..."],
  "requestedNotional": 0,
  "requestedOrderType": "LIMIT",
  "constraints": {},
  "evidenceRefs": []
}
```

De coordinator combineert voorstellen. Daarna valideren risk/execution modules deterministisch quantity, price filters, minNotional, available balance, exposure, max orders, cooldowns, stale data en venue safety.

## Files

- Create: `src/agents/contracts/agentProposal.js`
- Create: `src/agents/agentCoordinator.js`
- Create: `src/agents/agentRegistry.js`
- Create: `src/agents/providers/**` as needed
- Integrate carefully: `src/runtime/tradingBot.js` or extracted lifecycle slice
- Integrate: existing risk/execution boundary under `src/risk/**` / `src/execution/**`
- Test/Create: `test/agentCoordinator.tests.js`
- Test/Create: `test/agentExecutionBoundary.tests.js`

## TDD safety requirements

- Agent output cannot call Binance client directly.
- Invalid schema is rejected.
- Conflicting proposals resolve deterministically or to HOLD.
- Risk governor can always veto.
- Missing/stale data cannot be overridden by agent confidence.
- Paper/demo execution is the only mutation target during this milestone.

## Acceptance

- Agents are replaceable modules behind a stable contract.
- Coordinator produces an auditable decision trace.
- Execution gateway remains the sole order-mutation owner.
- Existing deterministic strategies can coexist with agents during migration.

## Commit

`feat: add safe multi-agent proposal and coordination layer`

---

# Milestone 5 — Controlled Codex agent modification workflow

## Doel

Maak “ChatGPT/Codex kan agents aanpassen wanneer nodig” veilig en auditbaar.

## Rule

Geen running bot die zijn eigen production source files wijzigt. Wijzigingen lopen via software-delivery controls.

## Workflow

1. Runtime/analytics detecteert een probleem of improvement candidate.
2. Een read-only report beschrijft evidence, affected agent, expected change and test targets.
3. Codex werkt op een dedicated Git branch/worktree.
4. Tests worden eerst toegevoegd of aangepast.
5. Patch wordt geïmplementeerd.
6. `qa:quick`, targeted safety tests en no-live-leak moeten groen zijn.
7. Diff/PR wordt gereviewd.
8. Pas na merge/deploy kan de nieuwe agentversie actief worden.
9. Agent version/config wordt opgeslagen zodat decisions reproduceerbaar blijven.

## Files

- Reuse/extend: `.codex/agents/**`
- Reuse/extend: `.codex/config.toml`
- Create: `src/agents/versioning/agentManifest.js`
- Create: `src/agents/versioning/changeProposal.js`
- Create: `docs/agent-change-policy.md`
- Test/Create: `test/agentChangePolicy.tests.js`

## Acceptance

- Runtime kan hoogstens een change proposal aanmaken; nooit zelf source pushen/mergen.
- Iedere agent-decision bevat agent/config version metadata.
- Rollback naar vorige agentversie is mogelijk.

## Commit

`feat: add auditable agent change proposal workflow`

---

# Milestone 6 — Paperclip orchestration

## Doel

Paperclip wordt de hogere workflowlaag voor analyse -> issue/task -> Codex change -> validation -> review, zonder de trading execution boundary te omzeilen.

## Preconditions

- Milestones 0-5 groen.
- Demo/paper meerdere dagen stabiel genoeg voor reproduceerbare diagnostics.
- Agent contracts en versioning stabiel.

## Scope

- Paperclip beheert development/maintenance workflows.
- Trading runtime blijft zelfstandig en veilig als Paperclip offline is.
- Geen API key/secrets via prompts/logs.
- Paperclip krijgt geen direct production-order endpoint.

---

# Milestone 7 — Jev / learning orchestration later

Jev of een vergelijkbare learning/strategy-improvement laag komt pas nadat de execution, universe, multi-order, multi-agent en controlled-change foundations aantoonbaar stabiel zijn.

Eerste Jev-scope moet offline/paper zijn:

- backtest/replay evidence
- strategy comparison
- parameter proposals
- anomaly detection
- experiment tracking
- no automatic live promotion

---

# Definition of Done voor elke milestone

Elke milestone is pas klaar wanneer:

- Targeted tests groen zijn.
- `npm run check:syntax` groen is.
- `npm run check:imports` groen is.
- `npm run typecheck` groen is.
- `npm run lint` groen is voor aangepaste JS-code.
- Safety-relevante wijzigingen `npm run test:no-live-leak` passeren.
- Paper/demo wijzigingen de relevante `qa:paper` / `qa:demo` checks passeren.
- Geen echte live order is verstuurd.
- Geen secret in code, docs, logs of testfixtures terechtkomt.
- Docs/changelog aangeven wat veranderd is en welke safety assumptions gelden.

# Eerste implementatiebatch

Na review van dit plan wordt **alleen Milestone 0 + Milestone 1** uitgevoerd. Dat geeft ons eerst een bewezen veilige baseline en maakt Demo Mode semantisch eenduidig. Daarna voeren we de milestones één voor één uit en actualiseren we dit plan/roadmap met afgevinkte status en testbewijs.

# Relatie met Roadmap 41

`docs/roadmap-41-codebase-next-updates-2026-05-21.md` blijft relevante technische schuld/verbeterwerk bevatten. Dit masterplan vervangt Roadmap 41 niet blind. Tijdens Milestone 0 wordt elk open Roadmap-41 item gemarkeerd als:

- prerequisite voor masterplan,
- parallel low-risk improvement,
- superseded door dit masterplan,
- of later/backlog.

Zo vermijden we dubbel werk en houden we één traceerbare implementatievolgorde.
