import { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout";
import ContractPill from "./components/ContractPill";
import NaraSwap from "./components/NaraSwap";
import CommitStation from "./components/CommitStation";
import GridDeckStation from "./components/GridDeckStation";
import VaultStation from "./components/VaultStation";
import TacticalDock from "./components/TacticalDock";
import MintRevealModal from "./components/MintRevealModal";
import PositionInspectModal from "./components/PositionInspectModal";
import { GridProvider } from "./context/GridContext";

export default function App() {
  const getInitialRoute = () => {
    if (typeof window === "undefined") return "/";
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (path === "/swap" || hash === "#/swap" || hash === "#swap") {
      return "/swap";
    }
    if (
      path === "/commit" ||
      hash === "#/commit" ||
      hash === "#commit" ||
      path === "/join" ||
      hash === "#/join" ||
      hash === "#join"
    ) {
      return "/commit";
    }
    if (
      path === "/grid" ||
      hash === "#/grid" ||
      hash === "#grid" ||
      path === "/deck" ||
      hash === "#/deck" ||
      hash === "#deck" ||
      path === "/station" ||
      hash === "#/station" ||
      hash === "#station"
    ) {
      return "/grid";
    }
    if (
      path === "/vault" ||
      hash === "#/vault" ||
      hash === "#vault" ||
      path === "/positions" ||
      hash === "#/positions" ||
      hash === "#positions" ||
      path === "/nfts" ||
      hash === "#/nfts" ||
      hash === "#nfts" ||
      path === "/nft" ||
      hash === "#/nft" ||
      hash === "#nft"
    ) {
      return "/vault";
    }
    return "/";
  };

  const [currentRoute, setCurrentRoute] = useState<string>(getInitialRoute);

  const navigate = useCallback((targetPath: string) => {
    setCurrentRoute(targetPath);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", targetPath);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getInitialRoute());
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, []);

  return (
    <GridProvider currentRoute={currentRoute} navigate={navigate}>
      <Layout
        headerProps={{
          currentPath: currentRoute,
          onNavigate: navigate,
        }}
      >
        {currentRoute === "/swap" ? (
          <NaraSwap />
        ) : currentRoute === "/commit" ? (
          <CommitStation />
        ) : currentRoute === "/grid" ? (
          <GridDeckStation />
        ) : currentRoute === "/vault" ? (
          <VaultStation />
        ) : (
        /* Hero Command Center */
        <main className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-10 md:px-12 flex-1 flex flex-col justify-start sm:justify-center pt-7 sm:pt-0 -translate-y-0 sm:-translate-y-8 md:-translate-y-12">
          <div className="max-w-2xl space-y-3.5 sm:space-y-5">
            {/* Authentic Glowing Wordmark — Optically Flush with Headline Typography */}
            <div className="relative -ml-[15px] sm:-ml-[23px] py-0.5">
              <img
                src="/nara_protocol_wordmark.png"
                alt="NARA PROTOCOL"
                className="w-full max-w-[300px] sm:max-w-[420px] md:max-w-[460px] object-contain drop-shadow-[0_0_25px_rgba(0,240,255,0.45)] transition-transform duration-300 hover:scale-[1.01]"
              />
            </div>

            {/* Clean Mission Headlines — Crisp Typography */}
            <div className="space-y-1.5 pt-0.5 font-mono">
              <h2 className="text-[11px] sm:text-sm md:text-base font-bold text-white tracking-[0.14em] uppercase">
                1 NARA = 1 ACTIVE CELL ON THE MAP.
              </h2>
              <p className="text-[11px] sm:text-[13px] font-bold text-cyan-300 tracking-wider uppercase">
                EVERY 15 MINUTES: HARVEST RESOURCES OR DEPLOY GROUND.
              </p>
              <p className="text-[9.5px] sm:text-[11px] text-silver/80 tracking-wide uppercase pt-0.5 leading-relaxed">
                When others leave, active cells decrease — expanding your share of every pulse.
              </p>
            </div>

            {/* Tactical HUD Tick-Bracket CTAs & Verified Contract Info */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-2">
              {/* Primary button */}
              <button
                type="button"
                onClick={() => navigate("/commit")}
                className="btn-ticks primary"
              >
                <span className="corner tl"></span>
                <span className="corner tr"></span>
                <span className="corner bl"></span>
                <span className="corner br"></span>
                JOIN THE GRID
              </button>

              {/* Secondary button: Swap */}
              <button
                type="button"
                onClick={() => navigate("/swap")}
                className="btn-ticks"
              >
                <span className="corner tl"></span>
                <span className="corner tr"></span>
                <span className="corner bl"></span>
                <span className="corner br"></span>
                SWAP $NARA
              </button>

              {/* Tertiary button: Tactical Deck */}
              <button
                type="button"
                onClick={() => navigate("/grid")}
                className="btn-ticks"
              >
                <span className="corner tl"></span>
                <span className="corner tr"></span>
                <span className="corner bl"></span>
                <span className="corner br"></span>
                TACTICAL DECK
              </button>

              {/* Tactical HUD $NARA Contract Pill */}
              <ContractPill />
            </div>
          </div>
        </main>
      )}
        <TacticalDock />
      </Layout>
      <MintRevealModal />
      <PositionInspectModal />
    </GridProvider>
  );
}
