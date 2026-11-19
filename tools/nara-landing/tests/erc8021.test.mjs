import test from "node:test";
import assert from "node:assert/strict";
import {
  ERC8021_MARKER_HEX,
  normalizeBuilderCodes,
  toErc8021DataSuffix,
  appendErc8021DataSuffix,
  probeErc5792Capabilities,
  trySendCallsWithErc8021,
} from "../src/meme/erc8021.js";

test("ERC-8021 Schema 0 matches official wevm/ox test vectors byte-for-byte", () => {
  assert.equal(
    toErc8021DataSuffix(["baseapp"]),
    "0x62617365617070070080218021802180218021802180218021"
  );
  assert.equal(
    toErc8021DataSuffix(["baseapp", "morpho"]),
    "0x626173656170702c6d6f7270686f0e0080218021802180218021802180218021"
  );
  assert.equal(
    toErc8021DataSuffix(["bc_g71jff6u"]),
    "0x62635f6737316a666636750b0080218021802180218021802180218021"
  );
});

test("appendErc8021DataSuffix leaves 0x ETH transfers untouched and is idempotent on contract calls", () => {
  assert.equal(appendErc8021DataSuffix("0x", "bc_g71jff6u"), "0x");
  assert.equal(appendErc8021DataSuffix("0x1234", "bc_g71jff6u"), "0x1234");

  const calldata = "0x095ea7b30000000000000000000000000000000000000000000000000000000000000001";
  assert.equal(appendErc8021DataSuffix(calldata, ""), calldata);
  assert.equal(appendErc8021DataSuffix(calldata, null), calldata);

  const tagged = appendErc8021DataSuffix(calldata, "bc_nara123");
  assert.ok(tagged.startsWith(calldata));
  assert.ok(tagged.endsWith(ERC8021_MARKER_HEX));
  assert.equal(appendErc8021DataSuffix(tagged, "bc_nara123"), tagged);
});

test("normalizeBuilderCodes deduplicates and rejects malformed inputs safely", () => {
  assert.deepEqual(normalizeBuilderCodes(" bc_one , bc_two , bc_one "), ["bc_one", "bc_two"]);
  assert.deepEqual(normalizeBuilderCodes(["bad space", "ok_code"]), ["ok_code"]);
});

test("ERC-5792 trySendCallsWithErc8021 requires explicit dataSuffix capability and polls v2.0.0 receipts", async () => {
  const signer = "0x1111111111111111111111111111111111111111";
  const expectedTxHash = "0x" + "ab".repeat(32);

  // 1. Wallet WITHOUT dataSuffix capability (e.g. MetaMask EOA / 7702 without dataSuffix) -> falls back to eth_sendTransaction
  const eoaProvider = {
    async request({ method }) {
      if (method === "wallet_getCapabilities") {
        return { "0x2105": { atomic: { status: "ready" } } };
      }
      throw new Error("should not call wallet_sendCalls without dataSuffix capability");
    },
  };
  const eoaCaps = await probeErc5792Capabilities(eoaProvider, signer, "0x2105");
  assert.equal(eoaCaps.hasDataSuffixCap, false);
  assert.equal(eoaCaps.hasAtomicBatch, true);

  const eoaRes = await trySendCallsWithErc8021({
    provider: eoaProvider,
    from: signer,
    calls: [{ to: signer, data: "0x095ea7b300000000" }],
    codesInput: "bc_g71jff6u",
  });
  assert.equal(eoaRes.usedSendCalls, false);

  // 2. Base Account / Coinbase Smart Wallet WITH dataSuffix + atomicBatch -> batches calls + outer dataSuffix
  let capturedSendCalls = null;
  let statusPolls = 0;
  const smartWalletProvider = {
    async request({ method, params }) {
      if (method === "wallet_getCapabilities") {
        return {
          "0x2105": {
            atomicBatch: { supported: true },
            dataSuffix: { supported: true },
          },
        };
      }
      if (method === "wallet_sendCalls") {
        capturedSendCalls = params[0];
        return { id: "0x" + "cd".repeat(65) };
      }
      if (method === "wallet_getCallsStatus") {
        statusPolls++;
        if (statusPolls === 1) return { status: 100, receipts: [] };
        return {
          status: 200,
          receipts: [{ status: "0x1", transactionHash: expectedTxHash }],
        };
      }
      throw new Error(`unexpected method ${method}`);
    },
  };

  const swRes = await trySendCallsWithErc8021({
    provider: smartWalletProvider,
    from: signer,
    calls: [
      { to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", data: "0x095ea7b300000000" },
      { to: "0x000000000022D473030F116dDEE9F6B43aC78BA3", data: "0x87517c4500000000" },
      { to: "0x6fF5693b99212Da76ad316178A184AB56D299b43", data: "0x3593564c00000000" },
    ],
    codesInput: "bc_g71jff6u",
    pollMs: 10,
  });

  assert.equal(swRes.usedSendCalls, true);
  assert.equal(swRes.txHash, expectedTxHash);
  assert.equal(capturedSendCalls.version, "2.0.0");
  assert.equal(capturedSendCalls.atomicRequired, true);
  assert.equal(capturedSendCalls.calls.length, 3);
  assert.equal(
    capturedSendCalls.capabilities.dataSuffix.value,
    "0x62635f6737316a666636750b0080218021802180218021802180218021"
  );

  // 3. User rejection (4001) throws immediately and NEVER falls back to eth_sendTransaction
  const rejectProvider = {
    async request({ method }) {
      if (method === "wallet_getCapabilities") {
        return { "0x2105": { dataSuffix: { supported: true } } };
      }
      const err = new Error("User rejected the request.");
      err.code = 4001;
      throw err;
    },
  };
  await assert.rejects(
    () =>
      trySendCallsWithErc8021({
        provider: rejectProvider,
        from: signer,
        calls: [{ to: signer, data: "0x095ea7b300000000" }],
        codesInput: "bc_g71jff6u",
      }),
    /User rejected/
  );
});
