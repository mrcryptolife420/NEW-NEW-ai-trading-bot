import { scanOrderRoutingCallsites } from "../src/runtime/orderRoutingAudit.js";

const audit = await scanOrderRoutingCallsites({ projectRoot: process.cwd() });

if (audit.unsafeCount > 0) {
  console.error(JSON.stringify(audit, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(audit, null, 2));
