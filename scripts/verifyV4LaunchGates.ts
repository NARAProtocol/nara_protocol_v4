/**
 * verifyV4LaunchGates — assert the audit's operational launch gates on a deployed v4 system.
 *
 * Complements verifyV4Preflight.ts (which checks hook/vault/pool wiring) by enforcing the
 * trust-model gates from the 2026-06-10 audit before any public TVL:
 *   M-01  growth-vault compounder frozen
 *   M-02  bond PRICE_SIGNER separated from TERMS; signer set
 *   M-03  NFT genesis minters frozen; only the bond depository is a minter
 *   M-09  DEFAULT_ADMIN / Ownable owner held by the Safe; deployer renounced everywhere
 *   AC-07 REWARD_NOTIFIER absent from every configured launch component
 *   DEP-02 reward reserve funded + wired; bond vault wired; bonds CLOSED at launch
 *
 * All addresses come from env (see REQUIRED/OPTIONAL below). Checks whose addresses are not
 * configured are SKIPPED (reported), so the script is incrementally useful before full wiring.
 * Exits non-zero if any configured gate FAILS.
 *
 * Usage:
 *   BASE_RPC_URL=... V4_ENGINE=... V4_SAFE=... [more] npx tsx scripts/verifyV4LaunchGates.ts
 *   ... npx tsx scripts/verifyV4LaunchGates.ts --pre-seed --baskets-only
 *
 * `--pre-seed` requires a configured compounder but deliberately does not
 * require its one-way freeze before the validation compound has run.
 * `--baskets-only` marks deferred NFT/bond gates as not applicable instead of
 * treating intentionally absent addresses as unverified.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { requiredBaseRpcUrl } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const ZERO = ethers.ZeroAddress;
const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);
const ROLE = (name: string) => ethers.id(name);
const STAGE_A_NOTIFIER_CANDIDATES = [
  "0xC019Dc79412c4b20103ac4ce97B2615FF45D490d",
  "0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988",
];

const ACCESS_ABI = ["function hasRole(bytes32 role, address account) view returns (bool)"];
const OWNABLE_ABI = ["function owner() view returns (address)"];
const VAULT_ABI = [
  "function compounder() view returns (address)",
  "function compounderFrozen() view returns (bool)",
  "function owner() view returns (address)",
];
const COMPOUNDER_ABI = [
  "function owner() view returns (address)",
  "function pendingRecovery() view returns (uint8 kind,address to,uint64 eta)",
];
const NFT_ABI = [
  "function genesisMintersFrozen() view returns (bool)",
  "function genesisMinter(address) view returns (bool)",
  "function genesisRewardDistributor() view returns (address)",
  "function owner() view returns (address)",
  "function claimFeesFrozen() view returns (bool)",
];
const ENGINE_ABI = [
  ...ACCESS_ABI,
  "function rewardReserve() view returns (address)",
  "function rewardReserveAvailable() view returns (uint256)",
  "function bondVault() view returns (address)",
  "function treasury() view returns (address)",
  "function currentEpoch() view returns (uint64)",
  "function epochState() view returns (tuple(uint64 epoch,uint64 timestamp,uint256 circulatingSupply,uint256 totalLocked,uint256 activeTotalWeight,uint256 weightedLockShareWad,uint256 stressWad,uint256 betaWad,uint256 horizon,uint256 retentionWad,uint256 baseEmission,uint256 emission,uint256 admittedSupply,uint256 distributedNara,uint256 distributedEth,uint256 treasuryAmount,uint256 warmupFactorWad,uint256 bootstrapWeight,uint256 heartbeat))",
];
const RESERVE_ABI = [
  ...ACCESS_ABI,
  "function engine() view returns (address)",
  "function nara() view returns (address)",
  "function rewardAllocation() view returns (uint256)",
  "function totalReleased() view returns (uint256)",
];
const BONDVAULT_ABI = [...ACCESS_ABI, "function market() view returns (address)"];
const BOND_DEP_ABI = [
  ...ACCESS_ABI,
  "function terms() view returns (uint256 naraPerEthWad,uint16 discountBps,uint256 rewardSplitWad,uint256 minDepositWei,uint256 maxPayoutNara,uint256 remainingCapacityNara,uint64 lockDurationEpochs,uint16 genesisRoundId,uint16 genesisTierId,uint32 genesisRewardMultiplierBps,bool genesisEternal,bool active)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const ROLE_GRANTED_TOPIC = ethers.id("RoleGranted(bytes32,address,address)");
const ROLE_REVOKED_TOPIC = ethers.id("RoleRevoked(bytes32,address,address)");

type Status = "PASS" | "FAIL" | "SKIP" | "N/A";
const results: { gate: string; status: Status; detail: string }[] = [];
function record(gate: string, status: Status, detail: string) {
  results.push({ gate, status, detail });
}

function addr(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  return ethers.getAddress(v);
}

export function activeRoleHoldersFromHistory(
  history: readonly { kind: "grant" | "revoke"; account: string }[],
): string[] {
  const active = new Map<string, string>();
  for (const event of history) {
    const account = ethers.getAddress(event.account);
    if (event.kind === "grant") active.set(account.toLowerCase(), account);
    else active.delete(account.toLowerCase());
  }
  return [...active.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function runtimeCodeHashMatches(code: string, expected: string): boolean {
  if (!ethers.isHexString(code) || code === "0x") return false;
  if (!ethers.isHexString(expected, 32)) return false;
  return ethers.keccak256(code).toLowerCase() === expected.toLowerCase();
}

export function activeLegacyRoleHolders(
  safe: string,
  candidates: readonly { account: string; hasRole: boolean }[],
): string[] {
  const safeKey = ethers.getAddress(safe).toLowerCase();
  const active = new Map<string, string>();
  for (const candidate of candidates) {
    if (!candidate.hasRole) continue;
    const account = ethers.getAddress(candidate.account);
    const key = account.toLowerCase();
    if (key !== safeKey) active.set(key, account);
  }
  return [...active.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function launchEpochBacklogAcceptable(
  currentEpoch: bigint,
  settledEpoch: bigint,
  maxBacklog = 1n,
): { ok: boolean; backlog: bigint } {
  if (settledEpoch > currentEpoch) return { ok: false, backlog: 0n };
  const backlog = currentEpoch - settledEpoch;
  return { ok: backlog <= maxBacklog, backlog };
}

export async function rewardNotifierHistoryLogs(
  provider: ethers.Provider,
  engine: string,
  notifierRole: string,
  deploymentBlock: number,
  chunkBlocks = 9_000,
): Promise<ethers.Log[]> {
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0) {
    throw new Error("V4_ENGINE_DEPLOYMENT_BLOCK is not a valid block number");
  }
  if (!Number.isSafeInteger(chunkBlocks) || chunkBlocks < 1 || chunkBlocks > 10_000) {
    throw new Error("V4_ROLE_LOG_CHUNK_BLOCKS must be between 1 and 10000");
  }

  const latestBlock = await provider.getBlockNumber();
  const logs: ethers.Log[] = [];
  for (let fromBlock = deploymentBlock; fromBlock <= latestBlock; fromBlock += chunkBlocks) {
    const toBlock = Math.min(latestBlock, fromBlock + chunkBlocks - 1);
    logs.push(
      ...(await provider.getLogs({
        address: engine,
        fromBlock,
        toBlock,
        topics: [[ROLE_GRANTED_TOPIC, ROLE_REVOKED_TOPIC], notifierRole],
      })),
    );
  }
  return logs;
}

async function gate(name: string, deps: (string | undefined)[], fn: () => Promise<[boolean, string]>) {
  if (deps.some((d) => !d)) {
    record(name, "SKIP", "missing env address(es) for this gate");
    return;
  }
  try {
    const [ok, detail] = await fn();
    record(name, ok ? "PASS" : "FAIL", detail);
  } catch (e: any) {
    record(name, "FAIL", `check threw: ${e?.message ?? e}`);
  }
}

async function scopedGate(
  inScope: boolean,
  name: string,
  deps: (string | undefined)[],
  fn: () => Promise<[boolean, string]>,
) {
  if (!inScope) {
    record(name, "N/A", "deferred outside the baskets-only launch scope");
    return;
  }
  await gate(name, deps, fn);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const args = new Set(process.argv.slice(2));
  const preSeed = args.has("--pre-seed");
  const basketsOnly = args.has("--baskets-only");

  const engineA = addr("V4_ENGINE");
  const nftA = addr("V4_NFT");
  const bondDepA = addr("V4_BOND_DEPOSITORY");
  const reserveA = addr("V4_REWARD_RESERVE");
  const bondVaultA = addr("V4_BOND_VAULT");
  const vaultA = addr("V4_VAULT");
  const hookA = addr("V4_HOOK");
  const compounderA = addr("V4_COMPOUNDER");
  const genesisA = addr("V4_GENESIS_DISTRIBUTOR");
  const naraA = addr("V4_NARA_TOKEN");
  const safe = addr("V4_SAFE");
  const finalAdmin = addr("V4_ADMIN_ADDRESS");
  const deployer = addr("V4_DEPLOYER");
  const priceSigner = addr("V4_PRICE_SIGNER");
  const bribeRouter = addr("V4_BRIBE_ROUTER");

  console.log(
    `v4 ${preSeed ? "pre-seed" : "final"} launch-gate verification` +
    `${basketsOnly ? " (baskets-only scope)" : ""}\n`,
  );

  // M-01: the compounder must be configured pre-seed and frozen for the final gate.
  await gate(
    preSeed ? "M-01 vault compounder configured" : "M-01 vault compounder frozen",
    [vaultA],
    async () => {
      const v = new ethers.Contract(vaultA!, VAULT_ABI, provider);
      const [c, frozen] = await Promise.all([
        v.compounder() as Promise<string>,
        v.compounderFrozen() as Promise<boolean>,
      ]);
      if (c === ZERO) return [false, "compounder unset (Liquidity mode with no compounder)"];
      return [preSeed || frozen, `compounder=${c} frozen=${frozen}`];
    },
  );

  // M-03: NFT genesis minters frozen + only the bond depository is a minter.
  await scopedGate(!basketsOnly, "M-03 genesis minters frozen", [nftA], async () => {
    const n = new ethers.Contract(nftA!, NFT_ABI, provider);
    const frozen = (await n.genesisMintersFrozen()) as boolean;
    return [frozen, `genesisMintersFrozen=${frozen}`];
  });
  await scopedGate(!basketsOnly, "M-03 bond depository is a genesis minter", [nftA, bondDepA], async () => {
    const n = new ethers.Contract(nftA!, NFT_ABI, provider);
    const isMinter = (await n.genesisMinter(bondDepA!)) as boolean;
    return [isMinter, `genesisMinter(bondDepository)=${isMinter}`];
  });

  // NFT genesis distributor wired.
  await scopedGate(!basketsOnly, "DEP NFT genesis distributor wired", [nftA, genesisA], async () => {
    const n = new ethers.Contract(nftA!, NFT_ABI, provider);
    const d = (await n.genesisRewardDistributor()) as string;
    return [d.toLowerCase() === genesisA!.toLowerCase(), `genesisRewardDistributor=${d}`];
  });

  // SEAM-08/09: NFT claim fees frozen.
  await scopedGate(!basketsOnly, "SEAM-08/09 claim fees frozen", [nftA], async () => {
    const n = new ethers.Contract(nftA!, NFT_ABI, provider);
    const frozen = (await n.claimFeesFrozen()) as boolean;
    return [frozen, `claimFeesFrozen=${frozen}`];
  });

  // M-02 / M-09: bond roles — PRICE_SIGNER separated from TERMS; deployer renounced; Safe holds admin.
  await scopedGate(!basketsOnly, "M-02 bond PRICE_SIGNER set + separated from TERMS Safe", [bondDepA, priceSigner, safe], async () => {
    const d = new ethers.Contract(bondDepA!, BOND_DEP_ABI, provider);
    const signerHas = (await d.hasRole(ROLE("PRICE_SIGNER_ROLE"), priceSigner!)) as boolean;
    const safeIsSigner = (await d.hasRole(ROLE("PRICE_SIGNER_ROLE"), safe!)) as boolean;
    const ok = signerHas && priceSigner!.toLowerCase() !== safe!.toLowerCase() && !safeIsSigner;
    return [ok, `priceSignerHasRole=${signerHas} separatedFromSafe=${priceSigner!.toLowerCase() !== safe!.toLowerCase()}`];
  });
  await scopedGate(!basketsOnly, "M-09 bond TERMS_ROLE on Safe, deployer renounced", [bondDepA, safe, deployer], async () => {
    const d = new ethers.Contract(bondDepA!, BOND_DEP_ABI, provider);
    const [safeHas, deployerHasAdmin, deployerHasTerms] = await Promise.all([
      d.hasRole(ROLE("TERMS_ROLE"), safe!) as Promise<boolean>,
      d.hasRole(DEFAULT_ADMIN_ROLE, deployer!) as Promise<boolean>,
      d.hasRole(ROLE("TERMS_ROLE"), deployer!) as Promise<boolean>,
    ]);
    return [safeHas && !deployerHasAdmin && !deployerHasTerms, `safeHasTerms=${safeHas} deployerAdmin=${deployerHasAdmin} deployerTerms=${deployerHasTerms}`];
  });

  // M-09: engine DEFAULT_ADMIN on Safe; deployer and configured legacy admin renounced.
  await gate("M-09 engine DEFAULT_ADMIN exclusively on Safe", [engineA, safe, deployer, finalAdmin], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const [safeHas, deployerHas, finalAdminHas] = await Promise.all([
      e.hasRole(DEFAULT_ADMIN_ROLE, safe!) as Promise<boolean>,
      e.hasRole(DEFAULT_ADMIN_ROLE, deployer!) as Promise<boolean>,
      e.hasRole(DEFAULT_ADMIN_ROLE, finalAdmin!) as Promise<boolean>,
    ]);
    const activeLegacy = activeLegacyRoleHolders(safe!, [
      { account: deployer!, hasRole: deployerHas },
      { account: finalAdmin!, hasRole: finalAdminHas },
    ]);
    return [
      safeHas && activeLegacy.length === 0,
      `safeAdmin=${safeHas} activeConfiguredLegacyAdmins=${activeLegacy.join(",") || "none"}`,
    ];
  });

  // A backlog above the configured launch tolerance is an availability failure.
  // The default permits one boundary epoch so a 15-minute maintainer is not
  // spuriously red during the few seconds around an epoch transition.
  await gate("OPS engine epoch backlog within launch tolerance", [engineA], async () => {
    const maxBacklogRaw = process.env.V4_MAX_LAUNCH_EPOCH_BACKLOG?.trim() || "1";
    if (!/^\d+$/.test(maxBacklogRaw)) return [false, "V4_MAX_LAUNCH_EPOCH_BACKLOG must be a non-negative integer"];
    const maxBacklog = BigInt(maxBacklogRaw);
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const [currentEpoch, state] = await Promise.all([
      e.currentEpoch() as Promise<bigint>,
      e.epochState() as Promise<{ epoch: bigint }>,
    ]);
    const result = launchEpochBacklogAcceptable(currentEpoch, state.epoch, maxBacklog);
    return [
      result.ok,
      `current=${currentEpoch} settled=${state.epoch} backlog=${result.backlog} max=${maxBacklog}`,
    ];
  });

  // AC-07: deployed-engine ERC-20 rewards remain disabled. Post-notify extends can make
  // activeTotalWeight exceed the frozen token-reward claim basis, so no launch component
  // may retain REWARD_NOTIFIER_ROLE.
  await gate("AC-07 REWARD_NOTIFIER absent from Safe", [engineA, safe], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const safeHas = (await e.hasRole(ROLE("REWARD_NOTIFIER_ROLE"), safe!)) as boolean;
    return [!safeHas, `safeHasRewardNotifier=${safeHas} (should be false)`];
  });
  await gate("AC-07 REWARD_NOTIFIER absent from configured final admin", [engineA, finalAdmin], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const adminHas = (await e.hasRole(ROLE("REWARD_NOTIFIER_ROLE"), finalAdmin!)) as boolean;
    return [!adminHas, `finalAdminHasRewardNotifier=${adminHas} (should be false)`];
  });
  await gate("AC-07 REWARD_NOTIFIER absent from vault/bribe-router", [engineA, vaultA ?? bribeRouter], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const targets = [vaultA, bribeRouter].filter(Boolean) as string[];
    const holds = await Promise.all(targets.map((t) => e.hasRole(ROLE("REWARD_NOTIFIER_ROLE"), t) as Promise<boolean>));
    const any = holds.some(Boolean);
    return [!any, `vault/bribeRouter holdsRewardNotifier=${any} (should be false)`];
  });
  await gate("AC-07 REWARD_NOTIFIER absent from deployer", [engineA, deployer], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const deployerHas = (await e.hasRole(ROLE("REWARD_NOTIFIER_ROLE"), deployer!)) as boolean;
    return [!deployerHas, `deployerHasRewardNotifier=${deployerHas} (should be false)`];
  });
  await gate("AC-07 REWARD_NOTIFIER absent from known Stage A holders", [engineA], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const holds = await Promise.all(
      STAGE_A_NOTIFIER_CANDIDATES.map(
        (candidate) => e.hasRole(ROLE("REWARD_NOTIFIER_ROLE"), candidate) as Promise<boolean>,
      ),
    );
    const active = STAGE_A_NOTIFIER_CANDIDATES.filter((_, index) => holds[index]);
    return [active.length === 0, `activeKnownStageAHolders=${active.join(",") || "none"}`];
  });
  await gate(
    "AC-07 REWARD_NOTIFIER absent from complete grant history",
    [engineA, process.env.V4_ENGINE_DEPLOYMENT_BLOCK?.trim()],
    async () => {
      const deploymentBlock = Number(process.env.V4_ENGINE_DEPLOYMENT_BLOCK);
      if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0) {
        return [false, "V4_ENGINE_DEPLOYMENT_BLOCK is not a valid block number"];
      }
      const notifierRole = ROLE("REWARD_NOTIFIER_ROLE");
      const historyRpc = process.env.V4_ROLE_HISTORY_RPC_URL?.trim();
      const historyProvider = historyRpc ? new ethers.JsonRpcProvider(historyRpc) : provider;
      const chunkBlocks = Number(process.env.V4_ROLE_LOG_CHUNK_BLOCKS?.trim() || "9000");
      const logs = await rewardNotifierHistoryLogs(
        historyProvider,
        engineA!,
        notifierRole,
        deploymentBlock,
        chunkBlocks,
      );
      const history = logs.map((log) => ({
        kind: log.topics[0] === ROLE_GRANTED_TOPIC ? "grant" as const : "revoke" as const,
        account: ethers.getAddress(ethers.dataSlice(log.topics[2], 12)),
      }));
      const historicalActive = activeRoleHoldersFromHistory(history);
      const actualActive = (
        await Promise.all(
          historicalActive.map(async (candidate) => {
            const engine = new ethers.Contract(engineA!, ENGINE_ABI, provider);
            return (await engine.hasRole(notifierRole, candidate)) ? candidate : undefined;
          }),
        )
      ).filter(Boolean) as string[];
      return [
        actualActive.length === 0,
        `historicalGrants=${history.filter((item) => item.kind === "grant").length} active=${actualActive.join(",") || "none"}`,
      ];
    },
  );

  // Ownable admins (NFT / growth vault) on the Safe.
  await scopedGate(!basketsOnly, "M-09 NFT owner is the Safe", [nftA, safe], async () => {
    const n = new ethers.Contract(nftA!, OWNABLE_ABI, provider);
    const o = (await n.owner()) as string;
    return [o.toLowerCase() === safe!.toLowerCase(), `nft.owner=${o}`];
  });
  await gate("M-09 growth vault owner is the Safe", [vaultA, safe], async () => {
    const v = new ethers.Contract(vaultA!, OWNABLE_ABI, provider);
    const o = (await v.owner()) as string;
    return [o.toLowerCase() === safe!.toLowerCase(), `vault.owner=${o}`];
  });
  await gate("M-09 growth hook owner is the Safe", [hookA, safe], async () => {
    const hook = new ethers.Contract(hookA!, OWNABLE_ABI, provider);
    const owner = (await hook.owner()) as string;
    return [owner.toLowerCase() === safe!.toLowerCase(), `hook.owner=${owner}`];
  });
  await gate(
    "ACC-004 Safe runtime code hash matches approved custody",
    [safe, process.env.V4_SAFE_CODEHASH?.trim()],
    async () => {
      const code = await provider.getCode(safe!);
      const expected = process.env.V4_SAFE_CODEHASH!.trim();
      return [
        runtimeCodeHashMatches(code, expected),
        `actual=${code === "0x" ? "no-code" : ethers.keccak256(code)} expected=${expected}`,
      ];
    },
  );
  await gate("ACC-002 compounder custody is Safe and no recovery is pending", [compounderA, safe], async () => {
    const compounder = new ethers.Contract(compounderA!, COMPOUNDER_ABI, provider);
    const [owner, pending] = await Promise.all([
      compounder.owner() as Promise<string>,
      compounder.pendingRecovery() as Promise<{ kind: bigint; to: string; eta: bigint }>,
    ]);
    const ownerMatches = owner.toLowerCase() === safe!.toLowerCase();
    const noPendingRecovery = pending.kind === 0n;
    return [
      ownerMatches && noPendingRecovery,
      `owner=${owner} pendingKind=${pending.kind} pendingTo=${pending.to} pendingEta=${pending.eta}`,
    ];
  });

  // DEP-02: reward reserve funded + wired.
  await gate("DEP-02 reward reserve wired to engine", [engineA, reserveA], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const r = new ethers.Contract(reserveA!, RESERVE_ABI, provider);
    const [wired, reverseEngine] = await Promise.all([
      e.rewardReserve() as Promise<string>,
      r.engine() as Promise<string>,
    ]);
    const ok = wired.toLowerCase() === reserveA!.toLowerCase() && reverseEngine.toLowerCase() === engineA!.toLowerCase();
    return [ok, `engine.rewardReserve=${wired} reserve.engine=${reverseEngine}`];
  });
  await gate("DEP-02 reward reserve funded with NARA", [reserveA, naraA], async () => {
    const nara = new ethers.Contract(naraA!, ERC20_ABI, provider);
    const bal = (await nara.balanceOf(reserveA!)) as bigint;
    return [bal > 0n, `reserve NARA balance=${ethers.formatUnits(bal, 18)}`];
  });
  await gate("DEP-02 reward reserve available to engine", [engineA], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const available = (await e.rewardReserveAvailable()) as bigint;
    return [available > 0n, `engine rewardReserveAvailable=${ethers.formatUnits(available, 18)} NARA`];
  });

  // Bond vault wired to engine + market = bond depository.
  await scopedGate(!basketsOnly, "DEP bond vault wired (engine + market)", [engineA, bondVaultA, bondDepA], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const bv = new ethers.Contract(bondVaultA!, BONDVAULT_ABI, provider);
    const [engineBondVault, market] = await Promise.all([
      e.bondVault() as Promise<string>,
      bv.market() as Promise<string>,
    ]);
    const ok = engineBondVault.toLowerCase() === bondVaultA!.toLowerCase() && market.toLowerCase() === bondDepA!.toLowerCase();
    return [ok, `engine.bondVault=${engineBondVault} bondVault.market=${market}`];
  });

  // DEP-02: bonds CLOSED at launch.
  await scopedGate(!basketsOnly, "DEP bonds are CLOSED at launch", [bondDepA], async () => {
    const d = new ethers.Contract(bondDepA!, BOND_DEP_ABI, provider);
    const t = await d.terms();
    const closed = t.active === false || t.remainingCapacityNara === 0n;
    return [closed, `terms.active=${t.active} remainingCapacity=${t.remainingCapacityNara}`];
  });

  // ── Report ──
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  console.log(pad("GATE", 52), "STATUS  DETAIL");
  for (const r of results) console.log(pad(r.gate, 52), pad(r.status, 7), r.detail);

  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIP");
  const passed = results.filter((r) => r.status === "PASS");
  const notApplicable = results.filter((r) => r.status === "N/A");
  console.log(
    `\n${passed.length} pass · ${failed.length} fail · ${skipped.length} skip · ` +
    `${notApplicable.length} not applicable`,
  );
  if (skipped.length > 0) {
    console.log("Skipped gates need their V4_* addresses set before launch — they are NOT verified.");
  }
  if (failed.length > 0) {
    console.log("\nLAUNCH BLOCKED: the gates above failed.");
    process.exitCode = 1;
  } else if (skipped.length === 0) {
    console.log("\nAll launch gates satisfied.");
  } else {
    console.log("\nNo failures, but configure the skipped gates before treating launch as verified.");
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err?.message ?? err);
    process.exitCode = 1;
  });
}
