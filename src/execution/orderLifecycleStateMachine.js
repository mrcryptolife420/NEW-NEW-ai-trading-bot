const ORDER_TRANSITIONS = {
  planned: ["submitted", "canceled"],
  submitted: ["open", "filled", "canceled", "rejected"],
  open: ["partially_filled", "filled", "canceled", "expired"],
  partially_filled: ["filled", "canceled", "expired"],
  filled: [],
  canceled: [],
  rejected: [],
  expired: []
};

function transitionOrderLifecycle(state = "planned", event = "submit") {
  const map = {
    submit: "submitted",
    accept: "open",
    partial_fill: "partially_filled",
    fill: "filled",
    cancel: "canceled",
    reject: "rejected",
    expire: "expired"
  };
  const next = map[event] || state;
  const allowed = (ORDER_TRANSITIONS[state] || []).includes(next) || next === state;
  return { state: allowed ? next : state, allowed, previous: state, event };
}

function transitionPositionLifecycle(state = "flat", event = "entry_fill") {
  const map = {
    entry_fill: "open",
    protective_attach: "protected",
    exit_fill: "flat",
    reconcile_flat: "flat"
  };
  return { previous: state, state: map[event] || state, event };
}

function transitionProtectionLifecycle(state = "missing", event = "attach") {
  const map = { attach: "active", refresh: "active", cancel_without_replacement: "blocked", trigger: "triggered" };
  return { previous: state, state: map[event] || state, event };
}

function validateLifecycleInvariants({ order = {}, position = {}, protection = {} } = {}) {
  const violations = [];
  if (order.state === "canceled" && Number(order.executedQty || 0) === 0 && position.state !== "flat") {
    violations.push("canceled_unfilled_order_requires_flat_position");
  }
  if (position.state === "open" && protection.state === "missing") {
    violations.push("open_position_requires_protection");
  }
  return { ok: violations.length === 0, violations };
}

export { transitionOrderLifecycle, transitionPositionLifecycle, transitionProtectionLifecycle, validateLifecycleInvariants };
