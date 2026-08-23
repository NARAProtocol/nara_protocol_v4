import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  const SecurityPrint = await ethers.getContractFactory("NARAArtSecurityPrintV2", deployer);
  const securityPrint = await SecurityPrint.deploy();
  await securityPrint.waitForDeployment();

  const Metadata = await ethers.getContractFactory("NARAArtMetadataV2", deployer);
  const metadata = await Metadata.deploy();
  await metadata.waitForDeployment();

  const CorePlate = await ethers.getContractFactory("NARAArtCorePlateV2", deployer);
  const corePlate = await CorePlate.deploy(await securityPrint.getAddress());
  await corePlate.waitForDeployment();

  // Test SVG for Token 3
  const svg = await corePlate.svg(
    0, // tier
    12345n, // seed
    0, // module
    3n, // tokenId
    13n, // positionId
    1300n, // createdEpoch
    0, // claimCount
    0 // extendCount
  );

  fs.writeFileSync("final_v6_token3_preview.svg", svg, "utf8");
  console.log("Written final_v6_token3_preview.svg (Length:", svg.length, ")");

  // Test metadata output
  const attrs = await metadata.attributes(12345n, 0, 0, false, false, 13n, 1300n, 0, 0, 0, 0n, 0, 0);
  console.log("\n=== METADATA JSON ATTRIBUTES ===");
  console.log(JSON.stringify(JSON.parse(attrs), null, 2));

  // Test collection banner SVG
  const banner = await securityPrint.collectionSVG();
  fs.writeFileSync("final_v6_collection_banner.svg", banner, "utf8");
  console.log("\nWritten final_v6_collection_banner.svg (Length:", banner.length, ")");
}

main().catch(console.error);
