import { redactSecrets } from "../utils/redactSecrets.js";

export function buildReplayTimeline({ candles = [], markers = [], scoreTimeline = [], alerts = [], policyDecisions = [] } = {}) {
  return redactSecrets({
    status: candles.length || markers.length ? "ready" : "empty",
    candles,
    markers: markers.map((marker) => ({ type: marker.type, at: marker.at, price: Number(marker.price ?? 0), label: marker.label || marker.type })),
    scores: scoreTimeline,
    alerts,
    policyDecisions
  });
}

export function exportReplayTimelineJson(timeline = {}) {
  return JSON.stringify(redactSecrets(timeline), null, 2);
}
