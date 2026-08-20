import {
  encodeAbiParameters,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { DEPLOYMENT, erc20Abi, hookAbi, v4QuoterAbi } from "./generated/contracts";

export type TradeDirection = "buy" | "sell";

export type TradeQuote = {
  amountIn: bigint;
  amountOut: bigint;
  feeAmount: bigint;
  effectiveFeeBps: bigint;
  marginalFeeBps: bigint;
  gasEstimate: bigint;
  blockNumber: bigint;
};

export type TradeAllowances = {
  erc20: bigint;
  permit2Amount: bigint;
  permit2Expiration: bigint;
  permit2Nonce: bigint;
  blockTimestamp: bigint;
};

export type TradeRouterCall = {
  commands: Hex;
  inputs: readonly Hex[];
  deadline: bigint;
};

export const TRADE = {
  buy: {
    inputSymbol: "USDC",
    inputDecimals: 6,
    outputSymbol: "NARA",
    outputDecimals: 18,
  },
  sell: {
    inputSymbol: "NARA",
    inputDecimals: 18,
    outputSymbol: "USDC",
    outputDecimals: 6,
  },
} as const;

const MAX_UINT128 = (1n << 128n) - 1n;
export const MAX_PERMIT2_ALLOWANCE = (1n << 160n) - 1n;
export const MAX_ERC20_ALLOWANCE = (1n << 256n) - 1n;
const V4_SWAP: Hex = "0x10";
const V4_ACTIONS: Hex = "0x060c0f";

export const PERMIT2_APPROVAL_LIFETIME = 30n * 24n * 60n * 60n;
export const SWAP_DEADLINE_SECONDS = 10n * 60n;

export const permit2Abi = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
]);

export const universalRouterAbi = parseAbi([
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
}] as const;

const addressAndAmount = parseAbiParameters("address currency, uint256 amount");
const actionsAndParameters = parseAbiParameters("bytes actions, bytes[] parameters");

function valueAt(value: unknown, name: string, index: number): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  const record = value as Record<string | number, unknown> | undefined;
  const entry = record?.[name] ?? record?.[index];
  return typeof entry === "bigint" ? entry : BigInt(String(entry ?? 0));
}

export function parseTradeAmount(direction: TradeDirection, value: string): bigint {
  return parseUnits(value || "0", TRADE[direction].inputDecimals);
}

export function minimumAfterSlippage(amountOut: bigint, slippageBps: bigint): bigint {
  if (slippageBps < 0n || slippageBps >= 10_000n) {
    throw new Error("Slippage must be between 0% and 99.99%.");
  }
  return (amountOut * (10_000n - slippageBps)) / 10_000n;
}

export function amountAfterNaraFee(amountIn: bigint, feeAmount: bigint): bigint {
  if (amountIn < 0n || feeAmount < 0n || feeAmount > amountIn) {
    throw new Error("NARA fee cannot exceed the supplied amount.");
  }
  return amountIn - feeAmount;
}

export function tradeTokenAddresses(direction: TradeDirection): {
  input: Address;
  output: Address;
} {
  return direction === "buy"
    ? { input: DEPLOYMENT.usdc, output: DEPLOYMENT.nara }
    : { input: DEPLOYMENT.nara, output: DEPLOYMENT.usdc };
}

export function reusableApprovalsReady(
  allowances: TradeAllowances | null,
  amountIn: bigint,
): { erc20: boolean; permit2: boolean } {
  if (!allowances || amountIn <= 0n) return { erc20: false, permit2: false };
  return {
    erc20: allowances.erc20 >= amountIn,
    permit2:
      allowances.permit2Amount >= amountIn
      && allowances.permit2Expiration > allowances.blockTimestamp + SWAP_DEADLINE_SECONDS,
  };
}

export async function readTradeAllowances(
  client: PublicClient,
  account: Address,
  direction: TradeDirection,
  throughBlock?: bigint,
): Promise<TradeAllowances> {
  const { input } = tradeTokenAddresses(direction);
  const blockNumber = throughBlock ?? await client.getBlockNumber();
  const [erc20, rawPermit2, block] = await Promise.all([
    client.readContract({
      address: input,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, DEPLOYMENT.permit2],
      blockNumber,
    }),
    client.readContract({
      address: DEPLOYMENT.permit2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [account, input, DEPLOYMENT.universalRouter],
      blockNumber,
    }),
    client.getBlock({ blockNumber }),
  ]);

  return {
    erc20: valueAt(erc20, "allowance", 0),
    permit2Amount: valueAt(rawPermit2, "amount", 0),
    permit2Expiration: valueAt(rawPermit2, "expiration", 1),
    permit2Nonce: valueAt(rawPermit2, "nonce", 2),
    blockTimestamp: block.timestamp,
  };
}

export async function verifyTradeDeployment(client: PublicClient): Promise<void> {
  const targets = [
    ["NARA", DEPLOYMENT.nara, DEPLOYMENT.codeHashes.nara],
    ["USDC", DEPLOYMENT.usdc, DEPLOYMENT.codeHashes.usdc],
    ["NARA hook", DEPLOYMENT.hook, DEPLOYMENT.codeHashes.hook],
    ["Permit2", DEPLOYMENT.permit2, DEPLOYMENT.codeHashes.permit2],
    ["Universal Router", DEPLOYMENT.universalRouter, DEPLOYMENT.codeHashes.universalRouter],
    ["v4 Quoter", DEPLOYMENT.quoter, DEPLOYMENT.codeHashes.quoter],
  ] as const;
  const codes = await Promise.all(
    targets.map(([, address]) => client.getBytecode({ address })),
  );
  targets.forEach(([label, , expected], index) => {
    const code = codes[index];
    if (!code || code === "0x") throw new Error(`${label} bytecode is missing.`);
    const actual = keccak256(code);
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`${label} bytecode does not match the approved production route.`);
    }
  });
}

export function buildTradeRouterCall(
  direction: TradeDirection,
  amountIn: bigint,
  amountOutMinimum: bigint,
  blockTimestamp: bigint,
): TradeRouterCall {
  if (amountIn <= 0n || amountIn > MAX_UINT128) throw new Error("Input exceeds router bounds.");
  if (amountOutMinimum <= 0n || amountOutMinimum > MAX_UINT128) {
    throw new Error("Protected output exceeds router bounds.");
  }
  if (amountIn > MAX_PERMIT2_ALLOWANCE) throw new Error("Input exceeds Permit2 bounds.");

  const { input, output } = tradeTokenAddresses(direction);
  const naraIsCurrency0 = BigInt(DEPLOYMENT.nara) < BigInt(DEPLOYMENT.usdc);
  const currency0 = naraIsCurrency0 ? DEPLOYMENT.nara : DEPLOYMENT.usdc;
  const currency1 = naraIsCurrency0 ? DEPLOYMENT.usdc : DEPLOYMENT.nara;
  const zeroForOne = direction === "buy" ? !naraIsCurrency0 : naraIsCurrency0;
  const swap = encodeAbiParameters(swapParameter, [{
    poolKey: {
      currency0,
      currency1,
      fee: DEPLOYMENT.poolFee,
      tickSpacing: DEPLOYMENT.tickSpacing,
      hooks: DEPLOYMENT.hook,
    },
    zeroForOne,
    amountIn,
    amountOutMinimum,
    hookData: "0x",
  }]);
  const settle = encodeAbiParameters(addressAndAmount, [input, amountIn]);
  const take = encodeAbiParameters(addressAndAmount, [output, amountOutMinimum]);
  const v4Input = encodeAbiParameters(actionsAndParameters, [
    V4_ACTIONS,
    [swap, settle, take],
  ]);

  return {
    commands: V4_SWAP,
    inputs: [v4Input],
    deadline: blockTimestamp + SWAP_DEADLINE_SECONDS,
  };
}

export async function quoteTrade(
  client: PublicClient,
  account: Address,
  direction: TradeDirection,
  amountIn: bigint,
): Promise<TradeQuote> {
  if (amountIn <= 0n) throw new Error("Enter an amount greater than zero.");
  if (amountIn > MAX_UINT128) throw new Error("Amount exceeds the router limit.");

  const naraIsCurrency0 = BigInt(DEPLOYMENT.nara) < BigInt(DEPLOYMENT.usdc);
  const currency0 = naraIsCurrency0 ? DEPLOYMENT.nara : DEPLOYMENT.usdc;
  const currency1 = naraIsCurrency0 ? DEPLOYMENT.usdc : DEPLOYMENT.nara;
  const isBuy = direction === "buy";
  const zeroForOne = isBuy ? !naraIsCurrency0 : naraIsCurrency0;
  const blockNumber = await client.getBlockNumber();

  const [rawFee, rawQuote] = await Promise.all([
    client.readContract({
      address: DEPLOYMENT.hook,
      abi: hookAbi,
      functionName: "quotePoolFeeDetailed",
      args: [isBuy, amountIn],
      blockNumber,
    }),
    client.simulateContract({
      account,
      address: DEPLOYMENT.quoter,
      abi: v4QuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{
        poolKey: {
          currency0,
          currency1,
          fee: DEPLOYMENT.poolFee,
          tickSpacing: DEPLOYMENT.tickSpacing,
          hooks: DEPLOYMENT.hook,
        },
        zeroForOne,
        exactAmount: amountIn,
        hookData: "0x",
      }],
      blockNumber,
    }),
  ]);

  const amountOut = valueAt(rawQuote.result, "amountOut", 0);
  if (amountOut <= 0n) throw new Error("The production quoter returned zero output.");
  const marginalFeeBps = valueAt(rawFee, "marginalFeeBps", 0);
  const effectiveFeeBps = valueAt(rawFee, "effectiveFeeBps", 1);
  const feeAmount = valueAt(rawFee, "feeAmount", 2);
  amountAfterNaraFee(amountIn, feeAmount);
  if (marginalFeeBps > 10_000n || effectiveFeeBps > 10_000n) {
    throw new Error("The production hook returned an invalid fee rate.");
  }

  return {
    amountIn,
    amountOut,
    marginalFeeBps,
    effectiveFeeBps,
    feeAmount,
    gasEstimate: valueAt(rawQuote.result, "gasEstimate", 1),
    blockNumber,
  };
}
