import hre from "hardhat";

const DEPLOYER = "0xcf222f05911e3AbeF77F2A552C623c122522F670";
const FINAL_ADMIN = "0xC019Dc79412c4b20103ac4ce97B2615FF45D490d";
const TOKEN = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
const ENGINE = "0xbC2492BA73dE35d1114b5c18d7db633aca8963c9";
const REWARD_RESERVE = "0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD";
const VAULT = "0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988";
const CREATE2_DEPLOYER = "0xC045644303E43cbb1E3c3E3fC851246F5c590834";
const HOOK = "0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function waitTx(label: string, promise: Promise<any>) {
  const tx = await promise;
  console.log(`${label}: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (receipt?.status !== 1) throw new Error(`${label} reverted`);
}

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const [signer] = await ethers.getSigners();
  if (signer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error(`Unexpected signer ${signer.address}`);
  }
  if ((await ethers.provider.getNetwork()).chainId !== 8453n) {
    throw new Error("This continuation is Base-mainnet-only");
  }

  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", ENGINE, signer);
  const reserve = await ethers.getContractAt("NARARewardReserve", REWARD_RESERVE, signer);
  const vault = await ethers.getContractAt(
    "contracts/v4/NARALiquidityGrowthVault.sol:NARALiquidityGrowthVault",
    VAULT,
    signer,
  );
  const hook = await ethers.getContractAt(
    "contracts/v4/NARALiquidityGrowthHook.sol:NARALiquidityGrowthHook",
    HOOK,
    signer,
  );
  const create2 = await ethers.getContractAt("Create2HookDeployer", CREATE2_DEPLOYER, signer);

  const [currency0, currency1] =
    BigInt(TOKEN) < BigInt(USDC) ? [TOKEN, USDC] : [USDC, TOKEN];
  const key = { currency0, currency1, fee: 3000, tickSpacing: 60, hooks: HOOK };

  if (!(await hook.poolRegistered())) {
    await waitTx("hook.registerPool", hook.registerPool(key));
  }
  console.log(`poolRegistered=${await hook.poolRegistered()}`);

  const engineRoles = [
    ethers.ZeroHash,
    ethers.id("PARAM_ROLE"),
    ethers.id("TREASURY_ROLE"),
    ethers.id("REWARD_NOTIFIER_ROLE"),
  ];
  for (const role of engineRoles) {
    if (!(await engine.hasRole(role, FINAL_ADMIN))) {
      await waitTx(`engine.grantRole(${role})`, engine.grantRole(role, FINAL_ADMIN));
    }
  }
  for (const role of [
    ethers.id("PARAM_ROLE"),
    ethers.id("TREASURY_ROLE"),
    ethers.id("REWARD_NOTIFIER_ROLE"),
    ethers.ZeroHash,
  ]) {
    if (await engine.hasRole(role, DEPLOYER)) {
      await waitTx(`engine.renounceRole(${role})`, engine.renounceRole(role, DEPLOYER));
    }
  }

  const reserveRoles = [
    ethers.ZeroHash,
    ethers.id("ADMIN_ROLE"),
    ethers.id("ENGINE_SETTER_ROLE"),
  ];
  for (const role of reserveRoles) {
    if (!(await reserve.hasRole(role, FINAL_ADMIN))) {
      await waitTx(`reserve.grantRole(${role})`, reserve.grantRole(role, FINAL_ADMIN));
    }
  }
  for (const role of reserveRoles.slice().reverse()) {
    if (await reserve.hasRole(role, DEPLOYER)) {
      await waitTx(`reserve.renounceRole(${role})`, reserve.renounceRole(role, DEPLOYER));
    }
  }

  if ((await hook.owner()).toLowerCase() === DEPLOYER.toLowerCase()) {
    await waitTx("hook.transferOwnership", hook.transferOwnership(FINAL_ADMIN));
  }
  if ((await vault.owner()).toLowerCase() === DEPLOYER.toLowerCase()) {
    await waitTx("vault.transferOwnership", vault.transferOwnership(FINAL_ADMIN));
  }
  if ((await create2.owner()).toLowerCase() === DEPLOYER.toLowerCase()) {
    await waitTx("create2.transferOwnership", create2.transferOwnership(FINAL_ADMIN));
  }

  console.log(`token=${TOKEN}`);
  console.log(`engine=${ENGINE}`);
  console.log(`rewardReserve=${REWARD_RESERVE}`);
  console.log(`vault=${VAULT}`);
  console.log(`hook=${HOOK}`);
  console.log("Continuation complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
