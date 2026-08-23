import { expect } from "chai";
import { Interface } from "ethers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  decodeUserOperationCalls,
  NARA_PAYMASTER_ADDRESSES,
  sponsoredCallsHash,
  validateSponsoredCalls,
} from "../tools/v4-test-console/functions/_shared/nara-paymaster-policy.js";
import { implementationFromAccountState } from "../tools/v4-test-console/functions/api/paymaster.js";
import { DEPLOYMENT, engineAbi, erc20Abi } from "../tools/v4-test-console/src/generated/contracts.js";
import {
  buildTradeRouterCall,
  MAX_ERC20_ALLOWANCE,
  MAX_PERMIT2_ALLOWANCE,
  permit2Abi,
  tradeTokenAddresses,
  universalRouterAbi,
} from "../tools/v4-test-console/src/trade.js";

const account = "0x0000000000000000000000000000000000001234";
const accountInterface = new Interface([
  "function execute(address target,uint256 value,bytes data) payable",
  "function executeBatch((address target,uint256 value,bytes data)[] calls) payable",
]);

function encode(abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
  return new Interface(abi as never).encodeFunctionData(functionName, args) as `0x${string}`;
}

function lockCalls(amount = 10n * 10n ** 18n) {
  return [
    {
      to: DEPLOYMENT.nara,
      value: 0n,
      data: encode(erc20Abi, "approve", [DEPLOYMENT.engine, amount]),
    },
    {
      to: DEPLOYMENT.engine,
      value: 1_000_000_000_000n,
      data: encode(engineAbi, "lock", [amount, 9n, amount - amount / 200n]),
    },
  ];
}

describe("v4 test console paymaster policy", function () {
  it("is pinned to the generated production addresses", function () {
    expect(NARA_PAYMASTER_ADDRESSES.engine).to.equal(DEPLOYMENT.engine.toLowerCase());
    expect(NARA_PAYMASTER_ADDRESSES.nara).to.equal(DEPLOYMENT.nara.toLowerCase());
    expect(NARA_PAYMASTER_ADDRESSES.usdc).to.equal(DEPLOYMENT.usdc.toLowerCase());
    expect(NARA_PAYMASTER_ADDRESSES.hook).to.equal(DEPLOYMENT.hook.toLowerCase());
    expect(NARA_PAYMASTER_ADDRESSES.permit2).to.equal(DEPLOYMENT.permit2.toLowerCase());
    expect(NARA_PAYMASTER_ADDRESSES.universalRouter).to.equal(DEPLOYMENT.universalRouter.toLowerCase());
  });

  it("accepts only an exact approval plus production Engine lock", function () {
    const calls = lockCalls();
    expect(validateSponsoredCalls(calls, account).kind).to.equal("lock");
    expect(() => validateSponsoredCalls([
      { ...calls[0], data: encode(erc20Abi, "approve", [DEPLOYMENT.engine, 11n * 10n ** 18n]) },
      calls[1],
    ], account)).to.throw("exactly match");
    expect(() => validateSponsoredCalls([{ ...calls[1], to: account }], account)).to.throw();
    const longLock = lockCalls();
    longLock[1] = {
      ...longLock[1],
      data: encode(engineAbi, "lock", [10n * 10n ** 18n, 35_040n, 39n * 10n ** 18n]),
    };
    expect(validateSponsoredCalls(longLock, account).kind).to.equal("lock");
  });

  it("accepts the verified production router encoding and rejects route changes", function () {
    const now = 1_800_000_000n;
    const router = buildTradeRouterCall("buy", 10n * 10n ** 6n, 700n * 10n ** 18n, now);
    const call = {
      to: DEPLOYMENT.universalRouter,
      value: 0n,
      data: encode(universalRouterAbi, "execute", [router.commands, [...router.inputs], router.deadline]),
    };
    const input = tradeTokenAddresses("buy").input;
    const setup = [
      {
        to: input,
        value: 0n,
        data: encode(erc20Abi, "approve", [DEPLOYMENT.permit2, MAX_ERC20_ALLOWANCE]),
      },
      {
        to: DEPLOYMENT.permit2,
        value: 0n,
        data: encode(permit2Abi, "approve", [
          input,
          DEPLOYMENT.universalRouter,
          MAX_PERMIT2_ALLOWANCE,
          now + 30n * 24n * 60n * 60n,
        ]),
      },
    ];
    expect(validateSponsoredCalls([...setup, call], account, now).kind).to.equal("buy");
    const bad = { ...call, value: 1n };
    expect(() => validateSponsoredCalls([bad], account, now)).to.throw("cannot transfer ETH");
    expect(tradeTokenAddresses("buy").input.toLowerCase()).to.equal(NARA_PAYMASTER_ADDRESSES.usdc);
  });

  it("decodes only Coinbase smart-account execute wrappers and hashes calls canonically", function () {
    const calls = lockCalls();
    const callData = accountInterface.encodeFunctionData(
      "executeBatch",
      [calls.map((call) => ({ target: call.to, value: call.value, data: call.data }))],
    );
    const decoded = decodeUserOperationCalls(callData);
    expect(sponsoredCallsHash(decoded)).to.equal(sponsoredCallsHash(calls));
    expect(() => decodeUserOperationCalls("0x12345678")).to.throw();
  });

  it("recognizes only explicit ERC-1967 or EIP-7702 implementation bindings", function () {
    const implementation = "1234567890abcdef1234567890abcdef12345678";
    expect(implementationFromAccountState(`0xef0100${implementation}`, null)).to.equal(`0x${implementation}`);
    expect(implementationFromAccountState("0x6000", `0x${"0".repeat(24)}${implementation}`)).to.equal(`0x${implementation}`);
    expect(implementationFromAccountState("0x6000", `0x${"0".repeat(64)}`)).to.equal(null);
    expect(implementationFromAccountState("0x6000", "0x1234")).to.equal(null);
  });

  it("keeps provider credentials server-side and requires tickets, KV, Base, and exact methods", function () {
    const server = readFileSync(resolve("tools/v4-test-console/functions/api/paymaster.js"), "utf8");
    expect(server).to.include("env.CDP_PAYMASTER_URL");
    expect(server).to.include("env.PAYMASTER_STATE");
    expect(server).to.include("createPublicClient");
    expect(server).to.include(".verifyMessage");
    expect(server).to.include("BASE_ACCOUNT_IMPLEMENTATION_CODE_HASH");
    expect(server).to.include("ERC1967_IMPLEMENTATION_SLOT");
    expect(server).to.include('userOperation.initCode !== "0x"');
    expect(server).to.include("naraTicket");
    expect(server).to.include("CF-Connecting-IP");
    expect(server).to.include("pm_getPaymasterStubData");
    expect(server).to.include("pm_getPaymasterData");
    expect(server).not.to.include("VITE_CDP_PAYMASTER_URL");
  });
});
