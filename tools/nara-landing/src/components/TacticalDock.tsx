import { ArrowsLeftRight, ChartLine, Sparkle, Compass } from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import { SOCIAL_LINKS } from "../lib/content";

export default function TacticalDock() {
  const { currentRoute, navigate } = useGrid();

  const isSwapActive = currentRoute === "/" || currentRoute === "/swap";

  const tabs = [
    {
      id: "swap",
      label: "SWAP",
      icon: ArrowsLeftRight,
      isActive: isSwapActive,
      onClick: () => navigate("/"),
    },
    {
      id: "chart",
      label: "CHART",
      icon: ChartLine,
      isActive: false,
      onClick: () => window.open(SOCIAL_LINKS.dexscreener, "_blank", "noopener,noreferrer"),
    },
    {
      id: "terminal",
      label: "TERMINAL",
      icon: Sparkle,
      isActive: false,
      onClick: () => { window.location.href = "/meme.html"; },
    },
    {
      id: "explorer",
      label: "EXPLORER",
      icon: Compass,
      isActive: false,
      onClick: () => window.open(SOCIAL_LINKS.basescanToken, "_blank", "noopener,noreferrer"),
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation Dock"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pt-1.5 bg-[#030712]/95 backdrop-blur-2xl border-t border-cyan-500/20 shadow-[0_-8px_30px_rgba(0,0,0,0.85)] select-none"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
    >
      <div className="grid grid-cols-4 gap-1.5 max-w-md mx-auto font-mono">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onClick}
              className={`relative flex flex-col items-center justify-center min-h-[46px] py-1 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                tab.isActive
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Icon size={18} weight={tab.isActive ? "fill" : "regular"} className="mb-0.5" />
              <span className="text-[9px] font-bold tracking-wider uppercase">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

