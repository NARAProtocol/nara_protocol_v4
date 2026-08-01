import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import hre from "hardhat";

const BASE_POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const BASE_POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const SQRT_PRICE_1_1 = 1n << 96n;
const TICK_LOWER = -887_220;
const TICK_UPPER = 887_220;
const MIN_SQRT_PRICE = 4_295_128_739n;
const MAX_SQRT_PRICE = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;
const HOOK_FLAG_MASK = 0x3fffn;
const REQUIRED_HOOK_FLAGS = 0x20ccn;
const REHEARSAL = 0;
const ONE_HOUR = 3_600;
const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

type FoundryArtifact = {
  abi: unknown[];
  bytecode: { object: string };
};

function foundryArtifact(contractName: string): FoundryArtifact {
  const path = resolve(
    process.cwd(),
    "node_modules",
    "@uniswap",
    "v4-core",
    "out",
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  return JSON.parse(readFileSync(path, "utf8")) as FoundryArtifact;
}

async function deployFoundryContract(
  ethers: any,
  signer: any,
  contractName: string,
  constructorArgs: unknown[],
) {
  const artifact = foundryArtifact(contractName);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signer);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  return contract;
}

function mineHookSalt(
  ethers: any,
  create2Factory: string,
  initCode: string,
): { salt: string; address: string; attempts: number } {
  const initCodeHash = ethers.keccak256(initCode);
  const seed = ethers.keccak256(ethers.toUtf8Bytes("NARA-V5-BASE-FORK-COMPOUNDER"));
  for (let attempts = 1; attempts <= 300_000; attempts += 1) {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint256"], [seed, BigInt(attempts)]),
    );
    const address = ethers.getCreate2Address(create2Factory, salt, initCodeHash);
    if ((BigInt(address) & HOOK_FLAG_MASK) === REQUIRED_HOOK_FLAGS) {
      return { salt, address, attempts };
    }
  }
  throw new Error("Unable to mine the required Hook V5 permission address");
}

function receipt(ethers: any, label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function fullDecreaseUnlockData(
  ethers: any,
  tokenId: bigint,
  liquidity: bigint,
  recipient: string,
  currency0: string,
  currency1: string,
): string {
  const actions = ethers.hexlify(new Uint8Array([0x01, 0x0e, 0x0e]));
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const decrease = abi.encode(
    ["uint256", "uint128", "uint128", "uint128", "bytes"],
    [tokenId, liquidity, 0n, 0n, "0x"],
  );
  const take0 = abi.encode(["address", "address", "uint256"], [currency0, recipient, 0n]);
  const take1 = abi.encode(["address", "address", "uint256"], [currency1, recipient, 0n]);
  return abi.encode(["bytes", "bytes[]"], [actions, [decrease, take0, take1]]);
}

async function receiptBlockTokenDelta(
  token: any,
  account: string,
  transactionReceipt: any,
): Promise<bigint> {
  const blockNumber = Number(transactionReceipt.blockNumber);
  const [before, after] = await Promise.all([
    token.balanceOf(account, { blockTag: blockNumber - 1 }),
    token.balanceOf(account, { blockTag: blockNumber }),
  ]);
  let transferTotal = 0n;
  for (const log of transactionReceipt.logs) {
    if (String(log.address).toLowerCase() !== String(token.target).toLowerCase()) continue;
    try {
      const parsed = token.interface.parseLog(log);
      if (parsed?.name === "Transfer" && String(parsed.args.to).toLowerCase() === account.toLowerCase()) {
        transferTotal += BigInt(parsed.args.value);
      }
    } catch {
      // Ignore events outside this ERC-20 ABI.
    }
  }
  expect(BigInt(after) - BigInt(before)).to.equal(transferTotal);
  return transferTotal;
}

async function activePoolLiquidity(ethers: any, poolManager: any, poolId: string): Promise<bigint> {
  const poolsSlot = ethers.zeroPadValue(ethers.toBeHex(6n), 32);
  const stateSlot = ethers.keccak256(
    ethers.solidityPacked(["bytes32", "bytes32"], [poolId, poolsSlot]),
  );
  const liquiditySlot = ethers.zeroPadValue(ethers.toBeHex(BigInt(stateSlot) + 3n), 32);
  return BigInt(await poolManager.extsload(liquiditySlot)) & ((1n << 128n) - 1n);
}

const POOL_MANAGER_ABI = [
  "function initialize((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,uint160 sqrtPriceX96) returns (int24)",
  "function extsload(bytes32 slot) view returns (bytes32 value)",
  "error WrappedError(address target,bytes4 selector,bytes reason,bytes details)",
];
const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function modifyLiquidities(bytes unlockData,uint256 deadline) payable",
];
const PERMIT2_ABI = [
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
];

(hasRpc ? describe : describe.skip)("NARAUniswapV4PositionAdapterV5 - Base fork", function () {
  it("mints, increases, and separately harvests LP-fee credits larger than new principal", async function () {
    this.timeout(240_000);
    const { ethers } = await hre.network.connect("baseFork");
    const [deployer] = await ethers.getSigners();
    const token = await ethers.deployContract("MockERC20", ["V5 adapter NARA", "aNARA", 18]);
    const base = await ethers.deployContract("MockERC20", ["V5 adapter USDC", "aUSDC", 6]);
    await Promise.all([token.waitForDeployment(), base.waitForDeployment()]);
    const tokenAddress = await token.getAddress();
    const baseAddress = await base.getAddress();
    const [currency0, currency1] = BigInt(tokenAddress) < BigInt(baseAddress)
      ? [tokenAddress, baseAddress]
      : [baseAddress, tokenAddress];
    const poolKey = {
      currency0,
      currency1,
      fee: 3_000,
      tickSpacing: 60,
      hooks: ethers.ZeroAddress,
    };
    const livePoolManager = new ethers.Contract(BASE_POOL_MANAGER, POOL_MANAGER_ABI, deployer);
    await (await livePoolManager.initialize(poolKey, SQRT_PRICE_1_1)).wait();

    const harness = await ethers.deployContract("MockAdapterCompounderHarnessV5", [
      tokenAddress,
      baseAddress,
      BASE_POSITION_MANAGER,
    ]);
    await harness.waitForDeployment();
    const adapter = await ethers.deployContract("NARAUniswapV4PositionAdapterV5", [
      tokenAddress,
      baseAddress,
      BASE_POOL_MANAGER,
      BASE_POSITION_MANAGER,
      BASE_PERMIT2,
      await harness.getAddress(),
      poolKey,
      TICK_LOWER,
      TICK_UPPER,
    ]);
    await adapter.waitForDeployment();

    const harnessAddress = await harness.getAddress();
    const adapterAddress = await adapter.getAddress();
    const naraMaximum = 1_000n * 10n ** 18n;
    const baseMaximum = 1_000n * 10n ** 6n;
    await token.mint(harnessAddress, 2n * naraMaximum);
    await base.mint(harnessAddress, 2n * baseMaximum);
    const block = await ethers.provider.getBlock("latest");
    const deadline = BigInt(block!.timestamp) + 600n;

    await harness.add(adapterAddress, 0, naraMaximum, baseMaximum, 1, deadline);
    const tokenId = await harness.lastPositionTokenId();
    const firstLiquidity = await harness.lastLiquidityAdded();
    expect(tokenId).to.be.greaterThan(0n);
    expect(firstLiquidity).to.be.greaterThan(0n);
    expect(await harness.lastNaraUsed()).to.be.greaterThan(0n);
    expect(await harness.lastBaseUsed()).to.be.greaterThan(0n);

    const pm = new ethers.Contract(BASE_POSITION_MANAGER, POSITION_MANAGER_ABI, deployer);
    expect(await pm.ownerOf(tokenId)).to.equal(harnessAddress);
    expect(await pm.getPositionLiquidity(tokenId)).to.equal(firstLiquidity);
    expect(await pm.getApproved(tokenId)).to.equal(adapterAddress);
    expect(await token.balanceOf(adapterAddress)).to.equal(0n);
    expect(await base.balanceOf(adapterAddress)).to.equal(0n);
    expect(await token.allowance(adapterAddress, BASE_PERMIT2)).to.equal(0n);
    expect(await base.allowance(adapterAddress, BASE_PERMIT2)).to.equal(0n);
    const permit2 = new ethers.Contract(BASE_PERMIT2, PERMIT2_ABI, deployer);
    expect((await permit2.allowance(adapterAddress, tokenAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);
    expect((await permit2.allowance(adapterAddress, baseAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);

    const secondBlock = await ethers.provider.getBlock("latest");
    const secondDeadline = BigInt(secondBlock!.timestamp) + 600n;
    await harness.add(adapterAddress, tokenId, naraMaximum, baseMaximum, 1, secondDeadline);
    expect(await harness.lastPositionTokenId()).to.equal(tokenId);
    expect(await pm.ownerOf(tokenId)).to.equal(harnessAddress);
    expect(await pm.getPositionLiquidity(tokenId)).to.equal(firstLiquidity + await harness.lastLiquidityAdded());
    expect(await token.balanceOf(adapterAddress)).to.equal(0n);
    expect(await base.balanceOf(adapterAddress)).to.equal(0n);

    const liquidityAfterSecondAdd = await pm.getPositionLiquidity(tokenId);
    const swapRouter = await deployFoundryContract(ethers, deployer, "PoolSwapTest", [BASE_POOL_MANAGER]);
    const swapRouterAddress = await swapRouter.getAddress();
    const grossBaseInput = 100n * 10n ** 6n;
    await base.mint(deployer.address, grossBaseInput);
    await base.approve(swapRouterAddress, grossBaseInput);
    const zeroForOne = baseAddress.toLowerCase() === currency0.toLowerCase();
    await (
      await swapRouter.swap(
        poolKey,
        {
          zeroForOne,
          amountSpecified: -grossBaseInput,
          sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
        },
        [false, false],
        "0x",
        { gasLimit: 6_000_000n },
      )
    ).wait();

    const smallNaraMaximum = 10_000n;
    const smallBaseMaximum = 10_000n;
    await token.mint(harnessAddress, smallNaraMaximum);
    await base.mint(harnessAddress, smallBaseMaximum);
    const harnessNaraBefore = await token.balanceOf(harnessAddress);
    const harnessBaseBefore = await base.balanceOf(harnessAddress);
    const thirdBlock = await ethers.provider.getBlock("latest");
    const thirdDeadline = BigInt(thirdBlock!.timestamp) + 600n;
    await harness.add(
      adapterAddress,
      tokenId,
      smallNaraMaximum,
      smallBaseMaximum,
      1,
      thirdDeadline,
    );

    const naraPrincipalUsed = await harness.lastNaraUsed();
    const basePrincipalUsed = await harness.lastBaseUsed();
    const naraLpFeesHarvested = await harness.lastNaraLpFeesHarvested();
    const baseLpFeesHarvested = await harness.lastBaseLpFeesHarvested();
    expect(naraLpFeesHarvested).to.equal(0n);
    expect(baseLpFeesHarvested).to.be.greaterThan(basePrincipalUsed);
    expect(await token.balanceOf(harnessAddress)).to.equal(
      harnessNaraBefore - naraPrincipalUsed + naraLpFeesHarvested,
    );
    expect(await base.balanceOf(harnessAddress)).to.equal(
      harnessBaseBefore - basePrincipalUsed + baseLpFeesHarvested,
    );
    expect(await pm.getPositionLiquidity(tokenId)).to.equal(
      liquidityAfterSecondAdd + await harness.lastLiquidityAdded(),
    );
    expect(await token.balanceOf(adapterAddress)).to.equal(0n);
    expect(await base.balanceOf(adapterAddress)).to.equal(0n);
    expect(await token.allowance(adapterAddress, BASE_PERMIT2)).to.equal(0n);
    expect(await base.allowance(adapterAddress, BASE_PERMIT2)).to.equal(0n);
    expect((await permit2.allowance(adapterAddress, tokenAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);
    expect((await permit2.allowance(adapterAddress, baseAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);
  });

  it("runs the complete real-controller 1h seed, fee, recompound, retirement, and two-NFT removal rehearsal", async function () {
    this.timeout(300_000);
    const { ethers } = await hre.network.connect("baseFork");
    const [configurationAuthority, operationsAuthority, recoverySafe, trader] = await ethers.getSigners();

    const token = await ethers.deployContract("MockERC20", ["V5 fork NARA", "fNARA", 18]);
    const base = await ethers.deployContract("MockERC20", ["V5 fork USDC", "fUSDC", 6]);
    await Promise.all([token.waitForDeployment(), base.waitForDeployment()]);
    const tokenAddress = await token.getAddress();
    const baseAddress = await base.getAddress();
    const [currency0, currency1] = BigInt(tokenAddress) < BigInt(baseAddress)
      ? [tokenAddress, baseAddress]
      : [baseAddress, tokenAddress];

    const vault = await ethers.deployContract("NARALiquidityGrowthVaultV5", [
      configurationAuthority.address,
      recoverySafe.address,
      tokenAddress,
      baseAddress,
      BASE_POOL_MANAGER,
      2_000,
    ]);
    const create2Factory = await ethers.deployContract("NARACreate2FactoryV5");
    await Promise.all([
      vault.waitForDeployment(),
      create2Factory.waitForDeployment(),
    ]);

    const Hook = await ethers.getContractFactory("NARALiquidityGrowthHookV5");
    const hookDeployTx = await Hook.getDeployTransaction(
      BASE_POOL_MANAGER,
      configurationAuthority.address,
      tokenAddress,
      baseAddress,
      await vault.getAddress(),
      SQRT_PRICE_1_1,
      1,
      10_000,
      10_000,
      [1_250, 1_000, 750, 500],
      [2, 3, 4, 5],
    );
    if (typeof hookDeployTx.data !== "string") throw new Error("Hook V5 init code unavailable");
    const create2FactoryAddress = await create2Factory.getAddress();
    const mined = mineHookSalt(ethers, create2FactoryAddress, hookDeployTx.data);
    const hookInitCodeHash = ethers.keccak256(hookDeployTx.data);

    // Uniswap derives callback permissions from the low 14 address bits. A
    // normally deployed Hook is therefore not a valid substitute: deployment
    // must mine a CREATE2 salt and the live PoolManager enforces the result.
    expect(mined.attempts).to.be.greaterThan(0);
    expect(BigInt(mined.address) & HOOK_FLAG_MASK).to.equal(REQUIRED_HOOK_FLAGS);
    expect(
      await create2Factory.permissionBitsMatch(
        mined.address,
        REQUIRED_HOOK_FLAGS,
        HOOK_FLAG_MASK,
      ),
    ).to.equal(true);
    await (
      await create2Factory.deploy(
        mined.salt,
        hookDeployTx.data,
        hookInitCodeHash,
        mined.address,
      )
    ).wait();
    const hook = await ethers.getContractAt("NARALiquidityGrowthHookV5", mined.address);

    const poolKey = {
      currency0,
      currency1,
      fee: 3_000,
      tickSpacing: 60,
      hooks: mined.address,
    };
    const poolId = await hook.poolId();
    const phaseScheduleHash = await hook.phaseScheduleHash();
    const seedCustody = await ethers.deployContract("NARASeedPOLCustodyV5", [
      configurationAuthority.address,
      recoverySafe.address,
      BASE_POSITION_MANAGER,
      poolId,
      TICK_LOWER,
      TICK_UPPER,
      REHEARSAL,
      ONE_HOUR,
    ]);
    const configuredCompounderMinimumNaraUsed = 10_000n;
    const configuredCompounderMinimumBaseUsed = 10_000n;
    const compounder = await ethers.deployContract("NARALiquidityCompounderV5", [
      configurationAuthority.address,
      operationsAuthority.address,
      recoverySafe.address,
      tokenAddress,
      baseAddress,
      BASE_POOL_MANAGER,
      BASE_POSITION_MANAGER,
      await vault.getAddress(),
      poolId,
      TICK_LOWER,
      TICK_UPPER,
      configuredCompounderMinimumNaraUsed,
      configuredCompounderMinimumBaseUsed,
      REHEARSAL,
      ONE_HOUR,
    ]);
    await Promise.all([seedCustody.waitForDeployment(), compounder.waitForDeployment()]);
    const compounderAddress = await compounder.getAddress();
    const phaseController = await ethers.deployContract("NARALiquidityPhaseControllerV5", [
      configurationAuthority.address,
      recoverySafe.address,
      BASE_POOL_MANAGER,
      BASE_POSITION_MANAGER,
      await vault.getAddress(),
      await seedCustody.getAddress(),
      compounderAddress,
      poolId,
      phaseScheduleHash,
      [60, 60, 60, 60],
      [2, 2, 2, 2],
      REHEARSAL,
      ONE_HOUR,
    ]);
    await phaseController.waitForDeployment();
    const phaseControllerAddress = await phaseController.getAddress();
    await hook.bindPhaseController(phaseControllerAddress);

    const livePoolManager = new ethers.Contract(BASE_POOL_MANAGER, POOL_MANAGER_ABI, configurationAuthority);
    await (await livePoolManager.initialize(poolKey, SQRT_PRICE_1_1)).wait();
    const configuredMinimumNaraUsed = 100_000_000n;
    const configuredMinimumBaseUsed = 100_000_000n;
    const seedInitializer = await ethers.deployContract("NARASeedPositionInitializerV5", [
      configurationAuthority.address,
      tokenAddress,
      baseAddress,
      BASE_POOL_MANAGER,
      BASE_POSITION_MANAGER,
      BASE_PERMIT2,
      await seedCustody.getAddress(),
      configuredMinimumNaraUsed,
      configuredMinimumBaseUsed,
      poolKey,
      TICK_LOWER,
      TICK_UPPER,
    ]);
    const adapter = await ethers.deployContract("NARAUniswapV4PositionAdapterV5", [
      tokenAddress,
      baseAddress,
      BASE_POOL_MANAGER,
      BASE_POSITION_MANAGER,
      BASE_PERMIT2,
      compounderAddress,
      poolKey,
      TICK_LOWER,
      TICK_UPPER,
    ]);
    await Promise.all([seedInitializer.waitForDeployment(), adapter.waitForDeployment()]);
    const adapterAddress = await adapter.getAddress();
    expect(await compounder.configuredMinimumNaraUsed()).to.equal(configuredCompounderMinimumNaraUsed);
    expect(await compounder.configuredMinimumBaseUsed()).to.equal(configuredCompounderMinimumBaseUsed);
    expect(await adapter.configuredMinimumNaraUsed()).to.equal(configuredCompounderMinimumNaraUsed);
    expect(await adapter.configuredMinimumBaseUsed()).to.equal(configuredCompounderMinimumBaseUsed);

    const seedNaraMaximum = 1_000n * 10n ** 18n;
    const seedBaseMaximum = 1_000n * 10n ** 6n;
    const seedInitializerAddress = await seedInitializer.getAddress();
    await token.mint(configurationAuthority.address, seedNaraMaximum);
    await base.mint(configurationAuthority.address, seedBaseMaximum);
    await token.approve(seedInitializerAddress, seedNaraMaximum);
    await base.approve(seedInitializerAddress, seedBaseMaximum);
    const seedBlock = await ethers.provider.getBlock("latest");
    const seedDeadline = BigInt(seedBlock!.timestamp) + 600n;
    expect(await seedInitializer.configurationHash()).not.to.equal(ethers.ZeroHash);
    expect(await seedInitializer.expectedSqrtPriceX96()).to.equal(SQRT_PRICE_1_1);
    expect(await seedInitializer.poolId()).to.equal(poolId);
    expect(await seedInitializer.seedCustody()).to.equal(await seedCustody.getAddress());
    expect(await seedInitializer.configuredMinimumNaraUsed()).to.equal(configuredMinimumNaraUsed);
    expect(await seedInitializer.configuredMinimumBaseUsed()).to.equal(configuredMinimumBaseUsed);
    await expect(
      seedInitializer.initialize(
        seedNaraMaximum,
        seedBaseMaximum,
        seedNaraMaximum,
        configuredMinimumBaseUsed,
        1,
        seedDeadline,
      ),
    ).to.be.revertedWithCustomError(seedInitializer, "InsufficientNaraUsed");
    await expect(
      seedInitializer.initialize(
        500_000_000n,
        seedBaseMaximum,
        configuredMinimumNaraUsed,
        seedBaseMaximum,
        1,
        seedDeadline,
      ),
    ).to.be.revertedWithCustomError(seedInitializer, "InsufficientBaseUsed");
    await seedInitializer.initialize(
      seedNaraMaximum,
      seedBaseMaximum,
      configuredMinimumNaraUsed,
      configuredMinimumBaseUsed,
      1,
      seedDeadline,
    );
    const seedPositionTokenId = await seedInitializer.positionTokenId();
    const seedLiquidity = await seedInitializer.liquidityAdded();
    expect(seedPositionTokenId).to.be.greaterThan(0n);
    expect(seedLiquidity).to.be.greaterThan(5n);
    expect(await seedInitializer.naraUsed()).to.be.greaterThan(0n);
    expect(await seedInitializer.baseUsed()).to.be.greaterThan(0n);
    expect(await token.balanceOf(seedInitializerAddress)).to.equal(0n);
    expect(await base.balanceOf(seedInitializerAddress)).to.equal(0n);
    const permit2 = new ethers.Contract(BASE_PERMIT2, PERMIT2_ABI, configurationAuthority);
    expect(await token.allowance(seedInitializerAddress, BASE_PERMIT2)).to.equal(0n);
    expect(await base.allowance(seedInitializerAddress, BASE_PERMIT2)).to.equal(0n);
    expect((await permit2.allowance(seedInitializerAddress, tokenAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);
    expect((await permit2.allowance(seedInitializerAddress, baseAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);
    await expect(
      seedInitializer.initialize(seedNaraMaximum, seedBaseMaximum, 1, 1, 1, seedDeadline),
    ).to.be.revertedWithCustomError(seedInitializer, "AlreadyInitialized");
    await seedCustody.registerPosition(seedPositionTokenId);
    await seedCustody.sealConfiguration(mined.address, phaseControllerAddress);

    await compounder.sealConfiguration(
      mined.address,
      phaseControllerAddress,
      adapterAddress,
    );
    const reserveAllocation = 100n * 10n ** 18n;
    await token.mint(configurationAuthority.address, reserveAllocation);
    const rewardReserve = await ethers.deployContract("NARARewardReserveV5", [
      configurationAuthority.address,
      recoverySafe.address,
      tokenAddress,
      reserveAllocation,
    ]);
    await rewardReserve.waitForDeployment();
    const engineBlock = await ethers.provider.getBlock("latest");
    const engineEpochOrigin = BigInt(engineBlock!.timestamp) + 600n;
    const engine = await ethers.deployContract("NARAEngineV5", [
      configurationAuthority.address,
      tokenAddress,
      baseAddress,
      await rewardReserve.getAddress(),
      recoverySafe.address,
      {
        epochOrigin: engineEpochOrigin,
        epochLength: 3_600,
        minLockDuration: 3_600,
        maxLockDuration: 7_200,
        maxAdvancePerCall: 64,
        minWeightMultiplierWad: 10n ** 18n,
        maxWeightMultiplierWad: 4n * 10n ** 18n,
        emissionPerEpoch: 10n ** 18n,
        emissionBootstrapWeight: 100n * 10n ** 18n,
        minimumRewardWeight: 100n * 10n ** 18n,
      },
    ]);
    await engine.waitForDeployment();
    const positionControllerHarness = await ethers.deployContract(
      "NARAPositionControllerBindingHarnessV5",
      [await engine.getAddress(), tokenAddress],
    );
    await positionControllerHarness.waitForDeployment();
    await engine.bindPositionController(await positionControllerHarness.getAddress());
    await engine.bindLiquidityFeeVault(await vault.getAddress());
    await rewardReserve.bindEngine(await engine.getAddress());
    await token.approve(await rewardReserve.getAddress(), reserveAllocation);
    await rewardReserve.fund(reserveAllocation);
    await rewardReserve.seal();
    await engine.sealConfiguration();
    await vault.sealConfiguration(
      mined.address,
      phaseControllerAddress,
      compounderAddress,
      await engine.getAddress(),
    );

    const initialNaraMaximum = 1_000n * 10n ** 18n;
    const initialBaseMaximum = 1_000n * 10n ** 6n;
    await token.mint(compounderAddress, initialNaraMaximum);
    await base.mint(compounderAddress, initialBaseMaximum);
    const firstBlock = await ethers.provider.getBlock("latest");
    const firstDeadline = BigInt(firstBlock!.timestamp) + 600n;
    await compounder.connect(operationsAuthority).compoundBanked(
      receipt(ethers, "base-fork-initial-pol"),
      initialNaraMaximum,
      initialBaseMaximum,
      configuredCompounderMinimumNaraUsed,
      configuredCompounderMinimumBaseUsed,
      1,
      firstDeadline,
    );

    const positionTokenId = await compounder.positionTokenId();
    const firstLiquidity = await compounder.totalLiquidityAdded();
    expect(positionTokenId).to.be.greaterThan(0n);
    expect(firstLiquidity).to.be.greaterThan(5n);
    await phaseController.sealConfiguration(mined.address);
    expect(await phaseController.activeProtocolLiquidity()).to.equal(seedLiquidity + firstLiquidity);
    await hook.activatePool();
    expect(await hook.poolActive()).to.equal(true);
    expect(await vault.configurationSealed()).to.equal(true);
    expect(await compounder.configurationSealed()).to.equal(true);

    // Move the real Vault into Shared while the real Engine has no eligible
    // reward weight. Its 20% share must therefore be pinned inactive now, not
    // reclassified when the backing claims are pulled later.
    await phaseController.observeNextPhase();
    const sharedObservation = await phaseController.phaseObservation(1);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(sharedObservation.startedAt) + 60]);
    await phaseController.observeNextPhase();
    await phaseController.advanceQualifiedPhase();
    expect(await hook.currentPhase()).to.equal(1n);
    expect(await vault.routingState()).to.equal(2n);

    const swapRouter = await deployFoundryContract(
      ethers,
      configurationAuthority,
      "PoolSwapTest",
      [BASE_POOL_MANAGER],
    );
    const swapRouterAddress = await swapRouter.getAddress();
    const grossBaseInput = 100n * 10n ** 6n;
    await base.mint(trader.address, grossBaseInput);
    await base.connect(trader).approve(swapRouterAddress, grossBaseInput);
    const zeroForOne = baseAddress.toLowerCase() === currency0.toLowerCase();
    const swapTx = await swapRouter.connect(trader).swap(
      poolKey,
      {
        zeroForOne,
        amountSpecified: -grossBaseInput,
        sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
      },
      [false, false],
      "0x",
      { gasLimit: 6_000_000n },
    );
    const swapReceipt = await swapTx.wait();
    expect(swapReceipt?.status).to.equal(1);

    const [naraClaims, baseClaims] = await vault.liquidityClaimsOutstanding();
    const [inactiveNaraEngineClaims, inactiveBaseEngineClaims] =
      await vault.engineClaimsOutstanding();
    expect(naraClaims).to.be.greaterThan(0n);
    expect(baseClaims).to.be.greaterThan(0n);
    expect(inactiveNaraEngineClaims).to.be.greaterThan(0n);
    expect(inactiveBaseEngineClaims).to.be.greaterThan(0n);
    expect(await vault.totalTokenFeeRecorded()).to.equal(naraClaims + inactiveNaraEngineClaims);
    expect(await vault.totalBaseFeeRecorded()).to.equal(baseClaims + inactiveBaseEngineClaims);
    expect(await vault.sharedTokenEngineInactiveAccounted()).to.equal(inactiveNaraEngineClaims);
    expect(await vault.sharedBaseEngineInactiveAccounted()).to.equal(inactiveBaseEngineClaims);
    expect(await engine.pendingInactiveNaraFeeFunding()).to.equal(inactiveNaraEngineClaims);
    expect(await engine.pendingInactiveBaseFeeFunding()).to.equal(inactiveBaseEngineClaims);

    const engineBackingTx = await engine.connect(trader).syncLiquidityFeeBacking();
    const engineBackingReceipt = await engineBackingTx.wait();
    expect(engineBackingReceipt?.status).to.equal(1);
    expect(
      await receiptBlockTokenDelta(token, recoverySafe.address, engineBackingReceipt),
    ).to.equal(inactiveNaraEngineClaims);
    expect(
      await receiptBlockTokenDelta(base, recoverySafe.address, engineBackingReceipt),
    ).to.equal(inactiveBaseEngineClaims);
    expect(await vault.engineClaimsOutstanding()).to.deep.equal([0n, 0n]);
    expect(await engine.pendingInactiveNaraFeeFunding()).to.equal(0n);
    expect(await engine.pendingInactiveBaseFeeFunding()).to.equal(0n);
    expect(await engine.totalInactiveNaraFeesRouted()).to.equal(inactiveNaraEngineClaims);
    expect(await engine.totalInactiveBaseFeesRouted()).to.equal(inactiveBaseEngineClaims);
    expect((await engine.rewardAccounting(tokenAddress)).totalReceived).to.equal(0n);
    expect((await engine.rewardAccounting(baseAddress)).totalReceived).to.equal(0n);

    const bankedNaraBefore = await token.balanceOf(compounderAddress);
    const bankedBaseBefore = await base.balanceOf(compounderAddress);
    await compounder.connect(operationsAuthority).pullLiquidityClaims(
      receipt(ethers, "base-fork-hook-fee-pull"),
      naraClaims,
      baseClaims,
    );
    expect(await token.balanceOf(compounderAddress)).to.equal(bankedNaraBefore + naraClaims);
    expect(await base.balanceOf(compounderAddress)).to.equal(bankedBaseBefore + baseClaims);
    expect(await vault.liquidityClaimsOutstanding()).to.deep.equal([0n, 0n]);

    const pm = new ethers.Contract(BASE_POSITION_MANAGER, POSITION_MANAGER_ABI, configurationAuthority);
    const liquidityBeforeRecompound = await pm.getPositionLiquidity(positionTokenId);
    const secondBlock = await ethers.provider.getBlock("latest");
    const secondDeadline = BigInt(secondBlock!.timestamp) + 600n;
    await compounder.connect(operationsAuthority).compoundBanked(
      receipt(ethers, "base-fork-hook-fee-recompound"),
      naraClaims,
      baseClaims,
      configuredCompounderMinimumNaraUsed,
      configuredCompounderMinimumBaseUsed,
      1,
      secondDeadline,
    );
    const liquidityAfterRecompound = await pm.getPositionLiquidity(positionTokenId);
    expect(liquidityAfterRecompound).to.be.greaterThan(liquidityBeforeRecompound);
    expect(await compounder.positionTokenId()).to.equal(positionTokenId);
    expect(await pm.ownerOf(positionTokenId)).to.equal(compounderAddress);
    expect(await pm.getApproved(positionTokenId)).to.equal(adapterAddress);
    expect(await compounder.totalNaraClaimsReceived()).to.equal(naraClaims);
    expect(await compounder.totalBaseClaimsReceived()).to.equal(baseClaims);

    expect(await token.allowance(compounderAddress, adapterAddress)).to.equal(0n);
    expect(await base.allowance(compounderAddress, adapterAddress)).to.equal(0n);
    expect(await token.allowance(adapterAddress, BASE_PERMIT2)).to.equal(0n);
    expect(await base.allowance(adapterAddress, BASE_PERMIT2)).to.equal(0n);
    expect((await permit2.allowance(adapterAddress, tokenAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);
    expect((await permit2.allowance(adapterAddress, baseAddress, BASE_POSITION_MANAGER)).amount).to.equal(0n);
    expect(await token.balanceOf(adapterAddress)).to.equal(0n);
    expect(await base.balanceOf(adapterAddress)).to.equal(0n);

    expect(await vault.liquidityClaimsOutstanding()).to.deep.equal([0n, 0n]);
    expect(await vault.engineClaimsOutstanding()).to.deep.equal([0n, 0n]);

    // Leave a second real-PoolManager fee accrual outstanding so atomic
    // retirement itself must redeem the ERC-6909 claims to the recovery Safe.
    const retirementSwapInput = 10n * 10n ** 6n;
    await base.mint(trader.address, retirementSwapInput);
    await base.connect(trader).approve(swapRouterAddress, retirementSwapInput);
    const retirementFeeSwapTx = await swapRouter.connect(trader).swap(
      poolKey,
      {
        zeroForOne,
        amountSpecified: -retirementSwapInput,
        sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
      },
      [false, false],
      "0x",
      { gasLimit: 6_000_000n },
    );
    expect((await retirementFeeSwapTx.wait())?.status).to.equal(1);
    const [retirementLiquidityNaraClaims, retirementLiquidityBaseClaims] =
      await vault.liquidityClaimsOutstanding();
    const [retirementEngineNaraClaims, retirementEngineBaseClaims] =
      await vault.engineClaimsOutstanding();
    expect(retirementLiquidityNaraClaims).to.be.greaterThan(0n);
    expect(retirementLiquidityBaseClaims).to.be.greaterThan(0n);
    expect(retirementEngineNaraClaims).to.be.greaterThan(0n);
    expect(retirementEngineBaseClaims).to.be.greaterThan(0n);
    expect(await engine.pendingInactiveNaraFeeFunding()).to.equal(retirementEngineNaraClaims);
    expect(await engine.pendingInactiveBaseFeeFunding()).to.equal(retirementEngineBaseClaims);

    await phaseController.connect(recoverySafe).proposeRetirement();
    const retirementEta = await phaseController.retirementEta();
    expect(await seedCustody.recoveryEta()).to.equal(retirementEta);
    expect(await compounder.recoveryEta()).to.equal(retirementEta);
    const [bankedNaraBeforeRetirement, bankedBaseBeforeRetirement] = await compounder.bankedBalances();
    const safeNaraBeforeRetirement = await token.balanceOf(recoverySafe.address);
    const safeBaseBeforeRetirement = await base.balanceOf(recoverySafe.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(retirementEta)]);
    const retirementTx = await phaseController.connect(trader).executeRetirement();
    const retirementReceipt = await retirementTx.wait();
    expect(retirementReceipt?.status).to.equal(1);
    const retirementNaraDelta = await receiptBlockTokenDelta(token, recoverySafe.address, retirementReceipt);
    const retirementBaseDelta = await receiptBlockTokenDelta(base, recoverySafe.address, retirementReceipt);
    expect(retirementNaraDelta).to.equal(
      bankedNaraBeforeRetirement + retirementLiquidityNaraClaims + retirementEngineNaraClaims,
    );
    expect(retirementBaseDelta).to.equal(
      bankedBaseBeforeRetirement + retirementLiquidityBaseClaims + retirementEngineBaseClaims,
    );

    expect(await hook.poolActive()).to.equal(false);
    expect(await hook.poolRetired()).to.equal(true);
    expect(await vault.routingState()).to.equal(3n);
    expect(await vault.allClassifiedClaimsProcessed()).to.equal(true);
    expect(await vault.liquidityClaimsOutstanding()).to.deep.equal([0n, 0n]);
    expect(await vault.engineClaimsOutstanding()).to.deep.equal([0n, 0n]);
    expect(await engine.pendingInactiveNaraFeeFunding()).to.equal(0n);
    expect(await engine.pendingInactiveBaseFeeFunding()).to.equal(0n);
    expect(await engine.totalInactiveNaraFeesRouted()).to.equal(
      inactiveNaraEngineClaims + retirementEngineNaraClaims,
    );
    expect(await engine.totalInactiveBaseFeesRouted()).to.equal(
      inactiveBaseEngineClaims + retirementEngineBaseClaims,
    );
    expect(await seedCustody.retired()).to.equal(true);
    expect(await compounder.retired()).to.equal(true);
    expect(await phaseController.retired()).to.equal(true);
    expect(await phaseController.activeProtocolLiquidity()).to.equal(0n);
    expect(await seedCustody.positionTokenId()).to.equal(0n);
    expect(await compounder.positionTokenId()).to.equal(0n);
    expect(await compounder.bankedBalances()).to.deep.equal([0n, 0n]);
    expect(await pm.ownerOf(seedPositionTokenId)).to.equal(recoverySafe.address);
    expect(await pm.ownerOf(positionTokenId)).to.equal(recoverySafe.address);

    const rejectedSwapInput = 10_000n;
    await base.mint(trader.address, rejectedSwapInput);
    await base.connect(trader).approve(swapRouterAddress, rejectedSwapInput);
    await expect(
      swapRouter.connect(trader).swap(
        poolKey,
        {
          zeroForOne,
          amountSpecified: -rejectedSwapInput,
          sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
        },
        [false, false],
        "0x",
        { gasLimit: 6_000_000n },
      ),
    ).to.be.revertedWithCustomError(livePoolManager, "WrappedError").withArgs(
      mined.address,
      hook.interface.getFunction("beforeSwap")!.selector,
      hook.interface.encodeErrorResult("PoolPermanentlyRetired"),
      ethers.id("HookCallFailed()").slice(0, 10),
    );

    const seedLiquidityAtRecovery = await pm.getPositionLiquidity(seedPositionTokenId);
    const compounderLiquidityAtRecovery = await pm.getPositionLiquidity(positionTokenId);
    expect(seedLiquidityAtRecovery).to.be.greaterThan(0n);
    expect(compounderLiquidityAtRecovery).to.be.greaterThan(0n);
    expect(await activePoolLiquidity(ethers, livePoolManager, poolId)).to.equal(
      seedLiquidityAtRecovery + compounderLiquidityAtRecovery,
    );
    const removalBlock = await ethers.provider.getBlock("latest");
    const removalDeadline = BigInt(removalBlock!.timestamp) + 600n;
    const positionManagerAsRecovery = pm.connect(recoverySafe);
    const seedRemovalTx = await positionManagerAsRecovery.modifyLiquidities(
      fullDecreaseUnlockData(
        ethers,
        seedPositionTokenId,
        seedLiquidityAtRecovery,
        recoverySafe.address,
        currency0,
        currency1,
      ),
      removalDeadline,
      { gasLimit: 2_000_000n },
    );
    const seedRemovalReceipt = await seedRemovalTx.wait();
    expect(seedRemovalReceipt?.status).to.equal(1);
    const seedNaraRecovered = await receiptBlockTokenDelta(token, recoverySafe.address, seedRemovalReceipt);
    const seedBaseRecovered = await receiptBlockTokenDelta(base, recoverySafe.address, seedRemovalReceipt);
    expect(seedNaraRecovered).to.be.greaterThan(0n);
    expect(seedBaseRecovered).to.be.greaterThan(0n);
    expect(await activePoolLiquidity(ethers, livePoolManager, poolId)).to.equal(
      compounderLiquidityAtRecovery,
    );

    const compounderRemovalTx = await positionManagerAsRecovery.modifyLiquidities(
      fullDecreaseUnlockData(
        ethers,
        positionTokenId,
        compounderLiquidityAtRecovery,
        recoverySafe.address,
        currency0,
        currency1,
      ),
      removalDeadline,
      { gasLimit: 2_000_000n },
    );
    const compounderRemovalReceipt = await compounderRemovalTx.wait();
    expect(compounderRemovalReceipt?.status).to.equal(1);
    const compounderNaraRecovered = await receiptBlockTokenDelta(
      token,
      recoverySafe.address,
      compounderRemovalReceipt,
    );
    const compounderBaseRecovered = await receiptBlockTokenDelta(
      base,
      recoverySafe.address,
      compounderRemovalReceipt,
    );
    expect(compounderNaraRecovered).to.be.greaterThan(0n);
    expect(compounderBaseRecovered).to.be.greaterThan(0n);

    expect(await pm.getPositionLiquidity(seedPositionTokenId)).to.equal(0n);
    expect(await pm.getPositionLiquidity(positionTokenId)).to.equal(0n);
    expect(await activePoolLiquidity(ethers, livePoolManager, poolId)).to.equal(0n);
    expect(await pm.ownerOf(seedPositionTokenId)).to.equal(recoverySafe.address);
    expect(await pm.ownerOf(positionTokenId)).to.equal(recoverySafe.address);
    expect(await pm.getApproved(positionTokenId)).to.equal(ethers.ZeroAddress);
    expect(await token.balanceOf(recoverySafe.address) - safeNaraBeforeRetirement).to.equal(
      retirementNaraDelta + seedNaraRecovered + compounderNaraRecovered,
    );
    expect(await base.balanceOf(recoverySafe.address) - safeBaseBeforeRetirement).to.equal(
      retirementBaseDelta + seedBaseRecovered + compounderBaseRecovered,
    );
    expect(await token.balanceOf(compounderAddress)).to.equal(0n);
    expect(await base.balanceOf(compounderAddress)).to.equal(0n);

    await expect(
      swapRouter.connect(trader).swap(
        poolKey,
        {
          zeroForOne,
          amountSpecified: -rejectedSwapInput,
          sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
        },
        [false, false],
        "0x",
        { gasLimit: 6_000_000n },
      ),
    ).to.be.rejected;
    await expect(
      compounder.connect(operationsAuthority).compoundBanked(
        receipt(ethers, "post-retirement-compound"),
        1,
        1,
        1,
        1,
        1,
        removalDeadline,
      ),
    ).to.be.revertedWithCustomError(compounder, "InvalidState");
  });
});
