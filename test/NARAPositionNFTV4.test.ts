import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";
import { deployRenderer } from "./helpers/art";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;
const LOCK_FEE = 10n ** 14n;
const UNLOCK_FEE = 2n * 10n ** 14n;

function wad(x: bigint | number): bigint {
  return BigInt(x) * ONE;
}

function decodeDataUri(uri: string, prefix: string): string {
  expect(uri.startsWith(prefix)).to.equal(true);
  return Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
}

function decodeJsonDataUri(uri: string): any {
  return JSON.parse(decodeDataUri(uri, "data:application/json;base64,"));
}

function decodeSvgDataUri(uri: string): string {
  return decodeDataUri(uri, "data:image/svg+xml;base64,");
}

async function deployFixture(options: {
  setGenesisDistributor?: boolean;
  rendererContract?: string;
  rewardTokenContract?: string;
} = {}) {
  const { ethers } = await hre.network.connect();
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const nara: any = await Token.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();
  const RewardToken = await ethers.getContractFactory(options.rewardTokenContract ?? "MockERC20", deployer);
  const usdc: any = options.rewardTokenContract
    ? await RewardToken.deploy()
    : await RewardToken.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
  const engine: any = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(await nara.getAddress());
  await engine.setUnlockFeeWei(UNLOCK_FEE);

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
  const accountImpl: any = await Account.deploy();
  await accountImpl.waitForDeployment();

  let renderer: any;
  if (options.rendererContract) {
    const Renderer = await ethers.getContractFactory(options.rendererContract, deployer);
    renderer = await Renderer.deploy();
    await renderer.waitForDeployment();
  } else {
    renderer = await deployRenderer(ethers, deployer);
  }

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
  const genesisDistributor: any = await Distributor.deploy(await nft.getAddress(), await usdc.getAddress());
  await genesisDistributor.waitForDeployment();
  if (options.setGenesisDistributor ?? true) {
    await nft.setGenesisRewardDistributor(await genesisDistributor.getAddress());
  }

  await nara.mint(await alice.getAddress(), wad(10_000));
  await nara.mint(await bob.getAddress(), wad(10_000));

  return { ethers, deployer, alice, bob, treasury, nara, usdc, engine, accountImpl, renderer, nft, genesisDistributor };
}

async function mintPosition(
  fixture: Awaited<ReturnType<typeof deployFixture>>,
  owner: Signer,
  amount = wad(1_000),
  duration = 96n,
) {
  const ownerAddr = await owner.getAddress();
  const { nara, nft } = fixture;
  await nara.connect(owner).approve(await nft.getAddress(), amount);
  await nft.connect(owner).mintAndLock(amount, duration, 0, { value: LOCK_FEE });
  expect(await nft.ownerOf(1)).to.equal(ownerAddr);
  return { tokenId: 1n, positionId: 1n, amount, duration };
}

async function mintGenesisPosition(
  fixture: Awaited<ReturnType<typeof deployFixture>>,
  owner: Signer,
  amount = wad(1_000),
  duration = 96n,
  roundId = 1,
  tierId = 1,
  rewardMultiplierBps = 20_000,
  eternal = false,
) {
  const ownerAddr = await owner.getAddress();
  const { nara, nft } = fixture;
  await nft.setGenesisMinter(ownerAddr, true);
  await nara.connect(owner).approve(await nft.getAddress(), amount);
  await nft.connect(owner).mintGenesisAndLockFor(
    ownerAddr,
    amount,
    duration,
    0,
    roundId,
    tierId,
    rewardMultiplierBps,
    eternal,
    { value: LOCK_FEE },
  );
  return { tokenId: 1n, positionId: 1n, amount, duration, rewardWeight: amount * BigInt(rewardMultiplierBps) / 10_000n };
}

describe("NARAPositionNFTV4", () => {
  it("mints an NFT that controls a v4 engine position through a clone account", async () => {
    const f = await deployFixture();
    const aliceAddr = await f.alice.getAddress();
    const amount = wad(1_000);

    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), amount);
    const tx = await f.nft.connect(f.alice).mintAndLock(amount, 96, 0, { value: LOCK_FEE });

    await expect(tx).to.emit(f.nft, "PositionMinted");

    const account = await f.nft.accountOf(1);
    const position = await f.engine.positionOf(1);

    expect(await f.nft.ownerOf(1)).to.equal(aliceAddr);
    expect(await f.nft.positionIdOf(1)).to.equal(1n);
    expect(await f.nft.tokenOfPosition(1)).to.equal(1n);
    expect(await f.nft.tokenOfAccount(account)).to.equal(1n);
    expect(position.owner).to.equal(account);
    expect(position.amount).to.equal(amount);
    expect(await f.nara.balanceOf(await f.engine.getAddress())).to.equal(amount);
  });

  it("bricks the account implementation while allowing NFT-created clones to initialize", async () => {
    const f = await deployFixture();
    expect(await f.accountImpl.initialized()).to.equal(true);
    await expect(
      f.accountImpl.initialize(await f.engine.getAddress(), await f.nara.getAddress(), await f.nft.getAddress()),
    ).to.be.revertedWithCustomError(f.accountImpl, "NARAPositionAccountV4__AlreadyInitialized");

    await mintPosition(f, f.alice);
    const account = await f.nft.accountOf(1);
    const Account = await f.ethers.getContractFactory("NARAPositionAccountV4", f.deployer);
    const clone: any = Account.attach(account);

    expect(await clone.initialized()).to.equal(true);
    expect(await clone.factory()).to.equal(await f.nft.getAddress());
    expect(await clone.positionId()).to.equal(1n);
  });

  it("supports permit-based mint and lock with the real v4 token", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer, alice, treasury] = await ethers.getSigners();

    const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
    const engine: any = await Engine.deploy();
    await engine.waitForDeployment();

    const Token = await ethers.getContractFactory("contracts/v4/NARAToken.sol:NARAToken", deployer);
    const nara: any = await Token.deploy(
      await alice.getAddress(),
      await engine.getAddress(),
      "NARA",
      "NARA",
    );
    await nara.waitForDeployment();
    await engine.setNara(await nara.getAddress());

    const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
    const accountImpl: any = await Account.deploy();
    await accountImpl.waitForDeployment();

    const renderer: any = await deployRenderer(ethers, deployer);

    const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
    const nft: any = await NFT.deploy(
      await engine.getAddress(),
      await nara.getAddress(),
      await accountImpl.getAddress(),
      await renderer.getAddress(),
      await deployer.getAddress(),
      await treasury.getAddress(),
      0,
    );
    await nft.waitForDeployment();

    const amount = wad(500);
    const chain = await ethers.provider.getNetwork();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const nonce = await nara.nonces(await alice.getAddress());
    const signature = await alice.signTypedData(
      {
        name: "NARA",
        version: "1",
        chainId: chain.chainId,
        verifyingContract: await nara.getAddress(),
      },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      {
        owner: await alice.getAddress(),
        spender: await nft.getAddress(),
        value: amount,
        nonce,
        deadline,
      },
    );
    const sig = ethers.Signature.from(signature);

    await nft.connect(alice).mintAndLockWithPermit(
      amount,
      96,
      0,
      deadline,
      sig.v,
      sig.r,
      sig.s,
      { value: LOCK_FEE },
    );

    expect(await nft.ownerOf(1)).to.equal(await alice.getAddress());
    expect((await engine.positionOf(1)).owner).to.equal(await nft.accountOf(1));
  });

  it("continues permit-based mint if the permit was already submitted", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer, alice, treasury] = await ethers.getSigners();

    const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
    const engine: any = await Engine.deploy();
    await engine.waitForDeployment();

    const Token = await ethers.getContractFactory("contracts/v4/NARAToken.sol:NARAToken", deployer);
    const nara: any = await Token.deploy(
      await alice.getAddress(),
      await engine.getAddress(),
      "NARA",
      "NARA",
    );
    await nara.waitForDeployment();
    await engine.setNara(await nara.getAddress());

    const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
    const accountImpl: any = await Account.deploy();
    await accountImpl.waitForDeployment();

    const renderer: any = await deployRenderer(ethers, deployer);

    const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
    const nft: any = await NFT.deploy(
      await engine.getAddress(),
      await nara.getAddress(),
      await accountImpl.getAddress(),
      await renderer.getAddress(),
      await deployer.getAddress(),
      await treasury.getAddress(),
      0,
    );
    await nft.waitForDeployment();

    const amount = wad(500);
    const chain = await ethers.provider.getNetwork();
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const nonce = await nara.nonces(await alice.getAddress());
    const signature = await alice.signTypedData(
      {
        name: "NARA",
        version: "1",
        chainId: chain.chainId,
        verifyingContract: await nara.getAddress(),
      },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      {
        owner: await alice.getAddress(),
        spender: await nft.getAddress(),
        value: amount,
        nonce,
        deadline,
      },
    );
    const sig = ethers.Signature.from(signature);

    await nara.permit(await alice.getAddress(), await nft.getAddress(), amount, deadline, sig.v, sig.r, sig.s);
    await nft.connect(alice).mintAndLockWithPermit(
      amount,
      96,
      0,
      deadline,
      sig.v,
      sig.r,
      sig.s,
      { value: LOCK_FEE },
    );

    expect(await nft.ownerOf(1)).to.equal(await alice.getAddress());
    expect((await engine.positionOf(1)).owner).to.equal(await nft.accountOf(1));
  });

  it("makes transferred NFTs control future reward claims", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    await f.nft.connect(f.alice).transferFrom(await f.alice.getAddress(), await f.bob.getAddress(), 1);
    await f.nara.mint(await f.engine.getAddress(), wad(10));
    await f.engine.setClaimable(1, wad(10), 0);

    await expect(f.nft.connect(f.alice).claimRewards(1, await f.alice.getAddress()))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__NotTokenOwner");

    const before = await f.nara.balanceOf(await f.bob.getAddress());
    await f.nft.connect(f.bob).claimRewards(1, await f.bob.getAddress());
    expect(await f.nara.balanceOf(await f.bob.getAddress())).to.equal(before + wad(10));
  });

  it("rejects transferring a position NFT to sink addresses and clone accounts", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const account = await f.nft.accountOf(1);

    await expect(
      f.nft.connect(f.alice).transferFrom(await f.alice.getAddress(), account, 1),
    ).to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__InvalidReceiver");

    await expect(
      f.nft.connect(f.alice).transferFrom(await f.alice.getAddress(), await f.nft.getAddress(), 1),
    ).to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__InvalidReceiver");

    await f.nara.connect(f.bob).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.bob).mintAndLock(wad(1_000), 96, 0, { value: LOCK_FEE });
    const otherAccount = await f.nft.accountOf(2);
    await expect(
      f.nft.connect(f.alice).transferFrom(await f.alice.getAddress(), otherAccount, 1),
    ).to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__InvalidReceiver");
  });

  it("claims non-NARA token rewards through the NFT owner", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    const Reward = await f.ethers.getContractFactory("MockERC20", f.deployer);
    const reward: any = await Reward.deploy("Reward", "RWD", 18);
    await reward.waitForDeployment();
    await reward.mint(await f.engine.getAddress(), wad(25));
    await f.engine.setTokenClaimable(1, await reward.getAddress(), wad(25));

    await f.nft.connect(f.alice).claimTokenRewards(1, await reward.getAddress(), await f.alice.getAddress());
    expect(await reward.balanceOf(await f.alice.getAddress())).to.equal(wad(25));
  });

  it("rejects token reward receivers equal to the clone account", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    const Reward = await f.ethers.getContractFactory("MockERC20", f.deployer);
    const reward: any = await Reward.deploy("Reward", "RWD", 18);
    await reward.waitForDeployment();
    await reward.mint(await f.engine.getAddress(), wad(25));
    await f.engine.setTokenClaimable(1, await reward.getAddress(), wad(25));

    await expect(
      f.nft.connect(f.alice).claimTokenRewards(1, await reward.getAddress(), await f.nft.accountOf(1)),
    ).to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__InvalidReceiver");
  });

  it("lets the NFT owner sweep foreign tokens sent directly to the clone account", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    const Reward = await f.ethers.getContractFactory("MockERC20", f.deployer);
    const reward: any = await Reward.deploy("Reward", "RWD", 18);
    await reward.waitForDeployment();
    const account = await f.nft.accountOf(1);
    await reward.mint(account, wad(9));

    await f.nft.connect(f.alice).sweepAccountToken(1, await reward.getAddress(), await f.alice.getAddress());
    expect(await reward.balanceOf(await f.alice.getAddress())).to.equal(wad(9));
    expect(await reward.balanceOf(account)).to.equal(0n);
  });

  it("keeps closed NFT position token rewards claimable after unlock burns the NFT", async () => {
    const f = await deployFixture();
    const amount = wad(1_000);
    await mintPosition(f, f.alice, amount, 20n);

    const Reward = await f.ethers.getContractFactory("MockERC20", f.deployer);
    const reward: any = await Reward.deploy("Reward", "RWD", 18);
    await reward.waitForDeployment();
    await reward.mint(await f.engine.getAddress(), wad(33));
    await f.engine.setTokenClaimable(1, await reward.getAddress(), wad(33));

    const position = await f.engine.positionOf(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await f.nft.connect(f.alice).unlock(1, { value: UNLOCK_FEE });

    await expect(f.nft.ownerOf(1))
      .to.be.revertedWithCustomError(f.nft, "ERC721NonexistentToken")
      .withArgs(1n);

    await f.nft.connect(f.alice).claimClosedTokenRewards(1, await reward.getAddress(), await f.alice.getAddress());
    expect(await reward.balanceOf(await f.alice.getAddress())).to.equal(wad(33));
  });

  it("sweeps rewards delivered to the account during extension", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    await f.nara.mint(await f.engine.getAddress(), wad(12));
    await f.engine.setClaimable(1, wad(12), 0);

    const before = await f.nara.balanceOf(await f.alice.getAddress());
    const oldUnlock = (await f.engine.positionOf(1)).unlockEpoch;

    await f.nft.connect(f.alice).extendLock(1, 24);

    const p = await f.engine.positionOf(1);
    expect(p.unlockEpoch).to.equal(oldUnlock + 24n);
    expect(await f.nara.balanceOf(await f.alice.getAddress())).to.equal(before + wad(12));
    expect(await f.nara.balanceOf(await f.nft.accountOf(1))).to.equal(0n);
    expect(await f.nft.lifetimeNaraClaimed(1)).to.equal(wad(12));
    expect(await f.nft.lifetimeExtendCount(1)).to.equal(1n);
  });

  it("unlocks mature positions, burns the NFT, and forwards principal", async () => {
    const f = await deployFixture();
    const amount = wad(1_000);
    await mintPosition(f, f.alice, amount, 20n);
    await f.nara.mint(await f.engine.getAddress(), wad(5));
    await f.engine.setClaimable(1, wad(5), 0);

    const unlockEpoch = (await f.engine.positionOf(1)).unlockEpoch;
    await f.engine.setCurrentEpoch(unlockEpoch);

    const before = await f.nara.balanceOf(await f.alice.getAddress());
    await f.nft.connect(f.alice).unlock(1, { value: UNLOCK_FEE });

    expect(await f.nara.balanceOf(await f.alice.getAddress())).to.equal(before + amount + wad(5));
    expect(await f.nft.accountOf(1)).to.equal(f.ethers.ZeroAddress);
    await expect(f.nft.ownerOf(1))
      .to.be.revertedWithCustomError(f.nft, "ERC721NonexistentToken")
      .withArgs(1n);
  });

  it("rejects terminal unlock receivers equal to the clone account", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice, wad(1_000), 20n);
    const account = await f.nft.accountOf(1);
    const position = await f.engine.positionOf(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);

    await expect(
      f.nft.connect(f.alice).unlockTo(1, account, { value: UNLOCK_FEE }),
    ).to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__InvalidReceiver");
  });

  it("publishes ERC-4906 support, valid stable metadata, onchain artwork, and collection metadata", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    expect(await f.nft.supportsInterface("0x49064906")).to.equal(true);
    const metadata = decodeJsonDataUri(await f.nft.tokenURI(1));
    const svg = decodeSvgDataUri(metadata.image);
    const collection = decodeJsonDataUri(await f.nft.contractURI());

    expect(metadata.name).to.equal("NARA Position #000001 / New");
    expect(metadata.background_color).to.equal("070A12");
    expect(metadata.attributes.map((attribute: any) => attribute.trait_type)).to.deep.equal([
      "Position ID",
      "Realized Tier",
      "Core",
      "Module",
      "Provenance",
      "Storage",
      "Renderer",
      "Incision Register",
      "Created Epoch",
      "Claim Count",
      "Extension Count",
    ]);
    expect(metadata.attributes.find((attribute: any) => attribute.trait_type === "Renderer").value).to.equal("V5 Modular");
    expect(svg).to.contain('viewBox="0 0 1000 1000"');
    expect(svg).to.contain(">NARA</text>");
    expect(svg).to.contain("ON-CHAIN / RENDERER V5");
    expect(svg).to.contain("MANUAL");
    const tokenJson = JSON.stringify(metadata);
    for (const stale of ["Yield Tier", "One ETH Club", "STATE EARNING", "PRODUCTIVE", "RENDERER V4"]) {
      expect(tokenJson).to.not.include(stale);
      expect(svg).to.not.include(stale);
    }
    expect(tokenJson.toLowerCase()).to.not.include("expected return");
    expect(tokenJson.toLowerCase()).to.not.include("projected yield");
    expect(collection.name).to.equal("NARA Positions");
    expect(decodeSvgDataUri(collection.image)).to.contain('viewBox="0 0 1600 900"');
    expect(collection.banner_image).to.equal(collection.image);
    expect(collection.featured_image).to.equal(collection.image);
  });

  it("wires the modular V5 renderer to the expected art modules", async () => {
    const f = await deployFixture();
    const metadataAddr = await f.renderer.METADATA();
    const corePlateAddr = await f.renderer.CORE_PLATE();
    const genesisPlateAddr = await f.renderer.GENESIS_PLATE();
    const collectionArtAddr = await f.renderer.COLLECTION_ART();
    const metadata: any = await f.ethers.getContractAt("NARAArtMetadataV1", metadataAddr);
    const corePlate: any = await f.ethers.getContractAt("NARAArtCorePlateV1", corePlateAddr);
    const genesisPlate: any = await f.ethers.getContractAt("NARAArtGenesisPlateV1", genesisPlateAddr);
    const securityPrint: any = await f.ethers.getContractAt("NARAArtSecurityPrintV1", collectionArtAddr);

    expect(await f.renderer.RENDERER_VERSION()).to.equal(5n);
    expect(await metadata.METADATA_VERSION()).to.equal(1n);
    expect(await corePlate.CORE_PLATE_VERSION()).to.equal(1n);
    expect(await genesisPlate.GENESIS_PLATE_VERSION()).to.equal(1n);
    expect(await securityPrint.SECURITY_PRINT_VERSION()).to.equal(1n);
    expect(await corePlate.SECURITY_PRINT()).to.equal(collectionArtAddr);
  });

  it("keeps marketplace metadata stable while live financial data changes", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const before = await f.nft.tokenURI(1);

    await f.engine.setCurrentEpoch(500);
    await f.engine.setClaimable(1, wad(123), ONE);

    const after = await f.nft.tokenURI(1);
    const json = decodeDataUri(after, "data:application/json;base64,");
    expect(after).to.equal(before);
    for (const forbidden of ["Status", "Claimable", "Weight", "Unlock Epoch", "Genesis Reward Share"]) {
      expect(json).not.to.contain(forbidden);
    }
  });

  it("assigns deterministic equal-status instrument modules and unique art per token", async () => {
    const f = await deployFixture();
    const amount = wad(10);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), amount * 8n);

    const validModules = ["Archive Arc", "Pressure Scar", "Orbit Field", "Ledger Fragment", "Crown Trace", "Signal Trace"];
    const images: string[] = [];
    for (let tokenId = 1; tokenId <= 8; tokenId += 1) {
      await f.nft.connect(f.alice).mintAndLock(amount, 96, 0, { value: LOCK_FEE });
      const metadata = decodeJsonDataUri(await f.nft.tokenURI(tokenId));
      const attributes = Object.fromEntries(
        metadata.attributes.map((attribute: any) => [attribute.trait_type, attribute.value]),
      );
      expect(validModules).to.include(attributes.Module);
      expect(attributes.Provenance).to.equal("Manual");
      expect(attributes.Storage).to.equal("Fully On Chain");
      // module is a deterministic function of tokenId (renderer-side)
      expect(Number(await f.renderer.artworkIndex(tokenId))).to.be.within(0, 5);
      images.push(metadata.image);
    }

    // Every token renders a distinct instrument (IDs differ even when module repeats).
    expect(new Set(images).size).to.equal(8);
  });

  it("keeps token and collection metadata available when the renderer reverts or returns empty", async () => {
    const f = await deployFixture({ rendererContract: "MockPositionRendererV4" });
    await mintPosition(f, f.alice);

    expect(decodeJsonDataUri(await f.nft.tokenURI(1)).name).to.equal("Mock");
    await f.renderer.setShouldRevert(true);
    let token = decodeJsonDataUri(await f.nft.tokenURI(1));
    let collection = decodeJsonDataUri(await f.nft.contractURI());
    expect(token.description).to.contain("fallback metadata");
    expect(decodeSvgDataUri(token.image)).to.contain("RENDERER FALLBACK");
    expect(collection.name).to.equal("NARA Positions");

    await f.renderer.setShouldRevert(false);
    await f.renderer.setReturnEmpty(true);
    token = decodeJsonDataUri(await f.nft.tokenURI(1));
    collection = decodeJsonDataUri(await f.nft.contractURI());
    expect(token.name).to.equal("NARA Position #1");
    expect(collection.symbol).to.equal("NARAPOS");
  });

  it("permanently freezes the current ERC-2981 royalty configuration", async () => {
    const f = await deployFixture();
    const treasury = await f.treasury.getAddress();
    const bob = await f.bob.getAddress();

    expect(await f.nft.royaltyInfo(1, 10_000)).to.deep.equal([treasury, 500n]);
    await f.nft.setDefaultRoyalty(bob, 250);
    expect(await f.nft.royaltyInfo(1, 10_000)).to.deep.equal([bob, 250n]);
    await expect(f.nft.freezeRoyalties()).to.emit(f.nft, "RoyaltiesFrozen");
    expect(await f.nft.royaltyFrozen()).to.equal(true);

    await expect(f.nft.setDefaultRoyalty(treasury, 100))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__RoyaltiesFrozen");
    await expect(f.nft.deleteDefaultRoyalty())
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__RoyaltiesFrozen");
    await expect(f.nft.freezeRoyalties())
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__RoyaltiesFrozen");
  });

  it("only authorized Genesis minters can create Genesis position NFTs", async () => {
    const f = await deployFixture();
    const amount = wad(1_000);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), amount);

    await expect(f.nft.connect(f.alice).mintGenesisAndLockFor(
      await f.alice.getAddress(),
      amount,
      96,
      0,
      1,
      1,
      20_000,
      false,
      { value: LOCK_FEE },
    )).to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__NotGenesisMinter");

    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await expect(f.nft.connect(f.alice).mintGenesisAndLockFor(
      await f.alice.getAddress(),
      amount,
      96,
      0,
      1,
      1,
      20_000,
      false,
      { value: LOCK_FEE },
    )).to.emit(f.nft, "GenesisPositionMinted");
  });

  it("requires the Genesis distributor before Genesis minting", async () => {
    const f = await deployFixture({ setGenesisDistributor: false });
    const amount = wad(1_000);
    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), amount);

    await expect(f.nft.connect(f.alice).mintGenesisAndLockFor(
      await f.alice.getAddress(),
      amount,
      96,
      0,
      1,
      1,
      20_000,
      false,
      { value: LOCK_FEE },
    )).to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__GenesisRewardDistributorNotSet");
  });

  it("tracks Genesis metadata, reward weight, and reward share", async () => {
    const f = await deployFixture();
    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await f.nft.setGenesisMinter(await f.bob.getAddress(), true);

    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.alice).mintGenesisAndLockFor(
      await f.alice.getAddress(),
      wad(1_000),
      96,
      0,
      1,
      10,
      20_000,
      false,
      { value: LOCK_FEE },
    );

    const firstMeta = await f.nft.genesisMetadataOf(1);
    expect(firstMeta.isGenesis).to.equal(true);
    expect(firstMeta.roundId).to.equal(1n);
    expect(firstMeta.tierId).to.equal(10n);
    expect(firstMeta.rewardMultiplierBps).to.equal(20_000n);
    expect(firstMeta.rewardWeight).to.equal(wad(2_000));
    expect(await f.nft.totalGenesisRewardWeight()).to.equal(wad(2_000));
    expect(await f.nft.genesisRewardShareWad(1)).to.equal(ONE);

    await f.nara.connect(f.bob).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.bob).mintGenesisAndLockFor(
      await f.bob.getAddress(),
      wad(1_000),
      96,
      0,
      2,
      20,
      20_000,
      false,
      { value: LOCK_FEE },
    );

    expect(await f.nft.totalGenesisRewardWeight()).to.equal(wad(4_000));
    expect(await f.nft.genesisRewardShareWad(1)).to.equal(ONE / 2n);

    const metadata = decodeJsonDataUri(await f.nft.tokenURI(1));
    const attributes = Object.fromEntries(
      metadata.attributes.map((attribute: any) => [attribute.trait_type, attribute.value]),
    );
    expect(attributes.Provenance).to.equal("Genesis");
    expect(attributes["Genesis Round"]).to.equal(1);
    expect(attributes["Genesis Tier"]).to.equal(10);
    expect(attributes["Genesis Reward Multiplier Bps"]).to.equal(20_000);
    expect(attributes.Eternal).to.equal("false");
    expect(attributes["Genesis Reward Weight"]).to.equal(undefined);
  });

  it("fixes Eternal status and Genesis Reward Weight at mint time", async () => {
    const f = await deployFixture();
    await mintGenesisPosition(f, f.alice, wad(1_000), 20n, 1, 1, 20_000, false);

    const removedConversion = new f.ethers.Interface(["function convertGenesisToEternal(uint256 tokenId)"]);
    await expect(
      f.alice.sendTransaction({
        to: await f.nft.getAddress(),
        data: removedConversion.encodeFunctionData("convertGenesisToEternal", [1]),
      }),
    ).to.be.revertedWithoutReason();

    const meta = await f.nft.genesisMetadataOf(1);
    expect(meta.isEternal).to.equal(false);
    expect(meta.rewardMultiplierBps).to.equal(20_000n);
    expect(meta.rewardWeight).to.equal(wad(2_000));
    expect(await f.nft.totalGenesisRewardWeight()).to.equal(wad(2_000));
  });

  it("burns Eternal Genesis NFTs, removes reward weight, and releases matured principal", async () => {
    const f = await deployFixture();
    const principal = wad(1_000);
    await mintGenesisPosition(f, f.alice, principal, 20n, 1, 1, 20_000, true);

    await f.nft.setGenesisMinter(await f.bob.getAddress(), true);
    await f.nara.connect(f.bob).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.bob).mintGenesisAndLockFor(
      await f.bob.getAddress(),
      wad(1_000),
      20,
      0,
      1,
      1,
      20_000,
      true,
      { value: LOCK_FEE },
    );

    expect(await f.nft.totalGenesisRewardWeight()).to.equal(wad(4_000));
    await expect(f.nft.connect(f.alice).burnEternalGenesis(1, { value: UNLOCK_FEE }))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__PositionNotMatured");

    const position = await f.engine.positionOf(1);
    const engineReward = 10n * ONE;
    await f.nara.mint(await f.engine.getAddress(), engineReward);
    await f.engine.setClaimable(1, engineReward, 0);
    await f.engine.setCurrentEpoch(position.unlockEpoch);

    const aliceBefore = await f.nara.balanceOf(await f.alice.getAddress());
    const engineBefore = await f.nara.balanceOf(await f.engine.getAddress());

    await expect(f.nft.connect(f.alice).burnEternalGenesis(1, { value: UNLOCK_FEE - 1n }))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__IncorrectNativeFee")
      .withArgs(UNLOCK_FEE, UNLOCK_FEE - 1n);

    await expect(f.nft.connect(f.alice).burnEternalGenesis(1, { value: UNLOCK_FEE }))
      .to.emit(f.nft, "EternalGenesisBurned");

    await expect(f.nft.ownerOf(1))
      .to.be.revertedWithCustomError(f.nft, "ERC721NonexistentToken")
      .withArgs(1n);
    expect(await f.nft.totalGenesisRewardWeight()).to.equal(wad(2_000));
    expect(await f.nft.genesisRewardShareWad(2)).to.equal(ONE);
    expect((await f.engine.positionOf(1)).amount).to.equal(0n);
    expect(await f.nara.balanceOf(await f.alice.getAddress())).to.equal(aliceBefore + principal + engineReward);
    expect(await f.nara.balanceOf(await f.engine.getAddress())).to.equal(engineBefore - principal - engineReward);
  });

  it("records Genesis and Eternal metadata before the ERC-721 receiver callback", async () => {
    const f = await deployFixture();
    const Receiver = await f.ethers.getContractFactory("MockGenesisMetadataReceiverV4", f.deployer);
    const receiver: any = await Receiver.deploy();
    await receiver.waitForDeployment();

    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.alice).mintGenesisAndLockFor(
      await receiver.getAddress(),
      wad(1_000),
      20,
      0,
      1,
      1,
      50_000,
      true,
      { value: LOCK_FEE },
    );

    expect(await receiver.observedGenesis()).to.equal(true);
    expect(await receiver.observedEternal()).to.equal(true);
    expect(await receiver.observedMultiplierBps()).to.equal(50_000n);
  });

  it("freezes the reviewed Genesis minter allowlist", async () => {
    const f = await deployFixture();
    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await expect(f.nft.freezeGenesisMinters()).to.emit(f.nft, "GenesisMintersFrozen");
    expect(await f.nft.genesisMintersFrozen()).to.equal(true);
    await expect(f.nft.setGenesisMinter(await f.bob.getAddress(), true))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__GenesisMintersFrozen");
  });

  it("unlocks Genesis principal when reward-token delivery fails and preserves the later claim", async () => {
    const f = await deployFixture({ rewardTokenContract: "MockRevertingERC20" });
    await mintGenesisPosition(f, f.alice, wad(1_000), 20n);
    const reward = 100n * ONE;
    await f.usdc.mint(await f.deployer.getAddress(), reward);
    await f.usdc.approve(await f.genesisDistributor.getAddress(), reward);
    await f.genesisDistributor.notifyTokenRewards(reward);
    await f.usdc.setTransfersRevert(true);

    const position = await f.engine.positionOf(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await f.nft.connect(f.alice).unlockTo(1, await f.alice.getAddress(), { value: UNLOCK_FEE });

    await expect(f.nft.ownerOf(1)).to.be.revertedWithCustomError(f.nft, "ERC721NonexistentToken");
    expect(await f.genesisDistributor.closedOwnerOf(1)).to.equal(await f.alice.getAddress());
    expect(await f.genesisDistributor.claimableToken(1)).to.equal(reward);

    await f.usdc.setTransfersRevert(false);
    await f.genesisDistributor.connect(f.alice).claimToken(1, await f.bob.getAddress());
    expect(await f.usdc.balanceOf(await f.bob.getAddress())).to.equal(reward);
  });

  it("M-01: unlocks Genesis principal even if the close notification reverts", async () => {
    const f = await deployFixture({ setGenesisDistributor: false });
    const RevertingDistributor = await f.ethers.getContractFactory("MockRevertingGenesisRewardDistributorV4", f.deployer);
    const revertingDistributor: any = await RevertingDistributor.deploy(await f.nft.getAddress(), await f.usdc.getAddress());
    await revertingDistributor.waitForDeployment();
    await f.nft.setGenesisRewardDistributor(await revertingDistributor.getAddress());

    const principal = wad(1_000);
    await mintGenesisPosition(f, f.alice, principal, 20n);
    const position = await f.engine.positionOf(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);

    const aliceBefore = await f.nara.balanceOf(await f.alice.getAddress());
    const unlockTx = await f.nft.connect(f.alice).unlock(1, { value: UNLOCK_FEE });
    await expect(unlockTx).to.emit(f.nft, "GenesisCloseNotifyFailed").withArgs(1n);
    await expect(unlockTx).to.emit(f.nft, "PositionUnlocked").withArgs(1n, 1n, await f.alice.getAddress());

    await expect(f.nft.ownerOf(1))
      .to.be.revertedWithCustomError(f.nft, "ERC721NonexistentToken")
      .withArgs(1n);
    const meta = await f.nft.genesisMetadataOf(1);
    expect(meta.isGenesis).to.equal(false);
    expect(await f.nft.totalGenesisRewardWeight()).to.equal(0n);
    expect(await f.nara.balanceOf(await f.alice.getAddress())).to.equal(aliceBefore + principal);
  });

  it("burns Eternal Genesis to an alternate receiver for contract owners", async () => {
    const f = await deployFixture();
    const Owner = await f.ethers.getContractFactory("MockEthRejectingNftOwnerV4", f.deployer);
    const owner: any = await Owner.deploy();
    await owner.waitForDeployment();

    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.alice).mintGenesisAndLockFor(
      await owner.getAddress(),
      wad(1_000),
      20,
      0,
      1,
      1,
      20_000,
      true,
      { value: LOCK_FEE },
    );
    await f.genesisDistributor.notifyEthRewards({ value: ONE });
    const position = await f.engine.positionOf(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);

    const aliceNaraBefore = await f.nara.balanceOf(await f.alice.getAddress());
    const aliceEthBefore = await f.ethers.provider.getBalance(await f.alice.getAddress());
    await owner.burnTo(await f.nft.getAddress(), 1, await f.alice.getAddress(), { value: UNLOCK_FEE });
    expect(await f.nara.balanceOf(await f.alice.getAddress())).to.equal(aliceNaraBefore + wad(1_000));
    expect((await f.ethers.provider.getBalance(await f.alice.getAddress())) - aliceEthBefore).to.equal(ONE);
  });

  it("carries reward-index rounding remainder forward instead of stranding it", async () => {
    const f = await deployFixture();
    await mintGenesisPosition(f, f.alice, 3n, 20n, 1, 1, 10_000);

    expect(await f.genesisDistributor.notifyEthRewards.staticCall({ value: 1n })).to.equal(0n);
    await f.genesisDistributor.notifyEthRewards({ value: 1n });
    expect(await f.genesisDistributor.pendingUndistributedEth()).to.equal(1n);
    expect(await f.genesisDistributor.totalEthAllocated()).to.equal(0n);
  });

  it("routes Genesis ETH rewards by current Genesis Reward Weight", async () => {
    const f = await deployFixture();
    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await f.nft.setGenesisMinter(await f.bob.getAddress(), true);

    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.alice).mintGenesisAndLockFor(
      await f.alice.getAddress(),
      wad(1_000),
      96,
      0,
      1,
      1,
      50_000,
      true,
      { value: LOCK_FEE },
    );

    await f.nara.connect(f.bob).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.bob).mintGenesisAndLockFor(
      await f.bob.getAddress(),
      wad(1_000),
      96,
      0,
      1,
      1,
      20_000,
      false,
      { value: LOCK_FEE },
    );

    await f.genesisDistributor.notifyEthRewards({ value: f.ethers.parseEther("0.7") });
    expect(await f.nft.claimableGenesisEth(1)).to.equal(f.ethers.parseEther("0.5"));
    expect(await f.nft.claimableGenesisEth(2)).to.equal(f.ethers.parseEther("0.2"));

    await f.genesisDistributor.notifyEthRewards({ value: f.ethers.parseEther("0.7") });

    expect(await f.nft.claimableGenesisEth(1)).to.equal(f.ethers.parseEther("1"));
    expect(await f.nft.claimableGenesisEth(2)).to.equal(f.ethers.parseEther("0.4"));

    const bobBefore = await f.ethers.provider.getBalance(await f.bob.getAddress());
    await f.nft.connect(f.alice).claimGenesisEth(1, await f.bob.getAddress());
    expect((await f.ethers.provider.getBalance(await f.bob.getAddress())) - bobBefore).to.equal(f.ethers.parseEther("1"));
    expect(await f.nft.claimableGenesisEth(1)).to.equal(0n);
  });

  it("rejects direct ETH transfers to the Genesis reward distributor", async () => {
    const f = await deployFixture();
    await expect(
      f.alice.sendTransaction({ to: await f.genesisDistributor.getAddress(), value: f.ethers.parseEther("0.1") }),
    ).to.be.revertedWithCustomError(f.genesisDistributor, "DirectEthTransferDisabled");
  });

  it("routes Genesis USDC rewards by current Genesis Reward Weight", async () => {
    const f = await deployFixture();
    await f.nft.setGenesisMinter(await f.alice.getAddress(), true);
    await f.nft.setGenesisMinter(await f.bob.getAddress(), true);

    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.alice).mintGenesisAndLockFor(
      await f.alice.getAddress(),
      wad(1_000),
      96,
      0,
      1,
      1,
      50_000,
      true,
      { value: LOCK_FEE },
    );

    await f.nara.connect(f.bob).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.bob).mintGenesisAndLockFor(
      await f.bob.getAddress(),
      wad(1_000),
      96,
      0,
      1,
      1,
      20_000,
      false,
      { value: LOCK_FEE },
    );

    await f.usdc.mint(await f.deployer.getAddress(), 70n * USDC);
    await f.usdc.approve(await f.genesisDistributor.getAddress(), 70n * USDC);
    await f.genesisDistributor.notifyTokenRewards(70n * USDC);

    expect(await f.nft.claimableGenesisToken(1)).to.equal(50n * USDC);
    expect(await f.nft.claimableGenesisToken(2)).to.equal(20n * USDC);

    await f.usdc.mint(await f.deployer.getAddress(), 70n * USDC);
    await f.usdc.approve(await f.genesisDistributor.getAddress(), 70n * USDC);
    await f.genesisDistributor.notifyTokenRewards(70n * USDC);

    expect(await f.nft.claimableGenesisToken(1)).to.equal(100n * USDC);
    expect(await f.nft.claimableGenesisToken(2)).to.equal(40n * USDC);

    await f.nft.connect(f.alice).claimGenesisToken(1, await f.bob.getAddress());
    expect(await f.usdc.balanceOf(await f.bob.getAddress())).to.equal(100n * USDC);
    expect(await f.nft.claimableGenesisToken(1)).to.equal(0n);
  });

  it("rejects Genesis token claims to the distributor itself", async () => {
    const f = await deployFixture();
    await mintGenesisPosition(f, f.alice, wad(1_000), 20n);

    const reward = 50n * USDC;
    const distributor = await f.genesisDistributor.getAddress();
    await f.usdc.mint(await f.deployer.getAddress(), reward);
    await f.usdc.approve(distributor, reward);
    await f.genesisDistributor.notifyTokenRewards(reward);

    await expect(f.nft.connect(f.alice).claimGenesisToken(1, distributor))
      .to.be.revertedWithCustomError(f.genesisDistributor, "InvalidReceiver");
    await expect(f.genesisDistributor.connect(f.alice).claimToken(1, distributor))
      .to.be.revertedWithCustomError(f.genesisDistributor, "InvalidReceiver");

    expect(await f.genesisDistributor.claimableToken(1)).to.equal(reward);
    expect(await f.genesisDistributor.totalTokenClaimed()).to.equal(0n);

    await f.genesisDistributor.connect(f.alice).claimToken(1, await f.bob.getAddress());
    expect(await f.usdc.balanceOf(await f.bob.getAddress())).to.equal(reward);
  });

  it("claims Genesis ETH before unlock clears reward weight", async () => {
    const f = await deployFixture();
    await mintGenesisPosition(f, f.alice, wad(1_000), 20n, 1, 1, 20_000, false);
    await f.genesisDistributor.notifyEthRewards({ value: f.ethers.parseEther("1") });
    await f.usdc.mint(await f.deployer.getAddress(), 100n * USDC);
    await f.usdc.approve(await f.genesisDistributor.getAddress(), 100n * USDC);
    await f.genesisDistributor.notifyTokenRewards(100n * USDC);

    const unlockEpoch = (await f.engine.positionOf(1)).unlockEpoch;
    await f.engine.setCurrentEpoch(unlockEpoch);

    const bobBefore = await f.ethers.provider.getBalance(await f.bob.getAddress());
    await f.nft.connect(f.alice).unlockTo(1, await f.bob.getAddress(), { value: UNLOCK_FEE });

    expect((await f.ethers.provider.getBalance(await f.bob.getAddress())) - bobBefore).to.equal(f.ethers.parseEther("1"));
    expect(await f.usdc.balanceOf(await f.bob.getAddress())).to.equal(100n * USDC);
    expect(await f.genesisDistributor.trackedGenesisRewardWeight()).to.equal(0n);
    expect(await f.genesisDistributor.totalEthClaimed()).to.equal(f.ethers.parseEther("1"));
    expect(await f.genesisDistributor.totalTokenClaimed()).to.equal(100n * USDC);
  });

  it("burning Eternal Genesis claims past ETH and future ETH goes to remaining Genesis weight", async () => {
    const f = await deployFixture();
    await mintGenesisPosition(f, f.alice, wad(1_000), 20n, 1, 1, 20_000, true);

    await f.nft.setGenesisMinter(await f.bob.getAddress(), true);
    await f.nara.connect(f.bob).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.bob).mintGenesisAndLockFor(
      await f.bob.getAddress(),
      wad(1_000),
      20,
      0,
      1,
      1,
      20_000,
      true,
      { value: LOCK_FEE },
    );

    await f.genesisDistributor.notifyEthRewards({ value: f.ethers.parseEther("1") });
    const position = await f.engine.positionOf(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await f.nft.connect(f.alice).burnEternalGenesis(1, { value: UNLOCK_FEE });

    expect(await f.genesisDistributor.trackedGenesisRewardWeight()).to.equal(wad(2_000));
    expect(await f.genesisDistributor.totalEthClaimed()).to.equal(f.ethers.parseEther("0.5"));

    await f.genesisDistributor.notifyEthRewards({ value: f.ethers.parseEther("1") });
    expect(await f.nft.claimableGenesisEth(2)).to.equal(f.ethers.parseEther("1.5"));
  });
});

describe("NARAPositionNFTV4 — wrapper claim fees", () => {
  it("defaults to 0 / no recipient and enforces the cap + freeze", async () => {
    const f = await deployFixture();
    expect(await f.nft.naraClaimFeeBps()).to.equal(0n);
    expect(await f.nft.tokenClaimFeeBps()).to.equal(0n);
    expect(await f.nft.claimFeeRecipient()).to.equal(f.ethers.ZeroAddress);

    await expect(f.nft.connect(f.deployer).setClaimFees(1001, 0))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__ClaimFeeTooHigh");
    await expect(f.nft.connect(f.deployer).setClaimFees(0, 1001))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__ClaimFeeTooHigh");

    await expect(f.nft.connect(f.deployer).setClaimFeeRecipient(await f.nft.getAddress()))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__InvalidReceiver");

    await f.nft.connect(f.deployer).setClaimFees(1000, 1000);
    expect(await f.nft.naraClaimFeeBps()).to.equal(1000n);

    await expect(f.nft.connect(f.deployer).freezeClaimFees())
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__InvalidReceiver");

    await f.nft.connect(f.deployer).setClaimFeeRecipient(await f.treasury.getAddress());
    await expect(f.nft.connect(f.deployer).freezeClaimFees()).to.emit(f.nft, "ClaimFeesFrozen");
    await expect(f.nft.connect(f.deployer).setClaimFees(0, 0))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__ClaimFeesFrozen");
    await expect(f.nft.connect(f.deployer).setClaimFeeRecipient(await f.treasury.getAddress()))
      .to.be.revertedWithCustomError(f.nft, "NARAPositionNFTV4__ClaimFeesFrozen");
  });

  it("skims naraClaimFeeBps to the recipient and forwards ETH untouched", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    const recipient = await f.treasury.getAddress();
    const receiver = await f.bob.getAddress(); // distinct from caller to avoid gas noise
    await f.nft.connect(f.deployer).setClaimFees(500, 0); // 5% NARA
    await f.nft.connect(f.deployer).setClaimFeeRecipient(recipient);

    const engineAddr = await f.engine.getAddress();
    const ethAmt = f.ethers.parseEther("1");
    await f.nara.mint(engineAddr, wad(100));
    await f.deployer.sendTransaction({ to: engineAddr, value: ethAmt });
    await f.engine.setClaimable(1, wad(100), ethAmt);

    const recipNaraBefore = await f.nara.balanceOf(recipient);
    const bobNaraBefore = await f.nara.balanceOf(receiver);
    const bobEthBefore = await f.ethers.provider.getBalance(receiver);

    await f.nft.connect(f.alice).claimRewards(1, receiver);

    // 5% of 100 NARA to treasury, 95 to receiver, full 1 ETH passes through.
    expect((await f.nara.balanceOf(recipient)) - recipNaraBefore).to.equal(wad(5));
    expect((await f.nara.balanceOf(receiver)) - bobNaraBefore).to.equal(wad(95));
    expect((await f.ethers.provider.getBalance(receiver)) - bobEthBefore).to.equal(ethAmt);
  });

  it("applies naraClaimFeeBps to rewards settled during extendLock", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    const recipient = await f.treasury.getAddress();
    const owner = await f.alice.getAddress();
    await f.nft.connect(f.deployer).setClaimFees(500, 0); // 5% NARA
    await f.nft.connect(f.deployer).setClaimFeeRecipient(recipient);

    const engineAddr = await f.engine.getAddress();
    const ethAmt = f.ethers.parseEther("0.25");
    await f.nara.mint(engineAddr, wad(100));
    await f.deployer.sendTransaction({ to: engineAddr, value: ethAmt });
    await f.engine.setClaimable(1, wad(100), ethAmt);

    const recipNaraBefore = await f.nara.balanceOf(recipient);
    const ownerNaraBefore = await f.nara.balanceOf(owner);
    const ownerEthBefore = await f.ethers.provider.getBalance(owner);
    const tx = await f.nft.connect(f.alice).extendLock(1, 10);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;

    expect((await f.nara.balanceOf(recipient)) - recipNaraBefore).to.equal(wad(5));
    expect((await f.nara.balanceOf(owner)) - ownerNaraBefore).to.equal(wad(95));
    expect((await f.ethers.provider.getBalance(owner)) - ownerEthBefore + gas).to.equal(ethAmt);
    expect(await f.nft.lifetimeNaraClaimed(1)).to.equal(wad(95));
    expect(await f.nft.lifetimeEthClaimed(1)).to.equal(ethAmt);
    expect(await f.nft.lifetimeExtendCount(1)).to.equal(1n);
  });

  it("skims tokenClaimFeeBps on bribe-token claims", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);

    const recipient = await f.treasury.getAddress();
    const receiver = await f.bob.getAddress();
    await f.nft.connect(f.deployer).setClaimFees(0, 300); // 3% token
    await f.nft.connect(f.deployer).setClaimFeeRecipient(recipient);

    const Reward = await f.ethers.getContractFactory("MockERC20", f.deployer);
    const reward: any = await Reward.deploy("Reward", "RWD", 18);
    await reward.waitForDeployment();
    const rewardAddr = await reward.getAddress();
    await reward.mint(await f.engine.getAddress(), wad(50));
    await f.engine.setTokenClaimable(1, rewardAddr, wad(50));

    const recipBefore = await reward.balanceOf(recipient);
    const bobBefore = await reward.balanceOf(receiver);

    const got = await f.nft.connect(f.alice).claimTokenRewards.staticCall(1, rewardAddr, receiver);
    await f.nft.connect(f.alice).claimTokenRewards(1, rewardAddr, receiver);

    // 3% of 50 = 1.5 to treasury, 48.5 to receiver; return value is net.
    expect((await reward.balanceOf(recipient)) - recipBefore).to.equal(wad(15) / 10n); // 1.5
    expect((await reward.balanceOf(receiver)) - bobBefore).to.equal(wad(485) / 10n);   // 48.5
    expect(got).to.equal(wad(485) / 10n);
  });

  it("stays full pass-through when fees are set but recipient is unset", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    await f.nft.connect(f.deployer).setClaimFees(500, 500); // rates set, no recipient

    await f.nara.mint(await f.engine.getAddress(), wad(10));
    await f.engine.setClaimable(1, wad(10), 0);
    const before = await f.nara.balanceOf(await f.bob.getAddress());
    await f.nft.connect(f.alice).claimRewards(1, await f.bob.getAddress());
    expect((await f.nara.balanceOf(await f.bob.getAddress())) - before).to.equal(wad(10));
  });
});

describe("NARAPositionNFTV4 — lifetime stats & metadata refresh", () => {
  it("accumulates lifetime earned and emits ERC-4906 MetadataUpdate on claim", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const engineAddr = await f.engine.getAddress();
    const ethAmt = f.ethers.parseEther("0.5");
    await f.nara.mint(engineAddr, wad(100));
    await f.deployer.sendTransaction({ to: engineAddr, value: ethAmt });
    await f.engine.setClaimable(1, wad(100), ethAmt);

    await expect(f.nft.connect(f.alice).claimRewards(1, await f.bob.getAddress()))
      .to.emit(f.nft, "MetadataUpdate").withArgs(1);

    expect(await f.nft.lifetimeNaraClaimed(1)).to.equal(wad(100));
    expect(await f.nft.lifetimeEthClaimed(1)).to.equal(ethAmt);
    expect(await f.nft.lifetimeClaimCount(1)).to.equal(1n);
  });

  it("evolves the Realized Tier as delivered ETH crosses thresholds", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const engineAddr = await f.engine.getAddress();
    const tierOf = async () => {
      const md = decodeJsonDataUri(await f.nft.tokenURI(1));
      return md.attributes.find((a: any) => a.trait_type === "Realized Tier").value;
    };
    const claimEth = async (amount: bigint) => {
      await f.deployer.sendTransaction({ to: engineAddr, value: amount });
      await f.engine.setClaimable(1, 0, amount);
      await f.nft.connect(f.alice).claimRewards(1, await f.alice.getAddress());
    };

    expect(await tierOf()).to.equal("New");

    await claimEth(1n);
    expect(await tierOf()).to.equal("Activated");

    await claimEth(f.ethers.parseEther("0.1") - 1n);
    expect(await tierOf()).to.equal("Rewarded");

    await claimEth(f.ethers.parseEther("0.9"));
    expect(await tierOf()).to.equal("One ETH Mark");

    await claimEth(f.ethers.parseEther("9"));
    expect(await tierOf()).to.equal("Apex");
  });
});

describe("NARAPositionNFTV4 — evolving artwork", () => {
  const svgOf = async (f: any, id = 1) => {
    const md = decodeJsonDataUri(await f.nft.tokenURI(id));
    return decodeSvgDataUri(md.image);
  };

  it("renders a quiet New-tier security-print core with no calibration band", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const svg = await svgOf(f);
    expect(svg).to.include("STATE NEW"); // identity band, uppercased
    expect(svg).to.include("#6F6B63"); // warm ash / dormant tier color
    expect(svg).to.include('data-nara="quiet-reserve"'); // one true negative-space field
    expect(svg.indexOf('data-nara="quiet-reserve"')).to.be.lessThan(svg.indexOf('data-nara="scar"'));
    expect(svg).to.include("<ellipse"); // security-print rosette is present even at New
    expect(svg).to.not.include('stroke-dasharray="3 30"'); // calibration ring only at tier 3+
  });

  it("upgrades the core structure as realized ETH crosses thresholds", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const engineAddr = await f.engine.getAddress();
    const oneEth = f.ethers.parseEther("1");
    await f.deployer.sendTransaction({ to: engineAddr, value: oneEth });
    await f.engine.setClaimable(1, 0, oneEth);
    await f.nft.connect(f.alice).claimRewards(1, await f.alice.getAddress());

    const svg = await svgOf(f);
    expect(svg).to.include("STATE ONE ETH MARK");
    expect(svg).to.include("#A88745"); // old brass tier color
    expect(svg).to.include("<ellipse"); // orbit rings present
    expect(svg).to.include('stroke-dasharray="3 30"'); // calibration ring engaged
    expect(svg).to.include('dur="18s"'); // motion is slow breath, not spectacle
    expect(svg).to.not.match(/dur="[0-5](?:\.\d+)?s"/);
  });

  it("keeps standard cards visibly accreting after the old six-action ceiling", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const engineAddr = await f.engine.getAddress();
    let afterSixClaims = "";

    for (let i = 0; i < 7; i++) {
      await f.nara.mint(engineAddr, wad(1));
      await f.engine.setClaimable(1, wad(1), 0);
      await f.nft.connect(f.alice).claimRewards(1, await f.alice.getAddress());
      if (i === 5) afterSixClaims = await svgOf(f);
    }

    const afterSevenClaims = await svgOf(f);
    expect(afterSevenClaims).to.not.equal(afterSixClaims);
    expect(afterSevenClaims).to.include('data-nara="claim-phyllotaxis"');
    expect(afterSevenClaims).to.include('data-nara="action-ledger"');
    expect(afterSevenClaims).to.include(">CLAIMS: 7 | EXTENDS: 0</text>");

    let afterSixExtends = "";
    for (let i = 0; i < 7; i++) {
      await f.nft.connect(f.alice).extendLock(1, 1);
      if (i === 5) afterSixExtends = await svgOf(f);
    }

    const afterSevenExtends = await svgOf(f);
    expect(afterSevenExtends).to.not.equal(afterSixExtends);
    expect(afterSevenExtends).to.include('data-nara="extension-sediment"');
    expect(afterSevenExtends).to.include(">CLAIMS: 7 | EXTENDS: 7</text>");
  });

  it("flags Genesis and Eternal provenance in the artwork", async () => {
    const f = await deployFixture();
    await mintGenesisPosition(f, f.alice, wad(1_000), 96n, 1, 1, 20_000, true);
    const svg = await svgOf(f);
    expect(svg).to.include("ETERNAL");
    expect(svg).to.include("GENESIS");
    expect(svg).to.include('data-nara="archive-scar"');
  });

  it("lets Genesis and Eternal archive plates accrete holder actions", async () => {
    const f = await deployFixture();
    await mintGenesisPosition(f, f.alice, wad(1_000), 96n, 1, 1, 20_000, true);
    const engineAddr = await f.engine.getAddress();
    const initial = await svgOf(f);

    await f.nara.mint(engineAddr, wad(3));
    await f.engine.setClaimable(1, wad(3), 0);
    await f.nft.connect(f.alice).claimRewards(1, await f.alice.getAddress());

    const afterClaim = await svgOf(f);
    expect(afterClaim).to.not.equal(initial);
    expect(afterClaim).to.include('data-nara="archive-accretion"');
    expect(afterClaim).to.include('data-nara="action-ledger"');
    expect(afterClaim).to.include(">CLAIMS: 1 | EXTENDS: 0</text>");

    await f.nft.connect(f.alice).extendLock(1, 1);
    const afterExtend = await svgOf(f);
    expect(afterExtend).to.not.equal(afterClaim);
    expect(afterExtend).to.include(">CLAIMS: 1 | EXTENDS: 1</text>");
  });
});

describe("NARAPositionNFTV4 — deterministic rendering (V5 modules)", () => {
  const svgOf = async (f: any, id = 1) =>
    decodeSvgDataUri(decodeJsonDataUri(await f.nft.tokenURI(id)).image);

  it("renders identical art for the same token across calls (deterministic)", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    expect(await f.nft.tokenURI(1)).to.equal(await f.nft.tokenURI(1));
  });

  it("renders distinct art per token (identity from token+position+epoch)", async () => {
    const f = await deployFixture();
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(2_000));
    await f.nft.connect(f.alice).mintAndLock(wad(1_000), 96, 0, { value: LOCK_FEE });
    await f.nft.connect(f.alice).mintAndLock(wad(1_000), 96, 0, { value: LOCK_FEE });
    expect(await svgOf(f, 1)).to.not.equal(await svgOf(f, 2));
  });

  it("includes the Scar, microprint, and security rosette modules", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const svg = await svgOf(f);
    expect(svg).to.include("rotate("); // scar notch + rosette transforms
    expect(svg).to.include("NARA POSITION"); // microprint border
    expect(svg).to.include("<ellipse"); // security-print rosette
  });

  it("exposes the deterministic module trait from token data", async () => {
    const f = await deployFixture();
    await mintPosition(f, f.alice);
    const md = decodeJsonDataUri(await f.nft.tokenURI(1));
    const mod = md.attributes.find((a: any) => a.trait_type === "Module").value;
    expect(["Archive Arc", "Pressure Scar", "Orbit Field", "Ledger Fragment", "Crown Trace", "Signal Trace"]).to.include(mod);
  });
});
