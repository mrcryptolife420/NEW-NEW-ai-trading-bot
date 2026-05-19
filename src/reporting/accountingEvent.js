import crypto from "node:crypto";

function normalizeAccountingEvents(events = []) {
  return events.map((event, index) => ({
    id: String(event.id || `accounting-${index + 1}`),
    mode: String(event.mode || "paper"),
    symbol: String(event.symbol || "UNKNOWN"),
    side: String(event.side || "BUY").toUpperCase(),
    quantity: Math.max(0, Number(event.quantity || event.qty || 0)),
    price: Math.max(0, Number(event.price || 0)),
    fee: Math.max(0, Number(event.fee || 0)),
    timestamp: new Date(event.timestamp || 0).toISOString()
  }));
}

function buildTaxLotsFifo(events = []) {
  const lots = [];
  const inventory = new Map();
  for (const event of normalizeAccountingEvents(events)) {
    const key = `${event.mode}:${event.symbol}`;
    const queue = inventory.get(key) || [];
    if (event.side === "BUY") {
      queue.push({ quantity: event.quantity, price: event.price, timestamp: event.timestamp, mode: event.mode, symbol: event.symbol });
    } else {
      let remaining = event.quantity;
      while (remaining > 0 && queue.length > 0) {
        const lot = queue[0];
        const matched = Math.min(remaining, lot.quantity);
        lots.push({
          mode: event.mode,
          symbol: event.symbol,
          quantity: matched,
          costBasis: matched * lot.price,
          proceeds: matched * event.price,
          realizedPnl: matched * (event.price - lot.price)
        });
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= 0) queue.shift();
      }
    }
    inventory.set(key, queue);
  }
  return lots;
}

function buildAccountingExportManifest(events = []) {
  const normalized = normalizeAccountingEvents(events);
  const payload = JSON.stringify(normalized);
  return {
    count: normalized.length,
    modes: [...new Set(normalized.map((event) => event.mode))].sort(),
    sha256: crypto.createHash("sha256").update(payload).digest("hex")
  };
}

function verifyAccountingExport(events = [], manifest = {}) {
  const rebuilt = buildAccountingExportManifest(events);
  return {
    ok: rebuilt.count === manifest.count && rebuilt.sha256 === manifest.sha256,
    rebuilt
  };
}

export { normalizeAccountingEvents, buildTaxLotsFifo, buildAccountingExportManifest, verifyAccountingExport };
