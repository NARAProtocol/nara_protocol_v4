import {
  decodeAbiParameters,
  decodeFunctionData,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toHex,
} from "viem";

export const BASE_CHAIN_ID_HEX = "0x2105";
export const ENTRY_POINT_V06 = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
export const NARA_PAYMASTER_ADDRESSES = Object.freeze({
  engine: "0x98ab6406d6b548f37def7110961bb45a399e5afc",
  nara: "0xb6333f5d4ced8dffa80f3f13697d6aa3bb3f19c1",
  usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  hook: "0x59aef9799dea01a7fb7da73bea10dfb08858a088",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
});

const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_NARA = 1_000_000_000n * 10n ** 18n;
const MAX_USDC = 1_000_000_000n * 10n ** 6n;
const MAX_ENGINE_VALUE = 100_000_000_000_000n; // 0.0001 ETH; gas sponsorship never supplies this value.
const MAX_DEADLINE_SECONDS = 15n * 60n;
const MAX_PERMIT_EXPIRY_SECONDS = 31n * 24n * 60n * 60n;

const accountAbi = parseAbi([
  "function execute(address target,uint256 value,bytes data) payable",
  "function executeBatch((address target,uint256 value,bytes data)[] calls) payable",
]);
const erc20Abi = parseAbi(["function approve(address spender,uint256 amount)"]);
const engineAbi = parseAbi([
  "function lock(uint256 amount,uint64 durationEpochs,uint256 minWeight) payable",
  "function claimRewards(uint256 positionId,address to)",
  "function unlock(uint256 positionId) payable",
]);
const permit2Abi = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const universalRouterAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const swapParameter = [{
  type: "tuple",
  components: [
    {
      name: "poolKey",
      type: "tuple",
      components: [
        { name: "currency0", type: "address" },
        { name: "currency1", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks", type: "address" },
      ],
    },
    { name: "zeroForOne", type: "bool" },
    { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" },
    { name: "hookData", type: "bytes" },
  ],
}];
const actionsAndParameters = parseAbiParameters("bytes actions, bytes[] parameters");
const addressAndAmount = parseAbiParameters("address currency, uint256 amount");

function lower(value) {
  return String(value).toLowerCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function amountCap(token) {
  if (lower(token) === NARA_PAYMASTER_ADDRESSES.nara) return MAX_NARA;
  if (lower(token) === NARA_PAYMASTER_ADDRESSES.usdc) return MAX_USDC;
  throw new Error("Token is outside the NARA production route.");
}

export function normalizeSponsoredCalls(calls) {
  assert(Array.isArray(calls) && calls.length > 0 && calls.length <= 3, "A sponsored action must contain one to three calls.");
  return calls.map((call) => {
    assert(call && /^0x[0-9a-fA-F]{40}$/.test(call.to), "Sponsored call target is invalid.");
    assert(typeof call.data === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(call.data), "Sponsored calldata is invalid.");
    let value;
    try {
      value = BigInt(call.value ?? 0);
    } catch {
      throw new Error("Sponsored call value is invalid.");
    }
    assert(value >= 0n, "Sponsored call value cannot be negative.");
    return {
      to: lower(call.to),
      value: `0x${value.toString(16)}`,
      data: lower(call.data),
    };
  });
}

export function sponsoredCallsHash(calls) {
  return keccak256(toHex(JSON.stringify(normalizeSponsoredCalls(calls))));
}

function validateTokenApproval(call) {
  const token = lower(call.to);
  assert(token === NARA_PAYMASTER_ADDRESSES.nara || token === NARA_PAYMASTER_ADDRESSES.usdc, "Approval token is not NARA or Base USDC.");
  assert(BigInt(call.value) === 0n, "Token approvals cannot transfer ETH.");
  const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
  assert(decoded.functionName === "approve", "Only ERC-20 approve is sponsorable.");
  const [spender, amount] = decoded.args;
  const normalizedSpender = lower(spender);
  assert(
    normalizedSpender === NARA_PAYMASTER_ADDRESSES.permit2
      || (token === NARA_PAYMASTER_ADDRESSES.nara && normalizedSpender === NARA_PAYMASTER_ADDRESSES.engine),
    "Approval spender is outside the NARA production route.",
  );
  assert(amount === 0n || amount === (1n << 256n) - 1n || amount <= amountCap(token), "Approval amount exceeds the policy limit.");
  return { type: "token-approval", token, spender: normalizedSpender, amount };
}

function validatePermit2Approval(call, nowSeconds) {
  assert(lower(call.to) === NARA_PAYMASTER_ADDRESSES.permit2, "Permit2 target does not match production.");
  assert(BigInt(call.value) === 0n, "Permit2 approval cannot transfer ETH.");
  const decoded = decodeFunctionData({ abi: permit2Abi, data: call.data });
  const [tokenAddress, spender, amount, expiration] = decoded.args;
  const token = lower(tokenAddress);
  assert(lower(spender) === NARA_PAYMASTER_ADDRESSES.universalRouter, "Permit2 spender is not the production Universal Router.");
  amountCap(token);
  if (amount === 0n) {
    assert(BigInt(expiration) === 0n, "A revoked Permit2 approval must also clear expiration.");
  } else {
    assert(amount === MAX_UINT160 || amount <= amountCap(token), "Permit2 amount exceeds the policy limit.");
    assert(BigInt(expiration) >= nowSeconds - 60n, "Permit2 approval is already expired.");
    assert(BigInt(expiration) <= nowSeconds + MAX_PERMIT_EXPIRY_SECONDS, "Permit2 approval exceeds 31 days.");
  }
  return { type: "permit2-approval", token, amount };
}

function validateEngineCall(call, sender) {
  assert(lower(call.to) === NARA_PAYMASTER_ADDRESSES.engine, "Engine target does not match production.");
  const value = BigInt(call.value);
  assert(value <= MAX_ENGINE_VALUE, "Engine ETH value exceeds the policy limit.");
  const decoded = decodeFunctionData({ abi: engineAbi, data: call.data });
  if (decoded.functionName === "lock") {
    const [amount, durationEpochs, minWeight] = decoded.args;
    assert(amount > 0n && amount <= MAX_NARA, "Lock amount exceeds the policy limit.");
    assert(durationEpochs >= 9n && durationEpochs <= 35_040n, "Lock duration is outside Engine bounds.");
    // NARAEngineModelLib caps the configured duration multiplier at 10x.
    assert(minWeight > 0n && minWeight <= amount * 10n, "Minimum lock weight is invalid.");
    return { type: "lock", token: NARA_PAYMASTER_ADDRESSES.nara, amount };
  }
  if (decoded.functionName === "claimRewards") {
    const [positionId, to] = decoded.args;
    assert(value === 0n, "Claim cannot transfer ETH.");
    assert(positionId > 0n && lower(to) === lower(sender), "Claim recipient must be the authenticated wallet.");
    return { type: "claim" };
  }
  if (decoded.functionName === "unlock") {
    assert(decoded.args[0] > 0n, "Unlock position ID is invalid.");
    return { type: "unlock" };
  }
  throw new Error("Engine method is not sponsorable.");
}

function validateRouterCall(call, nowSeconds) {
  assert(lower(call.to) === NARA_PAYMASTER_ADDRESSES.universalRouter, "Router target does not match production.");
  assert(BigInt(call.value) === 0n, "The NARA pool route cannot transfer ETH.");
  const decoded = decodeFunctionData({ abi: universalRouterAbi, data: call.data });
  const [commands, inputs, deadline] = decoded.args;
  assert(commands === "0x10" && inputs.length === 1, "Only the verified single v4 swap command is sponsorable.");
  assert(deadline >= nowSeconds - 60n && deadline <= nowSeconds + MAX_DEADLINE_SECONDS, "Swap deadline is outside the 15-minute policy window.");
  const [actions, parameters] = decodeAbiParameters(actionsAndParameters, inputs[0]);
  assert(actions === "0x060c0f" && parameters.length === 3, "Router actions do not match swap, settle, and take.");
  const [swap] = decodeAbiParameters(swapParameter, parameters[0]);
  const [settleCurrency, settleAmount] = decodeAbiParameters(addressAndAmount, parameters[1]);
  const [takeCurrency, takeAmount] = decodeAbiParameters(addressAndAmount, parameters[2]);
  const naraFirst = BigInt(NARA_PAYMASTER_ADDRESSES.nara) < BigInt(NARA_PAYMASTER_ADDRESSES.usdc);
  const expectedCurrency0 = naraFirst ? NARA_PAYMASTER_ADDRESSES.nara : NARA_PAYMASTER_ADDRESSES.usdc;
  const expectedCurrency1 = naraFirst ? NARA_PAYMASTER_ADDRESSES.usdc : NARA_PAYMASTER_ADDRESSES.nara;
  assert(lower(swap.poolKey.currency0) === expectedCurrency0 && lower(swap.poolKey.currency1) === expectedCurrency1, "Swap currencies do not match the production pool.");
  assert(swap.poolKey.fee === 3000 && swap.poolKey.tickSpacing === 60, "Swap pool configuration does not match production.");
  assert(lower(swap.poolKey.hooks) === NARA_PAYMASTER_ADDRESSES.hook && swap.hookData === "0x", "Swap hook does not match production.");
  const input = swap.zeroForOne ? expectedCurrency0 : expectedCurrency1;
  const output = swap.zeroForOne ? expectedCurrency1 : expectedCurrency0;
  assert(swap.amountIn > 0n && swap.amountIn <= amountCap(input), "Swap input exceeds the policy limit.");
  assert(swap.amountOutMinimum > 0n, "Swap must protect a non-zero output.");
  assert(lower(settleCurrency) === input && settleAmount === swap.amountIn, "Swap settlement does not match its input.");
  assert(lower(takeCurrency) === output && takeAmount === swap.amountOutMinimum, "Swap take does not match its protected output.");
  return {
    type: input === NARA_PAYMASTER_ADDRESSES.usdc ? "buy" : "sell",
    token: input,
    amount: swap.amountIn,
  };
}

export function validateSponsoredCalls(calls, sender, nowSeconds = BigInt(Math.floor(Date.now() / 1_000))) {
  assert(/^0x[0-9a-fA-F]{40}$/.test(sender), "Sponsored sender is invalid.");
  const normalized = normalizeSponsoredCalls(calls);
  const classified = normalized.map((call) => {
    const target = lower(call.to);
    if (target === NARA_PAYMASTER_ADDRESSES.engine) return validateEngineCall(call, sender);
    if (target === NARA_PAYMASTER_ADDRESSES.permit2) return validatePermit2Approval(call, nowSeconds);
    if (target === NARA_PAYMASTER_ADDRESSES.universalRouter) return validateRouterCall(call, nowSeconds);
    return validateTokenApproval(call);
  });
  const final = classified.at(-1);
  if (final.type === "lock") {
    assert(classified.length <= 2, "Lock sponsorship contains an unrelated call.");
    if (classified.length === 2) {
      const approval = classified[0];
      assert(
        approval.type === "token-approval"
          && approval.token === NARA_PAYMASTER_ADDRESSES.nara
          && approval.spender === NARA_PAYMASTER_ADDRESSES.engine
          && approval.amount === final.amount,
        "Lock approval must exactly match the locked NARA amount.",
      );
    }
    return { calls: normalized, kind: "lock" };
  }
  if (final.type === "claim" || final.type === "unlock") {
    assert(classified.length === 1, "Position sponsorship contains an unrelated call.");
    return { calls: normalized, kind: final.type };
  }
  if (final.type === "buy" || final.type === "sell") {
    const setup = classified.slice(0, -1);
    assert(setup.every((item) => item.type === "token-approval" || item.type === "permit2-approval"), "Trade setup contains an unrelated call.");
    assert(setup.every((item) => item.token === final.token), "Trade approvals must match the swap input token.");
    assert(setup.filter((item) => item.type === "token-approval").length <= 1, "Trade contains duplicate token approvals.");
    assert(setup.filter((item) => item.type === "permit2-approval").length <= 1, "Trade contains duplicate Permit2 approvals.");
    return { calls: normalized, kind: final.type };
  }
  throw new Error("Sponsored calls do not form a complete NARA action.");
}

export function decodeUserOperationCalls(callData) {
  const decoded = decodeFunctionData({ abi: accountAbi, data: callData });
  if (decoded.functionName === "execute") {
    return normalizeSponsoredCalls([{ to: decoded.args[0], value: decoded.args[1], data: decoded.args[2] }]);
  }
  if (decoded.functionName === "executeBatch") {
    return normalizeSponsoredCalls(decoded.args[0].map((call) => ({
      to: call.target,
      value: call.value,
      data: call.data,
    })));
  }
  throw new Error("Smart-account execution format is not supported.");
}

export function userOperationFingerprint(userOperation) {
  return keccak256(toHex(JSON.stringify({
    sender: lower(userOperation.sender),
    nonce: lower(userOperation.nonce),
    initCode: lower(userOperation.initCode ?? "0x"),
    callData: lower(userOperation.callData),
  })));
}
