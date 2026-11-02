import { useState, useMemo } from "react";
import { ethers } from "ethers";
import {
  Coins,
  ShieldCheck,
  Eye,
  CheckCircle,
  WarningCircle,
  X,
  ArrowRight,
  Lightning,
  SortAscending,
  SortDescending,
  Trophy,
  Clock,
  Sparkle,
  TrendUp,
  Stack,
  LockKeyOpen,
  ArrowsClockwise,
  ChartBar,
  DownloadSimple,
  SquaresFour,
  List,
  CaretDown,
} from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import TacticalNumber from "./TacticalNumber";
import StepProgressTracker from "./StepProgressTracker";
import PolyhedronWireframe, { PolyhedronTier } from "./PolyhedronWireframe";
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
      return 5;
    case "damascus":
      return 4;
    case "obsidian":
      return 3;
    case "emerald":
      return 2;
    default:
      return 1;
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
    label: "15-Min Pulse (High → Low)",
    shortLabel: "15M PULSE",
    icon: Lightning,
    tooltip: "Rank by 15-minute pulse emission reward power",
  },
  {
    id: "claimable",
    label: "Most Claimable Rewards",
    shortLabel: "CLAIMABLE",
    icon: Coins,
    tooltip: "Rank by accumulated unclaimed harvest rewards",
  },
  {
    id: "amount",
    label: "Active Cells (Highest)",
    shortLabel: "CELLS",
    icon: Sparkle,
    tooltip: "Rank by committed NARA principal cells",
  },
  {
    id: "multiplier",
    label: "Boost Multiplier (Up to 4X)",
    shortLabel: "BOOST",
    icon: TrendUp,
    tooltip: "Rank by lock duration boost multiplier (1.00X - 4.00X)",
  },
  {
    id: "rarity",
    label: "Rarity Tier (Highest)",
    shortLabel: "RARITY",
    icon: Trophy,
    tooltip: "Rank by alloy tier (Apex Grail > Legendary > Rare > Uncommon > Common)",
  },
  {
    id: "maturity",
    label: "Unlock Horizon (Maturity)",
    shortLabel: "MATURITY",
    icon: Clock,
    tooltip: "Rank by maturity status (matured first, then nearest unlock epoch)",
  },
  {
    id: "token_id",
    label: "Token ID (Ascending)",
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
    totalGridLocked,
    occupancyPercentStr,
    userPositions,
    slottedTokenIds,
    activeTotalWeight,
    aggregateClaimableEth,
    aggregateClaimableNara,
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
    fetchState,
    loading,
    navigate,
  } = useGrid();

  const isPreviewMode = !connectedAddress;
  const [activeFilter, setActiveFilter] = useState<"all" | "fleet" | "vault" | "matured">("all");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("pulse_yield");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showLearnMore, setShowLearnMore] = useState<boolean>(false);
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

  // Global rank by 15-minute pulse yield among all user positions (1 = highest weight)
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

  // Filter and sort user positions
  const filteredAndSortedPositions = useMemo(() => {
    const filtered = userPositions.filter((p) => {
      const isInFleet = slottedTokenIds.some((id) => id.eq(p.tokenId));
      const isMatured = currentEpoch >= p.unlockEpoch;
      const alloy = extractAlloyFromItem(p);

      // Primary tab filter
      if (activeFilter === "fleet" && !isInFleet) return false;
      if (activeFilter === "vault" && isInFleet) return false;
      if (activeFilter === "matured" && !isMatured) return false;

      // Dropdown status filter
      if (statusFilter === "fleet" && !isInFleet) return false;
      if (statusFilter === "vault" && isInFleet) return false;
      if (statusFilter === "matured" && !isMatured) return false;

      // Dropdown rarity filter
      if (rarityFilter !== "all" && alloy.tier !== rarityFilter) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "pulse_yield": {
          if (b.weight.gt(a.weight)) cmp = 1;
          else if (b.weight.lt(a.weight)) cmp = -1;
          else cmp = b.tokenId.sub(a.tokenId).toNumber();
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
  }, [userPositions, activeFilter, statusFilter, rarityFilter, slottedTokenIds, currentEpoch, sortBy, sortDirection]);

  // Aggregate formatted totals
  const aggregateClaimableNaraFormatted = useMemo(() => {
    if (!aggregateClaimableNara || aggregateClaimableNara.isZero()) return "0.00";
    try {
      const num = parseFloat(ethers.utils.formatEther(aggregateClaimableNara));
      return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } catch {
      return "0.00";
    }
  }, [aggregateClaimableNara]);

  const aggregateClaimableEthFormatted = useMemo(() => {
    if (!aggregateClaimableEth || aggregateClaimableEth.isZero()) return "0.0000";
    try {
      const num = parseFloat(ethers.utils.formatEther(aggregateClaimableEth));
      return num.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    } catch {
      return "0.0000";
    }
  }, [aggregateClaimableEth]);

  // Macro Protocol Supply calculations
  const totalLockedNum = useMemo(() => {
    if (!totalGridLocked || totalGridLocked.isZero()) {
      return isPreviewMode ? 16200 : 0;
    }
    try {
      const num = parseFloat(ethers.utils.formatEther(totalGridLocked));
      return num > 0 ? num : isPreviewMode ? 16200 : 0;
    } catch {
      return isPreviewMode ? 16200 : 0;
    }
  }, [totalGridLocked, isPreviewMode]);

  const maxTotalSupply = 1_000_000;
  const circulatingSupplyNum = Math.max(0, maxTotalSupply - totalLockedNum);
  const circulatingSupplyFormatted = useMemo(() => {
    return circulatingSupplyNum.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }, [circulatingSupplyNum]);

  const displayOccupancyPercent = useMemo(() => {
    if (occupancyPercentStr && occupancyPercentStr !== "0.00%") return occupancyPercentStr;
    const pct = (totalLockedNum / maxTotalSupply) * 100;
    return `${pct.toFixed(2)}%`;
  }, [occupancyPercentStr, totalLockedNum]);

  // Estimated USD value for NARA harvest ready (~$1.644/NARA)
  const estimatedUsd = useMemo(() => {
    if (!aggregateClaimableNara || aggregateClaimableNara.isZero()) return "0.00";
    try {
      const naraVal = parseFloat(ethers.utils.formatEther(aggregateClaimableNara));
      return (naraVal * 1.644).toFixed(2);
    } catch {
      return "0.00";
    }
  }, [aggregateClaimableNara]);

  const minNaraThreshold = ethers.utils.parseEther("0.0001");
  const minEthThreshold = ethers.utils.parseEther("0.000001");

  const eligibleHarvestPositions = userPositions.filter((p) => {
    const hasNara = p.claimableNara && p.claimableNara.gt(minNaraThreshold);
    const hasEth = p.claimableEth && p.claimableEth.gt(minEthThreshold);
    return hasNara || hasEth;
  });

  const hasHarvestable = eligibleHarvestPositions.length > 0;

  const fleetPositionsCount = slottedTokenIds.length;
  const vaultPositionsCount = Math.max(0, userPositions.length - fleetPositionsCount);
  const maturedPositionsCount = userPositions.filter((p) => currentEpoch >= p.unlockEpoch).length;

  return (
    <main className="relative z-10 w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-4 sm:py-6 font-sans space-y-6 pb-32 sm:pb-16 select-none">
      {/* 4-Step Visual Progress Stepper (Desktop Only) */}
      <div className="hidden md:flex w-full justify-center mb-2">
        <StepProgressTracker activeStep="vault" />
      </div>

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
              onClick={() => navigate("/activate")}
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
                No Grid positions found on Base for this wallet. Activate $NARA to mint your first cell and command pulse distributions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/activate")}
            className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-xs rounded-xl transition-all shadow-md uppercase tracking-wider shrink-0 cursor-pointer active:scale-95"
          >
            Activate Cells (Join Grid)
          </button>
        </div>
      )}

      {/* Notifications / Flash Alerts */}
      {txSuccessMsg && (
        <div className="p-3.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle size={16} className="shrink-0 text-emerald-400" />
            {txSuccessMsg}
          </span>
          <button onClick={() => setTxSuccessMsg(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
          <span className="flex items-center gap-2 font-medium">
            <WarningCircle size={16} className="shrink-0 text-rose-400" />
            {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COCKPIT TITLE                                                             */}
      {/* ========================================================================= */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#051324] border border-[#0d2e4a] text-cyan-300 text-[11px] font-sans font-semibold tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00F0FF]" />
          <span>STEP 4 · HARVEST COMMAND & RESOURCE VAULT</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-sans">
          Resource Vault & Harvester
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 font-sans leading-relaxed">
          Harvest accumulated ecosystem rewards or deploy them back to the Grid to grow your influence.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* HERO CLAIMABLE BANNER & PRIMARY ACTIONS (CONSOLIDATED TOP CORNER / HERO)  */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 bg-gradient-to-br from-[#051428]/95 via-[#030b19] to-[#020612] border border-cyan-500/35 shadow-[0_12px_40px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(0,240,255,0.25)]">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Total Harvest Ready + Amounts */}
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-[#020b18] border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_24px_rgba(0,240,255,0.3)] shrink-0 relative">
              <Coins size={32} weight="bold" />
              {hasHarvestable && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                </span>
              )}
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-[11px] font-sans font-bold tracking-wider text-slate-400 uppercase">
                  TOTAL HARVEST READY
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
                    hasHarvestable
                      ? "text-emerald-300 bg-emerald-950/80 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
                      : "text-slate-400 bg-slate-900 border-slate-700"
                  }`}
                >
                  {hasHarvestable ? "READY TO PULL" : "ACCUMULATING"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (fetchState) fetchState();
                  }}
                  disabled={loading}
                  className="p-1 text-slate-500 hover:text-cyan-300 transition-colors cursor-pointer"
                  title="Refresh on-chain balances"
                >
                  <ArrowsClockwise size={12} className={loading ? "animate-spin text-cyan-400" : ""} />
                </button>
              </div>

              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl sm:text-3xl lg:text-4xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_16px_rgba(0,240,255,0.4)]">
                  {aggregateClaimableNaraFormatted}
                </span>
                <span className="text-sm sm:text-base font-bold text-cyan-400/90 font-sans uppercase">
                  NARA
                </span>
                <span className="text-xs sm:text-sm font-mono text-slate-400 ml-1">
                  ≈ ${estimatedUsd} USD (est.)
                </span>
                {aggregateClaimableEth && !aggregateClaimableEth.isZero() && (
                  <span className="text-xs sm:text-sm font-mono text-emerald-400 ml-1">
                    +{aggregateClaimableEthFormatted} ETH
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 font-sans">
                {hasHarvestable
                  ? "Your rewards are ready to harvest."
                  : "Rewards accumulate autonomously every 15-minute pulse from on-chain activity."}
              </p>
            </div>
          </div>

          {/* Right: Primary Call-to-Action Buttons */}
          <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
            <button
              type="button"
              onClick={isPreviewMode ? handleConnectClick : () => handleHarvestAll()}
              disabled={isPreviewMode ? isConnecting : !hasHarvestable || actionBusy === "harvest-all"}
              className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs sm:text-sm font-bold font-sans tracking-wide transition-all shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:shadow-[0_0_30px_rgba(0,240,255,0.6)] cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <DownloadSimple size={18} weight="bold" />
              <span>
                {isPreviewMode
                  ? isConnecting
                    ? "Connecting..."
                    : "Connect to Harvest"
                  : actionBusy === "harvest-all"
                  ? "Harvesting..."
                  : "Harvest Now"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/activate")}
              className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#091424] hover:bg-[#0e213b] border border-cyan-500/30 hover:border-cyan-400/60 text-white text-xs sm:text-sm font-bold font-sans tracking-wide transition-all shadow-md cursor-pointer active:scale-95"
            >
              <Lightning size={18} weight="fill" className="text-cyan-400" />
              <span>Deploy to Grid</span>
            </button>
          </div>
        </div>
      </div>


      {/* ========================================================================= */}
      {/* REWARD BREAKDOWN & 15-MINUTE PULSE SYSTEM (3-PANEL MOCKUP ARCHITECTURE)  */}
      {/* ========================================================================= */}
      <div className="rounded-2xl p-5 sm:p-6 bg-[#040a17]/95 border border-white/10 space-y-5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ChartBar size={20} weight="bold" className="text-cyan-400" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide font-sans">
                Reward Breakdown
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              The engine generates rewards every 15 minutes from on-chain activity. Rewards accumulate here until you harvest or deploy them to the Grid.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowLearnMore(!showLearnMore)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 hover:text-cyan-300 text-xs font-semibold transition-all cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <span>{showLearnMore ? "Hide Guide" : "Learn More"}</span>
            <ArrowRight size={12} className={showLearnMore ? "rotate-90 transition-transform" : "transition-transform"} />
          </button>
        </div>

        {/* Expandable Educational Guide */}
        {showLearnMore && (
          <div className="p-4 rounded-xl bg-[#030712] border border-cyan-500/30 text-xs text-slate-300 space-y-2.5 font-sans animate-in fade-in duration-200">
            <div className="font-bold text-cyan-300 uppercase tracking-wider text-[11px]">
              How Vault Pulse Rewards Operate
            </div>
            <p className="text-slate-400 leading-relaxed">
              Every 15 minutes, the autonomous NARA Engine executes an on-chain pulse. It computes total active cell weight across the Grid and splits scheduled clockwork emissions and collected ecosystem fees (Uniswap v4 swaps, flash loans, and basket activity) proportionally among active cells.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5 space-y-1">
                <span className="font-bold text-white">HARVEST (Extract to Wallet):</span>
                <p className="text-slate-400">Claims all accumulated NARA and ETH directly to your self-custody wallet in a single atomic transaction.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5 space-y-1">
                <span className="font-bold text-white">DEPLOY (Compound Influence):</span>
                <p className="text-slate-400">Activates NARA into new cells to permanently expand your proportional share of upcoming 15-minute pulses.</p>
              </div>
            </div>
          </div>
        )}

        {/* 3 Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Panel 1: NARA REWARDS */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-950/30 via-[#030814] to-[#02050f] border border-cyan-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-bold font-sans text-sm shadow-[0_0_12px_rgba(0,240,255,0.2)]">
                N
              </div>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-[0_0_6px_rgba(0,240,255,0.2)]">
                PRIMARY REWARD
              </span>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                NARA REWARDS (15-MIN CLOCKWORK)
              </div>
              <div className="text-2xl font-black text-cyan-300 font-mono tracking-tight mt-0.5">
                {aggregateClaimableNaraFormatted} <span className="text-xs text-cyan-400/80 font-sans">NARA</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                From ecosystem activity across your active cells.
              </p>
            </div>
          </div>

          {/* Panel 2: ETH REWARDS */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900/40 via-[#030814] to-[#02050f] border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold font-sans text-sm shadow-[0_0_12px_rgba(99,102,241,0.2)]">
                ♦
              </div>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-900 text-slate-400 border border-slate-700">
                SECONDARY REWARD
              </span>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                ETH REWARDS (ECOSYSTEM FLOW)
              </div>
              <div className="text-2xl font-black text-white font-mono tracking-tight mt-0.5">
                {aggregateClaimableEthFormatted} <span className="text-xs text-slate-400 font-sans">ETH</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                From Uniswap v4 swaps, flash loans, and ecosystem activity.
              </p>
            </div>
          </div>

          {/* Panel 3: 15-MINUTE PULSE SYSTEM */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/30 via-[#030814] to-[#02050f] border border-blue-500/30 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <Clock size={16} />
                <span>15-MINUTE PULSE SYSTEM</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 font-sans leading-relaxed">
                Active cells generate resources every 15 minutes, automatically, from real on-chain activity.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06] flex-wrap">
              <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                ✓ AUTOMATIC
              </span>
              <span className="text-[9px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                ✓ ON-CHAIN
              </span>
              <span className="text-[9px] font-mono text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-500/30">
                ✓ TRANSPARENT
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PROTOCOL ECONOMICS & LIQUIDITY BACKING (REPLACING REDUNDANT BUTTONS)     */}
      {/* ========================================================================= */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#051124]/90 via-[#030814] to-[#020612] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-xl">
        {/* Hard-Capped Supply Distribution */}
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-sans">
            <span className="text-slate-300 font-bold tracking-wider uppercase flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-cyan-400" />
              <span>HARD-CAPPED SUPPLY RATIO</span>
            </span>
            <span className="font-mono text-cyan-300 font-bold text-xs sm:text-sm">
              {totalLockedNum.toLocaleString(undefined, { maximumFractionDigits: 0 })} / 1,000,000 NARA ({displayOccupancyPercent})
            </span>
          </div>

          {/* Segmented Ratio Bar */}
          <div className="w-full h-3 rounded-full bg-slate-800/80 overflow-hidden flex border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_#00f0ff]"
              style={{ width: `${Math.min(100, Math.max(1.62, (totalLockedNum / 1_000_000) * 100))}%` }}
              title={`Committed in Grid: ${totalLockedNum.toLocaleString()} NARA`}
            />
            <div
              className="h-full bg-slate-700/60"
              style={{ width: `${Math.max(0, 100 - (totalLockedNum / 1_000_000) * 100)}%` }}
              title={`Circulating: ${circulatingSupplyFormatted} NARA`}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 flex-wrap gap-2">
            <span className="text-cyan-300">● Committed in Grid: {totalLockedNum.toLocaleString(undefined, { maximumFractionDigits: 0 })} Cells</span>
            <span className="text-slate-300">● Free Circulating: {circulatingSupplyFormatted} NARA</span>
            <span className="text-emerald-400">● Hard Cap: 1,000,000 NARA (0% Inflation)</span>
          </div>
        </div>

        {/* Uniswap v4 Permanent POL Vault */}
        <div className="md:w-80 p-4 rounded-xl bg-cyan-950/25 border border-cyan-500/25 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-cyan-400">
            <span>UNISWAP V4 POL VAULT</span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[8.5px] text-cyan-300 shadow-[0_0_6px_rgba(0,240,255,0.2)]">
              POL BACKING
            </span>
          </div>
          <div className="text-base font-black text-white font-mono">
            $2,700+ USDC
          </div>
          <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
            DEX swap fees banked in Liquidity Vault & compounded into permanent protocol-owned liquidity.
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SOVEREIGN POSITION PLATES (SUMMARY PILLS, FILTER TABS, 4-COL GRID & LIST) */}
      {/* ========================================================================= */}
      <div className="rounded-2xl bg-[#040917]/95 border border-[#0d223a] p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-6">
        {/* Section Header with Aggregate Counter Pills */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} weight="fill" className="text-cyan-400" />
              <h2 className="text-lg font-bold text-white tracking-wide font-sans">
                Sovereign Position Plates
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Your Active Cell positions and their 15-minute pulse distributions.
            </p>
          </div>

          {/* Right Summary Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <Stack size={13} className="text-cyan-400" />
              <span>{userPositions.length} Total Positions</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{fleetPositionsCount} In Fleet</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>{vaultPositionsCount} In Vault Reserve</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm">
              <CheckCircle size={13} className="text-emerald-400" />
              <span>{maturedPositionsCount} Matured</span>
            </span>
          </div>
        </div>

        {/* Filter Tabs & Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold transition-all uppercase cursor-pointer whitespace-nowrap ${
                activeFilter === "all"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ALL ({userPositions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("fleet")}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold transition-all uppercase cursor-pointer whitespace-nowrap ${
                activeFilter === "fleet"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              In Fleet ({fleetPositionsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("vault")}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold transition-all uppercase cursor-pointer whitespace-nowrap ${
                activeFilter === "vault"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              In Vault ({vaultPositionsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("matured")}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold transition-all uppercase cursor-pointer whitespace-nowrap ${
                activeFilter === "matured"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Matured ({maturedPositionsCount})
            </button>
          </div>

          {/* Right Controls: Sort Dropdown, Rarity Filter, Status Filter, Grid/List Toggles */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => handleSortSelect(e.target.value as SortField)}
                aria-label="Sort positions by"
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-cyan-400/40 text-slate-200 text-xs font-sans font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
              <CaretDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Rarity Dropdown */}
            <div className="relative">
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
                aria-label="Filter positions by rarity tier"
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-cyan-400/40 text-slate-200 text-xs font-sans font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Rarities</option>
                <option value="gold" className="bg-slate-900 text-white">👑 Apex Gold</option>
                <option value="damascus" className="bg-slate-900 text-white">🌌 Damascus</option>
                <option value="obsidian" className="bg-slate-900 text-white">🔮 Obsidian</option>
                <option value="emerald" className="bg-slate-900 text-white">🟢 Emerald</option>
                <option value="slate" className="bg-slate-900 text-white">🪙 Common</option>
              </select>
              <CaretDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Status Dropdown */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter positions by fleet status"
                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-cyan-400/40 text-slate-200 text-xs font-sans font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Statuses</option>
                <option value="fleet" className="bg-slate-900 text-white">In Fleet</option>
                <option value="vault" className="bg-slate-900 text-white">In Vault</option>
                <option value="matured" className="bg-slate-900 text-white">Matured</option>
              </select>
              <CaretDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Direction Toggle */}
            <button
              type="button"
              onClick={() => setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"))}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-cyan-300 transition-colors cursor-pointer"
              title={sortDirection === "desc" ? "Sorted Descending (Click to invert)" : "Sorted Ascending (Click to invert)"}
            >
              {sortDirection === "desc" ? <SortDescending size={15} /> : <SortAscending size={15} />}
            </button>

            {/* View Mode Toggle: Grid vs List */}
            <div className="flex items-center p-0.5 rounded-xl bg-black/40 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === "grid" ? "bg-cyan-500/20 text-cyan-300 shadow-sm" : "text-slate-500 hover:text-white"
                }`}
                title="Compact 4-Column Grid View"
              >
                <SquaresFour size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === "list" ? "bg-cyan-500/20 text-cyan-300 shadow-sm" : "text-slate-500 hover:text-white"
                }`}
                title="Detailed Tactical List View"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Position Inventory: Empty State */}
        {filteredAndSortedPositions.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-[#03050b]/80 border border-dashed border-white/10 space-y-3 font-sans">
            <p className="text-xs sm:text-sm text-slate-300">No Position Plates match the selected filter criteria.</p>
            <button
              type="button"
              onClick={() => navigate("/activate")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-300 text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <span>Activate NARA & Mint Position Plate</span>
              <ArrowRight size={13} />
            </button>
          </div>
        ) : viewMode === "grid" ? (
          /* ======================================================================= */
          /* 4-COLUMN COMPACT CARD GRID (MATCHES REFERENCE MOCKUP)                   */
          /* ======================================================================= */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredAndSortedPositions.map((item) => {
              const isSlotted = slottedTokenIds.some((id) => id.eq(item.tokenId));
              const isMatured = currentEpoch >= item.unlockEpoch;
              const alloy = extractAlloyFromItem(item);

              // 15-minute reward estimate for this position
              const totalWeightNum =
                activeTotalWeight && !activeTotalWeight.isZero()
                  ? parseFloat(ethers.utils.formatEther(activeTotalWeight))
                  : 0;
              const itemWeightNum = item.weight ? parseFloat(ethers.utils.formatEther(item.weight)) : 0;
              const estimatedNara15m =
                totalWeightNum > 0 ? (itemWeightNum / totalWeightNum) * 0.0108 : 0.0012;

              const hasRewards =
                (item.claimableNara && item.claimableNara.gt(0)) ||
                (item.claimableEth && item.claimableEth.gt(0));

              return (
                <div
                  key={item.tokenId.toString()}
                  className="rounded-2xl p-4 bg-gradient-to-br from-[#060e1d]/90 via-[#040816] to-[#02050e] border border-white/10 hover:border-cyan-500/40 transition-all duration-200 flex flex-col justify-between gap-3.5 font-sans group shadow-md hover:-translate-y-0.5"
                >
                  {/* Top Row: Rarity Pill on Left, Formation Status on Right */}
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border ${alloy.bgClass} ${alloy.borderClass} ${alloy.colorClass} inline-flex items-center gap-1 shadow-sm`}
                    >
                      <span>{alloy.icon}</span>
                      <span>{alloy.badgeLabel}</span>
                    </span>

                    <span
                      className={`text-[9.5px] font-sans font-bold px-2 py-0.5 rounded-full uppercase border tracking-wider flex items-center gap-1.5 shrink-0 ${
                        isSlotted
                          ? "bg-cyan-500/15 text-cyan-300 border-cyan-400/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                          : "bg-white/[0.04] text-slate-400 border-white/10"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSlotted ? "bg-cyan-400 animate-pulse shadow-[0_0_6px_#00f0ff]" : "bg-slate-500"}`} />
                      <span>{isSlotted ? "IN FLEET" : "VAULT"}</span>
                    </span>
                  </div>

                  {/* Center: 3D Polyhedron Wireframe + Name + Cells + 15m Yield */}
                  <div className="flex items-center gap-3 my-0.5">
                    <div className="w-11 h-11 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0 shadow-inner relative overflow-hidden group-hover:border-cyan-500/30 transition-colors">
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none" />
                      <PolyhedronWireframe
                        tier={(alloy.tier || "uncommon") as PolyhedronTier}
                        size={36}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white font-sans truncate" title={item.name}>
                        {item.name}
                      </h4>
                      <div className="text-sm font-bold text-white font-mono tracking-tight mt-0.5">
                        <TacticalNumber
                          value={item.amount}
                          symbol="CELLS"
                          decimals={0}
                          noUnderline
                          symbolClassName="text-[9.5px] text-cyan-400/80 font-sans ml-1 font-semibold"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        ~{estimatedNara15m.toFixed(4)} NARA / 15m
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Rewards Pill / Active Status + View -> Button */}
                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                    {hasRewards ? (
                      <span className="text-[10.5px] font-mono font-medium text-emerald-400 flex items-center gap-1">
                        <span>+</span>
                        <TacticalNumber value={item.claimableNara} symbol="NARA" decimals={2} noUnderline />
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {isMatured ? "Matured" : "Active Flow"}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setInspectModalItem(item)}
                      className="inline-flex items-center gap-1 text-slate-400 group-hover:text-cyan-300 text-xs font-semibold transition-colors cursor-pointer hover:underline"
                    >
                      <span>View</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ======================================================================= */
          /* DETAILED TACTICAL LIST VIEW (ACCESSIBLE VIA TOGGLE)                     */
          /* ======================================================================= */
          <div className="space-y-3">
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
                  : "0.00%";

              const remainingEpochs = Math.max(0, item.unlockEpoch - currentEpoch);
              const remainingHours = (remainingEpochs * 0.25).toFixed(1);

              const hasRewards =
                (item.claimableNara && item.claimableNara.gt(0)) ||
                (item.claimableEth && item.claimableEth.gt(0));

              return (
                <div
                  key={item.tokenId.toString()}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex flex-col gap-3 font-sans ${
                    isSlotted
                      ? "bg-gradient-to-br from-[#071328]/95 via-[#040b19] to-[#020610] border-cyan-500/40 shadow-xl"
                      : "bg-gradient-to-br from-[#060e1d]/90 via-[#040816] to-[#02050e] border-white/10 hover:border-white/20 shadow-md"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                        <PolyhedronWireframe
                          tier={(alloy.tier || "uncommon") as PolyhedronTier}
                          size={34}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-cyan-400">
                            #{item.tokenId.toString()}
                          </span>
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase border bg-white/[0.05] border-white/15 text-slate-300">
                            #{pulseRank} EARNER
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border ${alloy.bgClass} ${alloy.borderClass} ${alloy.colorClass}`}>
                            {alloy.badgeLabel}
                          </span>
                          <span className={`text-[9px] font-sans font-bold px-2 py-0.5 rounded-full uppercase border ${
                            isSlotted ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/40" : "bg-white/5 text-slate-400 border-white/10"
                          }`}>
                            {isSlotted ? "IN FLEET" : "VAULT"}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-0.5">{item.name}</h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">ACTIVE CELLS</span>
                        <span className="text-white font-bold">
                          <TacticalNumber value={item.amount} symbol="Cells" decimals={0} noUnderline />
                        </span>
                      </div>
                      <div className="border-l border-white/10 pl-3">
                        <span className="text-[10px] text-cyan-400 font-sans block">15M POWER</span>
                        <span className="text-cyan-300 font-bold">
                          <TacticalNumber value={item.weight} symbol="WGT" decimals={1} noUnderline /> ({multiplier.toFixed(2)}X)
                        </span>
                        <span className="text-[9px] text-cyan-400/80 block">~{pulseShareStr} pulse</span>
                      </div>
                      <div className="border-l border-white/10 pl-3">
                        <span className="text-[10px] text-slate-400 font-sans block">HORIZON</span>
                        <span className={`font-bold ${isMatured ? "text-emerald-400" : "text-slate-300"}`}>
                          {isMatured ? "MATURED" : `~${remainingHours}h`}
                        </span>
                      </div>
                      <div className="border-l border-white/10 pl-3">
                        <span className="text-[10px] text-slate-400 font-sans block">CLAIMABLE</span>
                        <span className="text-emerald-400 font-bold">
                          +{parseFloat(ethers.utils.formatEther(item.claimableNara)).toFixed(2)} NARA
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {isSlotted ? (
                        <button
                          type="button"
                          onClick={() => handleUnequip(item.tokenId)}
                          className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase cursor-pointer"
                        >
                          Recall
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEquip(item.tokenId)}
                          disabled={slottedTokenIds.length >= 6}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
                        >
                          Equip
                        </button>
                      )}

                      {hasRewards && (
                        <button
                          type="button"
                          onClick={item.isSample ? handleConnectClick : () => handleHarvestSingle(item.tokenId)}
                          disabled={item.isSample ? isConnecting : actionBusy === `harvest-${item.tokenId.toString()}`}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-bold uppercase cursor-pointer"
                        >
                          Harvest
                        </button>
                      )}

                      {isMatured && (
                        <button
                          type="button"
                          onClick={() => handleUnlock(item.tokenId)}
                          disabled={actionBusy === `unlock-${item.tokenId.toString()}`}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                          title="Maturity reached! Disconnect principal to wallet"
                        >
                          <LockKeyOpen size={13} />
                          <span>{actionBusy === `unlock-${item.tokenId.toString()}` ? "DISCONNECTING..." : "DISCONNECT"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setInspectModalItem(item)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white cursor-pointer"
                        title="Inspect metadata"
                      >
                        <Eye size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
