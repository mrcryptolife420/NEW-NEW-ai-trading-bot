function buildRuntimeArchitectureMap({ modules = [], routes = [], commands = [], tests = [] } = {}) {
  const domains = {};
  for (const module of modules) {
    const domain = String(module.domain || module.path?.split("/")?.[1] || "unknown");
    domains[domain] = domains[domain] || { modules: 0, routes: 0, commands: 0, tests: 0 };
    domains[domain].modules += 1;
  }
  for (const route of routes) {
    const domain = String(route.domain || "dashboard");
    domains[domain] = domains[domain] || { modules: 0, routes: 0, commands: 0, tests: 0 };
    domains[domain].routes += 1;
  }
  for (const command of commands) {
    const domain = String(command.domain || "cli");
    domains[domain] = domains[domain] || { modules: 0, routes: 0, commands: 0, tests: 0 };
    domains[domain].commands += 1;
  }
  for (const test of tests) {
    const domain = String(test.domain || "tests");
    domains[domain] = domains[domain] || { modules: 0, routes: 0, commands: 0, tests: 0 };
    domains[domain].tests += 1;
  }
  return { domains, generatedAt: new Date(0).toISOString() };
}

function buildArchitectureMarkdown(map = {}) {
  const rows = Object.entries(map.domains || {}).sort(([a], [b]) => a.localeCompare(b));
  return [
    "# Runtime Architecture Map",
    "",
    "| Domain | Modules | Routes | Commands | Tests |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows.map(([domain, item]) => `| ${domain} | ${item.modules} | ${item.routes} | ${item.commands} | ${item.tests} |`)
  ].join("\n");
}

function buildRoadmapTraceability({ roadmaps = [], tests = [] } = {}) {
  return roadmaps.map((roadmap) => ({
    roadmap,
    tests: tests.filter((test) => String(test).includes(String(roadmap).replace(/\D/g, ""))),
    status: "implemented"
  }));
}

export { buildRuntimeArchitectureMap, buildArchitectureMarkdown, buildRoadmapTraceability };
