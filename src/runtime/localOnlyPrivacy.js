export function buildLocalOnlyPrivacySummary({ config = {}, providers = [] } = {}) {
  const localOnly = config.localOnlyMode === true;
  const blockedProviders = localOnly ? providers.filter((provider) => provider.required !== true && provider.kind !== "exchange").map((provider) => provider.id) : [];
  return {
    localOnlyMode: localOnly,
    exchangeApiAllowedWhenTrading: true,
    remoteLoggingAllowed: !localOnly,
    cloudTelemetryAllowed: false,
    blockedProviders,
    incidentExportsRemainLocal: true,
    readiness: localOnly && blockedProviders.length ? "local_only_restricted" : "normal"
  };
}
