// Read-only live state check: Position NFT + Engine (no keys, no tx, no writes)
import { ethers } from "ethers";

const p = new ethers.JsonRpcProvider("https://mainnet.base.org");

const nft = new ethers.Contract(
  "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b",
  [
    "function nextTokenId() view returns (uint256)",
    "function renderer() view returns (address)",
  ],
  p
);

const eng = new ethers.Contract(
  "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC",
  [
    "function currentEpoch() view returns (uint64)",
    "function totalLocked() view returns (uint256)",
  ],
  p
);

async function main() {
  console.log("=== LIVE BASE MAINNET STATE (read-only) ===");
  try {
    const next = await nft.nextTokenId();
    console.log("PositionNFT nextTokenId:", next.toString(), next.toString() > 1 ? "(mints HAVE occurred)" : "(no mints yet)");
  } catch (e: any) {
    console.log("nextTokenId: ERR", String(e.message ?? e).slice(0, 120));
  }
  try {
    const r = await nft.renderer();
    console.log("Active renderer:", r, r.toLowerCase() === "0xbe25f3ce387e01cae5da7d7f0bc2fde72c244a98" ? "(V9 LIVE)" : "(not V9)");
  } catch (e: any) {
    console.log("renderer: ERR", String(e.message ?? e).slice(0, 120));
  }
  try {
    const e = await eng.currentEpoch();
    console.log("Engine currentEpoch:", e.toString());
  } catch (e: any) {
    console.log("currentEpoch: ERR", String(e.message ?? e).slice(0, 120));
  }
  try {
    const t = await eng.totalLocked();
    console.log("Engine totalLocked:", ethers.formatEther(t), "NARA");
  } catch (e: any) {
    console.log("totalLocked: ERR", String(e.message ?? e).slice(0, 120));
  }
  console.log("Check complete.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
