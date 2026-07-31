import { expect } from "chai";
import { ethers } from "ethers";
import { buildAtomicV4PoolLaunch } from "../scripts/lib/v4AtomicPoolLaunch.js";

const NARA = "0x0000000000000000000000000000000000001001";
const USDC = "0x0000000000000000000000000000000000001002";
const PERMIT2 = "0x0000000000000000000000000000000000001003";
const POSITION_MANAGER = "0x0000000000000000000000000000000000001004";
const HOOK = "0x0000000000000000000000000000000000002088";
const LP_OWNER = "0x0000000000000000000000000000000000001005";

describe("atomic v4 pool launch batch", function () {
  it("places registration immediately before atomic initialize-and-mint and revokes every approval", function () {
    const plan = buildAtomicV4PoolLaunch({
      nara: NARA,
      usdc: USDC,
      permit2: PERMIT2,
      positionManager: POSITION_MANAGER,
      hook: HOOK,
      lpOwner: LP_OWNER,
      fee: 3000,
      tickSpacing: 60,
      naraAmount: ethers.parseUnits("60000", 18),
      usdcAmount: ethers.parseUnits("300", 6),
      deadline: 2_000_000_000n,
    });

    expect(plan.transactions).to.have.length(10);
    expect(plan.poolId).to.equal(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,address)"],
          [plan.poolKey],
        ),
      ),
    );
    expect(plan.transactions[4].to).to.equal(ethers.getAddress(HOOK));
    expect(plan.transactions[5].to).to.equal(ethers.getAddress(POSITION_MANAGER));

    const hook = new ethers.Interface([
      "function registerPool((address,address,uint24,int24,address),uint160)",
    ]);
    expect(hook.parseTransaction({ data: plan.transactions[4].data })?.name).to.equal("registerPool");

    const positionManager = new ethers.Interface(["function multicall(bytes[])"]);
    const outer = positionManager.decodeFunctionData("multicall", plan.transactions[5].data);
    expect(outer[0]).to.have.length(2);
    const inner = new ethers.Interface([
      "function initializePool((address,address,uint24,int24,address),uint160)",
      "function modifyLiquidities(bytes,uint256)",
    ]);
    expect(inner.parseTransaction({ data: outer[0][0] })?.name).to.equal("initializePool");
    expect(inner.parseTransaction({ data: outer[0][1] })?.name).to.equal("modifyLiquidities");

    const permit2 = new ethers.Interface([
      "function approve(address,address,uint160,uint48)",
    ]);
    for (const index of [6, 7]) {
      const decoded = permit2.decodeFunctionData("approve", plan.transactions[index].data);
      expect(decoded[2]).to.equal(0n);
      expect(decoded[3]).to.equal(0n);
    }
    const erc20 = new ethers.Interface(["function approve(address,uint256)"]);
    for (const index of [8, 9]) {
      const decoded = erc20.decodeFunctionData("approve", plan.transactions[index].data);
      expect(decoded[1]).to.equal(0n);
    }
  });

  it("fails closed on zero or Permit2-oversized seed amounts", function () {
    const base = {
      nara: NARA,
      usdc: USDC,
      permit2: PERMIT2,
      positionManager: POSITION_MANAGER,
      hook: HOOK,
      lpOwner: LP_OWNER,
      fee: 3000,
      tickSpacing: 60,
      deadline: 2_000_000_000n,
    };
    expect(() => buildAtomicV4PoolLaunch({ ...base, naraAmount: 0n, usdcAmount: 1n }))
      .to.throw("Seed amounts must be positive");
    expect(() => buildAtomicV4PoolLaunch({ ...base, naraAmount: 1n << 160n, usdcAmount: 1n }))
      .to.throw("Permit2 uint160 capacity");
  });
});
