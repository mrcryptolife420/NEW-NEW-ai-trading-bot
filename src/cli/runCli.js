import { runBacktest } from "../runtime/backtestRunner.js";
import { runHistoryCommand } from "../runtime/marketHistory.js";
import { parseBacktestWalkForwardArgs, runBacktestWalkForward } from "../runtime/walkForwardBacktest.js";
import { parseMarketReplayArgs, runMarketReplay } from "../runtime/marketReplayEngine.js";
import { runReadModelCommand, runReadModelTraceCommand } from "../storage/readModelStore.js";
import { TradingBot } from "../runtime/tradingBot.js";
import { BotManager } from "../runtime/botManager.js";
import { buildRestArchitectureAudit, scanRestCallers } from "../runtime/restArchitectureAudit.js";

function shouldUseReadOnlyInit(command) {
  return ["status", "doctor", "report", "learning", "replay"].includes(command);
}

const BOT_COMMANDS = new Set(["run", "once", "status", "doctor", "report", "learning", "research", "scan", "replay"]);
const DEFAULT_BOT_FACTORY = ({ config: cfg, logger: log }) => new TradingBot({ config: cfg, logger: log });
const DEFAULT_MANAGER_FACTORY = ({ projectRoot, logger: log }) => new BotManager({ projectRoot, logger: log });

async function runContinuousManagedBot({ config, logger, signalSource = process }) {
  const manager = new BotManager({ projectRoot: config.projectRoot, logger });
  let stopRequested = false;
  let stopWaiter = null;
  const signalHandlers = [];
  const requestStop = (reason = "signal") => {
    if (stopRequested) {
      return;
    }
    stopRequested = true;
    logger?.warn?.("Stopping managed run loop", { reason });
    if (stopWaiter) {
      const resolve = stopWaiter;
      stopWaiter = null;
      resolve();
    }
  };
  const installSignalHandlers = () => {
    if (!signalSource?.on || !signalSource?.off) {
      return;
    }
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => requestStop(signal);
      signalSource.on(signal, handler);
      signalHandlers.push([signal, handler]);
    }
  };
  const removeSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      signalSource.off(signal, handler);
    }
  };

  installSignalHandlers();
  try {
    await manager.init();
    await manager.start();
    while (!stopRequested) {
      await new Promise((resolve) => {
        stopWaiter = resolve;
      });
    }
  } finally {
    removeSignalHandlers();
    await manager.stop("cli_signal").catch(() => {});
  }
}

function markCommandSuccess(processState = null) {
  if (!processState || typeof processState !== "object" || !("exitCode" in processState)) {
    return;
  }
  processState.exitCode = 0;
}

function parseReplayArgs(args = []) {
  const options = {
    symbol: null,
    reason: null,
    fixturePath: null,
    writeFixture: false,
    fileName: null,
    fixtureDir: null
  };
  for (const arg of args || []) {
    const value = `${arg || ""}`;
    if (value.startsWith("--symbol=")) {
      options.symbol = value.slice("--symbol=".length).trim().toUpperCase() || null;
    } else if (value.startsWith("--reason=")) {
      options.reason = value.slice("--reason=".length).trim() || null;
    } else if (value.startsWith("--fixture=")) {
      options.fixturePath = value.slice("--fixture=".length).trim() || null;
    } else if (value === "--write-fixture") {
      options.writeFixture = true;
    } else if (value.startsWith("--file-name=")) {
      options.fileName = value.slice("--file-name=".length).trim() || null;
    } else if (value.startsWith("--fixture-dir=")) {
      options.fixtureDir = value.slice("--fixture-dir=".length).trim() || null;
    } else if (!options.symbol) {
      options.symbol = value.trim().toUpperCase() || null;
    } else if (!options.reason) {
      options.reason = value.trim() || null;
    }
  }
  return options;
}

function parseTraceValue(args = []) {
  return `${args?.[0] || ""}`.trim();
}

export default async function runCli({
  command,
  args,
  config,
  logger,
  botFactory = DEFAULT_BOT_FACTORY,
  managerFactory = DEFAULT_MANAGER_FACTORY,
  dashboardFactory = async ({ projectRoot, logger: log, port }) => {
    const { startDashboardServer } = await import("../dashboard/server.js");
    return startDashboardServer({ projectRoot, logger: log, port });
  },
  signalSource = process,
  processState = process
}) {
  if (command === "dashboard") {
    const dashboard = await dashboardFactory({
      projectRoot: config.projectRoot,
      logger,
      port: config.dashboardPort
    });
    console.log(
      JSON.stringify(
        {
          command: "dashboard",
          url: dashboard.url,
          port: dashboard.port
        },
        null,
        2
      )
    );
    await (dashboard.waitUntilClosed || new Promise(() => {}));
    markCommandSuccess(processState);
    return;
  }

  if (command === "backtest") {
    const symbol = (args[0] || config.watchlist[0] || "BTCUSDT").toUpperCase();
    const result = await runBacktest({ config, logger, symbol });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "backtest:walkforward") {
    const result = await runBacktestWalkForward({
      config,
      logger,
      ...parseBacktestWalkForwardArgs(args, config)
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "readmodel:rebuild" || command === "readmodel:status" || command === "readmodel:dashboard" || command === "request-budget") {
    const result = await runReadModelCommand({
      config,
      logger,
      action: command === "readmodel:rebuild"
        ? "rebuild"
        : command === "readmodel:dashboard"
          ? "dashboard"
          : command === "request-budget"
            ? "request-budget"
            : "status"
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "rest:audit") {
    const requestBudget = await runReadModelCommand({ config, logger, action: "request-budget" }).catch((error) => ({
      status: "unavailable",
      error: error?.message || "request_budget_unavailable",
      topCallers: []
    }));
    const codeScan = await scanRestCallers({ projectRoot: config.projectRoot }).catch((error) => ({
      status: "unavailable",
      error: error?.message || "rest_code_scan_unavailable",
      callers: []
    }));
    const result = {
      ...buildRestArchitectureAudit({ config, requestBudget }),
      codeScan
    };
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "replay-decision" || command === "trace-cycle" || command === "trace-symbol") {
    const result = await runReadModelTraceCommand({
      config,
      logger,
      kind: command === "replay-decision" ? "decision" : command === "trace-cycle" ? "cycle" : "symbol",
      value: parseTraceValue(args)
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "replay:market") {
    const result = await runMarketReplay({
      config,
      logger,
      ...parseMarketReplayArgs(args, config),
      persistTrace: true
    });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "history") {
    const result = await runHistoryCommand({ config, logger, args });
    console.log(JSON.stringify(result, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (command === "download-history") {
    const symbol = (args[0] || "BTCUSDT").toUpperCase();
    const interval = args[1] || "15m";
    const days = Number(args[2]) || 90;
    const {
      loadHistoricalKlines,
      summarizeHistoricalData
    } = await import("../market/historicalDataLoader.js");
    const historical = await loadHistoricalKlines(symbol, interval, days);
    const summary = summarizeHistoricalData({ [symbol]: historical });
    console.log(JSON.stringify(summary, null, 2));
    markCommandSuccess(processState);
    return;
  }

  if (!BOT_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  if (command === "run") {
    await runContinuousManagedBot({ config, logger, signalSource });
    return;
  }

  const useManagerForBotCommands = botFactory === DEFAULT_BOT_FACTORY;
  if (useManagerForBotCommands) {
    const manager = managerFactory({ projectRoot: config.projectRoot, logger });
    const managerReadOnly = shouldUseReadOnlyInit(command);
    await manager.init({
      command,
      readOnly: managerReadOnly,
      enableStreams: !managerReadOnly && command !== "scan"
    });
    try {
      if (command === "once") {
        const result = await manager.runCycleOnce();
        console.log(JSON.stringify(result.result, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "status") {
        const status = await manager.getStatus();
        console.log(JSON.stringify(status, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "doctor") {
        const doctor = await manager.getDoctor();
        console.log(JSON.stringify(doctor, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "report") {
        const report = await manager.getReport();
        console.log(JSON.stringify(report, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "learning") {
        const learning = await manager.getLearning();
        console.log(JSON.stringify(learning, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "research") {
        const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
        const research = await manager.runResearch(symbols);
        console.log(JSON.stringify(research.result, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "scan") {
        const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
        const scan = await manager.runMarketScan(symbols);
        console.log(JSON.stringify(scan.result, null, 2));
        markCommandSuccess(processState);
        return;
      }

      if (command === "replay") {
        const replay = await manager.runIncidentReplay(parseReplayArgs(args));
        console.log(JSON.stringify(replay.result, null, 2));
        markCommandSuccess(processState);
        return;
      }
    } finally {
      await manager.stop("cli_command_complete").catch(() => {});
    }
  }

  const bot = botFactory({ config, logger });
  await bot.init({
    command,
    readOnly: shouldUseReadOnlyInit(command),
    enableStreams: !shouldUseReadOnlyInit(command) && command !== "scan"
  });

  try {
    if (command === "once") {
      const result = await bot.runCycle();
      console.log(JSON.stringify(result, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "status") {
      const status = await bot.getStatus();
      console.log(JSON.stringify(status, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "doctor") {
      const doctor = await bot.runDoctor();
      console.log(JSON.stringify(doctor, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "report") {
      const report = await bot.getReport();
      console.log(JSON.stringify(report, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "learning") {
      const learning = await bot.getAdaptiveLearningStatus();
      console.log(JSON.stringify(learning, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "research") {
      const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
      const research = await bot.runResearch({ symbols });
      console.log(JSON.stringify(research, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "scan") {
      const symbols = args.map((arg) => `${arg}`.trim().toUpperCase()).filter(Boolean);
      const scan = await bot.runMarketScanner({ symbols });
      console.log(JSON.stringify(scan, null, 2));
      markCommandSuccess(processState);
      return;
    }

    if (command === "replay") {
      const replay = await bot.runIncidentReplayLab(parseReplayArgs(args));
      console.log(JSON.stringify(replay, null, 2));
      markCommandSuccess(processState);
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } finally {
    await bot.close().catch(() => {});
  }
}
