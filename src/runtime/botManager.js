import { loadConfig } from "../config/index.js";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { ensureEnvFile, parseEnvText, readEnvFile, updateEnvFile } from "../config/envFile.js";
import { TRADE_PROFILE_CATALOG, buildTradeProfilePreview } from "../config/tradeProfiles.js";
import { buildProfileDiffPreview } from "./setupStateMachine.js";
import { nowIso } from "../utils/time.js";
import { TradingBot } from "./tradingBot.js";
import { createBotLifecycleState, setBotLifecycleActivity, transitionBotLifecycle } from "./botLifecycleStateMachine.js";
import { buildApiEnvelope, computeOperationalReadiness } from "./operationalTruth.js";
import { buildMissionControlSummary } from "../ops/missionControl.js";
import { buildLivePreflight } from "./livePreflight.js";
import { buildRuntimeLivenessSummary, touchRuntimeLiveness } from "./runtimeLiveness.js";

function summarizeError(error) {
  return {
    at: nowIso(),
    message: error.message,
    stack: error.stack
  };
}

function publicError(error) {
  if (!error?.message) {
    return null;
  }
  return {
    at: error.at || nowIso(),
    message: `${error.message}`.slice(0, 400)
  };
}

function isDemoSpotEnvironment(config = {}) {
  return `${config?.binanceApiBaseUrl || ""}`.toLowerCase().includes("demo-api.binance.com");
}

function assertLiveModeGuardrails(config = {}) {
  if ((config?.botMode || "paper") !== "live") {
    return;
  }
  if (config?.liveTradingAcknowledged !== "I_UNDERSTAND_LIVE_TRADING_RISK") {
    throw new Error("Live mode vereist LIVE_TRADING_ACKNOWLEDGED=I_UNDERSTAND_LIVE_TRADING_RISK.");
  }
  if ((config?.paperExecutionVenue || "internal") === "binance_demo_spot") {
    throw new Error("Live mode mag niet gecombineerd worden met PAPER_EXECUTION_VENUE=binance_demo_spot.");
  }
  if (isDemoSpotEnvironment(config)) {
    throw new Error("Live mode vereist een echte Binance API endpoint, niet demo-api.binance.com.");
  }
}

function buildConfigRuntimeSignature(config = {}) {
  return JSON.stringify({
    botMode: config?.botMode || "paper",
    binanceApiBaseUrl: config?.binanceApiBaseUrl || "",
    binanceFuturesApiBaseUrl: config?.binanceFuturesApiBaseUrl || "",
    binanceApiKey: config?.binanceApiKey || "",
    binanceApiSecret: config?.binanceApiSecret || "",
    paperExecutionVenue: config?.paperExecutionVenue || "internal",
    liveTradingAcknowledged: config?.liveTradingAcknowledged || "",
    enableExchangeProtection: Boolean(config?.enableExchangeProtection)
  });
}

export class BotManager {
  constructor({ projectRoot = process.cwd(), logger }) {
    this.projectRoot = projectRoot;
    this.logger = logger;
    this.lifecycle = createBotLifecycleState();
    this.runState = "stopped";
    this.loopPromise = null;
    this.stopRequested = false;
    this.waitResolver = null;
    this.waitTimer = null;
    this.lastError = null;
    this.lastStartAt = null;
    this.lastStopAt = null;
    this.lastModeSwitchAt = null;
    this.externalConfigMode = null;
    this.externalConfigSignature = null;
    this.externalConfigCheckedAt = null;
    this.externalModeDrift = null;
    this.externalConfigDrift = null;
    this.stopReason = null;
    this.consecutiveCycleFailures = 0;
    this.botNeedsReinitialize = false;
    this.liveness = touchRuntimeLiveness({}, { phase: "manager_constructed", status: "idle" });
    this.serial = Promise.resolve();
  }

  noteLiveness(phase, { status = "running", reason = null, error = null } = {}) {
    const at = nowIso();
    this.liveness = touchRuntimeLiveness({ liveness: this.liveness }, { phase, status, reason, error, at });
    if (this.bot?.runtime) {
      touchRuntimeLiveness(this.bot.runtime, { phase, status, reason, error, at });
    }
    return this.liveness;
  }

  syncRunStateFromLifecycle() {
    this.runState = this.lifecycle.state === "running"
      ? "running"
      : this.lifecycle.state === "stopping"
        ? "stopping"
        : "stopped";
  }

  setLifecycleActivity(activity = "idle") {
    this.lifecycle = setBotLifecycleActivity(this.lifecycle, activity);
    this.syncRunStateFromLifecycle();
    return this.lifecycle;
  }

  transitionLifecycle(nextState, options = {}) {
    this.lifecycle = transitionBotLifecycle(this.lifecycle, nextState, options);
    this.syncRunStateFromLifecycle();
    return this.lifecycle;
  }

  forceLifecycle(nextState, {
    activity = "idle",
    reason = null
  } = {}) {
    const updatedAt = nowIso();
    const from = this.lifecycle?.state || "created";
    const entry = {
      at: updatedAt,
      from,
      to: nextState,
      activity,
      reason
    };
    this.lifecycle = {
      ...(this.lifecycle || {}),
      previousState: from,
      state: nextState,
      activity,
      updatedAt,
      lastTransition: entry,
      history: [entry, ...(Array.isArray(this.lifecycle?.history) ? this.lifecycle.history : [])].slice(0, 20)
    };
    this.syncRunStateFromLifecycle();
    return this.lifecycle;
  }

  async withLock(action) {
    const next = this.serial.then(action, action);
    this.serial = next.catch(() => {});
    return next;
  }

  async init(options = {}) {
    return this.withLock(async () => {
      this.transitionLifecycle("initializing", { activity: "refreshing", reason: "manager_init" });
      this.noteLiveness("manager_init", { status: "running" });
      await ensureEnvFile(this.projectRoot);
      await this.reinitializeBot(options);
      if (!options.skipInitialAnalysis) {
        await this.bot.refreshAnalysis();
      }
      this.noteLiveness("manager_ready", { status: "ready" });
      this.transitionLifecycle("ready", { activity: "idle", reason: "manager_init_completed" });
      return this.getSnapshot();
    });
  }

  async reinitializeBot(options = {}) {
    if (this.bot?.close) {
      await this.bot.close();
    }
    const config = await loadConfig(this.projectRoot);
    assertLiveModeGuardrails(config);
    const bot = new TradingBot({ config, logger: this.logger });
    await bot.init(options);
    this.config = config;
    this.configRuntimeSignature = buildConfigRuntimeSignature(config);
    this.bot = bot;
    this.botNeedsReinitialize = false;
    return bot;
  }

  async ensureBotReady({ allowClosed = false } = {}) {
    if (!this.bot || (!allowClosed && this.botNeedsReinitialize)) {
      await this.reinitializeBot();
    }
    if (allowClosed && this.botNeedsReinitialize) {
      return;
    }
    await this.syncStoppedModeFromEnv();
  }

  async inspectExternalMode() {
    const latestConfig = await loadConfig(this.projectRoot);
    this.externalConfigMode = latestConfig.botMode;
    this.externalConfigSignature = buildConfigRuntimeSignature(latestConfig);
    this.externalConfigCheckedAt = nowIso();
    this.externalModeDrift = latestConfig.botMode !== (this.config?.botMode || null)
      ? {
          currentMode: this.config?.botMode || null,
          externalMode: latestConfig.botMode
        }
      : null;
    this.externalConfigDrift = this.externalConfigSignature !== (this.configRuntimeSignature || null)
      ? {
          currentMode: this.config?.botMode || null,
          externalMode: latestConfig.botMode
        }
      : null;
    return latestConfig.botMode;
  }

  async syncStoppedModeFromEnv() {
    if (typeof this.bot?.refreshAnalysis !== "function") {
      return false;
    }
    const externalMode = await this.inspectExternalMode();
    const signatureDrift = this.externalConfigSignature !== (this.configRuntimeSignature || null);
    if (!this.config || !externalMode || this.runState === "running") {
      return false;
    }
    if (externalMode === this.config.botMode && !signatureDrift) {
      return false;
    }
    await this.reinitializeBot();
    await this.bot.refreshAnalysis?.();
    this.lastModeSwitchAt = nowIso();
    await this.inspectExternalMode();
    return true;
  }

  buildSnapshotFromDashboard(dashboard) {
    const sourceTruthMode = dashboard?.sourceOfTruth?.mode || "paper";
    const manager = {
      runState: this.runState,
      lifecycle: this.lifecycle,
      currentMode: sourceTruthMode,
      externalConfigMode: this.externalConfigMode,
      externalConfigDrift: this.externalConfigDrift,
      externalConfigCheckedAt: this.externalConfigCheckedAt,
      externalModeDrift: this.externalModeDrift,
      lastStartAt: this.lastStartAt,
      lastStopAt: this.lastStopAt,
      lastModeSwitchAt: this.lastModeSwitchAt,
      stopReason: this.stopReason || null,
      lastError: publicError(this.lastError),
      liveness: buildRuntimeLivenessSummary({
        runtime: this.bot?.runtime || {},
        manager: { runState: this.runState, liveness: this.liveness, lastError: this.lastError },
        config: this.config || {}
      }),
      dashboardPort: this.config.dashboardPort
    };
    const snapshot = buildApiEnvelope({
      kind: "snapshot",
      manager,
      snapshot: {
        manager,
        dashboard
      }
    });
    snapshot.dashboard = dashboard;
    snapshot.manager.readiness = this.buildOperationalReadiness(snapshot);
    return snapshot;
  }

  buildApiEnvelope(kind, body = {}) {
    return buildApiEnvelope({
      kind,
      manager: body.manager || {
        runState: this.runState,
        lifecycle: this.lifecycle,
        currentMode: this.config?.botMode || "paper",
        lastError: publicError(this.lastError),
        liveness: buildRuntimeLivenessSummary({
          runtime: this.bot?.runtime || {},
          manager: { runState: this.runState, liveness: this.liveness, lastError: this.lastError },
          config: this.config || {}
        })
      },
      status: kind === "status" ? (body.status || null) : null,
      doctor: kind === "doctor" ? (body.doctor || null) : null,
      report: kind === "report" ? (body.report || null) : null
    });
  }

  async closeBotForStop() {
    if (!this.bot?.close || this.botNeedsReinitialize) {
      return;
    }
    await this.bot.close();
    this.botNeedsReinitialize = true;
  }

  async interruptibleDelay(ms) {
    await new Promise((resolve) => {
      this.waitResolver = resolve;
      this.waitTimer = setTimeout(resolve, ms);
    });
    this.waitResolver = null;
    this.waitTimer = null;
  }

  cancelDelay() {
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    if (this.waitResolver) {
      const resolver = this.waitResolver;
      this.waitResolver = null;
      resolver();
    }
  }

  async applySelfHealManagerAction(selfHeal) {
    const action = selfHeal?.managerAction || null;
    if (!action) {
      return null;
    }
    if (action === "switch_to_paper" && this.config?.botMode === "live") {
      if (isDemoSpotEnvironment(this.config)) {
        this.logger?.warn?.("Self-heal retained Binance Demo Spot mode instead of switching to paper", {
          reason: selfHeal.reason
        });
        return "retained_demo_live_mode";
      }
      const openPositions = this.bot?.runtime?.openPositions || [];
      if (openPositions.length) {
        const message = `Self-heal requested paper fallback while ${openPositions.length} live position(s) remain open; stopping manager instead.`;
        this.logger?.error?.("Self-heal paper fallback blocked by live positions", {
          reason: selfHeal.reason,
          openPositions: openPositions.map((position) => position.symbol)
        });
        this.lastError = {
          at: nowIso(),
          message,
          stack: null
        };
        this.stopRequested = true;
        this.stopReason = "self_heal_live_positions_open";
        if (["running", "ready", "degraded"].includes(this.lifecycle.state)) {
          this.transitionLifecycle("stopping", { activity: "idle", reason: "self_heal_live_positions_open" });
        }
        this.cancelDelay();
        return "paper_switch_blocked_open_positions";
      }
      this.logger.warn("Self-heal switching bot to paper mode", { reason: selfHeal.reason });
      await updateEnvFile(this.config.envPath, { BOT_MODE: "paper" });
      await this.reinitializeBot();
      await this.bot.refreshAnalysis();
      this.lastModeSwitchAt = nowIso();
      return "switched_to_paper";
    }
    return null;
  }

  async runLoop() {
    const escalationThreshold = Math.max(3, Number(this.config?.managerCycleFailureEscalationThreshold || 6));
    if (this.lifecycle.state === "created") {
      this.forceLifecycle("running", { activity: "idle", reason: "loop_started_without_init" });
    } else if (this.lifecycle.state === "stopped") {
      this.transitionLifecycle("ready", { activity: "idle", reason: "loop_restart" });
      this.transitionLifecycle("running", { activity: "idle", reason: "loop_started" });
    } else if (this.lifecycle.state === "ready") {
      this.transitionLifecycle("running", { activity: "idle", reason: "loop_started" });
    }
    while (!this.stopRequested) {
      try {
        this.setLifecycleActivity("cycle");
        this.noteLiveness("cycle_started", { status: "running" });
        const result = await this.bot.runCycle();
        this.noteLiveness("cycle_completed", { status: "ready" });
        await this.applySelfHealManagerAction(result.selfHeal);
        this.consecutiveCycleFailures = 0;
        if (this.stopReason !== "self_heal_live_positions_open") {
          this.lastError = null;
        }
        if (this.lifecycle.state === "degraded") {
          this.transitionLifecycle("ready", { activity: "idle", reason: "cycle_recovered" });
          this.transitionLifecycle("running", { activity: "idle", reason: "resume_loop" });
        } else {
          this.setLifecycleActivity("idle");
        }
      } catch (error) {
        this.consecutiveCycleFailures += 1;
        this.lastError = summarizeError(error);
        this.noteLiveness("cycle_failed", { status: "failed", error });
        if (this.lifecycle.state !== "degraded") {
          this.transitionLifecycle("degraded", { activity: "cycle", reason: "cycle_failure" });
        } else {
          this.setLifecycleActivity("cycle");
        }
        this.logger.error("Managed cycle failed", {
          error: error.message,
          consecutiveFailures: this.consecutiveCycleFailures
        });
        if (this.consecutiveCycleFailures >= escalationThreshold) {
          if ((this.config?.botMode || "paper") === "live") {
            this.stopRequested = true;
            this.stopReason = "manager_cycle_failure_escalated";
            this.logger.error("Manager loop escalated after repeated live cycle failures", {
              threshold: escalationThreshold,
              consecutiveFailures: this.consecutiveCycleFailures,
              lastError: error.message
            });
          } else {
            this.stopReason = "paper_cycle_failure_degraded";
            this.logger.warn?.("Paper manager remains degraded after repeated cycle failures", {
              threshold: escalationThreshold,
              consecutiveFailures: this.consecutiveCycleFailures,
              lastError: error.message
            });
          }
        }
      }
      if (this.stopRequested) {
        break;
      }
      this.noteLiveness("cycle_waiting", { status: "idle" });
      await this.interruptibleDelay(this.config.tradingIntervalSeconds * 1000);
    }
    this.noteLiveness("manager_stopping", { status: "stopping", reason: this.stopReason || "loop_stop" });
    this.transitionLifecycle("stopping", { activity: "idle", reason: this.stopReason || "loop_stop" });
    this.transitionLifecycle("stopped", { activity: "idle", reason: this.stopReason || "loop_stop" });
    this.noteLiveness("manager_stopped", { status: "stopped", reason: this.stopReason || "loop_stop" });
    this.lastStopAt = nowIso();
  }

  async stopUnlocked(reason = "manual_stop") {
    this.stopRequested = true;
    this.stopReason = reason;
    this.cancelDelay();

    if (this.runState === "stopped") {
      try {
        await this.closeBotForStop();
      } catch (error) {
        this.lastError = summarizeError(error);
        this.logger?.error?.("Managed shutdown failed", { error: error.message });
      }
      if (this.lifecycle.state !== "stopped") {
        if (["ready", "degraded"].includes(this.lifecycle.state)) {
          this.transitionLifecycle("stopping", { activity: "idle", reason });
        }
        if (["stopping", "degraded"].includes(this.lifecycle.state)) {
          this.transitionLifecycle("stopped", { activity: "idle", reason });
        } else if (["created", "initializing"].includes(this.lifecycle.state)) {
          this.forceLifecycle("stopped", { activity: "idle", reason });
        }
      }
      this.lastStopAt = nowIso();
      return this.getSnapshot({ allowClosedBot: true });
    }

    if (["running", "ready", "degraded"].includes(this.lifecycle.state)) {
      this.transitionLifecycle("stopping", { activity: "idle", reason });
    } else if (!["stopping", "stopped"].includes(this.lifecycle.state)) {
      this.forceLifecycle("stopping", { activity: "idle", reason });
    }
    if (this.loopPromise) {
      await this.loopPromise;
    }
    if (this.lifecycle.state !== "stopped") {
      if (["stopping", "degraded"].includes(this.lifecycle.state)) {
        this.transitionLifecycle("stopped", { activity: "idle", reason });
      } else {
        this.forceLifecycle("stopped", { activity: "idle", reason });
      }
    }
    try {
      await this.closeBotForStop();
    } catch (error) {
      this.lastError = summarizeError(error);
      this.logger?.error?.("Managed shutdown failed", { error: error.message });
    }
    this.lastStopAt = nowIso();
    return this.getSnapshot({ allowClosedBot: true });
  }

  async start() {
    return this.withLock(async () => {
      await this.ensureBotReady();
      if (this.runState === "running") {
        return this.getSnapshot();
      }
      this.stopRequested = false;
      this.stopReason = null;
      this.consecutiveCycleFailures = 0;
      this.noteLiveness("manager_start_requested", { status: "running" });
      if (this.lifecycle.state === "stopped") {
        this.transitionLifecycle("ready", { activity: "idle", reason: "restart" });
      }
      this.transitionLifecycle("running", { activity: "idle", reason: "start" });
      this.lastStartAt = nowIso();
      this.loopPromise = this.runLoop();
      return this.getSnapshot();
    });
  }

  async stop(reason = "manual_stop") {
    return this.withLock(async () => this.stopUnlocked(reason));
  }

  async runCycleOnce() {
    return this.withLock(async () => {
      await this.ensureBotReady();
      if (this.runState === "running") {
        throw new Error("Stop eerst de doorlopende bot voordat je een losse cyclus draait.");
      }
      this.setLifecycleActivity("cycle");
      this.noteLiveness("cycle_once_started", { status: "running" });
      const result = await this.bot.runCycle();
      this.noteLiveness("cycle_once_completed", { status: "ready" });
      const selfHealAction = await this.applySelfHealManagerAction(result.selfHeal);
      this.consecutiveCycleFailures = 0;
      if (!["paper_switch_blocked_open_positions"].includes(selfHealAction || "") && !this.lastError?.message) {
        this.lastError = null;
      }
      this.setLifecycleActivity("idle");
      return {
        result,
        snapshot: await this.getSnapshot()
      };
    });
  }

  async refreshAnalysis() {
    return this.withLock(async () => {
      await this.ensureBotReady();
      if (this.runState === "running") {
        throw new Error("Stop eerst de bot voordat je handmatig analyse ververst.");
      }
      this.setLifecycleActivity("refreshing");
      await this.bot.refreshAnalysis();
      this.lastError = null;
      this.setLifecycleActivity("idle");
      return this.getSnapshot();
    });
  }

  async runResearch(symbols = []) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      if (this.runState === "running") {
        throw new Error("Stop eerst de bot voordat je research draait.");
      }
      this.setLifecycleActivity("research");
      const result = await this.bot.runResearch({ symbols });
      this.lastError = null;
      this.setLifecycleActivity("idle");
      return {
        result,
        snapshot: await this.getSnapshot()
      };
    });
  }

  async runMarketScan(symbols = []) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      if (this.runState === "running") {
        throw new Error("Stop eerst de bot voordat je een scan draait.");
      }
      this.setLifecycleActivity("scan");
      const result = await this.bot.runMarketScanner({ symbols });
      this.lastError = null;
      this.setLifecycleActivity("idle");
      return {
        result,
        snapshot: await this.getSnapshot()
      };
    });
  }

  async runIncidentReplay(options = {}) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      if (this.runState === "running") {
        throw new Error("Stop eerst de bot voordat je een incident replay draait.");
      }
      this.setLifecycleActivity("research");
      const result = await this.bot.runIncidentReplayLab(options);
      this.lastError = null;
      this.setLifecycleActivity("idle");
      return {
        result,
        snapshot: await this.getSnapshot()
      };
    });
  }

  async setMode(mode) {
    const normalized = `${mode || "paper"}`.trim().toLowerCase() === "live" ? "live" : "paper";

    return this.withLock(async () => {
      if (!this.config) {
        await this.reinitializeBot();
      }
      if (this.config.botMode === normalized) {
        return this.getSnapshot();
      }

      const previousMode = this.config.botMode;
      const wasRunning = this.runState === "running";
      const envPath = this.config.envPath;

      if (normalized === "live") {
        assertLiveModeGuardrails({
          ...this.config,
          botMode: "live"
        });
      }

      await this.stopUnlocked("mode_switch");
      await updateEnvFile(envPath, { BOT_MODE: normalized });

      try {
        await this.reinitializeBot();
        await this.bot.refreshAnalysis();
        this.lastModeSwitchAt = nowIso();
      } catch (error) {
        await updateEnvFile(envPath, { BOT_MODE: previousMode });
        await this.reinitializeBot();
        this.lastError = summarizeError(error);
        throw error;
      }

      if (wasRunning) {
        this.stopRequested = false;
        this.stopReason = null;
        this.transitionLifecycle("running", { activity: "idle", reason: "mode_switch_restart" });
        this.lastStartAt = nowIso();
        this.loopPromise = this.runLoop();
      }

      return this.getSnapshot();
    });
  }

  async getConfigProfiles() {
    const current = this.config || {};
    const envPath = current.envPath || path.join(this.projectRoot, ".env");
    const envValues = parseEnvText(await readEnvFile(envPath));
    const isProfileActive = (profile) => Object.entries(profile.env || {})
      .every(([key, value]) => (envValues[key] ?? "") === `${value ?? ""}`);
    return {
      current: {
        mode: current.botMode || "paper",
        configProfile: current.profile?.id || null,
        paperModeProfile: current.paperModeProfile || "learn",
        paperExecutionVenue: current.paperExecutionVenue || "internal",
        envPath,
        projectRoot: this.projectRoot,
        runtimeDir: current.runtimeDir || null,
        historyDir: current.historyDir || null,
        configSource: process.env.CODEX_BOT_ENV_PATH ? "user_env_path" : "project_env",
        buildCommit: process.env.BUILD_COMMIT || "local",
        liveAcknowledged: current.liveTradingAcknowledged === "I_UNDERSTAND_LIVE_TRADING_RISK"
      },
      profiles: TRADE_PROFILE_CATALOG.map((profile) => ({
        id: profile.id,
        label: profile.label,
        mode: profile.mode,
        description: profile.description,
        neural: profile.env.NEURAL_SELF_TUNING_ENABLED === "true" ? "full paper-only" : profile.mode === "live" ? "observe only" : "safe partial",
        env: { ...profile.env },
        requiresLiveAcknowledgement: profile.requiresLiveAcknowledgement === true,
        active: isProfileActive(profile)
      }))
    };
  }

  async previewConfigProfile(profileId) {
    await this.ensureBotReady({ allowClosed: true });
    return buildProfileDiffPreview({
      preview: buildTradeProfilePreview({ profileId, currentConfig: this.config || {} }),
      currentConfig: this.config || {}
    });
  }

  async applyConfigProfile(profileId, { liveAcknowledgement = "" } = {}) {
    return this.withLock(async () => {
      await this.ensureBotReady({ allowClosed: true });
      const preview = buildProfileDiffPreview({
        preview: buildTradeProfilePreview({ profileId, currentConfig: this.config || {} }),
        currentConfig: this.config || {}
      });
      const updates = { ...preview.updates };
      const nextMode = updates.BOT_MODE || "paper";
      if (nextMode === "live") {
        if (liveAcknowledgement !== "I_UNDERSTAND_LIVE_TRADING_RISK") {
          throw new Error("Live profiel vereist exacte bevestiging: I_UNDERSTAND_LIVE_TRADING_RISK.");
        }
        updates.LIVE_TRADING_ACKNOWLEDGED = liveAcknowledgement;
        assertLiveModeGuardrails({
          ...this.config,
          botMode: "live",
          paperExecutionVenue: updates.PAPER_EXECUTION_VENUE || this.config?.paperExecutionVenue,
          binanceApiBaseUrl: updates.BINANCE_API_BASE_URL ?? this.config?.binanceApiBaseUrl,
          liveTradingAcknowledged: liveAcknowledgement
        });
      }
      const wasRunning = this.runState === "running";
      const envPath = this.config?.envPath || await ensureEnvFile(this.projectRoot);
      await this.stopUnlocked("config_profile_apply");
      const writeResult = await updateEnvFile(envPath, updates);
      await this.reinitializeBot();
      this.lastModeSwitchAt = nowIso();
      if (wasRunning && nextMode !== "live") {
        this.stopRequested = false;
        this.stopReason = null;
        this.transitionLifecycle("running", { activity: "idle", reason: "config_profile_restart" });
        this.lastStartAt = nowIso();
        this.loopPromise = this.runLoop();
      }
      return {
        applied: true,
        profile: preview.profile,
        projectRoot: this.projectRoot,
        envPath,
        updates: writeResult.updates,
        before: writeResult.before,
        after: writeResult.after,
        backupPath: writeResult.backupPath,
        writeVerified: writeResult.writeVerified,
        mismatches: writeResult.mismatches,
        restarted: wasRunning && nextMode !== "live",
        profiles: await this.getConfigProfiles(),
        snapshot: await this.getSnapshot()
      };
    });
  }

  async completeSetup({ profileId = "beginner-paper-learning", liveAcknowledgement = "" } = {}) {
    const applyResult = await this.applyConfigProfile(profileId || "beginner-paper-learning", { liveAcknowledgement });
    const checks = await this.runSetupChecks();
    return {
      completed: applyResult.writeVerified === true && checks.ok === true,
      completedAt: nowIso(),
      projectRoot: this.projectRoot,
      envPath: applyResult.envPath,
      profileId: applyResult.profile?.id || profileId || "beginner-paper-learning",
      apply: applyResult,
      checks
    };
  }

  async getSafeEnvStatus() {
    await this.ensureBotReady({ allowClosed: true });
    const envPath = this.config?.envPath || path.join(this.projectRoot, ".env");
    const values = parseEnvText(await readEnvFile(envPath));
    const safeKeys = [
      "BOT_MODE",
      "CONFIG_PROFILE",
      "CONFIG_CAPABILITY_BUNDLES",
      "PAPER_MODE_PROFILE",
      "PAPER_EXECUTION_VENUE",
      "BINANCE_API_BASE_URL",
      "BINANCE_FUTURES_API_BASE_URL",
      "NEURAL_SELF_TUNING_ENABLED",
      "NEURAL_SELF_TUNING_PAPER_ONLY",
      "NEURAL_CONTINUOUS_LEARNING_ENABLED",
      "NEURAL_LIVE_AUTONOMY_ENABLED"
    ];
    return {
      envPath,
      projectRoot: this.projectRoot,
      safeValues: Object.fromEntries(safeKeys.map((key) => [key, values[key] ?? ""])),
      redacted: Object.keys(values).filter((key) => /SECRET|KEY|TOKEN/i.test(key))
    };
  }

  async getGuiDiagnostics({ dashboardUrl = null } = {}) {
    await this.ensureBotReady({ allowClosed: true });
    const envPath = this.config?.envPath || path.join(this.projectRoot, ".env");
    const check = async (filePath) => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    };
    const envWritable = await fs.access(path.dirname(envPath), fsConstants.W_OK).then(() => true).catch(() => false);
      return {
        packaged: false,
        botRoot: this.projectRoot,
        projectRoot: this.projectRoot,
        envPath,
        configSource: process.env.CODEX_BOT_ENV_PATH ? "user_env_path" : "project_env",
        buildCommit: process.env.BUILD_COMMIT || "local",
        envExists: await check(envPath),
      envWritable,
      runtimeDir: this.config?.runtimeDir || null,
      historyDir: this.config?.historyDir || null,
      dashboardPublicExists: await check(path.join(this.projectRoot, "src", "dashboard", "public", "index.html")),
      serverPathExists: await check(path.join(this.projectRoot, "src", "dashboard", "server.js")),
      dashboardUrl: dashboardUrl || `http://127.0.0.1:${this.config?.dashboardPort || 3011}`
    };
  }

  async runSetupChecks() {
    const diagnostics = await this.getGuiDiagnostics();
    return {
      ok: diagnostics.envExists && diagnostics.envWritable && diagnostics.dashboardPublicExists && diagnostics.serverPathExists,
      checks: diagnostics
    };
  }

  buildOperationalReadiness(snapshot) {
    const mode = snapshot?.manager?.currentMode || this.config?.botMode || "paper";
    return computeOperationalReadiness({
      snapshotReadiness: snapshot?.dashboard?.ops?.readiness || {},
      checkedAt: nowIso(),
      lastAnalysisAt: snapshot?.dashboard?.overview?.lastAnalysisAt || null,
      runState: snapshot?.manager?.runState || this.runState,
      mode,
      managerHasError: Boolean(snapshot?.manager?.lastError?.message || this.lastError?.message),
      healthCircuitOpen: Boolean(snapshot?.dashboard?.health?.circuitOpen),
      exchangeTruthFreeze: Boolean(snapshot?.dashboard?.safety?.exchangeTruth?.freezeEntries),
      exchangeSafetyBlocked: (snapshot?.dashboard?.safety?.exchangeSafety?.status || "") === "blocked",
      capitalGovernorBlocked: (snapshot?.dashboard?.ops?.capitalGovernor?.status || "") === "blocked",
      selfHealMode: snapshot?.dashboard?.safety?.selfHeal?.mode || "",
      serviceWatchdogStatus: snapshot?.dashboard?.ops?.service?.watchdogStatus || "",
      serviceHeartbeatStale: Boolean(snapshot?.dashboard?.ops?.service?.heartbeatStale),
      serviceRecoveryActive: Boolean(snapshot?.dashboard?.ops?.service?.recoveryActive),
      externalModeMismatch: Boolean(snapshot?.manager?.externalModeDrift?.externalMode && this.runState === "running"),
      alerts: snapshot?.dashboard?.ops?.alerts?.alerts || [],
      pendingActions: snapshot?.dashboard?.safety?.orderLifecycle?.pendingActions || [],
      analysisMissingStatus: "warming"
    });
  }

  async getOperationalReadiness() {
    return this.buildOperationalReadiness(await this.getSnapshot());
  }

  async getMissionControl() {
    const snapshot = await this.getSnapshot({ allowClosedBot: true });
    return buildMissionControlSummary({
      snapshot,
      config: this.config || {},
      readiness: this.buildOperationalReadiness(snapshot)
    });
  }

  async getStatus() {
    await this.ensureBotReady();
    const status = await this.bot.getStatus();
    return this.buildApiEnvelope("status", {
      manager: {
        runState: this.runState,
        lifecycle: this.lifecycle,
        currentMode: status?.sourceOfTruth?.mode || "paper",
        lastStartAt: this.lastStartAt,
        lastStopAt: this.lastStopAt,
        lastModeSwitchAt: this.lastModeSwitchAt,
        stopReason: this.stopReason || null,
        lastError: publicError(this.lastError)
      },
      status
    });
  }

  async getDoctor() {
    await this.ensureBotReady();
    const doctor = await this.bot.runDoctor();
    return this.buildApiEnvelope("doctor", {
      manager: {
        runState: this.runState,
        lifecycle: this.lifecycle,
        currentMode: doctor?.sourceOfTruth?.mode || "paper",
        lastError: publicError(this.lastError)
      },
      doctor
    });
  }

  async getLivePreflight() {
    await this.ensureBotReady();
    const runtime = this.bot?.runtime || {};
    const preflight = buildLivePreflight({
      config: this.config || {},
      runtime,
      doctor: runtime.lastDoctor || runtime.doctor || {},
      exchangeSummary: runtime.exchangeTruth || runtime.exchangeSafety || {},
      promotionDossier: runtime.promotionPipeline || runtime.promotionDossier || {},
      rollbackWatch: runtime.rollbackWatch || {}
    });
    return this.buildApiEnvelope("live_preflight", {
      manager: {
        runState: this.runState,
        lifecycle: this.lifecycle,
        currentMode: this.config?.botMode || "paper",
        lastError: publicError(this.lastError)
      },
      preflight
    });
  }

  async getReport() {
    await this.ensureBotReady();
    const report = await this.bot.getReport();
    return this.buildApiEnvelope("report", {
      manager: {
        runState: this.runState,
        lifecycle: this.lifecycle,
        currentMode: report?.sourceOfTruth?.mode || "paper",
        lastError: publicError(this.lastError)
      },
      report
    });
  }

  async getLearning() {
    await this.ensureBotReady();
    const learning = await this.bot.getAdaptiveLearningStatus();
    return buildApiEnvelope({
      kind: "learning",
      manager: {
        runState: this.runState,
        lifecycle: this.lifecycle,
        currentMode: learning?.mode || this.config?.botMode || "paper",
        lastError: publicError(this.lastError)
      },
      learning
    });
  }

  async acknowledgeAlert(id, acknowledged = true, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.acknowledgeAlert(id, { acknowledged, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async silenceAlert(id, minutes = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.silenceAlert(id, { minutes: minutes ?? this.config?.operatorAlertSilenceMinutes });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async resolveAlert(id, resolved = true, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.resolveAlert(id, { resolved, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async forceReconcile(note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.forceReconcile({ note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async markPositionReviewed(positionId, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.markPositionReviewed(positionId, { note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async setProbeOnly(enabled = true, minutes = null, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.setProbeOnly({ enabled, minutes: minutes ?? 90, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async runDiagnosticsAction(action, target = null, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const normalizedAction = `${action || ""}`.trim().toLowerCase();
      if (!normalizedAction) {
        throw new Error("Ongeldige diagnostics action.");
      }
      if (normalizedAction === "refresh_analysis") {
        if (this.runState === "running") {
          throw new Error("Stop eerst de bot voordat je handmatig analyse ververst.");
        }
        await this.bot.refreshAnalysis();
        this.bot.recordDiagnosticsAction({
          action: normalizedAction,
          target,
          note,
          detail: "Analyse handmatig ververst via diagnostics."
        });
        await this.bot.persistRuntimeOnly();
        return this.getSnapshot();
      }
      if (normalizedAction === "research_focus_symbol") {
        const symbol = `${target || ""}`.trim().toUpperCase();
        if (!symbol) {
          throw new Error("Symbool ontbreekt voor diagnostics research action.");
        }
        if (this.runState === "running") {
          throw new Error("Stop eerst de bot voordat je research draait.");
        }
        await this.bot.runResearch({ symbols: [symbol] });
        this.bot.recordDiagnosticsAction({
          action: normalizedAction,
          target: symbol,
          note,
          detail: `Research handmatig gestart voor ${symbol}.`
        });
        await this.bot.persistRuntimeOnly();
        return this.getSnapshot();
      }
      const dashboard = await this.bot.performDiagnosticsAction({ action: normalizedAction, target, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async approvePolicyTransition(id, action, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.approvePolicyTransition({ id, action, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async rejectPolicyTransition(id, action, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.rejectPolicyTransition({ id, action, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async revertPolicyTransition(id, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.revertPolicyTransition({ id, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async approvePromotionCandidate(symbol, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.approvePromotionCandidate({ symbol, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async rollbackPromotionCandidate(symbol, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.rollbackPromotionCandidate({ symbol, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async approvePromotionScope(scopeId, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.approvePromotionScope({ scopeId, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async rollbackPromotionScope(scopeId, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.rollbackPromotionScope({ scopeId, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async decidePromotionProbation(key, decision, note = null) {
    return this.withLock(async () => {
      await this.ensureBotReady();
      const dashboard = await this.bot.decidePromotionProbation({ key, decision, note });
      return this.buildSnapshotFromDashboard(dashboard);
    });
  }

  async getSnapshot({ allowClosedBot = false } = {}) {
    await this.ensureBotReady({ allowClosed: allowClosedBot });
    const dashboard = await this.bot.getDashboardSnapshot();
    return this.buildSnapshotFromDashboard(dashboard);
  }
}
