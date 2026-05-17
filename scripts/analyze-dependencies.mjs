import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ci = process.argv.includes("--ci");
const sourceRoots = ["src", "test", "scripts"];
const skipDirs = new Set(["node_modules", ".git", "coverage", "dist", "out", "build"]);
const edges = [];
const failures = [];
const warnings = [];

async function exists(file) {
  return fs.stat(file).then((stat) => stat.isFile()).catch(() => false);
}

async function collect(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (/\.(m?js)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

async function resolveRelativeImport(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.json`, path.join(base, "index.js")];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return candidates[0];
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function extractImports(source) {
  const imports = [];
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g)) imports.push({ specifier: match[1], type: "static" });
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) imports.push({ specifier: match[1], type: "dynamic" });
  return imports;
}

for (const folder of sourceRoots) {
  for (const file of await collect(path.join(root, folder))) {
    const source = await fs.readFile(file, "utf8");
    const from = rel(file);
    for (const item of extractImports(source)) {
      const resolved = await resolveRelativeImport(file, item.specifier);
      const to = resolved ? rel(resolved) : item.specifier;
      edges.push({ from, to, type: item.type });
      if (resolved && !(await exists(resolved))) failures.push(`${from}: missing import target ${item.specifier}`);
      if (from.startsWith("src/dashboard/public/") && resolved && !to.startsWith("src/dashboard/public/") && !to.startsWith("src/shared/")) {
        failures.push(`${from}: dashboard public import crosses backend boundary -> ${to}`);
      }
      if (from.startsWith("src/shared/") && /^(node:)?(fs|http|https|path|process)\b/.test(item.specifier)) {
        failures.push(`${from}: shared module imports Node-only ${item.specifier}`);
      }
      if (from.startsWith("src/risk/") && to.startsWith("src/execution/")) warnings.push(`${from}: risk imports execution layer -> ${to}`);
      if (from.startsWith("src/ai/") && /liveBroker/.test(to)) failures.push(`${from}: ai imports live broker -> ${to}`);
      if (from.startsWith("src/storage/") && to.startsWith("src/dashboard/")) failures.push(`${from}: storage imports dashboard layer -> ${to}`);
      if (from.startsWith("src/config/") && to.startsWith("src/runtime/")) failures.push(`${from}: config imports runtime layer -> ${to}`);
    }
  }
}

const outDir = path.join(root, "docs", "debug", "inventory");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "import-graph.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), edges, warnings }, null, 2)}\n`);

if (warnings.length) console.warn(`Dependency warnings:\n${warnings.map((item) => `- ${item}`).join("\n")}`);
if (failures.length) {
  console.error(`Dependency analysis failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log(`Dependency analysis passed (${edges.length} edges${ci ? ", ci" : ""}).`);
