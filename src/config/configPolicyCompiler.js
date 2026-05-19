const SECRET_PATTERN = /(KEY|SECRET|TOKEN|PASSWORD)/i;

function compileConfigPolicy(schema = {}) {
  return Object.entries(schema).map(([key, rule]) => ({
    key,
    type: rule.type || "string",
    required: Boolean(rule.required),
    secret: SECRET_PATTERN.test(key) || Boolean(rule.secret),
    defaultValue: rule.defaultValue
  }));
}

function buildEnvTransaction({ before = {}, after = {}, policy = [] } = {}) {
  const policyByKey = new Map(policy.map((item) => [item.key, item]));
  const changes = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) {
      const secret = policyByKey.get(key)?.secret || SECRET_PATTERN.test(key);
      changes.push({
        key,
        before: secret ? "[redacted]" : before[key],
        after: secret ? "[redacted]" : after[key],
        secret
      });
    }
  }
  return { changes, rollback: changes.map((change) => ({ key: change.key, value: before[change.key] })) };
}

function previewEnvRollback(transaction = {}) {
  return {
    changes: (transaction.rollback || []).map((item) => ({ key: item.key, value: SECRET_PATTERN.test(item.key) ? "[redacted]" : item.value })),
    mutatesEnv: false
  };
}

export { compileConfigPolicy, buildEnvTransaction, previewEnvRollback };
