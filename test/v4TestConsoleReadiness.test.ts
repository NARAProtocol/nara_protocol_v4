import { expect } from "chai";

import { actionReadiness } from "../tools/v4-test-console/src/readiness.js";

const readyBuy = {
  connected: true,
  onBase: true,
  loading: false,
  intent: "buy" as const,
  amount: 10_000_000n,
  assetBalance: 20_000_000n,
  ethBalance: 1n,
  protocolFeeWei: 0n,
  gasSponsored: false,
};

describe("v4 test console action readiness", function () {
  it("orders connection and network blockers before balance checks", function () {
    expect(actionReadiness({ ...readyBuy, connected: false }).title).to.equal("Connect a wallet");
    expect(actionReadiness({ ...readyBuy, onBase: false }).action).to.equal("switch-base");
    expect(actionReadiness({ ...readyBuy, loading: true }).state).to.equal("checking");
  });

  it("names the exact missing input asset on Base", function () {
    expect(actionReadiness({ ...readyBuy, assetBalance: 9_999_999n })).to.include({
      action: "add-usdc",
      title: "Add USDC on Base",
    });
    expect(actionReadiness({ ...readyBuy, intent: "lock", assetBalance: 0n })).to.include({
      action: "add-nara",
      title: "Add NARA on Base",
    });
  });

  it("does not confuse sponsored gas with an Engine msg.value fee", function () {
    const lock = {
      ...readyBuy,
      intent: "lock" as const,
      protocolFeeWei: 1_000_000_000_000n,
      gasSponsored: true,
    };
    expect(actionReadiness({ ...lock, ethBalance: 0n }).action).to.equal("add-base-eth");
    expect(actionReadiness({ ...lock, ethBalance: lock.protocolFeeWei }).state).to.equal("ready");
  });

  it("requires a positive gas balance for an unsponsored transaction", function () {
    expect(actionReadiness({ ...readyBuy, ethBalance: 0n }).action).to.equal("add-base-eth");
    expect(actionReadiness(readyBuy).state).to.equal("ready");
  });
});
