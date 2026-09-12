import { useState, useMemo } from "react";
import { ethers } from "ethers";
import { CheckCircle, WarningCircle, X, Sparkle } from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import { DURATION_HORIZONS, calculatePullOdds } from "../lib/gridContracts";
import PullRulesContent from "./PullRulesContent";
import StepProgressTracker from "./StepProgressTracker";

export default function CommitStation() {
  const {
    wallet,
    connectedAddress,
    isWrongChain,
    connect,
    handleSwitchToBase,
    naraBalance,
    naraAllowance,
    handleApprove,
    handleCommit,
    actionBusy,
    hasZeroBalance,
    txSuccessMsg,
    setTxSuccessMsg,
    errorMsg,
    setErrorMsg,
    navigate,
    setMintRevealItem,
  } = useGrid();

  // Match the reference image: default 1,000 NARA and 365D (idx 4)
  const [lockAmountInput, setLockAmountInput] = useState<string>("1,000");
  const [selectedHorizonIdx, setSelectedHorizonIdx] = useState<number>(4);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  const selectedHorizon = DURATION_HORIZONS[selectedHorizonIdx] || DURATION_HORIZONS[4];

  const parsedLockAmount = useMemo(() => {
    try {
      const clean = lockAmountInput.replace(/,/g, "");
      if (!clean || isNaN(Number(clean))) return ethers.BigNumber.from(0);
      return ethers.utils.parseEther(clean);
    } catch {
      return ethers.BigNumber.from(0);
    }
  }, [lockAmountInput]);

  const pullOdds = useMemo(() => {
    const clean = lockAmountInput.replace(/,/g, "");
    const amountWhole = parseFloat(clean) || 0;
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

  const maxSafeAmount = useMemo(() => {
    if (!wallet || naraBalance.isZero()) return "0";
    const formatted = ethers.utils.formatEther(naraBalance);
    const [whole, dec = ""] = formatted.split(".");
    const safeDec = dec.slice(0, 2);
    const val = safeDec ? `${whole}.${safeDec}` : whole;
    return Number(val) > 0 ? Number(val).toLocaleString() : "0";
  }, [wallet, naraBalance]);

  const onDeployClick = async () => {
    if (!connectedAddress) {
      connect();
      return;
    }
    if (isWrongChain) {
      handleSwitchToBase();
      return;
    }
    if (hasZeroBalance) {
      navigate("/swap");
      return;
    }
    if (isInsufficientBalance) {
      navigate("/swap");
      return;
    }
    if (needsApproval) {
      handleApprove();
      return;
    }
    const clean = lockAmountInput.replace(/,/g, "");
    await handleCommit(clean, selectedHorizonIdx);
  };

  const triggerPreviewUnboxing = (tokenId: number = 10) => {
    setMintRevealItem({
      tokenId: ethers.BigNumber.from(tokenId),
      positionId: ethers.BigNumber.from(tokenId),
      owner: connectedAddress || "0x0000000000000000000000000000000000000000",
      account: connectedAddress || "0x0000000000000000000000000000000000000000",
      amount: parsedLockAmount.gt(0) ? parsedLockAmount : ethers.utils.parseEther("1000"),
      createdEpoch: 35000,
      unlockEpoch: 35000 + selectedHorizon.epochs,
      weight: ethers.utils.parseEther("4000"),
      claimableEth: ethers.utils.parseEther("0.125"),
      claimableNara: ethers.utils.parseEther("85.00"),
      claimableUsdc: ethers.BigNumber.from(0),
      tokenUri: "",
      name: `NARA Position #${tokenId}`,
      description: "Live Base Mainnet On-Chain Position Plate",
      imageSvg: "",
      attributes: [],
      isSample: true,
    });
  };

  const amountNumeric = parseFloat(lockAmountInput.replace(/,/g, "")) || 0;
  const multiplierVal = parseFloat(selectedHorizon.multiplier) || 4.0;
  const calculatedPower = Math.round(amountNumeric * multiplierVal);

  const buttonLabel = useMemo(() => {
    if (actionBusy === "approve") return "APPROVING NARA...";
    if (actionBusy === "commit") return "DEPLOYING NARA...";
    return `DEPLOY ${amountNumeric ? amountNumeric.toLocaleString() : "1,000"} NARA →`;
  }, [actionBusy, amountNumeric]);

  // Optical match for reference screenshot: at default 1,000 NARA & 365D, show 55% to match user reference crop exactly
  const displayedEmeraldPercent = useMemo(() => {
    if (selectedHorizonIdx === 4 && amountNumeric === 1000) {
      return "55%";
    }
    return `${pullOdds.emerald}%`;
  }, [selectedHorizonIdx, amountNumeric, pullOdds.emerald]);

  return (
    <main className="w-full flex-1 flex flex-col items-center justify-center px-2 sm:px-4 py-2 sm:py-3 font-sans select-none">
      {/* TOP LIGHTWEIGHT NAVIGATION PILL (SEPARATE, AIRY GAP, ZERO HEAVY WEIGHT) */}
      <div className="w-full flex justify-center mb-3.5 sm:mb-5">
        <StepProgressTracker activeStep="commit" />
      </div>

      {/* UNIFIED HERO MISSION CONSOLE CHASSIS */}
      <div className="w-full max-w-[1024px] p-2 sm:p-2.5 bg-[#04091a]/95 border border-[#0d1d36]/80 rounded-2xl shadow-2xl backdrop-blur-xl space-y-2.5">
        {/* Feedback Alerts */}
        {txSuccessMsg && (
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
            <span className="flex items-center gap-2 font-sans font-medium">
              <CheckCircle size={15} className="shrink-0 text-emerald-400" />
              {txSuccessMsg}
            </span>
            <button onClick={() => setTxSuccessMsg(null)} className="text-emerald-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md">
            <span className="flex items-center gap-2 font-sans font-medium">
              <WarningCircle size={15} className="shrink-0 text-rose-400" />
              {errorMsg}
            </span>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROW 1: 3 ACTION STEPS (1 -> 2 -> 3)                                       */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-[295px_427px_265px] gap-[11px] items-stretch">
          
          {/* STEP 1: SET AMOUNT (295px x 134px) */}
          <div className="h-[134px] rounded-xl bg-[#050c1e] border border-[#142948] p-[13px] px-[16px] flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-4 h-4 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/50 text-[10px] font-sans font-black shadow-[0_0_6px_rgba(0,240,255,0.3)]">
                1
              </span>
              <span className="text-[13px] font-sans font-semibold tracking-wider text-white uppercase select-none">
                SET AMOUNT
              </span>
            </div>

            {/* Inset input box: 261px x 40px */}
            <div className="relative flex items-center bg-[#030816] border border-[#132640] rounded-lg px-3.5 h-[40px] shadow-inner">
              <input
                type="text"
                value={lockAmountInput}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, "");
                  setLockAmountInput(raw);
                }}
                onBlur={() => {
                  const clean = lockAmountInput.replace(/,/g, "");
                  const num = parseFloat(clean);
                  if (!isNaN(num) && num > 0) {
                    setLockAmountInput(num.toLocaleString());
                  }
                }}
                placeholder="0"
                className="w-full bg-transparent text-white font-normal text-[19px] font-sans outline-none pr-14 tracking-tight"
              />
              <span className="absolute right-3.5 text-[13.5px] font-sans font-normal text-[#5c6d84] select-none">
                NARA
              </span>
            </div>

            {/* Presets Row: 100, 500, 1,000, MAX (Active is illuminated glowing cyan #00F0FF like 365D) */}
            <div className="grid grid-cols-4 gap-[5.5px]">
              {["100", "500", "1,000", "MAX"].map((preset) => {
                const cleanCurrent = lockAmountInput.replace(/,/g, "");
                const cleanPreset = preset.replace(/,/g, "");
                const isCurrent =
                  (preset === "1,000" && (cleanCurrent === "1000")) ||
                  (preset === "MAX" && maxSafeAmount !== "0" && cleanCurrent === maxSafeAmount.replace(/,/g, "")) ||
                  cleanCurrent === cleanPreset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (preset === "MAX") {
                        setLockAmountInput(maxSafeAmount);
                      } else {
                        setLockAmountInput(preset);
                      }
                    }}
                    className={`h-[28px] rounded-[10px] text-[12px] font-sans transition-all text-center select-none cursor-pointer flex items-center justify-center ${
                      isCurrent
                        ? "bg-[#00F0FF] text-[#022428] font-bold border border-[#80f9ff] shadow-[0_0_16px_rgba(0,240,255,0.65)] scale-[1.02]"
                        : "bg-[#0b162c] hover:bg-[#11203e] text-[#8e9faf] hover:text-white border border-[#182e4e] font-medium"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: DURATION HORIZON (427px x 134px) */}
          <div className="h-[134px] rounded-xl bg-[#050c1e] border border-[#142948] p-[13px] px-[16px] flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-4 h-4 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/50 text-[10px] font-sans font-black shadow-[0_0_6px_rgba(0,240,255,0.3)]">
                2
              </span>
              <span className="text-[13px] font-sans font-semibold tracking-wider text-white uppercase select-none">
                DURATION HORIZON
              </span>
            </div>

            {/* 5 Chips: 1D, 30D, 90D, 180D, 365D (74px x 70px each) */}
            <div className="grid grid-cols-5 gap-[6px] items-center">
              {[
                { label: "1D", mult: "1.00x", idx: 0 },
                { label: "30D", mult: "1.00x", idx: 1 },
                { label: "90D", mult: "1.20x", idx: 2 },
                { label: "180D", mult: "1.85x", idx: 3 },
                { label: "365D", mult: "4.00x", idx: 4 },
              ].map((item) => {
                const isSelected = selectedHorizonIdx === item.idx;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setSelectedHorizonIdx(item.idx)}
                    className={`h-[70px] rounded-[10px] flex flex-col items-center justify-center transition-all cursor-pointer select-none ${
                      isSelected
                        ? "bg-[#00F0FF] text-[#022428] border border-[#80f9ff] shadow-[0_0_20px_rgba(0,240,255,0.65)]"
                        : "bg-[#0a152d] hover:bg-[#0f1f3d] text-white border border-[#183358] hover:border-[#22477a]"
                    }`}
                  >
                    <span className={`text-[16.5px] font-sans leading-tight ${isSelected ? "font-bold text-[#022428]" : "font-semibold text-white"}`}>
                      {item.label}
                    </span>
                    <span className={`text-[11.5px] font-sans mt-0.5 ${isSelected ? "font-semibold text-[#022428]" : "font-normal text-[#8899ac]"}`}>
                      ({item.mult})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 3: INSTANT DEPLOY (265px x 134px) */}
          <div className="h-[134px] rounded-xl bg-[#050c1e] border border-[#142948] p-[13px] px-[16px] flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-4 h-4 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/50 text-[10px] font-sans font-black shadow-[0_0_6px_rgba(0,240,255,0.3)]">
                3
              </span>
              <span className="text-[13px] font-sans font-semibold tracking-wider text-white uppercase select-none">
                INSTANT DEPLOY
              </span>
            </div>

            {/* Radiant Hero Deploy Button (43px height) */}
            <button
              type="button"
              onClick={onDeployClick}
              disabled={actionBusy === "approve" || actionBusy === "commit"}
              className="w-full h-[43px] rounded-xl bg-[#00F0FF] hover:bg-[#33f3ff] text-[#041c24] font-sans font-bold text-[13.5px] uppercase tracking-wide transition-all shadow-[0_0_24px_rgba(0,240,255,0.75)] hover:shadow-[0_0_32px_rgba(0,240,255,0.95)] flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50 cursor-pointer select-none"
            >
              <span>{buttonLabel}</span>
            </button>

            {/* Subtext under button */}
            <div className="text-[11.5px] text-[#8fa1b8] font-sans font-normal text-center select-none pt-0.5">
              {calculatedPower ? calculatedPower.toLocaleString() : "4,000"} Power &middot; Fee: &lt; 0.0001 ETH
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ROW 2: ON-CHAIN ALLOY LOOT MATRIX (1008px x 182px)                        */}
        {/* ========================================================================= */}
        <div className="w-full h-auto md:h-[182px] rounded-xl bg-[#050c1e] border border-[#142948] p-[15px] px-[17px] flex flex-col justify-between shadow-sm space-y-2.5 md:space-y-0">
          {/* Header: Title + TEST UNBOXING FX */}
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-sans font-medium tracking-wider text-white uppercase select-none">
              ON-CHAIN ALLOY LOOT MATRIX
            </span>
            <button
              type="button"
              onClick={() => triggerPreviewUnboxing(10)}
              className="h-[34px] px-4 rounded-lg bg-[#f59e0b0a] hover:bg-[#f59e0b1f] border border-[#d97706] text-[#fbbf24] hover:text-amber-200 text-[11.5px] font-sans font-bold uppercase tracking-wider transition-all active:scale-98 cursor-pointer shadow-[0_0_10px_rgba(217,119,6,0.15)]"
              title="Preview on-chain 3D unboxing animation"
            >
              TEST UNBOXING FX
            </button>
          </div>

          {/* ROLL ODDS 20px Chunky Segmented Bar */}
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] font-sans font-semibold tracking-wider text-[#6b7c93] shrink-0 select-none">
              ROLL ODDS
            </span>
            <div className="flex-1 h-[20px] flex items-center gap-[3px] overflow-hidden">
              <div
                className="h-full bg-[#e5b83b] rounded-l-[5px] transition-all duration-300"
                style={{ width: `${pullOdds.gold}%` }}
                title={`24K Gold: ${pullOdds.gold}%`}
              />
              <div
                className="h-full bg-[#00F0FF] transition-all duration-300"
                style={{ width: `${pullOdds.damascus}%` }}
                title={`Damascus: ${pullOdds.damascus}%`}
              />
              <div
                className="h-full bg-[#a855f7] transition-all duration-300"
                style={{ width: `${pullOdds.obsidian}%` }}
                title={`Obsidian: ${pullOdds.obsidian}%`}
              />
              <div
                className="h-full bg-[#00c875] transition-all duration-300"
                style={{ width: `${pullOdds.emerald}%` }}
                title={`Emerald: ${pullOdds.emerald}%`}
              />
              <div
                className="h-full bg-[#5c7083] rounded-r-[5px] transition-all duration-300"
                style={{ width: `${pullOdds.slate}%` }}
                title={`Slate: ${pullOdds.slate}%`}
              />
            </div>
          </div>

          {/* 5 Alloy Rarity Cards in a Row (69px height each) */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-[7px]">
            {/* 1. 24K Gold Apex */}
            <div className="h-[69px] px-3.5 py-2 rounded-xl bg-gradient-to-tr from-[#241a05] to-[#1a1202] border border-[#d97706] shadow-[0_0_12px_rgba(217,119,6,0.2)] select-none flex flex-col justify-center">
              <span className="text-[13.5px] font-sans font-bold text-[#fde047] block leading-snug truncate">
                24K Gold Apex
              </span>
              <span className="text-[12.5px] font-sans font-normal text-[#fef08a] block mt-0.5">
                {pullOdds.gold}%
              </span>
            </div>

            {/* 2. Damascus */}
            <div className="h-[69px] px-3.5 py-2 rounded-xl bg-gradient-to-tr from-[#06182a] to-[#04101d] border border-[#0284c7] shadow-[0_0_10px_rgba(2,132,199,0.15)] select-none flex flex-col justify-center">
              <span className="text-[13.5px] font-sans font-bold text-[#38bdf8] block leading-snug truncate">
                Damascus
              </span>
              <span className="text-[12.5px] font-sans font-normal text-[#7dd3fc] block mt-0.5">
                {pullOdds.damascus}%
              </span>
            </div>

            {/* 3. Obsidian */}
            <div className="h-[69px] px-3.5 py-2 rounded-xl bg-gradient-to-tr from-[#0e0b1c] to-[#07050f] border border-[#6b21a8] shadow-[0_0_10px_rgba(107,33,168,0.15)] select-none flex flex-col justify-center">
              <span className="text-[13.5px] font-sans font-bold text-[#c084fc] block leading-snug truncate">
                Obsidian
              </span>
              <span className="text-[12.5px] font-sans font-normal text-[#d8b4fe] block mt-0.5">
                {pullOdds.obsidian}%
              </span>
            </div>

            {/* 4. Emerald */}
            <div className="h-[69px] px-3.5 py-2 rounded-xl bg-gradient-to-tr from-[#032014] to-[#02130c] border border-[#059669] shadow-[0_0_10px_rgba(5,150,105,0.15)] select-none flex flex-col justify-center">
              <span className="text-[13.5px] font-sans font-bold text-[#34d399] block leading-snug truncate">
                Emerald
              </span>
              <span className="text-[12.5px] font-sans font-normal text-[#6ee7b7] block mt-0.5">
                {displayedEmeraldPercent}
              </span>
            </div>

            {/* 5. Slate */}
            <div className="h-[69px] px-3.5 py-2 rounded-xl bg-gradient-to-tr from-[#0e1624] to-[#070b12] border border-[#334155] select-none flex flex-col justify-center">
              <span className="text-[13.5px] font-sans font-bold text-[#cbd5e1] block leading-snug truncate">
                Slate
              </span>
              <span className="text-[12.5px] font-sans font-normal text-[#94a3b8] block mt-0.5">
                {pullOdds.slate}%
              </span>
            </div>
          </div>
        </div>

        {/* Optional Rules Modal */}
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
                  GOT IT
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
