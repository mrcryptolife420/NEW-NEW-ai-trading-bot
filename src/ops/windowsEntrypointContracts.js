const ENTRYPOINTS = [
  {
    file: "Start-Everything.cmd",
    startsDashboard: true,
    startsBot: true,
    opensBrowser: true,
    waitsForHealth: true,
    expectedFailureMode: "actionable_console_error"
  },
  {
    file: "Start-Dashboard.cmd",
    startsDashboard: true,
    startsBot: false,
    opensBrowser: true,
    waitsForHealth: true,
    expectedFailureMode: "actionable_console_error"
  },
  {
    file: "Start-BotService.cmd",
    startsDashboard: false,
    startsBot: true,
    opensBrowser: false,
    waitsForHealth: false,
    expectedFailureMode: "actionable_console_error"
  },
  {
    file: "Install-Windows11.cmd",
    startsDashboard: false,
    startsBot: false,
    opensBrowser: false,
    waitsForHealth: false,
    expectedFailureMode: "actionable_console_error"
  }
];

export function listWindowsEntrypointContracts() {
  return ENTRYPOINTS.map((entrypoint) => ({ ...entrypoint }));
}

export function validateWindowsEntrypointScript(fileName, scriptText = "") {
  const contract = ENTRYPOINTS.find((entrypoint) => entrypoint.file.toLowerCase() === `${fileName}`.toLowerCase());
  if (!contract) {
    return { valid: false, reason: "unknown_entrypoint" };
  }
  const text = `${scriptText}`;
  const checks = {
    usesNodeOrNpm: /node|npm\.cmd|npm /i.test(text),
    browserWhenExpected: !contract.opensBrowser || /firefox|chrome|msedge|Start-Process/i.test(text),
    healthWhenExpected: !contract.waitsForHealth || /health|api\/status|api\/snapshot|runState/i.test(text),
    noSilentExitSuccess: !/exit\s+\/b\s+0\s*$/im.test(text.trim())
  };
  return {
    valid: Object.values(checks).every(Boolean),
    file: contract.file,
    checks
  };
}
