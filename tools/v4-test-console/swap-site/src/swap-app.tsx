import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useCapabilities,
  useChainId,
  useConnectorClient,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseAbiItem,
  parseEventLogs,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { simulateCalls, waitForCallsStatus } from "viem/actions";

import { BASE_CHAIN_ID, DEPLOYMENT, erc20Abi } from "../../src/generated/contracts";
import { externalFundingRoutes } from "../../src/funding";
import {
  atomicCallsStatus,
  buildWalletSendCallsRequest,
  walletCallsId,
  type SponsoredCall,
} from "../../src/sponsorship";
import {
  buildSwapExecutionPlan,
  nextSequentialSwapStep,
  swapStepLabel,
  type SwapStep,
} from "../../src/swap-flow";
import {
  buildTradeRouterCall,
  minimumAfterSlippage,
  parseTradeAmount,
  PERMIT2_APPROVAL_LIFETIME,
  permit2Abi,
  quoteTrade,
  readTradeAllowances,
  reusableApprovalsReady,
  TRADE,
  tradeTokenAddresses,
  universalRouterAbi,
  verifyTradeDeployment,
  type TradeAllowances,
  type TradeDirection,
  type TradeQuote,
} from "../../src/trade";
import { isBaseAccountConnector, walletErrorMessage } from "../../src/wallets";

type Balances = { nara: bigint; usdc: bigint; eth: bigint };
type ProgressStage = "checking" | "wallet" | "base" | "updated" | "error";
type Progress = {
  action: string;
  stage: ProgressStage;
  detail: string;
  hash?: Hash;
};
type StoredPending = {
  version: 1;
  address: Address;
  kind: "transaction" | "calls";
  id: string;
  action: string;
  startedAt: number;
};

class TrackedExecutionError extends Error {
  readonly hash?: Hash;
  readonly keepPending: boolean;
  readonly confirmed: boolean;

  constructor(
    message: string,
    options: { hash?: Hash; keepPending?: boolean; confirmed?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "TrackedExecutionError";
    this.hash = options.hash;
    this.keepPending = options.keepPending ?? false;
    this.confirmed = options.confirmed ?? false;
  }
}

const ZERO_BALANCES: Balances = { nara: 0n, usdc: 0n, eth: 0n };
const POOL_FEE_TAKEN = parseAbiItem(
  "event PoolFeeTaken(bytes32 indexed poolId, address indexed sender, address indexed currency, uint256 amountIn, uint256 feeAmount, uint16 feeBps, bool isBuy)",
);
const PENDING_KEY = "nara-swap-preview:pending:8453";
const ATOMIC_FALLBACK_PREFIX = "nara-swap-preview:step-by-step:8453:";

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function tokenAmount(value: bigint, decimals: number, maximumFractionDigits = 6): string {
  const raw = formatUnits(value, decimals);
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(numeric);
}

function percentFromBps(value: bigint): string {
  const whole = value / 100n;
  const fraction = value % 100n;
  return fraction === 0n ? `${whole}%` : `${whole}.${fraction.toString().padStart(2, "0")}%`;
}

function baseScanTx(hash: string): string {
  return `https://basescan.org/tx/${hash}`;
}

function parseAmount(direction: TradeDirection, value: string): bigint {
  try {
    return parseTradeAmount(direction, value.trim());
  } catch {
    return 0n;
  }
}

function pendingFromStorage(raw: string | null, address: Address): StoredPending | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredPending>;
    if (
      value.version !== 1
      || value.address?.toLowerCase() !== address.toLowerCase()
      || (value.kind !== "transaction" && value.kind !== "calls")
      || typeof value.id !== "string"
      || value.id.length < 3
      || typeof value.action !== "string"
      || typeof value.startedAt !== "number"
      || Date.now() - value.startedAt > 24 * 60 * 60 * 1_000
    ) return null;
    return value as StoredPending;
  } catch {
    return null;
  }
}

async function readBalances(
  client: PublicClient,
  address: Address,
  blockNumber?: bigint,
): Promise<Balances> {
  const [nara, usdc, eth] = await Promise.all([
    client.readContract({
      address: DEPLOYMENT.nara,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    }),
    client.readContract({
      address: DEPLOYMENT.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    }),
    client.getBalance({ address, blockNumber }),
  ]);
  return { nara: BigInt(nara), usdc: BigInt(usdc), eth };
}

function ProgressPanel({ progress, onDismiss }: {
  progress: Progress;
  onDismiss: () => void;
}) {
  const stages: Array<{ id: Exclude<ProgressStage, "error">; label: string }> = [
    { id: "checking", label: "Check" },
    { id: "wallet", label: "Wallet" },
    { id: "base", label: "Base" },
    { id: "updated", label: "Updated" },
  ];
  const stageIndex = stages.findIndex((item) => item.id === progress.stage);
  return (
    <section className={`progress-panel progress-${progress.stage}`} aria-live="polite">
      <div className="progress-heading">
        <div>
          <span className="eyebrow">{progress.stage === "error" ? "Action stopped" : progress.action}</span>
          <h2>{progress.stage === "updated"
            ? "Complete"
            : progress.stage === "error"
              ? progress.hash ? "Check before retrying" : "Stopped before submission"
              : "In progress"}</h2>
        </div>
        {(progress.stage === "updated" || progress.stage === "error") ? (
          <button className="text-button" type="button" onClick={onDismiss}>Dismiss</button>
        ) : <span className="live-dot" aria-label="Working" />}
      </div>
      <div className="progress-steps" aria-label="Transaction progress">
        {stages.map((stage, index) => (
          <span
            key={stage.id}
            className={progress.stage !== "error" && index <= stageIndex ? "done" : ""}
          >
            <i aria-hidden="true">{progress.stage !== "error" && index <= stageIndex ? "✓" : index + 1}</i>
            {stage.label}
          </span>
        ))}
      </div>
      <p>{progress.detail}</p>
      {progress.hash ? (
        <a href={baseScanTx(progress.hash)} target="_blank" rel="noreferrer">View transaction on BaseScan ↗</a>
      ) : null}
    </section>
  );
}

export default function SwapApp() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { data: connectorClient } = useConnectorClient({ chainId: BASE_CHAIN_ID });
  const { data: walletCapabilities } = useCapabilities({
    account: address,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address },
  });
  const { switchChainAsync } = useSwitchChain();
  const { disconnectAsync } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [amountInput, setAmountInput] = useState("");
  const [slippageBps, setSlippageBps] = useState(100n);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [allowances, setAllowances] = useState<TradeAllowances | null>(null);
  const [balances, setBalances] = useState<Balances>(ZERO_BALANCES);
  const [routeState, setRouteState] = useState<"checking" | "verified" | "error">("checking");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [atomicFallback, setAtomicFallback] = useState(false);
  const [fundingOpen, setFundingOpen] = useState(false);
  const quoteRequestRef = useRef(0);
  const actionLockRef = useRef(false);
  const resumedAddressRef = useRef<string | null>(null);

  const connectedWithBaseAccount = isBaseAccountConnector(connector);
  const onBase = chainId === BASE_CHAIN_ID;
  const config = TRADE[direction];
  const parsedAmount = useMemo(
    () => parseAmount(direction, amountInput),
    [amountInput, direction],
  );
  const inputBalance = direction === "buy" ? balances.usdc : balances.nara;
  const protectedMinimum = quote
    ? minimumAfterSlippage(quote.amountOut, slippageBps)
    : 0n;
  const atomicSupported = !!connectorClient
    && atomicCallsStatus(walletCapabilities) === "supported"
    && !atomicFallback
    && !connectedWithBaseAccount;
  const executionPlan = useMemo(() => buildSwapExecutionPlan({
    amountIn: parsedAmount,
    allowances,
    atomicSupported,
  }), [allowances, atomicSupported, parsedAmount]);
  const nextStep = nextSequentialSwapStep(executionPlan);
  const busy = !!progress && !["updated", "error"].includes(progress.stage);
  const enoughBalance = parsedAmount > 0n && inputBalance >= parsedAmount;
  const canReview = !!address
    && onBase
    && !connectedWithBaseAccount
    && routeState === "verified"
    && !!quote
    && quote.amountIn === parsedAmount
    && enoughBalance
    && !busy;

  const storePending = useCallback((pending: StoredPending) => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }, []);

  const clearPending = useCallback(() => {
    localStorage.removeItem(PENDING_KEY);
  }, []);

  const refreshWallet = useCallback(async (throughBlock?: bigint) => {
    if (!client || !address) return;
    const blockNumber = throughBlock ?? await client.getBlockNumber();
    const [nextBalances, nextAllowances] = await Promise.all([
      readBalances(client, address, blockNumber),
      readTradeAllowances(client, address, direction, blockNumber),
    ]);
    setBalances(nextBalances);
    setAllowances(nextAllowances);
  }, [address, client, direction]);

  useEffect(() => {
    if (!client) return;
    let live = true;
    setRouteState("checking");
    setRouteError(null);
    void verifyTradeDeployment(client)
      .then(() => { if (live) setRouteState("verified"); })
      .catch((error) => {
        if (!live) return;
        setRouteState("error");
        setRouteError(walletErrorMessage(error));
      });
    return () => { live = false; };
  }, [client]);

  useEffect(() => {
    if (!address || !client || !onBase || connectedWithBaseAccount) {
      setBalances(ZERO_BALANCES);
      setAllowances(null);
      return;
    }
    void refreshWallet().catch((error) => setQuoteError(walletErrorMessage(error)));
  }, [address, client, connectedWithBaseAccount, onBase, refreshWallet]);

  useEffect(() => {
    setReviewing(false);
    setQuote(null);
    setQuoteError(null);
    setAmountInput("");
    setFundingOpen(false);
  }, [direction]);

  useEffect(() => {
    if (!address) {
      setAtomicFallback(false);
      return;
    }
    setAtomicFallback(localStorage.getItem(`${ATOMIC_FALLBACK_PREFIX}${address.toLowerCase()}`) === "1");
  }, [address]);

  useEffect(() => {
    const requestId = ++quoteRequestRef.current;
    if (
      !client
      || !address
      || !onBase
      || connectedWithBaseAccount
      || routeState !== "verified"
      || parsedAmount <= 0n
    ) {
      setQuote(null);
      setQuoteLoading(false);
      if (parsedAmount <= 0n) setQuoteError(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    const timer = window.setTimeout(() => {
      void quoteTrade(client, address, direction, parsedAmount)
        .then((nextQuote) => {
          if (quoteRequestRef.current !== requestId) return;
          setQuote(nextQuote);
          setQuoteLoading(false);
        })
        .catch((error) => {
          if (quoteRequestRef.current !== requestId) return;
          setQuote(null);
          setQuoteError(walletErrorMessage(error));
          setQuoteLoading(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [address, client, connectedWithBaseAccount, direction, onBase, parsedAmount, routeState]);

  const waitForTransaction = useCallback(async (action: string, hash: Hash) => {
    if (!client || !address) throw new Error("Base status is unavailable.");
    storePending({
      version: 1,
      address,
      kind: "transaction",
      id: hash,
      action,
      startedAt: Date.now(),
    });
    setProgress({
      action,
      stage: "base",
      detail: "Wallet confirmed. Base is processing the transaction; do not submit it again.",
      hash,
    });
    let receipt;
    try {
      receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180_000,
      });
    } catch (error) {
      setProgress({
        action,
        stage: "base",
        detail: "The status check paused. This transaction may still be pending; do not submit it again.",
        hash,
      });
      throw new TrackedExecutionError("Transaction status is not yet known.", {
        hash,
        keepPending: true,
        cause: error,
      });
    }
    if (receipt.status !== "success") {
      clearPending();
      throw new TrackedExecutionError("Base confirmed that the transaction reverted.", { hash });
    }
    clearPending();
    setProgress({
      action,
      stage: "base",
      detail: `Confirmed in Base block ${receipt.blockNumber}. Updating balances and permissions.`,
      hash,
    });
    return receipt;
  }, [address, clearPending, client, storePending]);

  const waitForAtomic = useCallback(async (action: string, id: string) => {
    if (!address || !client || !connectorClient) throw new Error("Wallet status is unavailable.");
    storePending({
      version: 1,
      address,
      kind: "calls",
      id,
      action,
      startedAt: Date.now(),
    });
    setProgress({
      action,
      stage: "base",
      detail: "Wallet confirmed. Base is processing the complete swap; do not submit it again.",
    });
    let status;
    try {
      status = await waitForCallsStatus(connectorClient, {
        id,
        pollingInterval: 1_500,
        timeout: 180_000,
        throwOnFailure: false,
      });
    } catch (error) {
      throw new TrackedExecutionError("Atomic swap status is not yet known.", {
        keepPending: true,
        cause: error,
      });
    }
    if (status.status === "failure") {
      clearPending();
      throw new Error("The wallet reports that the atomic swap failed.");
    }
    if (status.status !== "success") {
      throw new TrackedExecutionError("The swap is still pending.", { keepPending: true });
    }
    const hash = status.receipts?.find((item) => item.transactionHash)?.transactionHash;
    if (!hash) {
      throw new TrackedExecutionError(
        "Base confirmed the action, but the wallet has not returned its transaction hash.",
        { keepPending: true },
      );
    }
    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash });
    } catch (error) {
      throw new TrackedExecutionError("The transaction receipt is not available yet.", {
        hash,
        keepPending: true,
        cause: error,
      });
    }
    if (receipt.status !== "success") {
      clearPending();
      throw new TrackedExecutionError("Base confirmed that the atomic swap reverted.", { hash });
    }
    clearPending();
    setProgress({
      action,
      stage: "base",
      detail: `Confirmed in Base block ${receipt.blockNumber}. Updating the received amount.`,
      hash,
    });
    return receipt;
  }, [address, clearPending, client, connectorClient, storePending]);

  useEffect(() => {
    if (!address || !client || busy) return;
    const resumeAddress = address.toLowerCase();
    if (resumedAddressRef.current === resumeAddress) return;
    resumedAddressRef.current = resumeAddress;
    const stored = pendingFromStorage(localStorage.getItem(PENDING_KEY), address);
    if (!stored) return;
    setProgress({
      action: stored.action,
      stage: "base",
      detail: "Restored after reload. Checking the existing Base action before another can be submitted.",
      ...(stored.kind === "transaction" ? { hash: stored.id as Hash } : {}),
    });
    void (async () => {
      try {
        const receipt = stored.kind === "transaction"
          ? await waitForTransaction(stored.action, stored.id as Hash)
          : await waitForAtomic(stored.action, stored.id);
        await refreshWallet(receipt.blockNumber);
        setAmountInput("");
        setQuote(null);
        setReviewing(false);
        setProgress({
          action: stored.action,
          stage: "updated",
          detail: "The existing transaction is confirmed and wallet balances are updated.",
          hash: receipt.transactionHash,
        });
      } catch (error) {
        if (error instanceof TrackedExecutionError && error.keepPending) return;
        setProgress({
          action: stored.action,
          stage: "error",
          detail: `The existing action could not be reconciled. Check its status before retrying. ${walletErrorMessage(error)}`,
          ...(error instanceof TrackedExecutionError && error.hash
            ? { hash: error.hash }
            : stored.kind === "transaction" ? { hash: stored.id as Hash } : {}),
        });
      }
    })();
  }, [address, busy, client, refreshWallet, waitForAtomic, waitForTransaction]);

  const markError = useCallback((action: string, error: unknown, hash?: Hash) => {
    setProgress({
      action,
      stage: "error",
      detail: hash
        ? `The result is not confirmed. Check BaseScan before trying again. ${walletErrorMessage(error)}`
        : `Nothing was submitted. ${walletErrorMessage(error)}`,
      hash,
    });
  }, []);

  const makeRouterData = useCallback(async (
    liveQuote: TradeQuote,
    amountIn: bigint,
    minimumOut: bigint,
  ) => {
    if (!client) throw new Error("Base route is unavailable.");
    const block = await client.getBlock({ blockTag: "latest" });
    const routerCall = buildTradeRouterCall(
      direction,
      amountIn,
      minimumOut,
      block.timestamp,
    );
    if (liveQuote.amountIn !== amountIn) throw new Error("The quote amount changed.");
    return {
      routerCall,
      data: encodeFunctionData({
        abi: universalRouterAbi,
        functionName: "execute",
        args: [routerCall.commands, [...routerCall.inputs], routerCall.deadline],
      }),
    };
  }, [client, direction]);

  const finishSwap = useCallback(async ({
    receipt,
    amountIn,
    outputBefore,
    minimumOut,
    quotedFee,
  }: {
    receipt: Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>;
    amountIn: bigint;
    outputBefore: bigint;
    minimumOut: bigint;
    quotedFee: bigint;
  }) => {
    if (!client || !address) throw new Error("Confirmed swap could not be reconciled.");
    // Base has already confirmed the submitted intent. Consume it before any
    // follow-up read so an RPC timeout can never expose the same swap again.
    setAmountInput("");
    setQuote(null);
    setReviewing(false);
    const { output } = tradeTokenAddresses(direction);
    const outputAfter = BigInt(await client.readContract({
      address: output,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber: receipt.blockNumber,
    }));
    const received = outputAfter >= outputBefore ? outputAfter - outputBefore : 0n;
    if (received < minimumOut) throw new Error("Confirmed output did not match the protected minimum.");

    const feeLogs = parseEventLogs({
      abi: [POOL_FEE_TAKEN],
      eventName: "PoolFeeTaken",
      logs: receipt.logs.filter((log) => log.address.toLowerCase() === DEPLOYMENT.hook.toLowerCase()),
      strict: true,
    });
    const feeArgs = feeLogs[0]?.args as { feeAmount?: bigint; amountIn?: bigint } | undefined;
    const executedFee = feeArgs?.amountIn === amountIn ? feeArgs.feeAmount ?? quotedFee : quotedFee;

    await refreshWallet(receipt.blockNumber);
    setProgress({
      action: `${config.inputSymbol} → ${config.outputSymbol}`,
      stage: "updated",
      detail: `Received ${tokenAmount(received, config.outputDecimals)} ${config.outputSymbol}. NARA fee paid: ${tokenAmount(executedFee, config.inputDecimals)} ${config.inputSymbol}. Enter a new amount to swap again.`,
      hash: receipt.transactionHash,
    });
  }, [address, client, config.inputDecimals, config.inputSymbol, config.outputDecimals, config.outputSymbol, direction, refreshWallet]);

  const executeSequentialStep = useCallback(async (step: SwapStep) => {
    if (!client || !address || parsedAmount <= 0n) return;
    const action = swapStepLabel(step, config.inputSymbol);
    const { input, output } = tradeTokenAddresses(direction);
    setProgress({ action, stage: "checking", detail: "Checking the current route, balance, and access before opening the wallet." });
    await verifyTradeDeployment(client);
    const blockNumber = await client.getBlockNumber();
    const [liveBalances, liveAllowances] = await Promise.all([
      readBalances(client, address, blockNumber),
      readTradeAllowances(client, address, direction, blockNumber),
    ]);
    const liveInput = direction === "buy" ? liveBalances.usdc : liveBalances.nara;
    if (liveInput < parsedAmount) throw new Error(`Wallet has insufficient ${config.inputSymbol}.`);
    const ready = reusableApprovalsReady(liveAllowances, parsedAmount);
    setBalances(liveBalances);
    setAllowances(liveAllowances);

    if (step === "token-approval") {
      if (ready.erc20) throw new Error("Token access is already confirmed. Continue to the next action.");
      const simulation = await client.simulateContract({
        account: address,
        address: input,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEPLOYMENT.permit2, parsedAmount],
      });
      setProgress({ action, stage: "wallet", detail: `Approve exactly ${tokenAmount(parsedAmount, config.inputDecimals)} ${config.inputSymbol} in your wallet. No swap happens in this step.` });
      const hash = await writeContractAsync(simulation.request);
      const receipt = await waitForTransaction(action, hash);
      try {
        await refreshWallet(receipt.blockNumber);
      } catch (error) {
        throw new TrackedExecutionError(
          "The approval is confirmed, but the wallet state could not refresh. Do not repeat it; reload to reconcile.",
          { hash, confirmed: true, cause: error },
        );
      }
      setProgress({
        action,
        stage: "updated",
        detail: `${config.inputSymbol} access is confirmed. The next button is a different action: allow this swap through the verified router.`,
        hash,
      });
      return;
    }

    if (step === "router-approval") {
      if (!ready.erc20) throw new Error(`Allow ${config.inputSymbol} first.`);
      if (ready.permit2) throw new Error("Swap access is already confirmed. Continue to the swap.");
      const block = await client.getBlock({ blockNumber });
      const expiration = block.timestamp + PERMIT2_APPROVAL_LIFETIME;
      const simulation = await client.simulateContract({
        account: address,
        address: DEPLOYMENT.permit2,
        abi: permit2Abi,
        functionName: "approve",
        args: [input, DEPLOYMENT.universalRouter, parsedAmount, expiration],
      });
      setProgress({ action, stage: "wallet", detail: `Allow the verified router to use exactly ${tokenAmount(parsedAmount, config.inputDecimals)} ${config.inputSymbol}. No swap happens in this step.` });
      const hash = await writeContractAsync(simulation.request);
      const receipt = await waitForTransaction(action, hash);
      try {
        await refreshWallet(receipt.blockNumber);
      } catch (error) {
        throw new TrackedExecutionError(
          "The router approval is confirmed, but the wallet state could not refresh. Do not repeat it; reload to reconcile.",
          { hash, confirmed: true, cause: error },
        );
      }
      setProgress({
        action,
        stage: "updated",
        detail: "Swap access is confirmed. The next button submits the reviewed swap.",
        hash,
      });
      return;
    }

    if (!ready.erc20 || !ready.permit2) throw new Error("Trading access changed. Complete the visible setup step first.");
    const outputBefore = BigInt(await client.readContract({
      address: output,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    }));
    const freshQuote = await quoteTrade(client, address, direction, parsedAmount);
    const minimumOut = minimumAfterSlippage(freshQuote.amountOut, slippageBps);
    const router = await makeRouterData(freshQuote, parsedAmount, minimumOut);
    const simulation = await client.simulateContract({
      account: address,
      address: DEPLOYMENT.universalRouter,
      abi: universalRouterAbi,
      functionName: "execute",
      args: [router.routerCall.commands, [...router.routerCall.inputs], router.routerCall.deadline],
    });
    setProgress({ action, stage: "wallet", detail: "The final quote passed simulation. Confirm or reject this swap in your wallet." });
    const hash = await writeContractAsync(simulation.request);
    const receipt = await waitForTransaction(action, hash);
    try {
      await finishSwap({
        receipt,
        amountIn: parsedAmount,
        outputBefore,
        minimumOut,
        quotedFee: freshQuote.feeAmount,
      });
    } catch (error) {
      throw new TrackedExecutionError(
        "The swap is confirmed, but the received amount could not be displayed. Do not repeat it; use BaseScan and reload.",
        { hash, confirmed: true, cause: error },
      );
    }
  }, [address, client, config.inputDecimals, config.inputSymbol, direction, finishSwap, makeRouterData, parsedAmount, refreshWallet, slippageBps, waitForTransaction, writeContractAsync]);

  const executeAtomicSwap = useCallback(async () => {
    if (!client || !connectorClient || !address || parsedAmount <= 0n) return;
    const action = `${config.inputSymbol} → ${config.outputSymbol}`;
    const { input, output } = tradeTokenAddresses(direction);
    setProgress({ action, stage: "checking", detail: "Refreshing and simulating the complete approval-and-swap action." });
    await verifyTradeDeployment(client);
    const blockNumber = await client.getBlockNumber();
    const [liveBalances, liveAllowances, outputBefore] = await Promise.all([
      readBalances(client, address, blockNumber),
      readTradeAllowances(client, address, direction, blockNumber),
      client.readContract({
        address: output,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
    ]);
    const liveInput = direction === "buy" ? liveBalances.usdc : liveBalances.nara;
    if (liveInput < parsedAmount) throw new Error(`Wallet has insufficient ${config.inputSymbol}.`);
    const ready = reusableApprovalsReady(liveAllowances, parsedAmount);
    const freshQuote = await quoteTrade(client, address, direction, parsedAmount);
    const minimumOut = minimumAfterSlippage(freshQuote.amountOut, slippageBps);
    const router = await makeRouterData(freshQuote, parsedAmount, minimumOut);
    const calls: SponsoredCall[] = [];
    if (!ready.erc20) {
      calls.push({
        to: input,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [DEPLOYMENT.permit2, parsedAmount],
        }),
      });
    }
    if (!ready.permit2) {
      calls.push({
        to: DEPLOYMENT.permit2,
        data: encodeFunctionData({
          abi: permit2Abi,
          functionName: "approve",
          args: [input, DEPLOYMENT.universalRouter, parsedAmount, router.routerCall.deadline],
        }),
      });
    }
    calls.push({ to: DEPLOYMENT.universalRouter, data: router.data });
    const simulation = await simulateCalls(client, {
      account: address,
      calls,
      validation: true,
    });
    const failed = simulation.results.find((result) => result.status === "failure");
    if (failed) throw failed.error || new Error("The complete swap simulation failed.");
    setProgress({ action, stage: "wallet", detail: "One wallet confirmation includes the exact setup and reviewed swap. Confirm or reject it now." });

    let id: string;
    try {
      const response: unknown = await connectorClient.request(buildWalletSendCallsRequest({
        address,
        chainId: BASE_CHAIN_ID,
        calls,
      }) as never);
      id = walletCallsId(response);
    } catch (error) {
      setAtomicFallback(true);
      localStorage.setItem(`${ATOMIC_FALLBACK_PREFIX}${address.toLowerCase()}`, "1");
      throw new Error(`This wallet could not prepare one-step execution. Nothing was submitted. Step-by-step mode is now active. ${walletErrorMessage(error)}`, { cause: error });
    }

    const receipt = await waitForAtomic(action, id);
    try {
      await finishSwap({
        receipt,
        amountIn: parsedAmount,
        outputBefore: BigInt(outputBefore),
        minimumOut,
        quotedFee: freshQuote.feeAmount,
      });
    } catch (error) {
      throw new TrackedExecutionError(
        "The swap is confirmed, but the received amount could not be displayed. Do not repeat it; use BaseScan and reload.",
        { hash: receipt.transactionHash, confirmed: true, cause: error },
      );
    }
  }, [address, client, config.inputSymbol, connectorClient, direction, finishSwap, makeRouterData, parsedAmount, slippageBps, waitForAtomic]);

  const executeVisibleAction = useCallback(async () => {
    if (actionLockRef.current || !canReview) return;
    actionLockRef.current = true;
    const step = executionPlan.mode === "atomic" ? null : nextStep;
    const action = executionPlan.mode === "atomic"
      ? `${config.inputSymbol} → ${config.outputSymbol}`
      : swapStepLabel(step ?? "swap", config.inputSymbol);
    try {
      if (executionPlan.mode === "atomic") await executeAtomicSwap();
      else if (step) await executeSequentialStep(step);
    } catch (error) {
      if (error instanceof TrackedExecutionError && error.keepPending) return;
      clearPending();
      markError(
        action,
        error,
        error instanceof TrackedExecutionError ? error.hash : undefined,
      );
    } finally {
      actionLockRef.current = false;
    }
  }, [canReview, clearPending, config.inputSymbol, config.outputSymbol, executeAtomicSwap, executeSequentialStep, executionPlan.mode, markError, nextStep]);

  function changeDirection(next: TradeDirection) {
    if (next === direction || busy) return;
    setDirection(next);
  }

  function fillMaximum() {
    if (busy) return;
    setAmountInput(formatUnits(inputBalance, config.inputDecimals));
  }

  const visibleActionLabel = executionPlan.mode === "atomic"
    ? "Confirm in wallet"
    : nextStep === "token-approval"
      ? `Allow ${config.inputSymbol} in wallet`
      : nextStep === "router-approval"
        ? "Allow this swap in wallet"
        : "Confirm swap in wallet";

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="NARA Swap home">
          <span>NARA</span>
          <strong>Swap</strong>
        </a>
        <ConnectButton
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
          chainStatus="icon"
          showBalance={false}
        />
      </header>

      <main>
        <section className="intro" aria-labelledby="swap-title">
          <span className="eyebrow">Base · verified v4 pool</span>
          <h1 id="swap-title">Swap NARA</h1>
          <p>One focused route. You choose the direction, amount, and wallet.</p>
        </section>

        <div className="status-strip" role="status">
          <span className={`status-light status-${routeState}`} aria-hidden="true" />
          <strong>{routeState === "verified" ? "Route verified" : routeState === "checking" ? "Checking route" : "Route stopped"}</strong>
          <span>{routeState === "verified" ? `Base ${BASE_CHAIN_ID}` : routeError || "Production contract check in progress"}</span>
        </div>

        {connectedWithBaseAccount ? (
          <section className="route-blocker" role="alert">
            <span className="eyebrow">Wallet route unavailable</span>
            <h2>Choose a wallet app</h2>
            <p>This passkey Base Account route failed before broadcast in mobile testing. NARA Swap will not ask you to repeat that broken signing flow.</p>
            <button type="button" className="primary" onClick={() => void disconnectAsync()}>
              Disconnect and choose wallet
            </button>
          </section>
        ) : (
          <section className="swap-layout">
            <div className="swap-card">
              <div className="direction-tabs" aria-label="Swap direction">
                <button
                  type="button"
                  className={direction === "buy" ? "active" : ""}
                  aria-pressed={direction === "buy"}
                  onClick={() => changeDirection("buy")}
                >Buy NARA</button>
                <button
                  type="button"
                  className={direction === "sell" ? "active" : ""}
                  aria-pressed={direction === "sell"}
                  onClick={() => changeDirection("sell")}
                >Sell NARA</button>
              </div>

              {!reviewing ? (
                <div className="composer">
                  <div className="amount-panel">
                    <div className="field-heading">
                      <label htmlFor="swap-amount">You pay</label>
                      {isConnected ? (
                        <button type="button" className="balance-button" onClick={fillMaximum}>
                          Balance {tokenAmount(inputBalance, config.inputDecimals)}
                        </button>
                      ) : <span>Connect to quote</span>}
                    </div>
                    <div className="amount-input-row">
                      <input
                        id="swap-amount"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={amountInput}
                        disabled={busy}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (/^\d*(\.\d*)?$/.test(value)) setAmountInput(value);
                        }}
                      />
                      <strong>{config.inputSymbol}</strong>
                    </div>
                  </div>

                  <div className="swap-arrow" aria-hidden="true">↓</div>

                  <div className="amount-panel output-panel">
                    <div className="field-heading"><span>You receive</span><span>Estimate</span></div>
                    <div className="amount-output">
                      <strong>{quoteLoading ? "Checking…" : quote ? tokenAmount(quote.amountOut, config.outputDecimals) : "—"}</strong>
                      <b>{config.outputSymbol}</b>
                    </div>
                  </div>

                  {quoteError ? <p className="inline-error" role="alert">{quoteError}</p> : null}
                  {parsedAmount > 0n && isConnected && !enoughBalance ? (
                    <div className="balance-warning">
                      <p>Not enough {config.inputSymbol} in this wallet.</p>
                      <button type="button" className="secondary" onClick={() => setFundingOpen((value) => !value)}>
                        Add {config.inputSymbol}
                      </button>
                    </div>
                  ) : null}

                  {fundingOpen && address ? (
                    <div className="funding-panel">
                      <div>
                        <span className="eyebrow">Receive on Base</span>
                        <code>{shortAddress(address)}</code>
                      </div>
                      <button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(address)}>Copy address</button>
                      {externalFundingRoutes(direction === "buy" ? "USDC" : "ETH").map((route) => (
                        <a key={route.id} href={route.url} target="_blank" rel="noreferrer">
                          <strong>{route.action} ↗</strong>
                          <span>{route.detail}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <div className="slippage-row">
                    <span>Slippage limit</span>
                    <div>
                      {[50n, 100n, 300n].map((value) => (
                        <button
                          key={value.toString()}
                          type="button"
                          className={slippageBps === value ? "active" : ""}
                          onClick={() => setSlippageBps(value)}
                        >{percentFromBps(value)}</button>
                      ))}
                    </div>
                  </div>

                  {quote ? (
                    <dl className="quote-summary">
                      <div><dt>NARA fee</dt><dd>{tokenAmount(quote.feeAmount, config.inputDecimals)} {config.inputSymbol} · {percentFromBps(quote.effectiveFeeBps)}</dd></div>
                      <div><dt>Minimum received</dt><dd>{tokenAmount(protectedMinimum, config.outputDecimals)} {config.outputSymbol}</dd></div>
                      <div><dt>Pool fee</dt><dd>{DEPLOYMENT.poolFee / 10_000}% · included</dd></div>
                    </dl>
                  ) : null}

                  {!isConnected ? (
                    <div className="connect-prompt">
                      <ConnectButton label="Connect wallet to swap" />
                      <small>Wallet apps and browser wallets are supported. The failing mobile passkey route is excluded.</small>
                    </div>
                  ) : !onBase ? (
                    <button className="primary full" type="button" onClick={() => void switchChainAsync({ chainId: BASE_CHAIN_ID })}>
                      Switch to Base
                    </button>
                  ) : (
                    <button
                      className="primary full"
                      type="button"
                      disabled={!canReview}
                      onClick={() => setReviewing(true)}
                    >{quoteLoading ? "Checking quote…" : "Review swap"}</button>
                  )}
                </div>
              ) : quote && address ? (
                <div className="review-panel">
                  <button className="back-button" type="button" disabled={busy} onClick={() => setReviewing(false)}>← Edit amount</button>
                  <span className="eyebrow">Transaction review</span>
                  <h2>{direction === "buy" ? "Buy NARA with USDC" : "Sell NARA for USDC"}</h2>

                  <dl className="review-table">
                    <div><dt>Wallet</dt><dd className="address-value">{address}</dd></div>
                    <div><dt>You pay</dt><dd>{tokenAmount(parsedAmount, config.inputDecimals)} {config.inputSymbol}</dd></div>
                    <div><dt>NARA fee deducted</dt><dd>−{tokenAmount(quote.feeAmount, config.inputDecimals)} {config.inputSymbol} · {percentFromBps(quote.effectiveFeeBps)}</dd></div>
                    <div><dt>Current estimated output</dt><dd>{tokenAmount(quote.amountOut, config.outputDecimals)} {config.outputSymbol}</dd></div>
                    <div><dt>Minimum received</dt><dd>{tokenAmount(protectedMinimum, config.outputDecimals)} {config.outputSymbol}</dd></div>
                    <div><dt>Slippage limit</dt><dd>{percentFromBps(slippageBps)}</dd></div>
                    <div><dt>Network gas</dt><dd>Shown by wallet</dd></div>
                    <div><dt>Wallet confirmations</dt><dd>{executionPlan.walletConfirmations}{executionPlan.mode === "atomic" ? " · one complete action" : " · step by step"}</dd></div>
                  </dl>

                  <div className="execution-path">
                    <span className="eyebrow">Execution path</span>
                    <ol>
                      {executionPlan.steps.map((step, index) => (
                        <li key={step} className={executionPlan.mode === "atomic" || index === 0 ? "current" : ""}>
                          <span>{index + 1}</span>
                          <div><strong>{swapStepLabel(step, config.inputSymbol)}</strong><small>{step === "swap" ? "Fresh quote and simulation before signature" : "Exact amount only; never unlimited"}</small></div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <p className="risk-note">Output can change before confirmation. The swap reverts if it returns less than the minimum above. Review every wallet request before signing.</p>

                  <button
                    className="primary full"
                    type="button"
                    disabled={busy || !canReview}
                    onClick={() => void executeVisibleAction()}
                  >{busy ? "Finish in wallet" : visibleActionLabel}</button>
                  <small className="action-caption">
                    {executionPlan.mode === "atomic"
                      ? "Approvals and swap either all succeed or all revert."
                      : nextStep === "swap"
                        ? "This action submits the swap."
                        : "This setup action does not submit a swap. Return here for the next clearly labeled action."}
                  </small>
                </div>
              ) : null}
            </div>

            <aside className="wallet-card">
              <span className="eyebrow">Connected wallet</span>
              <h2>{address ? shortAddress(address) : "Not connected"}</h2>
              {address ? (
                <div className="full-wallet-address">
                  <code>{address}</code>
                  <button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(address)}>Copy</button>
                </div>
              ) : null}
              <dl>
                <div><dt>USDC</dt><dd>{tokenAmount(balances.usdc, 6)}</dd></div>
                <div><dt>NARA</dt><dd>{tokenAmount(balances.nara, 18)}</dd></div>
                <div><dt>ETH for gas</dt><dd>{Number(formatEther(balances.eth)).toFixed(5)}</dd></div>
              </dl>
              {atomicSupported ? <p className="wallet-mode">One-step execution available</p> : address ? <p className="wallet-mode">Clear step-by-step execution</p> : null}
              {atomicFallback && address ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    localStorage.removeItem(`${ATOMIC_FALLBACK_PREFIX}${address.toLowerCase()}`);
                    setAtomicFallback(false);
                  }}
                >Try one-step mode again</button>
              ) : null}
            </aside>
          </section>
        )}

        {progress ? <ProgressPanel progress={progress} onDismiss={() => setProgress(null)} /> : null}
      </main>

      <footer>
        <span>NARA v4 · Base</span>
        <a href={`https://basescan.org/address/${DEPLOYMENT.hook}`} target="_blank" rel="noreferrer">Verified pool hook ↗</a>
      </footer>
    </div>
  );
}
