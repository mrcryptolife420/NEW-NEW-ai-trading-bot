# Codebase-analyse samenvatting

Bron: gekoppelde GitHub repo `mrcryptolife420/NEW-NEW-ai-trading-bot`.

Let op: deze analyse is gebaseerd op de GitHub-versie die beschikbaar was via de connector. Lokale, niet-gepushte wijzigingen in `C:\Users\highlife\Documents\GitHub\Codex-ai-trading-bot-` kan ik niet zien. De agents zijn daarom zo geschreven dat Codex in jouw lokale omgeving de paden opnieuw valideert.

## Gevonden hoofdstructuur

- `package.json` definieert CLI scripts voor start/dev/paper/live/scan/backtest/train/gui/setup/test/lint/typecheck/debug inventory.
- `src/cli.js` is het minimalistische entrypoint en roept `runCli(...)` aan.
- `src/cli/runCli.js` is de belangrijkste command router.
- `src/runtime/botManager.js` beheert meerdere bots/symbols, status, cycles en exchange health.
- `src/runtime/tradingBot.js` is volgens bestaande roadmaps bedoeld als bridge/re-export naar de unified core trading bot.
- `src/core/tradingBot.js` bevat vermoedelijk de kernklasse `TradingBot`.
- `src/dashboard/**` bevat dashboard server/API/routes/state/websocket/UI lagen.
- `src/services/**` bevat paper trading, orders, positions, lifecycle, repositories en open-position logica.
- `src/exchange/**` en `src/shared/**` bevatten Binance clients/providers, rate-limit/budget/ban/circuit-breaker onderdelen.
- `tests/**` bevat dashboard, services, shared, Binance en route tests.
- Root/docs bevatten veel roadmaps, inclusief paper/live safety en post-debug lockdown docs.

## Belangrijkste bestaande signalen uit docs/roadmaps

- Paper mode had eerder een crash door legacy runtime-tradingBot wiring; roadmap vermeldt fix via bridge naar unified core bot.
- Live mode moet standaard geblokkeerd zijn tenzij expliciete env-confirmatie aanwezig is.
- Dashboard read-only mode is belangrijk voor veilige inspectie zonder credentials.
- Partial exit / trim / dynamic target / dynamic stop bestaan conceptueel, maar eerdere roadmaps noemen praktische wiring en tests als aandachtspunt.
- Binance REST ban/rate-limit handling is belangrijk en zit deels in `BotManager`, `RestBanMonitor`, ban state en shared modules.

## Agentstrategie

De nieuwe agents zijn gesplitst volgens echte repo-lagen:

1. CLI command surface
2. Core trading lifecycle
3. BotManager/exchange health
4. Paper/live boundary
5. Dashboard API/state
6. Positions/PnL/trim
7. Binance/rate-limit/circuit breaker
8. Safe tests
9. Roadmap continuity
10. Small patch implementer
11. Regression safety reviewer
