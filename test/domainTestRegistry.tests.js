import { classifyTestDomain, resolveRequestedTestDomains, TEST_DOMAINS } from "./domainTestRegistry.js";

export async function registerDomainTestRegistryTests({ runCheck, assert }) {
  await runCheck("domain test registry classifies runner checks without hidden runner logic", async () => {
    assert.deepEqual(TEST_DOMAINS, ["unit", "runtime", "risk", "execution", "storage", "dashboard", "safety", "security", "desktop", "integration"]);
    assert.equal(classifyTestDomain("live preflight blocks unsafe config"), "safety");
    assert.equal(classifyTestDomain("dashboard api contract stays stable"), "dashboard");
    assert.equal(classifyTestDomain("sqlite read model rebuilds"), "storage");
    assert.equal(classifyTestDomain("runtime liveness emits incident"), "runtime");
    assert.equal(classifyTestDomain("broker execution intent persists"), "execution");
    assert.equal(classifyTestDomain("risk veto blocker remains visible"), "risk");
    assert.equal(classifyTestDomain("debug secrets redacts tokens"), "security");
    assert.equal(classifyTestDomain("windows gui status renders"), "desktop");
    assert.equal(classifyTestDomain("pure score helper"), "unit");
    assert.deepEqual(resolveRequestedTestDomains({ unit: true, safety: true, storage: true }), ["unit", "storage", "safety"]);
  });
}
