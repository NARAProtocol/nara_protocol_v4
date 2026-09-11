import { useState, useMemo, useEffect } from "react";
import { ethers } from "ethers";
import { Lightning, CheckCircle, WarningCircle, X, ArrowLeft, ArrowRight, Sparkle, Info } from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import TacticalNumber from "./TacticalNumber";
import StepProgressTracker from "./StepProgressTracker";
import { DURATION_HORIZONS, calculatePullOdds } from "../lib/gridContracts";
import PullRulesContent from "./PullRulesContent";

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

export default function CommitStation() {
  const {
    wallet,
    connectedAddress,
    isWrongChain,
    connect,
    handleSwitchToBase,
    naraBalance,
    naraAllowance,
    lockFeeWei,
    handleApprove,
    handleCommit,
    actionBusy,
    hasZeroBalance,
    userPositions,
    txSuccessMsg,
    setTxSuccessMsg,
    errorMsg,
    setErrorMsg,
    navigate,
  } = useGrid();

  const [lockAmountInput, setLockAmountInput] = useState<string>("100");
  const [selectedHorizonIdx, setSelectedHorizonIdx] = useState<number>(0);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  const selectedHorizon = DURATION_HORIZONS[selectedHorizonIdx];
  const parsedLockAmount = useMemo(() => {
    try {
      if (!lockAmountInput || isNaN(Number(lockAmountInput))) return ethers.BigNumber.from(0);
      return ethers.utils.parseEther(lockAmountInput);
    } catch {
      return ethers.BigNumber.from(0);
    }
  }, [lockAmountInput]);

  const pullOdds = useMemo(() => {
    const amountWhole = parseFloat(lockAmountInput) || 0;
    return calculatePullOdds(selectedHorizon.epochs, amountWhole);
  }, [selectedHorizon, lockAmountInput]);

  const needsApproval = useMemo(() => {
    if (!wallet || hasZeroBalance) return false;
    return naraAllowance.lt(parsedLockAmount);
  }, [wallet, hasZeroBalance, naraAllowance, parsedLockAmount]);

  const isInsufficientBalance = useMemo(() => {
    if (!wallet || hasZeroBalance) return false;
    return parsedLockAmount.gt(naraBalance);
  }, [wallet, hasZeroBalance, parsedLockAmount, naraBalance]);

  // Lazy UX: If user holds less than the 100 NARA default, prefill with available balance
  useEffect(() => {
    if (wallet && !naraBalance.isZero() && naraBalance.lt(ethers.utils.parseEther("100")) && lockAmountInput === "100") {
      const formatted = ethers.utils.formatEther(naraBalance);
      const [whole, dec = ""] = formatted.split(".");
      const safeDec = dec.slice(0, 2);
      const val = safeDec ? `${whole}.${safeDec}` : whole;
      if (Number(val) > 0) setLockAmountInput(val);
    }
  }, [wallet, naraBalance, lockAmountInput]);

  const onCommitClick = async () => {
    await handleCommit(lockAmountInput, selectedHorizonIdx);
  };

  return (
    <main className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-8 font-sans pb-12">
      {/* 4-Step Visual Progress Stepper */}
      <StepProgressTracker activeStep="commit" />

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

      {/* Primary Station Chassis */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#060a18]/95 border-t border-cyan-500/30 border-x border-b border-white/10 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.7)] ring-1 ring-white/5 space-y-6">
        {/* Header Title & Concept Tag */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[11px] font-sans font-semibold tracking-wider uppercase shadow-[0_0_12px_rgba(0,240,255,0.15)]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>STEP 2 · COMMIT CELL ALLOCATION</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase flex items-center gap-2.5 font-display">
              <Lightning size={20} className="text-cyan-400" />
              <span>JOIN THE SOVEREIGN GRID</span>
            </h1>
          </div>
          <span className="text-[11px] font-bold text-cyan-300 bg-cyan-950/40 px-3 py-1.5 rounded-lg border border-cyan-500/30 self-start sm:self-auto uppercase tracking-wider font-mono shadow-sm">
            1 NARA = 1 ACTIVE CELL
          </span>
        </div>

        {/* Balance & Acquisition Link */}
        <div className="flex items-center justify-between text-xs font-sans text-slate-300">
          <span className="font-semibold text-slate-400 uppercase tracking-wider">AVAILABLE IN WALLET:</span>
          <div className="flex items-center gap-2">
            <span className="font-black text-cyan-300 font-mono text-sm sm:text-base drop-shadow-[0_0_8px_rgba(0,240,255,0.45)]">
              {wallet ? (
                <TacticalNumber
                  value={naraBalance}
                  symbol="NARA"
                  noUnderline
                  symbolClassName="text-xs text-cyan-400/80 font-semibold"
                />
              ) : (
                "CONNECT WALLET"
              )}
            </span>
            {hasZeroBalance && (
              <button
                type="button"
                onClick={() => navigate("/swap")}
                className="text-[11px] text-cyan-300 hover:text-cyan-200 hover:underline flex items-center gap-1 ml-1 font-semibold"
              >
                <span>Get via Swap</span>
                <ArrowRight size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Amount Input with Lazy Presets */}
        <div className="space-y-2.5">
          <label className="text-xs font-sans font-semibold text-slate-300 block uppercase tracking-wider">
            NARA Amount to Commit:
          </label>
          <div className="relative flex items-center">
            <input
              type="number"
              min="0"
              step="any"
              value={lockAmountInput}
              onChange={(e) => setLockAmountInput(e.target.value)}
              placeholder="0.0"
              className="w-full bg-[#03060e] border border-white/[0.12] focus:border-cyan-400 rounded-xl px-4 py-3.5 text-white text-base font-bold outline-none tracking-wider font-mono pr-20 transition-all shadow-inner"
            />
            <span className="absolute right-4 text-xs font-bold text-slate-400 font-mono">NARA</span>
          </div>

          {/* Quick 1-Tap Preset Buttons */}
          <div className="grid grid-cols-4 gap-2">
            {["100", "500", "1000", "MAX"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  if (preset === "MAX") {
                    const formatted = ethers.utils.formatEther(naraBalance || 0);
                    const [whole, dec = ""] = formatted.split(".");
                    const safeDec = dec.slice(0, 4);
                    const safeMax = safeDec ? `${whole}.${safeDec}` : whole;
                    setLockAmountInput(Number(safeMax) > 0 ? safeMax : "0");
                  } else {
                    setLockAmountInput(preset);
                  }
                }}
                className="px-2.5 py-2 rounded-xl bg-[#080d1e] hover:bg-[#0c142c] text-slate-200 hover:text-white border border-white/10 hover:border-cyan-400/40 text-xs font-sans font-bold transition-all text-center active:scale-95 shadow-sm"
              >
                {preset === "MAX" ? "MAX" : preset}
              </button>
            ))}
          </div>
        </div>

        {/* DURATION HORIZON PICKER (5 Presets) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-sans text-slate-300">
            <span className="flex items-center gap-1.5 font-semibold text-slate-400 uppercase tracking-wider">
              DURATION HORIZON
              <InfoCircle text={`Equal controls — each horizon is a valid path. Longer horizons raise participation weight (1 Day ${DURATION_HORIZONS[0].multiplier} → 365 Days ${DURATION_HORIZONS[4].multiplier}) for VARIABLE NETWORK FLOW each 15-minute pulse.`} />
            </span>
            <span className="text-cyan-300 font-black font-mono text-sm drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]">
              {selectedHorizon.label}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {DURATION_HORIZONS.map((horizon, idx) => {
              const isSelected = idx === selectedHorizonIdx;
              return (
                <button
                  key={horizon.label}
                  type="button"
                  onClick={() => setSelectedHorizonIdx(idx)}
                  className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 text-center transition-all border ${
                    isSelected
                      ? "bg-cyan-950/60 border-cyan-400 text-white shadow-[0_0_20px_rgba(0,240,255,0.25)] ring-1 ring-cyan-400/40"
                      : "bg-[#080d1e] border-white/10 text-slate-300 hover:text-white hover:border-white/20"
                  }`}
                >
                  <span className="text-[11px] font-sans font-bold uppercase">{horizon.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CHASSIS ALLOY PULL ODDS MATRIX */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#040715]/95 border border-white/10 space-y-3.5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-2">
              <Sparkle size={16} weight="fill" className="text-cyan-400" />
              <span className="text-xs font-sans font-bold text-white uppercase tracking-wider">
                CHASSIS ALLOY PULL ODDS MATRIX
              </span>
              <button
                type="button"
                onClick={() => setShowRulesModal(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-300 hover:text-white text-[10px] font-sans font-bold tracking-wider uppercase transition-colors"
                title="View Drop Rules & Probability Mechanics"
              >
                <span>RULES</span>
              </button>
              <InfoCircle text="On-chain luck mechanics: longer horizons raise luck up to +350, shifting alloy rolls. Committing ≥ 5,000 NARA enables additional alloy-threshold bonuses. Participation weight multipliers (up to 4.00X) are disclosed here — horizons above are equal controls." />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                  pullOdds.luckBonus === 350
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-[0_0_12px_rgba(0,240,255,0.3)]"
                    : "bg-white/5 text-slate-300 border-white/10"
                }`}
              >
                LUCK: +{pullOdds.luckBonus} {pullOdds.luckBonus === 350 ? "MAX" : ""}
              </span>

              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                  pullOdds.isWhale
                    ? "bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                    : "bg-white/5 text-slate-400 border-white/10"
                }`}
              >
                {pullOdds.isWhale ? "LARGE COMMITMENT THRESHOLD ACTIVE" : "≥ 5,000 NARA FOR THRESHOLD BONUS"}
              </span>
            </div>
          </div>

          {/* Segmented Odds Distribution Bar */}
          <div className="space-y-1.5">
            <div className="w-full h-2.5 rounded-full bg-slate-900/80 overflow-hidden flex border border-white/10 p-[1px]">
              {pullOdds.gold > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-amber-300 to-amber-500 rounded-l transition-all duration-300 shadow-[0_0_12px_#f59e0b]"
                  style={{ width: `${pullOdds.gold}%` }}
                  title={`24K Gold: ${pullOdds.gold}%`}
                />
              )}
              {pullOdds.damascus > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 shadow-[0_0_8px_#00f0ff]"
                  style={{ width: `${pullOdds.damascus}%` }}
                  title={`Damascus: ${pullOdds.damascus}%`}
                />
              )}
              {pullOdds.obsidian > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-600 transition-all duration-300 shadow-[0_0_8px_#c084fc]"
                  style={{ width: `${pullOdds.obsidian}%` }}
                  title={`Obsidian Void: ${pullOdds.obsidian}%`}
                />
              )}
              {pullOdds.emerald > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-300 shadow-[0_0_8px_#10b981]"
                  style={{ width: `${pullOdds.emerald}%` }}
                  title={`Emerald: ${pullOdds.emerald}%`}
                />
              )}
              {pullOdds.slate > 0 && (
                <div
                  className="h-full bg-slate-600 rounded-r transition-all duration-300"
                  style={{ width: `${pullOdds.slate}%` }}
                  title={`Titanium Slate: ${pullOdds.slate}%`}
                />
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>ROLL PROBABILITY</span>
              <span className="text-amber-300 font-bold">
                TOP TIERS COMBINED: {(pullOdds.gold + pullOdds.damascus).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* 5 Alloy Tier Badges & Probability Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {/* 24K Gold - Tier 1 Apex Grail */}
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              title="Click to view full Tier 1 24K Gilded Gold Apex specs & perks"
              className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer group ${
                pullOdds.gold > 3
                  ? "bg-amber-950/60 border-amber-400/70 shadow-[0_0_20px_rgba(245,158,11,0.35)]"
                  : "bg-[#03060e] border-amber-400/40 hover:border-amber-400/70 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
              }`}
            >
              <div className="w-full flex items-center justify-between">
                <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-300 border border-amber-400/50 uppercase">
                  T1 · 👑 #1 APEX
                </span>
                <span className="text-xs">👑</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-sans font-bold text-amber-300 uppercase block tracking-wider group-hover:text-white transition-colors">
                  24K GOLD
                </span>
                <span className="text-xs sm:text-sm font-black font-mono text-amber-200 drop-shadow-[0_0_8px_rgba(245,158,11,0.7)] block">
                  {pullOdds.gold}%
                </span>
              </div>
              <span className="text-[8.5px] font-mono text-amber-400 uppercase font-semibold">
                APEX GRAIL
              </span>
            </button>

            {/* Damascus - Tier 2 Legendary */}
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              title="Click to view full Tier 2 Damascus specs & perks"
              className="p-2.5 rounded-xl bg-[#03060e] border border-cyan-400/30 hover:border-cyan-400/60 flex flex-col items-center justify-between text-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer group"
            >
              <div className="w-full flex items-center justify-between">
                <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 uppercase">
                  T2 · #2 TIER
                </span>
                <span className="text-xs">🌌</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-sans font-bold text-cyan-300 uppercase block tracking-wider group-hover:text-white transition-colors">
                  DAMASCUS
                </span>
                <span className="text-xs sm:text-sm font-black font-mono text-cyan-200 block">
                  {pullOdds.damascus}%
                </span>
              </div>
              <span className="text-[8.5px] font-mono text-cyan-400 uppercase font-semibold">
                LEGENDARY
              </span>
            </button>

            {/* Obsidian Void - Tier 3 Rare */}
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              title="Click to view full Tier 3 Obsidian Void specs & perks"
              className="p-2.5 rounded-xl bg-[#03060e] border border-purple-400/30 hover:border-purple-400/60 flex flex-col items-center justify-between text-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer group"
            >
              <div className="w-full flex items-center justify-between">
                <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
                  T3 · #3 TIER
                </span>
                <span className="text-xs">🔮</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-sans font-bold text-purple-300 uppercase block tracking-wider group-hover:text-white transition-colors">
                  OBSIDIAN VOID
                </span>
                <span className="text-xs sm:text-sm font-black font-mono text-purple-200 block">
                  {pullOdds.obsidian}%
                </span>
              </div>
              <span className="text-[8.5px] font-mono text-purple-400 uppercase font-semibold">
                RARE
              </span>
            </button>

            {/* Emerald - Tier 4 Uncommon */}
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              title="Click to view full Tier 4 Cybernetic Emerald specs & perks"
              className="p-2.5 rounded-xl bg-[#03060e] border border-emerald-500/30 hover:border-emerald-500/60 flex flex-col items-center justify-between text-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer group"
            >
              <div className="w-full flex items-center justify-between">
                <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                  T4 · #4 TIER
                </span>
                <span className="text-xs">🟢</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-sans font-bold text-emerald-300 uppercase block tracking-wider group-hover:text-white transition-colors">
                  EMERALD
                </span>
                <span className="text-xs sm:text-sm font-black font-mono text-emerald-200 block">
                  {pullOdds.emerald}%
                </span>
              </div>
              <span className="text-[8.5px] font-mono text-emerald-400 uppercase font-semibold">
                UNCOMMON
              </span>
            </button>

            {/* Slate - Tier 5 Common */}
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              title="Click to view full Tier 5 Titanium Slate specs & perks"
              className="p-2.5 rounded-xl bg-[#03060e] border border-white/10 hover:border-white/25 flex flex-col items-center justify-between text-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer group col-span-2 sm:col-span-1"
            >
              <div className="w-full flex items-center justify-between">
                <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded bg-white/10 text-slate-300 border border-white/15 uppercase">
                  T5 · BASELINE
                </span>
                <span className="text-xs">🪙</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] font-sans font-bold text-slate-300 uppercase block tracking-wider group-hover:text-white transition-colors">
                  SLATE
                </span>
                <span className="text-xs sm:text-sm font-black font-mono text-slate-200 block">
                  {pullOdds.slate}%
                </span>
              </div>
              <span className="text-[8.5px] font-mono text-slate-400 uppercase font-semibold">
                COMMON
              </span>
            </button>
          </div>

          {/* Explicit Good vs Bad Alloy Explainer Strip */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs font-sans">
            <div className="flex items-start gap-2">
              <Info size={15} className="text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider block">
                  CHASSIS ALLOY: HARDWARE PLATE & COLLECTOR TIER
                </span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-amber-300">Tier 1 · 24K Gilded Gold</strong> is the rarest on-chain plate (1.0% baseline, up to 6.5% max). <strong className="text-cyan-300">Tier 2 Damascus</strong> is Legendary. <strong className="text-purple-300">Tier 3 Obsidian Void</strong> is Rare. Duration horizon sets participation weight (see (i) — currently {selectedHorizon.multiplier}).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              className="shrink-0 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 uppercase tracking-wider underline flex items-center gap-1 self-end sm:self-center"
            >
              <span>EXPLORE ALLOY PERKS</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Commitment Breakdown Wells */}
        <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-[#040814] via-[#02050b] to-[#040814] border border-cyan-500/25 space-y-3.5 text-xs font-sans shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">ACTIVE CELLS GENERATED:</span>
            <span className="text-white font-bold font-mono text-sm sm:text-base">
              <TacticalNumber value={parsedLockAmount} symbol="CELLS" />
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,240,255,0.12)]">
            <span className="text-cyan-200 font-bold tracking-wide uppercase text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f0ff]" />
              EFFECTIVE PARTICIPATION WEIGHT:
            </span>
            <span className="text-cyan-300 font-black font-mono text-lg sm:text-xl tracking-tight drop-shadow-[0_0_14px_rgba(0,240,255,0.75)]">
              <TacticalNumber
                value={parsedLockAmount
                  .mul(Math.round(parseFloat(selectedHorizon.multiplier) * 100))
                  .div(100)}
                symbol="WEIGHT"
                noUnderline
                symbolClassName="text-xs text-cyan-400/80 font-semibold"
              />
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-white/[0.06] pt-2.5 font-medium">
            <span className="flex items-center gap-1.5">
              <span>ANTI-SPAM NETWORK FEE:</span>
              <InfoCircle text="Flat on-chain anti-spam fee (0.000001 ETH / ~$0.0025) enforced by NARAEngine.sol. Stored in contract and withdrawn only to Treasury Safe to fund keepers." />
            </span>
            <span className="font-mono text-cyan-300 font-semibold">
              <TacticalNumber value={lockFeeWei} symbol="ETH" decimals={6} />
            </span>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="pt-2">
          {!connectedAddress ? (
            <button
              type="button"
              onClick={() => connect()}
              className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold tracking-wider font-sans"
            >
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>
              CONNECT WALLET TO COMMIT
            </button>
          ) : isWrongChain ? (
            <button
              type="button"
              onClick={handleSwitchToBase}
              className="btn-ticks w-full !py-4 text-xs sm:text-sm font-bold text-amber-300 border-amber-500/40 font-sans"
            >
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>
              SWITCH NETWORK TO BASE
            </button>
          ) : hasZeroBalance ? (
            <button
              type="button"
              onClick={() => navigate("/swap")}
              className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold text-cyan-300 font-sans"
            >
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>
              ACQUIRE $NARA ON SWAP FIRST
            </button>
          ) : isInsufficientBalance ? (
            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
              <button
                type="button"
                disabled
                className="btn-ticks w-full !py-4 text-xs sm:text-sm font-bold text-rose-300 opacity-70 cursor-not-allowed border-rose-500/40 font-sans flex-1"
              >
                <span className="corner tl"></span>
                <span className="corner tr"></span>
                <span className="corner bl"></span>
                <span className="corner br"></span>
                INSUFFICIENT $NARA ({parseFloat(ethers.utils.formatEther(naraBalance)).toFixed(2)} AVAILABLE)
              </button>
              <button
                type="button"
                onClick={() => navigate("/swap")}
                className="inline-flex items-center justify-center gap-1.5 px-6 py-3.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-sans font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.35)] shrink-0 active:scale-95"
              >
                <span>SWAP MORE</span>
                <ArrowRight size={13} weight="bold" />
              </button>
            </div>
          ) : needsApproval ? (
            <button
              type="button"
              onClick={handleApprove}
              disabled={actionBusy === "approve"}
              className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold text-cyan-300 font-sans"
            >
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>
              {actionBusy === "approve" ? "APPROVING..." : "STEP 1: APPROVE NARA"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onCommitClick}
              disabled={actionBusy === "commit"}
              className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold text-cyan-200 tracking-wider shadow-[0_0_25px_rgba(0,240,255,0.3)] hover:shadow-[0_0_35px_rgba(0,240,255,0.5)] font-sans"
            >
              <span className="corner tl"></span>
              <span className="corner tr"></span>
              <span className="corner bl"></span>
              <span className="corner br"></span>
              {actionBusy === "commit" ? "COMMITTING & MINTING..." : "STEP 2: COMMIT & JOIN THE GRID"}
            </button>
          )}
        </div>
      </div>

      {/* 2-Way Step Navigation: Previous Step (Swap) to Left, Next Step (Fleet Deck) to Right */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#060a18]/95 border border-white/[0.08] backdrop-blur-2xl shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-sans">
        {/* Option to the Left: Previous Step 1 (Swap Station) */}
        <button
          type="button"
          onClick={() => navigate("/swap")}
          className="shrink-0 py-2.5 px-4 sm:px-5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-cyan-400/40 text-white text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer order-2 md:order-1"
        >
          <ArrowLeft size={13} />
          <span>SWAP FOR NARA</span>
        </button>

        {/* Center Step Routing Status */}
        <div className="space-y-0.5 text-center md:text-left flex-1 px-1 md:px-4 order-1 md:order-2">
          <div className="flex items-center justify-center md:justify-start gap-2">
            <span className="text-[11px] font-sans font-semibold text-slate-400 uppercase tracking-wider block">
              STEP 2 ROUTING
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] font-mono text-cyan-400 uppercase">
              {userPositions.length > 0 ? "POSITIONS READY" : "JOIN THE GRID"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed">
            {userPositions.length > 0
              ? `You hold ${userPositions.length} active cell Position NFT${userPositions.length > 1 ? "s" : ""}. Equip them in the Fleet Deck, or swap for more NARA.`
              : "Acquire NARA tokens via Swap to commit cells, or inspect the Fleet Deck formation to prepare your layout."}
          </p>
        </div>

        {/* Option to the Right: Next Step 3 (Fleet Deck & Cells) */}
        <button
          type="button"
          onClick={() => navigate("/grid")}
          className="shrink-0 py-2.5 px-4 sm:px-5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-sans font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.15)] active:scale-95 cursor-pointer order-3"
        >
          <span>{userPositions.length > 0 ? "EQUIP IN FLEET DECK" : "FLEET DECK & CELLS"}</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* PULL RULES & PROBABILITIES MODAL */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#060a18]/98 border border-cyan-500/30 p-6 sm:p-7 space-y-5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] max-h-[90vh] overflow-y-auto font-sans ring-1 ring-cyan-500/20">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Sparkle size={16} weight="fill" className="text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                  CHASSIS ALLOY PULL RULES & PROBABILITIES
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close rules modal"
              >
                <X size={18} />
              </button>
            </div>

            <PullRulesContent />

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="px-5 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-xs font-bold text-cyan-200 transition-all active:scale-95"
              >
                GOT IT, LET'S ROLL
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
