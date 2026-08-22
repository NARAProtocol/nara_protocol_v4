import hre from "hardhat";

async function main() {
  console.log("==================================================================");
  console.log("🎲 DEEP FORENSIC ANALYSIS: RARITY PULL RATES & LUCK BOOST");
  console.log("==================================================================");

  // Current Curve
  function evaluateCurrent(seed, luckBonus) {
    const raw = seed % 1000;
    const roll = raw > luckBonus ? raw - luckBonus : 0;
    if (roll < 50) return "🌈 Prismatic Holo";
    if (roll < 150) return "👑 24K Gold";
    if (roll < 350) return "🔴 Obsidian Stealth";
    if (roll < 600) return "🟢 Cyber Emerald";
    return "🪙 Titanium Slate";
  }

  // Proposed Elite "High-Stakes Grail" Curve (Where Gold & Holo are much rarer!)
  function evaluateEliteGrail(seed, luckBonus) {
    const raw = seed % 1000;
    const roll = raw > luckBonus ? raw - luckBonus : 0;
    // Holo = 1.0% Base / 8.0% Max Lock
    // Gold = 4.0% Base / 12.0% Max Lock
    // Obsidian = 15% Base / 25% Max Lock
    // Emerald = 25% Base / 35% Max Lock
    // Titanium = 55% Base / 20% Max Lock
    if (roll < 10) return "🌈 Prismatic Holo";
    if (roll < 50) return "👑 24K Gold";
    if (roll < 200) return "🔴 Obsidian Stealth";
    if (roll < 450) return "🟢 Cyber Emerald";
    return "🪙 Titanium Slate";
  }

  const SAMPLE_SIZE = 10000;

  console.log("\n--- CURRENT CURVE (10,000 Monte Carlo Simulations) ---");
  for (const [durName, luck] of [["1-Day Lock (Luck: 0)", 0], ["1-Month Lock (Luck: 28)", 28], ["6-Month Lock (Luck: 175)", 175], ["1-Year Max Lock (Luck: 350)", 350]]) {
    const counts = { "🌈 Prismatic Holo": 0, "👑 24K Gold": 0, "🔴 Obsidian Stealth": 0, "🟢 Cyber Emerald": 0, "🪙 Titanium Slate": 0 };
    for (let s = 0; s < SAMPLE_SIZE; s++) {
      const theme = evaluateCurrent(s, luck);
      counts[theme]++;
    }
    console.log(`\n📊 ${durName}:`);
    for (const [k, v] of Object.entries(counts)) {
      console.log(`  ${k.padEnd(22)}: ${(v / 100).toFixed(1)}% (${v} / ${SAMPLE_SIZE})`);
    }
  }

  console.log("\n\n==================================================================");
  console.log("💎 PROPOSED 'ELITE GRAIL' CURVE (TRUE COLLECTOR SCARCITY)");
  console.log("==================================================================");
  for (const [durName, luck] of [["1-Day Lock (Luck: 0)", 0], ["1-Month Lock (Luck: 28)", 28], ["6-Month Lock (Luck: 175)", 175], ["1-Year Max Lock (Luck: 150)", 150]]) {
    const counts = { "🌈 Prismatic Holo": 0, "👑 24K Gold": 0, "🔴 Obsidian Stealth": 0, "🟢 Cyber Emerald": 0, "🪙 Titanium Slate": 0 };
    for (let s = 0; s < SAMPLE_SIZE; s++) {
      const theme = evaluateEliteGrail(s, luck);
      counts[theme]++;
    }
    console.log(`\n📊 ${durName}:`);
    for (const [k, v] of Object.entries(counts)) {
      console.log(`  ${k.padEnd(22)}: ${(v / 100).toFixed(1)}% (${v} / ${SAMPLE_SIZE})`);
    }
  }
}

main().catch(console.error);
