import fs from "node:fs/promises";
import path from "node:path";

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

async function listRoadmapFiles(projectRoot) {
  const dirs = [path.join(projectRoot, "docs"), path.join(projectRoot, "docs", "voltooid")];
  const files = [];
  for (const dir of dirs) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile() && /^roadmap-.*\.md$/i.test(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function extractMentions(markdown = "") {
  const mentionedFiles = [...new Set([...markdown.matchAll(/`((?:src|test|scripts|docs)\/[^`]+)`/g)].map((match) => match[1]))].sort();
  const mentionedTests = mentionedFiles.filter((file) => file.startsWith("test/") || file.includes(".tests."));
  return { mentionedFiles, mentionedTests };
}

async function testFileExists(projectRoot, testPath) {
  if (/[{}*?[\]]/.test(testPath)) return true;
  return fs.stat(path.join(projectRoot, testPath)).then((stat) => stat.isFile()).catch(() => false);
}

async function buildRoadmapTraceabilityFromFiles({ projectRoot = process.cwd() } = {}) {
  const files = await listRoadmapFiles(projectRoot);
  const roadmaps = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8").catch(() => "");
    const rel = path.relative(projectRoot, file).replace(/\\/g, "/");
    const { mentionedFiles, mentionedTests } = extractMentions(content);
    const missingTests = [];
    for (const testPath of mentionedTests) {
      if (!(await testFileExists(projectRoot, testPath))) missingTests.push(testPath);
    }
    if (!mentionedTests.length) missingTests.push("no_tests_mentioned");
    roadmaps.push({
      file: rel,
      status: rel.includes("docs/voltooid/") ? "completed" : "open",
      mentionedFiles,
      mentionedTests,
      missingTests
    });
  }
  return { schemaVersion: 1, status: "ok", roadmapCount: roadmaps.length, roadmaps };
}

export { buildRuntimeArchitectureMap, buildArchitectureMarkdown, buildRoadmapTraceability, buildRoadmapTraceabilityFromFiles };
