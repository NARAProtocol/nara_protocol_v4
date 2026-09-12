import hre from "hardhat";

/**
 * Script to deploy NARA Position Renderer V9 on Base Mainnet.
 * Architecture:
 * 1. NARAArtDefsPlateV5 - Master SVG defs, omnidirectional filters, 360 halo & solar astrolabe
 * 2. NARAArtCorePlateV5 - Swiss chronometer engine with calibrated 5-tier pyramid & 24K Gold Apex dominance
 * 3. NARAArtMetadataV5 - Calibrated OpenSea attributes with Gen-0 grandfathering for #1-#47
 * 4. NARAPositionRendererV9 - Master wiring to NARAEngine and NARAPositionNFTV4
 */
async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Deploying NARA Position Renderer V9 with account:", deployer.address);

  // Canonical Base Mainnet addresses
  const ENGINE_ADDR = "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC";
  const BANNER_ADDR = "0xc528A95212a9f9BD69B056fe89119F9Aa0bBb09a";
  const POSITION_NFT_ADDR = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";

  // 1. Deploy NARAArtDefsPlateV5
  console.log("\n1. Deploying NARAArtDefsPlateV5...");
  const DefsFactory = await ethers.getContractFactory("NARAArtDefsPlateV5");
  const defsPlate = await DefsFactory.deploy();
  await defsPlate.waitForDeployment();
  const defsPlateAddr = await defsPlate.getAddress();
  console.log("✅ NARAArtDefsPlateV5 deployed at:", defsPlateAddr);

  // 2. Deploy NARAArtCorePlateV5
  console.log("\n2. Deploying NARAArtCorePlateV5...");
  const CorePlateFactory = await ethers.getContractFactory("NARAArtCorePlateV5");
  const corePlate = await CorePlateFactory.deploy(defsPlateAddr);
  await corePlate.waitForDeployment();
  const corePlateAddr = await corePlate.getAddress();
  console.log("✅ NARAArtCorePlateV5 deployed at:", corePlateAddr);

  // 3. Deploy NARAArtMetadataV5
  console.log("\n3. Deploying NARAArtMetadataV5...");
  const MetadataFactory = await ethers.getContractFactory("NARAArtMetadataV5");
  const metadata = await MetadataFactory.deploy();
  await metadata.waitForDeployment();
  const metadataAddr = await metadata.getAddress();
  console.log("✅ NARAArtMetadataV5 deployed at:", metadataAddr);

  // 4. Deploy NARAPositionRendererV9
  console.log("\n4. Deploying NARAPositionRendererV9...");
  const RendererV9Factory = await ethers.getContractFactory("NARAPositionRendererV9");
  const rendererV9 = await RendererV9Factory.deploy(
    ENGINE_ADDR,
    corePlateAddr,
    metadataAddr,
    BANNER_ADDR
  );
  await rendererV9.waitForDeployment();
  const rendererV9Addr = await rendererV9.getAddress();
  console.log("✅ NARAPositionRendererV9 deployed at:", rendererV9Addr);

  console.log("\n=======================================================");
  console.log("V9 MODULAR RENDERER DEPLOYMENT COMPLETE");
  console.log("NARAArtDefsPlateV5:     ", defsPlateAddr);
  console.log("NARAArtCorePlateV5:     ", corePlateAddr);
  console.log("NARAArtMetadataV5:      ", metadataAddr);
  console.log("NARAPositionRendererV9: ", rendererV9Addr);
  console.log("=======================================================");

  // 5. Wire setRenderer on NARAPositionNFTV4
  const nftContract = await ethers.getContractAt(
    [
      "function owner() view returns (address)",
      "function renderer() view returns (address)",
      "function setRenderer(address newRenderer) external"
    ],
    POSITION_NFT_ADDR
  );
  const currentOwner = await nftContract.owner();
  const currentRenderer = await nftContract.renderer();
  console.log("\nNARAPositionNFTV4 (0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b):");
  console.log("  Owner:            ", currentOwner);
  console.log("  Current Renderer: ", currentRenderer);

  if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("\n⚡ Deployer is the contract owner. Executing setRenderer(V9)...");
    const tx = await nftContract.setRenderer(rendererV9Addr);
    console.log("  Transaction Hash: ", tx.hash);
    const receipt = await tx.wait();
    console.log("  ✅ setRenderer confirmed in block", receipt.blockNumber);
    console.log("  Verified Active Renderer:", await nftContract.renderer());
  } else {
    const txData = nftContract.interface.encodeFunctionData("setRenderer", [rendererV9Addr]);
    console.log("\n⚠️ Deployer is NOT owner. Please execute setRenderer from owner:", currentOwner);
    console.log("  Calldata: ", txData);
  }
  console.log("=======================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
