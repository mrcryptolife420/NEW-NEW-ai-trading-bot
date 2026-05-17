const criticalImports = [
  ["src/cli.js"],
  ["src/cli/runCli.js", "default"],
  ["src/runtime/tradingBot.js", "TradingBot"],
  ["src/runtime/botManager.js", "BotManager"],
  ["src/runtime/livePreflight.js", "buildLivePreflight"],
  ["src/dashboard/server.js", "startDashboardServer"],
  ["src/execution/paperBroker.js", "PaperBroker"],
  ["src/execution/demoPaperBroker.js", "DemoPaperBroker"],
  ["src/execution/liveBroker.js", "LiveBroker"],
  ["src/execution/brokerFactory.js", "createBroker"],
  ["src/storage/stateStore.js", "StateStore"],
  ["src/risk/riskManager.js", "RiskManager"]
];

import { spawnSync } from "node:child_process";

const failures = [];
for (const [file, exportName] of criticalImports) {
  try {
    if (!exportName) {
      const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
      if (result.status !== 0) failures.push(`${file}: ${result.stderr || result.stdout}`);
      continue;
    }
    const module = await import(new URL(`../${file}`, import.meta.url));
    if (exportName && !(exportName in module)) failures.push(`${file}: missing export ${exportName}`);
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`Import integrity check failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Import integrity check passed (${criticalImports.length} modules).`);
