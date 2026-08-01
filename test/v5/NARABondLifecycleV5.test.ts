import hre from "hardhat";
import { expect } from "chai";

const WAD = 10n ** 18n;
const USDC = 10n ** 6n;
const HOUR = 3_600;
const DAY = 24 * HOUR;

function wad(value: number | bigint): bigint {
  return BigInt(value) * WAD;
}

async function now(ethers: any): Promise<number> {
  return Number((await ethers.provider.getBlock("latest"))!.timestamp);
}

async function setTime(ethers: any, timestamp: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function deployPositionStack() {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;
  const [admin, alice, outsider, treasury, recovery] =
    await ethers.getSigners();
  const adminAddress = await admin.getAddress();

  const Token = await ethers.getContractFactory("MockERC20PermitV5", admin);
  const nara: any = await Token.deploy(
    "NARA V5 Test",
    "NARA5",
    18,
    adminAddress,
    wad(1_000_000)
  );
  const payment: any = await Token.deploy(
    "USD Test",
    "USDC-T",
    6,
    adminAddress,
    1_000_000n * USDC
  );
  await Promise.all([nara.waitForDeployment(), payment.waitForDeployment()]);

  const Engine = await ethers.getContractFactory("MockPositionEngineV5", admin);
  const engine: any = await Engine.deploy(await nara.getAddress());
  await engine.waitForDeployment();
  const Renderer = await ethers.getContractFactory(
    "NARACanonicalPositionRendererV5",
    admin
  );
  const renderer: any = await Renderer.deploy(
    "NARA Position V5",
    "Bond test",
    "ipfs://bond-test"
  );
  await renderer.waitForDeployment();
  const NFT = await ethers.getContractFactory("NARAPositionNFTV5", admin);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await renderer.getAddress(),
    "NARA Position V5",
    "NARAP5"
  );
  await nft.waitForDeployment();

  await payment.transfer(await alice.getAddress(), 1_000n * USDC);
  return {
    ethers,
    admin,
    alice,
    outsider,
    treasury,
    recovery,
    nara,
    payment,
    engine,
    nft,
  };
}

async function deployBondStack(
  options: {
    activationDelay?: number;
    maximumCapacity?: bigint;
    minimumLockDuration?: number;
    maximumLockDuration?: number;
    maximumTermDuration?: number;
    recoveryDelay?: number;
    bindInventory?: boolean;
  } = {}
) {
  const f = await deployPositionStack();
  const maximumCapacity = options.maximumCapacity ?? wad(60);
  const Bond = await f.ethers.getContractFactory(
    "NARANFTBondDepositoryV5",
    f.admin
  );
  const bond: any = await Bond.deploy(
    await f.nara.getAddress(),
    await f.payment.getAddress(),
    await f.nft.getAddress(),
    await f.admin.getAddress(),
    await f.treasury.getAddress(),
    options.activationDelay ?? HOUR,
    maximumCapacity,
    10n * USDC,
    30n * USDC,
    wad(20),
    1n,
    2n * 10n ** 12n,
    options.minimumLockDuration ?? HOUR,
    options.maximumLockDuration ?? 365 * DAY,
    options.maximumTermDuration ?? DAY,
    await f.recovery.getAddress(),
    options.recoveryDelay ?? HOUR
  );
  await bond.waitForDeployment();

  const Inventory = await f.ethers.getContractFactory(
    "NARABondInventoryVaultV5",
    f.admin
  );
  const inventory: any = await Inventory.deploy(
    await f.nara.getAddress(),
    await f.treasury.getAddress(),
    await bond.getAddress(),
    maximumCapacity,
    await f.recovery.getAddress(),
    options.recoveryDelay ?? HOUR
  );
  await inventory.waitForDeployment();
  await f.nara.transfer(await f.treasury.getAddress(), maximumCapacity);
  if (options.bindInventory !== false)
    await bond.bindInventoryVault(await inventory.getAddress());

  return { ...f, bond, inventory, maximumCapacity };
}

async function defaultTerms(
  f: Awaited<ReturnType<typeof deployBondStack>>,
  overrides: Record<string, any> = {}
) {
  const timestamp = await now(f.ethers);
  const startsAt = timestamp + HOUR + 1;
  return {
    capacity: f.maximumCapacity,
    minPayment: 10n * USDC,
    maxPayment: 30n * USDC,
    payoutNumerator: 2n * 10n ** 12n,
    payoutDenominator: 1n,
    lockDurationSeconds: HOUR + 1,
    startsAt,
    endsAt: startsAt + 6 * HOUR,
    ...overrides,
  };
}

async function queueFundActivate(
  f: Awaited<ReturnType<typeof deployBondStack>>
) {
  const terms = await defaultTerms(f);
  await f.bond.queueTerms(terms);
  await f.nara
    .connect(f.treasury)
    .approve(await f.inventory.getAddress(), f.maximumCapacity);
  await f.inventory.connect(f.treasury).fund();
  await setTime(f.ethers, terms.startsAt);
  await f.bond.connect(f.outsider).activateTerms();
  return terms;
}

async function protectionFor(
  f: Awaited<ReturnType<typeof deployBondStack>>,
  paymentAmount: bigint
) {
  const quote = await f.bond.previewBuy(paymentAmount);
  return {
    quote,
    protection: {
      minimumPayout: quote.payout,
      deadline: (await now(f.ethers)) + HOUR,
      maximumUnlockAt: quote.unlockAt + (await f.engine.epochLength()),
      expectedTermsHash: quote.currentTermsHash,
    },
  };
}

describe("V5 NFT bond terminal lifecycle", function () {
  it("enforces exact lifetime inventory, delayed funding order, and bounded one-shot terms", async function () {
    const f = await deployBondStack();
    await f.nara
      .connect(f.treasury)
      .approve(await f.inventory.getAddress(), f.maximumCapacity);
    await expect(
      f.inventory.connect(f.treasury).fund()
    ).to.be.revertedWithCustomError(f.inventory, "FundingNotAllowed");

    const Inventory = await f.ethers.getContractFactory(
      "NARABondInventoryVaultV5",
      f.admin
    );
    await expect(
      Inventory.deploy(
        await f.nara.getAddress(),
        await f.treasury.getAddress(),
        await f.bond.getAddress(),
        f.maximumCapacity + 1n,
        await f.recovery.getAddress(),
        HOUR
      )
    ).to.be.revertedWithCustomError(Inventory, "InvalidAllocation");
    await expect(
      Inventory.deploy(
        await f.nara.getAddress(),
        await f.treasury.getAddress(),
        await f.bond.getAddress(),
        f.maximumCapacity,
        await f.bond.getAddress(),
        HOUR
      )
    ).to.be.revertedWithCustomError(Inventory, "InvalidAddress");
    await expect(
      Inventory.deploy(
        await f.nara.getAddress(),
        await f.treasury.getAddress(),
        await f.bond.getAddress(),
        f.maximumCapacity,
        await f.recovery.getAddress(),
        HOUR - 1
      )
    ).to.be.revertedWithCustomError(Inventory, "InvalidRecoveryDelay");

    const terms = await defaultTerms(f);
    await expect(
      f.bond.queueTerms({ ...terms, capacity: f.maximumCapacity - wad(20) })
    ).to.be.revertedWithCustomError(f.bond, "InvalidTerms");
    await expect(
      f.bond.queueTerms({
        ...terms,
        startsAt: terms.startsAt + DAY + 1,
        endsAt: terms.startsAt + DAY + HOUR,
      })
    ).to.be.revertedWithCustomError(f.bond, "InvalidTerms");
    await expect(
      f.bond.queueTerms({ ...terms, endsAt: terms.startsAt + DAY + 1 })
    ).to.be.revertedWithCustomError(f.bond, "InvalidTerms");

    await f.bond.queueTerms(terms);
    await setTime(f.ethers, terms.startsAt);
    await expect(f.bond.activateTerms()).to.be.revertedWithCustomError(
      f.bond,
      "InventoryNotFunded"
    );
    await f.inventory.connect(f.treasury).fund();
    await f.bond.connect(f.outsider).activateTerms();
    expect(await f.bond.active()).to.equal(true);
  });

  it("rejects a term whose advertised maximum payment can never fit its full capacity", async function () {
    const f = await deployBondStack({ maximumCapacity: wad(40) });
    const terms = await defaultTerms(f);

    // At the immutable 2 NARA per USDC ratio, maxPayment would quote 60 NARA
    // against only 40 NARA of full, unused lifetime capacity.
    await expect(f.bond.queueTerms(terms)).to.be.revertedWithCustomError(
      f.bond,
      "InvalidTerms"
    );
  });

  it("binds only the exact Treasury-funded immutable recovery policy", async function () {
    const f = await deployBondStack({ bindInventory: false });
    const Inventory = await f.ethers.getContractFactory(
      "NARABondInventoryVaultV5",
      f.admin
    );

    const wrongFunder: any = await Inventory.deploy(
      await f.nara.getAddress(),
      await f.admin.getAddress(),
      await f.bond.getAddress(),
      f.maximumCapacity,
      await f.recovery.getAddress(),
      HOUR
    );
    await wrongFunder.waitForDeployment();
    await expect(
      f.bond.bindInventoryVault(await wrongFunder.getAddress())
    ).to.be.revertedWithCustomError(f.bond, "InvalidInventory");

    const wrongRecipient: any = await Inventory.deploy(
      await f.nara.getAddress(),
      await f.treasury.getAddress(),
      await f.bond.getAddress(),
      f.maximumCapacity,
      await f.outsider.getAddress(),
      HOUR
    );
    await wrongRecipient.waitForDeployment();
    await expect(
      f.bond.bindInventoryVault(await wrongRecipient.getAddress())
    ).to.be.revertedWithCustomError(f.bond, "InvalidInventory");

    const wrongDelay: any = await Inventory.deploy(
      await f.nara.getAddress(),
      await f.treasury.getAddress(),
      await f.bond.getAddress(),
      f.maximumCapacity,
      await f.recovery.getAddress(),
      2 * HOUR
    );
    await wrongDelay.waitForDeployment();
    await expect(
      f.bond.bindInventoryVault(await wrongDelay.getAddress())
    ).to.be.revertedWithCustomError(f.bond, "InvalidInventory");

    await f.bond.bindInventoryVault(await f.inventory.getAddress());
    expect(await f.bond.inventoryVault()).to.equal(
      await f.inventory.getAddress()
    );
    expect(await f.bond.inventoryRecoveryRecipient()).to.equal(
      await f.recovery.getAddress()
    );
    expect(await f.bond.inventoryRecoveryDelay()).to.equal(HOUR);
  });

  it("rejects Engine-incompatible locks and activation/term-delay constructor drift", async function () {
    const f = await deployPositionStack();
    const Bond = await f.ethers.getContractFactory(
      "NARANFTBondDepositoryV5",
      f.admin
    );
    const args = [
      await f.nara.getAddress(),
      await f.payment.getAddress(),
      await f.nft.getAddress(),
      await f.admin.getAddress(),
      await f.treasury.getAddress(),
      HOUR,
      wad(60),
      10n * USDC,
      30n * USDC,
      wad(20),
      1n,
      2n * 10n ** 12n,
      HOUR,
      365 * DAY,
      DAY,
      await f.recovery.getAddress(),
      HOUR,
    ] as const;
    await expect(
      Bond.deploy(...args.slice(0, 5), HOUR - 1, ...args.slice(6))
    ).to.be.revertedWithCustomError(Bond, "InvalidBounds");
    await expect(
      Bond.deploy(...args.slice(0, 12), HOUR - 1, ...args.slice(13))
    ).to.be.revertedWithCustomError(Bond, "InvalidBounds");
    await expect(
      Bond.deploy(...args.slice(0, 14), 30 * DAY + 1, ...args.slice(15))
    ).to.be.revertedWithCustomError(Bond, "InvalidBounds");
    await expect(
      Bond.deploy(...args.slice(0, 16), HOUR - 1)
    ).to.be.revertedWithCustomError(Bond, "InvalidBounds");

    const nonce = await f.ethers.provider.getTransactionCount(
      await f.admin.getAddress()
    );
    const selfAddress = f.ethers.getCreateAddress({
      from: await f.admin.getAddress(),
      nonce,
    });
    const selfRecipientArgs: any[] = [...args];
    selfRecipientArgs[15] = selfAddress;
    await expect(
      Bond.deploy(...selfRecipientArgs)
    ).to.be.revertedWithCustomError(Bond, "InvalidAddress");
  });

  it("binds quote protections, fails atomically, and supports the complete user position exit", async function () {
    const f = await deployBondStack();
    await queueFundActivate(f);
    const paymentAmount = 10n * USDC;
    const { quote, protection } = await protectionFor(f, paymentAmount);
    expect(quote.payout).to.equal(wad(20));
    expect(quote.remainingCapacityAfter).to.equal(wad(40));
    expect(quote.currentTermsHash).to.equal(await f.bond.termsHash());

    await f.payment
      .connect(f.alice)
      .approve(await f.bond.getAddress(), 50n * USDC);
    const treasuryBefore = await f.payment.balanceOf(
      await f.treasury.getAddress()
    );
    const inventoryBefore = await f.nara.balanceOf(
      await f.inventory.getAddress()
    );
    const payoutBefore = await f.bond.totalPayout();
    const supplyBefore = await f.nft.totalSupply();

    await expect(
      f.bond.connect(f.alice).buy(paymentAmount, await f.alice.getAddress(), {
        ...protection,
        expectedTermsHash: f.ethers.ZeroHash,
      })
    ).to.be.revertedWithCustomError(f.bond, "TermsHashMismatch");
    await expect(
      f.bond.connect(f.alice).buy(paymentAmount, await f.alice.getAddress(), {
        ...protection,
        deadline: (await now(f.ethers)) - 1,
      })
    ).to.be.revertedWithCustomError(f.bond, "DeadlineExpired");
    await expect(
      f.bond.connect(f.alice).buy(paymentAmount, await f.alice.getAddress(), {
        ...protection,
        maximumUnlockAt: quote.unlockAt - 1n,
      })
    ).to.be.revertedWithCustomError(f.bond, "UnlockTimeExceeded");
    await expect(
      f.bond.connect(f.alice).buy(paymentAmount, await f.alice.getAddress(), {
        ...protection,
        minimumPayout: quote.payout + 1n,
      })
    ).to.be.revertedWithCustomError(f.bond, "SlippageExceeded");

    expect(await f.payment.balanceOf(await f.treasury.getAddress())).to.equal(
      treasuryBefore
    );
    expect(await f.nara.balanceOf(await f.inventory.getAddress())).to.equal(
      inventoryBefore
    );
    expect(await f.bond.totalPayout()).to.equal(payoutBefore);
    expect(await f.inventory.distributed()).to.equal(0n);
    expect(await f.nft.totalSupply()).to.equal(supplyBefore);

    await f.bond
      .connect(f.alice)
      .buy(paymentAmount, await f.alice.getAddress(), protection);
    expect(await f.payment.balanceOf(await f.treasury.getAddress())).to.equal(
      treasuryBefore + paymentAmount
    );
    expect(await f.nara.balanceOf(await f.inventory.getAddress())).to.equal(
      inventoryBefore - quote.payout
    );
    expect(await f.bond.totalPayout()).to.equal(quote.payout);
    expect(await f.inventory.distributed()).to.equal(quote.payout);
    expect(await f.nft.ownerOf(1n)).to.equal(await f.alice.getAddress());

    const [account, state] = await f.nft.positionData(1n);
    expect(state.owner).to.equal(account);
    expect(state.principal).to.equal(quote.payout);
    expect(state.unlockAt).to.be.at.most(protection.maximumUnlockAt);
    const executionBlock = await f.ethers.provider.getBlock("latest");
    const origin = await f.engine.epochOrigin();
    const epochLength = await f.engine.epochLength();
    const candidate = BigInt(executionBlock!.timestamp + HOUR + 1) - origin;
    const expectedUnlock =
      origin + ((candidate + epochLength - 1n) / epochLength) * epochLength;
    expect(state.unlockAt).to.equal(expectedUnlock);

    const reward = 3n * USDC;
    await f.payment.approve(await f.engine.getAddress(), reward);
    await f.engine.fundTokenReward(1n, await f.payment.getAddress(), reward);
    await setTime(f.ethers, Number(state.unlockAt));
    const naraBefore = await f.nara.balanceOf(await f.alice.getAddress());
    await f.nft.connect(f.alice).unlockPosition(1n, await f.alice.getAddress());
    expect(await f.nara.balanceOf(await f.alice.getAddress())).to.equal(
      naraBefore + quote.payout
    );
    const rewardBefore = await f.payment.balanceOf(await f.alice.getAddress());
    await f.nft
      .connect(f.alice)
      .claimPosition(1n, await f.alice.getAddress(), [
        await f.payment.getAddress(),
      ]);
    expect(await f.payment.balanceOf(await f.alice.getAddress())).to.equal(
      rewardBefore + reward
    );
    await f.nft.connect(f.alice).closePosition(1n);
    expect(await f.nft.totalSupply()).to.equal(0n);
  });

  it("rejects a taxed payment atomically without consuming inventory or minting a position", async function () {
    const f = await deployPositionStack();
    const FeeToken = await f.ethers.getContractFactory(
      "MockFeeOnTransferERC20",
      f.admin
    );
    const feeToken: any = await FeeToken.deploy();
    await feeToken.waitForDeployment();

    const maximumCapacity = wad(60);
    const Bond = await f.ethers.getContractFactory(
      "NARANFTBondDepositoryV5",
      f.admin
    );
    const bond: any = await Bond.deploy(
      await f.nara.getAddress(),
      await feeToken.getAddress(),
      await f.nft.getAddress(),
      await f.admin.getAddress(),
      await f.treasury.getAddress(),
      HOUR,
      maximumCapacity,
      wad(10),
      wad(30),
      wad(20),
      1n,
      2n,
      HOUR,
      365 * DAY,
      DAY,
      await f.recovery.getAddress(),
      HOUR
    );
    await bond.waitForDeployment();
    const Inventory = await f.ethers.getContractFactory(
      "NARABondInventoryVaultV5",
      f.admin
    );
    const inventory: any = await Inventory.deploy(
      await f.nara.getAddress(),
      await f.treasury.getAddress(),
      await bond.getAddress(),
      maximumCapacity,
      await f.recovery.getAddress(),
      HOUR
    );
    await inventory.waitForDeployment();
    await f.nara.transfer(await f.treasury.getAddress(), maximumCapacity);
    await bond.bindInventoryVault(await inventory.getAddress());

    const timestamp = await now(f.ethers);
    const startsAt = timestamp + HOUR + 1;
    await bond.queueTerms({
      capacity: maximumCapacity,
      minPayment: wad(10),
      maxPayment: wad(30),
      payoutNumerator: 2n,
      payoutDenominator: 1n,
      lockDurationSeconds: HOUR + 1,
      startsAt,
      endsAt: startsAt + HOUR,
    });
    await f.nara
      .connect(f.treasury)
      .approve(await inventory.getAddress(), maximumCapacity);
    await inventory.connect(f.treasury).fund();
    await setTime(f.ethers, startsAt);
    await bond.activateTerms();

    const paymentAmount = wad(10);
    await feeToken.mint(await f.alice.getAddress(), paymentAmount);
    await feeToken
      .connect(f.alice)
      .approve(await bond.getAddress(), paymentAmount);
    const quote = await bond.previewBuy(paymentAmount);
    const protection = {
      minimumPayout: quote.payout,
      deadline: (await now(f.ethers)) + HOUR,
      maximumUnlockAt: quote.unlockAt + (await f.engine.epochLength()),
      expectedTermsHash: quote.currentTermsHash,
    };
    const treasuryBefore = await feeToken.balanceOf(
      await f.treasury.getAddress()
    );
    const inventoryBefore = await f.nara.balanceOf(
      await inventory.getAddress()
    );
    await expect(
      bond
        .connect(f.alice)
        .buy(paymentAmount, await f.alice.getAddress(), protection)
    ).to.be.revertedWithCustomError(bond, "UnsupportedTokenBehavior");
    expect(await feeToken.balanceOf(await f.treasury.getAddress())).to.equal(
      treasuryBefore
    );
    expect(await f.nara.balanceOf(await inventory.getAddress())).to.equal(
      inventoryBefore
    );
    expect(await bond.totalPayout()).to.equal(0n);
    expect(await inventory.distributed()).to.equal(0n);
    expect(await f.nft.totalSupply()).to.equal(0n);
  });

  it("finalizes a full sale as sold out and never reopens", async function () {
    const f = await deployBondStack();
    await queueFundActivate(f);
    const paymentAmount = 30n * USDC;
    const { protection } = await protectionFor(f, paymentAmount);
    await f.payment
      .connect(f.alice)
      .approve(await f.bond.getAddress(), paymentAmount);
    await f.bond
      .connect(f.alice)
      .buy(paymentAmount, await f.alice.getAddress(), protection);

    expect(await f.bond.lifecycle()).to.equal(3n);
    expect(await f.bond.finalizationReason()).to.equal(1n);
    expect(await f.bond.permanentlyClosed()).to.equal(true);
    expect(await f.bond.totalPayout()).to.equal(f.maximumCapacity);
    expect(await f.nara.balanceOf(await f.inventory.getAddress())).to.equal(0n);
    await expect(
      f.bond.queueTerms(await defaultTerms(f))
    ).to.be.revertedWithCustomError(f.bond, "PermanentlyClosed");
    await expect(f.bond.activateTerms()).to.be.revertedWithCustomError(
      f.bond,
      "PermanentlyClosed"
    );
  });

  it("permissionlessly finalizes partial expiry and repeatably recovers every current token after delay", async function () {
    const f = await deployBondStack();
    const terms = await queueFundActivate(f);
    const paymentAmount = 10n * USDC;
    const { quote, protection } = await protectionFor(f, paymentAmount);
    await f.payment
      .connect(f.alice)
      .approve(await f.bond.getAddress(), paymentAmount);
    await f.bond
      .connect(f.alice)
      .buy(paymentAmount, await f.alice.getAddress(), protection);

    await setTime(f.ethers, terms.endsAt + 1);
    await f.bond.connect(f.outsider).finalizeExpired();
    expect(await f.bond.finalizationReason()).to.equal(3n);
    const unsold = f.maximumCapacity - quote.payout;
    expect(await f.nara.balanceOf(await f.inventory.getAddress())).to.equal(
      unsold
    );
    expect(await f.inventory.recoverableBalance()).to.equal(unsold);
    await expect(
      f.inventory.connect(f.alice).recover()
    ).to.be.revertedWithCustomError(f.inventory, "RecoveryNotReady");

    const finalizedAt = await f.bond.finalizedAt();
    expect(await f.inventory.recoveryAvailableAt()).to.equal(
      finalizedAt + BigInt(HOUR)
    );
    await setTime(f.ethers, Number(finalizedAt) + HOUR);
    const recoveryBefore = await f.nara.balanceOf(
      await f.recovery.getAddress()
    );
    await f.inventory.connect(f.outsider).recover();
    expect(await f.nara.balanceOf(await f.recovery.getAddress())).to.equal(
      recoveryBefore + unsold
    );
    expect(await f.inventory.recoveryStarted()).to.equal(true);

    await f.nara.transfer(await f.inventory.getAddress(), 7n);
    await f.inventory.connect(f.alice).recover();
    expect(await f.nara.balanceOf(await f.recovery.getAddress())).to.equal(
      recoveryBefore + unsold + 7n
    );
    expect(await f.nara.balanceOf(await f.inventory.getAddress())).to.equal(0n);

    const bondAddress = await f.bond.getAddress();
    await f.ethers.provider.send("hardhat_setBalance", [
      bondAddress,
      "0x1000000000000000000",
    ]);
    const bondSigner = await f.ethers.getImpersonatedSigner(bondAddress);
    await expect(
      f.inventory.connect(bondSigner).pull(await f.alice.getAddress(), 1n)
    ).to.be.revertedWithCustomError(f.inventory, "PullsBlocked");
  });

  it("terminally cancels queued terms or closes an active sale, then makes unused inventory recoverable", async function () {
    const cancelled = await deployBondStack();
    const cancelTerms = await defaultTerms(cancelled);
    await cancelled.bond.queueTerms(cancelTerms);
    await cancelled.nara
      .connect(cancelled.treasury)
      .approve(
        await cancelled.inventory.getAddress(),
        cancelled.maximumCapacity
      );
    await cancelled.inventory.connect(cancelled.treasury).fund();
    await cancelled.bond.cancelQueuedTerms();
    expect(await cancelled.bond.finalizationReason()).to.equal(2n);
    await expect(cancelled.bond.activateTerms()).to.be.revertedWithCustomError(
      cancelled.bond,
      "PermanentlyClosed"
    );

    const unfunded = await deployBondStack();
    await unfunded.bond.queueTerms(await defaultTerms(unfunded));
    await unfunded.bond.cancelQueuedTerms();
    await unfunded.nara
      .connect(unfunded.treasury)
      .approve(await unfunded.inventory.getAddress(), unfunded.maximumCapacity);
    await expect(
      unfunded.inventory.connect(unfunded.treasury).fund()
    ).to.be.revertedWithCustomError(unfunded.inventory, "FundingNotAllowed");

    const closed = await deployBondStack();
    await queueFundActivate(closed);
    await closed.bond.closePermanently();
    expect(await closed.bond.finalizationReason()).to.equal(4n);
    expect(await closed.bond.permanentlyClosed()).to.equal(true);
    const finalizedAt = await closed.bond.finalizedAt();
    await setTime(closed.ethers, Number(finalizedAt) + HOUR);
    const before = await closed.nara.balanceOf(
      await closed.recovery.getAddress()
    );
    await closed.inventory.connect(closed.outsider).recover();
    expect(
      await closed.nara.balanceOf(await closed.recovery.getAddress())
    ).to.equal(before + closed.maximumCapacity);
  });
});
