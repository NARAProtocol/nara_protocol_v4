import test from "node:test";
import assert from "node:assert/strict";
import {
  WAD,
  EPOCHS_PER_DAY,
  formatUnits18,
  encodeMulticallAggregate,
  decodeMulticallAggregate,
  classifyPositionHead,
  getSqrtPriceX96AtTick,
  computeOrderNaraWei,
  readSupplySnapshot,
} from "../functions/_shared/supplyCore.js";
import {
  onRequest as onCirculatingRequest,
  onRequestGet as onCirculatingGet,
  onRequestHead as onCirculatingHead,
} from "../functions/api/circulating-supply.js";
import { onRequestGet as onTotalGet } from "../functions/api/total-supply.js";
import { onRequestGet as onSupplyGet } from "../functions/api/supply.js";

function wordHex(val) {
  return BigInt.asUintN(256, BigInt(val)).toString(16).padStart(64, "0");
}

function encodeAggregateReply(blockNumber, returnDataHexList) {
  const n = returnDataHexList.length;
  const encodedItems = returnDataHexList.map((hex) => {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const byteLen = clean.length / 2;
    const padLen = Math.ceil(byteLen / 32) * 64;
    return wordHex(byteLen) + clean.padEnd(padLen, "0");
  });

  let relOffset = n * 32;
  const offsets = [];
  for (const item of encodedItems) {
    offsets.push(wordHex(relOffset));
    relOffset += item.length / 2;
  }

  return (
    "0x" +
    wordHex(blockNumber) +
    wordHex(64) +
    wordHex(n) +
    offsets.join("") +
    encodedItems.join("")
  );
}

function buildPositionWords({
  maturity,
  duration,
  principalWei,
  earlyExitEnabled = false,
  withdrawn = false,
}) {
  const words = new Array(16).fill(0n);
  words[0] = 1n; // generationOwner placeholder
  words[1] = 1n; // generation
  words[4] = BigInt(maturity);
  words[5] = BigInt(maturity);
  words[6] = BigInt(duration);
  words[7] = BigInt(principalWei);
  words[10] = earlyExitEnabled ? 1n : 0n;
  words[14] = withdrawn ? 1n : 0n;
  return words;
}

function buildRangeOrderWords({
  tokenId = 3212417n,
  liquidity = 0n,
  tickLower = 180000,
  tickUpper = 181000,
  side = 0n,
  status = 1n,
}) {
  const words = new Array(13).fill(0n);
  words[0] = BigInt(tokenId);
  words[5] = BigInt(liquidity);
  words[6] = BigInt(tickLower);
  words[7] = BigInt(tickUpper);
  words[11] = BigInt(side);
  words[12] = BigInt(status);
  return words;
}

function encodeActiveOrderIdsReply(orderIds, nextOffset = orderIds.length) {
  return encodeWords([64n, BigInt(nextOffset), BigInt(orderIds.length), ...orderIds.map((id) => BigInt(id))]);
}

function encodeWords(words) {
  return "0x" + words.map((w) => wordHex(w)).join("");
}

function makeMockRpcFetch({
  blockNumber = 55206000n,
  wallEpoch = 700n,
  totalSupplyWei = 1_000_000n * WAD,
  emissionReserveWei = 949_928_062670788271591385n,
  legacyRangeWei = 49_997n * WAD,
  activeRangeWei = 51_014900000000000000n,
  deadBurnWei = 0n,
  rewardLedgerWei = 15_595695000000000000n,
  principalLedgerWei = 2n * WAD,
  slipVaultWei = 2_438656000000000000n,
  slipVaultV33Wei = 0n,
  treasurySafeWei = 209666000000000000n,
  sqrtPriceX96 = getSqrtPriceX96AtTick(190500),
  rangeOrders = [],
  positions = [
    // Position #1: 1-day withdrawn
    buildPositionWords({ maturity: 120n, duration: 96n, principalWei: 1n * WAD, withdrawn: true }),
    // Position #2: 365-day active committed (>1d duration and >1d remaining)
    buildPositionWords({ maturity: 35072n, duration: 35040n, principalWei: 1n * WAD }),
    // Position #3: 1-day active (96 epochs => excluded from freeze, stays circulating!)
    buildPositionWords({ maturity: 791n, duration: 96n, principalWei: 1n * WAD }),
  ],
  failFirstRpc = false,
} = {}) {
  let callIndex = 0;
  return async (url) => {
    callIndex++;
    if (failFirstRpc && String(url).includes("broken-rpc")) {
      return new Response("upstream error", { status: 502 });
    }
    // First multicall has 14 base calls; second multicall fetches positionHead(1..N) + getOrder(...)
    const isBaseBatch = (failFirstRpc ? callIndex - 1 : callIndex) === 1;
    if (isBaseBatch) {
      const clockWords = [1n, 1793611800n, wallEpoch, wallEpoch - 2n, 2n, 1794240900n];
      const pAccWords = [1n, wallEpoch, principalLedgerWei, principalLedgerWei, 0n, 0n, 0n, BigInt(positions.length)];
      const slot0Words = [BigInt(sqrtPriceX96), 190500n, 0n, 0n];
      const orderIds = rangeOrders.map((_, i) => i + 1);
      const reply = encodeAggregateReply(blockNumber, [
        encodeWords([totalSupplyWei]),
        encodeWords([emissionReserveWei]),
        encodeWords([legacyRangeWei]),
        encodeWords([activeRangeWei]),
        encodeWords([deadBurnWei]),
        encodeWords([rewardLedgerWei]),
        encodeWords([principalLedgerWei]),
        encodeWords([slipVaultWei]),
        encodeWords([slipVaultV33Wei]),
        encodeWords([treasurySafeWei]),
        encodeWords(clockWords),
        encodeWords(pAccWords),
        encodeWords(slot0Words),
        encodeActiveOrderIdsReply(orderIds),
      ]);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: reply }), { status: 200 });
    }

    const reply = encodeAggregateReply(blockNumber, [
      ...positions.map((w) => encodeWords(w)),
      ...rangeOrders.map((w) => encodeWords(w)),
    ]);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: reply }), { status: 200 });
  };
}

test("formatUnits18 preserves exact 18-decimal precision without trailing zeros", () => {
  assert.equal(formatUnits18(1_000_000n * WAD), "1000000");
  assert.equal(formatUnits18(22_922429211728408615n), "22.922429211728408615");
  assert.equal(formatUnits18(1_500000000000000000n), "1.5");
  assert.equal(formatUnits18(0n), "0");
});

test("encodeMulticallAggregate and decodeMulticallAggregate round-trip cleanly", () => {
  const encoded = encodeMulticallAggregate([
    { target: "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f", callData: "0x18160ddd" },
    {
      target: "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f",
      callData: "0x70a08231000000000000000000000000f932178f24b0813c82093985f0af6db27ae25930",
    },
  ]);
  assert.match(encoded, /^0x252dba42/);

  const rawReply = encodeAggregateReply(55206001n, [
    encodeWords([1_000_000n * WAD]),
    encodeWords([949_928n * WAD]),
  ]);
  const decoded = decodeMulticallAggregate(rawReply);
  assert.equal(decoded.blockNumber, 55206001n);
  assert.equal(decoded.results.length, 2);
  assert.equal(BigInt(decoded.results[0]), 1_000_000n * WAD);
  assert.equal(BigInt(decoded.results[1]), 949_928n * WAD);
});

test("classifyPositionHead keeps 1-day commitments and near-expiry commitments circulating, excludes >1d commitments", () => {
  const wallEpoch = 700n;

  const oneDay = classifyPositionHead(
    buildPositionWords({ maturity: 796n, duration: EPOCHS_PER_DAY, principalWei: 1n * WAD }),
    wallEpoch,
  );
  assert.equal(oneDay.active, true);
  assert.equal(oneDay.lockedOverThreshold, false);

  const oneYear = classifyPositionHead(
    buildPositionWords({ maturity: 35740n, duration: 35040n, principalWei: 5n * WAD }),
    wallEpoch,
  );
  assert.equal(oneYear.active, true);
  assert.equal(oneYear.lockedOverThreshold, true);
  assert.equal(oneYear.principal, 5n * WAD);

  const expiringToday = classifyPositionHead(
    buildPositionWords({ maturity: wallEpoch + EPOCHS_PER_DAY, duration: 35040n, principalWei: 5n * WAD }),
    wallEpoch,
  );
  assert.equal(expiringToday.lockedOverThreshold, false);

  const earlyExit = classifyPositionHead(
    buildPositionWords({
      maturity: 35740n,
      duration: 35040n,
      principalWei: 5n * WAD,
      earlyExitEnabled: true,
    }),
    wallEpoch,
  );
  assert.equal(earlyExit.lockedOverThreshold, false);
});

test("readSupplySnapshot deducts 365d commitment, keeps 1d commitment + rewards + slips circulating, and reacts to re-committing rewards", async () => {
  const snapBefore = await readSupplySnapshot({}, { fetchImpl: makeMockRpcFetch() });
  assert.equal(snapBefore.totalSupply, "1000000");
  // Protocol-only circulating: 1,000,000 - (949,928.062670788271591385 + 49,997 + 51.0149) = 23.922429211728408615
  assert.equal(snapBefore.protocolOnlyCirculatingSupply, "23.922429211728408615");
  // Default circulating also subtracts Position #2 (1 NARA committed 365d) while keeping Position #3 (1 NARA 1d) circulating:
  assert.equal(snapBefore.circulatingSupply, "22.922429211728408615");
  assert.deepEqual(snapBefore.breakdown.commitments.lockedPositionIds, [2]);
  assert.deepEqual(snapBefore.breakdown.commitments.circulatingPositionIds, [3]);

  // Now simulate claiming 15 NARA from RewardLedger and committing it for 365d (Position #4):
  const snapAfterRelock = await readSupplySnapshot(
    {},
    {
      fetchImpl: makeMockRpcFetch({
        rewardLedgerWei: 595695000000000000n, // -15 NARA
        principalLedgerWei: 17n * WAD, // +15 NARA
        positions: [
          buildPositionWords({ maturity: 120n, duration: 96n, principalWei: 1n * WAD, withdrawn: true }),
          buildPositionWords({ maturity: 35072n, duration: 35040n, principalWei: 1n * WAD }),
          buildPositionWords({ maturity: 791n, duration: 96n, principalWei: 1n * WAD }),
          buildPositionWords({ maturity: 35740n, duration: 35040n, principalWei: 15n * WAD }),
        ],
      }),
    },
  );
  // Circulating supply automatically drops by exactly 15 NARA -> 7.922429211728408615!
  assert.equal(snapAfterRelock.circulatingSupply, "7.922429211728408615");
  assert.equal(snapAfterRelock.protocolOnlyCirculatingSupply, "23.922429211728408615");
  assert.deepEqual(snapAfterRelock.breakdown.commitments.lockedPositionIds, [2, 4]);
});

test("readSupplySnapshot deducts unbought NARATreasuryRangeManagerV5 sell rungs in PoolManager and tracks v33 micro-slip vault", async () => {
  const tickLower = -185000;
  const tickUpper = -184000;
  // Current pool price above tickUpper in token1/token0 space => sp >= sb => 100% unbought NARA (token1)
  const sqrtPriceX96 = getSqrtPriceX96AtTick(-180000);
  const liquidity = 1_000_000_000_000_000_000_000_000n;
  const expectedOrderNaraWei = computeOrderNaraWei(liquidity, tickLower, tickUpper, sqrtPriceX96);
  assert.ok(expectedOrderNaraWei > 0n);

  const v33BalanceWei = 500_000_000_000_000_000n; // 0.5 NARA in v33 micro-slip vault

  const snap = await readSupplySnapshot(
    {},
    {
      fetchImpl: makeMockRpcFetch({
        sqrtPriceX96,
        slipVaultV33Wei: v33BalanceWei,
        rangeOrders: [
          buildRangeOrderWords({ liquidity, tickLower, tickUpper, status: 1n }),
        ],
      }),
    },
  );

  const baselineCircWei = 22_922429211728408615n;
  assert.equal(snap.circulatingSupply, formatUnits18(baselineCircWei - expectedOrderNaraWei));
  assert.equal(snap.breakdown.protocolLocked.activeRangeManagerPoolOrders.activeOrders, 1);
  assert.equal(
    snap.breakdown.protocolLocked.activeRangeManagerPoolOrders.balance,
    formatUnits18(expectedOrderNaraWei),
  );
  assert.equal(snap.breakdown.includedInCirculating.activePaymentSlipsInVault.vaults.v33.balance, "0.5");
  assert.equal(
    snap.breakdown.includedInCirculating.activePaymentSlipsInVault.balance,
    formatUnits18(2_438656000000000000n + v33BalanceWei),
  );
});

test("HTTP endpoints return CoinGecko-compatible plain text, JSON breakdown, RPC failover, and 405 on POST", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = makeMockRpcFetch({ failFirstRpc: true });
    const env = { BASE_RPC_URL: "https://broken-rpc.example.com" };

    const circRes = await onCirculatingGet({
      request: new Request("https://naraprotocol.io/api/circulating-supply"),
      env,
    });
    assert.equal(circRes.status, 200);
    assert.match(circRes.headers.get("Content-Type"), /^text\/plain/);
    assert.equal(await circRes.text(), "22.922429211728408615");

    globalThis.fetch = makeMockRpcFetch();
    const protoOnlyRes = await onCirculatingGet({
      request: new Request("https://naraprotocol.io/api/circulating-supply?mode=protocol-only"),
      env,
    });
    assert.equal(await protoOnlyRes.text(), "23.922429211728408615");

    globalThis.fetch = makeMockRpcFetch();
    const totalRes = await onTotalGet({
      request: new Request("https://naraprotocol.io/api/total-supply"),
      env: {},
    });
    assert.equal(await totalRes.text(), "1000000");

    globalThis.fetch = makeMockRpcFetch();
    const supplyJsonRes = await onSupplyGet({ env: {} });
    const supplyJson = await supplyJsonRes.json();
    assert.equal(supplyJson.circulatingSupply, "22.922429211728408615");
    assert.equal(supplyJson.breakdown.commitments.lockedOver1d, "1");
    assert.equal(supplyJson.breakdown.commitments.circulating1dOrMatured, "1");

    globalThis.fetch = makeMockRpcFetch();
    const headRes = await onCirculatingHead({
      request: new Request("https://naraprotocol.io/api/circulating-supply", { method: "HEAD" }),
      env: {},
    });
    assert.equal(headRes.status, 200);
    assert.equal(await headRes.text(), "");

    const postRes = await onCirculatingRequest({
      request: new Request("https://naraprotocol.io/api/circulating-supply", { method: "POST" }),
      env: {},
    });
    assert.equal(postRes.status, 405);

    globalThis.fetch = async () => new Response("down", { status: 503 });
    const errRes = await onCirculatingGet({
      request: new Request("https://naraprotocol.io/api/circulating-supply"),
      env: {},
    });
    assert.equal(errRes.status, 503);
    assert.equal(errRes.headers.get("Cache-Control"), "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
