import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sponsoredCallsHash as serverHash } from "../tools/v4-test-console/functions/_shared/nara-paymaster-policy.js";
import {
  atomicCallsStatus,
  buildWalletSendCallsRequest,
  parseStoredPendingCalls,
  pendingCallsStorageKey,
  sponsoredCallsHash as clientHash,
  supportsAtomicCalls,
  supportsSponsoredAtomicCalls,
  tradeAtomicCompatibilityStorageKey,
  walletCallsId,
} from "../tools/v4-test-console/src/sponsorship.js";
import { DEPLOYMENT } from "../tools/v4-test-console/src/generated/contracts.js";

describe("v4 test console sponsored execution", function () {
  it("detects wallet-funded atomic execution independently from paymaster support", function () {
    expect(supportsAtomicCalls({ atomic: { status: "supported" } })).to.equal(true);
    expect(supportsAtomicCalls({ atomic: { status: "ready" } })).to.equal(true);
    expect(supportsAtomicCalls({ atomic: { status: "unsupported" } })).to.equal(false);
    expect(supportsAtomicCalls(undefined)).to.equal(false);
    expect(atomicCallsStatus({ atomic: { status: "ready" } })).to.equal("ready");
    expect(atomicCallsStatus({ atomic: { supported: "supported" } })).to.equal("supported");
    expect(atomicCallsStatus(undefined)).to.equal("unknown");
  });

  it("requires both atomic and paymaster wallet capabilities", function () {
    expect(supportsSponsoredAtomicCalls({
      atomic: { status: "supported" },
      paymasterService: { supported: true },
    })).to.equal(true);
    expect(supportsSponsoredAtomicCalls({
      atomic: { status: "ready" },
      paymasterService: { supported: true },
    })).to.equal(true);
    expect(supportsSponsoredAtomicCalls({
      atomic: { status: "unsupported" },
      paymasterService: { supported: true },
    })).to.equal(false);
    expect(supportsSponsoredAtomicCalls({ atomic: { status: "supported" } })).to.equal(false);
  });

  it("uses the same canonical calls hash in browser and server", function () {
    const calls = [{
      to: DEPLOYMENT.engine,
      value: 1_000_000_000_000n,
      data: "0x12345678" as `0x${string}`,
    }];
    expect(clientHash(calls)).to.equal(serverHash(calls));
  });

  it("restores wallet-scoped pending atomic actions and expires stale records", function () {
    const now = 1_800_000_000_000;
    const raw = JSON.stringify({
      version: 1,
      action: "Buy NARA",
      id: "0xwallet-calls-id",
      startedAt: now,
    });
    expect(pendingCallsStorageKey("0xAbC")).to.equal("nara-v4-test-console:pending-calls:8453:0xabc");
    expect(parseStoredPendingCalls(raw, now)?.id).to.equal("0xwallet-calls-id");
    expect(parseStoredPendingCalls(raw, now + 24 * 60 * 60 * 1_000 + 1)).to.equal(null);
  });

  it("scopes atomic compatibility fallback to one Base wallet", function () {
    expect(tradeAtomicCompatibilityStorageKey("0xAbC"))
      .to.equal("nara-v4-test-console:trade-atomic-compatibility:8453:0xabc");
  });

  it("builds the Base wallet request with explicit zero values on every call", function () {
    const request = buildWalletSendCallsRequest({
      address: "0x1111111111111111111111111111111111111111",
      chainId: 8453,
      calls: [
        { to: DEPLOYMENT.usdc, data: "0x1234" },
        { to: DEPLOYMENT.universalRouter, data: "0xabcd", value: 0n },
      ],
    });
    expect(request.method).to.equal("wallet_sendCalls");
    expect(request.params[0].version).to.equal("2.0.0");
    expect(request.params[0].chainId).to.equal("0x2105");
    expect(request.params[0].atomicRequired).to.equal(true);
    expect(request.params[0].calls.map((call) => call.value)).to.deep.equal(["0x0", "0x0"]);
  });

  it("accepts every documented wallet calls identifier response shape", function () {
    expect(walletCallsId("0xstring-id")).to.equal("0xstring-id");
    expect(walletCallsId({ id: "0xobject-id" })).to.equal("0xobject-id");
    expect(walletCallsId({ batchId: "0xbatch-id" })).to.equal("0xbatch-id");
    expect(() => walletCallsId({})).to.throw("invalid atomic action identifier");
  });

  it("keeps the sequential fallback and separates wallet atomic support from sponsorship", function () {
    const app = readFileSync(resolve("tools/v4-test-console/src/app.tsx"), "utf8");
    expect(app).to.include("supportsAtomicCalls");
    expect(app).to.include("supportsSponsoredAtomicCalls");
    expect(app).to.include("buildWalletSendCallsRequest");
    expect(app).to.include("validation: true");
    expect(app).to.include("baseAccountBlocksAtomic");
    expect(app).to.include("const sponsoredAtomicReady = !baseAccountBlocksAtomic");
    expect(app).to.include("|| baseAccountBlocksAtomic");
    expect(app).to.include("Close the Coinbase signing page completely");
    expect(app).to.include("requestSponsorshipTicket");
    expect(app).to.include("writeContractAsync");
    expect(app).to.include("The wallet-funded path is now active");
    expect(app).to.include("Use compatibility mode");
    expect(app).to.include("Exact setup is now active");
    expect(app).to.include("Engine ETH fee still applies");
  });
});
