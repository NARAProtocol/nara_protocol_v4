import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useCapabilities,
  useChainId,
  useConnect,
  useConnectorClient,
  useDisconnect,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  keccak256,
  parseAbiItem,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { simulateCalls, waitForCallsStatus } from "viem/actions";

import { BASE_CHAIN_ID, DEPLOYMENT, engineAbi, erc20Abi } from "./generated/contracts";
import { NftTab } from "./nft-tab";
import { waitForConfirmedBlockState } from "./confirmed-block";

import { tokenFeeBreakdown } from "./fees";
import {
  externalFundingRoutes,
  fundingButtonLabel,
  fundingIntentStorageKey,
  parseSavedFundingIntent,
  type FundingAsset,
  type SavedFundingIntent,
} from "./funding";
import { actionReadiness, type ReadinessResult } from "./readiness";
import { readMarketValuation, type MarketValuation } from "./market";
import {
  amountAfterNaraFee,
  buildTradeRouterCall,
  MAX_ERC20_ALLOWANCE,
  MAX_PERMIT2_ALLOWANCE,
  minimumAfterSlippage,
  PERMIT2_APPROVAL_LIFETIME,
  permit2Abi,
  parseTradeAmount,
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
} from "./trade";
import { TransactionProgressDock } from "./transaction-progress-dock";
import { formatTimestampSeconds as dateTime } from "./time";
import {
  atomicCallsStatus,
  buildWalletSendCallsRequest,
  isAtomicSimulationGasValidationError,
  parseStoredPendingCalls,
  pendingCallsStorageKey,
  readSponsorshipAvailability,
  requestSponsorshipTicket,
  supportsAtomicCalls,
  supportsSponsoredAtomicCalls,
  tradeAtomicCompatibilityStorageKey,
  walletCallsId,
  type SponsoredCall,
  type StoredPendingCalls,
} from "./sponsorship";
import {
  isBaseAccountConnector,
  isCoinbaseBrowserEnvironment,
  needsBaseAccountActivation,
  walletErrorDiagnostic,
  walletErrorMessage,
} from "./wallets";

const MOBILE_PREVIEW_URL = "https://app.naraprotocol.com";
import {
  parseStoredPendingTransaction,
  pendingTransactionStorageKey,
  progressButtonLabel,
  shouldApplyReadSnapshot,
  shouldCloseReviewForProgress,
  shouldDismissProgressForReview,
  type TransactionProgress,
  type StoredPendingTransaction,
} from "./transaction-progress";

type Tab = "overview" | "positions" | "trade" | "nfts";
type Flash = { tone: "success" | "error" | "info"; message: string };
type BaseAccountProvisioningState = "not-base" | "checking" | "required" | "ready" | "unknown";
type BaseAccountProvisioningCheck = {
  address: Address | null;
  state: BaseAccountProvisioningState;
};

type ProtocolState = {
  blockNumber: bigint;
  engineCodeVerified: boolean;
  tokenCodeVerified: boolean;
  currentEpoch: bigint;
  storedEpoch: bigint;
  genesisTimestamp: bigint;
  epochLength: bigint;
  totalLocked: bigint;
  activeTotalWeight: bigint;
  nextPositionId: bigint;
  lockFeeWei: bigint;
  unlockFeeWei: bigint;
  lockFeeBps: bigint;
  claimFeeBps: bigint;
  durationLinearWad: bigint;
  durationQuadraticWad: bigint;
  activationDelayEpochs: bigint;
  maxLockEpochs: bigint;
  naraBalance: bigint;
  usdcBalance: bigint;
  ethBalance: bigint;
  allowance: bigint;
  market: MarketValuation | null;
  marketReadError: string | null;
};

type Position = {
  id: bigint;
  owner: Address;
  createdEpoch: bigint;
  amount: bigint;
  weight: bigint;
  activationEpoch: bigint;
  unlockEpoch: bigint;
  claimableNara: bigint;
  claimableEth: bigint;
};

type PositionReview = {
  kind: "claim" | "unlock";
  position: Position;
};

const lockedEvent = parseAbiItem(
  "event Locked(address indexed owner, uint256 indexed positionId, uint256 amount, uint64 activationEpoch, uint64 unlockEpoch, uint256 weight)",
);

const poolFeeTakenEvent = parseAbiItem(
  "event PoolFeeTaken(bytes32 indexed poolId, address indexed sender, address indexed currency, uint256 amountIn, uint256 feeAmount, uint16 feeBps, bool isBuy)",
);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const POSITION_STORAGE_PREFIX = "nara-v4-test-console:positions:";
const WAD = 10n ** 18n;

function bigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  return 0n;
}

function computeWeight(
  netAmount: bigint,
  durationEpochs: bigint,
  maxLockEpochs: bigint,
  durationLinearWad: bigint,
  durationQuadraticWad: bigint,
): bigint {
  if (maxLockEpochs <= 0n) throw new Error("Engine max lock duration is unavailable.");
  const ratioWad = (durationEpochs * WAD) / maxLockEpochs;
  const ratioSquaredWad = (ratioWad * ratioWad) / WAD;
  const multiplierWad = WAD
    + (durationLinearWad * ratioWad) / WAD
    + (durationQuadraticWad * ratioSquaredWad) / WAD;
  return (netAmount * multiplierWad) / WAD;
}

function tupleValue(value: unknown, name: string, index: number): unknown {
  const record = value as Record<string | number, unknown> | undefined;
  return record?.[name] ?? record?.[index];
}

function shortAddress(value: string, left = 6, right = 4): string {
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function amount(value: bigint, decimals = 18, maximumFractionDigits = 5): string {
  const formatted = formatUnits(value, decimals);
  const numeric = Number(formatted);
  if (!Number.isFinite(numeric)) return formatted;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(numeric);
}

function usd(value: bigint, maximumFractionDigits = 2): string {
  const formatted = formatUnits(value, 18);
  const numeric = Number(formatted);
  if (!Number.isFinite(numeric)) return `$${formatted}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: numeric > 0 && numeric < 1 ? Math.min(4, maximumFractionDigits) : 0,
    maximumFractionDigits,
  }).format(numeric);
}

function allocationAmount(value: bigint, decimals = 18): string {
  if (value === 0n) return "0";
  const visibleDigits = Math.min(decimals, 9);
  const visibleUnit = 10n ** BigInt(decimals - visibleDigits);
  if (value < visibleUnit) return `<${formatUnits(visibleUnit, decimals)}`;
  return amount(value, decimals, visibleDigits);
}

function integer(value: bigint): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function rateFromBps(value: bigint): string {
  return `${Number(value) / 100}%`;
}

function percentage(numerator: bigint, denominator: bigint, digits = 2): string {
  if (denominator <= 0n) return "—";
  const scale = 10n ** BigInt(digits + 2);
  const scaled = (numerator * scale) / denominator;
  return `${(Number(scaled) / 10 ** digits).toFixed(digits)}%`;
}

function durationBoost(weight: bigint, principal: bigint): string {
  if (principal <= 0n || weight <= principal) return "+0%";
  const ratioPartsPerMillion = (weight * 1_000_000n) / principal;
  const boostPercent = Number(ratioPartsPerMillion - 1_000_000n) / 10_000;
  return `+${boostPercent.toFixed(boostPercent < 0.1 ? 4 : 2)}%`;
}

function earningWindow(position: Position, epochLength: bigint): string {
  const earningEpochs = position.unlockEpoch - position.activationEpoch;
  const minutes = (earningEpochs * epochLength) / 60n;
  return `${earningEpochs} ${earningEpochs === 1n ? "epoch" : "epochs"} · ${minutes} minutes`;
}

function readError(error: unknown): string {
  return walletErrorMessage(error);
}

function baseScanAddress(address: string): string {
  return `https://basescan.org/address/${address}`;
}

function baseScanTx(hash: string): string {
  return `https://basescan.org/tx/${hash}`;
}

function positionStatus(position: Position, currentEpoch: bigint): {
  label: string;
  tone: "neutral" | "info" | "success" | "warning";
} {
  if (position.amount === 0n) return { label: "Closed", tone: "neutral" };
  if (currentEpoch < position.activationEpoch) {
    return { label: `Waiting for epoch ${position.activationEpoch}`, tone: "info" };
  }
  if (currentEpoch < position.unlockEpoch) return { label: "Earning rewards", tone: "success" };
  return { label: "Lock complete", tone: "warning" };
}

async function discoverPositionIds(
  client: PublicClient,
  owner: Address,
  nextPositionId: bigint,
  manualIds: bigint[],
  throughBlock?: bigint,
): Promise<bigint[]> {
  const ids = new Set(manualIds.filter((id) => id > 0n).map(String));
  const latest = throughBlock ?? await client.getBlockNumber();
  const first = BigInt(DEPLOYMENT.engineDeploymentBlock);
  const chunkSize = 50_000n;

  try {
    for (let start = first; start <= latest; start += chunkSize) {
      const end = start + chunkSize - 1n > latest ? latest : start + chunkSize - 1n;
      const logs = await client.getLogs({
        address: DEPLOYMENT.engine,
        event: lockedEvent,
        args: { owner },
        fromBlock: start,
        toBlock: end,
      });
      for (const log of logs) {
        if (log.args.positionId !== undefined) ids.add(log.args.positionId.toString());
      }
    }
  } catch {
    // A bounded fallback keeps the console usable on RPCs with strict log limits.
    // Larger histories should use the monitor as an optional read model later.
    if (nextPositionId <= 501n) {
      for (let id = 1n; id < nextPositionId; id += 1n) ids.add(id.toString());
    }
  }

  return [...ids].map(BigInt).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
}

async function readPositions(
  client: PublicClient,
  owner: Address,
  ids: bigint[],
  blockNumber?: bigint,
): Promise<Position[]> {
  const positions = await Promise.all(
    ids.map(async (id): Promise<Position | null> => {
      try {
        const [rawPosition, rawClaimable] = await Promise.all([
          client.readContract({
            address: DEPLOYMENT.engine,
            abi: engineAbi,
            functionName: "positionOf",
            args: [id],
            blockNumber,
          }),
          client.readContract({
            address: DEPLOYMENT.engine,
            abi: engineAbi,
            functionName: "claimableRewards",
            args: [id],
            blockNumber,
          }),
        ]);

        const positionOwner = tupleValue(rawPosition, "owner", 0) as Address | undefined;
        if (!positionOwner || positionOwner.toLowerCase() !== owner.toLowerCase()) return null;

        return {
          id,
          owner: positionOwner,
          createdEpoch: bigint(tupleValue(rawPosition, "createdEpoch", 1)),
          amount: bigint(tupleValue(rawPosition, "amount", 3)),
          weight: bigint(tupleValue(rawPosition, "weight", 4)),
          activationEpoch: bigint(tupleValue(rawPosition, "activationEpoch", 5)),
          unlockEpoch: bigint(tupleValue(rawPosition, "unlockEpoch", 6)),
          claimableNara: bigint(tupleValue(rawClaimable, "naraAmount", 0)),
          claimableEth: bigint(tupleValue(rawClaimable, "ethAmount", 1)),
        };
      } catch {
        return null;
      }
    }),
  );
  return positions.filter((position): position is Position => position !== null);
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`status-dot ${ok ? "ok" : "bad"}`} aria-hidden="true" />;
}

function EmptyConnection() {
  return (
    <div className="empty-state">
      <span className="eyebrow">Wallet required</span>
      <h2>Connect a wallet to load balances and positions</h2>
      <p>Reads use Base mainnet. Every write is simulated before the wallet asks you to sign.</p>
      <ConnectButton />
    </div>
  );
}

function ActionReadiness({
  readiness,
  onAction,
}: {
  readiness: ReadinessResult;
  onAction: () => void;
}) {
  const actionLabel = readiness.action === "switch-base"
    ? "Switch to Base"
    : readiness.action === "enter-amount"
      ? "Enter amount"
      : readiness.action === "add-usdc"
        ? "Add USDC on Base"
        : readiness.action === "add-nara"
          ? "Open buy"
          : readiness.action === "add-base-eth"
            ? "Add ETH on Base"
            : null;
  return (
    <section
      className={`action-readiness ${readiness.state}`}
      aria-live="polite"
      aria-busy={readiness.state === "checking"}
    >
      <span className="action-readiness-mark" aria-hidden="true" />
      <div>
        <span className="eyebrow">Action check</span>
        <strong>{readiness.title}</strong>
        <small>{readiness.detail}</small>
      </div>
      {actionLabel ? (
        <button className="secondary" type="button" onClick={onAction}>{actionLabel}</button>
      ) : null}
    </section>
  );
}

export default function App() {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { data: connectorClient } = useConnectorClient({ chainId: BASE_CHAIN_ID });
  const { data: walletCapabilities, refetch: refetchWalletCapabilities } = useCapabilities({
    account: address,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address },
  });
  const { switchChain } = useSwitchChain();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<Tab>("overview");
  const [state, setState] = useState<ProtocolState | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [manualPositionIds, setManualPositionIds] = useState<bigint[]>([]);
  const [manualPositionInput, setManualPositionInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [lastTx, setLastTx] = useState<Hash | null>(null);
  const [transactionProgress, setTransactionProgress] = useState<TransactionProgress | null>(null);
  const [lockAmount, setLockAmount] = useState("10");
  const [durationEpochs, setDurationEpochs] = useState("9");
  const [previewWeight, setPreviewWeight] = useState<bigint | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [positionReview, setPositionReview] = useState<PositionReview | null>(null);
  const [lockComposerOpen, setLockComposerOpen] = useState(false);
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeSlippageBps, setTradeSlippageBps] = useState(100n);
  const [tradeQuote, setTradeQuote] = useState<TradeQuote | null>(null);
  const [tradeQuoteLoading, setTradeQuoteLoading] = useState(false);
  const [tradeQuoteError, setTradeQuoteError] = useState<string | null>(null);
  const [tradeAllowances, setTradeAllowances] = useState<TradeAllowances | null>(null);
  const [tradeDeploymentVerified, setTradeDeploymentVerified] = useState(false);
  const [tradeDeploymentError, setTradeDeploymentError] = useState<string | null>(null);
  const [tradeApprovalError, setTradeApprovalError] = useState<string | null>(null);
  const [tradeAtomicCompatibilityMode, setTradeAtomicCompatibilityMode] = useState(false);
  const [baseAccountProvisioning, setBaseAccountProvisioning] = useState<BaseAccountProvisioningCheck>({
    address: null,
    state: "not-base",
  });
  const [tradeReviewOpen, setTradeReviewOpen] = useState(false);
  const [fundingAsset, setFundingAsset] = useState<FundingAsset | null>(null);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [onrampAvailable, setOnrampAvailable] = useState<boolean | null>(null);
  const [paymasterAvailable, setPaymasterAvailable] = useState<boolean | null>(null);
  const [switchingBaseAppWallet, setSwitchingBaseAppWallet] = useState(false);
  const tradeWalletActionLock = useRef(false);
  const transactionProgressRef = useRef<TransactionProgress | null>(null);
  const resumingTransactionRef = useRef<Hash | null>(null);
  const resumingCallsRef = useRef<string | null>(null);
  const latestAppliedBlockRef = useRef(0n);
  const restoredFundingAddressRef = useRef<string | null>(null);
  const baseAccountCheckRef = useRef(0);

  const isOnBase = chainId === BASE_CHAIN_ID;
  const contractsVerified = !!state?.engineCodeVerified && !!state?.tokenCodeVerified;
  const connectedWithBaseAccount = isBaseAccountConnector(connector);
  const inBaseAppBrowser = isCoinbaseBrowserEnvironment(typeof window === "undefined" ? undefined : window);
  const baseAccountProvisioningState: BaseAccountProvisioningState = connectedWithBaseAccount
    ? address && baseAccountProvisioning.address?.toLowerCase() === address.toLowerCase()
      ? baseAccountProvisioning.state
      : "checking"
    : "not-base";
  const walletAtomicStatus = atomicCallsStatus(walletCapabilities);
  const baseAccountBlocksAtomic = connectedWithBaseAccount
    && (baseAccountProvisioningState !== "ready" || walletAtomicStatus !== "supported");
  const transactionBusy = !!transactionProgress
    && transactionProgress.stage !== "complete"
    && transactionProgress.stage !== "error";
  const writesReady = !!address
    && !!client
    && isOnBase
    && contractsVerified
    && !pendingAction
    && !transactionBusy;
  const naraSwapWalletBlocked = tab === "trade" && connectedWithBaseAccount;
  const tradeWritesReady = writesReady
    && tradeDeploymentVerified
    && !tradeDeploymentError
    && !tradeApprovalError
    && !naraSwapWalletBlocked;
  const walletAtomicSupported = !!connectorClient && supportsAtomicCalls(walletCapabilities);
  const sponsoredAtomicReady = !baseAccountBlocksAtomic
    && paymasterAvailable === true
    && walletAtomicSupported
    && supportsSponsoredAtomicCalls(walletCapabilities);
  const tradeAtomicReady = walletAtomicSupported
    && !tradeAtomicCompatibilityMode
    && !baseAccountBlocksAtomic;
  const externalFundingOptions = fundingAsset ? externalFundingRoutes(fundingAsset) : [];

  useEffect(() => {
    if (!address) {
      setTradeAtomicCompatibilityMode(false);
      return;
    }
    try {
      setTradeAtomicCompatibilityMode(
        localStorage.getItem(tradeAtomicCompatibilityStorageKey(address)) === "1",
      );
    } catch {
      setTradeAtomicCompatibilityMode(false);
    }
  }, [address]);

  const persistTradeAtomicCompatibility = useCallback((enabled: boolean) => {
    setTradeAtomicCompatibilityMode(enabled);
    if (!address) return;
    try {
      const key = tradeAtomicCompatibilityStorageKey(address);
      if (enabled) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {
      // The current page still keeps the compatibility choice in memory.
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setManualPositionIds([]);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(`${POSITION_STORAGE_PREFIX}${address.toLowerCase()}`) || "[]");
      setManualPositionIds(
        Array.isArray(stored)
          ? stored.map((value) => BigInt(value)).filter((value) => value > 0n)
          : [],
      );
    } catch {
      setManualPositionIds([]);
    }
  }, [address]);

  const clearSavedFundingIntent = useCallback(() => {
    if (!address) return;
    try {
      localStorage.removeItem(fundingIntentStorageKey(address));
    } catch {
      // The current page still retains the selected values.
    }
  }, [address]);

  const saveFundingIntent = useCallback((intent: Omit<SavedFundingIntent, "version" | "createdAt">) => {
    if (!address) return;
    try {
      localStorage.setItem(fundingIntentStorageKey(address), JSON.stringify({
        ...intent,
        version: 1,
        createdAt: Date.now(),
      } satisfies SavedFundingIntent));
    } catch {
      // Funding still works, but a full-page redirect cannot restore the form.
    }
  }, [address]);

  const resumeSavedFundingIntent = useCallback((completedTradeDirection?: TradeDirection) => {
    if (!address) return false;
    let saved: SavedFundingIntent | null = null;
    try {
      saved = parseSavedFundingIntent(localStorage.getItem(fundingIntentStorageKey(address)));
    } catch {
      return false;
    }
    if (!saved) return false;
    clearSavedFundingIntent();
    if (saved.kind === "trade" && saved.tradeDirection === completedTradeDirection) return false;
    if (saved.kind === "lock") {
      setTab("positions");
      setLockComposerOpen(true);
      if (saved.lockAmount !== undefined) setLockAmount(saved.lockAmount);
      if (saved.durationEpochs !== undefined) setDurationEpochs(saved.durationEpochs);
    } else if (saved.kind === "unlock") {
      setTab("positions");
    } else {
      setTab("trade");
      setTradeDirection(saved.tradeDirection || "buy");
      setTradeAmount(saved.tradeAmount || "");
    }
    return true;
  }, [address, clearSavedFundingIntent]);

  useEffect(() => {
    if (!address) {
      restoredFundingAddressRef.current = null;
      return;
    }
    const normalized = address.toLowerCase();
    if (restoredFundingAddressRef.current === normalized) return;
    restoredFundingAddressRef.current = normalized;
    let saved: SavedFundingIntent | null = null;
    try {
      saved = parseSavedFundingIntent(localStorage.getItem(fundingIntentStorageKey(address)));
    } catch {
      return;
    }
    if (!saved) {
      clearSavedFundingIntent();
      return;
    }
    if (saved.kind === "trade") {
      setTab("trade");
      setTradeDirection(saved.tradeDirection || "buy");
      setTradeAmount(saved.tradeAmount || "");
    } else {
      setTab("positions");
      if (saved.kind === "lock") {
        setLockComposerOpen(true);
        if (saved.lockAmount !== undefined) setLockAmount(saved.lockAmount);
        if (saved.durationEpochs !== undefined) setDurationEpochs(saved.durationEpochs);
      }
    }
  }, [address, clearSavedFundingIntent]);

  const refresh = useCallback(async (confirmedBlockNumber?: bigint) => {
    if (!client) return;
    setLoading(true);
    try {
      const wallet = address || ZERO_ADDRESS;
      const blockNumber = confirmedBlockNumber ?? await client.getBlockNumber();
      const [
        engineCode,
        tokenCode,
        currentEpoch,
        epochState,
        genesisTimestamp,
        epochLength,
        totalLocked,
        activeTotalWeight,
        nextPositionId,
        lockFeeWei,
        unlockFeeWei,
        lockFeeBps,
        claimFeeBps,
        config,
        naraBalance,
        usdcBalance,
        ethBalance,
        allowance,
        marketRead,
      ] = await Promise.all([
        client.getBytecode({ address: DEPLOYMENT.engine, blockNumber }),
        client.getBytecode({ address: DEPLOYMENT.nara, blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "currentEpoch", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "epochState", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "GENESIS_TIMESTAMP", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "EPOCH_LENGTH", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "totalLocked", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "activeTotalWeight", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "nextPositionId", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "lockFeeWei", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "unlockFeeWei", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "lockFeeBps", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "claimFeeBps", blockNumber }),
        client.readContract({ address: DEPLOYMENT.engine, abi: engineAbi, functionName: "config", blockNumber }),
        client.readContract({ address: DEPLOYMENT.nara, abi: erc20Abi, functionName: "balanceOf", args: [wallet], blockNumber }),
        client.readContract({ address: DEPLOYMENT.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet], blockNumber }),
        address ? client.getBalance({ address, blockNumber }) : 0n,
        client.readContract({
          address: DEPLOYMENT.nara,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet, DEPLOYMENT.engine],
          blockNumber,
        }),
        readMarketValuation(client, blockNumber)
          .then((market) => ({ market, error: null }))
          .catch((error: unknown) => ({ market: null, error: readError(error) })),
      ]);

      const nextState: ProtocolState = {
        blockNumber,
        engineCodeVerified: !!engineCode
          && engineCode !== "0x"
          && keccak256(engineCode).toLowerCase() === DEPLOYMENT.codeHashes.engine.toLowerCase(),
        tokenCodeVerified: !!tokenCode
          && tokenCode !== "0x"
          && keccak256(tokenCode).toLowerCase() === DEPLOYMENT.codeHashes.nara.toLowerCase(),
        currentEpoch: bigint(currentEpoch),
        storedEpoch: bigint(tupleValue(epochState, "epoch", 0)),
        genesisTimestamp: bigint(genesisTimestamp),
        epochLength: bigint(epochLength),
        totalLocked: bigint(totalLocked),
        activeTotalWeight: bigint(activeTotalWeight),
        nextPositionId: bigint(nextPositionId),
        lockFeeWei: bigint(lockFeeWei),
        unlockFeeWei: bigint(unlockFeeWei),
        lockFeeBps: bigint(lockFeeBps),
        claimFeeBps: bigint(claimFeeBps),
        durationLinearWad: bigint(tupleValue(config, "durationLinearWad", 8)),
        durationQuadraticWad: bigint(tupleValue(config, "durationQuadraticWad", 9)),
        activationDelayEpochs: bigint(tupleValue(config, "activationDelayEpochs", 16)),
        maxLockEpochs: bigint(tupleValue(config, "maxLockEpochs", 17)),
        naraBalance: bigint(naraBalance),
        usdcBalance: bigint(usdcBalance),
        ethBalance: bigint(ethBalance),
        allowance: bigint(allowance),
        market: marketRead.market,
        marketReadError: marketRead.error,
      };
      let nextPositions: Position[] = [];
      if (address) {
        const ids = await discoverPositionIds(
          client,
          address,
          nextState.nextPositionId,
          manualPositionIds,
          blockNumber,
        );
        nextPositions = await readPositions(client, address, ids, blockNumber);
      }

      // Never let a slower pre-transaction read replace a newer snapshot that
      // was anchored to the confirmed transaction receipt block.
      if (!shouldApplyReadSnapshot(latestAppliedBlockRef.current, blockNumber)) return;
      latestAppliedBlockRef.current = blockNumber;
      setState(nextState);
      setPositions(nextPositions);
    } catch (error) {
      setFlash({ tone: "error", message: `Base read failed: ${readError(error)}` });
    } finally {
      setLoading(false);
    }
  }, [address, client, manualPositionIds]);

  const refreshTradeAllowances = useCallback(async () => {
    if (!client || !address) {
      setTradeAllowances(null);
      setTradeApprovalError(null);
      return null;
    }
    setTradeAllowances(null);
    try {
      const next = await readTradeAllowances(client, address, tradeDirection);
      setTradeAllowances(next);
      setTradeApprovalError(null);
      return next;
    } catch (error) {
      setTradeApprovalError(readError(error));
      throw error;
    }
  }, [address, client, tradeDirection]);

  const refreshBaseAccountProvisioning = useCallback(async (): Promise<BaseAccountProvisioningState> => {
    const requestId = ++baseAccountCheckRef.current;
    if (!client || !address || !connectedWithBaseAccount) {
      if (requestId === baseAccountCheckRef.current) {
        setBaseAccountProvisioning({ address: null, state: "not-base" });
      }
      return "not-base";
    }
    const checkedAddress = address;
    setBaseAccountProvisioning({ address: checkedAddress, state: "checking" });
    try {
      const bytecode = await client.getBytecode({ address });
      const next = needsBaseAccountActivation({
        baseAccount: true,
        bytecode,
      }) ? "required" : "ready";
      if (requestId === baseAccountCheckRef.current) {
        setBaseAccountProvisioning({ address: checkedAddress, state: next });
      }
      return next;
    } catch {
      if (requestId === baseAccountCheckRef.current) {
        setBaseAccountProvisioning({ address: checkedAddress, state: "unknown" });
      }
      return "unknown";
    }
  }, [address, client, connectedWithBaseAccount]);

  useEffect(() => {
    void refreshBaseAccountProvisioning();
    return () => {
      baseAccountCheckRef.current += 1;
    };
  }, [refreshBaseAccountProvisioning]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        void refreshBaseAccountProvisioning();
      }
    };
    const refreshOnFocus = () => {
      void refresh();
      void refreshBaseAccountProvisioning();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refresh, refreshBaseAccountProvisioning]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("funding") !== "complete") return;
    url.searchParams.delete("funding");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!fundingAsset || !address) {
      setOnrampAvailable(null);
      return;
    }
    let cancelled = false;
    setFundingError(null);
    void fetch("/api/onramp-session", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!cancelled) setOnrampAvailable(response.ok && body.available === true);
      })
      .catch(() => {
        if (!cancelled) setOnrampAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, fundingAsset]);

  useEffect(() => {
    if (!address) {
      setPaymasterAvailable(null);
      return;
    }
    const controller = new AbortController();
    void readSponsorshipAvailability(controller.signal)
      .then(setPaymasterAvailable)
      .catch(() => setPaymasterAvailable(false));
    return () => controller.abort();
  }, [address]);

  useEffect(() => {
    if (!client || tab !== "trade") return;
    let cancelled = false;
    setTradeDeploymentVerified(false);
    setTradeDeploymentError(null);
    void verifyTradeDeployment(client)
      .then(() => {
        if (!cancelled) setTradeDeploymentVerified(true);
      })
      .catch((error) => {
        if (!cancelled) setTradeDeploymentError(readError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [client, tab]);

  useEffect(() => {
    if (tab !== "trade") return;
    let cancelled = false;
    void refreshTradeAllowances().catch(() => {
      if (!cancelled) {
        setTradeAllowances(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshTradeAllowances, tab]);

  useEffect(() => {
    if (!state || !client) return;
    const snapshot = state;
    let cancelled = false;
    async function preview() {
      try {
        const grossAmount = parseUnits(lockAmount || "0", 18);
        const duration = BigInt(durationEpochs || "0");
        const minimumDuration = snapshot.activationDelayEpochs + 1n;
        if (grossAmount <= 0n) throw new Error("Enter a positive NARA amount.");
        if (duration < minimumDuration || duration > snapshot.maxLockEpochs) {
          throw new Error(`Duration must be ${minimumDuration}–${snapshot.maxLockEpochs} epochs.`);
        }
        const { netAmount } = tokenFeeBreakdown(grossAmount, snapshot.lockFeeBps);
        const weight = computeWeight(
          netAmount,
          duration,
          snapshot.maxLockEpochs,
          snapshot.durationLinearWad,
          snapshot.durationQuadraticWad,
        );
        if (!cancelled) {
          setPreviewWeight(weight);
          setPreviewError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPreviewWeight(null);
          setPreviewError(readError(error));
        }
      }
    }
    void preview();
    return () => {
      cancelled = true;
    };
  }, [client, durationEpochs, lockAmount, state]);

  useEffect(() => {
    if (!client || tab !== "trade") return;
    if (!tradeAmount.trim()) {
      setTradeQuote(null);
      setTradeQuoteLoading(false);
      setTradeQuoteError(null);
      return;
    }
    let parsedAmount: bigint;
    try {
      parsedAmount = parseTradeAmount(tradeDirection, tradeAmount);
      if (parsedAmount <= 0n) throw new Error("Enter an amount greater than zero.");
    } catch (error) {
      setTradeQuote(null);
      setTradeQuoteLoading(false);
      setTradeQuoteError(readError(error));
      return;
    }

    let cancelled = false;
    setTradeQuote(null);
    setTradeQuoteError(null);
    setTradeQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void quoteTrade(client, address || ZERO_ADDRESS, tradeDirection, parsedAmount)
        .then((quote) => {
          if (!cancelled) setTradeQuote(quote);
        })
        .catch((error) => {
          if (!cancelled) setTradeQuoteError(readError(error));
        })
        .finally(() => {
          if (!cancelled) setTradeQuoteLoading(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, client, tab, tradeAmount, tradeDirection]);

  const parsedLockAmount = useMemo(() => {
    try {
      return parseUnits(lockAmount || "0", 18);
    } catch {
      return 0n;
    }
  }, [lockAmount]);

  const lockBreakdown = tokenFeeBreakdown(parsedLockAmount, state?.lockFeeBps ?? 0n);
  const lockTokenFee = lockBreakdown.feeAmount;
  const lockedPrincipal = lockBreakdown.netAmount;
  const minWeight = previewWeight ? previewWeight - previewWeight / 200n : 0n;
  const approvalReady = !!state && parsedLockAmount > 0n && state.allowance === parsedLockAmount;
  const balanceReady = !!state && parsedLockAmount > 0n && state.naraBalance >= parsedLockAmount;
  const tradeConfig = TRADE[tradeDirection];
  const parsedTradeInput = useMemo(() => {
    try {
      return parseTradeAmount(tradeDirection, tradeAmount);
    } catch {
      return 0n;
    }
  }, [tradeAmount, tradeDirection]);
  const tradeInputBalance = tradeDirection === "buy" ? state?.usdcBalance : state?.naraBalance;
  const tradeAmountReady = parsedTradeInput > 0n;
  const tradeBalanceReady = !isConnected
    || tradeInputBalance === undefined
    || !tradeAmountReady
    || tradeInputBalance >= parsedTradeInput;
  const tradeMinimumOut = tradeQuote
    ? minimumAfterSlippage(tradeQuote.amountOut, tradeSlippageBps)
    : 0n;
  const tradeAmountAfterNaraFee = tradeQuote
    ? amountAfterNaraFee(tradeQuote.amountIn, tradeQuote.feeAmount)
    : 0n;
  const tradeApprovalsReady = reusableApprovalsReady(tradeAllowances, parsedTradeInput);
  const tradeAccessReady = tradeApprovalsReady.erc20 && tradeApprovalsReady.permit2;
  const baseAccountActivationStep = connectedWithBaseAccount
    && baseAccountProvisioningState !== "ready"
    && baseAccountProvisioningState !== "not-base"
    && !tradeApprovalsReady.erc20;
  const hasTradeAccess = !!tradeAllowances
    && (tradeAllowances.erc20 > 0n || tradeAllowances.permit2Amount > 0n);
  const executableTradeQuote = tradeQuote?.amountIn === parsedTradeInput ? tradeQuote : null;
  const tokenApprovalScope = !tradeAllowances || tradeAllowances.erc20 === 0n
    ? "Not enabled"
    : `${tradeAllowances.erc20 === MAX_ERC20_ALLOWANCE
      ? `Unlimited ${tradeConfig.inputSymbol}`
      : `${amount(tradeAllowances.erc20, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol}`} → Permit2 · until revoked`;
  const routerApprovalScope = !tradeAllowances || tradeAllowances.permit2Amount === 0n
    ? "Not enabled"
    : `${tradeAllowances.permit2Amount === MAX_PERMIT2_ALLOWANCE
      ? `Unlimited ${tradeConfig.inputSymbol}`
      : `${amount(tradeAllowances.permit2Amount, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol}`} → Universal Router · expires ${dateTime(tradeAllowances.permit2Expiration)}`;
  const nextTradeAction = !tradeAllowances
    ? "Checking current access"
    : naraSwapWalletBlocked
      ? "Choose a wallet app or browser wallet"
    : baseAccountProvisioningState === "checking"
      ? "Checking Base Account status"
    : tradeAtomicReady && !tradeAccessReady
      ? `Review one ${tradeDirection} · setup included atomically`
    : !tradeApprovalsReady.erc20
      ? baseAccountActivationStep
        ? `1. Activate with exact ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol} access`
        : `Allow ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol} to Permit2`
      : !tradeApprovalsReady.permit2
        ? `Allow ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol} to Router · 30 days`
        : `Review one ${tradeDirection}`;

  const replaceTransactionProgress = useCallback((next: TransactionProgress | null) => {
    transactionProgressRef.current = next;
    setTransactionProgress(next);
  }, []);

  const patchTransactionProgress = useCallback((patch: Partial<TransactionProgress>) => {
    const current = transactionProgressRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    transactionProgressRef.current = next;
    setTransactionProgress(next);
  }, []);

  const clearCompletedProgressForReview = useCallback(() => {
    if (shouldDismissProgressForReview(transactionProgressRef.current)) {
      replaceTransactionProgress(null);
    }
  }, [replaceTransactionProgress]);

  const openPositionReview = useCallback((review: PositionReview) => {
    clearCompletedProgressForReview();
    setPositionReview(review);
  }, [clearCompletedProgressForReview]);

  const openTradeReview = useCallback(() => {
    clearCompletedProgressForReview();
    setTradeReviewOpen(true);
  }, [clearCompletedProgressForReview]);

  useEffect(() => {
    if (!shouldCloseReviewForProgress(transactionProgress)) return;
    setPositionReview(null);
    setTradeReviewOpen(false);
  }, [transactionProgress]);

  const clearStoredPendingTransaction = useCallback(() => {
    if (!address) return;
    try {
      localStorage.removeItem(pendingTransactionStorageKey(address));
    } catch {
      // The visible tracker still works when browser storage is unavailable.
    }
  }, [address]);

  const storePendingTransaction = useCallback((value: StoredPendingTransaction) => {
    if (!address) return;
    try {
      localStorage.setItem(pendingTransactionStorageKey(address), JSON.stringify(value));
    } catch {
      // The receipt waiter remains active for this page session.
    }
  }, [address]);

  const clearStoredPendingCalls = useCallback(() => {
    if (!address) return;
    try {
      localStorage.removeItem(pendingCallsStorageKey(address));
    } catch {
      // The visible tracker still works when browser storage is unavailable.
    }
  }, [address]);

  const storePendingCalls = useCallback((value: StoredPendingCalls) => {
    if (!address) return;
    try {
      localStorage.setItem(pendingCallsStorageKey(address), JSON.stringify(value));
    } catch {
      // The wallet status waiter remains active for this page session.
    }
  }, [address]);

  const beginTrackedAction = useCallback((action: string, detail: string) => {
    replaceTransactionProgress({
      action,
      stage: "checking",
      step: 0,
      detail,
      startedAt: Date.now(),
    });
    setLastTx(null);
    setFlash(null);
  }, [replaceTransactionProgress]);

  const waitForWallet = useCallback((detail = "Confirm or reject this single transaction in your wallet.") => {
    patchTransactionProgress({ stage: "wallet", step: 1, detail, canCheck: false });
  }, [patchTransactionProgress]);

  const completeTrackedAction = useCallback((detail: string) => {
    clearStoredPendingTransaction();
    patchTransactionProgress({ stage: "complete", step: 4, detail, canCheck: false });
  }, [clearStoredPendingTransaction, patchTransactionProgress]);

  const failTrackedAction = useCallback((error: unknown) => {
    const current = transactionProgressRef.current;
    if (current?.stage === "error" || (current?.stage === "submitted" && current.canCheck)) return;
    const reason = readError(error);
    const errorDiagnostic = walletErrorDiagnostic(error);
    const confirmedButNotSynced = current?.stage === "syncing";
    const baseAccountStoppedBeforeSubmission = connectedWithBaseAccount
      && !current?.hash
      && !confirmedButNotSynced;
    if (confirmedButNotSynced) clearStoredPendingTransaction();
    const diagnostic = [
      "NARA v4 console diagnostic",
      `Time: ${new Date().toISOString()}`,
      `Action: ${current?.action || "Transaction"}`,
      `Network: Base (8453)`,
      `Wallet: ${address || "unknown"}`,
      `Connector: ${connector?.id || connector?.type || "unknown"}`,
      `Base Account state: ${baseAccountProvisioningState}`,
      `Error name: ${errorDiagnostic.name || "unknown"}`,
      `Error code: ${errorDiagnostic.code || "unknown"}`,
      `Message: ${errorDiagnostic.message}`,
      `Details: ${errorDiagnostic.details || "none"}`,
    ].join("\n");
    replaceTransactionProgress({
      action: current?.action || "Transaction",
      stage: "error",
      step: current?.step ?? 0,
      hash: current?.hash,
      startedAt: current?.startedAt ?? Date.now(),
      detail: confirmedButNotSynced
        ? `Confirmed on Base, but the console could not update. Do not repeat the transaction. ${reason}`
        : current?.hash
          ? `The transaction status could not be confirmed. Check BaseScan before trying again. ${reason}`
          : current?.stage === "submitted"
            ? `The wallet submitted the action, but its Base status could not be confirmed. Do not repeat it; reconnect or reload so the console can resume checking. ${reason}`
          : baseAccountStoppedBeforeSubmission
            ? `Nothing was submitted. Do not retry this Coinbase page. Open this console inside the Base app Explorer, choose Browser Wallet, verify the address, then continue. ${reason}`
            : `Nothing was submitted. ${reason}`,
      diagnostic,
    });
  }, [address, baseAccountProvisioningState, clearStoredPendingTransaction, connectedWithBaseAccount, connector, replaceTransactionProgress]);

  const waitForTrackedTransaction = useCallback(
    async (label: string, hash: Hash) => {
      if (!client) throw new Error("Base client is unavailable.");
      const startedAt = transactionProgressRef.current?.startedAt ?? Date.now();
      setLastTx(hash);
      storePendingTransaction({ action: label, hash, startedAt });
      patchTransactionProgress({
        action: label,
        stage: "submitted",
        step: 2,
        detail: "Your wallet is finished. Base is confirming the transaction; no action is needed.",
        hash,
        canCheck: false,
      });

      let receipt;
      try {
        receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180_000 });
      } catch (error) {
        patchTransactionProgress({
          stage: "submitted",
          step: 2,
          detail: "The status check paused. The transaction may still be pending; check it before trying again.",
          hash,
          canCheck: true,
        });
        throw error;
      }

      if (receipt.status !== "success") {
        clearStoredPendingTransaction();
        replaceTransactionProgress({
          action: label,
          stage: "error",
          step: 2,
          detail: "Base confirmed that this transaction failed. No protocol change was applied.",
          startedAt,
          hash,
        });
        throw new Error(`${label} reverted.`);
      }

      patchTransactionProgress({
        stage: "syncing",
        step: 3,
        detail: `Confirmed in Base block ${receipt.blockNumber}. Waiting for the read service, then updating balances.`,
        hash,
        canCheck: false,
      });
      await waitForConfirmedBlockState(client, receipt.blockNumber);
      return receipt;
    },
    [client, clearStoredPendingTransaction, patchTransactionProgress, replaceTransactionProgress, storePendingTransaction],
  );

  const finishTransaction = useCallback(
    async (label: string, hash: Hash, completion: string) => {
      const receipt = await waitForTrackedTransaction(label, hash);
      await refresh(receipt.blockNumber);
      completeTrackedAction(completion);
      return receipt;
    },
    [completeTrackedAction, refresh, waitForTrackedTransaction],
  );

  const waitForAtomicCalls = useCallback(async (label: string, id: string) => {
    if (!client || !connectorClient) throw new Error("Connected wallet status is unavailable.");
    const status = await waitForCallsStatus(connectorClient, {
      id,
      pollingInterval: 1_500,
      timeout: 180_000,
      throwOnFailure: false,
    });
    if (status.status === "failure") {
      clearStoredPendingCalls();
      throw new Error(`${label} failed on Base. No protocol change was applied.`);
    }
    if (status.status !== "success") throw new Error(`${label} is still pending. The console will resume checking after reload.`);
    const hash = status.receipts?.find((receipt) => receipt.transactionHash)?.transactionHash;
    if (!hash) {
      clearStoredPendingCalls();
      throw new Error("Base confirmed the action, but the wallet did not return its transaction hash. Do not repeat it before refreshing.");
    }
    setLastTx(hash);
    const receipt = await client.getTransactionReceipt({ hash });
    clearStoredPendingCalls();
    if (receipt.status !== "success") throw new Error(`${label} reverted.`);
    patchTransactionProgress({
      stage: "syncing",
      step: 3,
      detail: `Confirmed in Base block ${receipt.blockNumber}. Waiting for the read service, then updating balances.`,
      hash,
      canCheck: false,
    });
    await waitForConfirmedBlockState(client, receipt.blockNumber);
    return receipt;
  }, [client, clearStoredPendingCalls, connectorClient, patchTransactionProgress]);

  const submitAtomicCalls = useCallback(async (
    label: string,
    calls: readonly SponsoredCall[],
    sponsored: boolean,
  ) => {
    if (!address || !client || !connectorClient || !walletAtomicSupported || baseAccountBlocksAtomic) {
      throw new Error("Atomic execution is not available for this wallet.");
    }
    if (sponsored && !sponsoredAtomicReady) {
      throw new Error("Sponsored atomic execution is not available for this wallet.");
    }
    patchTransactionProgress({
      stage: "checking",
      step: 0,
      detail: "Simulating the complete atomic action before any wallet prompt.",
    });
    let simulation;
    try {
      simulation = await simulateCalls(client, { account: address, calls, validation: true });
    } catch (error) {
      const validationError = readError(error);
      if (!isAtomicSimulationGasValidationError(validationError)) {
        if (sponsored) setPaymasterAvailable(false);
        throw new Error(`Atomic simulation is unavailable; nothing was submitted. ${validationError}`, { cause: error });
      }
      patchTransactionProgress({
        stage: "checking",
        step: 0,
        detail: "The Base RPC validation gas cap is incompatible. Rechecking the same calls without provider validation before opening the wallet.",
      });
      try {
        simulation = await simulateCalls(client, { account: address, calls, validation: false });
      } catch (fallbackError) {
        if (sponsored) setPaymasterAvailable(false);
        throw new Error(`Atomic simulation is unavailable; nothing was submitted. ${readError(fallbackError)}`, { cause: fallbackError });
      }
    }
    const failed = simulation.results.find((result) => result.status === "failure");
    if (failed) throw failed.error || new Error("Atomic simulation failed.");

    let paymasterCapabilities;
    if (sponsored) {
      waitForWallet("Authorize this exact gas-sponsorship request, then confirm the complete action in your wallet.");
      try {
        const ticket = await requestSponsorshipTicket({
          address,
          calls,
          signMessage: (message) => signMessageAsync({ message }),
        });
        paymasterCapabilities = {
          paymasterService: {
            url: ticket.url,
            context: { naraTicket: ticket.ticket },
          },
        };
      } catch (error) {
        setPaymasterAvailable(false);
        throw new Error(`Sponsored path unavailable; nothing was submitted. ${readError(error)} The wallet-funded path is now active.`, { cause: error });
      }
    } else {
      waitForWallet("Confirm or reject this one atomic action in your wallet.");
    }
    patchTransactionProgress({
      stage: "wallet",
      step: 1,
      detail: sponsored
        ? "Gas sponsorship is authorized. Confirm or reject this one atomic action in your wallet."
        : "Confirm or reject this one atomic action in your wallet. Network gas is paid through your wallet.",
    });
    let sentId: string;
    try {
      const response: unknown = await connectorClient.request(buildWalletSendCallsRequest({
        address,
        chainId: BASE_CHAIN_ID,
        calls,
        capabilities: paymasterCapabilities,
      }) as never);
      sentId = walletCallsId(response);
    } catch (error) {
      if (sponsored) {
        setPaymasterAvailable(false);
        throw new Error(`Atomic wallet submission stopped; no fallback transaction was opened automatically. ${readError(error)}`, { cause: error });
      }
      persistTradeAtomicCompatibility(true);
      const retryGuidance = connectedWithBaseAccount
        ? "Close the Coinbase signing page completely; do not reuse its in-page retry because its gas quote can be stale."
        : "Close the wallet request before trying again.";
      throw new Error(`The wallet could not prepare the atomic batch. Nothing was submitted. ${retryGuidance} Exact setup is now active; return to Trade and continue. ${readError(error)}`, { cause: error });
    }
    storePendingCalls({
      version: 1,
      action: label,
      id: sentId,
      startedAt: transactionProgressRef.current?.startedAt ?? Date.now(),
    });
    patchTransactionProgress({
      action: label,
      stage: "submitted",
      step: 2,
      detail: "Your wallet is finished. Base is confirming the atomic action; no action is needed.",
      canCheck: false,
    });
    return waitForAtomicCalls(label, sentId);
  }, [
    address,
    baseAccountBlocksAtomic,
    client,
    connectedWithBaseAccount,
    connectorClient,
    patchTransactionProgress,
    persistTradeAtomicCompatibility,
    signMessageAsync,
    sponsoredAtomicReady,
    storePendingCalls,
    waitForWallet,
    waitForAtomicCalls,
    walletAtomicSupported,
  ]);

  const checkTrackedTransactionStatus = useCallback(async () => {
    const progress = transactionProgressRef.current;
    if (!progress?.hash || !progress.canCheck || pendingAction) return;
    setPendingAction("transaction-status");
    try {
      const receipt = await waitForTrackedTransaction(progress.action, progress.hash);
      await refresh(receipt.blockNumber);
      completeTrackedAction("Base confirmed the transaction. The console is updated.");
    } catch (error) {
      failTrackedAction(error);
    } finally {
      setPendingAction(null);
    }
  }, [completeTrackedAction, failTrackedAction, pendingAction, refresh, waitForTrackedTransaction]);

  useEffect(() => {
    if (!address || !client || resumingTransactionRef.current || transactionProgressRef.current) return;
    let stored: StoredPendingTransaction | null = null;
    try {
      stored = parseStoredPendingTransaction(localStorage.getItem(pendingTransactionStorageKey(address)));
    } catch {
      return;
    }
    if (!stored) return;

    resumingTransactionRef.current = stored.hash;
    replaceTransactionProgress({
      action: stored.action,
      stage: "submitted",
      step: 2,
      detail: "Restored after reload. Checking whether Base confirmed the transaction.",
      startedAt: stored.startedAt,
      hash: stored.hash,
    });
    setPendingAction("transaction-status");

    void (async () => {
      try {
        const receipt = await waitForTrackedTransaction(stored.action, stored.hash);
        await refresh(receipt.blockNumber);
        completeTrackedAction("Base confirmed the transaction. The console recovered and updated automatically.");
      } catch (error) {
        failTrackedAction(error);
      } finally {
        resumingTransactionRef.current = null;
        setPendingAction(null);
      }
    })();
  }, [
    address,
    client,
    completeTrackedAction,
    failTrackedAction,
    refresh,
    replaceTransactionProgress,
    waitForTrackedTransaction,
  ]);

  useEffect(() => {
    if (
      !address
      || !client
      || !connectorClient
      || resumingCallsRef.current
      || transactionProgressRef.current
    ) return;
    let stored: StoredPendingCalls | null = null;
    try {
      stored = parseStoredPendingCalls(localStorage.getItem(pendingCallsStorageKey(address)));
    } catch {
      return;
    }
    if (!stored) {
      clearStoredPendingCalls();
      return;
    }
    resumingCallsRef.current = stored.id;
    replaceTransactionProgress({
      action: stored.action,
      stage: "submitted",
      step: 2,
      detail: "Restored after reload. Asking the connected wallet for the atomic action status.",
      startedAt: stored.startedAt,
    });
    setPendingAction("sponsored-calls-status");
    void (async () => {
      try {
        const receipt = await waitForAtomicCalls(stored.action, stored.id);
        await refresh(receipt.blockNumber);
        completeTrackedAction("Base confirmed the atomic action. The console recovered and updated automatically.");
      } catch (error) {
        failTrackedAction(error);
      } finally {
        resumingCallsRef.current = null;
        setPendingAction(null);
      }
    })();
  }, [
    address,
    clearStoredPendingCalls,
    client,
    completeTrackedAction,
    connectorClient,
    failTrackedAction,
    refresh,
    replaceTransactionProgress,
    waitForAtomicCalls,
  ]);

  async function approveExact() {
    if (!address || !client || !writesReady || parsedLockAmount <= 0n) return;
    setPendingAction("approval");
    beginTrackedAction(`Approve ${amount(parsedLockAmount)} NARA`, "Checking the exact approval against the current Engine address.");
    try {
      const simulation = await client.simulateContract({
        account: address,
        address: DEPLOYMENT.nara,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEPLOYMENT.engine, parsedLockAmount],
      });
      waitForWallet();
      const hash = await writeContractAsync(simulation.request);
      await finishTransaction(
        "Exact NARA approval",
        hash,
        "Approval is ready. Next: review and submit the lock when you choose.",
      );
    } catch (error) {
      failTrackedAction(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function enableTokenTrading() {
    if (
      !address
      || !client
      || !tradeWritesReady
      || parsedTradeInput <= 0n
      || tradeWalletActionLock.current
    ) return;

    const direction = tradeDirection;
    const config = TRADE[direction];
    const { input } = tradeTokenAddresses(direction);
    const activatingBaseAccount = baseAccountActivationStep;
    tradeWalletActionLock.current = true;
    setPendingAction("trade-token-setup");
    beginTrackedAction(`Allow ${config.inputSymbol} to Permit2`, "Checking the current access, token balance, and verified Permit2 address.");
    try {
      await verifyTradeDeployment(client);
      const allowances = await readTradeAllowances(client, address, direction);
      if (allowances.erc20 >= parsedTradeInput) {
        setTradeAllowances(allowances);
        completeTrackedAction(`${config.inputSymbol} access through Permit2 is already sufficient. No transaction was needed.`);
        return;
      }
      const approval = await client.simulateContract({
        account: address,
        address: input,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEPLOYMENT.permit2, parsedTradeInput],
      });
      waitForWallet();
      const approvalHash = await writeContractAsync(approval.request);
      await waitForTrackedTransaction(`${config.inputSymbol} → Permit2 access`, approvalHash);
      const [, provisioningState] = await Promise.all([
        refreshTradeAllowances(),
        refreshBaseAccountProvisioning(),
      ]);
      const capabilitiesResult = await refetchWalletCapabilities();
      const refreshedAtomicStatus = atomicCallsStatus(capabilitiesResult.data);
      if (activatingBaseAccount && provisioningState === "ready" && refreshedAtomicStatus === "supported") {
        persistTradeAtomicCompatibility(false);
      }
      completeTrackedAction(
        activatingBaseAccount && provisioningState === "ready" && refreshedAtomicStatus === "supported"
          ? `Base Account activated with exact ${amount(parsedTradeInput, config.inputDecimals, 6)} ${config.inputSymbol} access. Next: review the ${direction}; remaining setup is included atomically.`
          : activatingBaseAccount
            ? `Exact ${amount(parsedTradeInput, config.inputDecimals, 6)} ${config.inputSymbol} access is confirmed. Continue with the next visible action; the console will stay sequential until the wallet reports atomic support.`
          : `Permit2 can use exactly ${amount(parsedTradeInput, config.inputDecimals, 6)} ${config.inputSymbol}. No swap was submitted.`,
      );
    } catch (error) {
      failTrackedAction(error);
    } finally {
      tradeWalletActionLock.current = false;
      setPendingAction(null);
    }
  }

  async function enableRouterTrading() {
    if (
      !address
      || !client
      || !tradeWritesReady
      || parsedTradeInput <= 0n
      || tradeWalletActionLock.current
    ) return;

    const direction = tradeDirection;
    const { input } = tradeTokenAddresses(direction);
    tradeWalletActionLock.current = true;
    setPendingAction("trade-router-setup");
    beginTrackedAction(`Allow ${TRADE[direction].inputSymbol} to Router for 30 days`, "Checking Permit2 access for the verified Universal Router.");
    try {
      await verifyTradeDeployment(client);
      const allowances = await readTradeAllowances(client, address, direction);
      if (!reusableApprovalsReady(allowances, parsedTradeInput).erc20) {
        setTradeAllowances(allowances);
        throw new Error("Enable token trading first.");
      }
      if (reusableApprovalsReady(allowances, parsedTradeInput).permit2) {
        setTradeAllowances(allowances);
        completeTrackedAction(`Universal Router access is already active until ${dateTime(allowances.permit2Expiration)}. No transaction was needed.`);
        return;
      }
      const expiration = allowances.blockTimestamp + PERMIT2_APPROVAL_LIFETIME;
      const permitApproval = await client.simulateContract({
        account: address,
        address: DEPLOYMENT.permit2,
        abi: permit2Abi,
        functionName: "approve",
        args: [input, DEPLOYMENT.universalRouter, parsedTradeInput, expiration],
      });
      waitForWallet();
      const permitHash = await writeContractAsync(permitApproval.request);
      await waitForTrackedTransaction("30-day swap access", permitHash);
      await refreshTradeAllowances();
      completeTrackedAction(`Universal Router can use ${TRADE[direction].inputSymbol} through Permit2 until ${dateTime(expiration)}. No swap was submitted.`);
    } catch (error) {
      failTrackedAction(error);
    } finally {
      tradeWalletActionLock.current = false;
      setPendingAction(null);
    }
  }

  async function executeTrade() {
    if (
      !address
      || !client
      || !tradeWritesReady
      || !executableTradeQuote
      || parsedTradeInput <= 0n
      || !tradeBalanceReady
      || (!tradeAccessReady && !tradeAtomicReady)
      || tradeWalletActionLock.current
    ) return;

    const direction = tradeDirection;
    const config = TRADE[direction];
    const { input, output } = tradeTokenAddresses(direction);
    tradeWalletActionLock.current = true;
    setPendingAction("trade-swap");
    beginTrackedAction(
      `${config.inputSymbol} → ${config.outputSymbol} swap`,
      "Refreshing the quote, allowances, balance, and protected minimum before opening the wallet.",
    );

    try {
      await verifyTradeDeployment(client);
      const [liveInputBalance, outputBefore] = await Promise.all([
        client.readContract({
          address: input,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        client.readContract({
          address: output,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);
      if (liveInputBalance < parsedTradeInput) {
        throw new Error(`Wallet has insufficient ${config.inputSymbol}.`);
      }

      const allowances = await readTradeAllowances(client, address, direction);
      const ready = reusableApprovalsReady(allowances, parsedTradeInput);
      setTradeAllowances(allowances);
      if ((!ready.erc20 || !ready.permit2) && !tradeAtomicReady) {
        throw new Error("Trading access changed. Return to the Trade screen and complete the next setup action.");
      }

      patchTransactionProgress({
        stage: "checking",
        step: 0,
        detail: "Building and simulating the fresh slippage-protected swap.",
      });
      const freshQuote = await quoteTrade(client, address, direction, parsedTradeInput);
      const protectedMinimum = minimumAfterSlippage(freshQuote.amountOut, tradeSlippageBps);
      const executionBlock = await client.getBlock({ blockTag: "latest" });
      const routerCall = buildTradeRouterCall(
        direction,
        parsedTradeInput,
        protectedMinimum,
        executionBlock.timestamp,
      );
      const routerData = encodeFunctionData({
        abi: universalRouterAbi,
        functionName: "execute",
        args: [routerCall.commands, [...routerCall.inputs], routerCall.deadline],
      });
      let receipt;
      if (sponsoredAtomicReady || (tradeAtomicReady && (!ready.erc20 || !ready.permit2))) {
        const calls: SponsoredCall[] = [];
        if (!ready.erc20) {
          calls.push({
            to: input,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [DEPLOYMENT.permit2, parsedTradeInput],
            }),
          });
        }
        if (!ready.permit2) {
          calls.push({
            to: DEPLOYMENT.permit2,
            data: encodeFunctionData({
              abi: permit2Abi,
              functionName: "approve",
              args: [
                input,
                DEPLOYMENT.universalRouter,
                parsedTradeInput,
                routerCall.deadline,
              ],
            }),
          });
        }
        calls.push({ to: DEPLOYMENT.universalRouter, data: routerData });
        receipt = await submitAtomicCalls(
          `${config.inputSymbol} → ${config.outputSymbol} swap`,
          calls,
          sponsoredAtomicReady,
        );
      } else {
        const simulation = await client.simulateContract({
          account: address,
          address: DEPLOYMENT.universalRouter,
          abi: universalRouterAbi,
          functionName: "execute",
          args: [routerCall.commands, [...routerCall.inputs], routerCall.deadline],
        });
        waitForWallet();
        setTradeReviewOpen(false);
        const swapHash = await writeContractAsync(simulation.request);
        receipt = await waitForTrackedTransaction(`${config.inputSymbol} → ${config.outputSymbol} swap`, swapHash);
      }
      setTradeReviewOpen(false);

      // The submitted intent is consumed once Base confirms it. Clear it
      // before reconciliation so a slow read can never expose the same trade
      // as a live repeat action.
      setTradeAmount("");
      setTradeQuote(null);
      setTradeQuoteError(null);
      setTradeQuoteLoading(false);

      const [executedFeeEvent] = parseEventLogs({
        abi: [poolFeeTakenEvent],
        eventName: "PoolFeeTaken",
        logs: receipt.logs.filter((log) => log.address.toLowerCase() === DEPLOYMENT.hook.toLowerCase()),
        strict: true,
      });
      const executedFeeAmount = executedFeeEvent
        ? bigint(tupleValue(executedFeeEvent.args, "feeAmount", 4))
        : 0n;
      const executedAmountIn = executedFeeEvent
        ? bigint(tupleValue(executedFeeEvent.args, "amountIn", 3))
        : parsedTradeInput;
      const feeReceiptVerified = executedAmountIn === parsedTradeInput
        && executedFeeAmount <= executedAmountIn
        && (!!executedFeeEvent || freshQuote.feeAmount === 0n);
      const executedEffectiveFeeBps = executedAmountIn > 0n
        ? (executedFeeAmount * 10_000n) / executedAmountIn
        : 0n;

      const outputAfter = await client.readContract({
        address: output,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber: receipt.blockNumber,
      });
      const received = bigint(outputAfter) - bigint(outputBefore);
      if (received < protectedMinimum) {
        throw new Error("Confirmed output was below the protected minimum.");
      }

      const remaining = await readTradeAllowances(client, address, direction);
      setTradeAllowances(remaining);
      await refresh(receipt.blockNumber);
      completeTrackedAction(
        `Swap confirmed. Received ${amount(received, config.outputDecimals, 6)} ${config.outputSymbol}. Enter a new amount to trade again.`,
      );
      resumeSavedFundingIntent(direction);
      setFlash({
        tone: "success",
        message: feeReceiptVerified
          ? `Swap confirmed: ${amount(executedAmountIn, config.inputDecimals, 6)} ${config.inputSymbol} → ${amount(received, config.outputDecimals, 6)} ${config.outputSymbol}. NARA fee paid: ${amount(executedFeeAmount, config.inputDecimals, 6)} ${config.inputSymbol} (${rateFromBps(executedEffectiveFeeBps)}). Pool fee: ${DEPLOYMENT.poolFee / 10_000}% included.`
          : `Swap confirmed: received ${amount(received, config.outputDecimals, 6)} ${config.outputSymbol}. The on-chain NARA fee receipt could not be matched; use the transaction link for verification.`,
      });
    } catch (error) {
      try {
        await refreshTradeAllowances();
      } catch {
        // The original failure remains the useful error for the operator.
      }
      failTrackedAction(error);
      if (connectedWithBaseAccount && !tradeAccessReady) setTradeReviewOpen(false);
    } finally {
      tradeWalletActionLock.current = false;
      setPendingAction(null);
    }
  }

  async function revokeTradeApprovals() {
    if (
      !address
      || !client
      || !tradeWritesReady
      || !hasTradeAccess
      || tradeWalletActionLock.current
    ) return;
    const direction = tradeDirection;
    const config = TRADE[direction];
    const { input } = tradeTokenAddresses(direction);
    tradeWalletActionLock.current = true;
    setPendingAction("trade-revoke");
    beginTrackedAction(`Revoke ${config.inputSymbol} trading access`, "Checking which of the two approval layers is still active.");
    try {
      await verifyTradeDeployment(client);
      const allowances = await readTradeAllowances(client, address, direction);
      if (allowances.permit2Amount > 0n) {
        const permitReset = await client.simulateContract({
          account: address,
          address: DEPLOYMENT.permit2,
          abi: permit2Abi,
          functionName: "approve",
          args: [input, DEPLOYMENT.universalRouter, 0n, 0n],
        });
        waitForWallet();
        const permitResetHash = await writeContractAsync(permitReset.request);
        await waitForTrackedTransaction("Swap access revoke", permitResetHash);
        await refreshTradeAllowances();
        completeTrackedAction(`Router access revoked. Permit2 still has ${config.inputSymbol} token access; choose the final revoke action if you want to remove it.`);
      } else if (allowances.erc20 > 0n) {
        const tokenReset = await client.simulateContract({
          account: address,
          address: input,
          abi: erc20Abi,
          functionName: "approve",
          args: [DEPLOYMENT.permit2, 0n],
        });
        waitForWallet();
        const tokenResetHash = await writeContractAsync(tokenReset.request);
        await waitForTrackedTransaction(`${config.inputSymbol} trading revoke`, tokenResetHash);
        await refreshTradeAllowances();
        completeTrackedAction(`Permit2 ${config.inputSymbol} token access revoked. Both trading-access layers are now removed.`);
      } else {
        setTradeAllowances(allowances);
        completeTrackedAction("Trading access is already revoked. No transaction was needed.");
      }
    } catch (error) {
      failTrackedAction(error);
    } finally {
      tradeWalletActionLock.current = false;
      setPendingAction(null);
    }
  }

  async function createLock() {
    if (
      !address
      || !client
      || !state
      || !writesReady
      || !previewWeight
      || (!approvalReady && !sponsoredAtomicReady)
      || !balanceReady
    ) return;
    setPendingAction("lock");
    beginTrackedAction(
      `Lock ${amount(parsedLockAmount)} NARA`,
      "Checking the current Engine fees, approval, balance, duration, and minimum score.",
    );
    try {
      if (sponsoredAtomicReady) {
        const calls: SponsoredCall[] = [];
        if (!approvalReady) {
          calls.push({
            to: DEPLOYMENT.nara,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [DEPLOYMENT.engine, parsedLockAmount],
            }),
          });
        }
        calls.push({
          to: DEPLOYMENT.engine,
          data: encodeFunctionData({
            abi: engineAbi,
            functionName: "lock",
            args: [parsedLockAmount, BigInt(durationEpochs), minWeight],
          }),
          value: state.lockFeeWei,
        });
        const receipt = await submitAtomicCalls(`Lock ${amount(parsedLockAmount)} NARA`, calls, true);
        await refresh(receipt.blockNumber);
        completeTrackedAction("Lock confirmed. The new position is loaded under Your locks.");
        clearSavedFundingIntent();
        setLockAmount("");
        setLockComposerOpen(false);
        return;
      }
      const simulation = await client.simulateContract({
        account: address,
        address: DEPLOYMENT.engine,
        abi: engineAbi,
        functionName: "lock",
        args: [parsedLockAmount, BigInt(durationEpochs), minWeight],
        value: state.lockFeeWei,
      });
      waitForWallet();
      const hash = await writeContractAsync(simulation.request);
      await finishTransaction(
        `Lock ${amount(parsedLockAmount)} NARA`,
        hash,
        "Lock confirmed. The new position is loaded under Your locks.",
      );
      clearSavedFundingIntent();
      setLockAmount("");
      setLockComposerOpen(false);
    } catch (error) {
      failTrackedAction(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function claimPosition(position: Position) {
    if (!address || !client || !writesReady) return;
    setPendingAction(`claim-${position.id}`);
    beginTrackedAction(`Claim position #${position.id}`, "Checking claimable allocations and simulating the claim.");
    try {
      if (sponsoredAtomicReady) {
        const receipt = await submitAtomicCalls(`Claim position #${position.id}`, [{
          to: DEPLOYMENT.engine,
          data: encodeFunctionData({
            abi: engineAbi,
            functionName: "claimRewards",
            args: [position.id, address],
          }),
        }], true);
        setPositionReview(null);
        await refresh(receipt.blockNumber);
        completeTrackedAction(`Claim confirmed. Position #${position.id} remains locked and its allocations are updated.`);
        return;
      }
      const simulation = await client.simulateContract({
        account: address,
        address: DEPLOYMENT.engine,
        abi: engineAbi,
        functionName: "claimRewards",
        args: [position.id, address],
      });
      waitForWallet();
      setPositionReview(null);
      const hash = await writeContractAsync(simulation.request);
      await finishTransaction(
        `Claim position #${position.id}`,
        hash,
        `Claim confirmed. Position #${position.id} remains locked and its allocations are updated.`,
      );
    } catch (error) {
      failTrackedAction(error);
    } finally {
      setPendingAction(null);
    }
  }

  async function unlockPosition(position: Position) {
    if (!address || !client || !state || !writesReady) return;
    setPendingAction(`unlock-${position.id}`);
    beginTrackedAction(
      `Unlock position #${position.id}`,
      "Checking maturity, the current unlock fee, and the principal return before opening the wallet.",
    );
    try {
      if (sponsoredAtomicReady) {
        const receipt = await submitAtomicCalls(`Unlock position #${position.id}`, [{
          to: DEPLOYMENT.engine,
          data: encodeFunctionData({
            abi: engineAbi,
            functionName: "unlock",
            args: [position.id],
          }),
          value: state.unlockFeeWei,
        }], true);
        setPositionReview(null);
        await refresh(receipt.blockNumber);
        completeTrackedAction(`Unlock confirmed. Position #${position.id} is closed and the returned balance is updated.`);
        clearSavedFundingIntent();
        return;
      }
      const simulation = await client.simulateContract({
        account: address,
        address: DEPLOYMENT.engine,
        abi: engineAbi,
        functionName: "unlock",
        args: [position.id],
        value: state.unlockFeeWei,
      });
      waitForWallet();
      setPositionReview(null);
      const hash = await writeContractAsync(simulation.request);
      await finishTransaction(
        `Unlock position #${position.id}`,
        hash,
        `Unlock confirmed. Position #${position.id} is closed and the returned balance is updated.`,
      );
      clearSavedFundingIntent();
    } catch (error) {
      failTrackedAction(error);
    } finally {
      setPendingAction(null);
    }
  }

  function importPositionId() {
    if (!address) return;
    try {
      const id = BigInt(manualPositionInput.trim());
      if (id <= 0n) throw new Error("Position ID must be positive.");
      const next = [...new Set([...manualPositionIds.map(String), id.toString()])].map(BigInt);
      setManualPositionIds(next);
      localStorage.setItem(
        `${POSITION_STORAGE_PREFIX}${address.toLowerCase()}`,
        JSON.stringify(next.map(String)),
      );
      setManualPositionInput("");
      setFlash({ tone: "info", message: `Position #${id} added to this browser's recovery list.` });
    } catch (error) {
      setFlash({ tone: "error", message: readError(error) });
    }
  }

  const nextEpochAt = state
    ? state.genesisTimestamp + (state.currentEpoch + 1n) * state.epochLength
    : 0n;
  const epochBacklog = state && state.currentEpoch > state.storedEpoch
    ? state.currentEpoch - state.storedEpoch
    : 0n;
  const openPositions = positions.filter((position) => position.amount > 0n);
  const scheduledUserWeight = openPositions.reduce((sum, position) => sum + position.weight, 0n);
  const activeUserPositions = state
    ? openPositions.filter(
      (position) => state.storedEpoch >= position.activationEpoch && state.storedEpoch < position.unlockEpoch,
    )
    : [];
  const pendingPositions = state
    ? openPositions
      .filter((position) => state.storedEpoch < position.activationEpoch)
      .sort((a, b) => (a.activationEpoch < b.activationEpoch ? -1 : 1))
    : [];
  const maturedPositions = state
    ? openPositions
      .filter((position) => state.storedEpoch >= position.unlockEpoch)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
    : [];
  const nextMaturedPosition = maturedPositions[0];
  const nextPendingPosition = pendingPositions[0];
  const readiness = tab === "trade"
    ? actionReadiness({
        connected: isConnected,
        onBase: isOnBase,
        loading: loading || !state,
        intent: tradeDirection,
        amount: parsedTradeInput,
        assetBalance: tradeInputBalance ?? 0n,
        ethBalance: state?.ethBalance ?? 0n,
        protocolFeeWei: 0n,
        gasSponsored: false,
      })
    : tab === "positions"
      ? actionReadiness({
          connected: isConnected,
          onBase: isOnBase,
          loading: loading || !state,
          intent: !lockComposerOpen && nextMaturedPosition ? "unlock" : "lock",
          amount: !lockComposerOpen && nextMaturedPosition ? 1n : parsedLockAmount,
          assetBalance: !lockComposerOpen && nextMaturedPosition
            ? 1n
            : state?.naraBalance ?? 0n,
          ethBalance: state?.ethBalance ?? 0n,
          protocolFeeWei: !lockComposerOpen && nextMaturedPosition
            ? state?.unlockFeeWei ?? 0n
            : state?.lockFeeWei ?? 0n,
          gasSponsored: false,
        })
      : null;

  useEffect(() => {
    if (!fundingAsset || !readiness || readiness.state === "checking") return;
    const stillMissing = fundingAsset === "USDC"
      ? readiness.action === "add-usdc"
      : readiness.action === "add-base-eth";
    if (stillMissing) return;
    setFundingAsset(null);
    setFundingError(null);
    setFlash({ tone: "info", message: `${fundingAsset} balance detected on Base. Continue with the selected action.` });
  }, [fundingAsset, readiness]);

  function saveCurrentIntent() {
    if (tab === "trade") {
      saveFundingIntent({ kind: "trade", tradeDirection, tradeAmount });
      return;
    }
    if (!lockComposerOpen && nextMaturedPosition) {
      saveFundingIntent({ kind: "unlock" });
      return;
    }
    saveFundingIntent({ kind: "lock", lockAmount, durationEpochs });
  }

  function focusAmountInput() {
    const target = tab === "trade" ? "trade-amount" : "lock-amount";
    document.getElementById(target)?.focus();
  }

  function handleReadinessAction() {
    if (!readiness) return;
    if (readiness.action === "switch-base") {
      switchChain({ chainId: BASE_CHAIN_ID });
    } else if (readiness.action === "enter-amount") {
      focusAmountInput();
    } else if (readiness.action === "add-usdc") {
      saveCurrentIntent();
      setFundingAsset("USDC");
    } else if (readiness.action === "add-base-eth") {
      saveCurrentIntent();
      setFundingAsset("ETH");
    } else if (readiness.action === "add-nara") {
      saveCurrentIntent();
      setTradeDirection("buy");
      setTradeAmount("");
      setTab("trade");
      window.requestAnimationFrame(() => document.getElementById("trade-amount")?.focus());
    }
  }

  async function copyFundingAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setFundingError(null);
      setFlash({ tone: "info", message: "Base wallet address copied." });
    } catch {
      setFundingError("Copy is unavailable in this browser. Press and hold the address below to copy it.");
    }
  }

  async function switchToBaseAppWallet() {
    if (!address || switchingBaseAppWallet) return;
    const expectedAddress = address.toLowerCase();
    const browserWallet = connectors.find((candidate) => candidate.id === "injected");
    if (!inBaseAppBrowser || !browserWallet) {
      setFlash({ tone: "error", message: "Open this site inside the Base app Explorer before switching wallets." });
      return;
    }

    setSwitchingBaseAppWallet(true);
    try {
      await disconnectAsync();
      const result = await connectAsync({ connector: browserWallet, chainId: BASE_CHAIN_ID });
      const nextAddress = result.accounts[0];
      if (!nextAddress || nextAddress.toLowerCase() !== expectedAddress) {
        await disconnectAsync({ connector: browserWallet });
        throw new Error("The Base app wallet address did not match. Nothing was submitted.");
      }
      replaceTransactionProgress(null);
      setFlash({
        tone: "info",
        message: "Connected through Base app Browser Wallet at the same address. No transaction was submitted.",
      });
    } catch (error) {
      setFlash({ tone: "error", message: walletErrorMessage(error) });
    } finally {
      setSwitchingBaseAppWallet(false);
    }
  }

  async function startCoinbaseFunding() {
    if (!address || !fundingAsset || fundingBusy) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setFundingBusy(true);
    setFundingError(null);
    try {
      const challengeResponse = await fetch(`/api/onramp-session?address=${encodeURIComponent(address)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const challenge = await challengeResponse.json().catch(() => ({}));
      if (!challengeResponse.ok || typeof challenge.message !== "string" || typeof challenge.nonce !== "string") {
        throw new Error(challenge.error || "Coinbase funding is unavailable.");
      }

      const signature = await signMessageAsync({ message: challenge.message });
      const sessionResponse = await fetch("/api/onramp-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          address,
          asset: fundingAsset,
          nonce: challenge.nonce,
          message: challenge.message,
          signature,
        }),
      });
      const session = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || typeof session.url !== "string") {
        throw new Error(session.error || "Coinbase funding is unavailable.");
      }
      const destination = new URL(session.url);
      if (destination.origin !== "https://pay.coinbase.com") {
        throw new Error("Funding provider returned an unexpected destination.");
      }
      if (popup) popup.location.replace(destination.toString());
      else window.location.assign(destination.toString());
      setFundingAsset(null);
      setFlash({
        tone: "info",
        message: `Coinbase funding opened for ${fundingAsset} on Base. This console will refresh when you return.`,
      });
    } catch (error) {
      popup?.close();
      setFundingError(readError(error));
    } finally {
      setFundingBusy(false);
    }
  }

  return (
    <div className={`shell ${transactionProgress ? "transaction-visible" : ""}`}>
      <header className="header">
        <div className="brand-lockup">
          <div className="wordmark">NARA</div>
          <div>
            <div className="product-name">v4 test console <span>Internal</span></div>
            <p>Connected production smoke testing on Base</p>
          </div>
        </div>
        <div className="header-actions">
          <details className="mobile-handoff">
            <summary>
              <span className="mobile-handoff-icon" aria-hidden="true" />
              Open site on phone
            </summary>
            <div className="mobile-handoff-panel">
              <span className="eyebrow">Website handoff</span>
              <strong>Scan to open this site</strong>
              <img
                src="/mobile-preview-qr.svg"
                alt={`QR code for ${MOBILE_PREVIEW_URL}`}
                width="240"
                height="240"
              />
              <code className="mobile-handoff-url">app.naraprotocol.com</code>
              <a href={MOBILE_PREVIEW_URL} target="_blank" rel="noreferrer">Open site ↗</a>
            </div>
          </details>
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>
      </header>

      <section className="truth-rail" aria-label="Deployment status">
        <div><StatusDot ok={contractsVerified} /> Core bytecode {contractsVerified ? "verified" : "unavailable"}</div>
        <div><StatusDot ok={isOnBase} /> {isOnBase ? "Base 8453" : `Wrong chain ${chainId}`}</div>
        <div className="mono">{DEPLOYMENT.changeId}</div>
      </section>

      {!isOnBase && isConnected ? (
        <div className="banner warning">
          <span>Writes are blocked until the connected wallet is on Base.</span>
          <button type="button" onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}>Switch to Base</button>
        </div>
      ) : null}

      {isConnected && connectedWithBaseAccount && inBaseAppBrowser ? (
        <div className="banner info" role="status">
          <span>Base app detected. Switch the cached passkey connection to this app's wallet before continuing.</span>
          <button
            type="button"
            disabled={switchingBaseAppWallet}
            onClick={() => void switchToBaseAppWallet()}
          >
            {switchingBaseAppWallet ? "Switching wallet..." : "Use Base app wallet"}
          </button>
        </div>
      ) : null}

      {flash ? (
        <div className={`banner ${flash.tone}`} role={flash.tone === "error" ? "alert" : "status"}>
          <span>{flash.message}</span>
          {lastTx ? <a href={baseScanTx(lastTx)} target="_blank" rel="noreferrer">View transaction ↗</a> : null}
        </div>
      ) : null}

      <nav className="tabs" aria-label="Console sections">
        {(["overview", "positions", "trade", "nfts"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item === "nfts"
              ? "NFTs"
              : item === "trade"
                ? "NARAswap"
                : item[0].toUpperCase() + item.slice(1)}
            {item === "positions" && positions.length > 0 ? <span className="count">{positions.length}</span> : null}
          </button>
        ))}
      </nav>

      {readiness ? <ActionReadiness readiness={readiness} onAction={handleReadinessAction} /> : null}

      <main>
        {tab === "overview" ? (
          <div className="page-grid">
            <section className="panel span-2">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Live state</span>
                  <h1>Protocol overview</h1>
                </div>
                <button className="secondary" type="button" onClick={() => void refresh()} disabled={loading}>
                  {loading ? "Reading…" : "Refresh"}
                </button>
              </div>
              <div className="metrics-grid">
                <Metric label="Current epoch" value={state ? integer(state.currentEpoch) : "—"} detail={`Next ${dateTime(nextEpochAt)}`} />
                <Metric label="Stored epoch" value={state ? integer(state.storedEpoch) : "—"} detail={epochBacklog === 0n ? "In sync" : `${epochBacklog} behind`} />
                <Metric label="Total locked" value={state ? `${amount(state.totalLocked)} NARA` : "—"} />
                <Metric
                  label="Your positions earning now"
                  value={isConnected ? activeUserPositions.length.toString() : "—"}
                  detail={nextPendingPosition ? `Next starts at epoch ${nextPendingPosition.activationEpoch}` : undefined}
                />
              </div>
              <div className="market-grid" aria-label="NARA market data">
                <Metric
                  label="NARA pool price"
                  value={state?.market ? usd(state.market.spotPriceUsdcWad, 6) : "—"}
                  detail={state?.market
                    ? `Pool spot estimate · not an oracle · block ${integer(state.blockNumber)}`
                    : "Pool spot estimate · not an oracle"}
                />
                <Metric
                  label="Pre-allocation market cap estimate"
                  value={state?.market ? usd(state.market.provisionalMarketCapUsdcWad) : "—"}
                  detail={state?.market
                    ? `${amount(state.market.provisionalCirculatingSupply, 18, 0)} NARA × pool spot · allocations pending`
                    : state?.marketReadError || "Market read unavailable"}
                />
                <Metric
                  label="Fully diluted value estimate"
                  value={state?.market ? usd(state.market.fullyDilutedValueUsdcWad) : "—"}
                  detail={state?.market
                    ? `${amount(state.market.totalSupply, 18, 0)} NARA total supply × pool spot`
                    : "—"}
                />
              </div>
              <details className="market-method">
                <summary>Market cap method</summary>
                <p>
                  These estimates use the current NARA/USDC pool spot, which a trade can move. The pre-allocation supply subtracts only the funded Reward Reserve and burn balances. The planned post-allocation supply starts near 110,000 NARA only after 200,000 NARA enters the Bond Vault and 40,000 NARA enters team vesting. Bond inventory and authorised-market balances remain excluded until released; NARA released to a user counts as circulating even if that user later locks it in the Engine. The UI will read the immutable market supply oracle after deployment.
                </p>
              </details>
              {isConnected && openPositions.length > 0 ? (
                <div className="activation-summary">
                  <div className="activation-copy">
                    <span className="eyebrow">Your reward schedule</span>
                    <strong>{activeUserPositions.length} earning · {pendingPositions.length} waiting</strong>
                    <p>
                      {pendingPositions.length > 0
                        ? "Each position begins automatically at its activation epoch. No manual activation is required."
                        : "Your open positions have reached their activation epochs."}
                    </p>
                  </div>
                  <div className="activation-list">
                    {openPositions.map((position) => {
                      const waiting = !!state && state.storedEpoch < position.activationEpoch;
                      const earning = !!state && state.storedEpoch >= position.activationEpoch && state.storedEpoch < position.unlockEpoch;
                      return (
                        <div key={position.id.toString()}>
                          <span>Position #{position.id.toString()}</span>
                          <code>{state ? earningWindow(position, state.epochLength) : "—"}</code>
                          <b>{waiting ? `Starts epoch ${position.activationEpoch}` : earning ? "Earning now" : "Lock complete"}</b>
                        </div>
                      );
                    })}
                  </div>
                  <details className="technical-details">
                    <summary>How reward share works</summary>
                    <p>
                      The contract calls it weight. It is not NARA, money, or an earnings estimate. While a position is active, its share of that epoch's position rewards equals its score divided by the total score of every active position.
                    </p>
                    <code>Combined on-chain score: {amount(scheduledUserWeight)}</code>
                  </details>
                </div>
              ) : null}
            </section>

            <section className="panel">
              <span className="eyebrow">Connected wallet</span>
              <h2>Balances</h2>
              {isConnected ? (
                <>
                  <div className="balance-list">
                    <div><span>NARA</span><strong>{state ? amount(state.naraBalance) : "—"}</strong></div>
                    <div><span>USDC</span><strong>{state ? amount(state.usdcBalance, 6, 2) : "—"}</strong></div>
                    <div><span>ETH</span><strong>{state ? amount(state.ethBalance, 18, 6) : "—"}</strong></div>
                  </div>
                  <div className="balance-funding-actions" aria-label="Add funds to this Base wallet">
                    <button className="secondary" type="button" onClick={() => setFundingAsset("USDC")}>Add USDC</button>
                    <button className="secondary" type="button" onClick={() => setFundingAsset("ETH")}>Add ETH</button>
                  </div>
                </>
              ) : <p className="muted">Connect to load wallet balances.</p>}
            </section>

            <section className="panel">
              <span className="eyebrow">Binding</span>
              <h2>Verified deployment</h2>
              <div className="address-list">
                <a href={baseScanAddress(DEPLOYMENT.engine)} target="_blank" rel="noreferrer">
                  <span>Engine</span><code>{shortAddress(DEPLOYMENT.engine)}</code>
                </a>
                <a href={baseScanAddress(DEPLOYMENT.nara)} target="_blank" rel="noreferrer">
                  <span>NARA</span><code>{shortAddress(DEPLOYMENT.nara)}</code>
                </a>
                <div><span>Origin</span><code>{shortAddress(DEPLOYMENT.originCommit, 7, 7)}</code></div>
                <div><span>Read block</span><code>{state ? integer(state.blockNumber) : "—"}</code></div>
              </div>
            </section>

            <section className="panel span-2 note-panel">
              <span className="eyebrow">Safety model</span>
              <h2>The console never holds a signing key</h2>
              <p>It reads canonical addresses and ABIs from this repository, simulates each write, then asks the connected wallet to confirm. No transaction is sent automatically.</p>
            </section>
          </div>
        ) : null}

        {tab === "positions" ? (
          !isConnected ? <EmptyConnection /> : (
            <div className="positions-page">
              {nextMaturedPosition ? (
                <section className="position-next-step" aria-labelledby="position-next-step-title">
                  <div>
                    <span className="eyebrow">Next action · 1 of {maturedPositions.length}</span>
                    <h1 id="position-next-step-title">Unlock position #{nextMaturedPosition.id.toString()}</h1>
                    <code>{amount(nextMaturedPosition.amount)} NARA</code>
                  </div>
                  <div className="next-step-action">
                    <button
                      className="primary"
                      type="button"
                      disabled={!writesReady}
                      onClick={() => openPositionReview({ kind: "unlock", position: nextMaturedPosition })}
                    >
                      Unlock {amount(nextMaturedPosition.amount)} NARA
                    </button>
                  </div>
                </section>
              ) : null}

              <div className="positions-layout">
              <details
                className="panel lock-panel lock-disclosure"
                open={openPositions.length === 0 || lockComposerOpen}
                onToggle={(event) => setLockComposerOpen(event.currentTarget.open)}
              >
                <summary className="lock-summary">
                  <div>
                    <span className="eyebrow">Optional</span>
                    <h1>{openPositions.length > 0 ? "Create another lock" : "Lock NARA"}</h1>
                  </div>
                  <span className="step-label">{sponsoredAtomicReady ? "1 atomic transaction" : "2 wallet confirmations"}</span>
                </summary>

                <div className="lock-form-body">

                <label className="field">
                  <span>Amount</span>
                  <div className="amount-input">
                    <input
                      id="lock-amount"
                      inputMode="decimal"
                      value={lockAmount}
                      onChange={(event) => setLockAmount(event.target.value)}
                      aria-describedby="lock-balance"
                    />
                    <b>NARA</b>
                  </div>
                  <small id="lock-balance">Balance {state ? amount(state.naraBalance) : "—"} NARA</small>
                </label>

                <label className="field">
                  <span>Duration in epochs</span>
                  <input
                    className="text-input mono"
                    inputMode="numeric"
                    value={durationEpochs}
                    onChange={(event) => setDurationEpochs(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <small>
                    Allowed {state ? `${state.activationDelayEpochs + 1n}–${state.maxLockEpochs}` : "—"}; one epoch is {state ? `${state.epochLength / 60n} minutes` : "—"}.
                  </small>
                </label>

                <div className="review-box">
                  <div><span>You provide</span><code>{amount(parsedLockAmount)} NARA</code></div>
                  <div><span>NARA lock fee</span><code>{state ? `${amount(lockTokenFee)} NARA · ${rateFromBps(state.lockFeeBps)}` : "—"}</code></div>
                  <div><span>NARA locked</span><code>{amount(lockedPrincipal)} NARA</code></div>
                  <div><span>Engine transaction fee</span><code>{state ? `${formatEther(state.lockFeeWei)} ETH` : "—"}</code></div>
                  <div><span>Network gas</span><code>{sponsoredAtomicReady ? "Sponsored · Engine ETH fee still applies" : "Shown by wallet"}</code></div>
                  <div><span>Minimum weight</span><code>{previewWeight ? amount(minWeight) : "—"}</code></div>
                  <div><span>Current allowance</span><code>{state ? `${amount(state.allowance)} NARA` : "—"}</code></div>
                </div>

                {previewError ? <p className="inline-error">{previewError}</p> : null}
                {!balanceReady && parsedLockAmount > 0n ? <p className="inline-error">Connected wallet has insufficient NARA.</p> : null}

                <div className="action-stack">
                  {!sponsoredAtomicReady ? (
                    <button
                      className="secondary full"
                      type="button"
                      onClick={() => void approveExact()}
                      disabled={!writesReady || parsedLockAmount <= 0n || !balanceReady || approvalReady}
                    >
                      {progressButtonLabel(
                        transactionProgress,
                        pendingAction === "approval",
                        approvalReady ? "Exact approval ready" : `1. Approve ${amount(parsedLockAmount)} NARA`,
                      )}
                    </button>
                  ) : null}
                  <button
                    className="primary full"
                    type="button"
                    onClick={() => void createLock()}
                    disabled={!writesReady || !previewWeight || (!approvalReady && !sponsoredAtomicReady) || !balanceReady}
                  >
                    {progressButtonLabel(
                      transactionProgress,
                      pendingAction === "lock",
                      parsedLockAmount <= 0n
                        ? "Enter an amount to continue"
                        : sponsoredAtomicReady
                          ? "Confirm atomic lock"
                          : approvalReady
                            ? "2. Confirm lock"
                            : "2. Approve first",
                    )}
                  </button>
                </div>
                <p className="risk-copy">NARA remains unavailable until the position matures. The Engine has no early principal exit.</p>
                </div>
              </details>

              <section className="positions-column">
                <div className="section-heading positions-title">
                  <div>
                    <span className="eyebrow">Connected wallet</span>
                    <h1>Your locks</h1>
                  </div>
                  <button className="secondary" type="button" onClick={() => void refresh()} disabled={loading}>
                    {loading ? "Scanning…" : "Refresh"}
                  </button>
                </div>

                <details className="position-recovery">
                  <summary>Can't see one of your locks?</summary>
                  <div className="import-row">
                    <label htmlFor="position-id">Add its on-chain position number</label>
                    <div>
                      <input
                        id="position-id"
                        className="text-input mono"
                        inputMode="numeric"
                        placeholder="Position number"
                        value={manualPositionInput}
                        onChange={(event) => setManualPositionInput(event.target.value.replace(/[^0-9]/g, ""))}
                      />
                      <button className="secondary" type="button" onClick={importPositionId}>Add lock</button>
                    </div>
                  </div>
                </details>

                {positions.length === 0 && !loading ? (
                  <div className="empty-state small">
                    <h2>No locks found</h2>
                    <p>Create one with the lock form or add a known on-chain position number.</p>
                  </div>
                ) : null}

                <div className="position-list">
                  {positions.map((position) => {
                    const status = positionStatus(position, state?.storedEpoch ?? 0n);
                    const claimable = position.claimableNara > 0n || position.claimableEth > 0n;
                    const matured = position.amount > 0n && !!state && state.storedEpoch >= position.unlockEpoch;
                    const earning = status.tone === "success";
                    const rewardShare = earning && state && state.activeTotalWeight > 0n
                      ? percentage(position.weight, state.activeTotalWeight)
                      : null;
                    const createdTime = state
                      ? state.genesisTimestamp + position.createdEpoch * state.epochLength
                      : 0n;
                    const activationTime = state
                      ? state.genesisTimestamp + position.activationEpoch * state.epochLength
                      : 0n;
                    const unlockTime = state
                      ? state.genesisTimestamp + position.unlockEpoch * state.epochLength
                      : 0n;
                    return (
                      <article className={`position-card ${matured ? "complete" : ""}`} key={position.id.toString()}>
                        <div className="position-header">
                          <div>
                            <span className="eyebrow">Locked position</span>
                            <h2>Position #{position.id.toString()}</h2>
                          </div>
                          <span className={`status-chip ${status.tone}`}>{status.label}</span>
                        </div>
                        <div className="position-primary">
                          <div className="position-amount">
                            <span>{matured ? "Ready to return" : "Locked amount"}</span>
                            <strong>{amount(position.amount)} NARA</strong>
                          </div>
                          <div className="position-weight">
                            <span>{matured ? "Lock ended" : "Earning window"}</span>
                            <strong>{matured ? dateTime(unlockTime) : state ? earningWindow(position, state.epochLength) : "—"}</strong>
                          </div>
                        </div>
                        <div className="position-timeline">
                          <div><span>Created</span><b>{dateTime(createdTime)}</b><small>Epoch {position.createdEpoch.toString()}</small></div>
                          <div><span>Started earning</span><b>{dateTime(activationTime)}</b><small>Epoch {position.activationEpoch.toString()}</small></div>
                          <div><span>{matured ? "Lock completed" : "Unlock available"}</span><b>{dateTime(unlockTime)}</b><small>Epoch {position.unlockEpoch.toString()}</small></div>
                        </div>
                        {!matured ? (
                          <div className="reward-facts">
                            <div>
                              <span>Reward share now</span>
                              <strong>{rewardShare ?? (status.tone === "info" ? `Calculated at epoch ${position.activationEpoch}` : "Not earning now")}</strong>
                            </div>
                            <div>
                              <span>Lock-duration boost</span>
                              <strong>{durationBoost(position.weight, position.amount)}</strong>
                            </div>
                            <div>
                              <span>Accrued allocations</span>
                              <strong>{allocationAmount(position.claimableNara)} NARA · {allocationAmount(position.claimableEth)} ETH</strong>
                            </div>
                          </div>
                        ) : null}
                        {status.tone === "info" ? (
                          <p className="earning-note">
                            Earnings are zero until stored epoch {position.activationEpoch}. Future rewards cannot be exact in advance because they depend on that epoch's emission and total active weight.
                          </p>
                        ) : status.tone === "success" ? (
                          <p className="earning-note">This position is active. Exact claimable rewards update as Engine epochs are processed.</p>
                        ) : null}
                        <details className="position-technical">
                          <summary>Details</summary>
                          {matured ? (
                            <>
                              <div><span>Created</span><code>{dateTime(createdTime)} · epoch {position.createdEpoch.toString()}</code></div>
                              <div><span>Started earning</span><code>{dateTime(activationTime)} · epoch {position.activationEpoch.toString()}</code></div>
                              <div><span>Lock completed</span><code>{dateTime(unlockTime)} · epoch {position.unlockEpoch.toString()}</code></div>
                              <div><span>Accrued allocations</span><code>{allocationAmount(position.claimableNara)} NARA · {allocationAmount(position.claimableEth)} ETH</code></div>
                            </>
                          ) : null}
                          <div><span>On-chain weight score</span><code>{amount(position.weight)}</code></div>
                          <div><span>Reward-share formula</span><code>position score ÷ total active score</code></div>
                          {matured && claimable ? (
                            <button
                              className="text-action technical-claim"
                              type="button"
                              disabled={!writesReady}
                              onClick={() => openPositionReview({ kind: "claim", position })}
                            >Claim allocations without unlocking</button>
                          ) : null}
                        </details>
                        {position.amount > 0n && matured ? (
                          <div className="position-actions single-action">
                            <button
                              className="primary"
                              type="button"
                              disabled={!writesReady}
                              onClick={() => openPositionReview({ kind: "unlock", position })}
                            >Unlock {amount(position.amount)} NARA</button>
                          </div>
                        ) : position.amount > 0n ? (
                          <div className="position-actions">
                            {claimable ? (
                              <button
                                className="secondary"
                                type="button"
                                disabled={!writesReady}
                                onClick={() => openPositionReview({ kind: "claim", position })}
                              >Review accrued allocations</button>
                            ) : <span className="no-action-needed">No action needed now</span>}
                          </div>
                        ) : null}
                        {!matured && position.amount > 0n ? (
                          <p className="card-note">Unlock becomes available {dateTime(unlockTime)}.</p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
              </div>
            </div>
          )
        ) : null}

        {tab === "trade" ? (
          <div className="trade-layout">
            <section className="panel trade-panel">
              <div className="section-heading compact">
                <div>
                  <span className="eyebrow">Direct v4 swap · exact input</span>
                  <h1>NARAswap</h1>
                </div>
                <span className={`step-label ${tradeDeploymentVerified ? "verified" : ""}`}>
                  {tradeDeploymentVerified ? "Route verified" : "Checking route"}
                </span>
              </div>

              {naraSwapWalletBlocked ? (
                <div className="banner warning" role="alert">
                  <span>Hosted Base Account is disabled for NARAswap. Use Coinbase Wallet, Uniswap Wallet, WalletConnect, MetaMask, or a wallet browser.</span>
                  <button type="button" onClick={() => void disconnectAsync()}>Choose another wallet</button>
                </div>
              ) : null}

              <div className="direction-switch" role="group" aria-label="Trade direction">
                <button
                  type="button"
                  className={tradeDirection === "buy" ? "active" : ""}
                  aria-pressed={tradeDirection === "buy"}
                  onClick={() => {
                    setTradeDirection("buy");
                    setTradeAmount("");
                  }}
                >USDC → NARA</button>
                <button
                  type="button"
                  className={tradeDirection === "sell" ? "active" : ""}
                  aria-pressed={tradeDirection === "sell"}
                  onClick={() => {
                    setTradeDirection("sell");
                    setTradeAmount("");
                  }}
                >NARA → USDC</button>
              </div>

              <label className="field">
                <span>Amount you provide</span>
                <div className="amount-input">
                  <input
                    id="trade-amount"
                    inputMode="decimal"
                    value={tradeAmount}
                    onChange={(event) => setTradeAmount(event.target.value)}
                    aria-describedby="trade-balance"
                  />
                  <b>{tradeConfig.inputSymbol}</b>
                </div>
                <small id="trade-balance">
                  {isConnected
                    ? `Wallet balance ${tradeInputBalance === undefined ? "—" : amount(tradeInputBalance, tradeConfig.inputDecimals)} ${tradeConfig.inputSymbol}`
                    : "Connect a wallet to compare the amount with your balance."}
                </small>
              </label>

              <label className="field trade-slippage">
                <span>Slippage limit</span>
                <select
                  value={tradeSlippageBps.toString()}
                  onChange={(event) => setTradeSlippageBps(BigInt(event.target.value))}
                >
                  <option value="50">0.5%</option>
                  <option value="100">1.0%</option>
                  <option value="300">3.0%</option>
                  <option value="500">5.0%</option>
                </select>
                <small>The swap reverts if execution returns less than this protected minimum.</small>
              </label>

              <div className="quote-card" aria-live="polite" aria-busy={tradeQuoteLoading}>
                <div className="quote-output">
                  <span>Estimated output</span>
                  <strong>
                    {tradeQuoteLoading
                      ? "Reading…"
                      : tradeQuote
                        ? `${amount(tradeQuote.amountOut, tradeConfig.outputDecimals, 6)} ${tradeConfig.outputSymbol}`
                        : tradeAmount.trim()
                          ? "—"
                          : "Enter amount"}
                  </strong>
                </div>
                <div className="quote-facts">
                  <div>
                    <span>Minimum received</span>
                    <code>{tradeQuote ? `${amount(tradeMinimumOut, tradeConfig.outputDecimals, 6)} ${tradeConfig.outputSymbol}` : "—"}</code>
                  </div>
                  <div>
                    <span>NARA fee deducted from {tradeConfig.inputSymbol}</span>
                    <code>
                      {tradeQuote
                        ? `${amount(tradeQuote.feeAmount, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol} · ${rateFromBps(tradeQuote.effectiveFeeBps)}`
                        : "—"}
                    </code>
                  </div>
                  <div>
                    <span>Amount swapped after NARA fee</span>
                    <code>{tradeQuote ? `${amount(tradeAmountAfterNaraFee, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol}` : "—"}</code>
                  </div>
                  <div>
                    <span>Pool fee</span>
                    <code>{DEPLOYMENT.poolFee / 10_000}% · included in output</code>
                  </div>
                  <div>
                    <span>Quote block</span>
                    <code>{tradeQuote ? integer(tradeQuote.blockNumber) : "—"}</code>
                  </div>
                </div>
              </div>

              {tradeQuoteError ? <p className="inline-error">Quote unavailable: {tradeQuoteError}</p> : null}
              {tradeDeploymentError ? <p className="inline-error">Route blocked: {tradeDeploymentError}</p> : null}
              {tradeApprovalError ? (
                <div className="inline-retry">
                  <p className="inline-error">Approval status unavailable: {tradeApprovalError}</p>
                  <button type="button" onClick={() => void refreshTradeAllowances().catch(() => undefined)}>Retry approval read</button>
                </div>
              ) : null}
              {!tradeBalanceReady ? <p className="inline-error">Connected wallet has insufficient {tradeConfig.inputSymbol}.</p> : null}

              {isConnected ? (
                <div className="approval-summary">
                  <div>
                    <span>Trading status</span>
                    <b>
                      {!tradeAllowances
                        ? "Checking"
                        : tradeAccessReady
                          ? `Ready until ${dateTime(tradeAllowances.permit2Expiration)}`
                          : !tradeApprovalsReady.erc20
                            ? "Permit2 access required"
                            : "30-day Router access required"}
                    </b>
                  </div>
                  <div>
                    <span>Next wallet action</span>
                    <b>
                      {!tradeAllowances
                        ? "—"
                        : nextTradeAction}
                    </b>
                  </div>
                </div>
              ) : null}

              {isConnected && tradeAllowances ? (
                <details className="route-technical">
                  <summary>Trading access details</summary>
                  <div><span>Token → Permit2</span><code>{tokenApprovalScope}</code></div>
                  <div><span>Permit2 → Router</span><code>{routerApprovalScope}</code></div>
                  <div><span>Permit2 contract</span><code>{shortAddress(DEPLOYMENT.permit2)}</code></div>
                  <div><span>Universal Router</span><code>{shortAddress(DEPLOYMENT.universalRouter)}</code></div>
                  <p>{baseAccountActivationStep
                    ? "This Base Account needs one short exact-access action before the swap. The console will not open the next wallet request automatically."
                    : tradeAtomicReady
                      ? "This wallet can include exact approvals and the swap in one atomic action."
                      : "Each button opens the wallet once. The console never continues automatically to another transaction."}</p>
                </details>
              ) : null}

              <button
                className="secondary full trade-review-button"
                type="button"
                disabled={
                  !tradeWritesReady
                  || !executableTradeQuote
                  || !tradeAllowances
                  || !tradeBalanceReady
                  || parsedTradeInput <= 0n
                }
                onClick={() => {
                  if (!tradeApprovalsReady.erc20) {
                    if (tradeAtomicReady) openTradeReview();
                    else void enableTokenTrading();
                  } else if (!tradeApprovalsReady.permit2) {
                    if (tradeAtomicReady) openTradeReview();
                    else void enableRouterTrading();
                  } else {
                    openTradeReview();
                  }
                }}
              >
                {!isConnected
                  ? "Connect wallet to continue"
                  : naraSwapWalletBlocked
                    ? "Choose another wallet to use NARAswap"
                  : pendingAction === "trade-token-setup"
                    ? progressButtonLabel(transactionProgress, true, `Enable ${tradeConfig.inputSymbol} trading`)
                    : pendingAction === "trade-router-setup"
                      ? progressButtonLabel(transactionProgress, true, "Enable swaps for 30 days")
                  : !tradeAmountReady
                    ? "Enter an amount to continue"
                  : !tradeDeploymentVerified
                    ? "Verifying production route…"
                    : !tradeAllowances
                      ? "Checking current approvals…"
                    : tradeQuoteLoading || !executableTradeQuote
                      ? "Waiting for live quote…"
                      : !tradeBalanceReady
                        ? `Insufficient ${tradeConfig.inputSymbol}`
                        : tradeAtomicReady && !tradeAccessReady
                          ? `Review ${tradeDirection} · setup included atomically`
                        : !tradeApprovalsReady.erc20
                          ? baseAccountActivationStep
                            ? `Activate account with exact ${tradeConfig.inputSymbol} access`
                            : `Allow exact ${tradeConfig.inputSymbol} amount to Permit2`
                          : !tradeApprovalsReady.permit2
                            ? `Allow exact ${tradeConfig.inputSymbol} amount to Router`
                            : `Review ${tradeDirection} · one confirmation`}
              </button>
              {walletAtomicSupported && !tradeAccessReady && !baseAccountBlocksAtomic ? (
                <button
                  className="text-action"
                  type="button"
                  disabled={!!pendingAction}
                  onClick={() => {
                    const enableCompatibility = !tradeAtomicCompatibilityMode;
                    persistTradeAtomicCompatibility(enableCompatibility);
                    setTradeReviewOpen(false);
                    replaceTransactionProgress(null);
                    setFlash({
                      tone: "info",
                      message: enableCompatibility
                        ? "Compatibility mode is active. Continue with the exact approval shown on Trade."
                        : "Atomic mode is active. The exact approvals and swap will be reviewed together.",
                    });
                  }}
                >
                  {tradeAtomicCompatibilityMode
                    ? "Try one atomic confirmation"
                    : "Atomic confirmation not working? Use compatibility mode"}
                </button>
              ) : null}
              {hasTradeAccess ? (
                <button
                  className="text-action"
                  type="button"
                  disabled={!tradeWritesReady}
                  onClick={() => void revokeTradeApprovals()}
                >
                  {pendingAction === "trade-revoke"
                    ? progressButtonLabel(transactionProgress, true, "Revoke trading access")
                    : tradeAllowances && tradeAllowances.permit2Amount > 0n
                      ? "Revoke Router access · first layer"
                      : `Revoke Permit2 ${tradeConfig.inputSymbol} access · final layer`}
                </button>
              ) : null}
              <p className="risk-copy">
                {!tradeAllowances
                  ? "Reading current access before enabling an action."
                    : baseAccountActivationStep
                      ? `This first action grants Permit2 access to exactly ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol}. It submits no swap and never opens the next wallet request automatically.`
                    : tradeAtomicCompatibilityMode && walletAtomicSupported && !tradeAccessReady
                    ? "Compatibility mode is active. Exact setup and the swap are confirmed separately; no step opens the next wallet request automatically."
                  : tradeAtomicReady && !tradeAccessReady
                    ? `Exact ${tradeConfig.inputSymbol} approvals and this swap are simulated and submitted as one atomic action. The approvals are limited to this trade amount.`
                  : !tradeApprovalsReady.erc20
                    ? `This setup grants access to exactly ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol}. It submits no swap.`
                  : !tradeApprovalsReady.permit2
                      ? `This setup grants Router access to exactly ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol}. It submits no swap.`
                      : "This confirms one swap. Trading access remains until expiry or revocation."}
              </p>
            </section>

            <aside className="panel route-panel">
              <span className="eyebrow">Execution safety</span>
              <h2>Nothing signs automatically</h2>
              <div className="route-explainer">
                <div>
                  <b>No confirmation chains</b>
                  <p>Setup and swaps are separate actions. Finishing one never opens the next automatically.</p>
                </div>
                <div>
                  <b>Fresh final quote</b>
                  <p>The console requotes after approvals, then builds the slippage-protected calldata.</p>
                </div>
                <div>
                  <b>Simulation before signature</b>
                  <p>The Universal Router call must simulate successfully before the swap opens in your wallet.</p>
                </div>
              </div>
              <details className="route-technical">
                <summary>Verified route details</summary>
                <div><span>Pool ID</span><code>{shortAddress(DEPLOYMENT.poolId, 10, 8)}</code></div>
                <div><span>Hook</span><code>{shortAddress(DEPLOYMENT.hook)}</code></div>
                <div><span>Official v4 Quoter</span><code>{shortAddress(DEPLOYMENT.quoter)}</code></div>
                <div><span>Tick spacing</span><code>{DEPLOYMENT.tickSpacing}</code></div>
                <div><span>Marginal hook tier</span><code>{tradeQuote ? `${tradeQuote.marginalFeeBps} bps` : "—"}</code></div>
                <div><span>Quoter gas estimate</span><code>{tradeQuote ? integer(tradeQuote.gasEstimate) : "—"}</code></div>
              </details>
            </aside>
          </div>
        ) : null}

        {tab === "nfts" ? (
          <NftTab
            currentEpoch={state?.currentEpoch ?? 0n}
            lockFeeWei={state?.lockFeeWei ?? 0n}
            unlockFeeWei={state?.unlockFeeWei ?? 0n}
            naraBalance={state?.naraBalance ?? 0n}
            onRefreshBalances={() => void refresh()}
          />
        ) : null}


      </main>

      <footer>
        <span>Base mainnet · block {state ? integer(state.blockNumber) : "—"}</span>
        <span>Read-only monitor remains a separate service.</span>
      </footer>

      {transactionProgress ? (
        <TransactionProgressDock
          progress={transactionProgress}
          onCheckStatus={() => void checkTrackedTransactionStatus()}
          onDismiss={() => replaceTransactionProgress(null)}
          onUseBaseAppWallet={connectedWithBaseAccount
            && inBaseAppBrowser
            && transactionProgress.stage === "error"
            && !transactionProgress.hash
            ? () => void switchToBaseAppWallet()
            : undefined}
          baseAppWalletBusy={switchingBaseAppWallet}
          baseAppRecoveryUrl={connectedWithBaseAccount && transactionProgress.stage === "error" && !transactionProgress.hash
            ? MOBILE_PREVIEW_URL
            : undefined}
        />
      ) : null}

      {fundingAsset && address ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !fundingBusy && setFundingAsset(null)}>
          <section
            className="modal funding-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="funding-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">Base wallet funding</span>
            <h1 id="funding-title">{fundingButtonLabel(fundingAsset)}</h1>
            <div className="review-box large">
              <div><span>Network</span><code>Base · chain 8453</code></div>
              <div><span>Asset</span><code>{fundingAsset}</code></div>
              <div className="funding-address-row"><span>Destination</span><code>{address}</code></div>
              {fundingAsset === "ETH" && state ? (
                <div>
                  <span>Engine fee for this action</span>
                  <code>{formatEther(readiness?.action === "add-base-eth" && tab === "positions"
                    ? (!lockComposerOpen && nextMaturedPosition ? state.unlockFeeWei : state.lockFeeWei)
                    : 0n)} ETH</code>
                </div>
              ) : null}
            </div>

            <div className="funding-status" role="status">
              {onrampAvailable === null
                ? "Checking direct Coinbase checkout… Other routes are ready below."
                : onrampAvailable
                  ? "Direct Coinbase checkout is available."
                  : "Direct Coinbase checkout is offline. Choose another route below."}
            </div>
            {fundingError ? <p className="inline-error" role="alert">{fundingError}</p> : null}

            <div className="funding-route-list">
              {onrampAvailable ? (
                <div className="funding-route">
                  <div>
                    <strong>Direct Coinbase checkout</strong>
                    <small>Buy {fundingAsset} on Base for this exact wallet address.</small>
                  </div>
                  <button className="secondary" type="button" disabled={fundingBusy} onClick={() => void startCoinbaseFunding()}>
                    {fundingBusy ? "Opening…" : "Open Coinbase"}
                  </button>
                </div>
              ) : null}
              {externalFundingOptions.map((route) => (
                <div className="funding-route" key={route.id}>
                  <div>
                    <strong>{route.name}</strong>
                    <small>{route.detail}</small>
                  </div>
                  <a className="secondary" href={route.url} target="_blank" rel="noreferrer">{route.action}</a>
                </div>
              ))}
              <div className="funding-route">
                <div>
                  <strong>Send from another wallet</strong>
                  <small>Copy the destination, then send only {fundingAsset} on Base.</small>
                </div>
                <button className="secondary" type="button" disabled={fundingBusy} onClick={() => void copyFundingAddress()}>Copy address</button>
              </div>
            </div>

            <div className="funding-actions">
              <button className="secondary" type="button" disabled={fundingBusy} onClick={() => setFundingAsset(null)}>Back</button>
              <button
                className="primary"
                type="button"
                disabled={fundingBusy}
                onClick={() => {
                  setFundingBusy(true);
                  void refresh().finally(() => setFundingBusy(false));
                }}
              >
                {fundingBusy ? "Checking balance…" : "I funded it — check balance"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {positionReview && state && address ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !pendingAction && setPositionReview(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="eyebrow">Final review · Position #{positionReview.position.id.toString()}</span>
            <h1 id="review-title">
              {positionReview.kind === "claim"
                ? "Claim accrued allocations"
                : `Return ${amount(positionReview.position.amount)} NARA to your wallet?`}
            </h1>
            <div className="review-box large">
              <div><span>Recipient</span><code>{shortAddress(address)}</code></div>
              {positionReview.kind === "claim" ? (
                <>
                  <div><span>NARA received</span><code>{allocationAmount(positionReview.position.claimableNara)} NARA · no claim fee</code></div>
                  <div><span>ETH received after fee</span><code>{allocationAmount(positionReview.position.claimableEth)} ETH</code></div>
                  <div><span>ETH allocation fee</span><code>{rateFromBps(state.claimFeeBps)} · ETH only</code></div>
                  <div><span>Network gas</span><code>{sponsoredAtomicReady ? "Sponsored" : "Shown by wallet"}</code></div>
                </>
              ) : (
                <>
                  <div><span>Principal returned</span><code>{amount(positionReview.position.amount)} NARA</code></div>
                  <div><span>NARA allocation included</span><code>{allocationAmount(positionReview.position.claimableNara)} NARA · no claim fee</code></div>
                  <div><span>ETH allocation after fee</span><code>{allocationAmount(positionReview.position.claimableEth)} ETH</code></div>
                  <div><span>ETH allocation fee</span><code>{rateFromBps(state.claimFeeBps)} · ETH only</code></div>
                  <div><span>Engine unlock fee</span><code>{formatEther(state.unlockFeeWei)} ETH</code></div>
                  <div><span>Network gas</span><code>{sponsoredAtomicReady ? "Sponsored · Engine ETH fee still applies" : "Shown by wallet"}</code></div>
                  <div><span>Position after confirmation</span><code>Closed</code></div>
                </>
              )}
            </div>
            <p className="risk-copy">
              {positionReview.kind === "claim"
                ? "This leaves the principal locked. The console simulates the claim before asking for one wallet confirmation."
                : "This closes the position and returns its principal plus accrued allocations. No separate claim is required. The console simulates first, then asks for one wallet confirmation."}
            </p>
            <div className="modal-actions">
              <button className="secondary" type="button" disabled={!!pendingAction} onClick={() => setPositionReview(null)}>Back</button>
              <button
                className="primary"
                type="button"
                disabled={!!pendingAction}
                onClick={() => positionReview.kind === "claim"
                  ? void claimPosition(positionReview.position)
                  : void unlockPosition(positionReview.position)}
              >
                {progressButtonLabel(
                  transactionProgress,
                  pendingAction === `${positionReview.kind}-${positionReview.position.id}`,
                  positionReview.kind === "claim"
                    ? "Confirm claim"
                    : `Unlock and return ${amount(positionReview.position.amount)} NARA`,
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {tradeReviewOpen && address && executableTradeQuote ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !pendingAction && setTradeReviewOpen(false)}>
          <section className="modal trade-review-modal" role="dialog" aria-modal="true" aria-labelledby="trade-review-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="eyebrow">Transaction review</span>
            <h1 id="trade-review-title">
              {tradeDirection === "buy" ? "Buy NARA with USDC" : "Sell NARA for USDC"}
            </h1>
            <div className="review-box large">
              <div><span>Connected wallet</span><code>{shortAddress(address)}</code></div>
              <div><span>You provide</span><code>{amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} {tradeConfig.inputSymbol}</code></div>
              <div><span>NARA fee deducted</span><code>−{amount(executableTradeQuote.feeAmount, tradeConfig.inputDecimals, 6)} {tradeConfig.inputSymbol} · {rateFromBps(executableTradeQuote.effectiveFeeBps)}</code></div>
              <div><span>Amount swapped after NARA fee</span><code>{amount(amountAfterNaraFee(executableTradeQuote.amountIn, executableTradeQuote.feeAmount), tradeConfig.inputDecimals, 6)} {tradeConfig.inputSymbol}</code></div>
              <div><span>Pool fee</span><code>{DEPLOYMENT.poolFee / 10_000}% · included in output</code></div>
              <div><span>Current estimated output</span><code>{amount(executableTradeQuote.amountOut, tradeConfig.outputDecimals, 6)} {tradeConfig.outputSymbol}</code></div>
              <div><span>Minimum received</span><code>{amount(tradeMinimumOut, tradeConfig.outputDecimals, 6)} {tradeConfig.outputSymbol}</code></div>
              <div><span>Slippage limit</span><code>{Number(tradeSlippageBps) / 100}%</code></div>
              <div><span>Network gas</span><code>{sponsoredAtomicReady ? "Sponsored" : "Shown by wallet"}</code></div>
              <div><span>Router access</span><code>{tradeApprovalsReady.permit2 ? `Reusable until ${dateTime(tradeAllowances?.permit2Expiration ?? 0n)}` : tradeAtomicReady ? `Exact ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol} · included atomically` : "Required before swap"}</code></div>
              <div><span>Permit2 token access</span><code>{tradeApprovalsReady.erc20 ? "Active until you revoke it" : tradeAtomicReady ? `Exact ${amount(parsedTradeInput, tradeConfig.inputDecimals, 6)} ${tradeConfig.inputSymbol} · included atomically` : "Required before swap"}</code></div>
              <div><span>Wallet action</span><code>{tradeAtomicReady && !tradeAccessReady ? "One atomic transaction" : "One swap transaction"}</code></div>
            </div>
            <div className="execution-note">
              <b>The final numbers are refreshed before the swap.</b>
              <p>If the route changes, simulation fails, or output falls below the minimum, execution stops. {tradeAtomicReady && !tradeAccessReady ? "Exact approvals and the swap succeed together or all revert; the approvals are consumed by this trade. " : "Existing trading access remains until it expires, is consumed, or you revoke it from Trade."}</p>
            </div>
            <div className="modal-actions">
              <button className="secondary" type="button" disabled={!!pendingAction} onClick={() => setTradeReviewOpen(false)}>Back</button>
              <button
                className="primary"
                type="button"
                disabled={!!pendingAction || !tradeWritesReady || !tradeBalanceReady}
                onClick={() => void executeTrade()}
              >
                {progressButtonLabel(
                  transactionProgress,
                  pendingAction === "trade-swap",
                  `Confirm ${tradeDirection}`,
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
