import { useState, useEffect, useCallback } from "react";
import Layout from "./components/Layout";
import NaraSwap from "./components/NaraSwap";
import CommitStation from "./components/CommitStation";
import GridDeckStation from "./components/GridDeckStation";
import VaultStation from "./components/VaultStation";
import TacticalDock from "./components/TacticalDock";
import MintRevealModal from "./components/MintRevealModal";
import { GridProvider } from "./context/GridContext";

// --- PUBLIC LAUNCH SWITCH ---
// Set to `true` when swaps are officially open to the public!
export const SWAP_PUBLIC_LAUNCHED = false;

function PrelaunchLockout() {
  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8 text-center font-mono">
      <div className="w-full max-w-lg bg-[#04091a]/95 border border-amber-500/40 p-6 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-xl">
        <div className="w-14 h-14 mx-auto flex items-center justify-center bg-amber-500/15 border border-amber-500/40 text-amber-300 text-3xl mb-4 rounded-xl shadow-[0_0_24px_rgba(245,158,11,0.3)]">
          🔒
        </div>
        <div className="inline-block px-3 py-1 bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold tracking-widest uppercase mb-3">
          PRE-LAUNCH // PHASE 1
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-sans mb-2">
          $NARA Swaps Locked
        </h2>
        <p className="text-[13px] text-[#8fa1b8] leading-relaxed mb-6 font-sans">
          The Uniswap V4 dynamic pool hook is currently preparing for public launch on Base Mainnet. Swaps are not open to the public yet.
        </p>

        <div className="w-full bg-[#020612] border border-white/10 p-3 rounded-xl mb-6 text-left">
          <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
            <span>OFFICIAL TOKEN CONTRACT (BASE 8453)</span>
            <span className="text-emerald-400 font-bold">VERIFIED</span>
          </div>
          <div className="text-[11px] text-white font-mono break-all select-all">
            0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="/"
            className="w-full py-3 px-4 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 no-underline"
          >
            <span>🚽</span>
            <span>ENTER SEWER MEME TERMINAL</span>
          </a>

          <a
            href="https://t.me/NARAProtocol"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/80 hover:text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 no-underline"
          >
            <span>✈</span>
            <span>GET LAUNCH NOTIFICATION ON TELEGRAM</span>
          </a>

          <a
            href="https://dexscreener.com/base/0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-[#00F0FF] hover:text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 no-underline"
          >
            <span>📊</span>
            <span>VIEW $NARA ON DEXSCREENER</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isLocalDev = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    Boolean(import.meta.env.DEV)
  );
  const isPreview = isLocalDev && (
    window.location.search.includes("preview=true") || 
    window.location.search.includes("admin=true")
  );
  const isSwapOpen = SWAP_PUBLIC_LAUNCHED || isPreview;

  const getInitialRoute = () => {
    if (typeof window === "undefined") return "/";
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (path === "/meme" || path === "/meme/" || hash === "#/meme" || hash === "#meme") {
      window.location.replace("/meme.html");
      return "/";
    }
    if (path === "/swap" || hash === "#/swap" || hash === "#swap") {
      return "/";
    }
    if (
      path === "/activate" ||
      hash === "#/activate" ||
      hash === "#activate" ||
      path === "/commit" ||
      hash === "#/commit" ||
      hash === "#commit" ||
      path === "/join" ||
      hash === "#/join" ||
      hash === "#join"
    ) {
      return "/activate";
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
      hash === "/nfts" ||
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
        {currentRoute === "/activate" || currentRoute === "/commit" ? (
          <CommitStation />
        ) : currentRoute === "/grid" ? (
          <GridDeckStation />
        ) : currentRoute === "/vault" ? (
          <VaultStation />
        ) : isSwapOpen ? (
          <NaraSwap />
        ) : (
          <PrelaunchLockout />
        )}
        <TacticalDock />
      </Layout>
      <MintRevealModal />
    </GridProvider>
  );
}

