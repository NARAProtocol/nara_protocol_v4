import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import hre from "hardhat";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;
const Q96 = 1n << 96n;
const BPS = 10_000n;
const BOOTSTRAP_FEE_BPS = 1_500n;
const POOL_FEE = 3_000;
const TICK_SPACING = 60;
const MIN_TICK = -887_220;
const MAX_TICK = 887_220;
const MIN_SQRT_PRICE = 4_295_128_739n;
const MAX_SQRT_PRICE =
  1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;
const HOOK_FLAG_MASK = 0x3fffn;
const REQUIRED_HOOK_FLAGS = 0x20ccn;

type FoundryArtifact = {
  abi: unknown[];
  bytecode: { object: string };
};

type SwapReceipt = {
  blockNumber: number;
  grossInput: bigint;
  inputFee: bigint;
  ammInput: bigint;
  grossOutput: bigint;
  outputFee: bigint;
  netOutput: bigint;
};

function foundryArtifact(contractName: string): FoundryArtifact {
  const path = resolve(
    process.cwd(),
    "node_modules",
    "@uniswap",
    "v4-core",
    "out",
    `${contractName}.sol`,
    `${contractName}.json`
  );
  return JSON.parse(readFileSync(path, "utf8")) as FoundryArtifact;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

function sqrtPriceX96FromAmounts(amount0: bigint, amount1: bigint): bigint {
  return isqrt((amount1 * (1n << 192n)) / amount0);
}

function feeFor(amount: bigint, feeBps = BOOTSTRAP_FEE_BPS): bigint {
  if (amount === 0n) return 0n;
  return (amount * feeBps + BPS - 1n) / BPS;
}

function parseEvent(receipt: any, contract: any, eventName: string): any {
  const target = String(contract.target).toLowerCase();
  for (const log of receipt.logs) {
    if (String(log.address).toLowerCase() !== target) continue;
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed;
    } catch {
      // A contract can emit logs not represented by the selected ABI.
    }
  }
  throw new Error(`${eventName} event not found`);
}

function mineHookSalt(
  ethers: any,
  create2Deployer: string,
  initCode: string,
  label: string
): { salt: string; address: string } {
  const initCodeHash = ethers.keccak256(initCode);
  const seed = ethers.keccak256(ethers.toUtf8Bytes(label));

  for (let i = 0; i < 300_000; i += 1) {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint256"], [seed, BigInt(i)])
    );
    const candidate = ethers.getCreate2Address(
      create2Deployer,
      salt,
      initCodeHash
    );
    if ((BigInt(candidate) & HOOK_FLAG_MASK) === REQUIRED_HOOK_FLAGS) {
      return { salt, address: candidate };
    }
  }

  throw new Error("Unable to mine the Hook V5 permission address");
}

async function deployFoundryContract(
  ethers: any,
  signer: any,
  contractName: string,
  constructorArgs: unknown[]
) {
  const artifact = foundryArtifact(contractName);
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    signer
  );
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  return contract;
}

async function deployTokenPair(
  ethers: any,
  owner: any,
  naraIsCurrency0: boolean
) {
  const usdc = await ethers.deployContract(
    "MockERC20",
    ["USD Coin", "USDC", 6],
    owner
  );
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();

  for (let i = 0; i < 64; i += 1) {
    const candidate = await ethers.deployContract(
      "MockERC20",
      [`NARA V5 Candidate ${i}`, "NARA", 18],
      owner
    );
    await candidate.waitForDeployment();
    const candidateAddress = await candidate.getAddress();
    const candidateIsCurrency0 = BigInt(candidateAddress) < BigInt(usdcAddress);
    if (candidateIsCurrency0 === naraIsCurrency0) {
      return {
        nara: candidate,
        usdc,
        naraAddress: candidateAddress,
        usdcAddress,
      };
    }
  }

  throw new Error("Unable to deploy the requested token address ordering");
}

async function deployScenario(
  naraIsCurrency0: boolean,
  seed: { nara?: bigint; usdc?: bigint } = {}
) {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [owner] = await ethers.getSigners();
  const provider = ethers.provider;

  const manager = await deployFoundryContract(ethers, owner, "PoolManager", [
    owner.address,
  ]);
  const managerAddress = await manager.getAddress();
  const liquidityRouter = await deployFoundryContract(
    ethers,
    owner,
    "PoolModifyLiquidityTest",
    [managerAddress]
  );
  const swapRouter = await deployFoundryContract(
    ethers,
    owner,
    "PoolSwapTest",
    [managerAddress]
  );

  const { nara, usdc, naraAddress, usdcAddress } = await deployTokenPair(
    ethers,
    owner,
    naraIsCurrency0
  );
  expect(BigInt(naraAddress) < BigInt(usdcAddress)).to.equal(naraIsCurrency0);

  const currency0 = naraIsCurrency0 ? naraAddress : usdcAddress;
  const currency1 = naraIsCurrency0 ? usdcAddress : naraAddress;
  const naraSeed = seed.nara ?? 60_000n * ONE;
  const usdcSeed = seed.usdc ?? 300n * USDC;
  const amount0 = naraIsCurrency0 ? naraSeed : usdcSeed;
  const amount1 = naraIsCurrency0 ? usdcSeed : naraSeed;
  const sqrtPriceX96 = sqrtPriceX96FromAmounts(amount0, amount1);
  const liquidity0 = (amount0 * sqrtPriceX96) / Q96;
  const liquidity1 = (amount1 * Q96) / sqrtPriceX96;
  const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  if (liquidity <= 4n)
    throw new Error("Real-pool fixture liquidity is too small");
  const minimumBootstrapLiquidity = liquidity - 4n;
  const laterPhaseMinimumActiveLiquidity = [
    liquidity - 3n,
    liquidity - 2n,
    liquidity - 1n,
    liquidity,
  ];

  const vault = await ethers.deployContract(
    "MockNARALiquidityGrowthVaultV5",
    [naraAddress, usdcAddress, managerAddress],
    owner
  );
  const phaseController = await ethers.deployContract(
    "MockNARALiquidityPhaseControllerV5",
    [],
    owner
  );
  await Promise.all([
    vault.waitForDeployment(),
    phaseController.waitForDeployment(),
  ]);

  const create2 = await ethers.deployContract(
    "Create2HookDeployer",
    [owner.address],
    owner
  );
  await create2.waitForDeployment();
  const create2Address = await create2.getAddress();

  const Hook = await ethers.getContractFactory(
    "NARALiquidityGrowthHookV5",
    owner
  );
  const deployTx = await Hook.getDeployTransaction(
    managerAddress,
    owner.address,
    naraAddress,
    usdcAddress,
    await vault.getAddress(),
    sqrtPriceX96,
    minimumBootstrapLiquidity,
    10_000n,
    10_000n,
    [1_250, 1_000, 750, 500],
    laterPhaseMinimumActiveLiquidity
  );
  if (typeof deployTx.data !== "string")
    throw new Error("Hook V5 init code unavailable");
  const mined = mineHookSalt(
    ethers,
    create2Address,
    deployTx.data,
    `NARA-V5-REAL-POOL-${naraIsCurrency0 ? "TOKEN0" : "TOKEN1"}`
  );
  await (await create2.deploy(mined.salt, deployTx.data)).wait();
  expect(BigInt(mined.address) & HOOK_FLAG_MASK).to.equal(REQUIRED_HOOK_FLAGS);

  const hook = await ethers.getContractAt(
    "NARALiquidityGrowthHookV5",
    mined.address,
    owner
  );
  const poolId = await hook.poolId();
  const phaseScheduleHash = await hook.phaseScheduleHash();
  await (
    await phaseController.configureStatic(poolId, phaseScheduleHash)
  ).wait();
  await (
    await hook.bindPhaseController(await phaseController.getAddress())
  ).wait();
  await (await vault.bind(mined.address, poolId)).wait();
  await (
    await phaseController.bind(mined.address, poolId, phaseScheduleHash)
  ).wait();
  await (await phaseController.setActiveProtocolLiquidity(liquidity)).wait();
  await (await phaseController.setActivationAllowed(true)).wait();

  const key = {
    currency0,
    currency1,
    fee: POOL_FEE,
    tickSpacing: TICK_SPACING,
    hooks: mined.address,
  };

  await nara.mint(owner.address, 1_200_000n * ONE);
  await usdc.mint(owner.address, 5_000n * USDC);
  await nara.approve(await liquidityRouter.getAddress(), ethers.MaxUint256);
  await usdc.approve(await liquidityRouter.getAddress(), ethers.MaxUint256);
  await nara.approve(await swapRouter.getAddress(), ethers.MaxUint256);
  await usdc.approve(await swapRouter.getAddress(), ethers.MaxUint256);

  await (await manager.initialize(key, sqrtPriceX96)).wait();
  await (
    await liquidityRouter[
      "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)"
    ](key, [MIN_TICK, MAX_TICK, liquidity, ethers.ZeroHash], "0x")
  ).wait();
  await (await hook.activatePool()).wait();

  const permissions = await hook.getHookPermissions();
  expect(permissions.beforeInitialize).to.equal(true);
  expect(permissions.beforeSwap).to.equal(true);
  expect(permissions.afterSwap).to.equal(true);
  expect(permissions.beforeSwapReturnDelta).to.equal(true);
  expect(permissions.afterSwapReturnDelta).to.equal(true);

  return {
    ethers,
    owner,
    provider,
    manager,
    managerAddress,
    swapRouter,
    hook,
    vault,
    phaseController,
    nara,
    usdc,
    naraAddress,
    usdcAddress,
    currency0,
    currency1,
    poolId,
    key,
  };
}

async function deployStaleEngineScenario() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [owner, inactiveRecipient, locker] = await ethers.getSigners();
  const provider = ethers.provider;

  const manager = await deployFoundryContract(ethers, owner, "PoolManager", [
    owner.address,
  ]);
  const managerAddress = await manager.getAddress();
  const liquidityRouter = await deployFoundryContract(
    ethers,
    owner,
    "PoolModifyLiquidityTest",
    [managerAddress]
  );
  const swapRouter = await deployFoundryContract(
    ethers,
    owner,
    "PoolSwapTest",
    [managerAddress]
  );

  const { nara, usdc, naraAddress, usdcAddress } = await deployTokenPair(
    ethers,
    owner,
    true
  );
  const currency0 = naraAddress;
  const currency1 = usdcAddress;
  const naraSeed = 60_000n * ONE;
  const usdcSeed = 300n * USDC;
  const sqrtPriceX96 = sqrtPriceX96FromAmounts(naraSeed, usdcSeed);
  const liquidity0 = (naraSeed * sqrtPriceX96) / Q96;
  const liquidity1 = (usdcSeed * Q96) / sqrtPriceX96;
  const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  const minimumBootstrapLiquidity = liquidity - 4n;
  const laterPhaseMinimumActiveLiquidity = [
    liquidity - 3n,
    liquidity - 2n,
    liquidity - 1n,
    liquidity,
  ];

  await nara.mint(owner.address, 1_500_000n * ONE);
  await usdc.mint(owner.address, 5_000n * USDC);

  const reserveAllocation = 100_000n * ONE;
  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("latest block unavailable");
  const epochOrigin = BigInt(latest.timestamp) + 600n;
  const reserve = await ethers.deployContract("NARARewardReserveV5", [
    owner.address,
    inactiveRecipient.address,
    naraAddress,
    reserveAllocation,
  ]);
  await reserve.waitForDeployment();
  const engine = await ethers.deployContract("NARAEngineV5", [
    owner.address,
    naraAddress,
    usdcAddress,
    await reserve.getAddress(),
    inactiveRecipient.address,
    {
      epochOrigin,
      epochLength: 60,
      minLockDuration: 600,
      maxLockDuration: 3_600,
      maxAdvancePerCall: 8,
      minWeightMultiplierWad: ONE,
      maxWeightMultiplierWad: ONE,
      emissionPerEpoch: ONE,
      emissionBootstrapWeight: 100n * ONE,
      minimumRewardWeight: 100n * ONE,
    },
  ]);
  await engine.waitForDeployment();
  const positionController = await ethers.deployContract(
    "NARAPositionControllerBindingHarnessV5",
    [await engine.getAddress(), naraAddress]
  );
  await positionController.waitForDeployment();
  const vault = await ethers.deployContract("NARALiquidityGrowthVaultV5", [
    owner.address,
    inactiveRecipient.address,
    naraAddress,
    usdcAddress,
    managerAddress,
    2_000,
  ]);
  await vault.waitForDeployment();

  await engine.bindPositionController(await positionController.getAddress());
  await engine.bindLiquidityFeeVault(await vault.getAddress());
  await reserve.bindEngine(await engine.getAddress());
  await nara.approve(await reserve.getAddress(), reserveAllocation);
  await reserve.fund(reserveAllocation);
  await reserve.seal();
  await engine.sealConfiguration();

  const create2 = await ethers.deployContract(
    "Create2HookDeployer",
    [owner.address],
    owner
  );
  await create2.waitForDeployment();
  const Hook = await ethers.getContractFactory(
    "NARALiquidityGrowthHookV5",
    owner
  );
  const deployTx = await Hook.getDeployTransaction(
    managerAddress,
    owner.address,
    naraAddress,
    usdcAddress,
    await vault.getAddress(),
    sqrtPriceX96,
    minimumBootstrapLiquidity,
    10_000n,
    10_000n,
    [1_250, 1_000, 750, 500],
    laterPhaseMinimumActiveLiquidity
  );
  if (typeof deployTx.data !== "string")
    throw new Error("Hook V5 init code unavailable");
  const mined = mineHookSalt(
    ethers,
    await create2.getAddress(),
    deployTx.data,
    "NARA-V5-REAL-VAULT-STALE-ENGINE"
  );
  await (await create2.deploy(mined.salt, deployTx.data)).wait();
  const hook = await ethers.getContractAt(
    "NARALiquidityGrowthHookV5",
    mined.address,
    owner
  );
  const poolId = await hook.poolId();
  const phaseScheduleHash = await hook.phaseScheduleHash();
  const key = {
    currency0,
    currency1,
    fee: POOL_FEE,
    tickSpacing: TICK_SPACING,
    hooks: mined.address,
  };

  const positionManager = await ethers.deployContract(
    "MockNamedPositionManagerV5"
  );
  await positionManager.waitForDeployment();
  const seedCustody = await ethers.deployContract("NARASeedPOLCustodyV5", [
    owner.address,
    inactiveRecipient.address,
    await positionManager.getAddress(),
    poolId,
    MIN_TICK,
    MAX_TICK,
    0,
    3_600,
  ]);
  await seedCustody.waitForDeployment();
  const compounder = await ethers.deployContract("NARALiquidityCompounderV5", [
    owner.address,
    owner.address,
    inactiveRecipient.address,
    naraAddress,
    usdcAddress,
    managerAddress,
    await positionManager.getAddress(),
    await vault.getAddress(),
    poolId,
    MIN_TICK,
    MAX_TICK,
    1,
    1,
    0,
    3_600,
  ]);
  await compounder.waitForDeployment();
  const phaseController = await ethers.deployContract(
    "NARALiquidityPhaseControllerV5",
    [
      owner.address,
      inactiveRecipient.address,
      managerAddress,
      await positionManager.getAddress(),
      await vault.getAddress(),
      await seedCustody.getAddress(),
      await compounder.getAddress(),
      poolId,
      phaseScheduleHash,
      [60, 60, 60, 60],
      [2, 2, 2, 2],
      0,
      3_600,
    ]
  );
  await phaseController.waitForDeployment();
  await hook.bindPhaseController(await phaseController.getAddress());
  const adapter = await ethers.deployContract(
    "MockLiquidityPositionAdapterV5",
    [
      naraAddress,
      usdcAddress,
      managerAddress,
      await positionManager.getAddress(),
      await compounder.getAddress(),
      key,
      MIN_TICK,
      MAX_TICK,
      5_000,
      5_000,
    ]
  );
  await adapter.waitForDeployment();

  const seedTokenId = await positionManager.nextTokenId();
  await positionManager.mintNamedPosition(
    await seedCustody.getAddress(),
    key,
    MIN_TICK,
    MAX_TICK,
    liquidity
  );
  await seedCustody.registerPosition(seedTokenId);
  await seedCustody.sealConfiguration(
    mined.address,
    await phaseController.getAddress()
  );
  await compounder.sealConfiguration(
    mined.address,
    await phaseController.getAddress(),
    await adapter.getAddress()
  );
  await vault.sealConfiguration(
    mined.address,
    await phaseController.getAddress(),
    await compounder.getAddress(),
    await engine.getAddress()
  );

  await nara.approve(await liquidityRouter.getAddress(), ethers.MaxUint256);
  await usdc.approve(await liquidityRouter.getAddress(), ethers.MaxUint256);
  await nara.approve(await swapRouter.getAddress(), ethers.MaxUint256);
  await usdc.approve(await swapRouter.getAddress(), ethers.MaxUint256);
  await (await manager.initialize(key, sqrtPriceX96)).wait();
  await (
    await liquidityRouter[
      "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)"
    ](key, [MIN_TICK, MAX_TICK, liquidity, ethers.ZeroHash], "0x")
  ).wait();
  await phaseController.sealConfiguration(mined.address);
  await hook.activatePool();

  const beforeOpen = await provider.getBlock("latest");
  if (!beforeOpen) throw new Error("latest block unavailable");
  if (BigInt(beforeOpen.timestamp) < epochOrigin) {
    await connection.provider.send("evm_setNextBlockTimestamp", [
      Number(epochOrigin),
    ]);
    await connection.provider.send("evm_mine", []);
  }
  await positionController.setCanonicalAccount(locker.address, true);
  const principal = 100n * ONE;
  await nara.transfer(locker.address, principal);
  await nara.connect(locker).approve(await engine.getAddress(), principal);
  await engine.connect(locker).openPosition(locker.address, principal, 600);

  return {
    connection,
    ethers,
    owner,
    inactiveRecipient,
    locker,
    provider,
    manager,
    swapRouter,
    hook,
    vault,
    engine,
    phaseController,
    nara,
    usdc,
    naraAddress,
    usdcAddress,
    currency0,
    poolId,
    key,
    epochOrigin,
  };
}

async function executeAndReconcile(
  scenario: Awaited<ReturnType<typeof deployScenario>>,
  inputCurrency: string,
  grossInput: bigint,
  hookData = "0x"
): Promise<SwapReceipt> {
  const {
    owner,
    manager,
    swapRouter,
    hook,
    vault,
    nara,
    usdc,
    naraAddress,
    usdcAddress,
    currency0,
    poolId,
    key,
  } = scenario;
  const isBuy = sameAddress(inputCurrency, usdcAddress);
  const inputToken = isBuy ? usdc : nara;
  const outputToken = isBuy ? nara : usdc;
  const outputCurrency = isBuy ? naraAddress : usdcAddress;
  const vaultAddress = await vault.getAddress();
  const swapRouterAddress = await swapRouter.getAddress();
  const zeroForOne = sameAddress(inputCurrency, currency0);
  const params = {
    zeroForOne,
    amountSpecified: -grossInput,
    sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
  };

  const walletInputBefore = await inputToken.balanceOf(owner.address);
  const walletOutputBefore = await outputToken.balanceOf(owner.address);
  const vaultInputBefore = await inputToken.balanceOf(vaultAddress);
  const vaultOutputBefore = await outputToken.balanceOf(vaultAddress);
  const inputCurrencyId = BigInt(inputCurrency);
  const outputCurrencyId = BigInt(outputCurrency);
  const vaultInputClaimBefore = await manager.balanceOf(
    vaultAddress,
    inputCurrencyId
  );
  const vaultOutputClaimBefore = await manager.balanceOf(
    vaultAddress,
    outputCurrencyId
  );
  const walletInputClaimBefore = await manager.balanceOf(
    owner.address,
    inputCurrencyId
  );
  const walletOutputClaimBefore = await manager.balanceOf(
    owner.address,
    outputCurrencyId
  );
  const totalTokenFeesBefore = await vault.totalTokenFees();
  const totalBaseFeesBefore = await vault.totalBaseFees();
  const directionalInputBefore = isBuy
    ? await vault.buyInputBaseFees()
    : await vault.sellInputTokenFees();
  const directionalOutputBefore = isBuy
    ? await vault.buyOutputTokenFees()
    : await vault.sellOutputBaseFees();
  const phase = BigInt(await hook.currentPhase());
  const feeBps = BigInt(await hook.currentFeeBps());

  const transaction = await swapRouter.swap(
    key,
    params,
    [false, false],
    hookData,
    { gasLimit: 6_000_000n }
  );
  const receipt = await transaction.wait();
  if (!receipt) throw new Error("Missing swap receipt");

  const feeEvent = parseEvent(receipt, hook, "SwapFeeClaimsAccrued");
  const managerEvent = parseEvent(receipt, manager, "Swap");
  parseEvent(receipt, vault, "SwapFeesRecorded");

  const args = feeEvent.args;
  const inputFee = feeFor(grossInput, feeBps);
  const ammInput = grossInput - inputFee;
  const grossOutput = BigInt(args.grossOutput);
  const outputFee = feeFor(grossOutput, feeBps);
  const netOutput = grossOutput - outputFee;

  expect(args.poolId).to.equal(poolId);
  expect(args.swapCaller).to.equal(swapRouterAddress);
  expect(args.phase).to.equal(phase);
  expect(args.inputCurrency).to.equal(inputCurrency);
  expect(args.outputCurrency).to.equal(outputCurrency);
  expect(args.grossInput).to.equal(grossInput);
  expect(args.inputFee).to.equal(inputFee);
  expect(args.ammInput).to.equal(ammInput);
  expect(args.outputFee).to.equal(outputFee);
  expect(args.netOutput).to.equal(netOutput);
  expect(args.feeBps).to.equal(feeBps);
  expect(args.isBuy).to.equal(isBuy);

  const rawAmount0 = BigInt(managerEvent.args.amount0);
  const rawAmount1 = BigInt(managerEvent.args.amount1);
  expect(managerEvent.args.id).to.equal(poolId);
  expect(managerEvent.args.sender).to.equal(swapRouterAddress);
  if (zeroForOne) {
    expect(rawAmount0).to.equal(-ammInput);
    expect(rawAmount1).to.equal(grossOutput);
  } else {
    expect(rawAmount0).to.equal(grossOutput);
    expect(rawAmount1).to.equal(-ammInput);
  }

  expect(await inputToken.balanceOf(owner.address)).to.equal(
    walletInputBefore - grossInput
  );
  expect(await outputToken.balanceOf(owner.address)).to.equal(
    walletOutputBefore + netOutput
  );
  // Hook fees remain inside PoolManager as ERC-6909 currency claims. No
  // physical token transfer to the vault occurs inside either callback.
  expect(await inputToken.balanceOf(vaultAddress)).to.equal(vaultInputBefore);
  expect(await outputToken.balanceOf(vaultAddress)).to.equal(vaultOutputBefore);
  expect(await manager.balanceOf(vaultAddress, inputCurrencyId)).to.equal(
    vaultInputClaimBefore + inputFee
  );
  expect(await manager.balanceOf(vaultAddress, outputCurrencyId)).to.equal(
    vaultOutputClaimBefore + outputFee
  );
  expect(await manager.balanceOf(owner.address, inputCurrencyId)).to.equal(
    walletInputClaimBefore
  );
  expect(await manager.balanceOf(owner.address, outputCurrencyId)).to.equal(
    walletOutputClaimBefore
  );

  const tokenFeeDelta = (await vault.totalTokenFees()) - totalTokenFeesBefore;
  const baseFeeDelta = (await vault.totalBaseFees()) - totalBaseFeesBefore;
  expect(tokenFeeDelta).to.equal(isBuy ? outputFee : inputFee);
  expect(baseFeeDelta).to.equal(isBuy ? inputFee : outputFee);
  expect(
    (isBuy
      ? await vault.buyInputBaseFees()
      : await vault.sellInputTokenFees()) - directionalInputBefore
  ).to.equal(inputFee);
  expect(
    (isBuy
      ? await vault.buyOutputTokenFees()
      : await vault.sellOutputBaseFees()) - directionalOutputBefore
  ).to.equal(outputFee);

  // PoolSwapTest completes only if every PoolManager currency delta settles to
  // zero. The raw Manager event plus exact wallet/vault deltas independently
  // prove that both positive hook deltas were funded and reconciled.
  expect(receipt.status).to.equal(1);

  return {
    blockNumber: receipt.blockNumber,
    grossInput,
    inputFee,
    ammInput,
    grossOutput,
    outputFee,
    netOutput,
  };
}

describe("NARALiquidityGrowthHookV5 - real Uniswap v4 PoolManager", () => {
  for (const naraIsCurrency0 of [true, false]) {
    it(`settles buys and sells across the 15%-to-5% curve with NARA as currency${
      naraIsCurrency0 ? "0" : "1"
    }`, async function () {
      this.timeout(240_000);
      const scenario = await deployScenario(naraIsCurrency0);
      const {
        ethers,
        provider,
        hook,
        phaseController,
        naraAddress,
        usdcAddress,
      } = scenario;
      const latest = await provider.getBlock("latest");
      if (!latest) throw new Error("latest block unavailable");
      const protectedHookData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "tuple(uint8 version,uint8 minimumAcceptedPhase,uint16 maximumPerLegFeeBps,uint16 maximumNominalCombinedHookFeeBps,uint64 deadline,bytes32 expectedPhaseScheduleHash,uint256 minimumNetOutput)",
        ],
        [
          [
            1,
            0,
            1_500,
            2_775,
            latest.timestamp + 3_600,
            await hook.phaseScheduleHash(),
            0,
          ],
        ]
      );

      const buySnapshot = await provider.send("evm_snapshot", []);
      await executeAndReconcile(
        scenario,
        usdcAddress,
        15n * USDC,
        protectedHookData
      );
      expect(await provider.send("evm_revert", [buySnapshot])).to.equal(true);

      const sellSnapshot = await provider.send("evm_snapshot", []);
      await executeAndReconcile(scenario, naraAddress, 1_000n * ONE);
      expect(await provider.send("evm_revert", [sellSnapshot])).to.equal(true);

      // Exercise every later fee phase in both directions against the
      // real PoolManager, then restore Bootstrap for the ladder and
      // pre-settlement-reserve regressions below.
      const phaseMatrixSnapshot = await provider.send("evm_snapshot", []);
      const laterPhaseFees = [1_250n, 1_000n, 750n, 500n];
      for (let phase = 1; phase <= laterPhaseFees.length; phase += 1) {
        await (await phaseController.advance(phase - 1)).wait();
        expect(await hook.currentPhase()).to.equal(BigInt(phase));
        expect(await hook.currentFeeBps()).to.equal(laterPhaseFees[phase - 1]);

        const phaseBuySnapshot = await provider.send("evm_snapshot", []);
        const phaseBuy = await executeAndReconcile(
          scenario,
          usdcAddress,
          15n * USDC
        );
        expect(phaseBuy.inputFee).to.equal(
          feeFor(15n * USDC, laterPhaseFees[phase - 1])
        );
        expect(await provider.send("evm_revert", [phaseBuySnapshot])).to.equal(
          true
        );

        const phaseSellSnapshot = await provider.send("evm_snapshot", []);
        const phaseSell = await executeAndReconcile(
          scenario,
          naraAddress,
          1_000n * ONE
        );
        expect(phaseSell.inputFee).to.equal(
          feeFor(1_000n * ONE, laterPhaseFees[phase - 1])
        );
        expect(await provider.send("evm_revert", [phaseSellSnapshot])).to.equal(
          true
        );
      }
      expect(await provider.send("evm_revert", [phaseMatrixSnapshot])).to.equal(
        true
      );

      if (naraIsCurrency0) {
        // Regression for the old callback design: a physical
        // transfer to the vault in beforeSwap would be capped by
        // PoolManager's pre-settlement token balance. Here the
        // 75,000 NARA fee is deliberately greater than that
        // balance, yet the swap settles because the fee is minted
        // to the vault as an ERC-6909 currency claim.
        const reserveCeilingSnapshot = await provider.send("evm_snapshot", []);
        const largeSellInput = 500_000n * ONE;
        const largeSellFee = feeFor(largeSellInput);
        const managerNaraBefore = await scenario.nara.balanceOf(
          scenario.managerAddress
        );
        expect(largeSellFee).to.equal(75_000n * ONE);
        expect(largeSellFee).to.be.greaterThan(managerNaraBefore);
        await executeAndReconcile(scenario, naraAddress, largeSellInput);
        expect(
          await provider.send("evm_revert", [reserveCeilingSnapshot])
        ).to.equal(true);
      }

      if (!naraIsCurrency0) return;

      const singleSnapshot = await provider.send("evm_snapshot", []);
      const single = await executeAndReconcile(
        scenario,
        usdcAddress,
        300n * USDC
      );
      expect(single.inputFee).to.equal(45n * USDC);
      expect(await provider.send("evm_revert", [singleSnapshot])).to.equal(
        true
      );

      let splitGrossInput = 0n;
      let splitInputFee = 0n;
      let splitGrossOutput = 0n;
      let splitOutputFee = 0n;
      let previousBlock = -1;
      for (let i = 0; i < 20; i += 1) {
        const leg = await executeAndReconcile(
          scenario,
          usdcAddress,
          15n * USDC
        );
        expect(leg.blockNumber).to.be.greaterThan(previousBlock);
        previousBlock = leg.blockNumber;
        splitGrossInput += leg.grossInput;
        splitInputFee += leg.inputFee;
        splitGrossOutput += leg.grossOutput;
        splitOutputFee += leg.outputFee;
      }

      expect(splitGrossInput).to.equal(300n * USDC);
      expect(splitInputFee).to.equal(single.inputFee);
      expect(splitInputFee).to.equal(45n * USDC);

      // Each output leg is charged against its actual AMM output. Ceil
      // rounding makes splitting no cheaper than charging the same 15%
      // to the aggregate of those exact outputs; excess is at most one
      // raw unit per additional leg.
      const aggregateOutputFee = feeFor(splitGrossOutput);
      expect(splitOutputFee).to.be.at.least(aggregateOutputFee);
      expect(splitOutputFee - aggregateOutputFee).to.be.at.most(19n);
    });
  }

  it("settles against a non-300-USDC real-pool seed without changing fee accounting", async function () {
    this.timeout(240_000);
    const scenario = await deployScenario(true, {
      nara: 80_000n * ONE,
      usdc: 725n * USDC,
    });

    expect(
      await scenario.usdc.balanceOf(scenario.managerAddress)
    ).to.be.greaterThan(300n * USDC);
    const buy = await executeAndReconcile(
      scenario,
      scenario.usdcAddress,
      37n * USDC
    );
    expect(buy.inputFee).to.equal(feeFor(37n * USDC));
  });

  it("keeps a stale real Engine swap live and irrevocably routes its exact backing inactive", async function () {
    this.timeout(240_000);
    const scenario = await deployStaleEngineScenario();
    const {
      connection,
      owner,
      inactiveRecipient,
      provider,
      manager,
      swapRouter,
      hook,
      vault,
      engine,
      phaseController,
      nara,
      usdc,
      naraAddress,
      usdcAddress,
      currency0,
      key,
    } = scenario;

    await phaseController.observeNextPhase();
    const observation = await phaseController.phaseObservation(1);
    await connection.provider.send("evm_setNextBlockTimestamp", [
      Number(observation.startedAt) + 60,
    ]);
    await phaseController.observeNextPhase();
    await phaseController.advanceQualifiedPhase();
    expect(await hook.currentPhase()).to.equal(1n);
    expect(await vault.routingState()).to.equal(2n);
    expect(await engine.totalActiveWeight()).to.equal(100n * ONE);
    expect(await engine.currentEpoch()).to.equal(0n);
    expect(await engine.targetEpoch()).to.be.greaterThan(0n);

    const grossInput = 15n * USDC;
    const feeBps = await hook.currentFeeBps();
    const inputFee = feeFor(grossInput, feeBps);
    const ammInput = grossInput - inputFee;
    const zeroForOne = sameAddress(usdcAddress, currency0);
    const params = {
      zeroForOne,
      amountSpecified: -grossInput,
      sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n,
    };
    const ownerBaseBefore = await usdc.balanceOf(owner.address);
    const ownerNaraBefore = await nara.balanceOf(owner.address);

    const transaction = await swapRouter.swap(
      key,
      params,
      [false, false],
      "0x",
      { gasLimit: 6_000_000n }
    );
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("Missing stale-Engine swap receipt");
    expect(receipt.status).to.equal(1);

    const feeEvent = parseEvent(receipt, hook, "SwapFeeClaimsAccrued");
    const engineEvent = parseEvent(receipt, engine, "LiquidityFeesAccounted");
    const vaultEngineEvent = parseEvent(receipt, vault, "EngineFeesAccounted");
    const grossOutput = BigInt(feeEvent.args.grossOutput);
    const outputFee = feeFor(grossOutput, feeBps);
    const netOutput = grossOutput - outputFee;
    const engineNara = (outputFee * 2_000n) / BPS;
    const engineBase = (inputFee * 2_000n) / BPS;

    expect(await usdc.balanceOf(owner.address)).to.equal(
      ownerBaseBefore - grossInput
    );
    expect(await nara.balanceOf(owner.address)).to.equal(
      ownerNaraBefore + netOutput
    );
    expect(feeEvent.args.ammInput).to.equal(ammInput);
    expect(engineEvent.args.rewardsActive).to.equal(false);
    expect(engineEvent.args.epochFresh).to.equal(false);
    expect(engineEvent.args.naraAmount).to.equal(engineNara);
    expect(engineEvent.args.baseAmount).to.equal(engineBase);
    expect(engineEvent.args.activeWeight).to.equal(100n * ONE);
    expect(engineEvent.args.processedEpoch).to.equal(0n);
    expect(engineEvent.args.targetEpoch).to.be.greaterThan(0n);
    expect(vaultEngineEvent.args.rewardsActive).to.equal(false);
    expect(await vault.sharedTokenEngineInactiveAccounted()).to.equal(
      engineNara
    );
    expect(await vault.sharedBaseEngineInactiveAccounted()).to.equal(
      engineBase
    );
    expect(await vault.sharedTokenEngineActiveAccounted()).to.equal(0n);
    expect(await vault.sharedBaseEngineActiveAccounted()).to.equal(0n);
    expect(await engine.pendingInactiveNaraFeeFunding()).to.equal(engineNara);
    expect(await engine.pendingInactiveBaseFeeFunding()).to.equal(engineBase);
    expect(await engine.pendingActiveNaraFeeFunding()).to.equal(0n);
    expect(await engine.pendingActiveBaseFeeFunding()).to.equal(0n);
    expect(
      await manager.balanceOf(await vault.getAddress(), BigInt(naraAddress))
    ).to.equal(outputFee);
    expect(
      await manager.balanceOf(await vault.getAddress(), BigInt(usdcAddress))
    ).to.equal(inputFee);

    // Catching the Engine up cannot reclassify the already-recorded share
    // for the otherwise eligible position.
    await engine.advanceEpochs(8);
    expect(await engine.currentEpoch()).to.equal(await engine.targetEpoch());
    expect(await engine.claimableToken(1n, usdcAddress)).to.equal(0n);
    expect(await engine.totalActiveNaraFeesAccounted()).to.equal(0n);
    expect(await engine.totalActiveBaseFeesAccounted()).to.equal(0n);

    const inactiveNaraBefore = await nara.balanceOf(inactiveRecipient.address);
    const inactiveBaseBefore = await usdc.balanceOf(inactiveRecipient.address);
    const syncTransaction = await engine
      .connect(owner)
      .syncLiquidityFeeBacking();
    const syncReceipt = await syncTransaction.wait();
    if (!syncReceipt) throw new Error("Missing Engine backing receipt");
    const routedEvent = parseEvent(
      syncReceipt,
      engine,
      "InactiveLiquidityFeesRouted"
    );
    expect(routedEvent.args.recipient).to.equal(inactiveRecipient.address);
    expect(routedEvent.args.naraAmount).to.equal(engineNara);
    expect(routedEvent.args.baseAmount).to.equal(engineBase);
    expect(
      (await nara.balanceOf(inactiveRecipient.address)) - inactiveNaraBefore
    ).to.equal(engineNara);
    expect(
      (await usdc.balanceOf(inactiveRecipient.address)) - inactiveBaseBefore
    ).to.equal(engineBase);
    expect(
      await manager.balanceOf(await vault.getAddress(), BigInt(naraAddress))
    ).to.equal(outputFee - engineNara);
    expect(
      await manager.balanceOf(await vault.getAddress(), BigInt(usdcAddress))
    ).to.equal(inputFee - engineBase);
    expect(await engine.pendingInactiveNaraFeeFunding()).to.equal(0n);
    expect(await engine.pendingInactiveBaseFeeFunding()).to.equal(0n);
    expect(await engine.totalInactiveNaraFeesRouted()).to.equal(engineNara);
    expect(await engine.totalInactiveBaseFeesRouted()).to.equal(engineBase);
    expect(await engine.totalLiquidityNaraFeesReceived()).to.equal(engineNara);
    expect(await engine.totalLiquidityBaseFeesReceived()).to.equal(engineBase);
    expect(await engine.claimableToken(1n, usdcAddress)).to.equal(0n);
    const [outstandingNara, outstandingBase] =
      await vault.engineClaimsOutstanding();
    expect(outstandingNara).to.equal(0n);
    expect(outstandingBase).to.equal(0n);
  });
});
