import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  externalFundingRoutes,
  FUNDING_INTENT_MAX_AGE_MS,
  fundingIntentStorageKey,
  parseSavedFundingIntent,
} from "../tools/v4-test-console/src/funding.js";
import { buildFundingMessage } from "../tools/v4-test-console/functions/api/onramp-session.js";

describe("v4 test console funding", function () {
  it("stores wallet-scoped Base funding intent and expires it", function () {
    const now = 1_800_000_000_000;
    const saved = JSON.stringify({
      version: 1,
      kind: "lock",
      lockAmount: "100",
      durationEpochs: "9",
      createdAt: now,
    });
    expect(fundingIntentStorageKey("0xAbC")).to.equal(
      "nara-v4-test-console:funding-intent:8453:0xabc",
    );
    expect(parseSavedFundingIntent(saved, now)?.lockAmount).to.equal("100");
    expect(parseSavedFundingIntent(saved, now + FUNDING_INTENT_MAX_AGE_MS + 1)).to.equal(null);
  });

  it("uses an explicit, non-transaction wallet authentication message", function () {
    const message = buildFundingMessage({
      origin: "https://nara.example",
      address: "0x0000000000000000000000000000000000001234",
      nonce: "abc",
      expiresAt: Date.parse("2026-08-15T12:00:00.000Z"),
    });
    expect(message).to.include("Network: Base (8453)");
    expect(message).to.include("It does not submit a blockchain transaction.");
    expect(message).to.include("Wallet: 0x0000000000000000000000000000000000001234");
  });

  it("keeps onramp credentials server-side and validates destination ownership", function () {
    const server = readFileSync(resolve("tools/v4-test-console/functions/api/onramp-session.js"), "utf8");
    const client = readFileSync(resolve("tools/v4-test-console/src/app.tsx"), "utf8");
    expect(server).to.include("CDP_API_KEY_SECRET");
    expect(server).to.include("createPublicClient");
    expect(server).to.include(".verifyMessage");
    expect(server).to.include("env.BASE_RPC_URL");
    expect(server).to.include('request.headers.get("CF-Connecting-IP")');
    expect(server).to.include("env.ONRAMP_STATE");
    expect(server).to.include('value === "ETH" || value === "USDC"');
    expect(client).to.include('destination.origin !== "https://pay.coinbase.com"');
    expect(client).not.to.include("VITE_CDP_API_KEY_SECRET");
  });

  it("keeps active Base and multi-provider funding routes when direct Coinbase is offline", function () {
    const routes = externalFundingRoutes("USDC");
    expect(routes.map((route) => route.id)).to.deep.equal(["base-app", "uniswap"]);
    expect(routes.map((route) => route.url)).to.deep.equal([
      "https://base.app/",
      "https://app.uniswap.org/buy",
    ]);
    expect(routes.every((route) => route.detail.includes("Base"))).to.equal(true);
  });
});
