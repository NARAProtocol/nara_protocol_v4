import { useState, useMemo } from "react";
import { ethers } from "ethers";
import {
  Clock,
  ChartPieSlice,
  Users,
  Stack,
  CaretRight,
  ArrowsClockwise,
  Plus,
  CheckCircle,
  WarningCircle,
  X,
  ArrowRight,
  ArrowArcLeft,
  Lightning,
  Trash,
  ChartBar,
  SquaresFour,
  Vault,
  BookOpen,
  DiamondsFour,
  Coins,
} from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import StepProgressTracker from "./StepProgressTracker";
import PolyhedronWireframe from "./PolyhedronWireframe";
import { extractAlloyFromItem, getAlloyInfo, AlloyInfo, PositionNftItem, SAMPLE_POSITIONS } from "../lib/gridContracts";

function InfoCircle({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-5 h-5 rounded-full bg-white/10 hover:bg-cyan-400/20 text-slate-400 hover:text-cyan-300 text-[10px] font-sans font-bold flex items-center justify-center border border-white/20 transition-colors focus:outline-none cursor-pointer"
        aria-label="Information"
      >
        i
      </button>
      {show && (
        <span className="absolute right-0 top-full mt-2 w-64 p-3 bg-[#060a18]/98 border border-cyan-500/40 text-xs font-sans text-slate-200 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.9)] z-50 pointer-events-none leading-relaxed">
          {text}
        </span>
      )}
    </div>
  );
}

// Pixel-perfect preview slots matching media_1789215196851.jpg
interface DisplaySlot {
  slotNum: number;
  positionId: number;
  name: string;
  cells: string;
  rawAmount: ethers.BigNumber;
  rawWeight: ethers.BigNumber;
  formattedWeight: string;
  multiplierStr: string;
  isEffectivePowerBoosted?: boolean;
  alloy: AlloyInfo;
  badgeLabel: string;
  badgeStyles: string;
  active: boolean;
  rawPosition?: PositionNftItem;
}


export default function GridDeckStation() {
  const {
    currentEpoch,
    countdownStr,
    occupancyPercentStr,
    userPositions,
    slottedTokenIds,
    deckSummary,
    userPulseSharePercent,
    userEstimated15mReward,
    totalUserCells,
    loading,
    fetchState,
    handleEquip,
    handleUnequip,
    handleAutoEquipTop6,
    handleClearSlots,
    setInspectModalItem,
    txSuccessMsg,
    setTxSuccessMsg,
    errorMsg,
    setErrorMsg,
    navigate,
  } = useGrid();

  // Determine active slots: directly from slottedTokenIds
  const displaySlots: DisplaySlot[] = useMemo(() => {
    const pool = userPositions.length > 0 ? userPositions : SAMPLE_POSITIONS;
    return [0, 1, 2, 3, 4, 5].map((idx) => {
      const tokenId = slottedTokenIds[idx];
      const pos = tokenId ? pool.find((p) => p.tokenId.eq(tokenId)) : null;
      if (!pos) {
        return {
          slotNum: idx + 1,
          positionId: 0,
          name: `Fleet Unit #${idx + 1}`,
          cells: "0.00",
          rawAmount: ethers.BigNumber.from(0),
          rawWeight: ethers.BigNumber.from(0),
          formattedWeight: "0.00",
          multiplierStr: "1.00X",
          alloy: getAlloyInfo("slate"),
          badgeLabel: "EMPTY",
          badgeStyles: "bg-slate-900/80 border-slate-500/40 text-slate-400",
          active: false,
        };
      }
      const alloy = extractAlloyFromItem(pos);
      let badgeLabel = "🟢 EMERALD";
      let badgeStyles = "bg-emerald-950/70 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.25)]";

      if (alloy.tier === "gold") {
        badgeLabel = "👑 24K GOLD";
        badgeStyles = "bg-amber-950/70 border-amber-400/60 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.35)]";
      } else if (alloy.tier === "damascus") {
        badgeLabel = "🌌 DAMASCUS";
        badgeStyles = "bg-cyan-950/70 border-cyan-400/60 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.3)]";
      } else if (alloy.tier === "obsidian") {
        badgeLabel = "🔮 OBSIDIAN";
        badgeStyles = "bg-purple-950/70 border-purple-400/60 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.35)]";
      } else if (alloy.tier === "slate") {
        badgeLabel = "🪙 SLATE";
        badgeStyles = "bg-slate-900/80 border-slate-500/40 text-slate-300 shadow-none";
      }

      const formattedCells = parseFloat(ethers.utils.formatEther(pos.amount)).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      // Check for on-chain Effective Staking Power trait (e.g. 5.50X for Damascus)
      const powerAttr = pos.attributes?.find(
        (a) => a.trait_type === "Effective Staking Power"
      );
      let effectiveMultiplier = 0;
      if (powerAttr && typeof powerAttr.value === "string") {
        effectiveMultiplier = parseFloat(powerAttr.value.replace("X", ""));
      }

      let mult = 1.0;
      const baseMult = !pos.amount.isZero() && pos.weight && !pos.weight.isZero()
        ? parseFloat(ethers.utils.formatEther(pos.weight)) / parseFloat(ethers.utils.formatEther(pos.amount))
        : 4.0;

      mult = effectiveMultiplier > 0 ? effectiveMultiplier : baseMult;
      const isEffectivePowerBoosted = effectiveMultiplier > 0 && effectiveMultiplier > baseMult + 0.05;

      const weightBN = pos.weight && !pos.weight.isZero()
        ? pos.weight
        : (!pos.amount.isZero() && mult > 0
          ? pos.amount.mul(Math.round(mult * 1000)).div(1000)
          : pos.amount.mul(4));

      const formattedWeight = parseFloat(ethers.utils.formatEther(weightBN)).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const multiplierStr = `${mult.toFixed(2)}X`;

      return {
        slotNum: idx + 1,
        positionId: pos.tokenId.toNumber(),
        name: pos.name || `NARA Position #${pos.tokenId.toString()}`,
        cells: formattedCells,
        rawAmount: pos.amount,
        rawWeight: weightBN,
        formattedWeight,
        multiplierStr,
        isEffectivePowerBoosted,
        alloy,
        badgeLabel,
        badgeStyles,
        active: true,
        rawPosition: pos,
      };
    });
  }, [slottedTokenIds, userPositions]);

  const activeSlotCount = useMemo(() => {
    return displaySlots.filter((s) => s.active).length;
  }, [displaySlots]);

  const equippedCellsBN = useMemo(() => {
    const pool = userPositions.length > 0 ? userPositions : SAMPLE_POSITIONS;
    if (slottedTokenIds.length > 0) {
      return slottedTokenIds.reduce((acc, tid) => {
        const p = pool.find((item) => item.tokenId.eq(tid));
        return p ? acc.add(p.amount) : acc;
      }, ethers.BigNumber.from(0));
    }
    return ethers.BigNumber.from(0);
  }, [slottedTokenIds, userPositions]);

  const totalUserCellsBN = useMemo(() => {
    if (!totalUserCells.isZero()) {
      return totalUserCells;
    }
    const pool = userPositions.length > 0 ? userPositions : SAMPLE_POSITIONS;
    return pool.reduce((acc, p) => acc.add(p.amount), ethers.BigNumber.from(0));
  }, [totalUserCells, userPositions]);

  const vaultReserveBN = useMemo(() => {
    if (totalUserCellsBN.gt(equippedCellsBN)) {
      return totalUserCellsBN.sub(equippedCellsBN);
    }
    return ethers.BigNumber.from(0);
  }, [totalUserCellsBN, equippedCellsBN]);

  const totalEquippedCellsFormatted = useMemo(() => {
    return parseFloat(ethers.utils.formatEther(equippedCellsBN)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [equippedCellsBN]);

  const vaultReserveCellsFormatted = useMemo(() => {
    return parseFloat(ethers.utils.formatEther(vaultReserveBN)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [vaultReserveBN]);

  const totalActiveCellsFormatted = useMemo(() => {
    return parseFloat(ethers.utils.formatEther(totalUserCellsBN)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [totalUserCellsBN]);

  const equippedRatioPercent = useMemo(() => {
    const eq = parseFloat(ethers.utils.formatEther(equippedCellsBN));
    const tot = parseFloat(ethers.utils.formatEther(totalUserCellsBN));
    if (tot <= 0) return 0;
    return Math.min(100, Math.max(0, (eq / tot) * 100));
  }, [equippedCellsBN, totalUserCellsBN]);

  const vaultRatioPercent = useMemo(() => {
    return Math.max(0, 100 - equippedRatioPercent);
  }, [equippedRatioPercent]);

  const effectiveMultiplierStr = useMemo(() => {
    if (activeSlotCount === 0) return "1.00x";
    if (deckSummary?.formattedTotalEffectiveMultiplier) {
      return deckSummary.formattedTotalEffectiveMultiplier;
    }
    if (activeSlotCount === 6) return "4.40x";
    if (activeSlotCount === 5) return "3.80x";
    if (activeSlotCount === 4) return "3.10x";
    if (activeSlotCount === 3) return "2.40x";
    if (activeSlotCount === 2) return "1.80x";
    return "1.20x";
  }, [deckSummary, activeSlotCount]);

  const synergyBadge = useMemo(() => {
    if (activeSlotCount === 0) return "FLEET STANDBY";
    if (deckSummary?.synergyTierName) {
      return deckSummary.synergyTierName;
    }
    if (activeSlotCount === 6) return "HEXA FORMATION (+25%)";
    if (activeSlotCount === 5) return "PENTA FORMATION (+18%)";
    if (activeSlotCount === 4) return "TETRA FORMATION (+12%)";
    if (activeSlotCount === 3) return "TRI-VANGUARD (+8%)";
    if (activeSlotCount === 2) return "DUAL-WING (+4%)";
    return "SOLO FORMATION (+0%)";
  }, [deckSummary, activeSlotCount]);

  const handleSingleRecall = (e: React.MouseEvent, slot: DisplaySlot) => {
    e.stopPropagation();
    if (slot.rawPosition) {
      handleUnequip(slot.rawPosition.tokenId);
    } else if (slot.positionId) {
      handleUnequip(ethers.BigNumber.from(slot.positionId));
    }
  };

  const onEmptySlotClick = () => {
    const pool = userPositions.length > 0 ? userPositions : SAMPLE_POSITIONS;
    const unslotted = pool.filter((p) => !slottedTokenIds.some((id) => id.eq(p.tokenId)));
    if (unslotted.length > 0) {
      const best = [...unslotted].sort((a, b) => (b.weight.gt(a.weight) ? 1 : -1))[0];
      handleEquip(best.tokenId);
    } else {
      navigate("/activate");
    }
  };

  const onSlotClick = (slot: DisplaySlot) => {
    if (slot.rawPosition) {
      setInspectModalItem(slot.rawPosition);
    } else {
      const pool = userPositions.length > 0 ? userPositions : SAMPLE_POSITIONS;
      const found = pool.find((p) => p.tokenId.eq(slot.positionId));
      if (found) {
        setInspectModalItem(found);
      }
    }
  };

  return (
    <main className="relative z-10 w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-4 sm:py-6 font-sans space-y-6 pb-32 sm:pb-16 select-none">
      {/* 4-Step Visual Progress Stepper (Desktop Only) */}
      <div className="hidden md:flex w-full justify-center mb-2">
        <StepProgressTracker activeStep="grid" />
      </div>

      {/* Notifications / Flash Alerts */}
      {txSuccessMsg && (
        <div className="p-3.5 bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
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
        <div className="p-3.5 bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
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
      {/* HEADER & MY ACTIVE CELLS CAPSULE                                          */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#051324] border border-[#0d2e4a] text-cyan-300 text-[11px] font-sans font-semibold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00F0FF]" />
            <span>STEP 3 · FLEET FORMATION COMMAND</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-sans">
            Sovereign Fleet Deck
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-sans leading-relaxed">
            Equip your best Active Cell positions to maximize production every 15 minutes.
          </p>
        </div>

        {/* Right High-Contrast Capsule: MY ACTIVE CELLS */}
        <div
          onClick={() => navigate("/vault")}
          className="inline-flex items-center gap-3.5 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-[#060e1d]/90 border border-[#112d4d] hover:border-cyan-400/50 backdrop-blur-2xl shadow-xl transition-all cursor-pointer group shrink-0 min-w-[270px]"
          title="Inspect your active positions in the Vault"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.2)] shrink-0">
            <Stack size={22} weight="fill" />
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-sans font-bold tracking-wider text-slate-400 uppercase">
                MY ACTIVE CELLS
              </span>
              <span className="text-[9px] font-mono text-cyan-400 font-bold px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-500/30">
                {equippedRatioPercent.toFixed(0)}% IN FLEET
              </span>
            </div>

            <span className="text-xl sm:text-2xl font-bold text-cyan-300 font-mono tracking-tight flex items-baseline gap-1.5">
              <span>{totalActiveCellsFormatted}</span>
              <span className="text-xs text-cyan-400/80 font-sans font-semibold uppercase">CELLS</span>
            </span>

            {/* Visual Micro Allocation Bar */}
            <div className="w-full mt-1.5 flex flex-col gap-1">
              <div className="w-full h-1.5 rounded-full bg-[#081b33] overflow-hidden flex shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-[#00F0FF] shadow-[0_0_6px_#00F0FF] transition-all duration-500" 
                  style={{ width: `${equippedRatioPercent}%` }} 
                />
                <div 
                  className="h-full bg-slate-600/80 transition-all duration-500" 
                  style={{ width: `${vaultRatioPercent}%` }} 
                />
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-cyan-300 font-medium truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] shadow-[0_0_4px_#00F0FF] shrink-0" />
                  <span>{totalEquippedCellsFormatted} Fleet</span>
                </span>
                <span className="flex items-center gap-1 text-slate-400 font-medium truncate ml-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                  <span>{vaultReserveCellsFormatted} Vault</span>
                </span>
              </div>
            </div>
          </div>

          <CaretRight size={16} weight="bold" className="text-slate-500 group-hover:text-cyan-300 transition-colors ml-0.5 shrink-0" />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (fetchState) fetchState();
            }}
            disabled={loading}
            className="p-1 text-slate-500 hover:text-cyan-300 transition-colors cursor-pointer shrink-0"
            title="Refresh on-chain state"
          >
            <ArrowsClockwise size={13} className={loading ? "animate-spin text-cyan-400" : ""} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4-CARD TACTICAL TELEMETRY ROW (RICH MULTI-ACCENT HARDWARE PODS)          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: NEXT PULSE (Living Heartbeat · Emerald Luminescence) */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-emerald-950/40 via-[#040e1a] to-[#020612] border border-emerald-500/35 hover:border-emerald-400/70 shadow-[0_8px_30px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(52,211,153,0.2)] transition-all duration-300 group hover:-translate-y-0.5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-emerald-500/15 blur-2xl pointer-events-none group-hover:bg-emerald-500/25 transition-all" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-950/50 border border-emerald-400/50 flex items-center justify-center text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.3)] shrink-0 relative">
              <Clock size={22} weight="bold" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-sans font-bold tracking-wider text-slate-400 uppercase block">
                  NEXT PULSE
                </span>
                <span className="px-1.5 py-0.2 rounded text-[8.5px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-[0_0_6px_rgba(52,211,153,0.2)]">
                  LIVE 15M
                </span>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono tracking-tight block drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]">
                {countdownStr || "00:31"}
              </span>
              <span className="text-xs text-emerald-400/80 font-sans block mt-0.5 font-medium">
                Pulse rewards distributing
              </span>
            </div>
          </div>
          {/* Subtle animated bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
        </div>

        {/* Card 2: MY 15M REWARD (Live On-Chain Engine Distribution) */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-blue-950/40 via-[#040e1a] to-[#020612] border border-blue-500/35 hover:border-blue-400/70 shadow-[0_8px_30px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(96,165,250,0.2)] transition-all duration-300 group hover:-translate-y-0.5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-blue-500/15 blur-2xl pointer-events-none group-hover:bg-blue-500/25 transition-all" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-950/50 border border-blue-400/50 flex items-center justify-center text-blue-300 shadow-[0_0_16px_rgba(0,82,255,0.35)] shrink-0">
              <Coins size={22} weight="bold" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-sans font-bold tracking-wider text-slate-400 uppercase block">
                  MY 15M REWARD
                </span>
                <span className="px-1.5 py-0.2 rounded text-[8.5px] font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-500/40 shadow-[0_0_6px_rgba(56,189,248,0.2)]">
                  PER 15-MIN
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 overflow-hidden">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight drop-shadow-[0_0_12px_rgba(56,189,248,0.35)] truncate">
                  {userEstimated15mReward.split(" ")[0] || "0.0000"}
                </span>
                <span className="text-xs font-bold text-blue-300 font-sans tracking-wide uppercase shrink-0">
                  {userEstimated15mReward.split(" ")[1] || "NARA"}
                </span>
              </div>
              <span className="text-xs text-blue-300/80 font-sans block mt-0.5 font-medium truncate">
                Epoch #{currentEpoch ? currentEpoch.toLocaleString("en-US") : "3,322"} · On-chain drip
              </span>
            </div>
          </div>
          {/* Subtle animated bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
        </div>

        {/* Card 3: GRID CAPACITY (Global Scarcity · Amethyst Violet) */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-purple-950/40 via-[#040e1a] to-[#020612] border border-purple-500/35 hover:border-purple-400/70 shadow-[0_8px_30px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(192,132,252,0.2)] transition-all duration-300 group hover:-translate-y-0.5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-purple-500/15 blur-2xl pointer-events-none group-hover:bg-purple-500/25 transition-all" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-950/50 border border-purple-400/50 flex items-center justify-center text-purple-300 shadow-[0_0_16px_rgba(168,85,247,0.35)] shrink-0">
              <ChartPieSlice size={22} weight="bold" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-sans font-bold tracking-wider text-slate-400 uppercase block">
                  GRID CAPACITY
                </span>
                <span className="px-1.5 py-0.2 rounded text-[8.5px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-500/40 shadow-[0_0_6px_rgba(192,132,252,0.2)]">
                  1.0M CAP
                </span>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-purple-200 font-mono tracking-tight block drop-shadow-[0_0_12px_rgba(192,132,252,0.35)] truncate">
                {occupancyPercentStr || "1.34%"}{" "}
                <span className="text-purple-400/70 text-xs font-sans font-normal">(1.0M Max)</span>
              </span>
              <span className="text-xs text-purple-300/80 font-sans block mt-0.5 font-medium">
                Global map locked saturation
              </span>
            </div>
          </div>
          {/* Subtle animated bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-400/60 to-transparent" />
        </div>

        {/* Card 4: YOUR PULSE SHARE (Crown Jewel · Radiant Electric Cyan) */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-cyan-950/60 via-[#03182e] to-[#020a14] border border-cyan-400/70 hover:border-cyan-300 shadow-[0_0_30px_rgba(0,240,255,0.25),inset_0_1px_1px_rgba(255,255,255,0.3)] ring-1 ring-cyan-400/40 transition-all duration-300 group hover:-translate-y-0.5">
          <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-cyan-400/20 blur-2xl pointer-events-none group-hover:bg-cyan-400/35 transition-all animate-pulse" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400/30 to-cyan-950/60 border border-cyan-300/80 flex items-center justify-center text-[#00F0FF] shadow-[0_0_20px_rgba(0,240,255,0.6)] shrink-0">
              <Users size={22} weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-sans font-bold tracking-wider text-cyan-300 uppercase block">
                  YOUR PULSE SHARE
                </span>
                <span className="px-2 py-0.5 rounded text-[8.5px] font-mono font-black bg-cyan-400 text-[#021e28] shadow-[0_0_8px_#00F0FF]">
                  COMMAND YIELD
                </span>
              </div>
              <span className="text-2xl sm:text-3xl font-black text-cyan-200 font-mono tracking-tight block drop-shadow-[0_0_16px_rgba(0,240,255,0.85)]">
                {userPulseSharePercent || "9.57%"}
              </span>
              <span className="text-xs text-cyan-300/90 font-sans block mt-0.5 font-medium">
                Proportional reward power
              </span>
            </div>
          </div>
          {/* Intense cyan bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-[#00F0FF] to-transparent shadow-[0_0_8px_#00F0FF]" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN 2-COLUMN COCKPIT (6 SLOTS ON LEFT, STRATEGY & SUMMARY ON RIGHT)       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ======================================================================= */}
        {/* LEFT COLUMN: 6 FORMATION SLOTS (lg:col-span-8)                          */}
        {/* ======================================================================= */}
        <div className="lg:col-span-8 rounded-2xl bg-[#040917]/95 border border-[#0d223a] p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-5">
          
          {/* Header & Synergy Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
            <div className="space-y-1.5 max-w-md">
              <div className="flex items-center gap-2.5">
                <DiamondsFour size={20} weight="fill" className="text-cyan-400" />
                <h2 className="text-base sm:text-lg font-bold tracking-wider text-white uppercase font-sans">
                  SOVEREIGN FLEET FORMATION
                </h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 font-sans font-bold tracking-wider uppercase shadow-[0_0_8px_rgba(0,240,255,0.15)]">
                  {synergyBadge}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans leading-relaxed">
                All active locked positions earn on-chain every 15 minutes. Deploy your top 6 positions to activate up to{" "}
                <strong className="text-cyan-300 font-semibold">+25% Hexa formation synergy</strong>.
              </p>
            </div>

            {/* Inset Effective Multiplier Card */}
            <div className="rounded-xl bg-[#031124] border border-cyan-400/40 p-3 px-4 shadow-[0_0_18px_rgba(0,240,255,0.15)] flex flex-col justify-between shrink-0 min-w-[170px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-cyan-300 text-[10.5px] font-sans font-bold uppercase tracking-wider">
                  <Lightning size={14} weight="fill" className="text-cyan-400" />
                  <span>EFFECTIVE MULTIPLIER</span>
                </div>
                <InfoCircle text="Formation multiplier combines base position duration boosts (up to 4.00X) with active formation synergy (up to +25%)." />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono tracking-tight mt-1">
                {effectiveMultiplierStr}
              </div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                Boosts all equipped cells
              </div>
            </div>
          </div>

          {/* Controls Bar: Fleet Deployed + Indicator Dots + Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans pt-0.5">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <span className="text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                FLEET DEPLOYED
              </span>
              <span className="text-cyan-300 font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-xs shadow-[0_0_8px_rgba(0,240,255,0.15)]">
                {activeSlotCount} / 6
              </span>
              {/* 6 Cyan Dots */}
              <div className="flex items-center gap-1.5 ml-0.5 sm:ml-1">
                {[0, 1, 2, 3, 4, 5].map((dotIdx) => (
                  <span
                    key={dotIdx}
                    className={`w-2 h-2 rounded-full transition-all ${
                      dotIdx < activeSlotCount
                        ? "bg-cyan-400 shadow-[0_0_8px_#00F0FF]"
                        : "bg-slate-700"
                    }`}
                  />
                ))}
              </div>

              {/* In-Formation Live Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[10.5px] font-semibold shadow-[0_0_8px_rgba(0,240,255,0.1)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-pulse shadow-[0_0_4px_#00F0FF]" />
                <span>{totalEquippedCellsFormatted} CELLS IN FLEET</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoEquipTop6}
                disabled={activeSlotCount === 6}
                className="px-3.5 py-1.5 bg-[#0a182d] hover:bg-[#112644] border border-[#1a385f] hover:border-cyan-400/40 text-cyan-200 hover:text-white text-[11px] font-sans font-semibold tracking-wider rounded-lg transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Lightning size={13} weight="fill" className="text-cyan-400" />
                <span>Auto-deploy top 6</span>
              </button>

              <button
                type="button"
                onClick={handleClearSlots}
                disabled={activeSlotCount === 0}
                className="px-3 py-1.5 bg-[#0a182d] hover:bg-[#112644] border border-[#1a385f] hover:border-rose-500/40 text-slate-400 hover:text-rose-200 text-[11px] font-sans font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash size={13} />
                <span>Recall Fleet</span>
              </button>
            </div>
          </div>

          {/* 6 Sovereign Fleet Units Grid (3 cols x 2 rows) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {displaySlots.map((slot) => {
              if (!slot.active) {
                return (
                  <div
                    key={slot.slotNum}
                    onClick={onEmptySlotClick}
                    className="p-3.5 rounded-xl bg-[#030814]/80 border border-dashed border-[#0e243e] hover:border-cyan-400/50 flex flex-col items-center justify-center text-center h-[155px] gap-2 text-slate-400 hover:text-slate-200 transition-all cursor-pointer group active:scale-95 shadow-sm"
                  >
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                      FLEET UNIT #{slot.slotNum}
                    </span>
                    <span className="w-8 h-8 rounded-full bg-white/[0.04] group-hover:bg-cyan-500/20 border border-white/10 group-hover:border-cyan-400/40 flex items-center justify-center text-slate-300 group-hover:text-cyan-300 transition-all">
                      <Plus size={14} />
                    </span>
                    <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-slate-400 group-hover:text-cyan-300">
                      DEPLOY FOR FLEET
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={slot.slotNum}
                  onClick={() => onSlotClick(slot)}
                  className="relative p-3.5 rounded-xl bg-[#030814] border border-[#0d223a] hover:border-cyan-500/40 flex flex-col justify-between min-h-[160px] group transition-all shadow-md cursor-pointer"
                >
                  {/* Unit Header: FLEET UNIT # and Rarity Pill */}
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
                      FLEET UNIT {slot.slotNum}
                    </span>

                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md uppercase border ${slot.badgeStyles} inline-flex items-center gap-1 whitespace-nowrap shrink-0`}>
                      <span>{slot.badgeLabel}</span>
                    </span>
                  </div>

                  {/* Slot Center: 3D Polyhedron Wireframe + Position Name, Multiplier, Cells & Weight */}
                  <div className="flex items-center gap-3 my-1">
                    <PolyhedronWireframe
                      tier={slot.alloy.tier}
                      size={44}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <h4 className="text-xs font-bold text-slate-200 truncate font-sans">
                          Position #{slot.positionId}
                        </h4>
                        {slot.isEffectivePowerBoosted ? (
                          <span className="text-[9.5px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-500/50 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.3)] shrink-0 flex items-center gap-0.5">
                            <span>⚡</span>
                            <span>{slot.multiplierStr}</span>
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-mono font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-1.5 py-0.5 rounded shadow-sm shrink-0">
                            {slot.multiplierStr}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5" title={slot.alloy.name}>
                        {slot.alloy.name}
                      </div>
                      <div className="grid grid-cols-2 gap-1 mt-1.5 pt-1.5 border-t border-white/[0.05]">
                        <div className="min-w-0">
                          <span className="text-[8px] text-slate-400 uppercase font-sans font-semibold block leading-none">
                            CELLS
                          </span>
                          <span className="text-[11px] sm:text-xs font-bold text-white font-mono tracking-tight block mt-0.5 whitespace-nowrap tabular-nums">
                            {slot.cells}
                          </span>
                        </div>
                        <div className="text-right min-w-0">
                          <span className="text-[8px] uppercase font-sans font-semibold block leading-none text-slate-400">
                            {slot.isEffectivePowerBoosted ? (
                              <span className="text-amber-400/90 font-bold">EFF. WEIGHT</span>
                            ) : (
                              <span className="text-cyan-400/80">WEIGHT</span>
                            )}
                          </span>
                          <span className={`text-[11px] sm:text-xs font-bold font-mono tracking-tight block mt-0.5 whitespace-nowrap tabular-nums ${slot.isEffectivePowerBoosted ? "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" : "text-cyan-300"}`}>
                            {slot.formattedWeight}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Slot Bottom: Active Status + Actions (Recall & View) */}
                  <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between text-[11px] font-sans">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                      <span>Active</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleSingleRecall(e, slot)}
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-slate-400 hover:text-rose-300 bg-rose-950/20 hover:bg-rose-950/60 border border-white/10 hover:border-rose-500/40 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title="Recall this unit to Vault reserve"
                      >
                        <ArrowArcLeft size={11} className="text-rose-400" />
                        <span>Recall</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSlotClick(slot)}
                        className="text-slate-400 hover:text-cyan-300 transition-colors font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>View</span>
                        <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* RIGHT COLUMN: FORMATION STRATEGY & FORMATION SUMMARY (lg:col-span-4)   */}
        {/* ======================================================================= */}
        <div className="lg:col-span-4 rounded-2xl bg-[#040917]/95 border border-[#0d223a] p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-6">
          
          {/* SECTION 1: FORMATION STRATEGY */}
          <div className="space-y-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-white font-bold text-sm tracking-wider uppercase font-sans">
                <BookOpen size={18} weight="fill" className="text-cyan-400" />
                <span>FORMATION STRATEGY</span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                How this affects your rewards
              </p>
            </div>

            {/* 3 Strategy Benefit Items */}
            <div className="space-y-3.5 pt-1">
              {/* Item 1: Stronger Cells (Emerald Output Growth) */}
              <div className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_10px_rgba(52,211,153,0.2)] mt-0.5 group-hover:scale-105 transition-transform">
                  <ChartBar size={18} weight="bold" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-[13px] font-bold text-white font-sans leading-snug">
                    Stronger cells increase output
                  </h4>
                  <p className="text-xs text-slate-400 font-sans mt-0.5 leading-relaxed">
                    Higher value positions generate more cells every 15 minutes.
                  </p>
                </div>
              </div>

              {/* Item 2: Synergy Boosts Yield (Electric Cyan) */}
              <div className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)] mt-0.5 group-hover:scale-105 transition-transform">
                  <Stack size={18} weight="bold" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-[13px] font-bold text-white font-sans leading-snug">
                    Formation synergy boosts yield
                  </h4>
                  <p className="text-xs text-slate-400 font-sans mt-0.5 leading-relaxed">
                    A full 6-unit fleet activates up to <span className="text-cyan-300 font-semibold">+25% Hexa synergy</span>.
                  </p>
                </div>
              </div>

              {/* Item 3: Rewards Harvested in Vault (Amber Gold) */}
              <div className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0 shadow-[0_0_10px_rgba(251,191,36,0.2)] mt-0.5 group-hover:scale-105 transition-transform">
                  <Vault size={18} weight="bold" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-[13px] font-bold text-white font-sans leading-snug">
                    Rewards are harvested in Vault
                  </h4>
                  <p className="text-xs text-slate-400 font-sans mt-0.5 leading-relaxed">
                    Your earned cells are collected in the Vault, ready to claim or compound.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[#0d223a]" />

          {/* SECTION 2: FORMATION SUMMARY */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-sans flex items-center gap-1.5">
                <span>FORMATION SUMMARY</span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#00F0FF]" />
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                WALLET TOTAL: <strong className="text-white font-semibold">{totalActiveCellsFormatted}</strong> CELLS
              </span>
            </div>

            {/* VISUAL TACTICAL ALLOCATION BAR */}
            <div className="p-3.5 rounded-xl bg-[#030e1d]/90 border border-[#0e2747] space-y-2.5 shadow-lg">
              <div className="flex items-center justify-between text-[11px] font-sans">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <DiamondsFour size={13} className="text-cyan-400" />
                  <span>Cell Allocation Ratio</span>
                </span>
                <span className="font-mono text-[10.5px] text-cyan-400 font-bold">
                  {equippedRatioPercent.toFixed(1)}% IN FLEET
                </span>
              </div>

              {/* 2-Tone Visual Capacity Split Bar */}
              <div className="relative w-full h-3 rounded-md bg-[#051329] border border-white/[0.08] p-0.5 flex overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-[#00F0FF] rounded-l-[3px] shadow-[0_0_12px_rgba(0,240,255,0.6)] transition-all duration-500"
                  style={{ width: `${equippedRatioPercent}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-slate-700 to-slate-600 rounded-r-[3px] transition-all duration-500"
                  style={{ width: `${vaultRatioPercent}%` }}
                />
              </div>

              {/* DUAL HARDWARE PODS: SIDE-BY-SIDE */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                {/* Pod A: IN FORMATION */}
                <div className="p-2.5 rounded-lg bg-cyan-500/[0.06] border border-cyan-400/30 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-1 text-[9.5px] font-sans font-bold tracking-wider text-cyan-300 uppercase">
                    <span className="flex items-center gap-1">
                      <Lightning size={12} weight="fill" className="text-cyan-400" />
                      <span>IN FORMATION</span>
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] shadow-[0_0_4px_#00F0FF] shrink-0" />
                  </div>
                  <div className="mt-1">
                    <span className="text-sm sm:text-base font-black text-cyan-200 font-mono tracking-tight block">
                      {totalEquippedCellsFormatted}
                    </span>
                    <span className="text-[9px] font-sans text-cyan-400/80 font-medium">
                      {activeSlotCount}/6 Units Deployed
                    </span>
                  </div>
                </div>

                {/* Pod B: VAULT RESERVE */}
                <div 
                  onClick={() => navigate("/vault")}
                  className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/60 hover:border-cyan-500/40 hover:bg-slate-800/60 transition-all cursor-pointer flex flex-col justify-between group"
                  title="Inspect reserve in Vault"
                >
                  <div className="flex items-center justify-between gap-1 text-[9.5px] font-sans font-bold tracking-wider text-slate-300 uppercase">
                    <span className="flex items-center gap-1">
                      <Vault size={12} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
                      <span>VAULT RESERVE</span>
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                  </div>
                  <div className="mt-1">
                    <span className="text-sm sm:text-base font-black text-slate-200 font-mono tracking-tight block group-hover:text-white transition-colors">
                      {vaultReserveCellsFormatted}
                    </span>
                    <span className="text-[9px] font-sans text-slate-400 font-medium group-hover:text-slate-300 transition-colors flex items-center justify-between">
                      <span>Standby Storage</span>
                      <CaretRight size={10} className="text-slate-500 group-hover:text-cyan-300 transition-colors" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* FORMATION TELEMETRY METRICS */}
            <div className="space-y-2">
              {/* Row 1: Active Fleet Units */}
              <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="flex items-center gap-2 text-slate-300 font-medium">
                  <SquaresFour size={15} className="text-purple-400" />
                  <span>Active Fleet Units</span>
                </span>
                <span className="font-mono font-bold text-purple-200 text-xs sm:text-sm">
                  {activeSlotCount} / 6
                </span>
              </div>

              {/* Row 2: Effective Multiplier */}
              <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="flex items-center gap-2 text-slate-300 font-medium">
                  <Lightning size={15} weight="fill" className="text-amber-400" />
                  <span>Effective Multiplier</span>
                </span>
                <span className="font-mono font-bold text-amber-300 text-xs sm:text-sm">
                  {effectiveMultiplierStr}
                </span>
              </div>

              {/* Row 3: Next Reward Pulse */}
              <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="flex items-center gap-2 text-slate-300 font-medium">
                  <Clock size={15} className="text-emerald-400" />
                  <span>Next Reward Pulse</span>
                </span>
                <span className="font-mono font-bold text-emerald-300 text-xs sm:text-sm">
                  {countdownStr || "00:31"}
                </span>
              </div>

              {/* Row 4: Est. 15m Pulse Yield */}
              <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-blue-500/[0.04] border border-blue-500/20">
                <span className="flex items-center gap-2 text-slate-300 font-medium">
                  <Coins size={15} weight="bold" className="text-blue-400" />
                  <span>Est. 15m Pulse Yield</span>
                </span>
                <span className="font-mono font-bold text-blue-300 text-xs sm:text-sm">
                  {userEstimated15mReward}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
