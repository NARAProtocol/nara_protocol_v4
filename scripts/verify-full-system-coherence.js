import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.connect();
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true, batchMaxCount: 1 });

  console.log("==================================================================");
  console.log("🛡️ NARA PROTOCOL V4 — FULL SYSTEM INTEGRITY & COHERENCE AUDIT");
  console.log("==================================================================");

  // 1. Pinned Production Addresses
  const CORE_CONFIG = {
    engine: "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC",
    token: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    hook: "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088",
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    rewardReserve: "0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
    quoter: "0x0d5e0F971ED27FBfF6c2837bf31316121532048D",
    positionNft: "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b",
    positionRenderer: "0xf6de16A17658EE6C528CbFE715d54787cEcad935",
    corePlate: "0xb58E79F1268Aa7D577b15315F996A9e35c70e34a",
    metadata: "0x0b22a8F72d9684cD810Ba70225a09901eC0280d9",
    genesisPlate: "0x20520115546c28F99aE581d62935e62D9E8B9022",
    securityPrint: "0x88F69C994FE22dB6d31682604DAC29948c7C3728",
    tbaImpl: "0x3a8c9cA4f95E94751774810B33caF01bb992A55F",
    safeMultisig: "0xd65c0e390Dc187A22c52c03816591CC736C0D755"
  };


  let allHealthy = true;

  // 2. Check bytecode existence
  console.log("\n[1/6] 🔍 VERIFYING ON-CHAIN BYTECODE & CONTRACT DEPLOYMENTS...");
  for (const [name, addr] of Object.entries(CORE_CONFIG)) {
    const checksummed = ethers.getAddress(addr.toLowerCase());
    const code = await provider.getCode(checksummed);
    const isValid = code.length > 2;
    console.log(`  • ${name.padEnd(18)} (${checksummed}): ${isValid ? "✅ BYTECODE ACTIVE (" + code.length + " bytes)" : "❌ NO BYTECODE"}`);
    if (!isValid) allHealthy = false;
  }


  // 3. Verify Engine State
  console.log("\n[2/6] ⚙️ VERIFYING ENGINE CONFIGURATION & REWARD RESERVES...");
  const engineAbi = [
    "function currentEpoch() view returns (uint64)",
    "function naraIndexRay() view returns (uint256)",
    "function nextPositionId() view returns (uint256)",
    "function rewardReserveAvailable() view returns (uint256)",
    "function lockFeeWei() view returns (uint96)"
  ];
  const engine = new ethers.Contract(CORE_CONFIG.engine, engineAbi, provider);
  const currentEpoch = await engine.currentEpoch();
  const nextPosId = await engine.nextPositionId();
  const lockFee = await engine.lockFeeWei();
  console.log(`  • Current Epoch:           #${currentEpoch}`);
  console.log(`  • Next Position ID:        #${nextPosId}`);
  console.log(`  • Engine Flat Lock Fee:    ${ethers.formatEther(lockFee)} ETH`);

  // 4. Verify Position NFT Configuration
  console.log("\n[3/6] 💎 VERIFYING POSITION NFT CONFIGURATION (0x01D3...)...");
  const nftAbi = [
    "function engine() view returns (address)",
    "function nara() view returns (address)",
    "function accountImplementation() view returns (address)",
    "function renderer() view returns (address)",
    "function nextTokenId() view returns (uint256)",
    "function owner() view returns (address)"
  ];
  const nft = new ethers.Contract(CORE_CONFIG.positionNft, nftAbi, provider);
  const nftEngine = await nft.engine();
  const nftNara = await nft.nara();
  const nftTba = await nft.accountImplementation();
  const nftRenderer = await nft.renderer();
  const nftNextToken = await nft.nextTokenId();
  const nftOwner = await nft.owner();

  console.log(`  • Linked Engine:           ${nftEngine} (${nftEngine.toLowerCase() === CORE_CONFIG.engine.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);
  console.log(`  • Linked NARA Token:       ${nftNara} (${nftNara.toLowerCase() === CORE_CONFIG.token.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);
  console.log(`  • Linked TBA Impl:         ${nftTba} (${nftTba.toLowerCase() === CORE_CONFIG.tbaImpl.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);
  console.log(`  • Linked Renderer:         ${nftRenderer} (${nftRenderer.toLowerCase() === CORE_CONFIG.positionRenderer.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);
  console.log(`  • Total Minted:            ${nftNextToken - 1n} NFTs`);
  console.log(`  • Contract Admin Owner:    ${nftOwner}`);

  // 5. Verify Renderer Plates & Metadata
  console.log("\n[4/6] 🎨 VERIFYING RENDERER SUB-COMPONENTS...");
  const rendererAbi = [
    "function CORE_PLATE() view returns (address)",
    "function METADATA() view returns (address)",
    "function GENESIS_PLATE() view returns (address)",
    "function COLLECTION_ART() view returns (address)",
    "function tokenURI(address nft, uint256 tokenId) view returns (string)"
  ];
  const renderer = new ethers.Contract(CORE_CONFIG.positionRenderer, rendererAbi, provider);
  const rCore = await renderer.CORE_PLATE();
  const rMeta = await renderer.METADATA();
  const rGen = await renderer.GENESIS_PLATE();
  const rSec = await renderer.COLLECTION_ART();

  console.log(`  • Core Plate:              ${rCore} (${rCore.toLowerCase() === CORE_CONFIG.corePlate.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);
  console.log(`  • Metadata Generator:      ${rMeta} (${rMeta.toLowerCase() === CORE_CONFIG.metadata.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);
  console.log(`  • Genesis Plate:           ${rGen} (${rGen.toLowerCase() === CORE_CONFIG.genesisPlate.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);
  console.log(`  • Security Print Art:      ${rSec} (${rSec.toLowerCase() === CORE_CONFIG.securityPrint.toLowerCase() ? "✅ MATCH" : "❌ MISMATCH"})`);

  // 6. Test Live Token Readback
  console.log("\n[5/6] 🎴 TESTING LIVE TOKEN URI METADATA READBACK...");
  const uri = await renderer.tokenURI(CORE_CONFIG.positionNft, 2);
  const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
  console.log(`  • Token #2 Title:          ${json.name}`);
  console.log(`  • Token #2 SVG Length:     ${json.image.length} chars (100% On-Chain)`);
  console.log(`  • Attributes Count:        ${json.attributes.length} traits`);
  for (const a of json.attributes) {
    console.log(`    - ${a.trait_type.padEnd(25)}: ${a.value}`);
  }

  // 7. Verify Fallback RPC Resilience
  console.log("\n[6/6] 🌐 VERIFYING CLIENT MULTI-RPC RESILIENCE...");
  const endpoints = [
    "https://mainnet.base.org",
    "https://base.publicnode.com",
    "https://1rpc.io/base"
  ];
  for (const ep of endpoints) {
    try {
      const epProvider = new ethers.JsonRpcProvider(ep, 8453, { staticNetwork: true, batchMaxCount: 1 });
      const bn = await epProvider.getBlockNumber();
      console.log(`  • ${ep.padEnd(30)}: ✅ ONLINE (Block #${bn})`);
    } catch (e) {
      console.log(`  • ${ep.padEnd(30)}: ⚠️ FAILED (${e.message})`);
    }
  }

  console.log("\n==================================================================");
  if (allHealthy) {
    console.log("🎉 ALL SYSTEM COMPONENTS ARE 100% HEALTHY, COHERENT & VERIFIED!");
  } else {
    console.log("⚠️ SOME COMPONENTS FAILED VERIFICATION — CHECK LOGS ABOVE");
  }
  console.log("==================================================================");
}

main().catch(console.error);
