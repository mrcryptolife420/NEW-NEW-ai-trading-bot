const BLOCKED_SOURCE_PATTERNS = [/process\.env/, /placeOrder/, /cancelOrder/, /new\s+Binance/i, /fs\./];

function validateStrategyPluginManifest(manifest = {}) {
  const errors = [];
  if (!manifest.name) errors.push("missing_name");
  if (!manifest.version) errors.push("missing_version");
  if (!manifest.entrypoint) errors.push("missing_entrypoint");
  return {
    ok: errors.length === 0,
    lifecycle: manifest.lifecycle || "shadow",
    errors
  };
}

function validateStrategyPluginSource(source = "") {
  const violations = BLOCKED_SOURCE_PATTERNS.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
  return {
    ok: violations.length === 0,
    violations
  };
}

function wrapStrategyPlugin(plugin = {}, { lifecycle = "shadow" } = {}) {
  return async function runWrappedPlugin(context = {}) {
    const result = typeof plugin.run === "function" ? await plugin.run(Object.freeze({ ...context })) : {};
    return {
      lifecycle,
      signal: result?.signal || "hold",
      confidence: Math.max(0, Math.min(1, Number(result?.confidence || 0))),
      blocked: lifecycle !== "active"
    };
  };
}

function buildPluginLifecycleSummary(plugins = []) {
  return plugins.map((plugin) => ({
    name: plugin.manifest?.name || plugin.name || "unknown",
    manifest: validateStrategyPluginManifest(plugin.manifest || plugin),
    source: validateStrategyPluginSource(plugin.source || ""),
    lifecycle: plugin.manifest?.lifecycle || plugin.lifecycle || "shadow"
  }));
}

export { validateStrategyPluginManifest, validateStrategyPluginSource, wrapStrategyPlugin, buildPluginLifecycleSummary };
