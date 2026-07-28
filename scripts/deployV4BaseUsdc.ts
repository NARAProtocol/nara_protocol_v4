/**
 * Main Base deployment script for NARA v4 with a NARA/USDC Uniswap v4 pool.
 *
 * This script intentionally uses Base native USDC, not ETH and not WETH.
 * It deploys/wires the protocol and initializes the v4 pool price; it does
 * not mint the first LP position. Seed liquidity through PositionManager or
 * a reviewed compounder after this script completes.
 *
 * Required for live Base:
 *   PRIVATE_KEY
 *   BASE_RPC_URL
 *   V4_ADMIN_ADDRESS         final owner/role holder, ideally a Safe
 *   V4_TREASURY_ADDRESS      receives the 1,000,000 NARA supply
 *   V4_TOKEN_NAME            ERC-20 name for the fresh deploy
 *   V4_TOKEN_SYMBOL          ERC-20 symbol for the fresh deploy
 *   V4_INITIAL_NARA_AMOUNT   human NARA amount used for initial pool price/depth
 *   V4_INITIAL_USDC_AMOUNT   human USDC amount used for initial pool price/depth
 *
 * Recommended:
 *   V4_COMPOUNDER_ADDRESS    production v4 compounder adapter
 *   V4_COMPOUND_KEEPER_ADDRESS authorized keeper for compound/split routes
 *   TREASURY_PRIVATE_KEY     optional, only for EOA test deployments that auto-fund the sealed reward reserve
 *
 * Usage:
 *   npx hardhat run scripts/deployV4BaseUsdc.ts --network base
 */

import hre from "hardhat";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE_PERMIT2, BASE_POSITION_MANAGER, BASE_UNIVERSAL_ROUTER } from "./lib/v4LiveConfig.js";

const BASE_CHAIN_ID = 8453n;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_UNISWAP_V4_POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const REQUIRED_HOOK_FLAGS = 0x2088n;
const HOOK_FLAG_MASK = 0x3fffn;

const ENGINE_CONFIG_TYPE =
  "tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64)";

type HardhatEthers = any;

interface EngineConfig {
  eMax: bigint;
  beta0Wad: bigint;
  mWad: bigint;
  aWad: bigint;
  bWad: bigint;
  cWad: bigint;
  dWad: bigint;
  dripSplitWad: bigint;
  durationLinearWad: bigint;
  durationQuadraticWad: bigint;
  growthFactorWad: bigint;
  minBaseEmission: bigint;
  maxBaseEmission: bigint;
  warmupRateWad: bigint;
  bootstrapInitialWeight: bigint;
  bootstrapDecayWad: bigint;
  activationDelayEpochs: bigint;
  maxLockEpochs: bigint;
}

interface PoolKeyForScript {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.trim() === "") throw new Error(`Missing env: ${name}`);
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim();
}

function envFlag(name: string): boolean {
  const value = optionalEnv(name);
  if (value === undefined) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function requireNotDeployerOnBase(
  label: string,
  address_: string,
  deployer: string,
  chainId: bigint,
  bypassFlag: string,
) {
  if (
    chainId === BASE_CHAIN_ID &&
    address_.toLowerCase() === deployer.toLowerCase() &&
    !envFlag(bypassFlag)
  ) {
    throw new Error(`${label} must not be the deployer EOA on Base. Set ${bypassFlag}=1 only for intentional test deployments.`);
  }
}

function envNumber(name: string, fallback: string): number {
  const value = Number(env(name, fallback));
  if (!Number.isInteger(value)) throw new Error(`Invalid integer env: ${name}`);
  return value;
}

function envBigInt(name: string, fallback: string): bigint {
  return BigInt(env(name, fallback));
}

function sortAddresses(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("isqrt only accepts unsigned integers");
  if (value < 2n) return value;
  let x0 = value;
  let x1 = (x0 + value / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }
  return x0;
}

function sqrtPriceX96FromRawAmounts(amount0: bigint, amount1: bigint): bigint {
  if (amount0 <= 0n || amount1 <= 0n) throw new Error("Initial pool amounts must be positive");
  return isqrt((amount1 * (1n << 192n)) / amount0);
}

function configAsTuple(cfg: EngineConfig): unknown[] {
  return [
    cfg.eMax,
    cfg.beta0Wad,
    cfg.mWad,
    cfg.aWad,
    cfg.bWad,
    cfg.cWad,
    cfg.dWad,
    cfg.dripSplitWad,
    cfg.durationLinearWad,
    cfg.durationQuadraticWad,
    cfg.growthFactorWad,
    cfg.minBaseEmission,
    cfg.maxBaseEmission,
    cfg.warmupRateWad,
    cfg.bootstrapInitialWeight,
    cfg.bootstrapDecayWad,
    cfg.activationDelayEpochs,
    cfg.maxLockEpochs,
  ];
}

function buildEngineConfig(ethers: HardhatEthers): EngineConfig {
  return {
    eMax: ethers.parseUnits(env("CORE_EMAX", "1000000"), 18),
    beta0Wad: ethers.parseUnits(env("CORE_BETA0", "0.008"), 18),
    mWad: ethers.parseUnits(env("CORE_M", "0.25"), 18),
    aWad: ethers.parseUnits(env("CORE_A", "1.25"), 18),
    bWad: ethers.parseUnits(env("CORE_B", "0.90"), 18),
    cWad: ethers.parseUnits(env("CORE_C", "0.50"), 18),
    dWad: ethers.parseUnits(env("CORE_D", "0.50"), 18),
    dripSplitWad: ethers.parseUnits(env("CORE_DRIP_SPLIT", "0.85"), 18),
    durationLinearWad: ethers.parseUnits(env("CORE_DURATION_LINEAR", "0.8"), 18),
    durationQuadraticWad: ethers.parseUnits(env("CORE_DURATION_QUADRATIC", "1.2"), 18),
    growthFactorWad: ethers.parseUnits(env("CORE_GROWTH_FACTOR", "1.000104"), 18),
    minBaseEmission: ethers.parseUnits(env("CORE_MIN_BASE_EMISSION", "0.2"), 18),
    maxBaseEmission: ethers.parseUnits(env("CORE_MAX_BASE_EMISSION", "5"), 18),
    warmupRateWad: ethers.parseUnits(env("CORE_WARMUP_RATE", "0.00133"), 18),
    bootstrapInitialWeight: ethers.parseUnits(env("CORE_BOOTSTRAP_WEIGHT", "10000000"), 18),
    bootstrapDecayWad: ethers.parseUnits(env("CORE_BOOTSTRAP_DECAY", "0.9991"), 18),
    activationDelayEpochs: BigInt(envNumber("CORE_ACTIVATION_DELAY_EPOCHS", "8")),
    maxLockEpochs: BigInt(envNumber("CORE_MAX_LOCK_EPOCHS", "35040")),
  };
}

async function buildEngineCreationCode(
  ethers: HardhatEthers,
  admin: string,
  epochLengthSeconds: bigint,
  configChangeDelaySeconds: bigint,
  initialBaseEmission: bigint,
  cfg: EngineConfig,
): Promise<string> {
  const artifact = await hre.artifacts.readArtifact("contracts/v4/NARAEngine.sol:NARAEngine");
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint64", "uint64", "uint256", ENGINE_CONFIG_TYPE],
    [admin, epochLengthSeconds, configChangeDelaySeconds, initialBaseEmission, configAsTuple(cfg)],
  );
  return artifact.bytecode + encoded.slice(2);
}

function mineHookSalt(
  ethers: HardhatEthers,
  create2Deployer: string,
  initCode: string,
  seedLabel: string,
  maxIterations: number,
): { salt: string; address: string; iterations: number } {
  const initCodeHash = ethers.keccak256(initCode);
  const seedHash = ethers.keccak256(ethers.toUtf8Bytes(seedLabel));

  for (let i = 0; i < maxIterations; i += 1) {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint256"], [seedHash, BigInt(i)]),
    );
    const candidate = ethers.getCreate2Address(create2Deployer, salt, initCodeHash);
    if ((BigInt(candidate) & HOOK_FLAG_MASK) === REQUIRED_HOOK_FLAGS) {
      return { salt, address: candidate, iterations: i + 1 };
    }
  }

  throw new Error(`No hook salt found after ${maxIterations} attempts`);
}

function poolId(ethers: HardhatEthers, key: PoolKeyForScript): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address,address,uint24,int24,address)"],
      [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]],
    ),
  );
}

async function waitTx(label: string, txPromise: Promise<any>, confirmations = 1) {
  const tx = await txPromise;
  console.log(`${label}: ${tx.hash}`);
  const networkName = hre.globalOptions.network ?? "default";
  const effectiveConfirmations = networkName === "base" || networkName === "baseSepolia" ? confirmations : 1;
  const receipt = await tx.wait(effectiveConfirmations);
  if (receipt?.status !== 1) throw new Error(`${label} reverted`);
  return receipt;
}

function writeDeploymentLog(payload: Record<string, unknown>) {
  const dir = "deployments";
  if (!existsSync(dir)) mkdirSync(dir);
  const file = join(dir, `v4-base-usdc-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    file,
    JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2),
  );
  console.log(`Deployment log written: ${file}`);
}

function writeCanonicalDeploymentPointers(payload: Record<string, unknown>) {
  const dir = "deployments";
  if (!existsSync(dir)) mkdirSync(dir);
  const latestFile = join(dir, "v4-base-usdc-latest.json");
  writeFileSync(
    latestFile,
    JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2),
  );
  console.log(`Canonical latest deployment log written: ${latestFile}`);
}

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const networkName = hre.globalOptions.network ?? "default";
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  if (chainId !== BASE_CHAIN_ID && !envFlag("V4_ALLOW_NON_BASE")) {
    throw new Error(`Refusing non-Base deployment. Connected chainId=${chainId}.`);
  }

  const poolManagerAddress = ethers.getAddress(env("V4_POOL_MANAGER_BASE", BASE_UNISWAP_V4_POOL_MANAGER));
  const usdcAddress = ethers.getAddress(env("V4_BASE_USDC_ADDRESS", BASE_USDC));
  if (usdcAddress !== BASE_USDC) {
    throw new Error("V4_BASE_USDC_ADDRESS must be Base native USDC. This script is USDC-only.");
  }

  const requireExplicitV4Addresses = chainId === BASE_CHAIN_ID && !envFlag("V4_ALLOW_LEGACY_ADDRESS_FALLBACKS");
  const finalAdmin = ethers.getAddress(
    requireExplicitV4Addresses
      ? env("V4_ADMIN_ADDRESS")
      : env("V4_ADMIN_ADDRESS", optionalEnv("ROLE_HOLDER_ADDRESS") ?? deployer.address),
  );
  const treasury = ethers.getAddress(
    requireExplicitV4Addresses
      ? env("V4_TREASURY_ADDRESS")
      : env("V4_TREASURY_ADDRESS", optionalEnv("TREASURY_ADDRESS") ?? deployer.address),
  );
  requireNotDeployerOnBase("V4_ADMIN_ADDRESS", finalAdmin, deployer.address, chainId, "V4_ALLOW_DEPLOYER_ADMIN");
  requireNotDeployerOnBase("V4_TREASURY_ADDRESS", treasury, deployer.address, chainId, "V4_ALLOW_DEPLOYER_TREASURY");

  const poolFee = envNumber("V4_POOL_FEE", "3000");
  const tickSpacing = envNumber("V4_TICK_SPACING", "60");
  const epochLengthSeconds = BigInt(envNumber("EPOCH_LENGTH_SECONDS", "900"));
  const configChangeDelaySeconds = BigInt(envNumber("CONFIG_CHANGE_DELAY_SECONDS", "86400"));
  const initialBaseEmission = envBigInt("INITIAL_BASE_EMISSION", "500000000000000000");
  const canonicalTokenName = "NARA Token";
  const canonicalTokenSymbol = "NARA";
  const tokenName = env("V4_TOKEN_NAME", canonicalTokenName);
  const tokenSymbol = env("V4_TOKEN_SYMBOL", canonicalTokenSymbol);
  const initialNaraAmount = ethers.parseUnits(env("V4_INITIAL_NARA_AMOUNT"), 18);
  const initialUsdcAmount = ethers.parseUnits(env("V4_INITIAL_USDC_AMOUNT"), 6);
  const emissionReserveAmount = ethers.parseUnits(env("V4_EMISSION_RESERVE_NARA", "650000"), 18);
  const hookSaltLabel = env("V4_HOOK_SALT_LABEL", "NARA-V4-BASE-USDC-HOOK-1");
  const engineSalt = ethers.keccak256(ethers.toUtf8Bytes(env("V4_ENGINE_SALT_LABEL", "NARA-V4-BASE-USDC-ENGINE-1")));
  const maxHookSaltIterations = envNumber("V4_HOOK_SALT_MAX_ITERATIONS", "2000000");
  const compounder = optionalEnv("V4_COMPOUNDER_ADDRESS");
  const compoundKeeper = optionalEnv("V4_COMPOUND_KEEPER_ADDRESS");
  const skipCompounder = envFlag("V4_SKIP_COMPOUNDER");

  if (compounder === undefined && !skipCompounder) {
    throw new Error("Missing V4_COMPOUNDER_ADDRESS. Set it, or set V4_SKIP_COMPOUNDER=1 to deploy with pool-fee accumulation only.");
  }
  if (poolFee <= 0 || poolFee >= 1_000_000) throw new Error("V4_POOL_FEE must be between 1 and 999999");
  if (tickSpacing <= 0 || tickSpacing > 32767) throw new Error("V4_TICK_SPACING must be between 1 and 32767");
  if (initialNaraAmount <= 0n || initialUsdcAmount <= 0n) {
    throw new Error("V4_INITIAL_NARA_AMOUNT and V4_INITIAL_USDC_AMOUNT must be positive");
  }
  if (tokenName !== canonicalTokenName || tokenSymbol !== canonicalTokenSymbol) {
    throw new Error(
      `Token identity is frozen as ${canonicalTokenName} (${canonicalTokenSymbol}); ` +
      "V4_TOKEN_NAME and V4_TOKEN_SYMBOL must match the canonical values.",
    );
  }

  console.log("NARA v4 Base USDC deployment");
  console.log("Network:      ", networkName, chainId.toString());
  console.log("Deployer:     ", deployer.address);
  console.log("Final admin:  ", finalAdmin);
  console.log("Treasury:     ", treasury);
  console.log("PoolManager:  ", poolManagerAddress);
  console.log("USDC:         ", usdcAddress);
  console.log("Token name:   ", tokenName);
  console.log("Token symbol: ", tokenSymbol);
  console.log("Pool fee:     ", poolFee);
  console.log("Tick spacing: ", tickSpacing);
  console.log("Initial NARA: ", ethers.formatUnits(initialNaraAmount, 18));
  console.log("Initial USDC: ", ethers.formatUnits(initialUsdcAmount, 6));
  console.log("");

  if (chainId === BASE_CHAIN_ID) {
    for (const [label, address] of [["PoolManager", poolManagerAddress], ["USDC", usdcAddress]] as const) {
      const code = await ethers.provider.getCode(address);
      if (code === "0x") throw new Error(`${label} has no code at ${address}`);
    }
  }

  const cfg = buildEngineConfig(ethers);

  const existingLauncher = optionalEnv("V4_EXISTING_LAUNCHER");
  console.log(existingLauncher ? "Step 1: resume with existing launcher" : "Step 1: deploy launcher");
  const launcher = existingLauncher
    ? await ethers.getContractAt(
        "contracts/v4/NARALauncher.sol:NARALauncher",
        ethers.getAddress(existingLauncher),
        deployer,
      )
    : await ethers.deployContract(
        "contracts/v4/NARALauncher.sol:NARALauncher",
        [deployer.address],
        deployer,
      );
  if (!existingLauncher) {
    await launcher.waitForDeployment();
  } else if ((await ethers.provider.getCode(await launcher.getAddress())) === "0x") {
    throw new Error(`V4_EXISTING_LAUNCHER has no code: ${existingLauncher}`);
  }
  const launcherAddress = await launcher.getAddress();
  const launcherAdmin = await launcher.launcherAdmin();
  if (launcherAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`NARALauncher admin mismatch: expected ${deployer.address}, got ${launcherAdmin}`);
  }
  console.log("NARALauncher: ", launcherAddress);
  console.log("Launcher admin:", launcherAdmin);

  console.log("Step 2: launch token and engine");
  const engineCreationCode = await buildEngineCreationCode(
    ethers,
    deployer.address,
    epochLengthSeconds,
    configChangeDelaySeconds,
    initialBaseEmission,
    cfg,
  );
  await waitTx("launcher.launch", launcher.launch(treasury, engineCreationCode, engineSalt, tokenName, tokenSymbol), 2);

  const tokenAddress = await launcher.deployedToken();
  const engineAddress = await launcher.deployedEngine();
  const token = await ethers.getContractAt("contracts/v4/NARAToken.sol:NARAToken", tokenAddress, deployer);
  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", engineAddress, deployer);
  console.log("NARAToken:     ", tokenAddress);
  console.log("NARAEngine:    ", engineAddress);

  const engineCode = await ethers.provider.getCode(engineAddress);
  if (engineCode === "0x") throw new Error(`Launched engine has no code at ${engineAddress}`);
  if ((await token.FLASH_FEE_SINK()).toLowerCase() !== engineAddress.toLowerCase()) {
    throw new Error("NARAToken FLASH_FEE_SINK does not match launched engine");
  }
  if ((await engine.NARA()).toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error("NARAEngine NARA token binding does not match launched token");
  }

  console.log("Step 3: deploy and wire sealed reward reserve");
  let rewardReserveAddress: string | null = null;

  if (emissionReserveAmount > 0n) {
    const rewardReserve = await ethers.deployContract(
      "NARARewardReserve",
      [deployer.address, emissionReserveAmount],
      deployer,
    );
    await rewardReserve.waitForDeployment();
    rewardReserveAddress = await rewardReserve.getAddress();
    console.log("NARARewardReserve:", rewardReserveAddress);

    await waitTx("rewardReserve.setNara", rewardReserve.setNara(tokenAddress));
    await waitTx("rewardReserve.setEngine", rewardReserve.setEngine(engineAddress));
    await waitTx("engine.setRewardReserve", engine.setRewardReserve(rewardReserveAddress));

    const deployerTokenBalance = await token.balanceOf(deployer.address);
    if (deployerTokenBalance >= emissionReserveAmount) {
      await waitTx("token.transfer(rewardReserve)", token.transfer(rewardReserveAddress, emissionReserveAmount));
    } else {
      const treasuryKey = optionalEnv("TREASURY_PRIVATE_KEY");
      if (treasuryKey) {
        const treasurySigner = new ethers.Wallet(treasuryKey, ethers.provider);
        const treasuryBalance = await token.balanceOf(treasurySigner.address);
        if (treasuryBalance >= emissionReserveAmount) {
          console.log("Deployer has no NARA — using TREASURY_PRIVATE_KEY for reward deposit.");
          const tokenAsTreasury = token.connect(treasurySigner);
          await waitTx("token.transfer(rewardReserve) [treasury]", tokenAsTreasury.transfer(rewardReserveAddress, emissionReserveAmount));
        } else {
          console.log(`Skipping reward deposit: treasury also has insufficient NARA (${ethers.formatUnits(treasuryBalance, 18)}).`);
          if (envFlag("V4_REQUIRE_REWARD_DEPOSIT")) throw new Error("Required reward deposit was not funded");
        }
      } else {
        const fundingCalldata = token.interface.encodeFunctionData("transfer", [rewardReserveAddress, emissionReserveAmount]);
        console.log(
          `Skipping reward deposit: deployer has ${ethers.formatUnits(deployerTokenBalance, 18)} NARA, ` +
          `needs ${ethers.formatUnits(emissionReserveAmount, 18)} NARA. Fund the sealed reserve from treasury multisig.`,
        );
        console.log(
          `Treasury Safe action required: NARAToken.transfer(${rewardReserveAddress}, ` +
          `${emissionReserveAmount.toString()}) calldata=${fundingCalldata}`,
        );
        if (envFlag("V4_REQUIRE_REWARD_DEPOSIT")) throw new Error("Required reward deposit was not funded");
      }
    }
  } else {
    console.log("Sealed reward reserve skipped because V4_EMISSION_RESERVE_NARA=0.");
  }

  console.log("Step 4: set engine treasury");
  await waitTx("engine.setTreasury", engine.setTreasury(treasury));

  console.log("Step 5: deploy Liquidity Growth vault");
  const vault = await ethers.deployContract(
    "contracts/v4/NARALiquidityGrowthVault.sol:NARALiquidityGrowthVault",
    [deployer.address, tokenAddress, usdcAddress],
    deployer,
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("NARALiquidityGrowthVault:", vaultAddress);

  console.log("Step 6: deploy CREATE2 hook deployer");
  const create2Deployer = await ethers.deployContract(
    "contracts/v4/utils/Create2HookDeployer.sol:Create2HookDeployer",
    [deployer.address],
    deployer,
  );
  await create2Deployer.waitForDeployment();
  const create2DeployerAddress = await create2Deployer.getAddress();
  console.log("Create2HookDeployer:", create2DeployerAddress);

  console.log("Step 7: mine and deploy production hook");
  const HookFactory = await ethers.getContractFactory(
    "contracts/v4/NARALiquidityGrowthHook.sol:NARALiquidityGrowthHook",
    deployer,
  );
  const hookDeployTx = await HookFactory.getDeployTransaction(
    poolManagerAddress,
    deployer.address,
    tokenAddress,
    usdcAddress,
    vaultAddress,
  );
  const hookInitCode = hookDeployTx.data;
  if (typeof hookInitCode !== "string") throw new Error("Hook init code missing");

  const mined = mineHookSalt(ethers, create2DeployerAddress, hookInitCode, hookSaltLabel, maxHookSaltIterations);
  console.log("Hook salt:     ", mined.salt);
  console.log("Hook address:  ", mined.address);
  console.log("Salt attempts: ", mined.iterations);

  await waitTx("create2.deploy(hook)", create2Deployer.deploy(mined.salt, hookInitCode, { gasLimit: 7_000_000n }), 2);
  let hookCode = await ethers.provider.getCode(mined.address);
  if (hookCode === "0x") {
    await new Promise(resolve => setTimeout(resolve, 4000));
    hookCode = await ethers.provider.getCode(mined.address);
  }
  if (hookCode === "0x") throw new Error("Hook deployment produced no code");

  const hook = await ethers.getContractAt(
    "contracts/v4/NARALiquidityGrowthHook.sol:NARALiquidityGrowthHook",
    mined.address,
    deployer,
  );

  console.log("Step 8: bind vault and hook");
  await waitTx("vault.setHook", vault.setHook(mined.address));
  await waitTx("vault.setEngine", vault.setEngine(engineAddress));
  const rewardNotifierRole = ethers.id("REWARD_NOTIFIER_ROLE");
  await waitTx("engine.grantRole(REWARD_NOTIFIER_ROLE, vault)", engine.grantRole(rewardNotifierRole, vaultAddress));
  if (compounder !== undefined) {
    await waitTx("vault.setCompounder", vault.setCompounder(ethers.getAddress(compounder)));
    await waitTx("vault.freezeCompounder", vault.freezeCompounder());
  } else {
    console.log("Compounder intentionally left unset. Pool fees will accumulate in the vault.");
  }

  if (compoundKeeper !== undefined) {
    await waitTx("vault.setCompoundKeeper", vault.setCompoundKeeper(ethers.getAddress(compoundKeeper), true));
  }

  const keeperBountyBps = envNumber("V4_KEEPER_BOUNTY_BPS", "0");
  const minCompoundBase = ethers.parseUnits(env("V4_MIN_COMPOUND_BASE_USDC", "0"), 6);
  if (keeperBountyBps !== 0 || minCompoundBase !== 0n) {
    await waitTx("vault.setKeeperBounty", vault.setKeeperBounty(keeperBountyBps, minCompoundBase));
  }

  console.log("Step 9: register and initialize NARA/USDC pool");
  const [poolCurrency0, poolCurrency1] = sortAddresses(tokenAddress, usdcAddress);
  const tokenIsCurrency0 = poolCurrency0.toLowerCase() === tokenAddress.toLowerCase();
  const amount0 = tokenIsCurrency0 ? initialNaraAmount : initialUsdcAmount;
  const amount1 = tokenIsCurrency0 ? initialUsdcAmount : initialNaraAmount;
  const sqrtPriceX96 = sqrtPriceX96FromRawAmounts(amount0, amount1);
  const key: PoolKeyForScript = {
    currency0: poolCurrency0,
    currency1: poolCurrency1,
    fee: poolFee,
    tickSpacing,
    hooks: mined.address,
  };
  const id = poolId(ethers, key);

  await waitTx("hook.setProtocolDepth(USDC)", hook.setProtocolDepth(usdcAddress, initialUsdcAmount));
  await waitTx("hook.setProtocolDepth(NARA)", hook.setProtocolDepth(tokenAddress, initialNaraAmount));
  await waitTx("hook.registerPool", hook.registerPool(key));

  if (!envFlag("V4_SKIP_POOL_INITIALIZE")) {
    const poolManager = new ethers.Contract(
      poolManagerAddress,
      ["function initialize((address,address,uint24,int24,address) key,uint160 sqrtPriceX96) external returns (int24 tick)"],
      deployer,
    );
    const poolKeyTuple = [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks];
    await waitTx("PoolManager.initialize", poolManager.initialize(poolKeyTuple, sqrtPriceX96, { gasLimit: 1_000_000n }));
  } else {
    console.log("Pool initialization skipped by V4_SKIP_POOL_INITIALIZE=1");
  }

  console.log("Step 10: transfer final admin/owner controls");
  if (finalAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    const defaultAdminRole = ethers.ZeroHash;
    const paramRole = ethers.id("PARAM_ROLE");
    const treasuryRole = ethers.id("TREASURY_ROLE");
    for (const role of [defaultAdminRole, paramRole, treasuryRole, rewardNotifierRole]) {
      await waitTx(`engine.grantRole(${role})`, engine.grantRole(role, finalAdmin));
    }
    for (const role of [paramRole, treasuryRole, rewardNotifierRole, defaultAdminRole]) {
      await waitTx(`engine.renounceRole(${role})`, engine.renounceRole(role, deployer.address));
    }
    if (rewardReserveAddress !== null) {
      const rewardReserve = await ethers.getContractAt("NARARewardReserve", rewardReserveAddress, deployer);
      const reserveRoles = [ethers.ZeroHash, ethers.id("ADMIN_ROLE"), ethers.id("ENGINE_SETTER_ROLE")];
      for (const role of reserveRoles) {
        await waitTx(`rewardReserve.grantRole(${role})`, rewardReserve.grantRole(role, finalAdmin));
      }
      for (const role of reserveRoles) {
        await waitTx(`rewardReserve.renounceRole(${role})`, rewardReserve.renounceRole(role, deployer.address));
      }
    }
    await waitTx("hook.transferOwnership", hook.transferOwnership(finalAdmin));
    await waitTx("vault.transferOwnership", vault.transferOwnership(finalAdmin));
    await waitTx("create2Deployer.transferOwnership", create2Deployer.transferOwnership(finalAdmin));
  } else {
    console.log("Final admin is deployer; ownership/roles remain on deployer.");
  }

  const log = {
    generatedAt: new Date().toISOString(),
    network: networkName,
    chainId: chainId.toString(),
    deployer: deployer.address,
    finalAdmin,
    treasury,
    universalRouter: BASE_UNIVERSAL_ROUTER,
    permit2: BASE_PERMIT2,
    poolManager: poolManagerAddress,
    positionManager: BASE_POSITION_MANAGER,
    usdc: usdcAddress,
    launcher: launcherAddress,
    token: tokenAddress,
    tokenName,
    tokenSymbol,
    engine: engineAddress,
    rewardReserve: rewardReserveAddress,
    vault: vaultAddress,
    create2HookDeployer: create2DeployerAddress,
    hook: mined.address,
    hookSalt: mined.salt,
    hookRequiredFlags: "0x2088",
    hookSaltLabel,
    poolKey: key,
    poolId: id,
    poolFee,
    tickSpacing,
    sqrtPriceX96: sqrtPriceX96.toString(),
    initialNaraAmount: initialNaraAmount.toString(),
    initialUsdcAmount: initialUsdcAmount.toString(),
    emissionReserveAmount: emissionReserveAmount.toString(),
    engineConfig: configAsTuple(cfg),
    epochLengthSeconds: epochLengthSeconds.toString(),
    configChangeDelaySeconds: configChangeDelaySeconds.toString(),
    initialBaseEmission: initialBaseEmission.toString(),
    verifierCommands: {
      preflight: "npm run verify:v4:preflight",
      allocations: "npm run verify:v4:allocations",
    },
    nextSteps: [
      "Run npm run verify:v4:preflight",
      "Seed liquidity with scripts/seedV4Liquidity.ts",
      "Run the v4 smoke test before public launch",
    ],
    compounder: compounder ?? null,
    compoundKeeper: compoundKeeper ?? null,
  };
  if (envFlag("V4_SKIP_DEPLOYMENT_LOG")) {
    console.log("Deployment log skipped by V4_SKIP_DEPLOYMENT_LOG=1");
  } else {
    writeDeploymentLog(log);
    writeCanonicalDeploymentPointers(log);
  }

  console.log("");
  console.log("Deployment complete");
  console.log("NARAToken=", tokenAddress);
  console.log("NARAEngine=", engineAddress);
  console.log("NARALiquidityGrowthVault=", vaultAddress);
  console.log("NARALiquidityGrowthHook=", mined.address);
  console.log("NARA_USDC_POOL_ID=", id);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
