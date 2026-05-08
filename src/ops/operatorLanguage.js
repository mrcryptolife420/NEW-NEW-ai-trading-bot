const MESSAGES = {
  exchange_truth_freeze: {
    human: "De bot opent geen nieuwe trades omdat runtime en exchange niet zeker overeenkomen.",
    action: "Open Reconcile Preview en controleer posities, orders en recente fills."
  },
  reconcile_required: {
    human: "Een positie heeft reconcile nodig voordat nieuwe entries veilig zijn.",
    action: "Draai reconcile:plan en voer alleen veilige auto-reconcile acties uit."
  },
  negative_net_expectancy_after_costs: {
    human: "De bruto edge wordt opgegeten door fees, spread of slippage.",
    action: "Bekijk de cost breakdown en wacht op betere liquiditeit of hogere edge."
  }
};

export function translateOperatorReason(code = "unknown") {
  return {
    code,
    ...(MESSAGES[code] || {
      human: "De bot heeft een blocker of waarschuwing die extra controle nodig heeft.",
      action: "Controleer status, doctor en de detailkaart in het dashboard."
    })
  };
}

export function enrichAlertWithOperatorAction(alert = {}) {
  const translated = translateOperatorReason(alert.code || alert.reason || alert.type);
  return { ...alert, whyBlockedHuman: translated.human, operatorAction: translated.action, nextBestAction: translated.action };
}
