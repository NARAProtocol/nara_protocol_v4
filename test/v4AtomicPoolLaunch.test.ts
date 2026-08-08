import { expect } from "chai";
import { ethers } from "ethers";
import {
  buildAtomicV4PoolLaunch,
  encodeSafeMultiSendTransactions,
} from "../scripts/lib/v4AtomicPoolLaunch.js";
import {
  requireApprovedAtomicLaunchFeeCurves,
  requireAtomicLaunchSafetyState,
  requireCanonicalBaseLaunchInfrastructure,
  requireRewardNotifierHistoryAnchor,
} from "../scripts/buildAtomicV4PoolLaunch.js";
import {
  BASE_PERMIT2,
  BASE_POOL_MANAGER,
  BASE_POSITION_MANAGER,
  BASE_USDC,
} from "../scripts/lib/v4LiveConfig.js";

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

    const packed = encodeSafeMultiSendTransactions(plan.transactions);
    let offset = 0;
    for (const transaction of plan.transactions) {
      expect(Number(ethers.dataSlice(packed, offset, offset + 1))).to.equal(0);
      expect(ethers.getAddress(ethers.dataSlice(packed, offset + 1, offset + 21))).to.equal(transaction.to);
      expect(BigInt(ethers.dataSlice(packed, offset + 21, offset + 53))).to.equal(BigInt(transaction.value));
      const length = Number(BigInt(ethers.dataSlice(packed, offset + 53, offset + 85)));
      expect(ethers.dataSlice(packed, offset + 85, offset + 85 + length)).to.equal(transaction.data);
      offset += 85 + length;
    }
    expect(offset).to.equal(ethers.dataLength(packed));
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

  it("refuses a non-CALL child operation in the Safe MultiSend payload", function () {
    expect(() => encodeSafeMultiSendTransactions([{
      to: NARA,
      value: "0",
      data: "0x",
      operation: 1,
    }])).to.throw("CALL operation 0");
  });

  it("fails closed unless Hook, Vault, Engine, and notifier containment are exact", function () {
    const exact = {
      hookVault: USDC,
      expectedVault: USDC,
      hookPoolManager: BASE_POOL_MANAGER,
      expectedPoolManager: BASE_POOL_MANAGER,
      hookToken: NARA,
      hookBase: BASE_USDC,
      vaultHook: HOOK,
      expectedHook: HOOK,
      engineNara: NARA,
      expectedNara: NARA,
      hookOwner: LP_OWNER,
      vaultOwner: LP_OWNER,
      expectedOwner: LP_OWNER,
      activeRewardNotifierHolders: [],
    };
    expect(() => requireAtomicLaunchSafetyState(exact)).not.to.throw();
    expect(() => requireAtomicLaunchSafetyState({ ...exact, hookVault: NARA }))
      .to.throw("Hook vault binding");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, hookPoolManager: NARA }))
      .to.throw("Hook PoolManager binding");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, hookToken: USDC }))
      .to.throw("Hook token binding");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, hookBase: NARA }))
      .to.throw("Hook base binding");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, vaultHook: NARA }))
      .to.throw("Vault hook binding");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, engineNara: USDC }))
      .to.throw("Engine NARA binding");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, hookOwner: NARA }))
      .to.throw("Hook owner is not V4_ADMIN_ADDRESS");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, vaultOwner: NARA }))
      .to.throw("Vault owner is not V4_ADMIN_ADDRESS");
    expect(() => requireAtomicLaunchSafetyState({ ...exact, activeRewardNotifierHolders: [NARA] }))
      .to.throw("REWARD_NOTIFIER_ROLE must have no active holder");
  });

  it("pins the approval targets and base currency to canonical Base deployments", function () {
    const canonical = {
      base: BASE_USDC,
      permit2: BASE_PERMIT2,
      poolManager: BASE_POOL_MANAGER,
      positionManager: BASE_POSITION_MANAGER,
    };
    expect(() => requireCanonicalBaseLaunchInfrastructure(canonical)).not.to.throw();
    for (const field of ["base", "permit2", "poolManager", "positionManager"] as const) {
      expect(() => requireCanonicalBaseLaunchInfrastructure({ ...canonical, [field]: NARA }))
        .to.throw("canonical Base deployment");
    }
  });

  it("requires the exact approved pre-registration fee curves", function () {
    const buy = [500n, 1_500n, 3_000n, 500n, 800n, 1_200n, 2_000n, 2_000n];
    const sell = [500n, 1_500n, 3_000n, 500n, 700n, 1_000n, 1_500n, 2_000n];
    expect(() => requireApprovedAtomicLaunchFeeCurves(buy, sell)).not.to.throw();
    expect(() => requireApprovedAtomicLaunchFeeCurves([...buy.slice(0, 7), 1_999n], sell))
      .to.throw("buy fee curve");
    expect(() => requireApprovedAtomicLaunchFeeCurves(buy, [...sell.slice(0, 6), 1_501n, 2_000n]))
      .to.throw("sell fee curve");
  });

  it("rejects empty, behind, or fork-mismatched notifier history", function () {
    const anchored = {
      deploymentBlock: 100,
      latestBlock: 101,
      mainDeploymentBlockHash: ethers.keccak256(ethers.toUtf8Bytes("base block")),
      historyDeploymentBlockHash: ethers.keccak256(ethers.toUtf8Bytes("base block")),
      deploymentTransactionBlock: 100,
      deploymentTransactionBlockHash: ethers.keccak256(ethers.toUtf8Bytes("base block")),
      deploymentTransactionSucceeded: true,
      constructorGrantFound: true,
      codeAbsentBeforeDeployment: true,
      codePresentAtDeployment: true,
      history: [{ kind: "grant" as const, account: NARA }],
    };
    expect(() => requireRewardNotifierHistoryAnchor(anchored)).not.to.throw();
    expect(() => requireRewardNotifierHistoryAnchor({ ...anchored, latestBlock: 99 }))
      .to.throw("behind V4_ENGINE_DEPLOYMENT_BLOCK");
    expect(() => requireRewardNotifierHistoryAnchor({ ...anchored, history: [] }))
      .to.throw("constructor grant");
    expect(() => requireRewardNotifierHistoryAnchor({ ...anchored, constructorGrantFound: false }))
      .to.throw("does not prove the constructor notifier grant");
    expect(() => requireRewardNotifierHistoryAnchor({ ...anchored, deploymentTransactionBlock: 99 }))
      .to.throw("does not anchor V4_ENGINE_DEPLOYMENT_BLOCK");
    expect(() => requireRewardNotifierHistoryAnchor({
      ...anchored,
      historyDeploymentBlockHash: ethers.keccak256(ethers.toUtf8Bytes("other block")),
    })).to.throw("does not agree");
  });
});
