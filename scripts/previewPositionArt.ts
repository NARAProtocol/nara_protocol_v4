/**
 * Render the real on-chain NARA position SVG art across every Yield Tier and the
 * Genesis/Eternal variants, then write .svg files + an index.html viewer.
 *
 * Run:  NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/previewPositionArt.ts
 * Output dir is printed at the end (open index.html in a browser).
 */
import hre from "hardhat";
import { mkdirSync, writeFileSync } from "fs";

const ONE = 10n ** 18n;
const LOCK_FEE = 10n ** 14n;

const OUT_DIR =
  "C:/Users/linas/AppData/Local/Temp/claude/c--Users-linas-Desktop-FIELD-Token/" +
  "8ea259a0-433d-44b4-b0e9-a9586113eba5/scratchpad/nft-preview";

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const nara: any = await Token.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();
  const usdc: any = await Token.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
  const engine: any = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(await nara.getAddress());

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
  const accountImpl: any = await Account.deploy();
  await accountImpl.waitForDeployment();

  const Art = await ethers.getContractFactory("NARAPositionArtV1", deployer);
  const art: any = await Art.deploy();
  await art.waitForDeployment();
  const Renderer = await ethers.getContractFactory("NARAPositionRendererV4", {
    libraries: { "project/contracts/v4/libraries/NARAPositionArtV1.sol:NARAPositionArtV1": await art.getAddress() },
    signer: deployer,
  });
  const renderer: any = await Renderer.deploy();
  await renderer.waitForDeployment();

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await accountImpl.getAddress(),
    await renderer.getAddress(),
    await deployer.getAddress(),
    await treasury.getAddress(),
    500,
  );
  await nft.waitForDeployment();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
  const distributor: any = await Distributor.deploy(await nft.getAddress(), await usdc.getAddress());
  await distributor.waitForDeployment();
  await nft.setGenesisRewardDistributor(await distributor.getAddress());

  const engineAddr = await engine.getAddress();
  const nftAddr = await nft.getAddress();
  const dep = await deployer.getAddress();

  mkdirSync(OUT_DIR, { recursive: true });
  const cards: { label: string; file: string }[] = [];

  const save = async (tokenId: number, label: string, file: string) => {
    const svg: string = await renderer.tokenSVG(nftAddr, tokenId);
    writeFileSync(`${OUT_DIR}/${file}`, svg);
    cards.push({ label, file });
    console.log(`rendered ${label} -> ${file}`);
  };

  // Mint token 1 and walk it up the tiers via real claims (cumulative lifetime ETH).
  await nara.mint(dep, 10_000n * ONE);
  await nara.connect(deployer).approve(nftAddr, 10_000n * ONE);
  await nft.connect(deployer).mintAndLock(1_000n * ONE, 96, 0, { value: LOCK_FEE });

  await save(1, "Tier 0 — New (fresh, quiet)", "01-new.svg");

  const claimTo = async (cumulativeEth: bigint, label: string, file: string) => {
    const have = await nft.lifetimeEthClaimed(1);
    const delta = cumulativeEth - have;
    if (delta > 0n) {
      await deployer.sendTransaction({ to: engineAddr, value: delta });
      await engine.setClaimable(1, 0, delta);
      await nft.connect(deployer).claimRewards(1, dep);
    }
    await save(1, label, file);
  };

  await claimTo(ethers.parseEther("0.02"), "Tier 1 — Earning (>0)", "02-earning.svg");
  await claimTo(ethers.parseEther("0.1"), "Tier 2 — Productive (>=0.1 ETH, glow)", "03-productive.svg");
  await claimTo(ethers.parseEther("1"), "Tier 3 — One ETH Club (>=1 ETH, gold)", "04-one-eth-club.svg");
  await claimTo(ethers.parseEther("10"), "Tier 4 — Apex (>=10 ETH, radiant)", "05-apex.svg");

  // Genesis + Eternal provenance (token 2).
  await nft.setGenesisMinter(dep, true);
  await nara.connect(deployer).approve(nftAddr, 1_000n * ONE);
  await nft.connect(deployer).mintGenesisAndLockFor(dep, 1_000n * ONE, 96, 0, 1, 1, 20_000, true, {
    value: LOCK_FEE,
  });
  await save(2, "Genesis + Eternal (provenance flags)", "06-genesis-eternal.svg");

  // A few different base artworks (tokens 3..6 -> artwork index 2..5) at New tier.
  for (let i = 3; i <= 6; i++) {
    await nara.connect(deployer).approve(nftAddr, 1_000n * ONE);
    await nft.connect(deployer).mintAndLock(1_000n * ONE, 96, 0, { value: LOCK_FEE });
    await save(i, `Artwork variant (token ${i})`, `0${i + 4}-artwork-${i}.svg`);
  }

  const html =
    "<!doctype html><meta charset=utf-8><title>NARA Position Art</title>" +
    "<body style='margin:0;background:#07090A;color:#D8D1BD;font-family:monospace'>" +
    "<h1 style='padding:28px 24px 0;font-weight:700;letter-spacing:2px;color:#D8D1BD'>NARA <span style='color:#C2772E'>/</span> PROOF OF POSITION</h1>" +
    "<p style='padding:0 24px;color:#70757D;letter-spacing:1px'>Fully on-chain instruments. Generated by NARAPositionRendererV4.tokenSVG(). No image uploaded.</p>" +
    "<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:24px;padding:24px'>" +
    cards
      .map(
        (c) =>
          `<figure style='margin:0;background:#111417;border:1px solid #26241F;border-radius:14px;padding:14px'>` +
          `<img src='${c.file}' style='width:100%;border-radius:8px;display:block'/>` +
          `<figcaption style='padding-top:10px;font-size:13px;color:#C7B98D'>${c.label}</figcaption></figure>`,
      )
      .join("") +
    "</div></body>";
  writeFileSync(`${OUT_DIR}/index.html`, html);

  console.log("\nDONE. Open this in a browser:");
  console.log(`${OUT_DIR}/index.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
