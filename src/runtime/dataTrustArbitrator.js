function detectSourceConflicts(sources = []) {
  const conflicts = [];
  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      const a = sources[i];
      const b = sources[j];
      const driftBps = Math.abs(Number(a.price || 0) - Number(b.price || 0)) / Math.max(1, Number(a.price || b.price || 1)) * 10000;
      if (driftBps > 25) conflicts.push({ a: a.name, b: b.name, driftBps });
    }
  }
  return conflicts;
}

function buildDataTrustDecision({ sources = [], maxAgeMs = 30000 } = {}) {
  const fresh = sources.filter((source) => Number(source.ageMs || 0) <= maxAgeMs && source.ok !== false);
  const conflicts = detectSourceConflicts(fresh);
  const trusted = fresh.sort((a, b) => Number(b.weight || 1) - Number(a.weight || 1))[0] || null;
  return {
    trustedSource: conflicts.length ? null : trusted?.name || null,
    canTrade: Boolean(trusted) && conflicts.length === 0,
    canDisplay: fresh.length > 0,
    conflicts,
    staleSources: sources.filter((source) => !fresh.includes(source)).map((source) => source.name)
  };
}

function buildTrustPolicyMatrix({ actions = [] } = {}) {
  return actions.map((action) => ({
    action,
    requiresFreshPrimary: ["enter_trade", "exit_trade"].includes(action),
    allowsStaleDisplay: action === "dashboard_display"
  }));
}

export { detectSourceConflicts, buildDataTrustDecision, buildTrustPolicyMatrix };
