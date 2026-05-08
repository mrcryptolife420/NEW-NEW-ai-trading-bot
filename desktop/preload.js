import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("tradingBotDesktop", {
  platform: process.platform,
  mode: "dashboard_wrapper"
});
