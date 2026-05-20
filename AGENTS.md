# AGENTS.md

## Project context

Dit project is een crypto trading bot. Werk altijd voorzichtig met alles dat trading, exchange-API's, live orders, balances, positions, exits, paper mode of demo mode raakt.

Belangrijke domeinen:
- Paper mode
- Demo mode
- Live mode
- Simulated Open lifecycle
- Open positions
- Trim
- Dynamic stop
- Dynamic target
- Exit v2
- Binance REST ban / rate limits
- Risk management
- Position sizing
- Exposure
- PnL
- UI/API-koppelingen
- Roadmap docs
- Voltooid docs

## Algemene werkregels

- Analyseer eerst de volledige relevante execution flow voordat je fixes voorstelt.
- Controleer altijd of features echt aangesloten zijn en niet alleen bestaan als losse module.
- Vermeld altijd concrete bestanden, functies, imports, exports, routes, services of hooks.
- Geen live-trading wijzigingen zonder expliciete toestemming.
- Bescherm paper/live scheiding.
- Maak kleine, controleerbare wijzigingen.
- Geen grote refactors zonder duidelijke reden.
- Voeg tests toe of pas tests aan wanneer gedrag wijzigt.
- Vermijd gokken. Als bewijs ontbreekt, schrijf dat expliciet.
- Als commands onbekend zijn, inspecteer package.json, pnpm-lock.yaml, yarn.lock, pyproject.toml, Makefile, README en scripts.

## Roadmap-regel

Bij elke nieuwe roadmap:
- Controleer eerst bestaande Roadmap docs en Voltooid docs.
- Bouw verder op vorige roadmaps.
- Vermijd dubbele features of dubbele debugtaken.
- Doe eerst codebase-analyse voordat nieuwe updates of features worden voorgesteld.
- Schrijf roadmaps in afvinkbare Markdown met prioriteiten en concrete file targets.

## Multi-agent voorkeur

Gebruik bij grote analyse meerdere read-only agents vÃ³Ã³r implementatie:
- code_mapper
- architecture_auditor
- paper_mode_auditor
- trade_lifecycle_auditor
- risk_security_reviewer
- binance_rate_limit_auditor
- test_runner
- roadmap_planner
- regression_reviewer

Gebruik implementer pas nadat de analyse duidelijk is.
