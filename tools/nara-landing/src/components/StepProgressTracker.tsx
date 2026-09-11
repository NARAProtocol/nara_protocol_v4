import { Check, ArrowRight } from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";

export interface StepProgressTrackerProps {
  activeStep: "swap" | "commit" | "grid" | "vault";
}

export default function StepProgressTracker({ activeStep }: StepProgressTrackerProps) {
  const { naraBalance, userPositions, slottedTokenIds, aggregateClaimableEth, aggregateClaimableNara, navigate } = useGrid();

  const isSwapDone = naraBalance.gt(0) || userPositions.length > 0;
  const isCommitDone = userPositions.length > 0;
  const isGridDone = slottedTokenIds.length > 0;
  const isVaultReady = !aggregateClaimableEth.isZero() || !aggregateClaimableNara.isZero();

  const steps = [
    {
      id: "swap",
      path: "/swap",
      number: "1",
      label: "SWAP",
      sub: "Get $NARA",
      isDone: isSwapDone,
      isActive: activeStep === "swap",
    },
    {
      id: "commit",
      path: "/commit",
      number: "2",
      label: "COMMIT",
      sub: "Join Grid",
      isDone: isCommitDone,
      isActive: activeStep === "commit",
    },
    {
      id: "grid",
      path: "/grid",
      number: "3",
      label: "GRID",
      sub: "6 Fleet Slots",
      isDone: isGridDone,
      isActive: activeStep === "grid",
    },
    {
      id: "vault",
      path: "/vault",
      number: "4",
      label: "VAULT",
      sub: "Harvest & NFTs",
      isDone: isVaultReady,
      isActive: activeStep === "vault",
      hasNotification: isVaultReady,
    },
  ];

  return (
    <nav aria-label="GameFi Progress Flow" className="w-full max-w-4xl mx-auto px-2 py-2 font-sans">
      <div className="flex items-center justify-between gap-1 sm:gap-2 p-1.5 sm:p-2 rounded-2xl bg-[#060a18]/95 border border-white/10 backdrop-blur-2xl shadow-xl ring-1 ring-white/5">
        {steps.map((step, idx) => {
          return (
            <div key={step.id} className="flex-1 flex items-center">
              <button
                type="button"
                onClick={() => navigate(step.path)}
                className={`w-full flex items-center justify-center gap-1.5 sm:gap-2.5 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl text-left transition-all ${
                  step.isActive
                    ? "bg-[#0b1429] border border-cyan-400/40 text-white shadow-[0_0_15px_rgba(0,240,255,0.18)]"
                    : "hover:bg-white/[0.05] text-slate-300 hover:text-white border border-transparent"
                }`}
              >
                {/* Step Circle / Check */}
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0 transition-colors ${
                    step.isActive
                      ? "bg-cyan-400 text-black shadow-[0_0_8px_#00f0ff]"
                      : step.isDone
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-white/[0.04] text-slate-400 border border-white/10"
                  }`}
                >
                  {step.isDone && !step.isActive ? <Check size={11} weight="bold" /> : step.number}
                </span>

                {/* Step Labels */}
                <div className="hidden sm:flex flex-col min-w-0">
                  <span
                    className={`text-[11px] font-sans font-bold tracking-wider uppercase truncate ${
                      step.isActive ? "text-cyan-300" : "text-slate-200"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className={`text-[10px] font-sans font-medium truncate ${step.isActive ? "text-slate-300" : "text-slate-400"}`}>
                    {step.sub}
                  </span>
                </div>

                {/* Mobile Single-word Label */}
                <span className="sm:hidden text-[10px] font-sans font-bold uppercase truncate">
                  {step.label}
                </span>

                {/* Notification indicator (e.g. rewards ready) */}
                {step.hasNotification && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-auto shrink-0" />
                )}
              </button>

              {/* Connecting Divider Arrow */}
              {idx < steps.length - 1 && (
                <span className="text-white/15 px-0.5 sm:px-1 shrink-0">
                  <ArrowRight size={11} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
