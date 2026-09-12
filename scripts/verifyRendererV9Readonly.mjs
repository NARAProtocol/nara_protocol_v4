// READ-ONLY live verification of the Renderer V9 stack activation.
// No transactions. No keys. Public RPC only. Prints small summaries, never full SVG payloads.
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

const NFT = "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b";
const EXPECTED_RENDERER_V9 = "0xBe25F3cE387e01cAe5dA7d7F0bc2FdE72c244a98";
const ACTIVATION_TX = "0x7c162cb0efd26c08964d855b9064f0e79cfca8937cd050a73a116e5b540cc70f";

const ART_STACK = [
  ["NARAArtDefsPlateV5", "0xECdaf4B930cec3293479de0404B72282c7Bf9Aba", 3785],
  ["NARAArtCorePlateV5", "0x3Ae72d3ef410AE9baE795Cf9a027ef9fDcBf9996", 24420],
  ["NARAArtMetadataV5", "0xe644Be90A7B46EE146be0C1Eb79Ee47C9cf700d9", 6957],
  ["NARAPositionRendererV9", "0xBe25F3cE387e01cAe5dA7d7F0bc2FdE72c244a98", 6062],
];

const codeSize = (hex) => (hex === "0x" ? 0 : (hex.length - 2) / 2);

console.log("=== 1. Art stack runtime code presence + size match ===");
for (const [name, addr, expectedSize] of ART_STACK) {
  const code = await provider.getCode(addr);
  const size = codeSize(code);
  const match = size === expectedSize ? "SIZE MATCH" : `!! expected ${expectedSize} !!`;
  console.log(`${name.padEnd(24)} ${addr}  ${String(size).padStart(6)} bytes  ${size > 0 ? `HAS CODE · ${match}` : "!! EMPTY !!"}`);
}

console.log("=== 2. Activation transaction receipt ===");
const receipt = await provider.getTransactionReceipt(ACTIVATION_TX);
console.log(`status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}   block: ${receipt.blockNumber}`);
const topicRendererSet = ethers.id("RendererSet(address)");
const rsLogs = receipt.logs.filter(
  (l) => l.address.toLowerCase() === NFT.toLowerCase() && l.topics[0] === topicRendererSet
);
for (const l of rsLogs) {
  console.log(`RendererSet event -> new renderer: 0x${l.data.slice(26)}`);
}

console.log("\n=== 3. Live NFT readback ===");
const nft = new ethers.Contract(
  NFT,
  [
    "function owner() view returns (address)",
    "function renderer() view returns (address)",
    "function rendererFrozen() view returns (bool)",
    "function nextTokenId() view returns (uint256)",
    "function royaltyInfo(uint256 tokenId, uint256 salePrice) view returns (address, uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
  ],
  provider
);
const activeRenderer = await nft.renderer();
console.log("NFT:                ", NFT);
console.log("owner():            ", await nft.owner());
console.log("renderer():         ", activeRenderer);
console.log("matches V9 expected:", activeRenderer.toLowerCase() === EXPECTED_RENDERER_V9.toLowerCase());
console.log("rendererFrozen():   ", await nft.rendererFrozen());
try {
  console.log("nextTokenId():      ", (await nft.nextTokenId()).toString(), "(minted so far = nextTokenId - 1)");
} catch {
  console.log("nextTokenId():      (not exposed)");
}
const [royaltyReceiver, royaltyAmount] = await nft.royaltyInfo(1, 10000n);
console.log("royaltyInfo(1,10000):", `${royaltyReceiver} receives ${royaltyAmount.toString()}/10000 (${Number(royaltyAmount) / 100}%)`);

console.log("\n=== 4. Spot-check token telemetry (attributes only, no SVG) ===");
for (const id of [10, 27, 3]) {
  try {
    const uri = await nft.tokenURI(id);
    const b64 = uri.includes("base64,") ? uri.split("base64,")[1] : null;
    const json = b64
      ? JSON.parse(Buffer.from(b64, "base64").toString("utf8"))
      : JSON.parse(decodeURIComponent(uri.replace(/^data:application\/json,/, "")));
    const attrs = (json.attributes || []).map((a) => `${a.trait_type ?? a.key}: ${a.value}`).join(" | ");
    console.log(`#${id}  ${json.name ?? "(no name)"}`);
    console.log(`    ${attrs.slice(0, 300)}`);
  } catch (e) {
    console.log(`#${id}  tokenURI read failed: ${String(e).slice(0, 160)}`);
  }
}
console.log("\nDONE (read-only)");
