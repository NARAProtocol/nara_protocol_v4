import test from "node:test";
import assert from "node:assert/strict";
import {
  ANCHOR_SEAT_CONSTANTS,
  WAVE_1_TIERS,
  COHORT_1_REFERENCE_SEATS,
  encodeChainlinkLatestRoundCall,
  decodeChainlinkUsdPrice,
  encodeMintedCountCall,
  encodeSellerNonceCall,
  encodeListingCall,
  decodeListingResult,
  encodeReceiptTransferNonceCall,
  encodePositionHeadCall,
  decodePositionHeadResult,
  encodeRarityTierCall,
  decodeRarityTierResult,
  encodeRewardStateCall,
  decodeRewardStateNextCheckpoint,
  encodeRewardCreditCall,
  decodeRewardCreditClaimable,
  decodeRewardCreditFull,
  encodeEngineClockCall,
  decodeEngineClockResult,
  encodePurchaseCall,
  encodeMulticall3Aggregate3,
  decodeMulticall3Aggregate3,
  computeLiveNaraPerEpochWei,
  computeLiveMonthlyNaraWei,
  computeV4QuadraticMultiplierWei,
  computeV4QuadraticWeightWei,
  classifyWave1Tier,
  buildMobileSeatWalletLinks,
  verifyAndBuildSeatBounds,
  simulateSeatPurchaseFailClosed,
} from "../src/meme/anchorSeats.js";
import { abiWordU256, abiWordAddr, abiWordBool } from "../src/meme/v4SwapEngine.js";

test("Wave 1 29-seat 6-tier hardened monotonic schedule matches #16..#44 (53.20 NARA, 75.68 ETH; bigger spend = deeper discount + exact V4Quadratic weights)", () => {
  assert.equal(WAVE_1_TIERS.length, 6);
  assert.equal(COHORT_1_REFERENCE_SEATS.length, 29);
  assert.equal(ANCHOR_SEAT_CONSTANTS.cohort1FirstTokenId, 16);
  assert.equal(ANCHOR_SEAT_CONSTANTS.cohort1LastTokenId, 44);

  let totalNara = 0;
  let totalEth = 0;
  const seenTierCounts = new Map();
  const expectedCounts = { sprint: 6, starter: 6, core: 6, plus: 5, builder: 4, prime: 2 };

  COHORT_1_REFERENCE_SEATS.forEach((s, idx) => {
    assert.equal(s.tokenId, 16 + idx);
    const n = Number(s.nara);
    const e = Number(s.askEth);
    const nextE = Number(s.nextWaveEth);
    assert.ok(n >= 1.0, `Seat #${s.tokenId} must be >= 1.00 NARA to qualify for active V5 rewards`);
    assert.ok(nextE > e, `Seat #${s.tokenId} nextWaveEth must step up`);
    seenTierCounts.set(s.tierKey, (seenTierCounts.get(s.tierKey) || 0) + 1);
    totalNara += n;
    totalEth += e;
  });

  // Strict Monotonic Investor Invariant across ALL 6 tiers:
  // 1) Total ETH spend strictly increases
  // 2) ETH per NARA strictly decreases (so % discount vs Spot strictly increases as spend rises!)
  // 3) Reward weight strictly increases and matches exact V4Quadratic Solidity formula
  let prevSpendEth = 0;
  let prevEthPerNara = Infinity;
  let prevWeight = 0;
  for (const tier of WAVE_1_TIERS) {
    assert.equal(seenTierCounts.get(tier.key), expectedCounts[tier.key]);
    const spendEth = Number(tier.askEth);
    const nara = Number(tier.nara);
    const weight = Number(tier.weight);
    const ethPerNara = spendEth / nara;
    assert.ok(spendEth > prevSpendEth, `Tier ${tier.key} spend (${spendEth}) must exceed previous (${prevSpendEth})`);
    assert.ok(
      ethPerNara < prevEthPerNara,
      `Tier ${tier.key} ETH/NARA (${ethPerNara.toFixed(4)}) must be lower than previous (${prevEthPerNara}) so bigger spend earns bigger discount`
    );
    assert.ok(weight > prevWeight, `Tier ${tier.key} weight (${weight}) must exceed previous (${prevWeight})`);

    const exactWei = computeV4QuadraticWeightWei(BigInt(Math.round(nara * 1e6)) * 10n ** 12n, tier.epochs);
    const exactNum = Number(exactWei) / 1e18;
    assert.ok(Math.abs(exactNum - weight) < 0.0001, `Tier ${tier.key} weight ${weight} must match exact V4Quadratic ${exactNum}`);

    const classified = classifyWave1Tier(BigInt(Math.round(nara * 1e6)) * 10n ** 12n, tier.epochs);
    assert.equal(classified.matchedWaveTier, true);
    assert.equal(classified.tierKey, tier.key);

    prevSpendEth = spendEth;
    prevEthPerNara = ethPerNara;
    prevWeight = weight;
  }

  // Exact 1-wei checks for 90d, 180d, and 365d multipliers against NARAPrincipalPreviewV5.sol
  assert.equal(computeV4QuadraticMultiplierWei(8640), 1_275_286_170_013_135_669n);
  assert.equal(computeV4QuadraticMultiplierWei(17280), 1_854_569_337_586_789_264n);
  assert.equal(computeV4QuadraticMultiplierWei(35040), 4_000_000_000_000_000_000n);

  assert.equal(Number(totalNara.toFixed(4)), 53.2);
  assert.equal(Number(totalEth.toFixed(4)), 75.68);
});

test("computeLiveNaraPerEpochWei & computeLiveMonthlyNaraWei match exact Base Mainnet EpochSettled wei math", () => {
  const config = {
    eMax: 1_000_000_000_000_000_000_000_000n,
    beta0Wad: 8_000_000_000_000_000n,
    mWad: 250_000_000_000_000_000n,
    aWad: 1_250_000_000_000_000_000n,
    bWad: 900_000_000_000_000_000n,
    cWad: 500_000_000_000_000_000n,
    dWad: 500_000_000_000_000_000n,
    dripSplitWad: 850_000_000_000_000_000n,
    growthFactorWad: 1_000_104_000_000_000_000n,
    minBaseEmission: 200_000_000_000_000_000n,
    maxBaseEmission: 5_000_000_000_000_000_000n,
    warmupRateWad: 1_500_000_000_000_000n,
    bootstrapDecayWad: 999_500_000_000_000_000n,
  };
  // Exact inputs prior to Base EpochSettled where delivered == 905103966344092219n
  const emissionState = {
    baseEmission: 573_153_172_706_410_331n,
    warmupFactorWad: 825_753_109_670_863_573n,
    stressWad: 314_144_747_220_446n,
    bootstrapWeight: 0n,
  };
  const perEpoch = computeLiveNaraPerEpochWei({
    config,
    emissionState,
    principalSnapshot: 50_003_630_081_432_033_689_561n,
    protectedNaraSnapshot: 31_250_387_455_943_068_378n,
    eligibleReserve: 949_881_936_591_553_825_326_330n,
    naraAdmissionHeadroom: 999_000_000_000_000_000_000_000n,
    activeModelWeight: 132_314_890_099_770_088_108_853n,
    activeRewardWeight: 132_314_890_099_770_088_108_853n,
  });
  // ~0.905 NARA per 15m pulse (2,606.7 NARA / month across the Grid)
  assert.ok(perEpoch > 904_000_000_000_000_000n && perEpoch < 906_000_000_000_000_000n, `got ${perEpoch}`);

  const coreMonthlyWei = computeLiveMonthlyNaraWei(
    4_000_000_000_000_000_000n, // 4.00x (1.00 NARA @ 365d)
    perEpoch,
    132_314_890_099_770_088_108_853n,
    false
  );
  // ~0.0788 NARA / mo
  assert.ok(coreMonthlyWei > 78_000_000_000_000_000n && coreMonthlyWei < 80_000_000_000_000_000n);
});

test("Chainlink ETH/USD latestRoundData encoder & decoder parse 8-decimal Base feed cleanly", () => {
  assert.equal(encodeChainlinkLatestRoundCall(), "0xfeaf968c");
  const rawRound =
    "0x" +
    abiWordU256(18446744073709556000n) +
    abiWordU256(180797000000n) + // $1,807.97 * 1e8
    abiWordU256(1794700000n) +
    abiWordU256(1794700010n) +
    abiWordU256(18446744073709556000n);
  const price = decodeChainlinkUsdPrice(rawRound, 7200n, 1794701000n);
  assert.equal(price, 1807.97);
  // Stale (>7200s) round returns null
  assert.equal(decodeChainlinkUsdPrice(rawRound, 7200n, 1794710000n), null);
  // Incomplete round (answeredInRound < roundId) returns null
  const incompleteRound =
    "0x" +
    abiWordU256(100n) +
    abiWordU256(180797000000n) +
    abiWordU256(1794700000n) +
    abiWordU256(1794700010n) +
    abiWordU256(99n);
  assert.equal(decodeChainlinkUsdPrice(incompleteRound), null);
});

test("encodePurchaseCall matches NARAPositionSaleV5.purchase(uint256,BuyerBounds) 292-byte static layout across all 3 reward slots", () => {
  const data = encodePurchaseCall(15n, {
    expectedListingId: 9n,
    minPrincipal: 1_500_000_000_000_000_000n,
    minClaimable: [12345n, 67890n, 4200000n],
    minRewardCheckpoint: 1282n,
    deadline: 1794800000n,
    minRarityTier: 1n,
  });
  assert.equal(data.slice(0, 10), "0xccfe2a51");
  assert.equal(data.length, 10 + 9 * 64);
  assert.equal(BigInt("0x" + data.slice(10, 74)), 15n);
  assert.equal(BigInt("0x" + data.slice(74, 138)), 9n);
  assert.equal(BigInt("0x" + data.slice(138, 202)), 1_500_000_000_000_000_000n);
  assert.equal(BigInt("0x" + data.slice(202, 266)), 12345n);
  assert.equal(BigInt("0x" + data.slice(266, 330)), 67890n);
  assert.equal(BigInt("0x" + data.slice(330, 394)), 4200000n);
  assert.equal(BigInt("0x" + data.slice(394, 458)), 1282n);
  assert.equal(BigInt("0x" + data.slice(458, 522)), 1794800000n);
  assert.equal(BigInt("0x" + data.slice(522, 586)), 1n);
});

test("ABI encoders and decoders cover rewardState, rarityTier, receiptTransferNonce, listing, and positionHead", () => {
  assert.equal(encodeMintedCountCall(), "0xcf721b15");
  assert.equal(encodeSellerNonceCall(ANCHOR_SEAT_CONSTANTS.treasurySafe).slice(0, 10), "0x5022e6ea");
  assert.equal(encodeListingCall(15).slice(0, 10), "0x84a184de");
  assert.equal(encodeReceiptTransferNonceCall(15).slice(0, 10), "0xc30a656d");
  assert.equal(encodePositionHeadCall(15).slice(0, 10), "0x9c82fd33");
  assert.equal(encodeRarityTierCall(15, 1).slice(0, 10), "0xda6871c8");
  assert.equal(encodeRewardStateCall(), "0x582c7928");
  assert.equal(
    encodeRewardCreditCall(ANCHOR_SEAT_CONSTANTS.rewardLedger, 15, 1, 2).slice(0, 10),
    "0xa320bd2d"
  );

  // RewardLedgerStateV5 has 7 words; word [2] = nextCheckpoint
  const rawRewardState =
    "0x" +
    abiWordBool(true) +
    abiWordU256(1218n) +
    abiWordU256(1282n) +
    abiWordU256(100n) +
    abiWordU256(0n) +
    abiWordU256(900000n) +
    abiWordBool(false);
  assert.equal(decodeRewardStateNextCheckpoint(rawRewardState), 1282n);
  assert.equal(decodeRarityTierResult("0x" + abiWordU256(2n)), 2n);

  const terms = "ab".repeat(32);
  const rawListing =
    "0x" +
    abiWordU256(7n) +
    abiWordAddr(ANCHOR_SEAT_CONSTANTS.treasurySafe) +
    abiWordU256(15n) +
    abiWordU256(0n) +
    abiWordU256(15n) +
    abiWordU256(1n) +
    terms +
    abiWordU256(2_000_000_000_000_000_000n) +
    abiWordU256(1796925600n) +
    abiWordU256(0n);

  const decodedListing = decodeListingResult(rawListing);
  assert.equal(decodedListing.listingId, 7n);
  assert.equal(decodedListing.seller.toLowerCase(), ANCHOR_SEAT_CONSTANTS.treasurySafe.toLowerCase());
  assert.equal(decodedListing.price, 2_000_000_000_000_000_000n);

  const rawPos =
    "0x" +
    abiWordAddr(ANCHOR_SEAT_CONSTANTS.treasurySafe) +
    abiWordU256(1n) +
    abiWordU256(1282n) +
    abiWordU256(1290n) +
    abiWordU256(36330n) +
    abiWordU256(36330n) +
    abiWordU256(35040n) +
    abiWordU256(1_500_000_000_000_000_000n) +
    abiWordU256(6_000_000_000_000_000_000n) +
    abiWordU256(6_000_000_000_000_000_000n) +
    abiWordBool(false) +
    abiWordU256(0n) +
    abiWordU256(0n) +
    abiWordU256(0n) +
    abiWordBool(false) +
    terms;

  const decodedPos = decodePositionHeadResult(rawPos);
  assert.equal(decodedPos.duration, 35040);
  assert.equal(decodedPos.principal, 1_500_000_000_000_000_000n);

  const rawCredit =
    "0x" +
    abiWordAddr(ANCHOR_SEAT_CONSTANTS.treasurySafe) +
    abiWordU256(1n) +
    abiWordU256(1300n) +
    abiWordU256(0n) +
    abiWordU256(420_000_000_000_000_000n) +
    abiWordU256(0n) +
    abiWordU256(100_000_000_000_000_000n) +
    abiWordBool(true) +
    abiWordU256(1314n) +
    abiWordU256(1317n) +
    abiWordBool(true);
  assert.equal(decodeRewardCreditClaimable(rawCredit), 420_000_000_000_000_000n);
  const fullCred = decodeRewardCreditFull(rawCredit);
  assert.equal(fullCred.claimable, 420_000_000_000_000_000n);
  assert.equal(fullCred.unsettledEpochs, 3n);
  assert.equal(fullCred.openEpochEligible, true);

  assert.equal(encodeEngineClockCall(), "0x91ddadf4");
  const rawClk =
    "0x" +
    abiWordBool(true) +
    abiWordU256(1793600000n) +
    abiWordU256(1317n) +
    abiWordU256(1314n) +
    abiWordU256(3n) +
    abiWordU256(1794798000n);
  const clk = decodeEngineClockResult(rawClk);
  assert.equal(clk.currentWallEpoch, 1317n);
  assert.equal(clk.backlog, 3n);
});

test("verifyAndBuildSeatBounds binds 3-asset credits + checkpoint and rejects seller spoofing, price bait-and-switch, and clock skew", () => {
  const terms = "0x" + "cd".repeat(32);
  const validInput = {
    tokenId: 15,
    expectedPriceWei: 2_000_000_000_000_000_000n,
    freshOffer: {
      listingId: 3n,
      seller: ANCHOR_SEAT_CONSTANTS.treasurySafe,
      tokenId: 15n,
      transferNonce: 0n,
      positionId: 15n,
      generation: 1n,
      termsHash: terms,
      price: 2_000_000_000_000_000_000n,
      expiry: 1796925600n,
      sellerNonce: 0n,
    },
    quorumOffer: {
      listingId: 3n,
      seller: ANCHOR_SEAT_CONSTANTS.treasurySafe,
      price: 2_000_000_000_000_000_000n,
    },
    ownerAddr: ANCHOR_SEAT_CONSTANTS.treasurySafe,
    receiptTransferNonce: 0n,
    currentSafeSellerNonce: 0n,
    isApproved: true,
    pos: {
      generationOwner: ANCHOR_SEAT_CONSTANTS.treasurySafe,
      generation: 1n,
      maturity: 36330n,
      effectiveEnd: 36330n,
      principal: 1_000_000_000_000_000_000n,
      withdrawn: false,
      termsHash: terms,
    },
    rarityTier: 0n,
    claimableTriplet: [50_000_000_000_000_000n, 1_000_000_000_000_000n, 2_500_000n],
    nextCheckpoint: 1290n,
    wallNowSec: 1794800000n,
    chainNowSec: 1794800300n, // L2 block ahead by 300s -> deadline uses chainNowSec + 1200s
    buyer: "0x1111111111111111111111111111111111111111",
  };

  const bounds = verifyAndBuildSeatBounds(validInput);
  assert.equal(bounds.expectedListingId, 3n);
  assert.equal(bounds.minPrincipal, 1_000_000_000_000_000_000n);
  assert.deepEqual(bounds.minClaimable, [50_000_000_000_000_000n, 1_000_000_000_000_000n, 2_500_000n]);
  assert.equal(bounds.minRewardCheckpoint, 1290n);
  assert.equal(bounds.deadline, 1794800300n + 1200n);

  // Rejects spoofed third-party seller
  assert.throws(
    () =>
      verifyAndBuildSeatBounds({
        ...validInput,
        freshOffer: { ...validInput.freshOffer, seller: "0x2222222222222222222222222222222222222222" },
      }),
    /Treasury multisig/
  );

  // Rejects bait-and-switch price mutation
  assert.throws(
    () =>
      verifyAndBuildSeatBounds({
        ...validInput,
        freshOffer: { ...validInput.freshOffer, price: 25_000_000_000_000_000_000n },
        quorumOffer: { ...validInput.quorumOffer, price: 25_000_000_000_000_000_000n },
      }),
    /price changed/
  );

  // Rejects cross-RPC quorum disagreement
  assert.throws(
    () =>
      verifyAndBuildSeatBounds({
        ...validInput,
        quorumOffer: { ...validInput.quorumOffer, listingId: 99n },
      }),
    /Cross-RPC verification mismatch/
  );

  // Clamps deadline to freshOffer.expiry when expiry < now + 1200s, and rejects <30s expiry cliff
  const nearExpiryBounds = verifyAndBuildSeatBounds({
    ...validInput,
    freshOffer: { ...validInput.freshOffer, expiry: 1794800300n + 300n },
  });
  assert.equal(nearExpiryBounds.deadline, 1794800300n + 300n);

  assert.throws(
    () =>
      verifyAndBuildSeatBounds({
        ...validInput,
        freshOffer: { ...validInput.freshOffer, expiry: 1794800300n + 15n },
      }),
    /under 30 seconds/
  );
});

test("simulateSeatPurchaseFailClosed blocks custom hex reverts AND blocks total RPC simulation failure", async () => {
  // 1. Custom Solidity error selector hex without the word 'revert' must still abort immediately
  const customRevertProvider = {
    request: async () => {
      const err = new Error("execution error");
      err.data = "0x82b42900";
      throw err;
    },
  };
  await assert.rejects(
    () => simulateSeatPurchaseFailClosed(customRevertProvider, { to: "0x0" }, async () => "0x"),
    /Safety simulation blocked reverting seat purchase/
  );

  // 2. Wallet transport failure + public RPC failure must fail closed (never sign blind)
  const deadWalletProvider = {
    request: async () => {
      throw new Error("HTTP 502 Bad Gateway");
    },
  };
  await assert.rejects(
    () =>
      simulateSeatPurchaseFailClosed(deadWalletProvider, { to: "0x0" }, async () => {
        throw new Error("Base public RPC timeout");
      }),
    /Safety simulation blocked unverified seat purchase/
  );

  // 3. Wallet transport failure + clean public RPC eth_call pass succeeds
  const ok = await simulateSeatPurchaseFailClosed(deadWalletProvider, { to: "0x0" }, async () => "0x");
  assert.equal(ok, true);
});

test("encodeMulticall3Aggregate3 and decodeMulticall3Aggregate3 encode and decode Result[] cleanly", () => {
  const encodedCall = encodeMulticall3Aggregate3([
    { target: ANCHOR_SEAT_CONSTANTS.positionReceipt, allowFailure: true, callData: encodeMintedCountCall() },
  ]);
  assert.equal(encodedCall.slice(0, 10), "0x82ad56cb");

  const mockResultHex =
    "0x" +
    abiWordU256(32n) +
    abiWordU256(1n) +
    abiWordU256(32n) +
    abiWordBool(true) +
    abiWordU256(64n) +
    abiWordU256(32n) +
    abiWordU256(14n);

  const parsed = decodeMulticall3Aggregate3(mockResultHex);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].success, true);
  assert.equal(BigInt(parsed[0].returnData), 14n);
});

test("buildMobileSeatWalletLinks generates HTTPS deep-links carrying exact /vault?seat=<id> across all 4 mobile wallets", () => {
  const links = buildMobileSeatWalletLinks(16);
  assert.equal(links.directUrl, "https://naraprotocol.io/vault?seat=16");
  assert.equal(links.metamaskUrl, "https://link.metamask.io/dapp/naraprotocol.io/vault?seat=16");
  assert.equal(
    links.coinbaseUrl,
    "https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Fnaraprotocol.io%2Fvault%3Fseat%3D16"
  );
  assert.match(links.phantomUrl, /^https:\/\/phantom\.app\/ul\/browse\/https%3A%2F%2Fnaraprotocol\.io%2Fvault%3Fseat%3D16/);
  assert.equal(
    links.trustUrl,
    "https://link.trustwallet.com/open_url?coin_id=8453&url=https%3A%2F%2Fnaraprotocol.io%2Fvault%3Fseat%3D16"
  );
});
