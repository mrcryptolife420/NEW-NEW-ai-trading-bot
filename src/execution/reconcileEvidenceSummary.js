function arr(value) {
  return Array.isArray(value) ? value : [];
}

function sourceStatus(name, available, stale = false) {
  return {
    source: name,
    available: Boolean(available),
    stale: Boolean(stale)
  };
}

export function buildReconcileEvidenceSummary(input = {}) {
  const evidence = input.evidence || input || {};
  const decision = input.decision || evidence.decision || (evidence.qtyWithinTolerance ? "FLAT_CONFIRMED" : "NEEDS_REVIEW");
  const conflicts = [];
  if (evidence.qtyWithinTolerance === false || Number(evidence.quantityDiff || 0) > Number(evidence.quantityTolerance || 0)) {
    conflicts.push("quantity_mismatch");
  }
  if (evidence.priceMismatchBps !== undefined && Number(evidence.priceMismatchBps) > 0) {
    conflicts.push("price_mismatch");
  }
  if (evidence.openOrderCount > 0 || evidence.unexpectedOrderCount > 0) {
    conflicts.push("open_or_unexpected_orders");
  }
  if (evidence.protectionMissing || evidence.missingLinkedProtection) {
    conflicts.push("protection_missing");
  }
  if (arr(evidence.snapshotErrors).length || evidence.restUnavailable || evidence.missingRestData) {
    conflicts.push("missing_rest_data");
  }
  if (evidence.userStreamStale || evidence.staleUserStream) {
    conflicts.push("stale_user_stream");
  }

  const manualReviewRequired = Boolean(
    input.manualReviewRequired
    || input.autonomyState === "manual_review_required"
    || `${decision || ""}`.toUpperCase().includes("MANUAL_REVIEW")
    || conflicts.includes("quantity_mismatch")
    || conflicts.includes("missing_rest_data")
  );

  return {
    decision,
    confidence: Number.isFinite(Number(input.confidence ?? evidence.confidence)) ? Number(input.confidence ?? evidence.confidence) : null,
    evidenceSources: [
      sourceStatus("runtime", evidence.runtimeQuantity !== undefined || evidence.runtimeNotional !== undefined),
      sourceStatus("exchange_rest", evidence.exchangeQuantity !== undefined || evidence.exchangeTotalQuantity !== undefined, evidence.restStale),
      sourceStatus("user_stream", evidence.userStreamQuantity !== undefined || evidence.userStreamLastUpdateAt !== undefined, evidence.userStreamStale || evidence.staleUserStream),
      sourceStatus("open_orders", evidence.openOrderCount !== undefined || evidence.unexpectedOrderCount !== undefined)
    ],
    conflicts: [...new Set(conflicts)],
    recommendedAction: manualReviewRequired
      ? "manual_review_reconcile_before_new_entries"
      : conflicts.length
        ? "review_reconcile_evidence"
        : "no_operator_action_required",
    manualReviewRequired
  };
}
