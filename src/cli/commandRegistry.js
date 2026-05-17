export const CLI_COMMANDS = [
  { command: "help", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Show operator help." },
  { command: "commands", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "List CLI command metadata." },
  { command: "version", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Show package version." },
  { command: "config:check", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Validate loaded configuration and print a safe summary." },
  { command: "run", readOnly: false, requiresRuntime: true, requiresNetwork: true, dangerous: false, description: "Run the managed bot loop." },
  { command: "once", readOnly: false, requiresRuntime: true, requiresNetwork: true, dangerous: false, description: "Run one managed cycle." },
  { command: "status", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show runtime status." },
  { command: "doctor", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show diagnostics." },
  { command: "report", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show performance report." },
  { command: "learning", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show adaptive learning status." },
  { command: "research", readOnly: true, requiresRuntime: true, requiresNetwork: true, dangerous: false, description: "Run research for selected symbols." },
  { command: "scan", readOnly: true, requiresRuntime: true, requiresNetwork: true, dangerous: false, description: "Run market scanner." },
  { command: "replay", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Run incident replay." },
  { command: "dashboard", readOnly: false, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Start local dashboard." },
  { command: "backtest", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Run single-symbol backtest." },
  { command: "backtest:walkforward", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Run walk-forward backtest." },
  { command: "feature:audit", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Audit feature wiring." },
  { command: "feature:completion-gate", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Check feature completion gate." },
  { command: "ops:readiness", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: true, description: "Summarize production readiness without placing orders." },
  { command: "readmodel:rebuild", readOnly: false, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Rebuild read model." },
  { command: "readmodel:status", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show read model status." },
  { command: "readmodel:dashboard", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show dashboard read model." },
  { command: "request-budget", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show request budget status." },
  { command: "rest:audit", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Audit REST usage." },
  { command: "replay-decision", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Replay decision trace." },
  { command: "trace-cycle", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show last cycle trace." },
  { command: "trace-symbol", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Show symbol trace." },
  { command: "download-history", readOnly: false, requiresRuntime: false, requiresNetwork: true, dangerous: false, description: "Download historical candles." },
  { command: "history", readOnly: false, requiresRuntime: false, requiresNetwork: true, dangerous: false, description: "Run history command." },
  { command: "trading-path:debug", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Explain trading path health." },
  { command: "intents:list", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "List unresolved execution intents." },
  { command: "intents:summary", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Summarize execution intents." },
  { command: "live:preflight", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: true, description: "Evaluate live readiness without placing orders." },
  { command: "live:panic-plan", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: true, description: "Build read-only flatten plan." },
  { command: "exchange-safety:status", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: true, description: "Show exchange safety status." },
  { command: "reconcile:plan", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: true, description: "Preview reconcile plan." },
  { command: "reconcile:run", readOnly: false, requiresRuntime: true, requiresNetwork: false, dangerous: true, description: "Run safe reconcile actions." },
  { command: "storage:audit", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Audit storage state." },
  { command: "storage:retention", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Report runtime storage bloat and manual cleanup candidates." },
  { command: "recorder:audit", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Audit data recorder state." },
  { command: "replay:manifest", readOnly: true, requiresRuntime: true, requiresNetwork: false, dangerous: false, description: "Build replay manifest." },
  { command: "replay:market", readOnly: true, requiresRuntime: false, requiresNetwork: false, dangerous: false, description: "Replay market fixture." }
];

export function listCommandMetadata() {
  return [...CLI_COMMANDS].sort((a, b) => a.command.localeCompare(b.command));
}

export function findCommandMetadata(command) {
  return CLI_COMMANDS.find((item) => item.command === command) || null;
}
