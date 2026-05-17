import fs from "node:fs/promises";
import path from "node:path";

function normalizePath(value = "") {
  return `${value || ""}`.replace(/\\/g, "/");
}

function shouldSkipDir(name = "") {
  return [
    ".git",
    ".lean-ctx",
    "coverage",
    "data",
    "desktop",
    "dist",
    "logs",
    "node_modules",
    "tmp"
  ].includes(name) || /^dist(?:-|$)/i.test(name) || /^dist-new(?:-|$)/i.test(name) || /^win-unpacked$/i.test(name);
}

async function listJavaScriptFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      results.push(...await listJavaScriptFiles(path.join(rootDir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(path.join(rootDir, entry.name));
    }
  }
  return results;
}

function detectOrderCallsite(line = "") {
  const checks = [
    ["live_broker_constructor", /\bnew\s+LiveBroker\s*\(/],
    ["live_broker_extension", /\bextends\s+LiveBroker\b/],
    ["place_order", /(?:\.|\b)placeOrder\s*\(/],
    ["place_oco_order_list", /(?:\.|\b)placeOrderListOco\s*\(/],
    ["cancel_order", /(?:\.|\b)cancelOrder\s*\(/],
    ["cancel_replace_order", /(?:\.|\b)cancelReplaceOrder\s*\(/],
    ["cancel_order_list", /(?:\.|\b)cancelOrderList\s*\(/],
    ["get_order_list", /(?:\.|\b)getOrderList\s*\(/],
    ["submit_order", /(?:\.|\b)submitOrder\s*\(/],
    ["create_order", /(?:\.|\b)createOrder\s*\(/]
  ];
  return checks.find(([, regex]) => regex.test(line))?.[0] || null;
}

function isScannerSelfReference(file, line = "") {
  return file.endsWith("/src/runtime/orderRoutingAudit.js") && (
    line.includes("[\"place_order\"") ||
    line.includes("detectOrderCallsite") ||
    line.includes("placeOrder")
  );
}

export function classifyOrderCallsite({ file = "", snippet = "", kind = "" } = {}) {
  const normalized = normalizePath(file);
  if (normalized.startsWith("test/")) return "TEST_ONLY";
  if (normalized.startsWith("scripts/")) return "DIAGNOSTIC_ONLY";
  if (normalized === "src/runtime/orderRoutingAudit.js") return "DIAGNOSTIC_ONLY";
  if (normalized === "src/runtime/restArchitectureAudit.js") return "DIAGNOSTIC_ONLY";
  if (normalized === "src/exchange/adapters/ExchangeAdapter.js") return "DIAGNOSTIC_ONLY";
  if (normalized.startsWith("src/exchange/adapters/paper/") || normalized === "src/execution/paperBroker.js") {
    return "PAPER_SAFE";
  }
  if (normalized === "src/execution/demoPaperBroker.js") return "DEMO_SAFE";
  if (
    normalized === "src/binance/client.js" ||
    normalized.startsWith("src/exchange/adapters/binance/") ||
    normalized === "src/execution/brokerFactory.js" ||
    normalized === "src/execution/exchangeAdapterContract.js" ||
    normalized === "src/execution/liveBroker.js" ||
    normalized === "src/execution/liveBrokerReconcile.js" ||
    normalized === "src/execution/liveBrokerOrders.js" ||
    kind === "get_order_list" ||
    /\bLiveBroker\b/.test(snippet)
  ) {
    return "LIVE_GATED";
  }
  return "UNSAFE";
}

export async function scanOrderRoutingCallsites({ projectRoot = process.cwd(), limit = 200 } = {}) {
  const roots = ["src", "scripts", "test"].map((name) => path.join(projectRoot, name));
  const files = (await Promise.all(roots.map(listJavaScriptFiles))).flat();
  const callsites = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    const relativeFile = normalizePath(path.relative(projectRoot, filePath));
    content.split(/\r?\n/).forEach((line, index) => {
      if (isScannerSelfReference(relativeFile, line)) return;
      const kind = detectOrderCallsite(line);
      if (!kind) return;
      const snippet = line.trim().slice(0, 220);
      callsites.push({
        file: relativeFile,
        line: index + 1,
        kind,
        classification: classifyOrderCallsite({ file: relativeFile, snippet, kind }),
        snippet
      });
    });
  }
  const classificationCounts = {};
  const kindCounts = {};
  for (const callsite of callsites) {
    classificationCounts[callsite.classification] = (classificationCounts[callsite.classification] || 0) + 1;
    kindCounts[callsite.kind] = (kindCounts[callsite.kind] || 0) + 1;
  }
  const unsafe = callsites.filter((callsite) => callsite.classification === "UNSAFE");
  return {
    status: unsafe.length ? "unsafe" : "ready",
    generatedAt: new Date().toISOString(),
    callsiteCount: callsites.length,
    unsafeCount: unsafe.length,
    classificationCounts,
    kindCounts,
    callsites: callsites.slice(0, limit),
    unsafe: unsafe.slice(0, limit),
    diagnosticsOnly: true,
    liveBehaviorChanged: false
  };
}
