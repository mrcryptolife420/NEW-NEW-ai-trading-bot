import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const ci = process.argv.includes("--ci");
const includeLocalEnv = process.argv.includes("--include-local-env");
const skipDirs = new Set([".git", "node_modules", "coverage", "dist", "out", "build", "data", "logs", "tmp"]);
const scanExts = new Set([".env", ".example", ".log", ".json", ".js", ".mjs", ".md", ".txt", ".yml", ".yaml", ".cmd", ".ps1"]);
const allowValue = /^(changeme|change_me|example|dummy|placeholder|redacted|test|sk-test|your_|<|""|'')/i;
const findings = [];

const rules = [
  { id: "private_key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: "bearer_token", regex: /\bBearer\s+([A-Za-z0-9._~+/=-]{24,})/g },
  { id: "webhook_url", regex: /https:\/\/(?:hooks\.slack\.com|discord(?:app)?\.com\/api\/webhooks)\/[^\s"'<>]+/g },
  { id: "assigned_secret", regex: /^\s*([A-Z0-9_]*(?:API_KEY|API_SECRET|SECRET|TOKEN|WEBHOOK_URL)[A-Z0-9_]*)\s*=\s*([^\s#'"]{16,})/g }
];

async function collect(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env" && entry.name !== ".env.example" && entry.name !== ".github") continue;
    if (skipDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else {
      const rel = path.relative(root, fullPath).replace(/\\/g, "/");
      if (rel.startsWith("desktop/dist") || rel.includes("/win-unpacked/")) continue;
      if (!includeLocalEnv && (rel === ".env" || /^\.env\.(?!example$)/.test(rel))) continue;
      const ext = entry.name === ".env" ? ".env" : path.extname(entry.name);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (scanExts.has(ext) && stat?.size <= 2_000_000) files.push(fullPath);
    }
  }
  return files;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

for (const file of await collect(root)) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const content = await fs.readFile(file, "utf8").catch(() => "");
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(line))) {
        const value = match[2] || match[1] || match[0];
        if (allowValue.test(value)) continue;
        if (rel.startsWith("test/") && /\b(SECRET|TOKEN|plain-secret|plain-key)\b/i.test(value)) continue;
        if (/\b(false|true|null|undefined)\b/i.test(value)) continue;
        findings.push({ file: rel, line: index + 1, rule: rule.id, fingerprint: fingerprint(value) });
      }
    }
  }
}

if (findings.length) {
  console.error(`Secret scan found ${findings.length} suspicious value(s):\n${findings.map((item) => `- ${item.file}:${item.line} ${item.rule} ${item.fingerprint}`).join("\n")}`);
  if (ci) process.exit(1);
}

console.log(`Secret scan passed (${findings.length} suspicious value${findings.length === 1 ? "" : "s"}).`);
