import { DemoPaperBroker } from "./demoPaperBroker.js";
import { LiveBroker } from "./liveBroker.js";
import { PaperBroker } from "./paperBroker.js";

export function resolveBrokerSelection(config = {}) {
  const botMode = `${config.botMode || "paper"}`.trim().toLowerCase();
  const paperExecutionVenue = `${config.paperExecutionVenue || "internal"}`.trim().toLowerCase();
  if (botMode === "paper" && paperExecutionVenue === "internal") {
    return { status: "ok", brokerType: "PaperBroker", brokerMode: "paper", executionVenue: "internal" };
  }
  if (botMode === "paper" && paperExecutionVenue === "binance_demo_spot") {
    return { status: "ok", brokerType: "DemoPaperBroker", brokerMode: "paper", executionVenue: "binance_demo_spot" };
  }
  if (botMode === "live" && paperExecutionVenue !== "binance_demo_spot") {
    return { status: "ok", brokerType: "LiveBroker", brokerMode: "live", executionVenue: "binance_spot" };
  }
  return {
    status: "blocked",
    brokerType: null,
    brokerMode: botMode,
    executionVenue: paperExecutionVenue,
    reason: "invalid_bot_mode_paper_execution_venue_combination"
  };
}

export function createBroker({ config = {}, logger, client, symbolRules = {}, stream = null } = {}) {
  const selection = resolveBrokerSelection(config);
  if (selection.status !== "ok") {
    throw new Error(`Broker selection blocked: ${selection.reason}`);
  }
  if (selection.brokerType === "LiveBroker") {
    return new LiveBroker({ client, config, logger, symbolRules, stream });
  }
  if (selection.brokerType === "DemoPaperBroker") {
    return new DemoPaperBroker({ client, config, logger, symbolRules, stream });
  }
  return new PaperBroker(config, logger);
}
