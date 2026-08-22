import type { TradeAllowances } from "./trade";
import { reusableApprovalsReady } from "./trade";

export type SwapStep = "token-approval" | "router-approval" | "swap";

export type SwapExecutionPlan = {
  mode: "atomic" | "sequential";
  steps: readonly SwapStep[];
  walletConfirmations: number;
};

export function buildSwapExecutionPlan({
  amountIn,
  allowances,
  atomicSupported,
}: {
  amountIn: bigint;
  allowances: TradeAllowances | null;
  atomicSupported: boolean;
}): SwapExecutionPlan {
  if (amountIn <= 0n) {
    return { mode: "sequential", steps: [], walletConfirmations: 0 };
  }

  const ready = reusableApprovalsReady(allowances, amountIn);
  const steps: SwapStep[] = [];
  if (!ready.erc20) steps.push("token-approval");
  if (!ready.permit2) steps.push("router-approval");
  steps.push("swap");

  if (atomicSupported && steps.length > 1) {
    return { mode: "atomic", steps, walletConfirmations: 1 };
  }
  return { mode: "sequential", steps, walletConfirmations: steps.length };
}

export function swapStepLabel(step: SwapStep, inputSymbol: string): string {
  if (step === "token-approval") return `Allow ${inputSymbol}`;
  if (step === "router-approval") return "Allow this swap";
  return "Confirm swap";
}

export function nextSequentialSwapStep(plan: SwapExecutionPlan): SwapStep | null {
  return plan.mode === "sequential" ? plan.steps[0] ?? null : null;
}
