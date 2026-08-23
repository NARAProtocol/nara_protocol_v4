import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  const V7_CONTRACT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
  const V5_CONTRACT = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";

  console.log("==================================================================");
  console.log("🔗 OPENSEA ASSET LINKS COMPARISON");
  console.log("==================================================================");

  console.log("\n❌ OLD CONTRACT (0xCcBD... - The one in your screenshot):");
  console.log("https://opensea.io/assets/base/0xccbd8c59664958636369f8fe24b927aebc3df7cc/13");
  console.log("https://opensea.io/assets/base/0xccbd8c59664958636369f8fe24b927aebc3df7cc/6");

  console.log("\n✅ NEW V7 GENERATIVE CONTRACT (0x01D3... - The luxury gacha stack):");
  console.log("👑 Token #2 (24K Gold):");
  console.log("https://opensea.io/assets/base/0x01d3ac0acda01fe5d6788fa0b4062de94c8de52b/2");
  console.log("\n🔴 Token #4 (Obsidian Stealth + Solar Flare Matrix):");
  console.log("https://opensea.io/assets/base/0x01d3ac0acda01fe5d6788fa0b4062de94c8de52b/4");
  console.log("\n⚡ Token #3 (Solar Flare Matrix):");
  console.log("https://opensea.io/assets/base/0x01d3ac0acda01fe5d6788fa0b4062de94c8de52b/3");
  console.log("\n🪙 Token #1 (Titanium Slate):");
  console.log("https://opensea.io/assets/base/0x01d3ac0acda01fe5d6788fa0b4062de94c8de52b/1");
}

main().catch(console.error);
