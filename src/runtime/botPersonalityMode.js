export const BOT_PERSONALITY_MODES = {
  ultra_safe: { riskMultiplier: 0.25, entriesAllowed: true, exitsManaged: true, neuralPermission: "shadow", fastExecutionAllowed: false },
  learning_paper: { riskMultiplier: 0.5, entriesAllowed: true, exitsManaged: true, neuralPermission: "paper", fastExecutionAllowed: false },
  conservative_live: { riskMultiplier: 0.5, entriesAllowed: true, exitsManaged: true, neuralPermission: "limited", fastExecutionAllowed: false, requiresConfirmation: true },
  recovery_mode: { riskMultiplier: 0.15, entriesAllowed: false, exitsManaged: true, neuralPermission: "shadow", fastExecutionAllowed: false },
  high_confidence_only: { riskMultiplier: 0.5, entriesAllowed: true, exitsManaged: true, neuralPermission: "limited", fastExecutionAllowed: false },
  no_new_entries: { riskMultiplier: 0, entriesAllowed: false, exitsManaged: true, neuralPermission: "shadow", fastExecutionAllowed: false },
  exit_management_only: { riskMultiplier: 0, entriesAllowed: false, exitsManaged: true, neuralPermission: "shadow", fastExecutionAllowed: false },
  neural_shadow_only: { riskMultiplier: 0.5, entriesAllowed: true, exitsManaged: true, neuralPermission: "shadow", fastExecutionAllowed: false },
  fast_execution_disabled: { riskMultiplier: 0.75, entriesAllowed: true, exitsManaged: true, neuralPermission: "limited", fastExecutionAllowed: false },
  incident_mode: { riskMultiplier: 0, entriesAllowed: false, exitsManaged: true, neuralPermission: "off", fastExecutionAllowed: false }
};

export function resolveBotPersonalityMode(mode = "learning_paper") {
  const key = `${mode || "learning_paper"}`.trim().toLowerCase();
  const policy = BOT_PERSONALITY_MODES[key] || BOT_PERSONALITY_MODES.learning_paper;
  return {
    mode: BOT_PERSONALITY_MODES[key] ? key : "learning_paper",
    ...policy,
    allowedActions: [
      policy.entriesAllowed ? "open_new_entries" : null,
      policy.exitsManaged ? "manage_exits_and_protection" : null,
      "read_status",
      "write_audit"
    ].filter(Boolean)
  };
}
