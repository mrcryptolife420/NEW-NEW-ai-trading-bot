import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const roots = ["src", "test", "scripts"];
const files = [];

async function collect(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "coverage") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(fullPath);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) files.push(fullPath);
  }
}

for (const folder of roots) await collect(path.join(root, folder));

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}\n${result.stderr || result.stdout}`);
}

if (failures.length) {
  console.error(`Syntax check failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Syntax check passed (${files.length} files).`);
