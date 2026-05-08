import fs from "node:fs/promises";
import path from "node:path";

function timestampForBackup(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/[.].+$/, "").replace("T", "-");
}

function normalizeEnvKey(key) {
  const normalized = `${key || ""}`.trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
    throw new Error(`Invalid env key: ${key}`);
  }
  return normalized;
}

function normalizeEnvValue(value) {
  const normalized = `${value ?? ""}`;
  if (/[\r\n\0]/.test(normalized)) {
    throw new Error("Env values may not contain newlines or null bytes.");
  }
  return normalized;
}

function normalizeEnvUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [normalizeEnvKey(key), normalizeEnvValue(value)])
  );
}

export function parseEnvText(content = "") {
  const values = {};
  for (const line of `${content || ""}`.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separatorIndex = line.indexOf("=");
    values[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1);
  }
  return values;
}

export async function ensureEnvFile(projectRoot) {
  const envPath = path.join(projectRoot, ".env");
  try {
    await fs.access(envPath);
    return envPath;
  } catch {
    const examplePath = path.join(projectRoot, ".env.example");
    const content = await fs.readFile(examplePath, "utf8");
    await fs.writeFile(envPath, content, "utf8");
    return envPath;
  }
}

export async function readEnvFile(envPath) {
  try {
    return await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function updateEnvFile(envPath, updates) {
  const normalizedUpdates = normalizeEnvUpdates(updates);
  const content = await readEnvFile(envPath);
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const beforeValues = parseEnvText(content);
  const backupPath = content ? `${envPath}.bak-${timestampForBackup()}` : null;
  if (backupPath) {
    await fs.copyFile(envPath, backupPath);
  }
  const lines = content ? content.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(normalizedUpdates));
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return line;
    }
    const separatorIndex = line.indexOf("=");
    const key = line.slice(0, separatorIndex).trim();
    if (seen.has(key) && remaining.has(key)) {
      return null;
    }
    seen.add(key);
    if (!remaining.has(key)) {
      return line;
    }
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of remaining.entries()) {
    nextLines.push(`${key}=${value}`);
  }

  const nextContent = `${nextLines.filter((line) => line != null).join(lineEnding).replace(/(\r?\n)+$/g, "")}${lineEnding}`;
  const tempPath = `${envPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tempPath, nextContent, "utf8");
    await fs.rename(tempPath, envPath);
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true });
    } catch {}
    if (error.code === "EACCES" || error.code === "EPERM") {
      error.publicMessage = `Geen schrijfrechten voor ${envPath}. Kies een user-writable projectmap.`;
    }
    throw error;
  }
  const afterValues = parseEnvText(await readEnvFile(envPath));
  const mismatches = Object.entries(normalizedUpdates)
    .filter(([key, value]) => afterValues[key] !== value)
    .map(([key]) => key);
  return {
    envPath,
    backupPath,
    updates: normalizedUpdates,
    before: Object.fromEntries(Object.keys(normalizedUpdates).map((key) => [key, beforeValues[key] ?? null])),
    after: Object.fromEntries(Object.keys(normalizedUpdates).map((key) => [key, afterValues[key] ?? null])),
    writeVerified: mismatches.length === 0,
    mismatches
  };
}

export async function verifyEnvUpdates(envPath, updates) {
  const normalizedUpdates = normalizeEnvUpdates(updates);
  const values = parseEnvText(await readEnvFile(envPath));
  const mismatches = Object.entries(normalizedUpdates)
    .filter(([key, value]) => values[key] !== value)
    .map(([key]) => key);
  return { envPath, writeVerified: mismatches.length === 0, mismatches };
}
