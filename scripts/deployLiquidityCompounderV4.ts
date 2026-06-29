/**
 * deployLiquidityCompounderV4.ts
 *
 * Deploys NARALiquidityCompounderV4 — the production ILiquidityCompounder adapter that closes the
 * POL flywheel: it pulls the NARA+USDC skim the NARALiquidityGrowthVault has accumulated and adds it
 * as a single, permanent, FULL-RANGE protocol-owned liquidity position in the NARA/USDC Uniswap v4
 * pool (PositionManager + Permit2). No swapping, no management.
 *
 * Run AFTER deployV4BaseUsdc.ts (which deploys the vault + hook + pool). Then have the vault owner
 * (Safe) call vault.setCompounder(compounder) and, once satisfied, vault.freezeCompounder().
 *
 * Usage:
 *   NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployLiquidityCompounderV4.ts --network base
 *
 * Required env:
 *   NARA_TOKEN_V4, USDC_ADDRESS, ADMIN_ADDRESS,
 *   LIQUIDITY_VAULT_V4, V4_POOL_MANAGER, V4_POSITION_MANAGER, V4_PERMIT2, V4_HOOK,
 *   V4_POOL_FEE, V4_TICK_SPACING
 */

import hre from "hardhat";
import { writeFileSync } from "fs";

const BASE_CHAIN_ID = 8453n;

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v !== undefined && ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Deployer:", deployer.address);

  const NARA = req("NARA_TOKEN_V4");
  const USDC = req("USDC_ADDRESS");
  const ADMIN = req("ADMIN_ADDRESS");
  const VAULT = req("LIQUIDITY_VAULT_V4");
  const POOL_MANAGER = req("V4_POOL_MANAGER");
  const POSITION_MANAGER = req("V4_POSITION_MANAGER");
  const PERMIT2 = req("V4_PERMIT2");
  const HOOK = req("V4_HOOK");
  const POOL_FEE = Number(req("V4_POOL_FEE"));
  const TICK_SPACING = Number(req("V4_TICK_SPACING"));

  if (
    network.chainId === BASE_CHAIN_ID &&
    ADMIN.toLowerCase() === deployer.address.toLowerCase() &&
    !envFlag("ALLOW_DEPLOYER_ADMIN")
  ) {
    throw new Error("ADMIN_ADDRESS must not be the deployer EOA on Base. Set ALLOW_DEPLOYER_ADMIN=1 only for intentional test deployments.");
  }

  console.log("\n── NARALiquidityCompounderV4 ──");
  const Compounder = await ethers.getContractFactory("NARALiquidityCompounderV4");
  const compounder = await Compounder.deploy(
    ADMIN,
    VAULT,
    POOL_MANAGER,
    POSITION_MANAGER,
    PERMIT2,
    NARA,
    USDC,
    POOL_FEE,
    TICK_SPACING,
    HOOK,
  );
  await compounder.waitForDeployment();
  const addr = await compounder.getAddress();
  console.log("Address:", addr);

  console.log("\n── Verification (sanity reads) ──");
  console.log("vault:           ", await compounder.vault());
  console.log("poolFee:         ", (await compounder.poolFee()).toString());
  console.log("tickSpacing:     ", (await compounder.tickSpacing()).toString());
  console.log("tickLower/Upper: ", (await compounder.tickLower()).toString(), "/", (await compounder.tickUpper()).toString());
  console.log("naraIsCurrency0: ", await compounder.naraIsCurrency0());

  const out = {
    NARALiquidityCompounderV4: addr,
    inputs: { NARA, USDC, ADMIN, VAULT, POOL_MANAGER, POSITION_MANAGER, PERMIT2, HOOK, POOL_FEE, TICK_SPACING },
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };
  const outFile = `liquidity-compounder-v4-${Date.now()}.json`;
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\nAddresses saved to ${outFile}`);

  console.log("\n── Basescan verification ──");
  console.log(`npx hardhat verify --network base ${addr} ${ADMIN} ${VAULT} ${POOL_MANAGER} ${POSITION_MANAGER} ${PERMIT2} ${NARA} ${USDC} ${POOL_FEE} ${TICK_SPACING} ${HOOK}`);

  console.log(`
── Post-deploy wiring (vault owner / Safe) ──
[ ] vault.setCompounder(${addr})
[ ] Confirm route mode is Liquidity (default) and seed a small compound to validate end-to-end
[ ] Once satisfied, vault.freezeCompounder()  // one-way; locks the compounder address
[ ] Transfer compounder ownership to the Safe (Ownable2Step) — controls the recovery timelock
[ ] Update CURRENT_STATE.md + V4_OPPORTUNITY_GAPS.md: flywheel now CLOSED
[ ] Run a Base fork test exercising real PositionManager add-liquidity before production value

── POL recovery posture (deliberate, disclosed) ──
- POL is owner-RECOVERABLE, not yet trustlessly permanent. All POL-removal actions are 2-step with a
  7-day cooldown: proposeRecovery(kind, to) -> wait RECOVERY_DELAY (7 days) -> executeRecovery().
  Holders see RecoveryProposed on-chain and have a guaranteed >=7-day exit window before any move.
  Kinds: 1=MigratePosition (bug-fix / upgrade), 2=RecoverPoolTokens (banked sweep), 3=WindDown (all).
- To graduate to PERMANENT POL once battle-tested: transfer ownership to a timelock or
  renounceOwnership() — after that the recovery levers are dead and the liquidity is immutable.
`);
}

main().catch((e) => { console.error(e); process.exit(1); });
