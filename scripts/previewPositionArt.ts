/**
 * Render the real on-chain NARA position SVG art across every Realized Tier and the
 * Genesis/Eternal variants, then write .svg files + an index.html viewer.
 *
 * Run: npm run preview:v4:position-nft-art
 * Output dir is printed at the end (open index.html in a browser).
 */
import hre from "hardhat";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  POSITION_NFT_PHASE2_CHANGE_ID,
  collectPositionNftPhase2ArtifactEvidence,
} from "./lib/v4PositionNftPhase2.js";

const ONE = 10n ** 18n;
const LOCK_FEE = 10n ** 14n;

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");
const ART_QA_ROOT = resolve(REPOSITORY_ROOT, ".nara-art-qa");
const REQUESTED_OUT_DIR = process.env.V4_POSITION_NFT_ART_QA_OUT?.trim();
const OUT_DIR = REQUESTED_OUT_DIR
  ? resolve(REPOSITORY_ROOT, REQUESTED_OUT_DIR)
  : resolve(ART_QA_ROOT, "v4-position-nft-phase2");
const OUTPUT_RELATIVE_PATH = relative(ART_QA_ROOT, OUT_DIR);
if (
  OUTPUT_RELATIVE_PATH.length === 0 ||
  OUTPUT_RELATIVE_PATH.startsWith("..") ||
  isAbsolute(OUTPUT_RELATIVE_PATH)
) {
  throw new Error("V4_POSITION_NFT_ART_QA_OUT must be a new subdirectory inside .nara-art-qa/");
}

function decodeJsonDataUri(value: string, label: string): Record<string, unknown> {
  const prefix = "data:application/json;base64,";
  if (!value.startsWith(prefix)) throw new Error(`${label} is not a base64 JSON data URI`);
  const parsed = JSON.parse(Buffer.from(value.slice(prefix.length), "base64").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} does not decode to a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function decodeSvgDataUri(value: unknown, label: string): string {
  const prefix = "data:image/svg+xml;base64,";
  if (typeof value !== "string" || !value.startsWith(prefix)) {
    throw new Error(`${label} does not contain a base64 SVG image`);
  }
  return Buffer.from(value.slice(prefix.length), "base64").toString("utf8");
}

function gitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(`Art-QA source check failed: git ${args.join(" ")} did not succeed`);
  }
}

async function main() {
  const networkName = hre.globalOptions.network ?? "default";
  if (networkName !== "default" && networkName !== "hardhat") {
    throw new Error("Position NFT art preview may run only on the local default/hardhat network");
  }
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 31_337n) {
    throw new Error(`Position NFT art preview requires local chain 31337; connected ${network.chainId}`);
  }
  const sourceCommit = gitOutput(["rev-parse", "HEAD"]).toLowerCase();
  const originMainCommit = gitOutput(["rev-parse", "origin/main"]).toLowerCase();
  const dirty = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!/^[0-9a-f]{40}$/.test(sourceCommit) || sourceCommit !== originMainCommit || dirty !== "") {
    throw new Error("Art QA requires the exact clean protected source commit at origin/main");
  }
  const sourceArtifacts = await collectPositionNftPhase2ArtifactEvidence(hre.artifacts);
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

  const Metadata = await ethers.getContractFactory("NARAArtMetadataV1", deployer);
  const SecurityPrint = await ethers.getContractFactory("NARAArtSecurityPrintV1", deployer);
  const metadata: any = await Metadata.deploy();
  const securityPrint: any = await SecurityPrint.deploy();
  await metadata.waitForDeployment();
  await securityPrint.waitForDeployment();

  const CorePlate = await ethers.getContractFactory("NARAArtCorePlateV1", deployer);
  const GenesisPlate = await ethers.getContractFactory("NARAArtGenesisPlateV1", deployer);
  const corePlate: any = await CorePlate.deploy(await securityPrint.getAddress());
  const genesisPlate: any = await GenesisPlate.deploy();
  await corePlate.waitForDeployment();
  await genesisPlate.waitForDeployment();

  const Renderer = await ethers.getContractFactory("NARAPositionRendererV5", deployer);
  const renderer: any = await Renderer.deploy(
    await metadata.getAddress(),
    await corePlate.getAddress(),
    await genesisPlate.getAddress(),
    await securityPrint.getAddress(),
  );
  await renderer.waitForDeployment();

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await accountImpl.getAddress(),
    await renderer.getAddress(),
    await deployer.getAddress(),
    await treasury.getAddress(),
    1_000,
  );
  await nft.waitForDeployment();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
  const distributor: any = await Distributor.deploy(await nft.getAddress(), await usdc.getAddress());
  await distributor.waitForDeployment();
  await nft.setGenesisRewardDistributor(await distributor.getAddress());

  const engineAddr = await engine.getAddress();
  const nftAddr = await nft.getAddress();
  const dep = await deployer.getAddress();

  if (existsSync(OUT_DIR) && readdirSync(OUT_DIR).length !== 0) {
    throw new Error(`Refusing to overwrite non-empty art-QA directory: ${OUT_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const generatedArtifacts: Array<{ path: string; sha256: string; bytes: number }> = [];
  const writeQaArtifact = (name: string, contents: string): void => {
    if (name.includes("/") || name.includes("\\") || name === "qa-manifest.json") {
      throw new Error(`Invalid generated art-QA filename: ${name}`);
    }
    const bytes = Buffer.from(contents, "utf8");
    writeFileSync(join(OUT_DIR, name), bytes, { flag: "wx" });
    generatedArtifacts.push({
      path: name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    });
  };
  const cards: { label: string; file: string }[] = [];
  const rareCards: { label: string; file: string; note: string }[] = [];

  const save = async (tokenId: number, label: string, file: string) => {
    const svg: string = await renderer.tokenSVG(nftAddr, tokenId);
    writeQaArtifact(file, svg);
    cards.push({ label, file });
    console.log(`rendered ${label} -> ${file}`);
  };

  const saveRareCoreProof = async (seed: bigint, label: string, note: string, file: string) => {
    const svg: string = await corePlate.svg(4, seed, 5, seed, seed, 0, 2, 1);
    writeQaArtifact(file, svg);
    rareCards.push({ label, file, note });
    console.log(`rendered ${label} -> ${file}`);
  };

  // Mint token 1 and walk it up the tiers via real claims (cumulative lifetime ETH).
  await nara.mint(dep, 100_000n * ONE);
  await nara.connect(deployer).approve(nftAddr, 100_000n * ONE);
  await nft.connect(deployer).mintAndLock(1_000n * ONE, 96, 0, { value: LOCK_FEE });

  await save(1, "Tier 0 — New / Dormant", "01-new.svg");

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

  const claimNara = async (positionId: number, amount: bigint) => {
    await nara.mint(engineAddr, amount);
    await engine.setClaimable(positionId, amount, 0);
    await nft.connect(deployer).claimRewards(positionId, dep);
  };

  await claimTo(ethers.parseEther("0.02"), "Tier 1 — Activated (>0)", "02-activated.svg");
  await claimTo(ethers.parseEther("0.1"), "Tier 2 — Rewarded (>=0.1 ETH)", "03-rewarded.svg");
  await claimTo(ethers.parseEther("1"), "Tier 3 — One ETH Mark (>=1 ETH)", "04-one-eth-mark.svg");
  await claimTo(ethers.parseEther("10"), "Tier 4 — Apex (>=10 ETH, radiant)", "05-apex.svg");

  for (let i = 0; i < 8; i++) await claimNara(1, ONE);
  for (let i = 0; i < 6; i++) await nft.connect(deployer).extendLock(1, 1);
  await save(1, "Action accretion (C12 / E6)", "06-action-accretion.svg");

  // Genesis + Eternal provenance (token 2).
  await nft.setGenesisMinter(dep, true);
  await nara.connect(deployer).approve(nftAddr, 1_000n * ONE);
  await nft.connect(deployer).mintGenesisAndLockFor(dep, 1_000n * ONE, 96, 0, 1, 1, 20_000, true, {
    value: LOCK_FEE,
  });
  await save(2, "Genesis + Eternal (provenance flags)", "07-genesis-eternal.svg");

  await claimNara(2, 3n * ONE);
  await nft.connect(deployer).extendLock(2, 1);
  await save(2, "Genesis + Eternal accretion (C1 / E1)", "08-genesis-eternal-accreted.svg");

  // Forced rare-seed proofs for visual QA only. Real tokenSVG() cards above get these traits
  // only when their deterministic mint seed lands on the same rarity predicates.
  await saveRareCoreProof(
    777n,
    "Double Strike / NARA press glitch",
    "Forced seed 777 for visual QA. Natural chance: about 1 in 10,000.",
    "09-rare-double-strike.svg",
  );
  await saveRareCoreProof(
    7777n,
    "Golden Sigil / gold N",
    "Forced seed 7777 for visual QA. Natural chance: about 1 in 100,000.",
    "10-rare-golden-sigil.svg",
  );

  // Capture every standard V5 module subsystem at New tier.
  const seenModules = new Set<number>();
  for (let i = 3; seenModules.size < 6 && i <= 80; i++) {
    await nara.connect(deployer).approve(nftAddr, 1_000n * ONE);
    await nft.connect(deployer).mintAndLock(1_000n * ONE, 96, 0, { value: LOCK_FEE });
    const moduleIdx = Number(await renderer.artworkIndex(i));
    if (!seenModules.has(moduleIdx)) {
      seenModules.add(moduleIdx);
      const moduleName = await renderer.artworkName(moduleIdx);
      await save(
        i,
        `Module variant — ${moduleName} (token ${i})`,
        `${String(10 + seenModules.size).padStart(2, "0")}-module-${moduleIdx}-${moduleName.toLowerCase().replaceAll(" ", "-")}.svg`,
      );
    }
  }
  if (seenModules.size !== 6) {
    throw new Error(`Art QA observed ${seenModules.size}/6 renderer modules; refusing incomplete evidence`);
  }

  const tokenUri: string = await nft.tokenURI(1);
  const tokenMetadata = decodeJsonDataUri(tokenUri, "tokenURI(1)");
  const tokenImage = decodeSvgDataUri(tokenMetadata.image, "tokenURI(1)");
  const collectionUri: string = await nft.contractURI();
  const collectionMetadata = decodeJsonDataUri(collectionUri, "contractURI()");
  const collectionImage = decodeSvgDataUri(collectionMetadata.image, "contractURI()");
  writeQaArtifact("token-1-uri.txt", `${tokenUri}\n`);
  writeQaArtifact("token-1-metadata.json", `${JSON.stringify(tokenMetadata, null, 2)}\n`);
  writeQaArtifact("token-1-image.svg", tokenImage);
  writeQaArtifact("collection-uri.txt", `${collectionUri}\n`);
  writeQaArtifact("collection-metadata.json", `${JSON.stringify(collectionMetadata, null, 2)}\n`);
  writeQaArtifact("collection-image.svg", collectionImage);

  // Deploy a local-only NFT against a contract that intentionally lacks the renderer ABI.
  // This forces both reviewed fallback paths without changing production source or state.
  const fallbackNft: any = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await accountImpl.getAddress(),
    await usdc.getAddress(),
    await deployer.getAddress(),
    await treasury.getAddress(),
    1_000,
  );
  await fallbackNft.waitForDeployment();
  const fallbackNftAddress = await fallbackNft.getAddress();
  await nara.connect(deployer).approve(fallbackNftAddress, 1_000n * ONE);
  await fallbackNft.connect(deployer).mintAndLock(1_000n * ONE, 96, 0, { value: LOCK_FEE });
  const fallbackTokenUri: string = await fallbackNft.tokenURI(1);
  const fallbackTokenMetadata = decodeJsonDataUri(fallbackTokenUri, "fallback tokenURI(1)");
  const fallbackTokenImage = decodeSvgDataUri(fallbackTokenMetadata.image, "fallback tokenURI(1)");
  const fallbackCollectionUri: string = await fallbackNft.contractURI();
  const fallbackCollectionImage =
    typeof fallbackCollectionMetadata.image === "string" && fallbackCollectionMetadata.image.startsWith("data:image/svg+xml")
      ? decodeSvgDataUri(fallbackCollectionMetadata.image, "fallback contractURI() image")
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#888" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="14">No Collection Image (Fallback URI)</text></svg>';
  writeQaArtifact("fallback-token-1-uri.txt", `${fallbackTokenUri}\n`);
  writeQaArtifact("fallback-token-1-metadata.json", `${JSON.stringify(fallbackTokenMetadata, null, 2)}\n`);
  writeQaArtifact("fallback-token-1-image.svg", fallbackTokenImage);
  writeQaArtifact("fallback-collection-uri.txt", `${fallbackCollectionUri}\n`);
  writeQaArtifact(
    "fallback-collection-metadata.json",
    `${JSON.stringify(fallbackCollectionMetadata, null, 2)}\n`,
  );
  writeQaArtifact("fallback-collection-image.svg", fallbackCollectionImage);

  const htmlEscape = (value: unknown): string => JSON.stringify(value, null, 2)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const metadataQaHtml =
    "<!doctype html><meta charset=utf-8><title>NARA Metadata QA</title>" +
    "<style>body{margin:0;background:#090b0d;color:#ddd;font:14px/1.5 Consolas,monospace}main{padding:24px;display:grid;gap:28px}section{border:1px solid #333;padding:18px}img{width:min(420px,100%);background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#b8c2cc}</style>" +
    "<main><h1>NARA token / collection / fallback metadata QA</h1>" +
    `<section><h2>tokenURI(1)</h2><img src='token-1-image.svg' alt='decoded token metadata image'/><pre>${htmlEscape(tokenMetadata)}</pre></section>` +
    `<section><h2>contractURI()</h2><img src='collection-image.svg' alt='decoded collection metadata image'/><pre>${htmlEscape(collectionMetadata)}</pre></section>` +
    `<section><h2>Renderer-failure fallback tokenURI(1)</h2><img src='fallback-token-1-image.svg' alt='decoded fallback token image'/><pre>${htmlEscape(fallbackTokenMetadata)}</pre></section>` +
    `<section><h2>Renderer-failure fallback contractURI()</h2><img src='fallback-collection-image.svg' alt='decoded fallback collection image'/><pre>${htmlEscape(fallbackCollectionMetadata)}</pre></section>` +
    "</main>";

  const rareHtml = rareCards
    .map(
      (c) =>
        `<figure class='rare-card'><img src='${c.file}' alt='${c.label}'/>` +
        `<figcaption><strong>${c.label}</strong><span>${c.note}</span></figcaption></figure>`,
    )
    .join("");

  const cardHtml = cards
    .map(
      (c) =>
        `<figure class='card'><img src='${c.file}' alt='${c.label}'/>` +
        `<figcaption>${c.label}</figcaption></figure>`,
    )
    .join("");

  const version = "phase2";
  const rareOnlyHtml =
    "<!doctype html><meta charset=utf-8><title>NARA Rare Hit Showcase</title>" +
    "<style>" +
    "body{margin:0;min-height:100vh;background:#07090A;color:#D8D1BD;font-family:'IBM Plex Mono',Consolas,monospace}" +
    "main{padding:28px;display:grid;gap:24px}h1{margin:0;color:#D8D1BD;font-size:34px;letter-spacing:3px}" +
    "h1 span{color:#E5B25D}.intro{max-width:1040px;color:#A9A08B;line-height:1.6;letter-spacing:.8px}" +
    ".showcase{display:grid;grid-template-columns:repeat(2,minmax(420px,720px));gap:28px;align-items:start}" +
    ".hit{margin:0;background:#11100C;border:1px solid #5B4727;border-radius:12px;padding:18px}" +
    ".hit img{width:100%;display:block;border-radius:8px;aspect-ratio:1/1;background:#050608}" +
    ".hit figcaption{display:grid;gap:8px;padding:14px 4px 2px}.hit strong{color:#E5B25D;font-size:17px;letter-spacing:1.2px}" +
    ".hit span{color:#C7B98D;font-size:13px;line-height:1.45}.rule{color:#6F6B63;font-size:12px;letter-spacing:1px}" +
    "@media(max-width:980px){.showcase{grid-template-columns:1fr}main{padding:18px}h1{font-size:26px}}" +
    "</style><body><main><header><h1>NARA <span>/</span> RARE HIT SHOWCASE</h1>" +
    "<p class='intro'>Forced-seed visual QA page. These two cards deliberately trigger the rare predicates so the plate errors are easy to inspect at full size. Real minted NFTs still receive these traits only from their deterministic seed.</p></header>" +
    "<section class='showcase'>" +
    `<figure class='hit'><img src='09-rare-double-strike.svg?v=${version}' alt='Double Strike NARA press glitch'/>` +
    "<figcaption><strong>Double Strike / NARA Press Glitch</strong><span>Forced seed 777. Misregistered NARA wordmark layers and registration dash. Natural chance: about 1 in 10,000.</span><span class='rule'>Predicate: seed % 10000 == 777</span></figcaption></figure>" +
    `<figure class='hit'><img src='10-rare-golden-sigil.svg?v=${version}' alt='Golden Sigil gold N'/>` +
    "<figcaption><strong>Golden Sigil / Gold N</strong><span>Forced seed 7777. Larger gold relief sigil with ring field and ivory highlight. Natural chance: about 1 in 100,000.</span><span class='rule'>Predicate: seed % 100000 == 7777</span></figcaption></figure>" +
    "</section></main></body>";

  const html =
    "<!doctype html><meta charset=utf-8><title>NARA Position Art</title>" +
    "<style>" +
    "body{margin:0;background:#07090A;color:#D8D1BD;font-family:'IBM Plex Mono',Consolas,monospace}" +
    "header{padding:32px 24px 10px}h1{margin:0;font-size:34px;letter-spacing:3px;color:#D8D1BD}" +
    "h1 span{color:#C2772E}.lede{max-width:980px;color:#7E817A;letter-spacing:1px;line-height:1.6}" +
    "section{padding:20px 24px 8px}.section-title{margin:0 0 14px;color:#A88745;font-size:13px;letter-spacing:3px;text-transform:uppercase}" +
    ".rare-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:28px;max-width:1280px}" +
    ".rare-card,.card{margin:0;background:#111417;border:1px solid #26241F;border-radius:14px;padding:14px}" +
    ".rare-card{border-color:#5B4727;background:#12100D}.rare-card img,.card img{width:100%;display:block;border-radius:8px;aspect-ratio:1/1}" +
    ".rare-card figcaption{display:grid;gap:7px;padding-top:12px}.rare-card strong{color:#E5B25D;font-size:15px;letter-spacing:1px}.rare-card span{color:#A9A08B;font-size:12px;line-height:1.45}" +
    ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;padding:14px 24px 28px}" +
    ".card figcaption{padding-top:10px;font-size:13px;color:#C7B98D}" +
    "</style><body><header>" +
    "<h1>NARA <span>/</span> PROOF OF POSITION</h1>" +
    "<p class='lede'>Fully on-chain instruments generated by NARAPositionRendererV5.tokenSVG(). Rare showcase cards use forced seeds for visual QA; normal cards below are deterministic token renders.</p>" +
    "</header><section><h2 class='section-title'>Rare Hit Showcase</h2><div class='rare-grid'>" +
    rareHtml +
    "</div></section><section><h2 class='section-title'>Deterministic Token Renders</h2></section><div class='grid'>" +
    cardHtml +
    "</div></body>";

  const qaEntries = [...rareCards.map((c) => ({ label: c.label, file: c.file })), ...cards];
  const qaSwatches = [
    { name: "white", color: "#F5F1E8" },
    { name: "neutral", color: "#77736B" },
    { name: "dark", color: "#07090A" },
  ];
  const qaSizes = [64, 128, 300];
  const qaHtml =
    "<!doctype html><meta charset=utf-8><title>NARA Thumbnail QA</title>" +
    "<style>body{margin:0;background:#0A0B0C;color:#D8D1BD;font-family:Consolas,monospace}main{padding:24px}h1{margin:0 0 8px;font-size:24px;letter-spacing:2px}p{color:#A9A08B;line-height:1.5}.row{display:grid;gap:16px;margin:24px 0 34px}.label{color:#C7B98D;font-size:13px;letter-spacing:1px}.strip{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}.tile{display:grid;gap:8px}.bg{display:grid;place-items:center;border:1px solid #26241F;padding:12px}.cap{color:#6F6B63;font-size:11px}</style>" +
    "<body><main><h1>NARA Thumbnail QA</h1><p>Production gate: each card should preserve NARA wordmark, core, scar/plate type, and state at 64, 128, and 300px on light, neutral, and dark surfaces. This page is generated locally; it is not token metadata.</p>" +
    qaEntries
      .map(
        (entry) =>
          `<section class='row'><div class='label'>${entry.label}</div><div class='strip'>` +
          qaSwatches
            .map((swatch) =>
              qaSizes
                .map(
                  (size) =>
                    `<div class='tile'><div class='bg' style='background:${swatch.color};width:${size + 24}px;height:${size + 24}px'>` +
                    `<img src='${entry.file}?qa=${version}' style='width:${size}px;height:${size}px;display:block'/></div>` +
                    `<div class='cap'>${swatch.name} / ${size}px</div></div>`,
                )
                .join(""),
            )
            .join("") +
          "</div></section>",
      )
      .join("") +
    "</main></body>";
  writeQaArtifact("index.html", html);
  writeQaArtifact("rare-showcase.html", rareOnlyHtml);
  writeQaArtifact("thumbnail-qa.html", qaHtml);
  writeQaArtifact("metadata-qa.html", metadataQaHtml);
  const qaManifest = {
    schemaVersion: 1,
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    sourceCommit,
    sourceArtifacts,
    outputDirectory: `.nara-art-qa/${OUTPUT_RELATIVE_PATH.replaceAll("\\", "/")}`,
    localChainId: "31337",
    productionPolicyPreview: {
      royaltyReceiverClass: "treasury signer used by local preview",
      royaltyBps: 1000,
      claimFees: "zero defaults",
    },
    coverage: {
      tokenUriDecoded: true,
      contractUriDecoded: true,
      rendererFailureTokenFallbackDecoded: true,
      rendererFailureCollectionFallbackDecoded: true,
      thumbnailSizes: [64, 128, 300],
      backgrounds: ["light", "neutral", "dark"],
      allRendererModulesObserved: seenModules.size === 6,
    },
    artifacts: generatedArtifacts,
    externalApprovalStillRequired: [
      "browser visual review",
      "marketplace-compatible metadata decoder review",
      "thumbnail/background review",
    ],
  };
  writeFileSync(
    join(OUT_DIR, "qa-manifest.json"),
    `${JSON.stringify(qaManifest, null, 2)}\n`,
    { flag: "wx" },
  );

  console.log("\nDONE. Open this in a browser:");
  console.log(`${OUT_DIR}/index.html`);
  console.log(`${OUT_DIR}/rare-showcase.html`);
  console.log(`${OUT_DIR}/thumbnail-qa.html`);
  console.log(`${OUT_DIR}/metadata-qa.html`);
  console.log(`${OUT_DIR}/qa-manifest.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
