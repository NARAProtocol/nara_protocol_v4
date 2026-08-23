import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  const GenesisPlateFactory = await ethers.getContractFactory("NARAArtGenesisPlateV2", deployer);
  const plate = await GenesisPlateFactory.deploy();
  await plate.waitForDeployment();

  const svg = await plate.svg(0, 0n, true, 2n, 16n, 1, 1, 1787421699n, 0, 0);
  fs.writeFileSync("test_genesis_v2.svg", svg, "utf8");
  console.log("Written test_genesis_v2.svg (Length:", svg.length, ")");
}

main().catch(console.error);
