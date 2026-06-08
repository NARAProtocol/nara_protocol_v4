/**
 * Verify the live NARA v4 allocation deployment.
 *
 * Usage:
 *   npx hardhat run scripts/verifyV4AllocationsLive.ts --network base
 */

import hre from "hardhat";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.trim() === "") throw new Error(`Missing env: ${name}`);
  return value.trim();
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(label: string, value: boolean) {
  if (!value) throw new Error(`${label}: expected true`);
}

function assertFalse(label: string, value: boolean) {
  if (value) throw new Error(`${label}: expected false`);
}

function decodeJsonDataUri(label: string, uri: string): Record<string, unknown> {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) throw new Error(`${label}: expected base64 JSON data URI`);
  return JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8"));
}

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection as any;

  const tokenAddress = ethers.getAddress(env("V4_NARA_TOKEN"));
  const engineAddress = ethers.getAddress(env("V4_ENGINE"));
  const opsVaultAddress = ethers.getAddress(env("V4_OPS_VAULT"));
  const bondVaultAddress = ethers.getAddress(env("V4_BOND_VAULT"));
  const bondDepositoryAddress = ethers.getAddress(env("V4_BOND_DEPOSITORY"));
  const admin = ethers.getAddress(env("V4_ADMIN_ADDRESS"));
  const positionNftOwner = ethers.getAddress(env("V4_POSITION_NFT_OWNER_ADDRESS", admin));
  const treasury = ethers.getAddress(env("V4_TREASURY_ADDRESS"));
  const deployer = ethers.getAddress(env("DEPLOYER_ADDRESS"));
  const expectedOpsAmount = ethers.parseUnits(env("V4_EXPECTED_OPS_AMOUNT_NARA", "0"), 18);
  const expectedBondAmount = ethers.parseUnits(env("V4_EXPECTED_BOND_AMOUNT_NARA", "289970"), 18);
  const expectedTreasuryFloat = ethers.parseUnits(env("V4_EXPECTED_TREASURY_FLOAT_NARA", "0"), 18);
  const expectedOpsFunded = envFlag("V4_EXPECTED_OPS_FUNDED", false);
  const expectedRoyaltyBps = BigInt(env("V4_POSITION_NFT_ROYALTY_BPS", "0"));
  const expectedRoyaltyReceiver = expectedRoyaltyBps === 0n
    ? ethers.ZeroAddress
    : ethers.getAddress(env("V4_POSITION_NFT_ROYALTY_RECEIVER", treasury));

  const token = await ethers.getContractAt("contracts/v4/NARAToken.sol:NARAToken", tokenAddress);
  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", engineAddress);
  const opsVault = await ethers.getContractAt("contracts/v4/NARAOpsVaultV4.sol:NARAOpsVaultV4", opsVaultAddress);
  const bondVault = await ethers.getContractAt("contracts/v4/NARABondVaultV4.sol:NARABondVaultV4", bondVaultAddress);
  const depository = await ethers.getContractAt(
    "contracts/v4/NARABondDepositoryV4NFT.sol:NARABondDepositoryV4NFT",
    bondDepositoryAddress,
  );

  const opsBalance = await token.balanceOf(opsVaultAddress);
  const bondBalance = await token.balanceOf(bondVaultAddress);
  const treasuryBalance = await token.balanceOf(treasury);
  const pendingMarket = await bondVault.pendingMarketChange();
  const terms = await depository.terms();
  const positionNftAddress = await depository.positionNft();
  const positionNft = await ethers.getContractAt(
    "contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4",
    positionNftAddress,
  );
  const positionRendererAddress = await positionNft.renderer();
  const positionRenderer = await ethers.getContractAt(
    "contracts/v4/NARAPositionRendererV4.sol:NARAPositionRendererV4",
    positionRendererAddress,
  );

  assertEq("ops balance", opsBalance, expectedOpsAmount);
  assertEq("ops owner", await opsVault.owner(), admin);
  if (expectedOpsFunded) {
    assertTrue("ops funded", await opsVault.funded());
  } else {
    assertFalse("ops funded", await opsVault.funded());
  }
  assertEq("ops vesting duration", await opsVault.vestingDuration(), 365n * 24n * 60n * 60n);

  assertEq("bond vault balance", bondBalance, expectedBondAmount);
  assertEq("bond vault nara", await bondVault.nara(), tokenAddress);
  assertEq("engine bondVault", await engine.bondVault(), bondVaultAddress);
  assertEq("bond vault current market", await bondVault.market(), ethers.ZeroAddress);
  assertEq("pending market value", pendingMarket[0], bondDepositoryAddress);
  assertTrue("pending market eta in future", BigInt(pendingMarket[1]) > BigInt(Math.floor(Date.now() / 1000)));
  assertEq("active release cap", await bondVault.activeReleaseCap(), 0n);
  assertEq("available to pull", await bondVault.availableToPull(), 0n);

  assertEq("depository treasury", await depository.treasury(), treasury);
  assertTrue("depository positionNft set", positionNftAddress !== ethers.ZeroAddress);
  assertEq("position NFT engine", await positionNft.engine(), engineAddress);
  assertEq("position NFT nara", await positionNft.nara(), tokenAddress);
  assertTrue("position NFT renderer set", positionRendererAddress !== ethers.ZeroAddress);
  assertTrue("position NFT renderer has code", (await ethers.provider.getCode(positionRendererAddress)) !== "0x");
  assertEq("position renderer artwork count", await positionRenderer.ARTWORK_COUNT(), 8n);
  assertEq("position renderer version", await positionRenderer.RENDERER_VERSION(), 1n);
  assertEq("position NFT royalty freeze", await positionNft.royaltyFrozen(), envFlag("V4_EXPECTED_ROYALTIES_FROZEN", true));
  assertTrue("position NFT Genesis minters frozen", await positionNft.genesisMintersFrozen());
  assertEq("position NFT owner", await positionNft.owner(), positionNftOwner);
  assertEq("position NFT pending owner", await positionNft.pendingOwner(), ethers.ZeroAddress);
  assertTrue("bond depository Genesis minter", await positionNft.genesisMinter(bondDepositoryAddress));
  assertFalse("deployer Genesis minter", await positionNft.genesisMinter(deployer));
  const [royaltyReceiver, royaltyAmount] = await positionNft.royaltyInfo(1, 10_000);
  assertEq("position NFT royalty receiver", royaltyReceiver, expectedRoyaltyReceiver);
  assertEq("position NFT royalty bps", royaltyAmount, expectedRoyaltyBps);
  const collection = decodeJsonDataUri("position NFT contract URI", await positionNft.contractURI());
  assertEq("position NFT collection name", collection.name, "NARA Positions");
  assertTrue("position NFT collection image", String(collection.image).startsWith("data:image/svg+xml;base64,"));
  assertFalse("depository paused", await depository.paused());
  assertFalse("depository active", terms.active);
  assertEq("depository capacity", terms.remainingCapacityNara, 0n);
  assertEq("depository genesis round", terms.genesisRoundId, BigInt(env("V4_EXPECTED_GENESIS_ROUND_ID", "1")));
  assertEq("depository genesis tier", terms.genesisTierId, BigInt(env("V4_EXPECTED_GENESIS_TIER_ID", "1")));
  assertEq("depository genesis multiplier bps", terms.genesisRewardMultiplierBps, BigInt(env("V4_EXPECTED_GENESIS_REWARD_MULTIPLIER_BPS", "20000")));
  assertEq("depository genesis eternal", terms.genesisEternal, envFlag("V4_EXPECTED_GENESIS_ETERNAL", false));

  assertTrue("admin bond vault DEFAULT_ADMIN", await bondVault.hasRole(ethers.ZeroHash, admin));
  assertFalse("deployer bond vault DEFAULT_ADMIN", await bondVault.hasRole(ethers.ZeroHash, deployer));
  assertTrue("admin depository DEFAULT_ADMIN", await depository.hasRole(ethers.ZeroHash, admin));
  assertFalse("deployer depository DEFAULT_ADMIN", await depository.hasRole(ethers.ZeroHash, deployer));
  for (const roleName of ["TERMS_ROLE", "PAUSER_ROLE", "TREASURY_ROLE", "PRICE_SIGNER_ROLE"]) {
    const role = ethers.id(roleName);
    assertTrue(`admin depository ${roleName}`, await depository.hasRole(role, admin));
    assertFalse(`deployer depository ${roleName}`, await depository.hasRole(role, deployer));
  }
  assertEq("treasury NARA balance", treasuryBalance, expectedTreasuryFloat);

  console.log("NARA v4 allocation verification passed");
  console.log("Ops vault:        ", opsVaultAddress, ethers.formatUnits(opsBalance, 18), "NARA");
  console.log("Bond vault:       ", bondVaultAddress, ethers.formatUnits(bondBalance, 18), "NARA");
  console.log("Bond depository:  ", bondDepositoryAddress);
  console.log("Position NFT:     ", positionNftAddress);
  console.log("Position renderer:", positionRendererAddress);
  console.log("Pending market ETA", pendingMarket[1].toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
