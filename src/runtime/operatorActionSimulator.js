function buildOperatorActionDiff(before = {}, after = {}, prefix = "") {
  const changes = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof before[key] === "object" && before[key] && typeof after[key] === "object" && after[key]) {
      changes.push(...buildOperatorActionDiff(before[key], after[key], path));
    } else if (before[key] !== after[key]) {
      changes.push({ path, before: before[key], after: after[key] });
    }
  }
  return changes;
}

function requiresLiveConfirmation(action = {}) {
  return action.mode === "live" || ["start_live", "apply_live_profile", "cancel_live_order"].includes(action.type);
}

function simulateOperatorAction({ state = {}, action = {}, reducer } = {}) {
  const before = JSON.parse(JSON.stringify(state));
  const after = typeof reducer === "function" ? reducer(before, action) : { ...before, ...(action.patch || {}) };
  return {
    allowed: !requiresLiveConfirmation(action) || action.confirmed === true,
    requiresConfirmation: requiresLiveConfirmation(action),
    diff: buildOperatorActionDiff(state, after),
    after
  };
}

export { simulateOperatorAction, buildOperatorActionDiff, requiresLiveConfirmation };
