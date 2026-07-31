import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";
import { deployRenderer } from "./helpers/art";

const ONE = 10n ** 18n;
const MAX_SUPPLY = 1_000_000n * ONE;
const EPOCH_SECONDS = 900n;
const CONFIG_DELAY = 3600n;
const INITIAL_BASE = ONE / 2n;
const ACTION_DELAY = 86_400n;
const TOKEN_NAME = "NARA Token";
const TOKEN_SYMBOL = "NARA";

const ENGINE_CONFIG_TYPE =
  "tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64)";

function wad(x: bigint | number): bigint {
  return BigInt(x) * ONE;
}

function defaultEngineConfig(ethers: any) {
  return {
    eMax: ethers.parseUnits("1000000", 18),
    beta0Wad: ethers.parseUnits("0.008", 18),
    mWad: ethers.parseUnits("0.25", 18),
    aWad: ethers.parseUnits("1.25", 18),
    bWad: ethers.parseUnits("0.90", 18),
    cWad: ethers.parseUnits("0.50", 18),
    dWad: ethers.parseUnits("0.50", 18),
    dripSplitWad: ethers.parseUnits("0.85", 18),
    durationLinearWad: ethers.parseUnits("0.8", 18),
    durationQuadraticWad: ethers.parseUnits("0.9", 18),
    growthFactorWad: ethers.parseUnits("1.000104", 18),
    minBaseEmission: ethers.parseUnits("0.2", 18),
    maxBaseEmission: ethers.parseUnits("5", 18),
    warmupRateWad: ethers.parseUnits("0.00133", 18),
    bootstrapInitialWeight: ethers.parseUnits("10000000", 18),
    bootstrapDecayWad: ethers.parseUnits("0.9991", 18),
    activationDelayEpochs: 3n,
    maxLockEpochs: 35040n,
  };
}

function configAsTuple(cfg: ReturnType<typeof defaultEngineConfig>): any[] {
  return [
    cfg.eMax,
    cfg.beta0Wad,
    cfg.mWad,
    cfg.aWad,
    cfg.bWad,
    cfg.cWad,
    cfg.dWad,
    cfg.dripSplitWad,
    cfg.durationLinearWad,
    cfg.durationQuadraticWad,
    cfg.growthFactorWad,
    cfg.minBaseEmission,
    cfg.maxBaseEmission,
    cfg.warmupRateWad,
    cfg.bootstrapInitialWeight,
    cfg.bootstrapDecayWad,
    cfg.activationDelayEpochs,
    cfg.maxLockEpochs,
  ];
}

function defaultBondTerms(ethers: any, overrides: Record<string, unknown> = {}) {
  return {
    naraPerEthWad: ethers.parseUnits("100", 18),
    discountBps: 500,
    rewardSplitWad: ethers.parseUnits("0.3", 18),
    minDepositWei: ethers.parseEther("0.01"),
    maxPayoutNara: wad(10_000),
    remainingCapacityNara: 0n,
    lockDurationEpochs: 1344n,
    genesisRoundId: 1,
    genesisTierId: 1,
    genesisRewardMultiplierBps: 20_000,
    genesisEternal: false,
    active: true,
    ...overrides,
  };
}

async function signedBondQuote(
  ethers: any,
  dep: any,
  signer: Signer,
  buyer: Signer,
  recipient: string,
  ethIn: bigint,
  minPayout?: bigint,
  maxPayout?: bigint,
  deadlineOffset: bigint = 600n,
) {
  const buyerAddr = await buyer.getAddress();
  const quote = await dep.quoteBond(ethIn);
  const nonce = await dep.quoteNonces(buyerAddr);
  const block = await ethers.provider.getBlock("latest");
  const network = await ethers.provider.getNetwork();
  const deadline = BigInt(block!.timestamp) + deadlineOffset;
  const termsActivatedAt = await dep.termsActivatedAt();
  const domain = {
    name: "NARABondDepositoryV4NFT",
    version: "1",
    chainId: network.chainId,
    verifyingContract: await dep.getAddress(),
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
  const signature = await signer.signTypedData(domain, types, value);
  return { quote, minPayout: value.minPayout, maxPayout: value.maxPayout, deadline, signature };
}

async function buildEngineCreationCode(
  ethers: any,
  admin: string,
  cfg: ReturnType<typeof defaultEngineConfig>,
): Promise<string> {
  const artifact = await hre.artifacts.readArtifact("contracts/v4/NARAEngine.sol:NARAEngine");
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint64", "uint64", "uint256", ENGINE_CONFIG_TYPE],
    [admin, EPOCH_SECONDS, CONFIG_DELAY, INITIAL_BASE, configAsTuple(cfg)],
  );
  return artifact.bytecode + encoded.slice(2);
}

async function mineTime(ethers: any, seconds: bigint) {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

async function advanceToLive(ethers: any, engine: any) {
  for (let i = 0; i < 16; i++) {
    const live = await engine.currentEpoch();
    const state = await engine.epochState();
    if (state.epoch >= live) return;
    await engine.advanceEpochs(64);
  }
  throw new Error("engine did not advance to live epoch");
}

async function launchSystem(ethers: any, deployer: Signer, treasury: Signer) {
  const deployerAddr = await deployer.getAddress();
  const treasuryAddr = await treasury.getAddress();

  const launcher = await ethers.deployContract("NARALauncher", [deployerAddr], deployer);
  await launcher.waitForDeployment();

  const cfg = defaultEngineConfig(ethers);
  const code = await buildEngineCreationCode(ethers, deployerAddr, cfg);
  const salt = ethers.keccak256(ethers.toUtf8Bytes("NARA-INVARIANT-REGRESSION"));
  const predicted = await launcher.previewEngineAddress(code, salt);

  await launcher.connect(deployer).launch(treasuryAddr, code, salt, TOKEN_NAME, TOKEN_SYMBOL);

  const tokenAddr = await launcher.deployedToken();
  const engineAddr = await launcher.deployedEngine();
  expect(engineAddr).to.equal(predicted);

  const token = await ethers.getContractAt("contracts/v4/NARAToken.sol:NARAToken", tokenAddr);
  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", engineAddr);

  await engine.connect(deployer).setTreasury(treasuryAddr);
  await token.connect(treasury).approve(engineAddr, MAX_SUPPLY);
  await engine.connect(treasury).depositRewards(wad(100_000));

  return { launcher, token, engine, tokenAddr, engineAddr, cfg };
}

async function deployNftBondStack(ethers: any, deployer: Signer, treasury: Signer, token: any, engine: any) {
  const deployerAddr = await deployer.getAddress();
  const treasuryAddr = await treasury.getAddress();

  const vaultAlloc = wad(50_000);
  const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
  const vault = await Vault.deploy(deployerAddr, ACTION_DELAY, vaultAlloc);
  await vault.waitForDeployment();
  await vault.setNara(await token.getAddress());
  await token.connect(treasury).transfer(await vault.getAddress(), vaultAlloc);

  await engine.connect(deployer).setBondVault(await vault.getAddress());

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
  const accountImpl = await Account.deploy();
  await accountImpl.waitForDeployment();

  const renderer = await deployRenderer(ethers, deployer);

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const positionNft = await NFT.deploy(
    await engine.getAddress(),
    await token.getAddress(),
    await accountImpl.getAddress(),
    await renderer.getAddress(),
    deployerAddr,
    treasuryAddr,
    0,
  );
  await positionNft.waitForDeployment();

  const Usdc = await ethers.getContractFactory("MockERC20", deployer);
  const usdc = await Usdc.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
  const genesisDistributor = await Distributor.deploy(await positionNft.getAddress(), await usdc.getAddress());
  await genesisDistributor.waitForDeployment();
  await positionNft.setGenesisRewardDistributor(await genesisDistributor.getAddress());

  const Dep = await ethers.getContractFactory("NARABondDepositoryV4NFT", deployer);
  const dep = await Dep.deploy(
    await token.getAddress(),
    await engine.getAddress(),
    await vault.getAddress(),
    await positionNft.getAddress(),
    deployerAddr,
    treasuryAddr,
    ACTION_DELAY,
    defaultBondTerms(ethers),
  );
  await dep.waitForDeployment();
  await positionNft.setGenesisMinter(await dep.getAddress(), true);

  await vault.proposeMarket(await dep.getAddress());
  await mineTime(ethers, ACTION_DELAY + 1n);
  await advanceToLive(ethers, engine);
  await vault.executeMarketChange();

  await vault.proposeReleaseCap(vaultAlloc);
  await mineTime(ethers, ACTION_DELAY + 1n);
  await advanceToLive(ethers, engine);
  await vault.executeReleaseCapChange();

  await dep.pause();
  await dep.proposeTerms(defaultBondTerms(ethers));
  await mineTime(ethers, ACTION_DELAY + 1n);
  await advanceToLive(ethers, engine);
  await dep.executeTerms();
  await dep.addCapacity(wad(5_000));
  await dep.unpause();

  return { vault, positionNft, genesisDistributor, dep, vaultAlloc };
}

async function expectEngineAccounting(engine: any, token: any, positionIds: bigint[]) {
  const state = await engine.epochState();
  let totalLocked = 0n;
  let activeWeight = 0n;

  for (const id of positionIds) {
    const p = await engine.positionOf(id);
    const amount = BigInt(p.amount);
    const weight = BigInt(p.weight);
    if (amount === 0n) continue;

    totalLocked += amount;
    if (state.epoch >= p.activationEpoch && state.epoch < p.unlockEpoch) {
      activeWeight += weight;
    }
  }

  expect(await engine.totalLocked()).to.equal(totalLocked);
  expect(await engine.activeTotalWeight()).to.equal(activeWeight);

  const engineBal = await token.balanceOf(await engine.getAddress());
  const pendingRewards = await engine.totalPendingNaraRewards();
  expect(engineBal).to.be.gte(totalLocked + pendingRewards);
}

describe("NARA v4 invariant regression suite", () => {
  it("launcher-flow mixed operations preserve core accounting and bond inventory", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer, treasury, alice, bob, carol] = await ethers.getSigners();
    const aliceAddr = await alice.getAddress();
    const bobAddr = await bob.getAddress();
    const carolAddr = await carol.getAddress();

    const { token, engine } = await launchSystem(ethers, deployer, treasury);
    const engineAddr = await engine.getAddress();

    await token.connect(treasury).transfer(aliceAddr, wad(5_000));
    await token.connect(treasury).transfer(bobAddr, wad(5_000));
    await token.connect(alice).approve(engineAddr, wad(5_000));
    await token.connect(bob).approve(engineAddr, wad(5_000));
    const Recipient = await ethers.getContractFactory("MockERC20", deployer);
    const recipient = await Recipient.deploy("Recipient", "RCPT", 18);
    await recipient.waitForDeployment();
    const recipientAddr = await recipient.getAddress();

    const alicePosition = await engine.nextPositionId();
    await engine.connect(alice).lock(wad(1_000), 1500n, 0);

    const carolPosition = await engine.nextPositionId();
    await engine.connect(bob).lockFor(recipientAddr, wad(500), 1500n, 0);

    const knownPositions = [BigInt(alicePosition), BigInt(carolPosition)];
    await expectEngineAccounting(engine, token, knownPositions);
    expect((await engine.positionOf(alicePosition)).owner).to.equal(aliceAddr);
    expect((await engine.positionOf(carolPosition)).owner).to.equal(recipientAddr);

    await mineTime(ethers, EPOCH_SECONDS * 5n);
    await advanceToLive(ethers, engine);
    await engine.connect(deployer).notifyEthRewards({ value: ethers.parseEther("1") });

    const Reward = await ethers.getContractFactory("MockERC20", deployer);
    const reward = await Reward.deploy("Reward", "RWD", 18);
    await reward.waitForDeployment();
    await reward.mint(await deployer.getAddress(), wad(1_000));
    await reward.approve(engineAddr, wad(1_000));
    await engine.notifyTokenRewards(await reward.getAddress(), wad(25));

    await mineTime(ethers, EPOCH_SECONDS);
    await advanceToLive(ethers, engine);

    const [claimableNara, claimableEth] = await engine.claimableRewards(alicePosition);
    expect(claimableNara + claimableEth).to.be.gt(0n);
    await engine.connect(alice).claimRewards(alicePosition, aliceAddr);
    // Immutable-engine behavior: extend() remains callable after token rewards.
    // Production leaves token notification disabled because later distributions
    // would otherwise use a larger denominator than the frozen claim basis.
    await expect(
      engine.connect(alice).extend(alicePosition, 10n),
    ).to.emit(engine, "Extended");
    await expectEngineAccounting(engine, token, knownPositions);

    const { vault, positionNft, dep, vaultAlloc } = await deployNftBondStack(
      ethers,
      deployer,
      treasury,
      token,
      engine,
    );

    const bondValue = ethers.parseEther("0.5");
    const quote = await dep.quoteBond(bondValue);
    expect(quote).to.be.gt(0n);

    const signed = await signedBondQuote(ethers, dep, deployer, bob, bobAddr, bondValue);
    const buyTx = await dep.connect(bob).buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: bondValue },
    );
    const receipt = await buyTx.wait();
    const bondEvent = receipt!.logs
      .map((l: any) => {
        try { return dep.interface.parseLog(l); } catch { return null; }
      })
      .find((e: any) => e?.name === "BondCreated");

    const tokenId = BigInt(bondEvent!.args.tokenId);
    const bondPosition = BigInt(bondEvent!.args.positionId);
    const grossNara = BigInt(bondEvent!.args.grossNara);
    knownPositions.push(bondPosition);

    expect(await positionNft.ownerOf(tokenId)).to.equal(bobAddr);
    await expectEngineAccounting(engine, token, knownPositions);

    const vaultBalance = await token.balanceOf(await vault.getAddress());
    const depBalance = await token.balanceOf(await dep.getAddress());
    expect(vaultBalance + await vault.netReleased()).to.equal(vaultAlloc);
    expect(depBalance).to.equal(await vault.excludedMarketBalance());
    expect(await vault.netReleased()).to.equal(grossNara);
    expect(await vault.availableToPull()).to.be.lte(await token.balanceOf(await vault.getAddress()));
  });

  it("rejects bad reward reserve wiring instead of bricking later user flows", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer, treasury, alice] = await ethers.getSigners();
    const aliceAddr = await alice.getAddress();

    const { token, engine } = await launchSystem(ethers, deployer, treasury);
    await expect(engine.connect(deployer).setRewardReserve(aliceAddr))
      .to.be.revertedWithCustomError(engine, "InvalidConfig");

    const badReserve = await ethers.deployContract("NARARewardReserve", [await deployer.getAddress(), wad(100)], deployer);
    await badReserve.waitForDeployment();
    const wrongEngine = await ethers.deployContract("MockNARAEngineV4", [], deployer);
    await wrongEngine.waitForDeployment();
    await badReserve.connect(deployer).setNara(await token.getAddress());
    await expect(badReserve.connect(deployer).setEngine(await wrongEngine.getAddress()))
      .to.be.revertedWithCustomError(badReserve, "InvalidEngine");
    await expect(engine.connect(deployer).setRewardReserve(await badReserve.getAddress()))
      .to.be.revertedWithCustomError(engine, "InvalidConfig");

    await token.connect(treasury).transfer(aliceAddr, wad(100));
    await token.connect(alice).approve(await engine.getAddress(), wad(100));

    await mineTime(ethers, EPOCH_SECONDS * 12n);
    await advanceToLive(ethers, engine);
    await expect(engine.connect(alice).lock(wad(10), 100n, 0))
      .to.emit(engine, "Locked");
  });

  it("rejects fee-on-transfer vault pulls and returns before accounting can drift", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer] = await ethers.getSigners();
    const deployerAddr = await deployer.getAddress();

    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20", deployer);
    const feeToken = await FeeToken.deploy();
    await feeToken.waitForDeployment();

    const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
    const vault = await Vault.deploy(deployerAddr, 1, wad(1_000));
    await vault.waitForDeployment();
    await vault.setNara(await feeToken.getAddress());

    const Market = await ethers.getContractFactory("MockBondMarket", deployer);
    const market = await Market.deploy(deployerAddr);
    await market.waitForDeployment();

    await feeToken.mint(await vault.getAddress(), wad(1_000));
    await vault.proposeMarket(await market.getAddress());
    await mineTime(ethers, 2n);
    await vault.executeMarketChange();
    await vault.proposeReleaseCap(wad(1_000));
    await mineTime(ethers, 2n);
    await vault.executeReleaseCapChange();

    await expect(market.pull(await vault.getAddress(), wad(100)))
      .to.be.revertedWithCustomError(vault, "InvalidToken");
    expect(await vault.totalReleased()).to.equal(0n);

    await feeToken.mint(await market.getAddress(), wad(100));
    await expect(market.returnToVault(await vault.getAddress(), await feeToken.getAddress(), wad(100)))
      .to.be.revertedWithCustomError(vault, "InvalidToken");
    expect(await vault.totalReturned()).to.equal(0n);
  });

  it("forces stale manual bond terms closed instead of selling old prices", async () => {
    const { ethers } = await hre.network.connect();
    const [deployer, treasury] = await ethers.getSigners();

    const { token, engine } = await launchSystem(ethers, deployer, treasury);
    const { dep } = await deployNftBondStack(ethers, deployer, treasury, token, engine);

    const bondValue = ethers.parseEther("0.25");
    expect(await dep.quoteBond(bondValue)).to.be.gt(0n);
    const signed = await signedBondQuote(
      ethers,
      dep,
      deployer,
      deployer,
      await deployer.getAddress(),
      bondValue,
      undefined,
      undefined,
      2n * ACTION_DELAY + 1_000n,
    );

    await mineTime(ethers, 2n * ACTION_DELAY + 1n);
    await advanceToLive(ethers, engine);

    expect(await dep.quoteBond(bondValue)).to.equal(0n);
    await expect(dep.buyBondWithQuote(
      signed.minPayout,
      signed.maxPayout,
      signed.deadline,
      signed.signature,
      { value: bondValue },
    ))
      .to.be.revertedWithCustomError(dep, "PriceStale");
  });
});
