import hre from "hardhat";
import { expect } from "chai";

const WAD = 10n ** 18n;
const USDC = 10n ** 6n;

function wad(value: number | bigint): bigint {
  return BigInt(value) * WAD;
}

async function latestTimestamp(ethers: any): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return Number(block!.timestamp);
}

async function setTime(ethers: any, timestamp: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

function merkleLeaf(
  ethers: any,
  chainId: bigint,
  token: string,
  distributionDomain: string,
  index: bigint,
  account: string,
  amount: bigint
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "bytes32", "uint256", "address", "uint256"],
      [chainId, token, distributionDomain, index, account, amount]
    )
  );
}

function sortedPairRoot(ethers: any, left: string, right: string): string {
  const [a, b] = BigInt(left) < BigInt(right) ? [left, right] : [right, left];
  return ethers.keccak256(ethers.concat([a, b]));
}

async function deployPositionFixture() {
  const { ethers } = await hre.network.connect();
  const [deployer, alice, bob, treasury, beneficiary] =
    await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20PermitV5", deployer);
  const nara: any = await Token.deploy(
    "NARA V5 Test",
    "NARA5",
    18,
    await deployer.getAddress(),
    wad(1_000_000)
  );
  const payment: any = await Token.deploy(
    "USD Test",
    "USDC-T",
    6,
    await deployer.getAddress(),
    1_000_000n * USDC
  );
  await Promise.all([nara.waitForDeployment(), payment.waitForDeployment()]);

  const Engine = await ethers.getContractFactory(
    "MockPositionEngineV5",
    deployer
  );
  const engine: any = await Engine.deploy(await nara.getAddress());
  await engine.waitForDeployment();

  const Renderer = await ethers.getContractFactory(
    "NARACanonicalPositionRendererV5",
    deployer
  );
  const renderer: any = await Renderer.deploy(
    "NARA Position V5",
    "Sealed V5 position",
    "ipfs://position-image"
  );
  await renderer.waitForDeployment();

  const NFT = await ethers.getContractFactory("NARAPositionNFTV5", deployer);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await renderer.getAddress(),
    "NARA Position V5",
    "NARAP5"
  );
  await nft.waitForDeployment();

  await nara.transfer(await alice.getAddress(), wad(20_000));
  await nara.transfer(await bob.getAddress(), wad(20_000));
  await payment.transfer(await alice.getAddress(), 20_000n * USDC);

  return {
    ethers,
    deployer,
    alice,
    bob,
    treasury,
    beneficiary,
    nara,
    payment,
    engine,
    renderer,
    nft,
  };
}

async function openPosition(
  f: Awaited<ReturnType<typeof deployPositionFixture>>,
  amount = wad(1_000),
  duration = 7 * 24 * 60 * 60
) {
  await f.nara.connect(f.alice).approve(await f.nft.getAddress(), amount);
  const predicted = await f.nft.predictNextAccount();
  await f.nft
    .connect(f.alice)
    .mintPosition(await f.alice.getAddress(), amount, duration);
  return { tokenId: 1n, account: predicted, amount, duration };
}

describe("V5 allocation and position modules", function () {
  it("atomically initializes a deterministic clone and preserves exact NFT/Engine identity", async function () {
    const f = await deployPositionFixture();
    const { tokenId, account, amount } = await openPosition(f);

    expect(await f.nft.ownerOf(tokenId)).to.equal(await f.alice.getAddress());
    expect(await f.nft.accountFor(tokenId)).to.equal(account);
    expect(await f.nft.isCanonicalAccount(account)).to.equal(true);
    expect(await f.nft.totalSupply()).to.equal(1n);

    const Account = await f.ethers.getContractAt(
      "NARAPositionAccountV5",
      account
    );
    expect(await Account.initialized()).to.equal(true);
    expect(await Account.controller()).to.equal(await f.nft.getAddress());
    expect(await Account.engine()).to.equal(await f.engine.getAddress());
    expect(await Account.positionId()).to.equal(tokenId);
    await expect(
      Account.initialize(await f.engine.getAddress(), await f.nft.getAddress())
    ).to.be.revertedWithCustomError(Account, "AlreadyInitialized");

    const state = await f.engine.positionState(tokenId);
    expect(state.owner).to.equal(account);
    expect(state.principal).to.equal(amount);
    expect(state.active).to.equal(true);
    expect(
      await f.nara.allowance(account, await f.engine.getAddress())
    ).to.equal(0n);
  });

  it("moves lifecycle authority with the NFT and keeps additional principal in a fresh position", async function () {
    const f = await deployPositionFixture();
    const { tokenId } = await openPosition(f);
    await f.nft
      .connect(f.alice)
      .transferFrom(
        await f.alice.getAddress(),
        await f.bob.getAddress(),
        tokenId
      );

    await expect(
      f.nft.connect(f.alice).extendPosition(tokenId, 3600)
    ).to.be.revertedWithCustomError(f.nft, "Unauthorized");
    await f.nft.connect(f.bob).extendPosition(tokenId, 3600);

    expect(
      f.nft.interface.fragments.some(
        (fragment: any) =>
          fragment.type === "function" && fragment.name === "increasePosition"
      )
    ).to.equal(false);

    const additionalPrincipal = wad(100);
    await f.nara
      .connect(f.alice)
      .approve(await f.nft.getAddress(), additionalPrincipal);
    await f.nft
      .connect(f.alice)
      .mintPosition(
        await f.bob.getAddress(),
        additionalPrincipal,
        7 * 24 * 60 * 60
      );
    expect((await f.engine.positionState(tokenId)).principal).to.equal(
      wad(1_000)
    );
    expect((await f.engine.positionState(2)).principal).to.equal(
      additionalPrincipal
    );
    expect(await f.nft.ownerOf(2)).to.equal(await f.bob.getAddress());
    expect(await f.nft.accountFor(2)).to.not.equal(
      await f.nft.accountFor(tokenId)
    );
  });

  it("unlocks principal without destroying the reward receipt, then claims and closes it", async function () {
    const f = await deployPositionFixture();
    const { tokenId, account, amount } = await openPosition(f, wad(500), 3600);
    const reward = 25n * USDC;
    await f.payment.approve(await f.engine.getAddress(), reward);
    await f.engine.fundTokenReward(
      tokenId,
      await f.payment.getAddress(),
      reward
    );
    const forfeitedReward = wad(3);
    await f.nara.approve(await f.engine.getAddress(), forfeitedReward);
    await f.engine.fundTokenReward(
      tokenId,
      await f.nara.getAddress(),
      forfeitedReward
    );
    await f.engine.fundNativeReward(tokenId, { value: 12345n });

    const recipient = await f.treasury.getAddress();
    const Account = await f.ethers.getContractAt(
      "NARAPositionAccountV5",
      account
    );
    await expect(
      f.nft.connect(f.alice).closePosition(tokenId)
    ).to.be.revertedWithCustomError(Account, "PositionNotOpened");
    const state = await f.engine.positionState(tokenId);
    await setTime(f.ethers, Number(state.unlockAt));
    const principalBefore = await f.nara.balanceOf(recipient);
    await f.nft.connect(f.alice).unlockPosition(tokenId, recipient);
    expect(await f.nara.balanceOf(recipient)).to.equal(
      principalBefore + amount
    );
    expect(await f.nft.totalSupply()).to.equal(1n);
    expect(await f.nft.ownerOf(tokenId)).to.equal(await f.alice.getAddress());

    const nativeBefore = await f.ethers.provider.getBalance(recipient);
    await f.nft
      .connect(f.alice)
      .claimPosition(tokenId, recipient, [await f.payment.getAddress()]);
    expect(await f.payment.balanceOf(recipient)).to.equal(reward);
    expect(await f.ethers.provider.getBalance(recipient)).to.equal(
      nativeBefore + 12345n
    );
    expect(
      await f.engine.claimableToken(tokenId, await f.payment.getAddress())
    ).to.equal(0n);
    expect(
      await f.engine.claimableToken(tokenId, await f.nara.getAddress())
    ).to.equal(forfeitedReward);

    expect(await Account.principalWithdrawn()).to.equal(true);
    await f.nft.connect(f.alice).closePosition(tokenId);
    expect(await Account.closed()).to.equal(true);
    expect(
      await f.engine.claimableToken(tokenId, await f.nara.getAddress())
    ).to.equal(0n);
    expect(await f.engine.recycledToken(await f.nara.getAddress())).to.equal(
      forfeitedReward
    );
    expect(await f.nft.totalSupply()).to.equal(0n);
    await expect(f.nft.ownerOf(tokenId)).to.be.revertedWithCustomError(
      f.nft,
      "ERC721NonexistentToken"
    );
  });

  it("renders sealed metadata and rejects accidental ETH in controller and clone", async function () {
    const f = await deployPositionFixture();
    const { tokenId, account } = await openPosition(f);
    const uri = await f.nft.tokenURI(tokenId);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);

    await expect(
      f.alice.sendTransaction({ to: await f.nft.getAddress(), value: 1n })
    ).to.be.revertedWithCustomError(f.nft, "EtherNotAccepted");
    const Account = await f.ethers.getContractAt(
      "NARAPositionAccountV5",
      account
    );
    await expect(
      f.alice.sendTransaction({ to: account, value: 1n })
    ).to.be.revertedWithCustomError(Account, "EtherNotAccepted");
  });

  it("funds the operations vault once and releases exactly the immutable linear schedule", async function () {
    const f = await deployPositionFixture();
    const now = await latestTimestamp(f.ethers);
    const allocation = wad(1_000);
    const start = now + 100;
    const cliff = now + 200;
    const end = now + 1_100;
    const Vault = await f.ethers.getContractFactory(
      "NARAOpsVestingVaultV5",
      f.deployer
    );
    const vault: any = await Vault.deploy(
      await f.nara.getAddress(),
      await f.deployer.getAddress(),
      await f.beneficiary.getAddress(),
      allocation,
      start,
      cliff,
      end
    );
    await vault.waitForDeployment();

    await expect(vault.connect(f.alice).fund()).to.be.revertedWithCustomError(
      vault,
      "Unauthorized"
    );
    await f.nara.approve(await vault.getAddress(), allocation);
    await vault.fund();
    await expect(vault.fund()).to.be.revertedWithCustomError(
      vault,
      "AlreadyFunded"
    );
    expect(await vault.releasable()).to.equal(0n);

    await setTime(f.ethers, now + 600);
    await vault.connect(f.alice).release();
    expect(await f.nara.balanceOf(await f.beneficiary.getAddress())).to.equal(
      await vault.released()
    );

    await setTime(f.ethers, end);
    await vault.connect(f.bob).release();
    expect(await f.nara.balanceOf(await f.beneficiary.getAddress())).to.equal(
      allocation
    );
    expect(await vault.released()).to.equal(allocation);
    await expect(
      f.alice.sendTransaction({ to: await vault.getAddress(), value: 1n })
    ).to.be.revertedWithCustomError(vault, "EtherNotAccepted");
  });

  it("builds address-independent Genesis proofs, blocks replay, and returns only unclaimed allocation after deadline", async function () {
    const f = await deployPositionFixture();
    const chainId = (await f.ethers.provider.getNetwork()).chainId;
    const distributionDomain = f.ethers.id("NARA-V5-GENESIS-TEST");
    const aliceAmount = wad(100);
    const bobAmount = wad(200);
    const aliceAddress = await f.alice.getAddress();
    const bobAddress = await f.bob.getAddress();
    const tokenAddress = await f.nara.getAddress();
    const aliceLeaf = merkleLeaf(
      f.ethers,
      chainId,
      tokenAddress,
      distributionDomain,
      0n,
      aliceAddress,
      aliceAmount
    );
    const bobLeaf = merkleLeaf(
      f.ethers,
      chainId,
      tokenAddress,
      distributionDomain,
      1n,
      bobAddress,
      bobAmount
    );
    const root = sortedPairRoot(f.ethers, aliceLeaf, bobLeaf);
    const deadline = (await latestTimestamp(f.ethers)) + 3600;

    const Distributor = await f.ethers.getContractFactory(
      "NARAGenesisDistributorV5",
      f.deployer
    );
    const distributor: any = await Distributor.deploy(
      await f.nara.getAddress(),
      await f.deployer.getAddress(),
      await f.treasury.getAddress(),
      aliceAmount + bobAmount,
      distributionDomain,
      root,
      deadline
    );
    await distributor.waitForDeployment();
    expect(await distributor.distributionDomain()).to.equal(distributionDomain);
    expect(await distributor.leaf(0, aliceAddress, aliceAmount)).to.equal(
      aliceLeaf
    );
    await f.nara.approve(
      await distributor.getAddress(),
      aliceAmount + bobAmount
    );
    await distributor.fund();

    await distributor.claim(0, aliceAddress, aliceAmount, [bobLeaf]);
    expect(await distributor.totalClaimed()).to.equal(aliceAmount);
    expect(await distributor.isClaimed(0)).to.equal(true);
    await expect(
      distributor.claim(0, aliceAddress, aliceAmount, [bobLeaf])
    ).to.be.revertedWithCustomError(distributor, "AlreadyClaimed");
    await expect(
      distributor.claim(1, bobAddress, bobAmount, [bobLeaf])
    ).to.be.revertedWithCustomError(distributor, "InvalidProof");

    await setTime(f.ethers, deadline + 1);
    const treasuryBefore = await f.nara.balanceOf(
      await f.treasury.getAddress()
    );
    await distributor.close();
    expect(await f.nara.balanceOf(await f.treasury.getAddress())).to.equal(
      treasuryBefore + bobAmount
    );
    expect(await distributor.closed()).to.equal(true);
  });

  it("keeps the canonical NFT bond at zero capacity until one delayed, capped term set activates", async function () {
    const f = await deployPositionFixture();
    const maxCapacity = wad(60);
    const maxPayment = 1_000n * USDC;
    const Bond = await f.ethers.getContractFactory(
      "NARANFTBondDepositoryV5",
      f.deployer
    );
    const bond: any = await Bond.deploy(
      await f.nara.getAddress(),
      await f.payment.getAddress(),
      await f.nft.getAddress(),
      await f.deployer.getAddress(),
      await f.treasury.getAddress(),
      3600,
      maxCapacity,
      10n * USDC,
      maxPayment,
      wad(20),
      1n,
      2n * 10n ** 12n,
      24 * 60 * 60,
      365 * 24 * 60 * 60,
      30 * 24 * 60 * 60,
      await f.treasury.getAddress(),
      3600
    );
    await bond.waitForDeployment();

    const Inventory = await f.ethers.getContractFactory(
      "NARABondInventoryVaultV5",
      f.deployer
    );
    const inventory: any = await Inventory.deploy(
      await f.nara.getAddress(),
      await f.treasury.getAddress(),
      await bond.getAddress(),
      maxCapacity,
      await f.treasury.getAddress(),
      3600
    );
    await inventory.waitForDeployment();
    await f.nara.transfer(await f.treasury.getAddress(), maxCapacity);
    await bond.bindInventoryVault(await inventory.getAddress());

    expect(await bond.active()).to.equal(false);
    expect(await bond.remainingCapacity()).to.equal(0n);
    await expect(
      bond.connect(f.alice).buy(10n * USDC, await f.alice.getAddress(), {
        minimumPayout: 0,
        deadline: (await latestTimestamp(f.ethers)) + 3600,
        maximumUnlockAt: (1n << 64n) - 1n,
        expectedTermsHash: f.ethers.ZeroHash,
      })
    ).to.be.revertedWithCustomError(bond, "MarketNotOpen");
    await expect(
      inventory.connect(f.alice).pull(await f.alice.getAddress(), 1n)
    ).to.be.revertedWithCustomError(inventory, "Unauthorized");

    const now = await latestTimestamp(f.ethers);
    const startsAt = now + 3601;
    const terms = {
      capacity: wad(60),
      minPayment: 10n * USDC,
      maxPayment: 30n * USDC,
      payoutNumerator: 2n * 10n ** 12n,
      payoutDenominator: 1n,
      lockDurationSeconds: 7 * 24 * 60 * 60,
      startsAt,
      endsAt: startsAt + 24 * 60 * 60,
    };
    await expect(
      bond.queueTerms({ ...terms, minPayment: 1n * USDC })
    ).to.be.revertedWithCustomError(bond, "InvalidTerms");
    await expect(
      bond.queueTerms({ ...terms, payoutNumerator: 1n * 10n ** 12n })
    ).to.be.revertedWithCustomError(bond, "InvalidTerms");
    await expect(
      bond.queueTerms({ ...terms, payoutNumerator: 2n * 10n ** 12n + 1n })
    ).to.be.revertedWithCustomError(bond, "InvalidTerms");
    await expect(
      bond.queueTerms({ ...terms, payoutDenominator: 3n })
    ).to.be.revertedWithCustomError(bond, "InvalidTerms");
    await expect(
      bond.queueTerms({ ...terms, capacity: wad(50) })
    ).to.be.revertedWithCustomError(bond, "InvalidTerms");
    await expect(
      bond.queueTerms({ ...terms, maxPayment: 95n * USDC })
    ).to.be.revertedWithCustomError(bond, "InvalidTerms");
    await bond.queueTerms(terms);
    await expect(bond.queueTerms(terms)).to.be.revertedWithCustomError(
      bond,
      "TermsAlreadyQueued"
    );
    await expect(bond.activateTerms()).to.be.revertedWithCustomError(
      bond,
      "ActivationPending"
    );
    await f.nara
      .connect(f.treasury)
      .approve(await inventory.getAddress(), maxCapacity);
    await inventory.connect(f.treasury).fund();

    await setTime(f.ethers, startsAt);
    await bond.connect(f.alice).activateTerms();
    expect(await bond.remainingCapacity()).to.equal(wad(60));
    const invalidPreview = await bond.previewBuy(10n * USDC);
    await expect(
      bond.connect(f.alice).buy(15n * USDC, await f.alice.getAddress(), {
        minimumPayout: 0,
        deadline: startsAt + 1_000,
        maximumUnlockAt: invalidPreview.unlockAt + 60n,
        expectedTermsHash: await bond.termsHash(),
      })
    ).to.be.revertedWithCustomError(bond, "InvalidTerms");

    const firstPayment = 20n * USDC;
    const firstPayout = wad(40);
    await f.payment
      .connect(f.alice)
      .approve(await bond.getAddress(), 50n * USDC);
    const firstQuote = await bond.previewBuy(firstPayment);
    await bond.connect(f.alice).buy(firstPayment, await f.alice.getAddress(), {
      minimumPayout: firstPayout,
      deadline: startsAt + 1_000,
      maximumUnlockAt: firstQuote.unlockAt + 60n,
      expectedTermsHash: firstQuote.currentTermsHash,
    });
    expect(await inventory.distributed()).to.equal(firstPayout);
    expect(await f.payment.balanceOf(await f.treasury.getAddress())).to.equal(
      firstPayment
    );
    expect((await f.engine.positionState(1)).principal).to.equal(firstPayout);
    expect(await f.nft.ownerOf(1)).to.equal(await f.alice.getAddress());
    expect(await bond.remainingCapacity()).to.equal(wad(20));

    await expect(
      bond.connect(f.alice).buy(firstPayment, await f.alice.getAddress(), {
        minimumPayout: 0,
        deadline: startsAt + 1_000,
        maximumUnlockAt: firstQuote.unlockAt + 60n,
        expectedTermsHash: firstQuote.currentTermsHash,
      })
    ).to.be.revertedWithCustomError(bond, "SlippageExceeded");
    const finalQuote = await bond.previewBuy(10n * USDC);
    await bond.connect(f.alice).buy(10n * USDC, await f.alice.getAddress(), {
      minimumPayout: wad(20),
      deadline: startsAt + 1_000,
      maximumUnlockAt: finalQuote.unlockAt + 60n,
      expectedTermsHash: finalQuote.currentTermsHash,
    });
    expect(await inventory.distributed()).to.equal(wad(60));
    expect(await f.payment.balanceOf(await f.treasury.getAddress())).to.equal(
      30n * USDC
    );
    expect((await f.engine.positionState(2)).principal).to.equal(wad(20));
    expect(await bond.active()).to.equal(false);
    expect(await bond.remainingCapacity()).to.equal(0n);
    expect(await bond.lifecycle()).to.equal(3n);
    expect(await bond.finalizationReason()).to.equal(1n);
  });
});
