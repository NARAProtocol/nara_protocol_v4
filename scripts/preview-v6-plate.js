import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  const SecurityPrint = await ethers.getContractFactory("NARAArtSecurityPrintV1", deployer);
  const securityPrint = await SecurityPrint.deploy();
  await securityPrint.waitForDeployment();

  const CorePlate = await ethers.getContractFactory("NARAArtCorePlateV2", deployer);
  const corePlate = await CorePlate.deploy(await securityPrint.getAddress());
  await corePlate.waitForDeployment();

  // Render Tier 0 for Token 3 (Position 13, Epoch 1300)
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

  fs.writeFileSync("preview_v6_token3.svg", svg, "utf8");
  console.log("Written preview_v6_token3.svg (Length:", svg.length, ")");
}

main().catch(console.error);
