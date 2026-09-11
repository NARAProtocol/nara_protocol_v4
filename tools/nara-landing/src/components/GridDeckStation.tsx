import { useState } from "react";
import {
  Cpu,
  ArrowsClockwise,
  Plus,
  Eye,
  CheckCircle,
  WarningCircle,
  X,
  ArrowRight,
  ArrowLeft,
} from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import TacticalNumber from "./TacticalNumber";
import StepProgressTracker from "./StepProgressTracker";
import { extractAlloyFromItem } from "../lib/gridContracts";

function InfoCircle({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-6 h-6 rounded-full bg-white/10 hover:bg-cyan-400/20 text-slate-300 hover:text-cyan-300 text-[10px] font-sans font-bold flex items-center justify-center border border-white/20 transition-colors focus:outline-none"
        aria-label="Information"
      >
        i
      </button>
      {show && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-[#060a18]/98 border border-cyan-500/40 text-xs font-sans text-slate-200 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.9)] z-50 pointer-events-none leading-relaxed">
          {text}
        </span>
      )}
    </div>
  );
}

export default function GridDeckStation() {
  const {
    currentEpoch,
    countdownStr,
    totalGridLocked,
    occupancyPercentStr,
    userPositions,
    slottedTokenIds,
    deckSummary,
    userPulseSharePercent,
    aggregateClaimableEth,
    aggregateClaimableNara,
    totalUserCells,
    loading,
    fetchState,
    handleAutoEquipTop6,
    handleEquip,
    handleUnequip,
    handleClearSlots,
    setInspectModalItem,
    txSuccessMsg,
    setTxSuccessMsg,
    errorMsg,
    setErrorMsg,
    navigate,
  } = useGrid();

  const isHarvestReady = !aggregateClaimableEth.isZero() || !aggregateClaimableNara.isZero();

  return (
    <main className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-8 font-sans pb-12">
      {/* 4-Step Visual Progress Stepper */}
      <StepProgressTracker activeStep="grid" />

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

      {/* Header & Live Pulse Telemetry Strip */}
      <div className="space-y-4 pb-2 border-b border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[11px] font-sans font-semibold tracking-wider uppercase shadow-[0_0_12px_rgba(0,240,255,0.15)]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>STEP 3 · FLEET FORMATION COMMAND</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase flex items-center gap-2.5 font-display">
              <Cpu size={22} className="text-cyan-400" />
              <span>SOVEREIGN FLEET DECK</span>
            </h1>
          </div>

          {/* High-Contrast Unified Telemetry Capsule (Immune to Background Noise) */}
          <div className="inline-flex items-center gap-3 px-3.5 py-2 rounded-xl bg-[#060a18]/95 border border-cyan-500/30 backdrop-blur-2xl shadow-[0_8px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(0,240,255,0.12)] ring-1 ring-cyan-500/20">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500 shadow-[0_0_8px_#00f0ff]" />
              </span>
              <span className="text-[11px] font-sans font-semibold tracking-wider text-slate-300 uppercase select-none">
                MY ACTIVE CELLS
              </span>
            </div>
            <div className="h-4 w-[1px] bg-white/15" />
            <span className="text-base sm:text-lg font-black text-cyan-300 font-mono tracking-wide drop-shadow-[0_0_12px_rgba(0,240,255,0.65)]">
              <TacticalNumber value={totalUserCells} symbol="CELLS" noUnderline symbolClassName="text-xs text-cyan-400/80 font-semibold" />
            </span>
            <button
              type="button"
              onClick={fetchState}
              disabled={loading}
              className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] transition-all focus:outline-none active:scale-90"
              title="Refresh on-chain state"
            >
              <ArrowsClockwise size={13} className={loading ? "animate-spin text-cyan-400" : ""} />
            </button>
          </div>
        </div>

        {/* Tactical Telemetry Strip: Live Countdown & Pulse Share */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#060a18]/95 border border-white/[0.08] backdrop-blur-2xl shadow-xl">
          {/* Pulse Ticker */}
          <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399] shrink-0" />
            <div className="min-w-0">
              <span className="text-slate-400 font-sans font-semibold block text-[10px] tracking-wider uppercase">NEXT PULSE</span>
              <span className="text-sm font-bold text-emerald-300 font-mono tracking-wider">{countdownStr}</span>
            </div>
          </div>

          {/* Epoch */}
          <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-cyan-400/60 shrink-0 shadow-[0_0_8px_rgba(0,240,255,0.4)]" />
            <div className="min-w-0">
              <span className="text-slate-400 font-sans font-semibold block text-[10px] tracking-wider uppercase">EPOCH</span>
              <span className="text-sm font-bold text-white font-mono tracking-wide">{currentEpoch.toLocaleString("en-US")}</span>
            </div>
          </div>

          {/* Global Map Scarcity */}
          <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-blue-400/60 shrink-0 shadow-[0_0_8px_rgba(0,82,255,0.4)]" />
            <div className="min-w-0">
              <span className="text-slate-400 font-sans font-semibold block text-[10px] tracking-wider uppercase">GRID CAPACITY</span>
              <span className="text-sm font-bold text-white font-mono tracking-wide" title={`${totalGridLocked} active cells locked out of 1,000,000 max capacity`}>
                {occupancyPercentStr} <span className="text-slate-400 text-xs font-sans font-normal">(1.0M Cap)</span>
              </span>
            </div>
          </div>

          {/* User's Pulse Share % */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-950/40 via-[#071329] to-[#040814] border border-cyan-500/40 shadow-[0_0_18px_rgba(0,240,255,0.15)] ring-1 ring-cyan-500/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_10px_#00f0ff] animate-pulse" />
              <div className="min-w-0">
                <span className="text-cyan-200/90 font-sans font-bold block text-[10px] tracking-wider uppercase">YOUR PULSE SHARE</span>
                <span className="text-lg sm:text-xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_14px_rgba(0,240,255,0.7)]">{userPulseSharePercent}</span>
              </div>
            </div>
            <InfoCircle text="Proportional Law: Distributions are divided strictly across active cells on the map. When other players leave, active cells decrease — automatically expanding your proportional share of every future pulse." />
          </div>
        </div>
      </div>

      {/* Main Tactical Fleet Deck Panel */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#060a18]/95 border border-white/[0.08] backdrop-blur-2xl shadow-2xl space-y-6">
        {/* Header & Synergy Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold tracking-wider text-white uppercase font-sans">
                6 FORMATION SLOTS
              </h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-400/30 text-blue-300 font-sans font-bold tracking-wider uppercase shadow-[0_0_10px_rgba(0,82,255,0.2)]">
                {deckSummary?.synergyTierName || "PICKS & MATCHES"}
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-slate-300 font-sans leading-relaxed max-w-xl">
              All active locked positions earn on-chain every 15 minutes. Slot your top 6 positions to activate up to <strong className="text-cyan-300 font-semibold">+25% Hexa formation synergy</strong>.
            </p>
          </div>

          {/* Total Multiplier Hero KPI */}
          <div className="inline-flex items-center gap-3.5 px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl bg-gradient-to-br from-cyan-950/60 via-[#07152b] to-[#030712] border border-cyan-400/50 shadow-[0_0_30px_rgba(0,240,255,0.25),inset_0_1px_1px_rgba(255,255,255,0.2)] self-start sm:self-auto ring-1 ring-cyan-400/20">
            <div className="flex flex-col text-right">
              <span className="text-[10px] sm:text-[11px] font-sans font-bold text-cyan-200 uppercase tracking-wider flex items-center gap-1.5 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f0ff]" />
                EFFECTIVE MULTIPLIER
              </span>
              <span className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_16px_rgba(0,240,255,0.85)]">
                {deckSummary?.formattedTotalEffectiveMultiplier || "1.00X"}
              </span>
            </div>
            <div className="h-8 w-[1px] bg-cyan-500/30" />
            <InfoCircle text="How Multipliers Work: Every locked position earns rewards based on its lock duration (up to 4.00X) on-chain after an 8-epoch (2-hour) activation delay. Formation Slots aggregate your top 6 positions with up to +25% Hexa Armada synergy bonus (max effective 10.00X)." />
          </div>
        </div>

        {/* Formation Controls Bar */}
        <div className="flex items-center justify-between text-xs font-sans text-slate-300 pt-0.5">
          <span className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">SLOTS OCCUPIED:</span>
            <span className="text-cyan-300 font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30 shadow-[0_0_8px_rgba(0,240,255,0.15)]">
              {slottedTokenIds.length} / 6
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoEquipTop6}
              disabled={userPositions.length === 0}
              className="px-3.5 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-200 hover:text-white text-[11px] font-sans font-bold tracking-wider uppercase rounded-lg transition-all shadow-[0_0_12px_rgba(0,240,255,0.1)] active:scale-95 disabled:opacity-40"
            >
              AUTO-EQUIP TOP 6
            </button>
            {slottedTokenIds.length > 0 && (
              <button
                type="button"
                onClick={handleClearSlots}
                className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/10 border border-white/[0.08] text-slate-400 hover:text-white text-[11px] font-sans font-medium rounded-lg transition-colors"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>

        {/* 6 Formation Slots Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {[0, 1, 2, 3, 4, 5].map((slotIdx) => {
            const tokenId = slottedTokenIds[slotIdx];
            const position = tokenId
              ? userPositions.find((p) => p.tokenId.eq(tokenId))
              : null;

            if (position) {
              const alloy = extractAlloyFromItem(position);
              return (
                <div
                  key={slotIdx}
                  className="relative p-3.5 rounded-xl bg-[#090e1f]/95 border border-blue-500/30 flex flex-col justify-between h-36 group transition-colors hover:border-cyan-400/50 shadow-lg"
                >
                  <button
                    type="button"
                    onClick={() => handleUnequip(position.tokenId)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-white/15 flex items-center justify-center text-xs font-bold transition-all z-10 active:scale-90"
                    title="Unequip Slot"
                  >
                    ×
                  </button>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1 pr-6">
                      <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
                        SLOT #{slotIdx + 1}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${alloy.bgClass} ${alloy.borderClass} ${alloy.colorClass} ${alloy.glowClass} inline-flex items-center gap-0.5 shrink-0`}
                      >
                        <span>{alloy.icon}</span>
                        <span>{alloy.badgeLabel}</span>
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white truncate font-sans">{position.name}</h4>
                    <span className="text-xs sm:text-sm font-mono font-bold text-cyan-200 block drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                      <TacticalNumber value={position.amount} symbol="CELLS" noUnderline symbolClassName="text-[10px] text-cyan-400/80 font-semibold" />
                    </span>
                  </div>

                  <div className="border-t border-white/[0.08] pt-2 flex items-center justify-between text-[10px] font-sans">
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                      ACTIVE
                    </span>
                    <button
                      type="button"
                      onClick={() => setInspectModalItem(position)}
                      className="text-slate-300 hover:text-white inline-flex items-center gap-1 transition-colors font-medium px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/10"
                    >
                      <Eye size={12} /> VIEW
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={slotIdx}
                onClick={() => {
                  if (userPositions.length === 0) {
                    navigate("/commit");
                    return;
                  }
                  const unslotted = userPositions.filter(
                    (p) => !slottedTokenIds.some((id) => id.eq(p.tokenId))
                  );
                  if (unslotted.length > 0) {
                    const sortedUnslotted = [...unslotted].sort((a, b) => {
                      if (b.weight.gt(a.weight)) return 1;
                      if (b.weight.lt(a.weight)) return -1;
                      return 0;
                    });
                    handleEquip(sortedUnslotted[0].tokenId);
                  } else {
                    navigate("/commit");
                  }
                }}
                className="p-3.5 rounded-xl bg-[#050814]/80 border border-dashed border-white/15 flex flex-col items-center justify-center text-center h-36 gap-2 text-slate-400 hover:text-slate-200 hover:border-cyan-400/40 hover:bg-[#070c1e]/90 transition-all cursor-pointer group active:scale-95"
              >
                <span className="text-[10px] font-mono font-semibold text-slate-400">SLOT #{slotIdx + 1}</span>
                <span className="w-8 h-8 rounded-full bg-white/[0.04] group-hover:bg-cyan-500/20 border border-white/10 group-hover:border-cyan-400/40 flex items-center justify-center text-slate-300 group-hover:text-cyan-300 transition-all">
                  <Plus size={14} />
                </span>
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-slate-400 group-hover:text-cyan-300 transition-colors">
                  {userPositions.length === 0
                    ? "MINT IN COMMIT"
                    : slottedTokenIds.length < userPositions.length
                    ? "EQUIP BEST"
                    : "MINT MORE"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-Way Step Navigation: Previous Step (Commit) to Left, Next Step (Vault) to Right */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#060a18]/95 border border-white/[0.08] backdrop-blur-2xl shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Option to the Left: Previous Step 2 (Commit Station) */}
        <button
          type="button"
          onClick={() => navigate("/commit")}
          className="shrink-0 py-2.5 px-4 sm:px-5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-cyan-400/40 text-white text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer order-2 md:order-1"
        >
          <ArrowLeft size={13} />
          <span>COMMIT MORE CELLS</span>
        </button>

        {/* Center Step Routing Status */}
        <div className="space-y-0.5 text-center md:text-left flex-1 px-1 md:px-4 order-1 md:order-2">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <span className="text-[11px] font-sans font-semibold text-slate-400 uppercase tracking-wider block">
              STEP 3 ROUTING
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] font-mono text-cyan-400 uppercase">
              {isHarvestReady ? "RESOURCES READY IN VAULT" : "FORMATION ACTIVE"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
            {isHarvestReady
              ? "Your equipped cells have captured rewards! Open the Vault to harvest ETH and NARA."
              : "Track accrued pulse emissions in the Vault, or return to Commit Station to join more cells."}
          </p>
        </div>

        {/* Option to the Right: Next Step 4 (Resource Vault) */}
        <button
          type="button"
          onClick={() => navigate("/vault")}
          className="shrink-0 py-2.5 px-4 sm:px-5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.15)] active:scale-95 cursor-pointer order-3"
        >
          <span>OPEN VAULT & EARNINGS</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </main>
  );
}
