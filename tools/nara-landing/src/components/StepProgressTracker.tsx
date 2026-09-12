import { CaretRight } from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";

export interface StepProgressTrackerProps {
  activeStep: "swap" | "commit" | "grid" | "vault";
  className?: string;
}

export default function StepProgressTracker({ activeStep, className = "" }: StepProgressTrackerProps) {
  const { naraBalance, userPositions, slottedTokenIds, aggregateClaimableEth, aggregateClaimableNara, navigate } = useGrid();

  const isSwapDone = naraBalance.gt(0) || userPositions.length > 0;
  const isCommitDone = userPositions.length > 0;
  const isGridDone = slottedTokenIds.length > 0;
  const isVaultReady = !aggregateClaimableEth.isZero() || !aggregateClaimableNara.isZero();

  const steps = [
    {
      num: 1,
      id: "swap",
      path: "/swap",
      title: "Swap",
      sub: "Get NARA",
      isDone: isSwapDone,
      isActive: activeStep === "swap",
    },
    {
      num: 2,
      id: "commit",
      path: "/commit",
      title: "Commit",
      sub: "Choose duration",
      isDone: isCommitDone,
      isActive: activeStep === "commit",
    },
    {
      num: 3,
      id: "grid",
      path: "/grid",
      title: "Grid",
      sub: "Generate cells",
      isDone: isGridDone,
      isActive: activeStep === "grid",
    },
    {
      num: 4,
      id: "vault",
      path: "/vault",
      title: "Vault",
      sub: "Manage & grow",
      isDone: isVaultReady,
      isActive: activeStep === "vault",
    },
  ];

  return (
    <nav aria-label="Protocol Flow Navigation" className={`w-full max-w-[1000px] mx-auto flex items-center justify-between font-sans select-none ${className}`}>
      {/* 4 STEPS WITH CARETS */}
      <div className="flex items-center gap-2 sm:gap-3.5 md:gap-5 flex-nowrap overflow-x-auto no-scrollbar">
        {steps.map((step, idx) => {
          return (
            <div key={step.id} className="flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0">
              <button
                type="button"
                onClick={() => navigate(step.path)}
                className="flex items-center gap-2.5 sm:gap-3 text-left cursor-pointer group transition-all"
              >
                {/* Step Circle Badge: 34px diameter */}
                <div
                  className={`w-[34px] h-[34px] rounded-full flex items-center justify-center font-sans font-bold text-[13.5px] transition-all shrink-0 ${
                    step.isActive
                      ? "border-2 border-[#00F0FF] bg-[#02131a] text-[#00F0FF] shadow-[0_0_14px_rgba(0,240,255,0.45)]"
                      : "border border-[#1a2d48] bg-[#040a16] text-[#6b7c93] group-hover:border-[#2e4c76] group-hover:text-slate-300"
                  }`}
                >
                  {step.num}
                </div>

                {/* Step Typography */}
                <div className="flex flex-col">
                  <span
                    className={`text-[13.5px] font-bold tracking-tight transition-colors leading-tight ${
                      step.isActive ? "text-white" : "text-slate-200 group-hover:text-white"
                    }`}
                  >
                    {step.title}
                  </span>
                  <span
                    className={`text-[11.5px] transition-colors leading-tight mt-0.5 ${
                      step.isActive
                        ? "text-[#00F0FF] font-medium"
                        : "text-[#6b7c93] font-normal group-hover:text-slate-400"
                    }`}
                  >
                    {step.sub}
                  </span>
                </div>
              </button>

              {/* Arrow Separator */}
              {idx < steps.length - 1 && (
                <span className="text-[#1c2e47] select-none mx-0.5 shrink-0">
                  <CaretRight size={12} weight="bold" />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* RIGHT SLOGAN DIVIDER & TEXT */}
      <div className="hidden lg:flex items-center pl-6 border-l border-[#1a2d48]/80 shrink-0">
        <div className="flex flex-col items-start">
          <span className="text-[#8fa1b8] font-mono text-[9px] font-bold tracking-[0.15em] uppercase leading-none">
            A STRONGER
          </span>
          <span className="text-[#8fa1b8] font-mono text-[9px] font-bold tracking-[0.15em] uppercase leading-none mt-1">
            NETWORK AWAITS
          </span>
          <span className="w-6 h-[2px] bg-[#00F0FF] rounded-full mt-1.5 shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
        </div>
      </div>
    </nav>
  );
}

