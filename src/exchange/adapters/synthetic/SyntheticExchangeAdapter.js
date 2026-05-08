import { PaperExchangeAdapter } from "../paper/PaperExchangeAdapter.js";

export class SyntheticExchangeAdapter extends PaperExchangeAdapter {
  constructor(options = {}) {
    super(options);
    this.id = "synthetic";
    this.mode = "synthetic";
    this.capabilities = { liveTrading: false, userStream: false, marketStream: true, deterministicData: true };
  }
}
