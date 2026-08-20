export type ReadinessIntent = "buy" | "sell" | "lock" | "unlock";
export type ReadinessAction =
  | "none"
  | "switch-base"
  | "enter-amount"
  | "add-usdc"
  | "add-nara"
  | "add-base-eth";

export type ReadinessInput = {
  connected: boolean;
  onBase: boolean;
  loading: boolean;
  intent: ReadinessIntent;
  amount: bigint;
  assetBalance: bigint;
  ethBalance: bigint;
  protocolFeeWei: bigint;
  gasSponsored: boolean;
};

export type ReadinessResult = {
  state: "checking" | "blocked" | "ready";
  action: ReadinessAction;
  title: string;
  detail: string;
};

const intentLabels: Record<ReadinessIntent, string> = {
  buy: "buy",
  sell: "sell",
  lock: "lock",
  unlock: "unlock",
};

export function actionReadiness(input: ReadinessInput): ReadinessResult {
  if (!input.connected) {
    return {
      state: "blocked",
      action: "none",
      title: "Connect a wallet",
      detail: "The console checks Base balances before enabling an action.",
    };
  }
  if (!input.onBase) {
    return {
      state: "blocked",
      action: "switch-base",
      title: "Switch to Base",
      detail: "NARA transactions use Base network 8453.",
    };
  }
  if (input.loading) {
    return {
      state: "checking",
      action: "none",
      title: "Checking this wallet",
      detail: "Reading the latest Base balances and protocol fees.",
    };
  }
  if (input.intent !== "unlock" && input.amount <= 0n) {
    return {
      state: "blocked",
      action: "enter-amount",
      title: "Enter an amount",
      detail: `Choose the amount you want to ${intentLabels[input.intent]}.`,
    };
  }
  if (input.intent !== "unlock" && input.assetBalance < input.amount) {
    const asset = input.intent === "buy" ? "USDC" : "NARA";
    return {
      state: "blocked",
      action: asset === "USDC" ? "add-usdc" : "add-nara",
      title: `Add ${asset} on Base`,
      detail: `This wallet does not have enough ${asset} for the selected ${intentLabels[input.intent]}.`,
    };
  }

  // A paymaster can cover network gas but never the ETH sent as contract value.
  // Leave a non-zero balance above a flat Engine fee so an unsponsored fallback
  // never appears ready when it cannot pay gas.
  const requiredEthFloor = input.protocolFeeWei + (input.gasSponsored ? 0n : 1n);
  if (input.ethBalance < requiredEthFloor) {
    return {
      state: "blocked",
      action: "add-base-eth",
      title: "Add ETH on Base",
      detail: input.protocolFeeWei > 0n
        ? "This action includes an ETH-denominated Engine fee in addition to network gas."
        : "This wallet needs ETH on Base for network gas.",
    };
  }

  return {
    state: "ready",
    action: "none",
    title: `Ready to review ${intentLabels[input.intent]}`,
    detail: input.gasSponsored
      ? "Gas sponsorship is available. Final amounts are still checked before signing."
      : "The wallet will show the final network gas before signing.",
  };
}
