import { redactSecrets } from "../utils/redactSecrets.js";

const ALLOWED_EVENT_TYPES = new Set([
  "bot_status",
  "market_tick",
  "hot_candidate",
  "entry_queue_update",
  "execution_intent_update",
  "position_update",
  "alert_update",
  "latency_update",
  "stream_health_update",
  "heartbeat"
]);

export class DashboardEventBus {
  constructor({ maxHistory = 100 } = {}) {
    this.maxHistory = Math.max(1, Number(maxHistory) || 100);
    this.clients = new Set();
    this.history = [];
  }

  publish(type, payload = {}) {
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: ALLOWED_EVENT_TYPES.has(type) ? type : "heartbeat",
      at: new Date().toISOString(),
      payload: redactSecrets(payload)
    };
    this.history.push(event);
    this.history = this.history.slice(-this.maxHistory);
    for (const client of this.clients) {
      client.write(`id: ${event.id}\n`);
      client.write(`event: ${event.type}\n`);
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    return event;
  }

  subscribe(response) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.write(": connected\n\n");
    this.clients.add(response);
    return () => {
      this.clients.delete(response);
    };
  }

  summary() {
    return {
      status: "ready",
      clientCount: this.clients.size,
      historyCount: this.history.length,
      lastEvent: this.history[this.history.length - 1] || null
    };
  }
}

export function buildSseEventPayload(type, payload = {}) {
  return {
    type: ALLOWED_EVENT_TYPES.has(type) ? type : "heartbeat",
    payload: redactSecrets(payload),
    secretsRedacted: true
  };
}
