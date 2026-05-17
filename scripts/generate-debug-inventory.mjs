import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const outDir = path.join(root, "docs", "debug", "inventory");
const skipDirs = new Set([".git", "node_modules", "coverage", "dist", "out", "build", "data", "logs", "tmp"]);
const textExts = new Set([".js", ".mjs", ".json", ".md", ".txt", ".html", ".css", ".cmd", ".ps1", ".yml", ".yaml", ".example", ".env"]);
const files = [];

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function countLinesIfText(file, entryName, size) {
  const ext = entryName === ".env" ? ".env" : path.extname(entryName);
  if (!textExts.has(ext) || size > 2_000_000) return null;
  const content = await fs.readFile(file, "utf8");
  return content.split(/\r?\n/).length;
}

async function collect(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (skipDirs.has(entry.name) || entry.name.startsWith("dist-new") || entry.name.startsWith("tmp")) continue;
    const fullPath = path.join(dir, entry.name);
    if (fullPath.startsWith(path.join(root, "docs", "debug"))) continue;
    if (entry.isDirectory()) {
      await collect(fullPath);
    } else {
      const stat = await fs.stat(fullPath);
      const lineCount = await countLinesIfText(fullPath, entry.name, stat.size);
      files.push({
        path: path.relative(root, fullPath).replace(/\\/g, "/"),
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
        hash: await hashFile(fullPath),
        type: path.extname(entry.name).slice(1) || "none",
        emptyClass: stat.size === 0 ? (fullPath.includes(`${path.sep}tmp${path.sep}`) ? "allowed_empty" : "warning") : null,
        lineCount,
        largeFileReview: lineCount != null && lineCount > 800
      });
    }
  }
}

function extractExports(file, source) {
  const exports = [];
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) {
    exports.push({ file, name: match[1], type: "named" });
  }
  if (/export\s+default\b/.test(source)) exports.push({ file, name: "default", type: "default" });
  return exports;
}

function extractImports(file, source) {
  const imports = [];
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g)) {
    imports.push({ from: file, to: match[1], type: "static" });
  }
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    imports.push({ from: file, to: match[1], type: "dynamic" });
  }
  return imports;
}

await collect(root);
await fs.mkdir(outDir, { recursive: true });

const jsFiles = files.filter((file) => /\.(m?js)$/.test(file.path));
const exportsIndex = [];
const importsIndex = [];
for (const file of jsFiles) {
  const source = await fs.readFile(path.join(root, file.path), "utf8");
  exportsIndex.push(...extractExports(file.path, source));
  importsIndex.push(...extractImports(file.path, source));
}

const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const html = await fs.readFile(path.join(root, "src", "dashboard", "public", "index.html"), "utf8");
const app = await fs.readFile(path.join(root, "src", "dashboard", "public", "app.js"), "utf8");
const server = await fs.readFile(path.join(root, "src", "dashboard", "server.js"), "utf8");
const envExample = await fs.readFile(path.join(root, ".env.example"), "utf8");

const dashboardDom = {
  ids: [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
  requestedIds: [...new Set([...app.matchAll(/(?:querySelector|q)\(\s*["']#([A-Za-z][\w:-]*)["']\s*\)/g)].map((match) => match[1]))]
};
const apiRoutes = [
  ...server.matchAll(/request\.method\s*={2,3}\s*"([A-Z]+)"\s*&&\s*url\.pathname\s*={2,3}\s*"([^"]+)"/g)
].map((match) => ({ method: match[1], path: match[2] }));
const envKeys = [...envExample.matchAll(/^\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
const testFiles = files.filter((file) => /\.(test|tests)\.js$/i.test(file.path)).map((file) => file.path);

await fs.writeFile(path.join(outDir, "files.json"), `${JSON.stringify(files, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "exports.json"), `${JSON.stringify(exportsIndex, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "import-graph.json"), `${JSON.stringify({ edges: importsIndex }, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "scripts.json"), `${JSON.stringify(packageJson.scripts || {}, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "dashboard-dom.json"), `${JSON.stringify(dashboardDom, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "api-routes.json"), `${JSON.stringify({ routes: apiRoutes }, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "env-keys.json"), `${JSON.stringify(envKeys, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "test-coverage-map.json"), `${JSON.stringify({ testFiles }, null, 2)}\n`);

const summary = [
  "# Debug Inventory Summary",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Files: ${files.length}`,
  `JS modules: ${jsFiles.length}`,
  `Imports: ${importsIndex.length}`,
  `Exports: ${exportsIndex.length}`,
  `Package scripts: ${Object.keys(packageJson.scripts || {}).length}`,
  `Dashboard DOM ids: ${dashboardDom.ids.length}`,
  `Dashboard API GET routes: ${apiRoutes.filter((route) => route.method === "GET").length}`,
  `Env keys in .env.example: ${envKeys.length}`,
  `Discovered test files: ${testFiles.length}`,
  "",
  "Large files over 800 lines:",
  ...files.filter((file) => file.largeFileReview).map((file) => `- ${file.path}`)
];
await fs.mkdir(path.join(root, "docs", "debug"), { recursive: true });
await fs.writeFile(path.join(root, "docs", "debug", "INVENTORY_SUMMARY.md"), `${summary.join("\n")}\n`);

console.log(`Debug inventory generated (${files.length} files).`);
