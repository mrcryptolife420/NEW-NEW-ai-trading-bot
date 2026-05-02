export const serviceDefaults = {
  "enableCanaryLiveMode": true,
  "canaryLiveTradeCount": 5,
  "canaryLiveSizeMultiplier": 0.35,
  "serviceRestartDelaySeconds": 8,
  "serviceRestartBackoffMultiplier": 1.8,
  "serviceRestartMaxDelaySeconds": 180,
  "serviceStatusFilename": "service-status.json",
  "serviceMaxRestartsPerHour": 20
};
