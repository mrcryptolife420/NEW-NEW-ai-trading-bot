import { coreDefaults } from "./core.js";
import { riskDefaults } from "./risk.js";
import { marketDataDefaults } from "./marketData.js";
import { aiDefaults } from "./ai.js";
import { paperLearningDefaults } from "./paperLearning.js";
import { liveExecutionDefaults } from "./liveExecution.js";
import { dashboardDefaults } from "./dashboard.js";
import { recorderDefaults } from "./recorder.js";
import { serviceDefaults } from "./service.js";

export const DEFAULTS = {
  ...coreDefaults,
  ...riskDefaults,
  ...marketDataDefaults,
  ...aiDefaults,
  ...paperLearningDefaults,
  ...liveExecutionDefaults,
  ...dashboardDefaults,
  ...recorderDefaults,
  ...serviceDefaults
};

export default DEFAULTS;
