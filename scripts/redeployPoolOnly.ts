/**
 * Redeploy only the v4 pool layer (vault + hook + pool init) while keeping
 * the existing NARAToken and NARAEngine untouched.
 *
 * Use this when the existing pool has the wrong initial price and you need
 * a fresh PoolKey at the correct sqrtPriceX96.
 *
 * Required env:
 *   PRIVATE_KEY
 *   BASE_RPC_URL
 *   V4_NARA_TOKEN            existing deployed token address
 *   V4_ENGINE                existing deployed engine address
 *   V4_ADMIN_ADDRESS         final owner for vault, hook, and CREATE2 helper
 *   V4_INITIAL_NARA_AMOUNT   human NARA for sqrtPrice (e.g. 10000)
 *   V4_INITIAL_USDC_AMOUNT   human USDC for sqrtPrice (e.g. 300)
 *
 * Optional env:
 *   V4_HOOK_SALT_LABEL       default: NARA-V4-BASE-USDC-HOOK-2
 *   V4_SKIP_COMPOUNDER       default: 1 (leave compounder unset)
 *   V4_COMPOUNDER_ADDRESS    set to wire compounder in the vault
 *   V4_COMPOUND_KEEPER_ADDRESS authorized keeper for compound/split routes
 *
 * Usage:
 *   npx hardhat run scripts/redeployPoolOnly.ts --network base
 */

import hre from "hardhat";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_CHAIN_ID        = 8453n;
const BASE_USDC            = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_POOL_MANAGER    = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const REQUIRED_HOOK_FLAGS  = 0x2088n;
const HOOK_FLAG_MASK       = 0x3fffn;

type HardhatEthers = any;

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v || v.trim() === "") throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function envFlag(name: string): boolean {
  const v = optionalEnv(name);
  return v !== undefined && ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function envNumber(name: string, fallback: string): number {
  return parseInt(env(name, fallback), 10);
}

function sortAddresses(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function isqrt(value: bigint): bigint {
  if (value < 2n) return value;
  let x0 = value;
  let x1 = (x0 + value / x0) >> 1n;
  while (x1 < x0) { x0 = x1; x1 = (x0 + value / x0) >> 1n; }
  return x0;
}

function sqrtPriceX96(amount0: bigint, amount1: bigint): bigint {
  return isqrt((amount1 * (1n << 192n)) / amount0);
}

function mineHookSalt(
  ethers: HardhatEthers,
  create2Deployer: string,
  initCode: string,
  label: string,
  maxIter: number,
): { salt: string; address: string; iterations: number } {
  const initCodeHash = ethers.keccak256(initCode);
  const seedHash     = ethers.keccak256(ethers.toUtf8Bytes(label));
  for (let i = 0; i < maxIter; i++) {
    const salt      = ethers.keccak256(ethers.solidityPacked(["bytes32", "uint256"], [seedHash, BigInt(i)]));
    const candidate = ethers.getCreate2Address(create2Deployer, salt, initCodeHash);
    if ((BigInt(candidate) & HOOK_FLAG_MASK) === REQUIRED_HOOK_FLAGS) {
      return { salt, address: candidate, iterations: i + 1 };
    }
  }
  throw new Error(`No valid hook salt after ${maxIter} attempts`);
}

async function waitTx(label: string, txPromise: Promise<any>) {
  const tx = await txPromise;
  console.log(`  ${label}: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (receipt?.status !== 1) throw new Error(`${label} reverted`);
  return receipt;
}

function poolKeyHash(ethers: HardhatEthers, key: any): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address,address,uint24,int24,address)"],
      [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]],
    ),
  );
}

function writeLog(payload: Record<string, unknown>) {
  const dir = "deployments";
  if (!existsSync(dir)) mkdirSync(dir);
  const file = join(dir, `v4-pool-redeploy-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    file,
    JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
  console.log(`\nLog: ${file}`);
}

async function main() {
  const conn       = await hre.network.connect();
  const { ethers } = conn as any;
  const network    = await ethers.provider.getNetwork();
  const chainId    = network.chainId;
  const [deployer] = await ethers.getSigners();

  if (chainId !== BASE_CHAIN_ID && !envFlag("V4_ALLOW_NON_BASE")) {
    throw new Error(`Expected Base mainnet (8453), got ${chainId}`);
  }

  const tokenAddress  = ethers.getAddress(env("V4_NARA_TOKEN"));
  const engineAddress = ethers.getAddress(env("V4_ENGINE"));
  const finalAdmin    = ethers.getAddress(env("V4_ADMIN_ADDRESS"));
  const usdcAddress   = BASE_USDC;
  const poolManager   = BASE_POOL_MANAGER;
  const poolFee       = envNumber("V4_POOL_FEE", "3000");
  const tickSpacing   = envNumber("V4_TICK_SPACING", "60");
  const saltLabel     = env("V4_HOOK_SALT_LABEL", "NARA-V4-BASE-USDC-HOOK-2");
  const maxIter       = envNumber("V4_HOOK_SALT_MAX_ITERATIONS", "2000000");
  const compounder    = optionalEnv("V4_COMPOUNDER_ADDRESS");
  const compoundKeeper = optionalEnv("V4_COMPOUND_KEEPER_ADDRESS");
  const skipComp      = envFlag("V4_SKIP_COMPOUNDER");
  const naraHuman     = env("V4_INITIAL_NARA_AMOUNT");
  const usdcHuman     = env("V4_INITIAL_USDC_AMOUNT");
  const naraAmount    = ethers.parseUnits(naraHuman, 18);
  const usdcAmount    = ethers.parseUnits(usdcHuman, 6);

  if (compounder === undefined && !skipComp) {
    throw new Error("Set V4_COMPOUNDER_ADDRESS or V4_SKIP_COMPOUNDER=1");
  }

  console.log("NARA v4 — Pool-only redeploy");
  console.log("Network:     ", chainId.toString());
  console.log("Deployer:    ", deployer.address);
  console.log("Token:       ", tokenAddress);
  console.log("Engine:      ", engineAddress);
  console.log("Final admin: ", finalAdmin);
  console.log("Seed NARA:   ", naraHuman);
  console.log("Seed USDC:   ", usdcHuman);
  console.log("Salt label:  ", saltLabel);
  console.log("");

  // Verify existing contracts have code
  for (const [label, addr] of [["Token", tokenAddress], ["Engine", engineAddress]] as const) {
    const code = await ethers.provider.getCode(addr);
    if (code === "0x") throw new Error(`${label} has no code at ${addr}`);
  }
  const engineView = new ethers.Contract(engineAddress, ["function NARA() external view returns (address)"], deployer);
  const engineToken = ethers.getAddress(await engineView.NARA());
  if (engineToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(`Engine NARA mismatch: expected ${tokenAddress}, got ${engineToken}`);
  }

  // Step 1: deploy Liquidity Growth vault
  console.log("Step 1: deploy NARALiquidityGrowthVault");
  const vault = await ethers.deployContract(
    "contracts/v4/NARALiquidityGrowthVault.sol:NARALiquidityGrowthVault",
    [deployer.address, tokenAddress, usdcAddress],
    deployer,
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("  NARALiquidityGrowthVault:", vaultAddress);

  // Step 2: deploy CREATE2 helper
  console.log("Step 2: deploy Create2HookDeployer");
  const create2 = await ethers.deployContract(
    "contracts/v4/utils/Create2HookDeployer.sol:Create2HookDeployer",
    [deployer.address],
    deployer,
  );
  await create2.waitForDeployment();
  const create2Address = await create2.getAddress();
  console.log("  Create2HookDeployer:", create2Address);

  // Step 3: mine and deploy hook
  console.log("Step 3: mine hook salt and deploy NARALiquidityGrowthHook");
  const HookFactory = await ethers.getContractFactory(
    "contracts/v4/NARALiquidityGrowthHook.sol:NARALiquidityGrowthHook",
    deployer,
  );
  const hookDeployTx = await HookFactory.getDeployTransaction(
    poolManager,
    deployer.address,
    tokenAddress,
    usdcAddress,
    vaultAddress,
  );
  const hookInitCode = hookDeployTx.data as string;

  console.log("  Mining salt (may take a minute)…");
  const mined = mineHookSalt(ethers, create2Address, hookInitCode, saltLabel, maxIter);
  console.log("  Salt attempts:", mined.iterations);
  console.log("  Hook address: ", mined.address);

  await waitTx("create2.deploy(hook)", create2.deploy(mined.salt, hookInitCode, { gasLimit: 7_000_000n }));
  let hookCode = await ethers.provider.getCode(mined.address);
  if (hookCode === "0x") {
    await new Promise(r => setTimeout(r, 4000));
    hookCode = await ethers.provider.getCode(mined.address);
  }
  if (hookCode === "0x") throw new Error("Hook has no code after deployment");

  const hook = await ethers.getContractAt(
    "contracts/v4/NARALiquidityGrowthHook.sol:NARALiquidityGrowthHook",
    mined.address,
    deployer,
  );

  // Step 4: wire vault
  console.log("Step 4: wire vault → hook + engine");
  await waitTx("vault.setHook", vault.setHook(mined.address));
  await waitTx("vault.setEngine", vault.setEngine(engineAddress));
  if (!envFlag("V4_SKIP_REWARD_NOTIFIER_GRANT")) {
    await waitTx(
      "engine.grantRole(REWARD_NOTIFIER_ROLE, vault)",
      new ethers.Contract(
        engineAddress,
        ["function grantRole(bytes32 role,address account) external"],
        deployer,
      ).grantRole(ethers.id("REWARD_NOTIFIER_ROLE"), vaultAddress),
    );
  }
  if (compounder) {
    await waitTx("vault.setCompounder", vault.setCompounder(ethers.getAddress(compounder)));
  }
  if (compoundKeeper) {
    await waitTx("vault.setCompoundKeeper", vault.setCompoundKeeper(ethers.getAddress(compoundKeeper), true));
  }

  // Step 5: initialize pool
  console.log("Step 5: register and initialize NARA/USDC pool");
  const [currency0, currency1] = sortAddresses(tokenAddress, usdcAddress);
  const tokenIsC0 = currency0.toLowerCase() === tokenAddress.toLowerCase();
  const amount0   = tokenIsC0 ? naraAmount : usdcAmount;
  const amount1   = tokenIsC0 ? usdcAmount : naraAmount;
  const sqrtPrice = sqrtPriceX96(amount0, amount1);

  const key = { currency0, currency1, fee: poolFee, tickSpacing, hooks: mined.address };
  const pid = poolKeyHash(ethers, key);

  await waitTx("hook.setProtocolDepth(USDC)", hook.setProtocolDepth(usdcAddress, usdcAmount));
  await waitTx("hook.setProtocolDepth(NARA)", hook.setProtocolDepth(tokenAddress, naraAmount));
  await waitTx("hook.registerPool", hook.registerPool(key));

  const pm = new ethers.Contract(
    poolManager,
    ["function initialize((address,address,uint24,int24,address),uint160) external returns (int24)"],
    deployer,
  );
  await waitTx("PoolManager.initialize", pm.initialize(
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    sqrtPrice,
    { gasLimit: 1_000_000n },
  ));

  console.log("Step 6: transfer ownership to final admin");
  if (finalAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    await waitTx("hook.transferOwnership", hook.transferOwnership(finalAdmin));
    await waitTx("vault.transferOwnership", vault.transferOwnership(finalAdmin));
    await waitTx("create2.transferOwnership", create2.transferOwnership(finalAdmin));
  }
  for (const [label, contract] of [["hook", hook], ["vault", vault], ["create2", create2]] as const) {
    const owner = ethers.getAddress(await contract.owner());
    if (owner.toLowerCase() !== finalAdmin.toLowerCase()) {
      throw new Error(`${label} owner mismatch: expected ${finalAdmin}, got ${owner}`);
    }
  }

  console.log("");
  console.log("Pool initialized.");
  console.log("  Pool ID:   ", pid);
  console.log("  sqrtPriceX96:", sqrtPrice.toString());
  console.log("  Price:      ", Number(usdcAmount) / 1e6 / (Number(naraAmount) / 1e18), "USDC/NARA");

  console.log("");
  console.log("New addresses:");
  console.log("  NARALiquidityGrowthVault =", vaultAddress);
  console.log("  NARALiquidityGrowthHook  =", mined.address);
  console.log("  Pool ID               =", pid);
  console.log("");
  console.log("Next: update HOOK in seedV4Liquidity.ts to", mined.address);
  console.log("Then: npx tsx scripts/seedV4Liquidity.ts");

  writeLog({
    chainId: chainId.toString(),
    deployer: deployer.address,
    token: tokenAddress,
    engine: engineAddress,
    vault: vaultAddress,
    hook: mined.address,
    finalAdmin,
    hookSalt: mined.salt,
    hookSaltLabel: saltLabel,
    poolKey: key,
    poolId: pid,
    sqrtPriceX96: sqrtPrice.toString(),
    initialNaraAmount: naraAmount.toString(),
    initialUsdcAmount: usdcAmount.toString(),
    compounder: compounder ?? null,
    compoundKeeper: compoundKeeper ?? null,
  });
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
