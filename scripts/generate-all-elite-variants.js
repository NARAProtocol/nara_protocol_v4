import hre from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();

  const CorePlateFactory = await ethers.getContractFactory("NARAArtCorePlateV3", deployer);
  const corePlate = await CorePlateFactory.deploy();
  await corePlate.waitForDeployment();

  console.log("==================================================================");
  console.log("🎨 GENERATING ALL 5 TOP 1% ELITE CHASSIS VARIANTS");
  console.log("==================================================================");

  // Seeds chosen to trigger each exact tier:
  // Holo: roll < 25 (seed = 10)
  // Gold: roll < 100 (seed = 50)
  // Obsidian: roll < 220 (seed = 150)
  // Emerald: roll < 400 (seed = 300)
  // Titanium: roll >= 400 (seed = 500)

  const variants = [
    { name: "Prismatic Holo Foil (Legendary)", seed: 10n, file: "variant_1_prismatic_holo.svg" },
    { name: "24K Gilded Gold (Ultra-Rare)", seed: 50n, file: "variant_2_24k_gold.svg" },
    { name: "Obsidian Stealth (Rare)", seed: 150n, file: "variant_3_obsidian_stealth.svg" },
    { name: "Cybernetic Emerald (Uncommon)", seed: 300n, file: "variant_4_cyber_emerald.svg" },
    { name: "Titanium Slate (Common)", seed: 500n, file: "variant_5_titanium_slate.svg" }
  ];

  for (const v of variants) {
    const svg = await corePlate.svg(
      0, // Tier 0 (Fresh Mint)
      v.seed,
      0,
      1n,
      15n,
      1330n,
      0,
      0
    );
    fs.writeFileSync(v.file, svg, "utf8");
    console.log(`✅ Generated ${v.name} -> ${v.file} (${svg.length} bytes)`);
  }
}

main().catch(console.error);
