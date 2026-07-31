/** Build, simulate, and write the Safe transaction that authorizes one dedicated compound keeper. */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const VAULT_ABI = [
  "function owner() view returns (address)",
  "function compounderFrozen() view returns (bool)",
  "function compoundKeeper(address) view returns (bool)",
  "function setCompoundKeeper(address keeper,bool allowed)",
];

const SAFE_ABI = ["function isOwner(address owner) view returns (bool)"];
const ENGINE_ABI = ["function hasRole(bytes32 role,address account) view returns (bool)"];
const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"];

const ENGINE_ROLES = {
  defaultAdmin: ethers.ZeroHash,
  param: ethers.keccak256(ethers.toUtf8Bytes("PARAM_ROLE")),
  treasury: ethers.keccak256(ethers.toUtf8Bytes("TREASURY_ROLE")),
  rewardNotifier: ethers.keccak256(ethers.toUtf8Bytes("REWARD_NOTIFIER_ROLE")),
};

export type KeeperEngineRoles = {
  defaultAdmin: boolean;
  param: boolean;
  treasury: boolean;
  rewardNotifier: boolean;
};

export function validateDedicatedKeeperAccount(code: string, nonce: number): void {
  if (code !== "0x") throw new Error("Dedicated compound keeper must be an EOA");
  if (nonce !== 0) {
    throw new Error(`Dedicated compound keeper must be unused (current nonce: ${nonce})`);
  }
}

export function validateDedicatedKeeperAuthority(
  isSafeOwner: boolean,
  engineRoles: KeeperEngineRoles,
): void {
  if (isSafeOwner) throw new Error("Dedicated compound keeper must not be a Safe owner");
  if (Object.values(engineRoles).some(Boolean)) {
    throw new Error("Dedicated compound keeper must not hold an Engine administration role");
  }
}

async function main(): Promise<void> {
  const config = currentV4Config();
  const safe = ethers.getAddress(requiredEnv("V4_SAFE"));
  const keeper = ethers.getAddress(requiredEnv("V4_COMPOUND_KEEPER_ADDRESS"));
  if (keeper === ethers.ZeroAddress || keeper.toLowerCase() === safe.toLowerCase()) {
    throw new Error("Compound keeper must be a nonzero address separate from the Safe");
  }
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, 8453, { staticNetwork: true, batchMaxCount: 1 });
  try {
    const [keeperCode, keeperNonce, keeperEthBalance, block] = await Promise.all([
      provider.getCode(keeper),
      provider.getTransactionCount(keeper, "latest"),
      provider.getBalance(keeper),
      provider.getBlock("latest"),
    ]);
    validateDedicatedKeeperAccount(keeperCode, keeperNonce);
    if (!block) throw new Error("Latest Base block is unavailable");
    const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
    const safeContract = new ethers.Contract(safe, SAFE_ABI, provider);
    const engine = new ethers.Contract(config.engine, ENGINE_ABI, provider);
    const token = new ethers.Contract(config.token, ERC20_ABI, provider);
    const base = new ethers.Contract(config.base, ERC20_ABI, provider);
    const [
      owner,
      frozen,
      alreadyAllowed,
      isSafeOwner,
      hasDefaultAdminRole,
      hasParamRole,
      hasTreasuryRole,
      hasRewardNotifierRole,
      keeperNaraBalance,
      keeperBaseBalance,
    ] = await Promise.all([
      vault.owner() as Promise<string>,
      vault.compounderFrozen() as Promise<boolean>,
      vault.compoundKeeper(keeper) as Promise<boolean>,
      safeContract.isOwner(keeper) as Promise<boolean>,
      engine.hasRole(ENGINE_ROLES.defaultAdmin, keeper) as Promise<boolean>,
      engine.hasRole(ENGINE_ROLES.param, keeper) as Promise<boolean>,
      engine.hasRole(ENGINE_ROLES.treasury, keeper) as Promise<boolean>,
      engine.hasRole(ENGINE_ROLES.rewardNotifier, keeper) as Promise<boolean>,
      token.balanceOf(keeper) as Promise<bigint>,
      base.balanceOf(keeper) as Promise<bigint>,
    ]);
    if (ethers.getAddress(owner) !== safe) throw new Error(`Vault owner ${owner} is not V4_SAFE ${safe}`);
    if (!frozen) throw new Error("Authorize automation only after the validation compound and permanent freeze");
    if (alreadyAllowed) throw new Error("Configured compound keeper is already authorized");
    const engineRoles = {
      defaultAdmin: hasDefaultAdminRole,
      param: hasParamRole,
      treasury: hasTreasuryRole,
      rewardNotifier: hasRewardNotifierRole,
    };
    validateDedicatedKeeperAuthority(isSafeOwner, engineRoles);
    await vault.setCompoundKeeper.staticCall(keeper, true, { from: safe });
    const data = vault.interface.encodeFunctionData("setCompoundKeeper", [keeper, true]);
    const output = {
      version: "1.0",
      chainId: "8453",
      createdAt: Date.now(),
      meta: {
        name: "Authorize NARA v4 compound keeper",
        description: "Authorize one restricted keeper only after compounder validation and freeze.",
        txBuilderVersion: "1.18.0",
        createdFromSafeAddress: safe,
        createdFromOwnerAddress: "",
      },
      transactions: [{ to: config.vault, value: "0", data, contractMethod: null, contractInputsValues: null }],
      naraEvidence: {
        changeId: "NARA-20260731-liquidity-maintainer",
        blockNumber: block.number,
        vault: config.vault,
        safe,
        keeper,
        compounderFrozen: frozen,
        keeperCode,
        keeperNonce,
        keeperEthBalance: keeperEthBalance.toString(),
        keeperNaraBalance: keeperNaraBalance.toString(),
        keeperBaseBalance: keeperBaseBalance.toString(),
        isSafeOwner,
        engineRoles,
        permissions:
          "With live routeMode=Liquidity, execution is limited to compound()/compoundAll(). " +
          "The keeper mapping also gates route execution if the Safe changes routeMode later; " +
          "it grants no vault ownership, configuration, or compounder-recovery authority.",
      },
    };
    const outputDir = resolve(repoRoot, "deployments");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, "v4-compound-keeper-authorization-batch.json");
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Safe batch written: ${outputPath}`);
    console.log("Authorization simulated successfully. This command did not sign or submit it.");
  } finally {
    provider.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
