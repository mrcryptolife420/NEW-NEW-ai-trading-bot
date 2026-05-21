import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inventoryCandidates = [
  "docs/debug/INVENTORY_SUMMARY.md",
  "docs/debug/inventory/api-routes.json"
];
const watchedDirs = ["src", "test", "scripts"];
const watchedFiles = ["package.json"];

async function latestMtime(target) {
  const full = path.join(root, target);
  const stat = await fs.stat(full).catch(() => null);
  if (!stat) return 0;
  if (stat.isFile()) return stat.mtimeMs;
  if (!stat.isDirectory()) return 0;
  const entries = await fs.readdir(full, { withFileTypes: true }).catch(() => []);
  let latest = stat.mtimeMs;
  for (const entry of entries) {
    if (["node_modules", ".git", "coverage", "data"].includes(entry.name)) continue;
    latest = Math.max(latest, await latestMtime(path.join(target, entry.name)));
  }
  return latest;
}

const inventoryStats = await Promise.all(inventoryCandidates.map(async (file) => ({ file, mtime: await latestMtime(file) })));
const newestInventory = inventoryStats.sort((a, b) => b.mtime - a.mtime)[0];
const watched = [...watchedDirs, ...watchedFiles];
let newestWatched = { file: null, mtime: 0 };
for (const item of watched) {
  const mtime = await latestMtime(item);
  if (mtime > newestWatched.mtime) newestWatched = { file: item, mtime };
}

if (!newestInventory?.mtime) {
  console.error("Debug inventory freshness check failed: no inventory file found.");
  process.exit(1);
}
if (newestInventory.mtime + 1000 < newestWatched.mtime) {
  console.error(`Debug inventory freshness check failed: ${newestInventory.file} is older than ${newestWatched.file}. Run npm run debug:inventory.`);
  process.exit(1);
}
console.log(`Debug inventory freshness check passed (${newestInventory.file}).`);
