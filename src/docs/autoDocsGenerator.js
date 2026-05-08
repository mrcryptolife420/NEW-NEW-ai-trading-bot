import fs from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "../utils/redactSecrets.js";

export function buildAutoDocs({ config = {}, strategies = [], dashboardRoutes = [], cliCommands = [] } = {}) {
  const safeConfig = redactSecrets(config);
  return {
    activeConfig: safeConfig,
    strategies,
    riskSettings: safeConfig.risk || {},
    exchangeSettings: { provider: safeConfig.exchangeProvider || safeConfig.exchange?.provider || "binance" },
    neuralStatus: safeConfig.neural || {},
    dashboardRoutes,
    cliCommands,
    safetySummary: {
      paperDefault: safeConfig.botMode !== "live",
      metricsOptIn: Boolean(safeConfig.metricsEnabled),
      liveRequiresPolicy: true
    }
  };
}

export async function writeAutoDocs({ outputDir, docs }) {
  await fs.mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, "operator-quickstart.json");
  await fs.writeFile(file, JSON.stringify(redactSecrets(docs), null, 2));
  return { status: "written", file };
}
