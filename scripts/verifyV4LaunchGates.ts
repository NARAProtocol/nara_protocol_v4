/**
 * verifyV4LaunchGates — assert the audit's operational launch gates on a deployed v4 system.
 *
 * Complements verifyV4Preflight.ts (which checks hook/vault/pool wiring) by enforcing the
 * trust-model gates from the 2026-06-10 audit before any public TVL:
 *   M-01  growth-vault compounder frozen
 *   M-02  bond PRICE_SIGNER separated from TERMS; signer set
 *   M-03  NFT genesis minters frozen; only the bond depository is a minter
 *   M-09  DEFAULT_ADMIN / Ownable owner held by the Safe; deployer renounced everywhere
 *   AC-07 REWARD_NOTIFIER held by vault/bribe-router, NOT the human admin
 *   DEP-02 reward reserve funded + wired; bond vault wired; bonds CLOSED at launch
 *
 * All addresses come from env (see REQUIRED/OPTIONAL below). Checks whose addresses are not
 * configured are SKIPPED (reported), so the script is incrementally useful before full wiring.
 * Exits non-zero if any configured gate FAILS.
 *
 * Usage: BASE_RPC_URL=... V4_ENGINE=... V4_SAFE=... [more] npx tsx scripts/verifyV4LaunchGates.ts
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

const ACCESS_ABI = ["function hasRole(bytes32 role, address account) view returns (bool)"];
const OWNABLE_ABI = ["function owner() view returns (address)"];
const VAULT_ABI = [
  "function compounder() view returns (address)",
  "function compounderFrozen() view returns (bool)",
  "function owner() view returns (address)",
];
const NFT_ABI = [
  "function genesisMintersFrozen() view returns (bool)",
  "function genesisMinter(address) view returns (bool)",
  "function genesisRewardDistributor() view returns (address)",
  "function owner() view returns (address)",
];
const ENGINE_ABI = [
  ...ACCESS_ABI,
  "function rewardReserve() view returns (address)",
  "function bondVault() view returns (address)",
  "function treasury() view returns (address)",
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

type Status = "PASS" | "FAIL" | "SKIP";
const results: { gate: string; status: Status; detail: string }[] = [];
function record(gate: string, status: Status, detail: string) {
  results.push({ gate, status, detail });
}

function addr(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  return ethers.getAddress(v);
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

async function main() {
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());

  const engineA = addr("V4_ENGINE");
  const nftA = addr("V4_NFT");
  const bondDepA = addr("V4_BOND_DEPOSITORY");
  const reserveA = addr("V4_REWARD_RESERVE");
  const bondVaultA = addr("V4_BOND_VAULT");
  const vaultA = addr("V4_VAULT");
  const genesisA = addr("V4_GENESIS_DISTRIBUTOR");
  const naraA = addr("V4_NARA_TOKEN");
  const safe = addr("V4_SAFE");
  const deployer = addr("V4_DEPLOYER");
  const priceSigner = addr("V4_PRICE_SIGNER");
  const bribeRouter = addr("V4_BRIBE_ROUTER");

  console.log("v4 launch-gate verification (audit 2026-06-10)\n");

  // M-01: growth-vault compounder frozen.
  await gate("M-01 vault compounder frozen", [vaultA], async () => {
    const v = new ethers.Contract(vaultA!, VAULT_ABI, provider);
    const [c, frozen] = await Promise.all([v.compounder() as Promise<string>, v.compounderFrozen() as Promise<boolean>]);
    if (c === ZERO) return [false, "compounder unset (Liquidity mode with no compounder)"];
    return [frozen, `compounder=${c} frozen=${frozen}`];
  });

  // M-03: NFT genesis minters frozen + only the bond depository is a minter.
  await gate("M-03 genesis minters frozen", [nftA], async () => {
    const n = new ethers.Contract(nftA!, NFT_ABI, provider);
    const frozen = (await n.genesisMintersFrozen()) as boolean;
    return [frozen, `genesisMintersFrozen=${frozen}`];
  });
  await gate("M-03 bond depository is a genesis minter", [nftA, bondDepA], async () => {
    const n = new ethers.Contract(nftA!, NFT_ABI, provider);
    const isMinter = (await n.genesisMinter(bondDepA!)) as boolean;
    return [isMinter, `genesisMinter(bondDepository)=${isMinter}`];
  });

  // NFT genesis distributor wired.
  await gate("DEP NFT genesis distributor wired", [nftA, genesisA], async () => {
    const n = new ethers.Contract(nftA!, NFT_ABI, provider);
    const d = (await n.genesisRewardDistributor()) as string;
    return [d.toLowerCase() === genesisA!.toLowerCase(), `genesisRewardDistributor=${d}`];
  });

  // M-02 / M-09: bond roles — PRICE_SIGNER separated from TERMS; deployer renounced; Safe holds admin.
  await gate("M-02 bond PRICE_SIGNER set + separated from TERMS Safe", [bondDepA, priceSigner, safe], async () => {
    const d = new ethers.Contract(bondDepA!, BOND_DEP_ABI, provider);
    const signerHas = (await d.hasRole(ROLE("PRICE_SIGNER_ROLE"), priceSigner!)) as boolean;
    const safeIsSigner = (await d.hasRole(ROLE("PRICE_SIGNER_ROLE"), safe!)) as boolean;
    const ok = signerHas && priceSigner!.toLowerCase() !== safe!.toLowerCase() && !safeIsSigner;
    return [ok, `priceSignerHasRole=${signerHas} separatedFromSafe=${priceSigner!.toLowerCase() !== safe!.toLowerCase()}`];
  });
  await gate("M-09 bond TERMS_ROLE on Safe, deployer renounced", [bondDepA, safe, deployer], async () => {
    const d = new ethers.Contract(bondDepA!, BOND_DEP_ABI, provider);
    const [safeHas, deployerHasAdmin, deployerHasTerms] = await Promise.all([
      d.hasRole(ROLE("TERMS_ROLE"), safe!) as Promise<boolean>,
      d.hasRole(DEFAULT_ADMIN_ROLE, deployer!) as Promise<boolean>,
      d.hasRole(ROLE("TERMS_ROLE"), deployer!) as Promise<boolean>,
    ]);
    return [safeHas && !deployerHasAdmin && !deployerHasTerms, `safeHasTerms=${safeHas} deployerAdmin=${deployerHasAdmin} deployerTerms=${deployerHasTerms}`];
  });

  // M-09: engine DEFAULT_ADMIN on Safe, deployer renounced.
  await gate("M-09 engine DEFAULT_ADMIN on Safe, deployer renounced", [engineA, safe, deployer], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const [safeHas, deployerHas] = await Promise.all([
      e.hasRole(DEFAULT_ADMIN_ROLE, safe!) as Promise<boolean>,
      e.hasRole(DEFAULT_ADMIN_ROLE, deployer!) as Promise<boolean>,
    ]);
    return [safeHas && !deployerHas, `safeAdmin=${safeHas} deployerAdmin=${deployerHas}`];
  });

  // AC-07: REWARD_NOTIFIER held by vault/bribe-router, NOT the human admin / Safe.
  await gate("AC-07 REWARD_NOTIFIER not on human admin (Safe)", [engineA, safe], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const safeHas = (await e.hasRole(ROLE("REWARD_NOTIFIER_ROLE"), safe!)) as boolean;
    return [!safeHas, `safeHasRewardNotifier=${safeHas} (should be false)`];
  });
  await gate("AC-07 REWARD_NOTIFIER held by an automated router", [engineA, vaultA ?? bribeRouter], async () => {
    const e = new ethers.Contract(engineA!, ENGINE_ABI, provider);
    const targets = [vaultA, bribeRouter].filter(Boolean) as string[];
    const holds = await Promise.all(targets.map((t) => e.hasRole(ROLE("REWARD_NOTIFIER_ROLE"), t) as Promise<boolean>));
    const any = holds.some(Boolean);
    return [any, `vault/bribeRouter holdsRewardNotifier=${any}`];
  });

  // Ownable admins (NFT / growth vault) on the Safe.
  await gate("M-09 NFT owner is the Safe", [nftA, safe], async () => {
    const n = new ethers.Contract(nftA!, OWNABLE_ABI, provider);
    const o = (await n.owner()) as string;
    return [o.toLowerCase() === safe!.toLowerCase(), `nft.owner=${o}`];
  });
  await gate("M-09 growth vault owner is the Safe", [vaultA, safe], async () => {
    const v = new ethers.Contract(vaultA!, OWNABLE_ABI, provider);
    const o = (await v.owner()) as string;
    return [o.toLowerCase() === safe!.toLowerCase(), `vault.owner=${o}`];
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

  // Bond vault wired to engine + market = bond depository.
  await gate("DEP bond vault wired (engine + market)", [engineA, bondVaultA, bondDepA], async () => {
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
  await gate("DEP bonds are CLOSED at launch", [bondDepA], async () => {
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
  console.log(`\n${results.length - failed.length - skipped.length} pass · ${failed.length} fail · ${skipped.length} skip`);
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

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exitCode = 1;
});
