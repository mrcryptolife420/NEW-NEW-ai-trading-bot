import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const criticalFiles = [
  "src/cli.js",
  "src/cli/runCli.js",
  "src/runtime/tradingBot.js",
  "src/runtime/botManager.js",
  "src/runtime/livePreflight.js",
  "src/dashboard/server.js",
  "src/execution/paperBroker.js",
  "src/execution/demoPaperBroker.js",
  "src/execution/liveBroker.js",
  "src/storage/stateStore.js",
  "src/risk/riskManager.js",
  "test/run.js"
];

const failures = [];
for (const file of criticalFiles) {
  const fullPath = path.join(root, file);
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile() || stat.size < 64) failures.push(`${file}: empty or too small (${stat.size} bytes)`);
  } catch (error) {
    failures.push(`${file}: ${error.code === "ENOENT" ? "missing" : error.message}`);
  }
}

if (failures.length) {
  console.error(`Critical file check failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Critical file check passed (${criticalFiles.length} files).`);
