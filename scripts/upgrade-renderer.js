import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading Renderer on Base Mainnet with:", deployer.address);

  const POSITION_NFT_ADDR = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const METADATA_V2 = "0x76124Ee01CcE052d1949DECd609c17EDe0369188";
  const CORE_PLATE_V2 = "0x8964E916638bFaC5bd9a1f41d328DC5C688134f5";
  const SECURITY_PRINT_V2 = "0x88F69C994FE22dB6d31682604DAC29948c7C3728";

  // 1. Deploy upgraded NARAArtGenesisPlateV2
  console.log("\n1. Deploying upgraded NARAArtGenesisPlateV2...");
  const GenesisPlateFactory = await ethers.getContractFactory("NARAArtGenesisPlateV2", deployer);
  const genesisPlateV2 = await GenesisPlateFactory.deploy();
  await genesisPlateV2.waitForDeployment();
  const genesisPlateV2Addr = await genesisPlateV2.getAddress();
  console.log("✅ NARAArtGenesisPlateV2:", genesisPlateV2Addr);

  // 2. Deploy upgraded NARAPositionRendererV6
  console.log("\n2. Deploying upgraded NARAPositionRendererV6...");
  const RendererFactory = await ethers.getContractFactory("NARAPositionRendererV6", deployer);
  const renderer = await RendererFactory.deploy(
    METADATA_V2,
    CORE_PLATE_V2,
    genesisPlateV2Addr,
    SECURITY_PRINT_V2
  );
  await renderer.waitForDeployment();
  const rendererAddr = await renderer.getAddress();
  console.log("✅ NARAPositionRendererV6:", rendererAddr);

  // 3. Set Renderer on Position NFT
  console.log("\n3. Calling nft.setRenderer()...");
  const nft = await ethers.getContractAt("NARAPositionNFTV4", POSITION_NFT_ADDR, deployer);
  const tx = await nft.setRenderer(rendererAddr);
  await tx.wait();
  console.log("✅ Live Renderer updated on Base Mainnet!");

  // 4. Query on-chain tokenURI(2)
  console.log("\n4. Querying live on-chain tokenURI(2)...");
  const uri = await renderer.tokenURI(POSITION_NFT_ADDR, 2);
  const jsonStr = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
  const metadata = JSON.parse(jsonStr);

  const svg = Buffer.from(metadata.image.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
  fs.writeFileSync("live_eternal_genesis_perfect.svg", svg, "utf8");
  console.log("✅ Successfully saved live_eternal_genesis_perfect.svg (Length:", svg.length, ")");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
