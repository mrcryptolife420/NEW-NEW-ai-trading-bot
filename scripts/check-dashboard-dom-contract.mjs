import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, "src", "dashboard", "public");
const html = await fs.readFile(path.join(publicDir, "index.html"), "utf8");
const app = await fs.readFile(path.join(publicDir, "app.js"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const idCounts = ids.reduce((counts, id) => counts.set(id, (counts.get(id) || 0) + 1), new Map());
const requested = new Set();

for (const match of app.matchAll(/(?:querySelector|q)\(\s*["']#([A-Za-z][\w:-]*)["']\s*\)/g)) {
  requested.add(match[1]);
}
for (const match of app.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
  requested.add(match[1]);
}

const failures = [];
for (const id of requested) {
  if (!idCounts.has(id)) failures.push(`app.js references missing #${id}`);
}
for (const [id, count] of idCounts) {
  if (count > 1) failures.push(`index.html duplicates #${id} (${count} times)`);
}
for (const match of html.matchAll(/<button\b([^>]*)>/g)) {
  if (!/\btype=["']button["']/.test(match[1])) failures.push("button without type=\"button\"");
}
if (!/<script\b[^>]*type=["']module["'][^>]*src=["']\/app\.js["']/.test(html)) {
  failures.push("index.html does not load /app.js as a module");
}
if (!/<link\b[^>]*href=["']\/styles\.css["']/.test(html)) {
  failures.push("index.html does not load /styles.css");
}
if (!/\/api\/live\/preflight/.test(app) || !/requestLiveMode/.test(app)) {
  failures.push("live mode button is not gated by /api/live/preflight");
}

if (failures.length) {
  console.error(`Dashboard DOM contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log(`Dashboard DOM contract passed (${ids.length} ids, ${requested.size} app references).`);
