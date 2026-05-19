function buildAutofixReplayPack({ incidents = [], expectedActions = [] } = {}) {
  return {
    incidents: incidents.map((incident, index) => ({ id: incident.id || `incident-${index + 1}`, ...incident })),
    expectedActions
  };
}

function assertAutofixReplay({ pack = {}, actualActions = [] } = {}) {
  const missing = (pack.expectedActions || []).filter((expected) => !actualActions.some((actual) => actual.incidentId === expected.incidentId && actual.action === expected.action));
  const regressedToManual = actualActions.filter((actual) => actual.action === "manual_review" && !(pack.expectedActions || []).some((expected) => expected.incidentId === actual.incidentId && expected.action === "manual_review"));
  return {
    ok: missing.length === 0 && regressedToManual.length === 0,
    missing,
    regressedToManual
  };
}

function buildReplayDriftReport({ baseline = [], candidate = [] } = {}) {
  return baseline.map((expected) => {
    const actual = candidate.find((item) => item.incidentId === expected.incidentId);
    return {
      incidentId: expected.incidentId,
      baseline: expected.action,
      candidate: actual?.action || "missing",
      drifted: expected.action !== actual?.action
    };
  });
}

export { buildAutofixReplayPack, assertAutofixReplay, buildReplayDriftReport };
