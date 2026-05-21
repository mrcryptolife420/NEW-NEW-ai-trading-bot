export function renderSafetyPanel(snapshot = {}) {
  const safety = snapshot.safety || snapshot.dashboard?.safety || snapshot.ops?.safety || (snapshot.status || snapshot.blockers || snapshot.reasons ? snapshot : {});
  const status = safety.status || safety.overallStatus || "unknown";
  const reasons = safety.reasons || safety.blockingReasons || safety.blockers || [];
  return [
    `<section id="safety-panel" data-status="${status}">`,
    `<h2>Safety</h2>`,
    `<span id="safety-status">${status}</span>`,
    `<ul id="safety-reasons">${reasons.slice(0, 8).map((reason) => `<li>${reason}</li>`).join("")}</ul>`,
    `</section>`
  ].join("");
}
