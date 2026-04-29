import { nowIso } from "../utils/time.js";

const TRANSITIONS = {
  created: ["initializing", "closed"],
  initializing: ["ready", "degraded", "closed"],
  ready: ["running", "stopping", "degraded", "closed"],
  running: ["stopping", "degraded"],
  stopping: ["stopped", "degraded"],
  stopped: ["initializing", "ready", "closed"],
  degraded: ["ready", "stopping", "closed"],
  closed: []
};

const ACTIVITIES = new Set(["idle", "refreshing", "cycle", "doctor", "report", "research", "scan", "dashboard_snapshot"]);

export function createBotLifecycleState() {
  return {
    state: "created",
    activity: "idle",
    updatedAt: nowIso(),
    previousState: null,
    lastTransition: null,
    history: []
  };
}

export function transitionBotLifecycle(lifecycle = createBotLifecycleState(), nextState, {
  activity = lifecycle.activity || "idle",
  reason = null
} = {}) {
  const currentState = lifecycle.state || "created";
  if (!(TRANSITIONS[currentState] || []).includes(nextState)) {
    const error = new Error(`Invalid bot lifecycle transition: ${currentState} -> ${nextState}`);
    error.code = "INVALID_BOT_LIFECYCLE_TRANSITION";
    error.lifecycle = {
      state: currentState,
      attemptedState: nextState,
      activity,
      reason
    };
    throw error;
  }
  const normalizedActivity = ACTIVITIES.has(activity) ? activity : "idle";
  const updatedAt = nowIso();
  const entry = {
    at: updatedAt,
    from: currentState,
    to: nextState,
    activity: normalizedActivity,
    reason
  };
  const history = [entry, ...(Array.isArray(lifecycle.history) ? lifecycle.history : [])].slice(0, 20);
  return {
    ...lifecycle,
    previousState: currentState,
    state: nextState,
    activity: normalizedActivity,
    updatedAt,
    lastTransition: entry,
    history
  };
}

export function setBotLifecycleActivity(lifecycle = createBotLifecycleState(), activity = "idle") {
  return {
    ...lifecycle,
    activity: ACTIVITIES.has(activity) ? activity : "idle",
    updatedAt: nowIso()
  };
}
