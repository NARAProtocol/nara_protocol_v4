import { ArrowsLeftRight, Lightning, Cpu, Coins } from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";

export default function TacticalDock() {
  const { currentRoute, navigate, aggregateClaimableEth, aggregateClaimableNara, slottedTokenIds, userPositions, connectedAddress } = useGrid();

  const isRewardsReady = !aggregateClaimableEth.isZero() || !aggregateClaimableNara.isZero();
  const hasRealPositions = Boolean(connectedAddress && userPositions.length > 0 && !userPositions[0]?.isSample);
  const needsSlots = hasRealPositions && slottedTokenIds.length < 6;

  const tabs = [
    {
      id: "swap",
      path: "/swap",
      label: "SWAP",
      icon: ArrowsLeftRight,
      isActive: currentRoute === "/swap",
    },
    {
      id: "commit",
      path: "/commit",
      label: "COMMIT",
      icon: Lightning,
      isActive: currentRoute === "/commit",
    },
    {
      id: "grid",
      path: "/grid",
      label: "GRID",
      icon: Cpu,
      isActive: currentRoute === "/grid" || currentRoute === "/station" || currentRoute === "/deck",
      badge: needsSlots ? `${slottedTokenIds.length}/6` : undefined,
    },
    {
      id: "vault",
      path: "/vault",
      label: "VAULT",
      icon: Coins,
      isActive: currentRoute === "/vault" || currentRoute === "/positions" || currentRoute === "/nfts",
      hasPulse: isRewardsReady,
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation Dock"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-[env(safe-area-inset-bottom,12px)] pt-2 bg-[#04060d]/90 backdrop-blur-xl border-t border-white/[0.08]"
    >
      <div className="grid grid-cols-4 gap-1 max-w-md mx-auto font-mono">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all active:scale-95 ${
                tab.isActive
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {/* Notification Pill or Pulse */}
              {tab.hasPulse && (
                <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
              {tab.badge && !tab.isActive && (
                <span className="absolute top-1 right-2 text-[8px] px-1 rounded bg-blue-950 border border-blue-500/30 text-blue-300">
                  {tab.badge}
                </span>
              )}

              <Icon size={18} weight={tab.isActive ? "fill" : "regular"} className="mb-0.5" />
              <span className="text-[9.5px] font-bold tracking-wider uppercase">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
