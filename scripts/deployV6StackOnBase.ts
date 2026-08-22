import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("==================================================================");
  console.log("🚀 RESUMING NARA V6 DEPLOYMENT ON BASE MAINNET");
  console.log("==================================================================");
  console.log("Deployer Address:", deployer.address);
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Deployer Balance:", ethers.formatEther(balance), "ETH");

  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const NARA_ADDR = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
  const ACCOUNT_IMPL_ADDR = "0x3a8c9cA4f95E94751774810B33caF01bb992A55F";
  const GENESIS_PLATE_ADDR = "0x20520115546c28F99aE581d62935e62D9E8B9022";
  const ROYALTY_RECEIVER = deployer.address;
  const ROYALTY_BPS = 1000; // 10.00%

  // Already deployed in previous step on Base
  const securityPrintV2Addr = "0x88F69C994FE22dB6d31682604DAC29948c7C3728";
  const metadataV2Addr = "0x76124Ee01CcE052d1949DECd609c17EDe0369188";
  const corePlateV2Addr = "0x8964E916638bFaC5bd9a1f41d328DC5C688134f5";

  console.log("Reusing NARAArtSecurityPrintV2:", securityPrintV2Addr);
  console.log("Reusing NARAArtMetadataV2:     ", metadataV2Addr);
  console.log("Reusing NARAArtCorePlateV2:    ", corePlateV2Addr);

  // 4. Deploy NARAPositionRendererV6
  console.log("\n[4/5] Deploying NARAPositionRendererV6...");
  const RendererV6Factory = await ethers.getContractFactory("NARAPositionRendererV6", deployer);
  const rendererV6 = await RendererV6Factory.deploy(
    metadataV2Addr,
    corePlateV2Addr,
    GENESIS_PLATE_ADDR,
    securityPrintV2Addr
  );
  await rendererV6.waitForDeployment();
  const rendererV6Addr = await rendererV6.getAddress();
  console.log("✅ NARAPositionRendererV6:", rendererV6Addr);

  // 5. Deploy NARAPositionNFTV4 (with upgradeable setRenderer + freezeRenderer)
  console.log("\n[5/5] Deploying NARAPositionNFTV4...");
  const PositionNFTFactory = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const positionNft = await PositionNFTFactory.deploy(
    ENGINE_ADDR,
    NARA_ADDR,
    ACCOUNT_IMPL_ADDR,
    rendererV6Addr,
    deployer.address,
    ROYALTY_RECEIVER,
    ROYALTY_BPS
  );
  await positionNft.waitForDeployment();
  const positionNftAddr = await positionNft.getAddress();
  console.log("✅ NARAPositionNFTV4:", positionNftAddr);

  // Freeze royalties
  console.log("\nFreezing 10.00% royalty policy...");
  const txFreeze = await positionNft.freezeRoyalties();
  await txFreeze.wait();
  console.log("✅ Royalties permanently frozen at 10.00%");

  console.log("\n==================================================================");
  console.log("🎉 FULL V6 STACK DEPLOYED TO BASE MAINNET SUCCESSFULLY");
  console.log("==================================================================");
  console.log("NARAArtSecurityPrintV2: ", securityPrintV2Addr);
  console.log("NARAArtMetadataV2:      ", metadataV2Addr);
  console.log("NARAArtCorePlateV2:     ", corePlateV2Addr);
  console.log("NARAPositionRendererV6: ", rendererV6Addr);
  console.log("NARAPositionNFTV4:      ", positionNftAddr);
  console.log("==================================================================");

  // Write deployment manifest to file
  const manifest = {
    chainId: 8453,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    securityPrintV2: securityPrintV2Addr,
    metadataV2: metadataV2Addr,
    corePlateV2: corePlateV2Addr,
    positionRendererV6: rendererV6Addr,
    positionNft: positionNftAddr,
  };
  fs.writeFileSync("v6_deployment_manifest.json", JSON.stringify(manifest, null, 2), "utf8");
  console.log("Manifest saved to v6_deployment_manifest.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
