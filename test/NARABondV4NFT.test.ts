import hre from "hardhat";
import { expect } from "chai";
import { deployRenderer } from "./helpers/art";

const ONE = 10n ** 18n;
const ACTION_DELAY = 86_400n;
const LOCK_FEE = 10n ** 14n;

function wad(x: bigint | number): bigint {
  return BigInt(x) * ONE;
}

async function mineTime(ethers: any, seconds: bigint) {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

function defaultTerms(ethers: any, overrides: Record<string, unknown> = {}) {
  return {
    naraPerEthWad: ethers.parseUnits("100", 18),
    discountBps: 500,
    rewardSplitWad: ethers.parseUnits("0.3", 18),
    minDepositWei: ethers.parseEther("0.01"),
    maxPayoutNara: wad(10_000),
    remainingCapacityNara: 0n,
    lockDurationEpochs: 96n,
    genesisRoundId: 1,
    genesisTierId: 1,
    genesisRewardMultiplierBps: 20_000,
    genesisEternal: false,
    active: true,
    ...overrides,
  };
}

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [deployer, alice, bob, treasury] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const treasuryAddr = await treasury.getAddress();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const nara: any = await Token.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();
  const usdc: any = await Token.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
  const engine: any = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(await nara.getAddress());

  const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
  const vault: any = await Vault.deploy(deployerAddr, ACTION_DELAY, wad(50_000));
  await vault.waitForDeployment();
  await vault.setNara(await nara.getAddress());
  await nara.mint(await vault.getAddress(), wad(50_000));

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
  const accountImpl: any = await Account.deploy();
  await accountImpl.waitForDeployment();

  const renderer: any = await deployRenderer(ethers, deployer);

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const positionNft: any = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await accountImpl.getAddress(),
    await renderer.getAddress(),
    deployerAddr,
    treasuryAddr,
    0,
  );
  await positionNft.waitForDeployment();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
  const genesisDistributor: any = await Distributor.deploy(await positionNft.getAddress(), await usdc.getAddress());
  await genesisDistributor.waitForDeployment();
  await positionNft.setGenesisRewardDistributor(await genesisDistributor.getAddress());

  const Dep = await ethers.getContractFactory("NARABondDepositoryV4NFT", deployer);
  const dep: any = await Dep.deploy(
    await nara.getAddress(),
    await engine.getAddress(),
    await vault.getAddress(),
    await positionNft.getAddress(),
    deployerAddr,
    treasuryAddr,
    ACTION_DELAY,
    defaultTerms(ethers),
  );
  await dep.waitForDeployment();
  await positionNft.setGenesisMinter(await dep.getAddress(), true);

  await vault.proposeMarket(await dep.getAddress());
  await mineTime(ethers, ACTION_DELAY + 1n);
  await vault.executeMarketChange();

  await vault.proposeReleaseCap(wad(50_000));
  await mineTime(ethers, ACTION_DELAY + 1n);
  await vault.executeReleaseCapChange();

  await dep.pause();
  await dep.proposeTerms(defaultTerms(ethers));
  await mineTime(ethers, ACTION_DELAY + 1n);
  await dep.executeTerms();
  await dep.unpause();

  return { ethers, deployer, alice, bob, treasury, nara, usdc, engine, vault, positionNft, genesisDistributor, dep };
}

async function openMarket(f: Awaited<ReturnType<typeof deployFixture>>, capacity = wad(5_000)) {
  await f.dep.pause();
  await f.dep.addCapacity(capacity);
  await f.dep.unpause();
}

async function signedBondQuote(
  f: Awaited<ReturnType<typeof deployFixture>>,
  buyer: any,
  recipient: string,
  ethIn: bigint,
  minPayout?: bigint,
  maxPayout?: bigint,
  deadlineOffset: bigint = 600n,
) {
  const buyerAddr = await buyer.getAddress();
  const quote = await f.dep.quoteBond(ethIn);
  const nonce = await f.dep.quoteNonces(buyerAddr);
  const block = await f.ethers.provider.getBlock("latest");
  const deadline = BigInt(block!.timestamp) + deadlineOffset;
  const network = await f.ethers.provider.getNetwork();
  const termsActivatedAt = await f.dep.termsActivatedAt();
  const domain = {
    name: "NARABondDepositoryV4NFT",
    version: "1",
    chainId: network.chainId,
    verifyingContract: await f.dep.getAddress(),
  };
  const types = {
    BondQuote: [
      { name: "buyer", type: "address" },
      { name: "recipient", type: "address" },
      { name: "ethIn", type: "uint256" },
      { name: "minPayout", type: "uint256" },
      { name: "maxPayout", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "nonce", type: "uint256" },
      { name: "termsActivatedAt", type: "uint64" },
    ],
  };
  const value = {
    buyer: buyerAddr,
    recipient,
    ethIn,
    minPayout: minPayout ?? quote,
    maxPayout: maxPayout ?? quote,
    deadline,
    nonce,
    termsActivatedAt,
  };
  const signature = await f.deployer.signTypedData(domain, types, value);
  return { quote, minPayout: value.minPayout, maxPayout: value.maxPayout, deadline, signature };
}

describe("NARABondDepositoryV4NFT", () => {
  it("starts closed with zero capacity even when terms are active", async () => {
    const f = await deployFixture();
    const terms = await f.dep.terms();

    expect(terms.active).to.equal(true);
    expect(terms.remainingCapacityNara).to.equal(0n);
    expect(await f.dep.quoteBond(LOCK_FEE + f.ethers.parseEther("1"))).to.equal(0n);
  });

  it("mints a tradable Genesis NFT position for bond buyers", async () => {
    const f = await deployFixture();
    await openMarket(f);

    const bondEth = f.ethers.parseEther("1");
    const msgValue = LOCK_FEE + bondEth;
    const quote = await f.dep.quoteBond(msgValue);
    expect(quote).to.be.gt(0n);

    const signed = await signedBondQuote(f, f.alice, await f.alice.getAddress(), msgValue);
    const tx = await f.dep.connect(f.alice).buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: msgValue },
    );
    await expect(tx).to.emit(f.dep, "BondCreated");

    const receipt = await tx.wait();
    const bondEvent = receipt!.logs
      .map((l: any) => { try { return f.dep.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "BondCreated");

    const tokenId = bondEvent!.args.tokenId;
    const positionId = bondEvent!.args.positionId;
    const grossNara = bondEvent!.args.grossNara;

    expect(tokenId).to.equal(1n);
    expect(positionId).to.equal(1n);
    expect(await f.positionNft.ownerOf(tokenId)).to.equal(await f.alice.getAddress());

    const account = await f.positionNft.accountOf(tokenId);
    const position = await f.engine.positionOf(positionId);
    expect(position.owner).to.equal(account);
    expect(position.owner).to.not.equal(await f.alice.getAddress());
    expect(position.amount).to.equal(grossNara);

    const meta = await f.positionNft.genesisMetadataOf(tokenId);
    expect(meta.isGenesis).to.equal(true);
    expect(meta.isEternal).to.equal(false);
    expect(meta.roundId).to.equal(1n);
    expect(meta.tierId).to.equal(1n);
    expect(meta.rewardMultiplierBps).to.equal(20_000n);
    expect(meta.rewardWeight).to.equal(grossNara * 20_000n / 10_000n);
    expect(await f.positionNft.totalGenesisRewardWeight()).to.equal(meta.rewardWeight);
    expect(await f.positionNft.genesisRewardShareWad(tokenId)).to.equal(ONE);
    expect(await f.genesisDistributor.trackedGenesisRewardWeight()).to.equal(meta.rewardWeight);

    expect(await f.dep.totalBondsMinted()).to.equal(1n);
    expect(await f.dep.totalNaraSold()).to.equal(quote);
    expect(await f.dep.excessNara()).to.equal(0n);
  });

  it("accepts quotes from an authorized EIP-1271 contract signer", async () => {
    const f = await deployFixture();
    await openMarket(f);

    const contractSigner = await f.ethers.deployContract(
      "MockEIP1271Signer",
      [await f.deployer.getAddress()],
      f.deployer,
    );
    await contractSigner.waitForDeployment();

    const signerRole = await f.dep.PRICE_SIGNER_ROLE();
    await f.dep.grantRole(signerRole, await contractSigner.getAddress());
    await f.dep.revokeRole(signerRole, await f.deployer.getAddress());

    const msgValue = LOCK_FEE + f.ethers.parseEther("1");
    const signed = await signedBondQuote(
      f,
      f.alice,
      await f.alice.getAddress(),
      msgValue,
    );
    const contractSignature = f.ethers.concat([
      await contractSigner.getAddress(),
      signed.signature,
    ]);

    await expect(
      f.dep.connect(f.alice).buyBondWithQuote(
        signed.minPayout,
        signed.maxPayout,
        signed.deadline,
        contractSignature,
        { value: msgValue },
      ),
    ).to.emit(f.dep, "BondCreated");
  });

  it("buyBondFor mints the NFT to the requested recipient", async () => {
    const f = await deployFixture();
    await openMarket(f);

    const bobAddr = await f.bob.getAddress();
    const msgValue = LOCK_FEE + f.ethers.parseEther("0.5");
    const signed = await signedBondQuote(f, f.alice, bobAddr, msgValue);
    await f.dep.connect(f.alice).buyBondForWithQuote(
      bobAddr,
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: msgValue },
    );

    expect(await f.positionNft.ownerOf(1)).to.equal(bobAddr);
    expect((await f.engine.positionOf(1)).owner).to.equal(await f.positionNft.accountOf(1));
  });

  it("enforces min payout slippage", async () => {
    const f = await deployFixture();
    await openMarket(f);

    const msgValue = LOCK_FEE + f.ethers.parseEther("0.25");
    const quote = await f.dep.quoteBond(msgValue);

    const signed = await signedBondQuote(f, f.alice, await f.alice.getAddress(), msgValue, quote + 1n, quote + 1n);
    await expect(f.dep.connect(f.alice).buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: msgValue },
    ))
      .to.be.revertedWithCustomError(f.dep, "SlippageExceeded");
  });

  it("quotes zero and rejects buys after manual terms expire", async () => {
    const f = await deployFixture();
    await openMarket(f);

    const msgValue = LOCK_FEE + f.ethers.parseEther("0.25");
    expect(await f.dep.quoteBond(msgValue)).to.be.gt(0n);
    const signed = await signedBondQuote(
      f,
      f.alice,
      await f.alice.getAddress(),
      msgValue,
      undefined,
      undefined,
      2n * ACTION_DELAY + 1_000n,
    );

    await mineTime(f.ethers, 2n * ACTION_DELAY + 1n);

    expect(await f.dep.quoteBond(msgValue)).to.equal(0n);
    await expect(f.dep.connect(f.alice).buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: msgValue },
    ))
      .to.be.revertedWithCustomError(f.dep, "PriceStale");
    await expect(f.dep.connect(f.alice).buyBond(0, { value: msgValue }))
      .to.be.revertedWithCustomError(f.dep, "SignedQuoteRequired");
  });

  it("keeps active terms fresh through the minimum timelock refresh window", async () => {
    const f = await deployFixture();
    await openMarket(f);

    const msgValue = LOCK_FEE + f.ethers.parseEther("0.25");
    expect(await f.dep.quoteBond(msgValue)).to.be.gt(0n);

    await f.dep.proposeTerms(defaultTerms(f.ethers, { discountBps: 750 }));
    await mineTime(f.ethers, ACTION_DELAY + 1n);

    expect(await f.dep.quoteBond(msgValue)).to.be.gt(0n);
    await f.dep.pause();
    await f.dep.executeTerms();
    expect((await f.dep.terms()).discountBps).to.equal(750n);
  });

  it("reverts InvalidTerms instead of panicking when engine lockFeeBps is 100%", async () => {
    const f = await deployFixture();
    await openMarket(f);

    const msgValue = LOCK_FEE + f.ethers.parseEther("0.25");
    const signed = await signedBondQuote(f, f.alice, await f.alice.getAddress(), msgValue);
    await f.engine.setLockFeeBps(10_000);

    await expect(f.dep.quoteBond(msgValue))
      .to.be.revertedWithCustomError(f.dep, "InvalidTerms");
    await expect(f.dep.connect(f.alice).buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: msgValue },
    ))
      .to.be.revertedWithCustomError(f.dep, "InvalidTerms");
  });

  it("requires at least 1 day admin delay for price terms", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer, , , treasury] = await ethers.getSigners();
    const deployerAddr = await deployer.getAddress();
    const treasuryAddr = await treasury.getAddress();

    const Token = await ethers.getContractFactory("MockERC20", deployer);
    const nara: any = await Token.deploy("NARA", "NARA", 18);
    await nara.waitForDeployment();

    const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
    const engine: any = await Engine.deploy();
    await engine.waitForDeployment();
    await engine.setNara(await nara.getAddress());

    const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
    const vault: any = await Vault.deploy(deployerAddr, ACTION_DELAY, wad(50_000));
    await vault.waitForDeployment();
    await vault.setNara(await nara.getAddress());

    const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
    const accountImpl: any = await Account.deploy();
    await accountImpl.waitForDeployment();

    const renderer: any = await deployRenderer(ethers, deployer);

    const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
    const positionNft: any = await NFT.deploy(
      await engine.getAddress(),
      await nara.getAddress(),
      await accountImpl.getAddress(),
      await renderer.getAddress(),
      deployerAddr,
      treasuryAddr,
      0,
    );
    await positionNft.waitForDeployment();

    const Dep = await ethers.getContractFactory("NARABondDepositoryV4NFT", deployer);
    await expect(Dep.deploy(
      await nara.getAddress(),
      await engine.getAddress(),
      await vault.getAddress(),
      await positionNft.getAddress(),
      deployerAddr,
      treasuryAddr,
      ACTION_DELAY - 1n,
      defaultTerms(ethers),
    )).to.be.revertedWithCustomError(Dep, "PriceDelayTooShort");

    await expect(Dep.deploy(
      await nara.getAddress(),
      await engine.getAddress(),
      await vault.getAddress(),
      await positionNft.getAddress(),
      deployerAddr,
      treasuryAddr,
      ACTION_DELAY + 1n,
      defaultTerms(ethers),
    )).to.be.revertedWithCustomError(Dep, "PriceDelayTooLong");
  });

  it("rejects invalid Genesis bond term metadata", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer, , , treasury] = await ethers.getSigners();
    const deployerAddr = await deployer.getAddress();
    const treasuryAddr = await treasury.getAddress();

    const Token = await ethers.getContractFactory("MockERC20", deployer);
    const nara: any = await Token.deploy("NARA", "NARA", 18);
    await nara.waitForDeployment();

    const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
    const engine: any = await Engine.deploy();
    await engine.waitForDeployment();
    await engine.setNara(await nara.getAddress());

    const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
    const vault: any = await Vault.deploy(deployerAddr, ACTION_DELAY, wad(50_000));
    await vault.waitForDeployment();
    await vault.setNara(await nara.getAddress());

    const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
    const accountImpl: any = await Account.deploy();
    await accountImpl.waitForDeployment();

    const renderer: any = await deployRenderer(ethers, deployer);

    const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
    const positionNft: any = await NFT.deploy(
      await engine.getAddress(),
      await nara.getAddress(),
      await accountImpl.getAddress(),
      await renderer.getAddress(),
      deployerAddr,
      treasuryAddr,
      0,
    );
    await positionNft.waitForDeployment();

    const Dep = await ethers.getContractFactory("NARABondDepositoryV4NFT", deployer);
    await expect(Dep.deploy(
      await nara.getAddress(),
      await engine.getAddress(),
      await vault.getAddress(),
      await positionNft.getAddress(),
      deployerAddr,
      treasuryAddr,
      ACTION_DELAY,
      defaultTerms(ethers, { genesisRoundId: 0 }),
    )).to.be.revertedWithCustomError(Dep, "InvalidTerms");

    await expect(Dep.deploy(
      await nara.getAddress(),
      await engine.getAddress(),
      await vault.getAddress(),
      await positionNft.getAddress(),
      deployerAddr,
      treasuryAddr,
      ACTION_DELAY,
      defaultTerms(ethers, { genesisRewardMultiplierBps: 50_001 }),
    )).to.be.revertedWithCustomError(Dep, "InvalidTerms");
  });

  it("queues reward ETH if the engine reward notify path reverts", async () => {
    const f = await deployFixture();
    await openMarket(f);
    await f.engine.setRevertOnNotify(true);

    const bondEth = f.ethers.parseEther("1");
    const msgValue = LOCK_FEE + bondEth;
    const signed = await signedBondQuote(f, f.alice, await f.alice.getAddress(), msgValue);
    await f.dep.connect(f.alice).buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: msgValue },
    );

    expect(await f.dep.pendingRewardEth()).to.equal(f.ethers.parseEther("0.3"));
    expect(await f.positionNft.ownerOf(1)).to.equal(await f.alice.getAddress());
  });

  it("rescues queued reward ETH only to treasury", async () => {
    const f = await deployFixture();
    await openMarket(f);
    await f.engine.setRevertOnNotify(true);

    const bondEth = f.ethers.parseEther("1");
    const msgValue = LOCK_FEE + bondEth;
    const signed = await signedBondQuote(f, f.alice, await f.alice.getAddress(), msgValue);
    await f.dep.connect(f.alice).buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: msgValue },
    );
    await f.engine.setRevertOnNotify(false);

    const pending = await f.dep.pendingRewardEth();
    await expect(f.dep.rescueRewardEth(await f.alice.getAddress()))
      .to.be.revertedWithCustomError(f.dep, "InvalidRecipient");

    const treasuryAddr = await f.treasury.getAddress();
    const before = await f.ethers.provider.getBalance(treasuryAddr);
    await f.dep.rescueRewardEth(treasuryAddr);
    expect((await f.ethers.provider.getBalance(treasuryAddr)) - before).to.equal(pending);
    expect(await f.dep.pendingRewardEth()).to.equal(0n);
  });

  it("requires pause before adding capacity", async () => {
    const f = await deployFixture();

    await expect(f.dep.addCapacity(wad(100)))
      .to.be.revertedWithCustomError(f.dep, "PauseRequired");
  });

  it("rejects adding capacity after terms expire even when terms are inactive", async () => {
    const f = await deployFixture();
    await f.dep.proposeTerms(defaultTerms(f.ethers, { active: false }));
    await mineTime(f.ethers, ACTION_DELAY + 1n);
    await f.dep.pause();
    await f.dep.executeTerms();
    await mineTime(f.ethers, 2n * ACTION_DELAY + 1n);

    await expect(f.dep.addCapacity(wad(100)))
      .to.be.revertedWithCustomError(f.dep, "PriceStale");
  });
});
