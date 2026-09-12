import { useState, useCallback } from "react";
import { SOCIAL_LINKS } from "../lib/content";
import VisionModal from "./VisionModal";
import { ChartLine, Compass, Wallet, Copy, Check, ArrowSquareOut } from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";

export interface HeaderProps {
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onOpenVision?: () => void;
  className?: string;
}

export default function Header({
  currentPath: _currentPath,
  onNavigate,
  onOpenVision,
  className = "",
}: HeaderProps) {
  const [internalShowVision, setInternalShowVision] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const {
    wallet,
    connectedAddress,
    isWrongChain,
    connect,
    disconnect,
    handleSwitchToBase,
  } = useGrid();

  const handleVisionClick = () => {
    if (onOpenVision) {
      onOpenVision();
    } else {
      setInternalShowVision(true);
    }
  };

  const handleNav = (e: React.MouseEvent, path: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(path);
    }
  };

  const handleConnectClick = useCallback(async () => {
    try {
      await connect();
    } catch (err) {
      console.warn("Header connect error:", err);
    }
  }, [connect]);

  const truncateAddress = (addr?: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <>
      <header
        className={`relative z-30 w-full bg-black/40 backdrop-blur-xl border-b border-white/[0.08] ${className}`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 md:px-12 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Brand Emblem & Name: NARA PROTOCOL (Home Link) */}
          <a
            href="/"
            onClick={(e) => handleNav(e, "/")}
            className="flex items-center gap-2 sm:gap-3 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-full"
            aria-label="NARA Protocol"
          >
            <img
              src="/nara-logo-transparent.png"
              alt="NARA"
              className="w-6 h-6 sm:w-8 sm:h-8 object-contain transition-transform group-hover:scale-105 drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]"
            />
            <span className="font-mono text-[11px] sm:text-sm font-bold tracking-[0.12em] sm:tracking-[0.2em] text-silver uppercase whitespace-nowrap">
              NARA PROTOCOL
            </span>
          </a>

          {/* Right Navigation & Wallet HUD */}
          <nav className="flex items-center gap-2 sm:gap-3 md:gap-4 font-mono text-[10px] sm:text-xs">


            {/* External Chart Link */}
            <a
              href={SOCIAL_LINKS.dexscreener}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-sm text-dim hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap"
            >
              <ChartLine size={13} className="shrink-0" />
              <span>CHART</span>
            </a>

            {/* External Explorer Link */}
            <a
              href={SOCIAL_LINKS.basescanToken}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-sm text-dim hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap"
            >
              <Compass size={13} className="shrink-0" />
              <span>EXPLORER</span>
            </a>

            {/* Vision Modal Trigger */}
            <button
              onClick={handleVisionClick}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 transition-all text-[10px] sm:text-[11px] tracking-wider focus:outline-none shadow-[0_0_10px_rgba(6,182,212,0.15)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#00f0ff]" />
              <span>VISION</span>
            </button>

            {/* Network Warning Pill if on Wrong Chain */}
            {isWrongChain && (
              <button
                onClick={handleSwitchToBase}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[10px] font-bold rounded-sm transition-colors"
                title="Click to switch network to Base"
              >
                <span>SWITCH TO BASE</span>
              </button>
            )}

            {/* Wallet Connect / Account Center Button */}
            {!connectedAddress ? (
              <button
                type="button"
                onClick={handleConnectClick}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-bold text-[10px] sm:text-[11px] tracking-wider rounded-sm transition-all shadow-[0_0_14px_rgba(0,240,255,0.35)] active:scale-95 cursor-pointer"
              >
                <Wallet size={13} className="shrink-0" />
                <span>CONNECT</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAccountMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-black/60 hover:bg-[#0b1224] border border-cyan-500/30 hover:border-cyan-400/50 text-silver hover:text-white text-[10px] sm:text-[11px] rounded-sm transition-all group cursor-pointer active:scale-95"
                  title="Account Details"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  <span>{truncateAddress(connectedAddress)}</span>
                </button>

                {showAccountMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowAccountMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-64 p-3.5 rounded-2xl bg-[#060a18]/98 border border-white/15 backdrop-blur-2xl shadow-[0_15px_35px_rgba(0,0,0,0.9)] z-50 font-sans space-y-3 ring-1 ring-white/10 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
                          CONNECTED WALLET
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          BASE
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-[#03060e] border border-white/[0.06] flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-white truncate">
                          {truncateAddress(connectedAddress)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(connectedAddress);
                            setCopiedAddress(true);
                            setTimeout(() => setCopiedAddress(false), 2000);
                          }}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-[10px] font-mono flex items-center gap-1 transition-colors"
                        >
                          {copiedAddress ? (
                            <>
                              <Check size={11} className="text-emerald-400" />
                              <span className="text-emerald-300">COPIED</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>COPY</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 gap-2">
                        <a
                          href={`https://basescan.org/address/${connectedAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
                        >
                          <span>VIEW BASESCAN</span>
                          <ArrowSquareOut size={12} />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAccountMenu(false);
                            disconnect(wallet);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 text-[10px] font-bold uppercase transition-all active:scale-95"
                        >
                          DISCONNECT
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Internal Vision Modal if not delegated to parent */}
      {!onOpenVision && internalShowVision && (
        <VisionModal onClose={() => setInternalShowVision(false)} />
      )}
    </>
  );
}
