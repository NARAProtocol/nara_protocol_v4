import { expect } from "chai";
import { ethers } from "ethers";
import {
  BASE_CHAIN_ID,
  CANONICAL_ACTIVE_LIQUIDITY_STACK,
  CANONICAL_CUSTODY_SAFE,
  CANONICAL_COMPOUND_KEEPER,
  CANONICAL_SAFE_OWNERS,
  CANONICAL_SAFE_RUNTIME_CODE_HASH,
  RECOVERY_DELAY_SECONDS,
  SAFE_MODULE_SENTINEL,
  WIND_DOWN_RECOVERY_KIND,
  decodePositionTicks,
  encodeMultiSendCalls,
  fullDecreaseUnlockData,
  naraToUsdcSpotRaw,
  positionFeesFromGrowth,
  recoveryEtaProjection,
  recoveryProposalCallPlan,
  sqrtPriceAtTick,
  validateRecoveryProposalState,
  type RecoveryProposalValidationInput,
} from "../scripts/buildV4LiquidityStackRecoveryProposal.js";

const addresses = {
  safe: CANONICAL_CUSTODY_SAFE,
  vault: CANONICAL_ACTIVE_LIQUIDITY_STACK.vault,
  hook: CANONICAL_ACTIVE_LIQUIDITY_STACK.hook,
  compounder: CANONICAL_ACTIVE_LIQUIDITY_STACK.compounder,
  nara: CANONICAL_ACTIVE_LIQUIDITY_STACK.nara,
  usdc: CANONICAL_ACTIVE_LIQUIDITY_STACK.usdc,
  poolManager: CANONICAL_ACTIVE_LIQUIDITY_STACK.poolManager,
  positionManager: CANONICAL_ACTIVE_LIQUIDITY_STACK.positionManager,
  keeper: CANONICAL_COMPOUND_KEEPER,
  ownerA: CANONICAL_SAFE_OWNERS[0],
  ownerB: CANONICAL_SAFE_OWNERS[1],
  ownerC: CANONICAL_SAFE_OWNERS[2],
};

function validState(): RecoveryProposalValidationInput {
  return {
    chainId: BASE_CHAIN_ID,
    expected: {
      ...addresses,
      seedPositionTokenId: CANONICAL_ACTIVE_LIQUIDITY_STACK.seedPositionTokenId,
      poolId: CANONICAL_ACTIVE_LIQUIDITY_STACK.poolId,
      poolFee: CANONICAL_ACTIVE_LIQUIDITY_STACK.poolFee,
      tickSpacing: CANONICAL_ACTIVE_LIQUIDITY_STACK.tickSpacing,
    },
    safe: {
      runtimeCodeHash: CANONICAL_SAFE_RUNTIME_CODE_HASH,
      version: "1.4.1",
      threshold: 2n,
      owners: [addresses.ownerA, addresses.ownerB, addresses.ownerC],
      modules: [],
      nextModule: SAFE_MODULE_SENTINEL,
      erc721ReceiverSelector: "0x150b7a02",
    },
    owners: {
      vault: addresses.safe,
      hook: addresses.safe,
      compounder: addresses.safe,
    },
    runtimeCodeHashes: { ...CANONICAL_ACTIVE_LIQUIDITY_STACK.runtimeCodeHashes },
    vault: {
      token: addresses.nara,
      base: addresses.usdc,
      hook: addresses.hook,
      compounder: addresses.compounder,
      routeMode: 0n,
      compounderFrozen: true,
      keeperAuthorized: true,
    },
    hook: {
      token: addresses.nara,
      base: addresses.usdc,
      vault: addresses.vault,
      poolRegistered: true,
    },
    compounder: {
      vault: addresses.vault,
      nara: addresses.nara,
      usdc: addresses.usdc,
      poolManager: addresses.poolManager,
      positionManager: addresses.positionManager,
      positionTokenId: CANONICAL_ACTIVE_LIQUIDITY_STACK.compounderPositionTokenId,
      positionOwner: addresses.compounder,
      positionLiquidity: 200n,
      totalLiquidityAdded: 200n,
      recoveryDelay: RECOVERY_DELAY_SECONDS,
      pendingRecovery: { kind: 0n, to: "0x0000000000000000000000000000000000000000", eta: 0n },
    },
    seedPosition: {
      tokenId: CANONICAL_ACTIVE_LIQUIDITY_STACK.seedPositionTokenId,
      owner: addresses.safe,
      liquidity: 1_000n,
    },
  };
}

describe("v4 liquidity-stack recovery proposal builder", function () {
  it("builds only keeper revocation followed by a WindDown proposal to the Safe", function () {
    expect(recoveryProposalCallPlan({
      safe: addresses.safe,
      vault: addresses.vault,
      compounder: addresses.compounder,
      keeper: addresses.keeper,
    })).to.deep.equal([
      {
        target: "vault",
        to: addresses.vault,
        value: "0",
        functionName: "setCompoundKeeper",
        args: [addresses.keeper, false],
      },
      {
        target: "compounder",
        to: addresses.compounder,
        value: "0",
        functionName: "proposeRecovery",
        args: [WIND_DOWN_RECOVERY_KIND, addresses.safe],
      },
    ]);
  });

  it("accepts a fully bound, frozen active stack with both liquid LP NFTs", function () {
    expect(() => validateRecoveryProposalState(validState())).not.to.throw();
  });

  it("fails closed on chain, keeper, recovery, and position drift", function () {
    expect(() => validateRecoveryProposalState({ ...validState(), chainId: 1n }))
      .to.throw("requires Base chain");

    const safeCodeDrift = validState();
    safeCodeDrift.safe.runtimeCodeHash = "0x" + "11".repeat(32);
    expect(() => validateRecoveryProposalState(safeCodeDrift)).to.throw("runtime code hash is not canonical");

    const stackCodeDrift = validState();
    stackCodeDrift.runtimeCodeHashes.hook = "0x" + "22".repeat(32);
    expect(() => validateRecoveryProposalState(stackCodeDrift)).to.throw("hook runtime code hash is not canonical");

    const configDrift = validState();
    configDrift.expected.hook = "0x3333333333333333333333333333333333333333";
    expect(() => validateRecoveryProposalState(configDrift)).to.throw("configured hook mismatch");

    const safeOwnerDrift = validState();
    safeOwnerDrift.safe.owners[0] = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(() => validateRecoveryProposalState(safeOwnerDrift)).to.throw("owner set changed");

    const safeModuleDrift = validState();
    safeModuleDrift.safe.modules = [addresses.vault];
    expect(() => validateRecoveryProposalState(safeModuleDrift)).to.throw("enabled modules");

    const safeReceiverDrift = validState();
    safeReceiverDrift.safe.erc721ReceiverSelector = "0x00000000";
    expect(() => validateRecoveryProposalState(safeReceiverDrift)).to.throw("cannot receive the LP ERC-721");

    const keeperRevoked = validState();
    keeperRevoked.vault.keeperAuthorized = false;
    expect(() => validateRecoveryProposalState(keeperRevoked)).to.throw("not currently authorized");

    const pending = validState();
    pending.compounder.pendingRecovery = { kind: 3n, to: addresses.safe, eta: 123n };
    expect(() => validateRecoveryProposalState(pending)).to.throw("already has a pending recovery");

    const wrongOwner = validState();
    wrongOwner.compounder.positionOwner = addresses.safe;
    expect(() => validateRecoveryProposalState(wrongOwner)).to.throw("compounder LP owner mismatch");

    const emptySeed = validState();
    emptySeed.seedPosition.liquidity = 0n;
    expect(() => validateRecoveryProposalState(emptySeed)).to.throw("Seed LP position has no liquidity");

    const compounderNftDrift = validState();
    compounderNftDrift.compounder.positionTokenId += 1n;
    expect(() => validateRecoveryProposalState(compounderNftDrift)).to.throw("token ID is not canonical");
  });

  it("projects exactly seven days while identifying the result as a projection", function () {
    expect(recoveryEtaProjection(1_000n)).to.deep.equal({
      unix: (1_000n + RECOVERY_DELAY_SECONDS).toString(),
      iso: "1970-01-08T00:16:40.000Z",
    });
    expect(() => recoveryEtaProjection(-1n)).to.throw("cannot be negative");
  });

  it("matches canonical v4 tick, fee-growth, and spot arithmetic", function () {
    expect(sqrtPriceAtTick(0)).to.equal(1n << 96n);
    expect(sqrtPriceAtTick(-887_272)).to.equal(4_295_128_739n);
    expect(sqrtPriceAtTick(887_272)).to.equal(
      1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n,
    );
    expect(positionFeesFromGrowth({
      liquidity: 25n,
      feeGrowthInside0X128: 3n << 128n,
      feeGrowthInside1X128: 5n << 128n,
      feeGrowthInside0LastX128: 1n << 128n,
      feeGrowthInside1LastX128: 2n << 128n,
    })).to.deep.equal({ amount0: 50n, amount1: 75n });
    expect(naraToUsdcSpotRaw(123n, 1n << 96n, true)).to.equal(123n);
    expect(naraToUsdcSpotRaw(123n, 1n << 96n, false)).to.equal(123n);
  });

  it("decodes signed packed ticks and builds a diagnostic three-action decrease", function () {
    const lower = (1n << 24n) - 60n;
    const packed = (60n << 32n) | (lower << 8n);
    expect(decodePositionTicks(packed)).to.deep.equal({ tickLower: -60, tickUpper: 60 });

    const encoded = fullDecreaseUnlockData({
      tokenId: 1n,
      liquidity: 2n,
      recipient: addresses.safe,
      currency0: addresses.nara,
      currency1: addresses.usdc,
    });
    const [actions, params] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes", "bytes[]"], encoded);
    expect(actions).to.equal("0x010e0e");
    expect(params).to.have.length(3);
  });

  it("encodes Safe batching as ordered CALL-only MultiSend entries", function () {
    const encoded = encodeMultiSendCalls([
      { to: addresses.vault, value: "0", data: "0x1234" },
      { to: addresses.compounder, value: "0", data: "0xab" },
    ]);
    const bytes = ethers.getBytes(encoded);
    expect(bytes[0]).to.equal(0);
    expect(ethers.getAddress(ethers.hexlify(bytes.slice(1, 21)))).to.equal(addresses.vault);
    const firstLength = BigInt(ethers.hexlify(bytes.slice(53, 85)));
    expect(firstLength).to.equal(2n);
    const secondOffset = 85 + Number(firstLength);
    expect(bytes[secondOffset]).to.equal(0);
    expect(ethers.getAddress(ethers.hexlify(bytes.slice(secondOffset + 1, secondOffset + 21))))
      .to.equal(addresses.compounder);
  });
});
