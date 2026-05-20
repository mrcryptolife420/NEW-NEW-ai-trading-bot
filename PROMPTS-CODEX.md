# Prompts voor Codex

## 1. Volledige read-only codebase-analyse

```txt
Gebruik mijn codebase-specifieke project-agents.

Spawn parallel, zonder full-history fork:
- cli_command_surface_auditor
- core_tradingbot_lifecycle_auditor
- botmanager_exchange_health_auditor
- paper_live_boundary_auditor
- dashboard_state_api_auditor
- positions_pnl_trim_auditor

Zodra er threadruimte is, spawn:
- binance_rate_limit_circuitbreaker_auditor
- test_contract_runner
- roadmap_continuity_planner

Analyseer de volledige repo read-only.

Focus:
- package scripts en CLI commands
- src/cli.js en src/cli/runCli.js
- src/runtime/botManager.js
- src/runtime/tradingBot.js bridge naar core
- src/core/tradingBot.js lifecycle
- paper/demo/live scheiding
- live-mode guards
- dashboard API/state/UI
- paper trading services
- open positions, PnL, exposure, trim, dynamic stop, dynamic target, Exit v2
- Binance REST ban, rate limits, circuit breakers
- bestaande roadmaps en Voltooid docs
- tests/lint/typecheck dekking

Maak geen codewijzigingen.
Start geen live trading.
Start geen watch-mode.
Wacht tot agents klaar zijn of noteer timeouts expliciet.
Geef één geconsolideerd rapport met P0/P1/P2 prioriteiten.
```

## 2. Rapport laten structureren

```txt
Maak nog geen codewijzigingen.

Structureer het geconsolideerde agentrapport als:
1. P0 kritieke bugs
2. P1 belangrijke bugs
3. P2 verbeteringen
4. Niet-aangesloten modules
5. Paper/live safety risico's
6. Dashboard/API mismatches
7. Binance/rate-limit risico's
8. Ontbrekende tests
9. Beste implementatievolgorde
10. Eén aanbevolen eerste fix
```

## 3. Eén fix implementeren

```txt
Gebruik het geconsolideerde rapport.

Implementeer alleen de hoogste prioriteit P0-fix.

Spawn:
- repo_patch_implementer voor de codewijziging
- regression_safety_gatekeeper om de patch daarna read-only te controleren
- test_contract_runner om relevante veilige tests/lint/typecheck te draaien

Regels:
- kleinste veilige wijziging
- geen live-trading gedrag wijzigen zonder expliciete toestemming
- geen secrets printen
- geen ongerelateerde files aanraken
- tests toevoegen of updaten waar nodig
- commit niets zonder mijn toestemming

Toon:
1. gewijzigde files
2. exacte aanpassing
3. testresultaten
4. resterende risico's
5. diff-samenvatting
```
