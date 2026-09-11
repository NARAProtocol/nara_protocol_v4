import NaraSwapWidget from "./NaraSwapWidget";
import StepProgressTracker from "./StepProgressTracker";
import { useGrid } from "../context/GridContext";
import { ArrowRight } from "@phosphor-icons/react";
import TacticalNumber from "./TacticalNumber";

export default function NaraSwap() {
  const { naraBalance, navigate } = useGrid();

  return (
    <main className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 flex flex-col justify-start items-center gap-6 pb-44 sm:pb-52 md:pb-60">
      {/* 4-Step Progress Stepper */}
      <StepProgressTracker activeStep="swap" />

      {/* Gentle ambient backlight to ground the chassis softly in 3D depth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] bg-blue-600/[0.06] blur-[140px] rounded-full pointer-events-none -z-10" />
      
      <NaraSwapWidget />

      {/* Lazy Control / Next Step Banner: If user already holds NARA, prompt them to proceed to Step 2: Commit */}
      {!naraBalance.isZero() && (
        <div className="w-full max-w-[480px] p-3.5 rounded-2xl bg-[#060a18]/95 border border-cyan-500/30 backdrop-blur-2xl flex items-center justify-between gap-3 text-xs font-sans shadow-2xl ring-1 ring-white/5 animate-fade-in">
          <div className="space-y-0.5">
            <span className="text-[11px] font-sans font-semibold text-slate-400 uppercase tracking-wider block">WALLET BALANCE READY</span>
            <span className="text-cyan-300 font-black font-mono text-base drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              <TacticalNumber value={naraBalance} symbol="NARA" noUnderline symbolClassName="text-xs text-cyan-400/80 font-semibold" />
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/commit")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-sans font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.35)] shrink-0 active:scale-95"
          >
            <span>COMMIT NARA</span>
            <ArrowRight size={13} weight="bold" />
          </button>
        </div>
      )}
    </main>
  );
}
