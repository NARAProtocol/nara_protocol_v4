import { expect } from "chai";
import {
  recoveryCallPlan,
  recoverySingleTransactionPlan,
} from "../scripts/buildV4EpochRecoveryBatch.js";

describe("v4 epoch recovery Safe batch", function () {
  it("builds the complete five-call plan for a 468-epoch backlog", function () {
    expect(recoveryCallPlan(468n, false)).to.deep.equal([
      { functionName: "advanceEpochs", args: [100n] },
      { functionName: "advanceEpochs", args: [100n] },
      { functionName: "advanceEpochs", args: [100n] },
      { functionName: "advanceEpochs", args: [100n] },
      { functionName: "advanceEpochs", args: [100n] },
    ]);
  });

  it("prepends reserve synchronization only for direct untracked engine funds", function () {
    expect(recoveryCallPlan(1n, true)).to.deep.equal([
      { functionName: "syncEmissionReserve", args: [] },
      { functionName: "advanceEpochs", args: [100n] },
    ]);
  });

  it("refuses an incomplete recovery plan", function () {
    expect(() => recoveryCallPlan(468n, false, 100, 4))
      .to.throw("cannot clear the observed backlog");
  });

  it("builds three direct Safe calls for a 472-epoch backlog", function () {
    expect(recoverySingleTransactionPlan(472n, false)).to.deep.equal([
      { functionName: "advanceEpochs", args: [200n] },
      { functionName: "advanceEpochs", args: [200n] },
      { functionName: "advanceEpochs", args: [200n] },
    ]);
  });
});
