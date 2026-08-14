/**
 * Deploy and fund the NARA v4 allocation layer on Base.
 *
 * This does not open public bonds by default. It:
 *   1. Deploys NARAOpsVaultV4.
 *   2. Deploys NARABondVaultV4.
 *   3. Deploys NARAPositionAccountV4, modular NARAPositionRendererV5, NARAPositionNFTV4, and Genesis reward distributor.
 *   4. Deploys NARABondDepositoryV4NFT with capacity 0 and inactive terms by default.
 *   5. Authorizes the depository as Genesis minter.
 *   6. Optionally funds NARA into the ops vault via fund().
 *   7. Transfers the bond allocation into the bond vault.
 *   8. Sets engine.bondVault once, if still unset.
 *   9. Proposes the NFT depository as the bond vault market.
 *   10. Transfers all admin roles to V4_ADMIN_ADDRESS.
 *
 * Required env for Base:
 *   PRIVATE_KEY
 *   BASE_RPC_URL
 *   TREASURY_PRIVATE_KEY
 *   V4_ADMIN_ADDRESS
 *   V4_TREASURY_ADDRESS
 *
 * Optional env:
 *   V4_NARA_TOKEN                  default: latest fresh v4 deploy log token
 *   V4_ENGINE                      default: latest fresh v4 deploy log engine
 *   V4_GENESIS_REWARD_TOKEN        default: Base native USDC
 *   V4_LIQUIDITY_GROWTH_VAULT      default: latest v4 Base USDC vault if present
 *   V4_OPS_OWNER_ADDRESS           default: V4_ADMIN_ADDRESS
 *   V4_OPS_AMOUNT_NARA             default: 0 (keeps ops float liquid)
 *   V4_BOND_AMOUNT_NARA            default: 200000
 *   V4_MIN_TREASURY_FLOAT_NARA     default: 150000 (LP 70k + owner 40k + treasury 40k)
 *   V4_OPS_VESTING_DAYS            default: 365
 *   V4_BOND_ACTION_DELAY_SECONDS   default: 86400
 *   V4_BOND_ADMIN_DELAY_SECONDS    default: 86400
 *   V4_BOND_NARA_PER_ETH           default: 100
 *   V4_BOND_DISCOUNT_BPS           default: 0
 *   V4_BOND_REWARD_SPLIT           default: 0.30
 *   V4_BOND_MIN_DEPOSIT_ETH        default: 0.01
 *   V4_BOND_MAX_PAYOUT_NARA        default: 10000
 *   V4_BOND_LOCK_DURATION_EPOCHS   default: engine maxLockEpochs
 *   V4_BOND_GENESIS_ROUND_ID       default: 1
 *   V4_BOND_GENESIS_TIER_ID        default: 1
 *   V4_BOND_GENESIS_REWARD_MULTIPLIER_BPS default: 20000
 *   V4_BOND_GENESIS_ETERNAL        default: false
 *   V4_BOND_ACTIVE                 default: false
 *   V4_POSITION_NFT_OWNER_ADDRESS  default: V4_ADMIN_ADDRESS
 *   V4_POSITION_NFT_ROYALTY_BPS    default: 0
 *   V4_POSITION_NFT_ROYALTY_RECEIVER default: V4_TREASURY_ADDRESS
 *   V4_POSITION_NFT_FREEZE_ROYALTIES default: true
 *   V4_ALLOC_DRY_RUN               if 1, validates and exits before txs
 */

import hre from "hardhat";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
} from "./lib/v4LiveConfig.js";

const BASE_CHAIN_ID = 8453n;
const DEFAULT_BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const OPS_MAX_NARA = 10_000n;
const BOND_MAX_NARA = 290_000n;
const DEFAULT_BOND_NARA = 200_000n;
const DEFAULT_MIN_TREASURY_FLOAT_NARA = 150_000n;
const MIN_REMOTE_DELAY = 3600;
const DAY_SECONDS = 24 * 60 * 60;

type HardhatEthers = any;

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

function envFlag(name: string, fallback = false): boolean {
  const value = optionalEnv(name);
  if (value === undefined) return fallback;
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
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid non-negative integer env: ${name}`);
  return value;
}

function envBigInt(name: string, fallback: string): bigint {
  const value = BigInt(env(name, fallback));
  if (value < 0n) throw new Error(`Invalid negative integer env: ${name}`);
  return value;
}

function parseNara(ethers: HardhatEthers, name: string, fallback: string): bigint {
  return ethers.parseUnits(env(name, fallback), 18);
}

function formatNara(ethers: HardhatEthers, amount: bigint): string {
  return ethers.formatUnits(amount, 18);
}

async function waitTx(label: string, txPromise: Promise<any>, confirmations = 1): Promise<string> {
  const tx = await txPromise;
  console.log(`${label}: ${tx.hash}`);
  const networkName = hre.globalOptions.network ?? "default";
  const effectiveConfirmations = networkName === "base" || networkName === "baseSepolia" ? confirmations : 1;
  const receipt = await tx.wait(effectiveConfirmations);
  if (receipt?.status !== 1) throw new Error(`${label} reverted`);
  return tx.hash;
}

function writeDeploymentLog(payload: Record<string, unknown>): string {
  const dir = "deployments";
  if (!existsSync(dir)) mkdirSync(dir);
  const file = join(dir, `v4-allocations-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    file,
    JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2),
  );
  console.log(`Deployment log written: ${file}`);
  return file;
}

function latestCoreDeployment(): { token?: string; engine?: string; vault?: string } | undefined {
  const dir = "deployments";
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter(file => file.startsWith("v4-base-usdc-") && file.endsWith(".json"))
    .sort();
  const latest = files[files.length - 1];
  if (!latest) return undefined;
  const payload = JSON.parse(readFileSync(join(dir, latest), "utf8"));
  return { token: payload.token, engine: payload.engine, vault: payload.vault };
}

function buildTerms(ethers: HardhatEthers, maxLockEpochs: bigint) {
  const lockDuration = BigInt(envNumber("V4_BOND_LOCK_DURATION_EPOCHS", maxLockEpochs.toString()));
  return {
    naraPerEthWad: ethers.parseUnits(env("V4_BOND_NARA_PER_ETH", "100"), 18),
    discountBps: envNumber("V4_BOND_DISCOUNT_BPS", "0"),
    rewardSplitWad: ethers.parseUnits(env("V4_BOND_REWARD_SPLIT", "0.30"), 18),
    minDepositWei: ethers.parseEther(env("V4_BOND_MIN_DEPOSIT_ETH", "0.01")),
    maxPayoutNara: ethers.parseUnits(env("V4_BOND_MAX_PAYOUT_NARA", "10000"), 18),
    remainingCapacityNara: 0n,
    lockDurationEpochs: lockDuration,
    genesisRoundId: envNumber("V4_BOND_GENESIS_ROUND_ID", "1"),
    genesisTierId: envNumber("V4_BOND_GENESIS_TIER_ID", "1"),
    genesisRewardMultiplierBps: envNumber("V4_BOND_GENESIS_REWARD_MULTIPLIER_BPS", "20000"),
    genesisEternal: envFlag("V4_BOND_GENESIS_ETERNAL", false),
    active: envFlag("V4_BOND_ACTIVE", false),
  };
}

async function estimateGasFloor(
  ethers: HardhatEthers,
  deployer: any,
  tokenAddress: string,
  engineAddress: string,
  opsOwner: string,
  treasury: string,
  opsVestingSeconds: bigint,
  bondActionDelay: number,
  bondAmount: bigint,
  positionNftOwner: string,
  royaltyReceiver: string,
  royaltyBps: number,
  bondAdminDelay: number,
  terms: Record<string, unknown>,
): Promise<{ gas: bigint; weiAtGasPrice: bigint; gasPrice: bigint }> {
  const opsFactory = await ethers.getContractFactory("contracts/v4/NARAOpsVaultV4.sol:NARAOpsVaultV4", deployer);
  const bondVaultFactory = await ethers.getContractFactory("contracts/v4/NARABondVaultV4.sol:NARABondVaultV4", deployer);
  const positionAccountFactory = await ethers.getContractFactory(
    "contracts/v4/NARAPositionAccountV4.sol:NARAPositionAccountV4",
    deployer,
  );
  const artMetadataFactory = await ethers.getContractFactory(
    "contracts/v4/NARAArtMetadataV1.sol:NARAArtMetadataV1",
    deployer,
  );
  const artSecurityPrintFactory = await ethers.getContractFactory(
    "contracts/v4/NARAArtSecurityPrintV1.sol:NARAArtSecurityPrintV1",
    deployer,
  );
  const artCorePlateFactory = await ethers.getContractFactory(
    "contracts/v4/NARAArtCorePlateV1.sol:NARAArtCorePlateV1",
    deployer,
  );
  const artGenesisPlateFactory = await ethers.getContractFactory(
    "contracts/v4/NARAArtGenesisPlateV1.sol:NARAArtGenesisPlateV1",
    deployer,
  );
  const positionRendererFactory = await ethers.getContractFactory(
    "contracts/v4/NARAPositionRendererV5.sol:NARAPositionRendererV5",
    deployer,
  );
  const positionNftFactory = await ethers.getContractFactory(
    "contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4",
    deployer,
  );
  const genesisDistributorFactory = await ethers.getContractFactory(
    "contracts/v4/NARAGenesisRewardDistributorV4.sol:NARAGenesisRewardDistributorV4",
    deployer,
  );
  const depositoryFactory = await ethers.getContractFactory(
    "contracts/v4/NARABondDepositoryV4NFT.sol:NARABondDepositoryV4NFT",
    deployer,
  );

  const opsTx = await opsFactory.getDeployTransaction(tokenAddress, opsOwner, opsVestingSeconds);
  const bondVaultTx = await bondVaultFactory.getDeployTransaction(deployer.address, bondActionDelay, bondAmount);
  const positionAccountTx = await positionAccountFactory.getDeployTransaction();
  const artMetadataTx = await artMetadataFactory.getDeployTransaction();
  const artSecurityPrintTx = await artSecurityPrintFactory.getDeployTransaction();
  const artCorePlateTx = await artCorePlateFactory.getDeployTransaction(tokenAddress);
  const artGenesisPlateTx = await artGenesisPlateFactory.getDeployTransaction();
  const positionRendererTx = await positionRendererFactory.getDeployTransaction(
    tokenAddress,
    tokenAddress,
    tokenAddress,
    tokenAddress,
  );
  // Use tokenAddress as the placeholder implementation/NFT/vault for constructor gas estimation.
  // The real addresses are unknown before deployment; constructors only check code length.
  const positionNftTx = await positionNftFactory.getDeployTransaction(
    engineAddress,
    tokenAddress,
    tokenAddress,
    tokenAddress,
    deployer.address,
    royaltyReceiver,
    royaltyBps,
  );
  const genesisDistributorTx = await genesisDistributorFactory.getDeployTransaction(tokenAddress, tokenAddress);
  const depositoryTx = await depositoryFactory.getDeployTransaction(
    tokenAddress,
    engineAddress,
    tokenAddress,
    tokenAddress,
    deployer.address,
    treasury,
    bondAdminDelay,
    terms,
  );

  const deployGas =
    await ethers.provider.estimateGas({ ...opsTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...bondVaultTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...positionAccountTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...artMetadataTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...artSecurityPrintTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...artCorePlateTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...artGenesisPlateTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...positionRendererTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...positionNftTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...genesisDistributorTx, from: deployer.address }) +
    await ethers.provider.estimateGas({ ...depositoryTx, from: deployer.address });

  // setNara, Genesis distributor wiring, proposeMarket, role grants/renounces, and an L2 variance buffer.
  const adminTxBufferGas = 2_500_000n;
  const gas = deployGas + adminTxBufferGas;
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = BigInt(feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n);
  return { gas, weiAtGasPrice: gas * gasPrice, gasPrice };
}

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const networkName = hre.globalOptions.network ?? "default";
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const [deployer] = await ethers.getSigners();

  if (chainId !== BASE_CHAIN_ID && !envFlag("V4_ALLOC_ALLOW_NON_BASE")) {
    throw new Error(`Refusing non-Base allocation deploy. Connected chainId=${chainId}.`);
  }
  if (chainId === BASE_CHAIN_ID) {
    const deployment = await assertProductionV4Runtime(ethers.provider, currentV4Config());
    console.log(`Production runtime guard: ${productionV4RuntimeBanner(deployment)}`);
  }

  const latestCore = latestCoreDeployment();
  const tokenAddress = ethers.getAddress(env("V4_NARA_TOKEN", latestCore?.token));
  const engineAddress = ethers.getAddress(env("V4_ENGINE", latestCore?.engine));
  const genesisRewardToken = ethers.getAddress(env("V4_GENESIS_REWARD_TOKEN", DEFAULT_BASE_USDC));
  const liquidityGrowthVaultAddress = optionalEnv("V4_LIQUIDITY_GROWTH_VAULT") ?? latestCore?.vault;
  const finalAdmin = ethers.getAddress(env("V4_ADMIN_ADDRESS"));
  const treasury = ethers.getAddress(env("V4_TREASURY_ADDRESS"));
  const opsOwner = ethers.getAddress(env("V4_OPS_OWNER_ADDRESS", finalAdmin));
  const positionNftOwner = ethers.getAddress(env("V4_POSITION_NFT_OWNER_ADDRESS", finalAdmin));
  const royaltyReceiver = ethers.getAddress(env("V4_POSITION_NFT_ROYALTY_RECEIVER", treasury));
  const royaltyBps = envNumber("V4_POSITION_NFT_ROYALTY_BPS", "0");
  const freezePositionNftRoyalties = envFlag("V4_POSITION_NFT_FREEZE_ROYALTIES", true);

  const claimFeeRecipient = optionalEnv("V4_POSITION_NFT_CLAIM_FEE_RECIPIENT");
  const naraClaimFeeBps = envNumber("V4_POSITION_NFT_NARA_CLAIM_FEE_BPS", "0");
  const tokenClaimFeeBps = envNumber("V4_POSITION_NFT_TOKEN_CLAIM_FEE_BPS", "0");
  const freezeClaimFees = envFlag("V4_POSITION_NFT_FREEZE_CLAIM_FEES", false);
  requireNotDeployerOnBase("V4_ADMIN_ADDRESS", finalAdmin, deployer.address, chainId, "V4_ALLOC_ALLOW_DEPLOYER_ADMIN");
  requireNotDeployerOnBase("V4_TREASURY_ADDRESS", treasury, deployer.address, chainId, "V4_ALLOC_ALLOW_DEPLOYER_TREASURY");
  requireNotDeployerOnBase(
    "V4_POSITION_NFT_OWNER_ADDRESS",
    positionNftOwner,
    deployer.address,
    chainId,
    "V4_ALLOC_ALLOW_DEPLOYER_POSITION_NFT_OWNER",
  );

  const treasuryKey = env("TREASURY_PRIVATE_KEY");
  const treasurySigner = new ethers.Wallet(treasuryKey, ethers.provider);
  if (treasurySigner.address.toLowerCase() !== treasury.toLowerCase() && !envFlag("V4_ALLOW_TREASURY_KEY_MISMATCH")) {
    throw new Error(`TREASURY_PRIVATE_KEY address ${treasurySigner.address} does not match V4_TREASURY_ADDRESS ${treasury}`);
  }

  const adminKey = optionalEnv("OWNER_PRIVATE_KEY");
  const adminSigner = adminKey ? new ethers.Wallet(adminKey, ethers.provider) : deployer;
  if (
    adminKey &&
    adminSigner.address.toLowerCase() !== finalAdmin.toLowerCase() &&
    !envFlag("V4_ALLOW_ADMIN_KEY_MISMATCH")
  ) {
    throw new Error(`OWNER_PRIVATE_KEY address ${adminSigner.address} does not match V4_ADMIN_ADDRESS ${finalAdmin}`);
  }

  const opsAmount = parseNara(ethers, "V4_OPS_AMOUNT_NARA", "0");
  const bondAmount = parseNara(ethers, "V4_BOND_AMOUNT_NARA", DEFAULT_BOND_NARA.toString());
  const minTreasuryFloat = parseNara(
    ethers,
    "V4_MIN_TREASURY_FLOAT_NARA",
    DEFAULT_MIN_TREASURY_FLOAT_NARA.toString(),
  );
  const opsVestingDays = envBigInt("V4_OPS_VESTING_DAYS", "365");
  const opsVestingSeconds = opsVestingDays * 24n * 60n * 60n;
  const bondActionDelay = envNumber("V4_BOND_ACTION_DELAY_SECONDS", DAY_SECONDS.toString());
  const bondAdminDelay = envNumber("V4_BOND_ADMIN_DELAY_SECONDS", DAY_SECONDS.toString());
  const totalAllocation = opsAmount + bondAmount;

  const maxOpsAmount = OPS_MAX_NARA * 10n ** 18n;
  if (opsAmount !== 0n && opsAmount !== maxOpsAmount) {
    throw new Error("V4_OPS_AMOUNT_NARA must be 0 or exactly 10,000 after the ops vault funding hardening");
  }
  if (opsAmount !== 0n && opsOwner.toLowerCase() !== treasury.toLowerCase()) {
    throw new Error("NARAOpsVaultV4.fund is owner-only; set V4_OPS_OWNER_ADDRESS to V4_TREASURY_ADDRESS for funded ops deployments, then transfer ownership after funding.");
  }
  if (bondAmount > BOND_MAX_NARA * 10n ** 18n) throw new Error("V4_BOND_AMOUNT_NARA exceeds 290,000 cap");
  if (royaltyBps > 1000) throw new Error("V4_POSITION_NFT_ROYALTY_BPS exceeds 1000 cap");
  if (naraClaimFeeBps > 1000) throw new Error("V4_POSITION_NFT_NARA_CLAIM_FEE_BPS exceeds 1000 cap");
  if (tokenClaimFeeBps > 1000) throw new Error("V4_POSITION_NFT_TOKEN_CLAIM_FEE_BPS exceeds 1000 cap");
  if (freezeClaimFees && claimFeeRecipient === undefined && (naraClaimFeeBps !== 0 || tokenClaimFeeBps !== 0)) {
    throw new Error("Cannot freeze non-zero claim fees without setting V4_POSITION_NFT_CLAIM_FEE_RECIPIENT");
  }
  if (chainId === BASE_CHAIN_ID && !freezePositionNftRoyalties && !envFlag("V4_ALLOC_ALLOW_MUTABLE_ROYALTIES")) {
    throw new Error("Base allocation deploy requires frozen position NFT royalties. Set V4_ALLOC_ALLOW_MUTABLE_ROYALTIES=1 only for an intentional exception.");
  }
  if (totalAllocation + minTreasuryFloat > 300_000n * 10n ** 18n) {
    throw new Error("Allocation would consume the required treasury float for ops and LP seed.");
  }
  if (bondActionDelay < MIN_REMOTE_DELAY && !envFlag("V4_ALLOW_SHORT_BOND_DELAY")) {
    throw new Error(`V4_BOND_ACTION_DELAY_SECONDS below ${MIN_REMOTE_DELAY}; set V4_ALLOW_SHORT_BOND_DELAY=1 only for intentional tests.`);
  }
  if (bondAdminDelay < MIN_REMOTE_DELAY && !envFlag("V4_ALLOW_SHORT_BOND_DELAY")) {
    throw new Error(`V4_BOND_ADMIN_DELAY_SECONDS below ${MIN_REMOTE_DELAY}; set V4_ALLOW_SHORT_BOND_DELAY=1 only for intentional tests.`);
  }

  const token = await ethers.getContractAt("contracts/v4/NARAToken.sol:NARAToken", tokenAddress, treasurySigner);
  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", engineAddress, adminSigner);

  for (const [label, address] of [["NARAToken", tokenAddress], ["NARAEngine", engineAddress]] as const) {
    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`${label} has no code at ${address}`);
  }
  const genesisRewardTokenCode = await ethers.provider.getCode(genesisRewardToken);
  if (genesisRewardTokenCode === "0x") {
    if (chainId === BASE_CHAIN_ID) throw new Error(`Genesis reward token has no code at ${genesisRewardToken}`);
    console.log(`Genesis reward token has no local code at ${genesisRewardToken}; continuing because this is a non-Base rehearsal.`);
  }

  const cfg = await engine.config();
  const terms = buildTerms(ethers, cfg.maxLockEpochs);

  const treasuryNara = await token.balanceOf(treasurySigner.address);
  const treasuryEth = await ethers.provider.getBalance(treasurySigner.address);
  const deployerEth = await ethers.provider.getBalance(deployer.address);
  const currentEngineBondVault = await engine.bondVault();
  const gasFloor = await estimateGasFloor(
    ethers,
    deployer,
    tokenAddress,
    engineAddress,
    opsOwner,
    treasury,
    opsVestingSeconds,
    bondActionDelay,
    bondAmount,
    positionNftOwner,
    royaltyReceiver,
    royaltyBps,
    bondAdminDelay,
    terms,
  );

  console.log("NARA v4 allocation deploy");
  console.log("Network:        ", networkName, chainId.toString());
  console.log("Deployer:       ", deployer.address);
  console.log("Final admin:    ", finalAdmin);
  console.log("Treasury:       ", treasurySigner.address);
  console.log("Token:          ", tokenAddress);
  console.log("Engine:         ", engineAddress);
  console.log("Genesis reward token:", genesisRewardToken);
  console.log("Liquidity Growth vault:", liquidityGrowthVaultAddress ?? "not configured");
  console.log("Ops owner:      ", opsOwner);
  console.log("Position NFT owner:", positionNftOwner);
  console.log("Position NFT royalty receiver:", royaltyReceiver);
  console.log("Position NFT royalty bps:", royaltyBps);
  console.log("Position NFT freeze royalties:", freezePositionNftRoyalties);
  console.log("Ops amount:     ", formatNara(ethers, opsAmount), "NARA");
  console.log("Bond amount:    ", formatNara(ethers, bondAmount), "NARA");
  console.log("Total split:    ", formatNara(ethers, totalAllocation), "NARA");
  console.log("Min float:      ", formatNara(ethers, minTreasuryFloat), "NARA");
  console.log("Ops vesting:    ", opsVestingDays.toString(), "days");
  console.log("Bond delay:     ", bondActionDelay, "seconds");
  console.log("Bond active:    ", terms.active);
  console.log("Bond Genesis round:", terms.genesisRoundId);
  console.log("Bond Genesis tier:", terms.genesisTierId);
  console.log("Bond Genesis multiplier bps:", terms.genesisRewardMultiplierBps);
  console.log("Bond Genesis eternal:", terms.genesisEternal);
  console.log("Bond capacity:  0 NARA");
  console.log("Treasury float after split:", formatNara(ethers, treasuryNara - totalAllocation), "NARA");
  console.log("Treasury NARA:  ", formatNara(ethers, treasuryNara), "NARA");
  console.log("Treasury ETH:   ", ethers.formatEther(treasuryEth), "ETH");
  console.log("Deployer ETH:   ", ethers.formatEther(deployerEth), "ETH");
  console.log("Gas floor:      ", gasFloor.gas.toString(), "gas");
  console.log("Gas price:      ", gasFloor.gasPrice.toString(), "wei");
  console.log("Gas floor ETH:  ", ethers.formatEther(gasFloor.weiAtGasPrice), "ETH before L1/data buffer");
  console.log("Engine bondVault:", currentEngineBondVault);
  console.log("");

  if (treasuryNara < totalAllocation) {
    throw new Error(`Treasury has ${formatNara(ethers, treasuryNara)} NARA; needs ${formatNara(ethers, totalAllocation)} NARA.`);
  }
  if (treasuryNara - totalAllocation < minTreasuryFloat) {
    throw new Error(
      `Treasury float would be ${formatNara(ethers, treasuryNara - totalAllocation)} NARA; ` +
      `minimum is ${formatNara(ethers, minTreasuryFloat)} NARA.`,
    );
  }
  if (deployerEth === 0n) throw new Error("Deployer has zero ETH for contract deployment gas.");
  if (treasuryEth === 0n) throw new Error("Treasury signer has zero ETH for NARA funding gas.");
  if (deployerEth < gasFloor.weiAtGasPrice && !envFlag("V4_IGNORE_LOW_DEPLOYER_ETH")) {
    throw new Error("Deployer ETH is below estimated gas floor. Fund deployer or set V4_IGNORE_LOW_DEPLOYER_ETH=1 if you accept the risk.");
  }

  if (envFlag("V4_ALLOC_DRY_RUN")) {
    console.log("Dry run complete. No transactions sent.");
    return;
  }

  const txs: Record<string, string> = {};

  console.log("Step 1: deploy ops vault");
  const opsVault = await ethers.deployContract(
    "contracts/v4/NARAOpsVaultV4.sol:NARAOpsVaultV4",
    [tokenAddress, opsOwner, opsVestingSeconds],
    deployer,
  );
  await opsVault.waitForDeployment();
  const opsVaultAddress = await opsVault.getAddress();
  console.log("NARAOpsVaultV4:", opsVaultAddress);

  console.log("Step 2: deploy bond vault");
  const bondVault = await ethers.deployContract(
    "contracts/v4/NARABondVaultV4.sol:NARABondVaultV4",
    [deployer.address, bondActionDelay, bondAmount],
    deployer,
  );
  await bondVault.waitForDeployment();
  const bondVaultAddress = await bondVault.getAddress();
  console.log("NARABondVaultV4:", bondVaultAddress);

  console.log("Step 3: bind NARA token to bond vault");
  txs.bondVaultSetNara = await waitTx("bondVault.setNara", bondVault.setNara(tokenAddress));
  const bondVaultNara = await bondVault.nara();
  if (bondVaultNara.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(`Bond vault NARA mismatch: expected ${tokenAddress}, got ${bondVaultNara}`);
  }

  console.log("Step 4: deploy position account implementation");
  const positionAccount = await ethers.deployContract(
    "contracts/v4/NARAPositionAccountV4.sol:NARAPositionAccountV4",
    [],
    deployer,
  );
  await positionAccount.waitForDeployment();
  const positionAccountAddress = await positionAccount.getAddress();
  console.log("NARAPositionAccountV4:", positionAccountAddress);

  console.log("Step 5: deploy modular position art stack + renderer");
  const artMetadata = await ethers.deployContract(
    "contracts/v4/NARAArtMetadataV1.sol:NARAArtMetadataV1",
    [],
    deployer,
  );
  const artSecurityPrint = await ethers.deployContract(
    "contracts/v4/NARAArtSecurityPrintV1.sol:NARAArtSecurityPrintV1",
    [],
    deployer,
  );
  await artMetadata.waitForDeployment();
  await artSecurityPrint.waitForDeployment();
  const artMetadataAddress = await artMetadata.getAddress();
  const artSecurityPrintAddress = await artSecurityPrint.getAddress();
  console.log("NARAArtMetadataV1:", artMetadataAddress);
  console.log("NARAArtSecurityPrintV1:", artSecurityPrintAddress);

  const artCorePlate = await ethers.deployContract(
    "contracts/v4/NARAArtCorePlateV1.sol:NARAArtCorePlateV1",
    [artSecurityPrintAddress],
    deployer,
  );
  const artGenesisPlate = await ethers.deployContract(
    "contracts/v4/NARAArtGenesisPlateV1.sol:NARAArtGenesisPlateV1",
    [],
    deployer,
  );
  await artCorePlate.waitForDeployment();
  await artGenesisPlate.waitForDeployment();
  const artCorePlateAddress = await artCorePlate.getAddress();
  const artGenesisPlateAddress = await artGenesisPlate.getAddress();
  console.log("NARAArtCorePlateV1:", artCorePlateAddress);
  console.log("NARAArtGenesisPlateV1:", artGenesisPlateAddress);

  const positionRenderer = await ethers.deployContract(
    "contracts/v4/NARAPositionRendererV5.sol:NARAPositionRendererV5",
    [artMetadataAddress, artCorePlateAddress, artGenesisPlateAddress, artSecurityPrintAddress],
    deployer,
  );
  await positionRenderer.waitForDeployment();
  const positionRendererAddress = await positionRenderer.getAddress();
  console.log("NARAPositionRendererV5:", positionRendererAddress);

  console.log("Step 6: deploy position NFT");
  const positionNft = await ethers.deployContract(
    "contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4",
    [
      engineAddress,
      tokenAddress,
      positionAccountAddress,
      positionRendererAddress,
      deployer.address,
      royaltyReceiver,
      royaltyBps,
    ],
    deployer,
  );
  await positionNft.waitForDeployment();
  const positionNftAddress = await positionNft.getAddress();
  console.log("NARAPositionNFTV4:", positionNftAddress);

  console.log("Step 7: deploy Genesis reward distributor");
  const genesisRewardDistributor = await ethers.deployContract(
    "contracts/v4/NARAGenesisRewardDistributorV4.sol:NARAGenesisRewardDistributorV4",
    [positionNftAddress, genesisRewardToken],
    deployer,
  );
  await genesisRewardDistributor.waitForDeployment();
  const genesisRewardDistributorAddress = await genesisRewardDistributor.getAddress();
  console.log("NARAGenesisRewardDistributorV4:", genesisRewardDistributorAddress);

  console.log("Step 8: bind Genesis reward distributor to position NFT");
  txs.positionNftSetGenesisRewardDistributor = await waitTx(
    "positionNft.setGenesisRewardDistributor",
    positionNft.setGenesisRewardDistributor(genesisRewardDistributorAddress),
  );

  if (liquidityGrowthVaultAddress !== undefined) {
    console.log("Step 9: bind Genesis reward distributor to Liquidity Growth vault");
    const growthVault = await ethers.getContractAt(
      "contracts/v4/NARALiquidityGrowthVault.sol:NARALiquidityGrowthVault",
      ethers.getAddress(liquidityGrowthVaultAddress),
      adminSigner,
    );
    const currentDistributor = await growthVault.genesisRewardDistributor();
    if (currentDistributor === ethers.ZeroAddress) {
      txs.growthVaultSetGenesisRewardDistributor = await waitTx(
        "growthVault.setGenesisRewardDistributor",
        growthVault.setGenesisRewardDistributor(genesisRewardDistributorAddress),
      );
    } else if (currentDistributor.toLowerCase() !== genesisRewardDistributorAddress.toLowerCase()) {
      throw new Error(`Liquidity Growth vault already uses Genesis distributor ${currentDistributor}`);
    } else {
      console.log("Liquidity Growth vault already points at this Genesis reward distributor.");
    }
  } else {
    console.log("Step 9: Liquidity Growth vault binding skipped; set V4_LIQUIDITY_GROWTH_VAULT to wire it.");
  }

  console.log("Step 10: deploy NFT bond depository");
  const bondDepository = await ethers.deployContract(
    "contracts/v4/NARABondDepositoryV4NFT.sol:NARABondDepositoryV4NFT",
    [
      tokenAddress,
      engineAddress,
      bondVaultAddress,
      positionNftAddress,
      deployer.address,
      treasury,
      bondAdminDelay,
      terms,
    ],
    deployer,
  );
  await bondDepository.waitForDeployment();
  const bondDepositoryAddress = await bondDepository.getAddress();
  console.log("NARABondDepositoryV4NFT:", bondDepositoryAddress);

  console.log("Step 11: authorize NFT bond depository as Genesis minter");
  txs.positionNftSetGenesisMinter = await waitTx(
    "positionNft.setGenesisMinter",
    positionNft.setGenesisMinter(bondDepositoryAddress, true),
  );

  console.log("Step 12: freeze position NFT royalties");
  if (freezePositionNftRoyalties) {
    txs.positionNftFreezeRoyalties = await waitTx("positionNft.freezeRoyalties", positionNft.freezeRoyalties());
  } else {
    console.log("Position NFT royalties intentionally remain mutable.");
  }

  txs.positionNftFreezeGenesisMinters = await waitTx(
    "positionNft.freezeGenesisMinters",
    positionNft.freezeGenesisMinters(),
  );

  console.log("Step 12b: configure and freeze position NFT claim fees");
  if (claimFeeRecipient !== undefined) {
    const recipientAddr = ethers.getAddress(claimFeeRecipient);
    txs.positionNftSetClaimFeeRecipient = await waitTx(
      "positionNft.setClaimFeeRecipient",
      positionNft.setClaimFeeRecipient(recipientAddr),
    );
    if (naraClaimFeeBps !== 0 || tokenClaimFeeBps !== 0) {
      txs.positionNftSetClaimFees = await waitTx(
        "positionNft.setClaimFees",
        positionNft.setClaimFees(naraClaimFeeBps, tokenClaimFeeBps),
      );
    }
  }
  if (freezeClaimFees) {
    txs.positionNftFreezeClaimFees = await waitTx(
      "positionNft.freezeClaimFees",
      positionNft.freezeClaimFees(),
    );
  } else {
    console.log("Position NFT claim fees intentionally remain mutable/unfrozen.");
  }

  console.log("Step 13: fund ops vault");
  if (opsAmount === 0n) {
    console.log("Ops vault funding skipped. The ops/liquidity float remains in treasury.");
  } else {
    txs.opsApprove = await waitTx("token.approve(opsVault)", token.approve(opsVaultAddress, opsAmount));
    const opsVaultAsTreasury = opsVault.connect(treasurySigner);
    txs.opsFund = await waitTx("opsVault.fund", opsVaultAsTreasury.fund(opsAmount), 2);
    if (finalAdmin.toLowerCase() !== treasury.toLowerCase()) {
      txs.opsProposeOwnershipTransfer = await waitTx(
        "opsVault.proposeOwnershipTransfer",
        opsVaultAsTreasury.proposeOwnershipTransfer(finalAdmin),
      );
      console.log("Ops vault final admin must call acceptOwnership after deployment.");
    }
  }

  console.log("Step 14: fund bond vault");
  txs.bondVaultFund = await waitTx("token.transfer(bondVault)", token.transfer(bondVaultAddress, bondAmount), 2);

  console.log("Step 15: set engine bond vault if unset");
  if (currentEngineBondVault === ethers.ZeroAddress) {
    txs.engineSetBondVault = await waitTx("engine.setBondVault", engine.setBondVault(bondVaultAddress), 2);
  } else if (currentEngineBondVault.toLowerCase() !== bondVaultAddress.toLowerCase()) {
    throw new Error(`Engine bondVault already set to ${currentEngineBondVault}; cannot set ${bondVaultAddress}.`);
  } else {
    console.log("engine.bondVault already points at this bond vault.");
  }

  console.log("Step 16: propose NFT bond depository as vault market");
  txs.proposeMarket = await waitTx("bondVault.proposeMarket", bondVault.proposeMarket(bondDepositoryAddress));
  const marketPending = await bondVault.pendingMarketChange();

  console.log("Step 17: transfer position NFT ownership to final owner");
  if (positionNftOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    txs.positionNftTransferOwnership = await waitTx(
      "positionNft.transferOwnership",
      positionNft.transferOwnership(positionNftOwner),
    );
    console.log("Position NFT owner must call acceptOwnership after deployment.");
  } else {
    console.log("Position NFT owner is deployer; ownership remains on deployer.");
  }

  console.log("Step 18: transfer bond vault roles to final admin");
  if (finalAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    const roles = [
      ethers.id("ADMIN_ROLE"),
      ethers.id("MARKET_ADMIN_ROLE"),
      ethers.id("CAP_ADMIN_ROLE"),
      ethers.ZeroHash,
    ];
    for (const role of roles) {
      txs[`bondVaultGrant_${role}`] = await waitTx(`bondVault.grantRole(${role})`, bondVault.grantRole(role, finalAdmin));
    }
    for (const role of roles) {
      txs[`bondVaultRenounce_${role}`] = await waitTx(
        `bondVault.renounceRole(${role})`,
        bondVault.renounceRole(role, deployer.address),
      );
    }
  } else {
    console.log("Final admin is deployer; bond vault roles remain on deployer.");
  }

  console.log("Step 19: transfer NFT bond depository roles to final admin");
  if (finalAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    const roles = [
      ethers.id("TERMS_ROLE"),
      ethers.id("PAUSER_ROLE"),
      ethers.id("TREASURY_ROLE"),
      ethers.id("PRICE_SIGNER_ROLE"),
      ethers.ZeroHash,
    ];
    for (const role of roles) {
      txs[`bondDepositoryGrant_${role}`] = await waitTx(
        `bondDepository.grantRole(${role})`,
        bondDepository.grantRole(role, finalAdmin),
      );
    }
    for (const role of roles) {
      txs[`bondDepositoryRenounce_${role}`] = await waitTx(
        `bondDepository.renounceRole(${role})`,
        bondDepository.renounceRole(role, deployer.address),
      );
    }
  } else {
    console.log("Final admin is deployer; bond depository roles remain on deployer.");
  }

  const opsBalance = await token.balanceOf(opsVaultAddress);
  const bondBalance = await token.balanceOf(bondVaultAddress);
  const treasuryNaraAfter = await token.balanceOf(treasurySigner.address);
  const engineBondVaultAfter = await engine.bondVault();

  if (opsBalance !== opsAmount) throw new Error("Ops vault final NARA balance mismatch.");
  if (bondBalance !== bondAmount) throw new Error("Bond vault final NARA balance mismatch.");
  if (engineBondVaultAfter.toLowerCase() !== bondVaultAddress.toLowerCase()) {
    throw new Error("Engine bondVault was not set to the new v4 bond vault.");
  }

  const log = {
    network: networkName,
    chainId: chainId.toString(),
    deployer: deployer.address,
    finalAdmin,
    treasury,
    token: tokenAddress,
    engine: engineAddress,
    genesisRewardToken,
    liquidityGrowthVault: liquidityGrowthVaultAddress ?? null,
    opsVault: opsVaultAddress,
    bondVault: bondVaultAddress,
    positionAccount: positionAccountAddress,
    positionArtMetadata: artMetadataAddress,
    positionArtSecurityPrint: artSecurityPrintAddress,
    positionArtCorePlate: artCorePlateAddress,
    positionArtGenesisPlate: artGenesisPlateAddress,
    positionRenderer: positionRendererAddress,
    positionNft: positionNftAddress,
    genesisRewardDistributor: genesisRewardDistributorAddress,
    bondDepository: bondDepositoryAddress,
    opsOwner,
    positionNftOwner,
    royaltyReceiver,
    royaltyBps,
    royaltiesFrozen: await positionNft.royaltyFrozen(),
    genesisMintersFrozen: await positionNft.genesisMintersFrozen(),
    opsAmount,
    bondAmount,
    minTreasuryFloat,
    opsVestingSeconds,
    bondActionDelay,
    bondAdminDelay,
    bondTerms: terms,
    marketProposal: {
      value: marketPending[0],
      eta: marketPending[1],
    },
    finalBalances: {
      opsVault: opsBalance,
      bondVault: bondBalance,
      treasury: treasuryNaraAfter,
      engineBondVault: engineBondVaultAfter,
    },
    txs,
  };
  const logFile = writeDeploymentLog(log);

  console.log("");
  console.log("Allocation deployment complete");
  console.log("NARAOpsVaultV4=", opsVaultAddress);
  console.log("NARABondVaultV4=", bondVaultAddress);
  console.log("NARAPositionAccountV4=", positionAccountAddress);
  console.log("NARAArtMetadataV1=", artMetadataAddress);
  console.log("NARAArtSecurityPrintV1=", artSecurityPrintAddress);
  console.log("NARAArtCorePlateV1=", artCorePlateAddress);
  console.log("NARAArtGenesisPlateV1=", artGenesisPlateAddress);
  console.log("NARAPositionRendererV5=", positionRendererAddress);
  console.log("NARAPositionNFTV4=", positionNftAddress);
  console.log("NARAGenesisRewardDistributorV4=", genesisRewardDistributorAddress);
  console.log("NARABondDepositoryV4NFT=", bondDepositoryAddress);
  console.log("Market ETA=", marketPending[1].toString());
  console.log("Log=", logFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
