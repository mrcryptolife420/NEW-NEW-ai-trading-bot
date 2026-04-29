import { nowIso } from "../utils/time.js";

export async function runTradingCycle(bot) {
  try {
    const result = await bot.runCycleCore();
    const rateLimitBanActive = Boolean(bot.runtime?.requestWeight?.banActive);
    bot.health.recordSuccess(bot.runtime);
    bot.updateSafetyState({ now: new Date(), candidateSummaries: Array.isArray(bot.runtime.latestDecisions) ? bot.runtime.latestDecisions : [] });
    bot.runtime.service = {
      ...(bot.runtime.service || {}),
      lastHeartbeatAt: nowIso(),
      watchdogStatus: rateLimitBanActive ? "paused_rate_limit_ban" : "running"
    };
    bot.refreshOperationalViews({ nowIso: nowIso() });
    bot.trimJournal();
    try {
      await bot.persist();
    } catch (error) {
      if (result.openedPosition) {
        bot.noteEntryPersistFailed({ position: result.openedPosition, error, at: nowIso() });
        await bot.persist().catch(() => {});
      }
      throw error;
    }
    if (result.openedPosition) {
      bot.noteEntryPersisted({ position: result.openedPosition, at: nowIso() });
      if ((bot.config?.botMode || "paper") === "paper") {
        bot.notePaperTradePersisted({ position: result.openedPosition, at: nowIso() });
      }
      await bot.persist();
    }
    return result;
  } catch (error) {
    bot.health.recordFailure(bot.runtime, error);
    bot.runtime.lastAnalysisError = { at: nowIso(), message: error.message };
    bot.runtime.service = {
      ...(bot.runtime.service || {}),
      lastHeartbeatAt: nowIso(),
      watchdogStatus: "degraded"
    };
    bot.recordEvent("cycle_failure", { error: error.message });
    bot.refreshOperationalViews({ nowIso: nowIso() });
    bot.trimJournal();
    try {
      await bot.persist();
    } catch (persistError) {
      bot.logger?.warn?.("Persist failed after cycle failure", {
        cycleError: error.message,
        persistError: persistError.message
      });
    }
    throw error;
  }
}
