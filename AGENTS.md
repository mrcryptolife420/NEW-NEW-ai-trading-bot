# AGENTS.md

## Repo-context

Repo: `mrcryptolife420/NEW-NEW-ai-trading-bot`

Dit is een TypeScript/JavaScript crypto trading bot met:

- CLI entrypoint via `src/cli.js`
- hoofd-CLI orchestration via `src/cli/runCli.js`
- runtime orchestration via `src/runtime/botManager.js`
- `src/runtime/tradingBot.js` als bridge/re-export naar de core trading bot
- core trading lifecycle rond `src/runtime/tradingBot.js` (er is bewust geen `src/core/tradingBot.js`; `src/runtime/tradingBot.js` is de core/bridge)
- dashboard server/API rond `src/dashboard/**`
- paper/demo/live veiligheid rond config/runtime guards en paper services
- Binance/exchange code rond `src/exchange/**` en `src/shared/**`
- positions, PnL, lifecycle en open positions rond `src/services/**`
- bestaande roadmaps en debugdocs in root/docs

## Projectprioriteiten

1. Bescherm live trading altijd.
2. Verifieer paper/demo/live scheiding vóór elke wijziging.
3. Controleer of features echt aangesloten zijn, niet alleen aanwezig als losse module.
4. Traceer runtime flows vanuit `package.json` scripts en `src/cli/runCli.js`.
5. Gebruik bestaande roadmaps en Voltooid docs om dubbel werk te vermijden.
6. Voer alleen veilige testcommands uit. Geen watch-mode, geen dev server, geen live orders.

## Belangrijke package scripts

- `npm start` / `npm run dev` -> `node src/cli.js`
- `npm run paper` -> `node src/cli.js paper`
- `npm run live` -> `node src/cli.js live`
- `npm run gui` -> `node src/cli.js gui`
- `npm test`
- `npm run test:safe`
- `npm run test:dashboard`
- `npm run lint`
- `npm run typecheck`
- `npm run debug:inventory`

## Veiligheidsregels

- Geen live ordergedrag wijzigen zonder expliciete toestemming.
- Geen real exchange write actions uitvoeren.
- Geen secrets printen.
- Geen `.env` dumpen.
- Geen `npm run live` starten.
- Geen long-running `test:watch` starten.
- Geen productie-migraties of destructive scripts zonder expliciete toestemming.
- Als een command riskant of onduidelijk is: niet uitvoeren, maar rapporteren.

## Roadmap-regel

Bij elke roadmap:

- Check eerst bestaande `ROADMAP*.md`, `Voltooid-roadmap.md`, `docs/**`, en debug inventory.
- Bouw voort op bestaande roadmaps.
- Vermijd dubbele taken.
- Doe eerst codebase-analyse.
- Roadmaps moeten afvinkbaar zijn met file targets en testvalidatie.

## Multi-agent workflow

Eerst read-only analyse:

- `cli_command_surface_auditor`
- `core_tradingbot_lifecycle_auditor`
- `botmanager_exchange_health_auditor`
- `paper_live_boundary_auditor`
- `dashboard_state_api_auditor`
- `positions_pnl_trim_auditor`
- `binance_rate_limit_circuitbreaker_auditor`

Daarna pas:

- `test_contract_runner`
- `roadmap_continuity_planner`
- `repo_patch_implementer`
- `regression_safety_gatekeeper`

## Geconsolideerde agentrapporten

Bij elk geconsolideerd agentrapport:

- Check eerst `docs/**` en `docs/voltooid/**`.
- Schrijf het rapport als Markdownbestand in `docs/Md rapports/`.
- Vermeld expliciet welke punten nog open zijn en welke punten al afgewerkt zijn.
- Maak geen dubbele rapporten aan als een bestaand rapport kan worden bijgewerkt.
- Als een geconsolideerd agentrapport volledig afgewerkt en klaar is, verplaats het naar `docs/Compleet rapports/`.
