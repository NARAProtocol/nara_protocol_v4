import { ethers } from "hardhat";

/**
 * Script to deploy NARAArtCorePlateV2 and NARAPositionRendererV6 on Base.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying NARA Position Renderer V6 with account:", deployer.address);

  // Pinned Base Mainnet dependencies from V5 modular art stack
  const METADATA_ADDR = "0x40B32c510168b3236087dE8bC2522B8C1D6E5d39";
  const SECURITY_PRINT_ADDR = "0xC4F06A339B27357422f2541a31C01D38734918e7";
  const GENESIS_PLATE_ADDR = "0x24CBE037E1C7Eb29780182E47B0d19641D3B4702";
  const COLLECTION_ART_ADDR = "0x4B3A889Fe4236aeeDE82f05903b41d2482329243";

  // 1. Deploy NARAArtSecurityPrintV2 (Institutional Banner + Clean Modules)
  console.log("\n1. Deploying NARAArtSecurityPrintV2...");
  const SecurityPrintFactory = await ethers.getContractFactory("NARAArtSecurityPrintV2");
  const securityPrintV2 = await SecurityPrintFactory.deploy();
  await securityPrintV2.waitForDeployment();
  const securityPrintV2Addr = await securityPrintV2.getAddress();
  console.log("✅ NARAArtSecurityPrintV2 deployed at:", securityPrintV2Addr);

  // 2. Deploy NARAArtMetadataV2 (Institutional Sovereign-Grade Metadata for OpenSea)
  console.log("\n2. Deploying NARAArtMetadataV2...");
  const MetadataFactory = await ethers.getContractFactory("NARAArtMetadataV2");
  const metadataV2 = await MetadataFactory.deploy();
  await metadataV2.waitForDeployment();
  const metadataV2Addr = await metadataV2.getAddress();
  console.log("✅ NARAArtMetadataV2 deployed at:", metadataV2Addr);

  // 3. Deploy NARAArtCorePlateV2 (Luxury 48px Fat Frame with High-Contrast Corner Brackets)
  console.log("\n3. Deploying NARAArtCorePlateV2...");
  const CorePlateFactory = await ethers.getContractFactory("NARAArtCorePlateV2");
  const corePlate = await CorePlateFactory.deploy(securityPrintV2Addr);
  await corePlate.waitForDeployment();
  const corePlateAddr = await corePlate.getAddress();
  console.log("✅ NARAArtCorePlateV2 deployed at:", corePlateAddr);

  // 4. Deploy NARAPositionRendererV6
  console.log("\n4. Deploying NARAPositionRendererV6...");
  const RendererV6Factory = await ethers.getContractFactory("NARAPositionRendererV6");
  const rendererV6 = await RendererV6Factory.deploy(
    metadataV2Addr,
    corePlateAddr,
    GENESIS_PLATE_ADDR,
    securityPrintV2Addr
  );
  await rendererV6.waitForDeployment();
  const rendererV6Addr = await rendererV6.getAddress();
  console.log("✅ NARAPositionRendererV6 deployed at:", rendererV6Addr);

  console.log("\n==========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("NARAArtSecurityPrintV2: ", securityPrintV2Addr);
  console.log("NARAArtMetadataV2:      ", metadataV2Addr);
  console.log("NARAArtCorePlateV2:     ", corePlateAddr);
  console.log("NARAPositionRendererV6: ", rendererV6Addr);
  console.log("==========================================");


}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
