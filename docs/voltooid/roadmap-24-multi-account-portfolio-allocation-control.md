# Roadmap 24 - Multi-Account Portfolio Allocation Control

Status: actief
Analyse datum: 2026-05-18
Scope: account profiles, capital allocation, portfolio exposure, broker routing constraints.

## Analysebasis

Gebaseerd op:

- `src/accounts/accountProfileRegistry.js`
- `src/portfolio/correlationEngine.js`
- `src/risk/portfolioOptimizer.js`
- `src/risk/portfolioCrowding.js`
- `src/runtime/capitalGovernor.js`
- `src/runtime/capitalLadder.js`
- `src/runtime/capitalPolicyEngine.js`
- `src/execution/brokerRouter.js`
- `src/execution/brokerFactory.js`
- `src/policy/policyEngine.js`
- `test/scalabilityMultiExchangePolicyObservability.tests.js`
- `test/capitalGovernorReliability.tests.js`
- `test/brokerFactory.tests.js`

Niet dupliceren: roadmap 02 covered paper/live execution parity en roadmap 10 covered live incident protection. Deze roadmap richt zich op multi-account exposure, allocation boundaries en portfolio-level control.

## Probleemstelling

Het systeem heeft account profiles en multi-exchange scaffolding, maar portfolio allocation kan verder worden geformaliseerd:

- account-specific risk budgets
- per-account exposure ceilings
- broker routing policies
- account isolation between paper/demo/live
- account-level PnL attribution
- capital allocation across strategy cohorts
- dashboard account selector without unsafe mode drift

## Doel

Maak multi-account allocation expliciet en veilig, zonder live exposure automatisch te vergroten.

## Fase 1 - Account Allocation Contract

Nieuwe module:

- `src/accounts/accountAllocationPolicy.js`

Per account:

- mode
- exchange venue
- max daily loss
- max gross exposure
- max symbols
- allowed strategy stages
- broker route
- promotion eligibility

## Fase 2 - Portfolio Budget Splitter

Maak budget splitter:

- per account
- per strategy family
- per market regime
- per risk tier
- paper learning quota
- live canary quota

## Fase 3 - Broker Routing Enforcement

Broker router moet weigeren:

- live order for paper-only account
- demo venue in live account
- strategy not allowed by account stage
- cross-account duplicate exposure without approval

## Fase 4 - Dashboard Account View

Dashboard:

- active account
- account budgets
- exposure by account
- PnL by account
- blocked route reasons
- account mode drift warnings

## Fase 5 - Reporting

Reports:

- account-level ledger
- capital allocation decisions
- strategy cohort by account
- paper/demo/live delta by account

## Nieuwe Features

- Account allocation policy.
- Portfolio budget splitter.
- Account-aware broker routing.
- Account exposure dashboard.
- Account PnL attribution.

## Tests

Toevoegen:

- live route blocked for paper account
- demo endpoint blocked for live account
- duplicate exposure across accounts requires policy approval
- budget splitter respects per-account cap
- dashboard account summary redacts secrets
- paper learning cannot count as live account evidence

Te draaien:

- `npm.cmd test -- --grep=account`
- `npm.cmd test -- --grep=portfolio`
- `npm.cmd test -- --grep=broker`
- `npm.cmd test:no-live-leak`

## Definition of Done

- Account allocation is explicit and test-covered.
- Broker routing enforces account policies.
- Portfolio exposure is visible per account.
- No paper/demo evidence is misused as live account readiness.
