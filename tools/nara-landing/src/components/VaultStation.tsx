import { useState, useMemo } from "react";
import { ethers } from "ethers";
import {
  Coins,
  ShieldCheck,
  Eye,
  CheckCircle,
  WarningCircle,
  X,
  ArrowLeft,
  ArrowRight,
  Lightning,
  SortAscending,
  SortDescending,
  Trophy,
  Clock,
  Sparkle,
  TrendUp,
} from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import TacticalNumber from "./TacticalNumber";
import StepProgressTracker from "./StepProgressTracker";
import { extractAlloyFromItem, PositionNftItem } from "../lib/gridContracts";

export type SortField =
  | "pulse_yield"
  | "claimable"
  | "amount"
  | "multiplier"
  | "rarity"
  | "maturity"
  | "token_id";

export type SortDirection = "desc" | "asc";

function getPositionMultiplier(item: PositionNftItem): number {
  if (!item.amount || item.amount.isZero()) return 1.0;
  try {
    const amt = parseFloat(ethers.utils.formatEther(item.amount));
    const wgt = parseFloat(ethers.utils.formatEther(item.weight || item.amount));
    if (amt <= 0) return 1.0;
    return Math.max(1.0, wgt / amt);
  } catch {
    return 1.0;
  }
}

function getRarityScore(item: PositionNftItem): number {
  const alloy = extractAlloyFromItem(item);
  switch (alloy.tier) {
    case "gold":
      return 5; // 👑 #1 APEX GRAIL
    case "damascus":
      return 4; // 🌌 #2 LEGENDARY
    case "obsidian":
      return 3; // 🔮 #3 RARE
    case "emerald":
      return 2; // 🟢 #4 UNCOMMON
    default:
      return 1; // 🪙 #5 COMMON
  }
}

function getClaimableScore(item: PositionNftItem): number {
  try {
    const naraVal = item.claimableNara ? parseFloat(ethers.utils.formatEther(item.claimableNara)) : 0;
    const ethVal = item.claimableEth ? parseFloat(ethers.utils.formatEther(item.claimableEth)) * 1000 : 0;
    const usdcVal = item.claimableUsdc ? parseFloat(ethers.utils.formatUnits(item.claimableUsdc, 6)) : 0;
    return naraVal + ethVal + usdcVal;
  } catch {
    return 0;
  }
}

const SORT_OPTIONS: Array<{
  id: SortField;
  label: string;
  shortLabel: string;
  icon: any;
  tooltip: string;
}> = [
  {
    id: "pulse_yield",
    label: "15-MIN PULSE (BEST)",
    shortLabel: "15M PULSE",
    icon: Lightning,
    tooltip: "Rank by 15-minute pulse emission reward power (highest weight first — making the most every 15 min)",
  },
  {
    id: "claimable",
    label: "MOST CLAIMABLE",
    shortLabel: "CLAIMABLE",
    icon: Coins,
    tooltip: "Rank by accumulated unclaimed harvest rewards",
  },
  {
    id: "amount",
    label: "ACTIVE CELLS",
    shortLabel: "CELLS",
    icon: Sparkle,
    tooltip: "Rank by committed NARA principal cells",
  },
  {
    id: "multiplier",
    label: "BOOST (UP TO 4X)",
    shortLabel: "BOOST",
    icon: TrendUp,
    tooltip: "Rank by lock duration boost multiplier (1.00X - 4.00X)",
  },
  {
    id: "rarity",
    label: "RARITY TIER",
    shortLabel: "RARITY",
    icon: Trophy,
    tooltip: "Rank by alloy tier (Apex Grail > Legendary > Rare > Uncommon > Common)",
  },
  {
    id: "maturity",
    label: "UNLOCK HORIZON",
    shortLabel: "MATURITY",
    icon: Clock,
    tooltip: "Rank by maturity status (matured first, then nearest unlock epoch)",
  },
  {
    id: "token_id",
    label: "TOKEN ID",
    shortLabel: "TOKEN #",
    icon: ShieldCheck,
    tooltip: "Rank chronologically by NFT Token ID",
  },
];

export default function VaultStation() {
  const {
    connectedAddress,
    isWrongChain,
    handleSwitchToBase,
    connect,
    currentEpoch,
    userPositions,
    slottedTokenIds,
    activeTotalWeight,
    aggregateClaimableEth,
    aggregateClaimableNara,
    aggregateClaimableUsdc,
    actionBusy,
    txSuccessMsg,
    setTxSuccessMsg,
    errorMsg,
    setErrorMsg,
    setInspectModalItem,
    handleEquip,
    handleUnequip,
    handleHarvestSingle,
    handleHarvestAll,
    handleUnlock,
    navigate,
  } = useGrid();

  const isPreviewMode = !connectedAddress;
  const [activeFilter, setActiveFilter] = useState<"all" | "slotted" | "matured">("all");
  const [sortBy, setSortBy] = useState<SortField>("pulse_yield");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectClick = async () => {
    try {
      setIsConnecting(true);
      await connect();
    } catch (err: any) {
      console.warn("Vault connect error:", err);
      setErrorMsg(err?.message || "Failed to open wallet connection modal.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSortSelect = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDirection(field === "token_id" ? "asc" : "desc");
    }
  };

  // Global rank by 15-minute pulse yield among all user positions (1 = makes the most every 15 min)
  const pulseRankMap = useMemo(() => {
    const sorted = [...userPositions].sort((a, b) => {
      if (b.weight.gt(a.weight)) return 1;
      if (b.weight.lt(a.weight)) return -1;
      return a.tokenId.sub(b.tokenId).toNumber();
    });
    const map = new Map<string, number>();
    sorted.forEach((p, idx) => {
      map.set(p.tokenId.toString(), idx + 1);
    });
    return map;
  }, [userPositions]);

  const filteredAndSortedPositions = useMemo(() => {
    const filtered = userPositions.filter((p) => {
      if (activeFilter === "slotted") {
        return slottedTokenIds.some((id) => id.eq(p.tokenId));
      }
      if (activeFilter === "matured") {
        return currentEpoch >= p.unlockEpoch;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "pulse_yield": {
          if (b.weight.gt(a.weight)) cmp = 1;
          else if (b.weight.lt(a.weight)) cmp = -1;
          else {
            if (b.amount.gt(a.amount)) cmp = 1;
            else if (b.amount.lt(a.amount)) cmp = -1;
            else cmp = a.tokenId.sub(b.tokenId).toNumber();
          }
          break;
        }
        case "claimable": {
          const scoreA = getClaimableScore(a);
          const scoreB = getClaimableScore(b);
          cmp = scoreB - scoreA;
          if (cmp === 0) cmp = b.tokenId.sub(a.tokenId).toNumber();
          break;
        }
        case "amount": {
          if (b.amount.gt(a.amount)) cmp = 1;
          else if (b.amount.lt(a.amount)) cmp = -1;
          else cmp = b.tokenId.sub(a.tokenId).toNumber();
          break;
        }
        case "multiplier": {
          const multA = getPositionMultiplier(a);
          const multB = getPositionMultiplier(b);
          cmp = multB - multA;
          if (Math.abs(cmp) < 0.001) {
            if (b.weight.gt(a.weight)) cmp = 1;
            else if (b.weight.lt(a.weight)) cmp = -1;
            else cmp = a.tokenId.sub(b.tokenId).toNumber();
          }
          break;
        }
        case "rarity": {
          const rA = getRarityScore(a);
          const rB = getRarityScore(b);
          cmp = rB - rA;
          if (cmp === 0) {
            if (b.weight.gt(a.weight)) cmp = 1;
            else cmp = -1;
          }
          break;
        }
        case "maturity": {
          const aMatured = currentEpoch >= a.unlockEpoch;
          const bMatured = currentEpoch >= b.unlockEpoch;
          if (aMatured && !bMatured) cmp = -1;
          else if (!aMatured && bMatured) cmp = 1;
          else if (aMatured && bMatured) {
            cmp = b.unlockEpoch - a.unlockEpoch;
          } else {
            cmp = a.unlockEpoch - b.unlockEpoch;
          }
          break;
        }
        case "token_id": {
          cmp = a.tokenId.sub(b.tokenId).toNumber();
          break;
        }
      }
      return sortDirection === "desc" ? cmp : -cmp;
    });
  }, [userPositions, activeFilter, slottedTokenIds, currentEpoch, sortBy, sortDirection]);

  const sortDescriptionLabel =
    sortBy === "pulse_yield"
      ? sortDirection === "desc"
        ? "Highest 15-Min Pulse Earner → Lowest"
        : "Lowest 15-Min Pulse Earner → Highest"
      : sortBy === "claimable"
      ? sortDirection === "desc"
        ? "Most Unclaimed Rewards → Least"
        : "Least Unclaimed Rewards → Most"
      : sortBy === "amount"
      ? sortDirection === "desc"
        ? "Most Committed Cells → Least"
        : "Least Committed Cells → Most"
      : sortBy === "multiplier"
      ? sortDirection === "desc"
        ? "Highest Multiplier (4.00X) → Lowest (1.00X)"
        : "Lowest Multiplier (1.00X) → Highest (4.00X)"
      : sortBy === "rarity"
      ? sortDirection === "desc"
        ? "Apex Grail → Legendary → Common"
        : "Common → Uncommon → Apex Grail"
      : sortBy === "maturity"
      ? sortDirection === "desc"
        ? "Matured First → Longest Lock Remaining"
        : "Longest Lock Remaining → Matured First"
      : sortDirection === "desc"
      ? "Highest Token ID → Lowest"
      : "Lowest Token ID → Highest";

  const minNaraThreshold = ethers.utils.parseEther("0.0001");
  const minEthThreshold = ethers.utils.parseEther("0.000001");

  const eligibleHarvestPositions = userPositions
    .filter((p) => {
      const hasNara = p.claimableNara && p.claimableNara.gt(minNaraThreshold);
      const hasEth = p.claimableEth && p.claimableEth.gt(minEthThreshold);
      return hasNara || hasEth;
    })
    .sort((a, b) => {
      if (b.claimableNara.gt(a.claimableNara)) return 1;
      if (a.claimableNara.gt(b.claimableNara)) return -1;
      return 0;
    });

  const topHarvestPosition = eligibleHarvestPositions[0];
  const hasHarvestable = eligibleHarvestPositions.length > 0;

  return (
    <main className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-8 font-sans pb-12">
      {/* 4-Step Visual Progress Stepper */}
      <StepProgressTracker activeStep="vault" />

      {/* Network Warning Pill if on Wrong Chain */}
      {isWrongChain && (
        <div className="p-4 bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl backdrop-blur-md ring-1 ring-rose-500/20 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <WarningCircle size={20} className="text-rose-400 shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wider text-rose-300 block text-[11px]">
                Wrong Network Detected (Base Mainnet 8453 Required)
              </span>
              <p className="text-rose-200/90 text-xs font-normal">
                Your wallet is connected to a different network. Please switch to Base mainnet to interact with your Grid positions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSwitchToBase}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs rounded-xl transition-all shadow-md uppercase tracking-wider shrink-0 cursor-pointer active:scale-95"
          >
            Switch to Base
          </button>
        </div>
      )}

      {/* Simulator Preview Mode Banner (When unauthenticated) */}
      {!connectedAddress && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl backdrop-blur-md ring-1 ring-amber-500/20">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wider text-amber-300 block text-[11px]">
                Simulator Preview Mode Active
              </span>
              <p className="text-amber-200/90 text-xs font-normal">
                Displaying demonstration positions. Connect your wallet to load, manage, and harvest your live on-chain allocations.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleConnectClick}
              disabled={isConnecting}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl transition-all shadow-md uppercase tracking-wider cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/commit")}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl transition-all border border-white/15 uppercase tracking-wider cursor-pointer active:scale-95"
            >
              Join Grid
            </button>
          </div>
        </div>
      )}

      {/* Connected Wallet with 0 Active Positions Banner */}
      {connectedAddress && userPositions.length === 0 && (
        <div className="p-4 bg-cyan-950/40 border border-cyan-500/40 text-cyan-200 text-xs rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl backdrop-blur-md ring-1 ring-cyan-500/20">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <div>
              <span className="font-bold uppercase tracking-wider text-cyan-300 block text-[11px]">
                Wallet Connected ({connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}) · 0 Active Cells
              </span>
              <p className="text-cyan-200/90 text-xs font-normal">
                No Grid positions found on Base for this wallet. Commit $NARA to mint your first cell and command pulse distributions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/commit")}
            className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs rounded-xl transition-all shadow-md uppercase tracking-wider shrink-0 cursor-pointer active:scale-95"
          >
            Join The Grid (Commit)
          </button>
        </div>
      )}

      {/* Notifications / Flash Alerts */}
      {txSuccessMsg && (
        <div className="p-3.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
          <span className="flex items-center gap-2">
            <CheckCircle size={16} className="shrink-0 text-emerald-400" />
            {txSuccessMsg}
          </span>
          <button onClick={() => setTxSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
          <span className="flex items-center gap-2">
            <WarningCircle size={16} className="shrink-0 text-rose-400" />
            {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Section Header */}
      <div className="space-y-1 pb-2 border-b border-white/[0.08]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[11px] font-sans font-semibold tracking-wider uppercase shadow-[0_0_12px_rgba(0,240,255,0.15)]">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span>STEP 4 · RESOURCE HARVESTER & NFT VAULT</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase flex items-center gap-2.5 font-display">
          <Coins size={22} className="text-emerald-400" />
          <span>VAULT & REWARD HARVESTER</span>
        </h1>
      </div>

      {/* MODULE 1: LIVE ACCUMULATED RESOURCES (The Strategic Choice: Harvest vs Deploy) */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#060a18]/95 border border-white/10 backdrop-blur-2xl shadow-2xl ring-1 ring-white/5 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
          <div className="space-y-1">
            <h2 className="text-base font-bold tracking-wider text-white uppercase flex items-center gap-2 font-sans">
              <Coins size={18} className="text-emerald-400" />
              <span>ACCUMULATED ECOSYSTEM RESOURCES</span>
            </h2>
            <p className="text-xs sm:text-[13px] text-slate-300 font-sans leading-relaxed">
              Captured from swaps, flash loans, and 15-minute pulse emissions.
            </p>
          </div>
          <span
            className={`text-[10px] px-3 py-1 rounded-full border self-start sm:self-auto uppercase tracking-wider font-semibold font-sans ${
              hasHarvestable
                ? "text-emerald-300 bg-emerald-950/60 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                : "text-slate-400 bg-white/[0.04] border-white/10"
            }`}
          >
            {hasHarvestable ? "HARVEST READY" : "MONITORING PULSE"}
          </span>
        </div>

        {/* Resource Tickers */}
        <div className={`grid grid-cols-1 ${aggregateClaimableUsdc && !aggregateClaimableUsdc.isZero() ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4`}>
          <div className="p-4 sm:p-5 bg-[#03060e]/95 border border-white/10 rounded-xl space-y-2 shadow-sm">
            <span className="text-xs font-sans font-semibold text-slate-400 uppercase tracking-wider block">DISTRIBUTED ETH (BONDS & ECOSYSTEM)</span>
            <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]">
              <TacticalNumber
                value={aggregateClaimableEth}
                symbol="ETH"
                decimals={4}
                noUnderline
                symbolClassName="text-sm text-slate-300 font-normal"
              />
            </div>
            <span className="text-xs font-sans text-slate-400 block font-normal">Routes from upcoming Bond Depository & ecosystem integrations</span>
          </div>

          <div className="p-4 sm:p-5 bg-gradient-to-br from-cyan-950/40 via-[#03060e] to-[#040814] border border-cyan-500/40 rounded-xl space-y-2 shadow-[0_0_25px_rgba(0,240,255,0.12)] ring-1 ring-cyan-400/20">
            <span className="text-xs font-sans font-bold text-cyan-200 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f0ff]" />
              EMITTED NARA (15-MIN PULSE FLOW)
            </span>
            <div className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_16px_rgba(0,240,255,0.8)]">
              <TacticalNumber
                value={aggregateClaimableNara}
                symbol="NARA"
                decimals={2}
                noUnderline
                symbolClassName="text-sm text-cyan-400/80 font-semibold"
              />
            </div>
            <span className="text-xs font-sans text-slate-400 block font-normal">Dripped every 15 minutes to active cells on the Grid</span>
          </div>

          {aggregateClaimableUsdc && !aggregateClaimableUsdc.isZero() && (
            <div className="p-4 sm:p-5 bg-[#03060e]/95 border border-emerald-500/30 rounded-xl space-y-2 shadow-sm">
              <span className="text-xs font-sans font-semibold text-emerald-400 uppercase tracking-wider block">DISTRIBUTED USDC (APPS & BRIBES)</span>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-300 font-mono tracking-tight drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]">
                <TacticalNumber value={aggregateClaimableUsdc} symbol="USDC" decimals={2} unitDecimals={6} noUnderline symbolClassName="text-sm text-emerald-400/80 font-normal" />
              </div>
              <span className="text-xs font-sans text-slate-400 block font-normal">Token rewards delivered to active cells</span>
            </div>
          )}
        </div>

        {/* POL Telemetry Badge */}
        <div className="p-3 rounded-xl bg-[#040814]/90 border border-blue-500/25 text-xs font-sans text-slate-300 flex items-center justify-between gap-2 shadow-sm">
          <span>
            <strong className="text-cyan-300 font-semibold">DEX SWAP REVENUE:</strong> $2,700+ USDC fees from Uniswap v4 are banked in the Liquidity Vault & compounded into permanent POL floor backing.
          </span>
        </div>

        {/* Dual Strategic Actions: HARVEST vs DEPLOY */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Action A: Harvest to Wallet */}
            {isPreviewMode ? (
              <button
                type="button"
                onClick={handleConnectClick}
                disabled={isConnecting}
                className="w-full py-3.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black shadow-lg uppercase tracking-wider cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Coins size={16} />
                <span>{isConnecting ? "CONNECTING..." : "CONNECT WALLET TO HARVEST"}</span>
              </button>
            ) : eligibleHarvestPositions.length > 1 ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleHarvestSingle(topHarvestPosition.tokenId)}
                  disabled={actionBusy !== null}
                  className="flex-1 py-3.5 px-3 rounded-xl text-xs font-bold bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/50 text-emerald-200 transition-all flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                  title="Harvest the position holding the largest share of rewards in 1 single transaction"
                >
                  <Coins size={14} />
                  <span className="truncate">
                    {actionBusy === `harvest-${topHarvestPosition.tokenId.toString()}`
                      ? "HARVESTING..."
                      : `HARVEST TOP (#${topHarvestPosition.tokenId.toString()} · 1 TX)`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleHarvestAll}
                  disabled={actionBusy !== null}
                  className="py-3.5 px-3.5 rounded-xl text-xs font-bold bg-[#0a1222] hover:bg-[#0f1b32] border border-white/10 text-slate-300 hover:text-white transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                  title={`Sequential confirmation for all ${eligibleHarvestPositions.length} positions with rewards. Can be paused or stopped anytime.`}
                >
                  <span>{actionBusy === "harvest-all" ? "HARVESTING..." : `ALL (${eligibleHarvestPositions.length})`}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={
                  eligibleHarvestPositions.length === 1
                    ? () => handleHarvestSingle(topHarvestPosition.tokenId)
                    : handleHarvestAll
                }
                disabled={actionBusy !== null || !hasHarvestable}
                className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  hasHarvestable
                    ? "bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 shadow-sm"
                    : "bg-white/[0.02] border border-white/[0.05] text-slate-500 cursor-not-allowed"
                }`}
              >
                <Coins size={14} />
                <span>
                  {actionBusy === "harvest-all" || (topHarvestPosition && actionBusy === `harvest-${topHarvestPosition.tokenId.toString()}`)
                    ? "HARVESTING..."
                    : hasHarvestable
                    ? "HARVEST TO WALLET (1 TX)"
                    : "NO REWARDS TO HARVEST"}
                </span>
              </button>
            )}

            {/* Action B: Deploy to New Cells (MageFi Compound) */}
            <button
              type="button"
              onClick={() => navigate("/commit")}
              className="w-full py-3.5 px-4 rounded-xl text-xs font-bold bg-[#0c1429] hover:bg-[#101c38] border border-cyan-500/30 hover:border-cyan-400/50 text-cyan-300 transition-all flex items-center justify-center gap-2"
            >
              <Lightning size={14} />
              <span>DEPLOY INTO NEW ACTIVE CELLS →</span>
            </button>
          </div>

          {/* Micro Explainer for Non-Custodial Safety */}
          {eligibleHarvestPositions.length > 1 && (
            <p className="text-xs font-sans text-slate-400 leading-relaxed">
              *Each position NFT is an individual non-custodial contract on Base. Use <strong className="text-slate-200 font-semibold">HARVEST TOP (1 TX)</strong> to claim your primary resources in one signature, or <strong className="text-slate-200 font-semibold">ALL</strong> to claim all {eligibleHarvestPositions.length} positions in sequence (pausable anytime).
            </p>
          )}
        </div>
      </div>

      {/* MODULE 2: POSITION NFT INVENTORY & SVG INSPECTION */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#060a18]/95 border border-white/10 backdrop-blur-2xl shadow-2xl ring-1 ring-white/5 space-y-6">
        {/* Module Header & Filters */}
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-bold tracking-wider text-white uppercase flex items-center gap-2 font-sans">
                <ShieldCheck size={18} className="text-slate-300" />
                <span>PROOF-OF-POSITION NFTS ({userPositions.length})</span>
              </h2>
              <p className="text-xs sm:text-[13px] text-slate-300 font-sans leading-relaxed">
                Dynamic on-chain metadata plates commanding 15-minute pulse distributions.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 text-xs font-sans">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`px-3 py-1.5 rounded-lg border transition-all font-semibold cursor-pointer ${
                  activeFilter === "all"
                    ? "bg-white/15 text-white border-white/30 shadow-sm"
                    : "text-slate-400 hover:text-white border-transparent hover:bg-white/[0.04]"
                }`}
              >
                ALL ({userPositions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("slotted")}
                className={`px-3 py-1.5 rounded-lg border transition-all font-semibold cursor-pointer ${
                  activeFilter === "slotted"
                    ? "bg-white/15 text-white border-white/30 shadow-sm"
                    : "text-slate-400 hover:text-white border-transparent hover:bg-white/[0.04]"
                }`}
              >
                SLOTTED ({slottedTokenIds.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("matured")}
                className={`px-3 py-1.5 rounded-lg border transition-all font-semibold cursor-pointer ${
                  activeFilter === "matured"
                    ? "bg-white/15 text-white border-white/30 shadow-sm"
                    : "text-slate-400 hover:text-white border-transparent hover:bg-white/[0.04]"
                }`}
              >
                MATURED ({userPositions.filter((p) => currentEpoch >= p.unlockEpoch).length})
              </button>
            </div>
          </div>

          {/* Comprehensive Sorting Controls Bar */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-[#03060f]/90 border border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Sort Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] sm:text-[11px] font-sans font-bold text-slate-400 uppercase tracking-wider mr-1 select-none">
                SORT:
              </span>
              {SORT_OPTIONS.map((opt) => {
                const isActive = sortBy === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSortSelect(opt.id)}
                    title={opt.tooltip}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-sans font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border ${
                      isActive
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                        : "bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border-white/10"
                    }`}
                  >
                    <Icon size={13} className={isActive ? "text-cyan-400" : "text-slate-400"} />
                    <span>{opt.label}</span>
                    {isActive && (
                      <span className="text-[10px] font-mono text-cyan-300/80">
                        {sortDirection === "desc" ? "↓" : "↑"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Direction Toggle & Status */}
            <div className="flex items-center justify-between lg:justify-end gap-2.5 pt-1 lg:pt-0 border-t lg:border-t-0 border-white/[0.06]">
              <span className="text-[10px] font-sans text-slate-400 truncate hidden sm:inline">
                {sortDescriptionLabel}
              </span>
              <button
                type="button"
                onClick={() => setSortDirection((d) => (d === "desc" ? "asc" : "desc"))}
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 border border-white/15 text-slate-200 text-[11px] font-sans font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0 hover:border-cyan-400/40 shadow-sm"
                title="Click to toggle ascending / descending sort order"
              >
                {sortDirection === "desc" ? (
                  <SortDescending size={14} className="text-cyan-400" />
                ) : (
                  <SortAscending size={14} className="text-cyan-400" />
                )}
                <span className="font-mono text-[10px]">
                  {sortDirection === "desc" ? "BEST → WORST" : "WORST → BEST"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Position Inventory List */}
        {filteredAndSortedPositions.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-[#03050b]/80 border border-dashed border-white/10 space-y-3 font-sans">
            <p className="text-xs sm:text-sm text-slate-300">No Position NFTs match the selected view.</p>
            <button
              type="button"
              onClick={() => navigate("/commit")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-300 text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <span>Commit NARA & Mint Position NFT</span>
              <ArrowRight size={13} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[640px] overflow-y-auto pr-1 sm:pr-2">
            {filteredAndSortedPositions.map((item) => {
              const isSlotted = slottedTokenIds.some((id) => id.eq(item.tokenId));
              const isMatured = currentEpoch >= item.unlockEpoch;
              const alloy = extractAlloyFromItem(item);
              const pulseRank = pulseRankMap.get(item.tokenId.toString()) || 0;
              const multiplier = getPositionMultiplier(item);

              const totalWeightNum =
                activeTotalWeight && !activeTotalWeight.isZero()
                  ? parseFloat(ethers.utils.formatEther(activeTotalWeight))
                  : 0;
              const itemWeightNum = item.weight ? parseFloat(ethers.utils.formatEther(item.weight)) : 0;
              const pulseSharePercent =
                totalWeightNum > 0 ? (itemWeightNum / totalWeightNum) * 100 : 0;
              const pulseShareStr =
                pulseSharePercent >= 0.01
                  ? `${pulseSharePercent.toFixed(2)}%`
                  : pulseSharePercent > 0
                  ? "<0.01%"
                  : "";

              const remainingEpochs =
                item.unlockEpoch > currentEpoch ? item.unlockEpoch - currentEpoch : 0;
              const remainingHours = Math.round((remainingEpochs * 15) / 60);

              return (
                <div
                  key={item.tokenId.toString()}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 font-sans ${
                    isSlotted
                      ? "bg-[#090e1f]/95 border-cyan-500/35 shadow-lg ring-1 ring-cyan-500/20"
                      : "bg-[#070b16]/90 border-white/10 hover:border-white/20 shadow-md"
                  }`}
                >
                  {/* Card Header: Ranks, Badges, Slotted */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 15-Min Pulse Rank Badge */}
                        {pulseRank === 1 ? (
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border bg-gradient-to-r from-amber-500/30 to-yellow-500/20 border-amber-400/70 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] inline-flex items-center gap-1">
                            <span>👑</span>
                            <span>#1 PULSE EARNER</span>
                          </span>
                        ) : pulseRank <= 3 ? (
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border bg-cyan-500/20 border-cyan-400/60 text-cyan-200 shadow-[0_0_10px_rgba(0,240,255,0.3)] inline-flex items-center gap-1">
                            <span>⚡</span>
                            <span>#{pulseRank} EARNER</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase border bg-white/[0.05] border-white/15 text-slate-300 inline-flex items-center gap-1">
                            <span>#{pulseRank}</span>
                          </span>
                        )}

                        <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider block">
                          TOKEN #{item.tokenId.toString()}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${alloy.bgClass} ${alloy.borderClass} ${alloy.colorClass} ${alloy.glowClass} inline-flex items-center gap-1`}
                        >
                          <span>{alloy.icon}</span>
                          <span>{alloy.badgeLabel}</span>
                        </span>
                        {item.isSample && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border bg-amber-500/20 text-amber-300 border-amber-500/40">
                            DEMO
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-bold text-white truncate">{item.name}</h3>
                    </div>

                    {/* Slotted / Status Badge */}
                    <span
                      className={`text-[10px] font-sans font-bold px-2.5 py-0.5 rounded-full uppercase border tracking-wider shrink-0 ${
                        isSlotted
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                          : "bg-white/[0.05] text-slate-400 border-white/10"
                      }`}
                    >
                      {isSlotted ? "SLOTTED" : "UNSLOTTED"}
                    </span>
                  </div>

                  {/* 15-Minute Pulse Earning Power Box */}
                  <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-br from-cyan-950/30 via-[#030612] to-[#04091a] border border-cyan-500/25 space-y-1.5 shadow-inner">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <Lightning size={13} className="text-cyan-400 shrink-0" />
                        <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-cyan-200">
                          15-MIN PULSE POWER:
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-cyan-300 text-xs">
                          <TacticalNumber value={item.weight} symbol="WGT" decimals={1} noUnderline />
                        </span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 shadow-[0_0_8px_rgba(0,240,255,0.2)]">
                          {multiplier.toFixed(2)}X BOOST
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-sans text-slate-400 pt-0.5 border-t border-white/[0.04]">
                      <span className="flex items-center gap-1">
                        <span>Committed:</span>
                        <strong className="text-slate-200 font-mono font-medium">
                          <TacticalNumber value={item.amount} symbol="Cells" decimals={0} noUnderline />
                        </strong>
                      </span>
                      {pulseShareStr && (
                        <span className="text-cyan-300/90 font-mono font-medium text-[10px] bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20">
                          ~{pulseShareStr} of pulse
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unlock Horizon / Maturity Row */}
                  <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-sans px-2.5 py-1.5 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                    <span className="text-slate-400 font-medium flex items-center gap-1 text-[10px] uppercase tracking-wider">
                      <Clock size={12} className="text-slate-400 shrink-0" />
                      <span>UNLOCK HORIZON:</span>
                    </span>
                    {isMatured ? (
                      <span className="font-bold text-emerald-300 flex items-center gap-1 text-[10px] sm:text-[11px] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                        MATURED · DISCONNECTABLE
                      </span>
                    ) : (
                      <span className="font-mono text-slate-300 text-[10px] sm:text-[11px]">
                        {remainingEpochs} epochs left (~{remainingHours}h)
                      </span>
                    )}
                  </div>

                  {/* Yield Tickers */}
                  <div
                    className={`p-2.5 rounded-xl bg-[#03060e] border border-white/[0.06] grid ${
                      item.claimableUsdc && !item.claimableUsdc.isZero() ? "grid-cols-3" : "grid-cols-2"
                    } gap-2`}
                  >
                    <div>
                      <span className="text-[9px] sm:text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                        CLAIMABLE ETH
                      </span>
                      <span className="font-bold text-white font-mono text-xs">
                        <TacticalNumber value={item.claimableEth} symbol="ETH" decimals={4} />
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] sm:text-[10px] font-sans font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                        CLAIMABLE NARA
                      </span>
                      <span className="font-bold text-cyan-300 font-mono text-xs drop-shadow-[0_0_6px_rgba(0,240,255,0.4)]">
                        <TacticalNumber
                          value={item.claimableNara}
                          symbol="NARA"
                          decimals={2}
                          noUnderline
                          symbolClassName="text-[10px] text-cyan-400/80 font-semibold"
                        />
                      </span>
                    </div>
                    {item.claimableUsdc && !item.claimableUsdc.isZero() && (
                      <div>
                        <span className="text-[9px] sm:text-[10px] font-sans font-semibold text-emerald-400 uppercase tracking-wider block mb-0.5">
                          CLAIMABLE USDC
                        </span>
                        <span className="font-bold text-emerald-300 font-mono text-xs">
                          <TacticalNumber value={item.claimableUsdc} symbol="USDC" decimals={2} unitDecimals={6} />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center gap-2 pt-0.5">
                    {isSlotted ? (
                      <button
                        type="button"
                        onClick={() => handleUnequip(item.tokenId)}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 border border-rose-500/30 text-rose-300 text-[11px] font-sans font-bold tracking-wider transition-colors text-center uppercase cursor-pointer active:scale-95"
                      >
                        UNEQUIP
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleEquip(item.tokenId)}
                        disabled={slottedTokenIds.length >= 6}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-[11px] font-sans font-bold tracking-wider transition-colors text-center uppercase disabled:opacity-40 cursor-pointer active:scale-95"
                      >
                        EQUIP TO DECK
                      </button>
                    )}

                    {(!item.claimableEth.isZero() || !item.claimableNara.isZero()) && (
                      <button
                        type="button"
                        onClick={item.isSample ? handleConnectClick : () => handleHarvestSingle(item.tokenId)}
                        disabled={item.isSample ? isConnecting : actionBusy === `harvest-${item.tokenId.toString()}`}
                        className={`py-1.5 px-2.5 rounded-lg border text-[11px] font-sans font-bold tracking-wider transition-colors uppercase cursor-pointer active:scale-95 disabled:opacity-50 ${
                          item.isSample
                            ? "bg-amber-950/60 hover:bg-amber-900/70 border-amber-500/40 text-amber-300"
                            : "bg-emerald-950/60 hover:bg-emerald-900/70 border-emerald-500/40 text-emerald-300"
                        }`}
                        title={item.isSample ? "Connect wallet to harvest live rewards" : "Harvest accumulated resources for this position"}
                      >
                        {item.isSample ? (isConnecting ? "CONNECTING..." : "CONNECT") : "HARVEST"}
                      </button>
                    )}

                    {isMatured && (
                      <button
                        type="button"
                        onClick={() => handleUnlock(item.tokenId)}
                        disabled={actionBusy === `unlock-${item.tokenId.toString()}`}
                        className="py-1.5 px-2.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-sans font-bold tracking-wider uppercase transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Maturity reached! Disconnect principal to wallet (0.000001 ETH network fee)"
                      >
                        {actionBusy === `unlock-${item.tokenId.toString()}`
                          ? "DISCONNECTING..."
                          : "DISCONNECT"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setInspectModalItem(item)}
                      className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-90"
                      title="Inspect Metadata & SVG Plate"
                    >
                      <Eye size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2-Way Step Navigation: Previous Step (Fleet Deck) to Left, Commit to Right */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#060a18]/95 border border-white/[0.08] backdrop-blur-2xl shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-sans">
        {/* Option to the Left: Previous Step 3 (Fleet Deck) */}
        <button
          type="button"
          onClick={() => navigate("/grid")}
          className="shrink-0 py-2.5 px-4 sm:px-5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-cyan-400/40 text-white text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer order-2 md:order-1"
        >
          <ArrowLeft size={13} />
          <span>FLEET DECK & CELLS</span>
        </button>

        {/* Center Step Routing Status */}
        <div className="space-y-0.5 text-center md:text-left flex-1 px-1 md:px-4 order-1 md:order-2">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <span className="text-[11px] font-sans font-semibold text-slate-400 uppercase tracking-wider block">
              STEP 4 ROUTING
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] font-mono text-cyan-400 uppercase">
              {(aggregateClaimableNara && !aggregateClaimableNara.isZero()) || (aggregateClaimableEth && !aggregateClaimableEth.isZero())
                ? "RESOURCES HARVEST READY"
                : "VAULT SYNCHRONIZED"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
            {(aggregateClaimableNara && !aggregateClaimableNara.isZero()) || (aggregateClaimableEth && !aggregateClaimableEth.isZero())
              ? "Harvest gathered resources directly to self-custody, or return to Fleet Deck to command your cells."
              : "Positions tracked in real-time. Return to Fleet Deck to manage formation, or commit more cells to expand share."}
          </p>
        </div>

        {/* Option to the Right: Commit Station */}
        <button
          type="button"
          onClick={() => navigate("/commit")}
          className="shrink-0 py-2.5 px-4 sm:px-5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.15)] active:scale-95 cursor-pointer order-3"
        >
          <span>COMMIT MORE CELLS</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </main>
  );
}
