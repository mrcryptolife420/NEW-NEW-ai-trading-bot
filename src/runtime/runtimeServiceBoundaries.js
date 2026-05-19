function buildRuntimeBoundaryMap(services = []) {
  return services.map((service) => ({
    name: service.name,
    owns: service.owns || [],
    dependsOn: service.dependsOn || []
  }));
}

function hasCycle(service, byName, seen = new Set(), stack = new Set()) {
  if (stack.has(service.name)) return true;
  if (seen.has(service.name)) return false;
  seen.add(service.name);
  stack.add(service.name);
  for (const dep of service.dependsOn || []) {
    const next = byName.get(dep);
    if (next && hasCycle(next, byName, seen, stack)) return true;
  }
  stack.delete(service.name);
  return false;
}

function validateRuntimeBoundaryOwnership(boundaries = []) {
  const ownerByCapability = new Map();
  const violations = [];
  for (const boundary of boundaries) {
    for (const capability of boundary.owns || []) {
      if (ownerByCapability.has(capability)) {
        violations.push(`duplicate_owner:${capability}`);
      }
      ownerByCapability.set(capability, boundary.name);
    }
  }
  const byName = new Map(boundaries.map((boundary) => [boundary.name, boundary]));
  if (boundaries.some((boundary) => hasCycle(boundary, byName))) violations.push("dependency_cycle");
  return { ok: violations.length === 0, violations };
}

function buildRuntimeServiceContainer(boundaries = []) {
  const validation = validateRuntimeBoundaryOwnership(boundaries);
  return {
    validation,
    services: Object.fromEntries(boundaries.map((boundary) => [boundary.name, { owns: boundary.owns || [] }]))
  };
}

export { buildRuntimeBoundaryMap, buildRuntimeServiceContainer, validateRuntimeBoundaryOwnership };
