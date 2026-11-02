import { useState } from "react";
import { 
  ArrowsLeftRight, 
  TelegramLogo, 
  BookOpen, 
  Copy, 
  Check, 
  ArrowSquareOut, 
  ShieldCheck, 
  Cpu 
} from "@phosphor-icons/react";
import { PROTOCOL_CONSTANTS, SOCIAL_LINKS } from "../lib/content";

interface ComingSoonAppProps {
  onNavigate?: (path: string) => void;
}

export default function ComingSoonApp({ onNavigate }: ComingSoonAppProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(PROTOCOL_CONSTANTS.tokenContract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-16 text-center font-mono relative z-20">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-500/[0.04] blur-[140px] pointer-events-none rounded-full" />

      <div className="w-full max-w-xl bg-[#04091a]/95 border border-[#142948] p-6 sm:p-10 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl relative overflow-hidden">
        
        {/* Subtle top scanline */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00F0FF]/50 to-transparent" />

        {/* NARA Master Emblem */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 rounded-2xl bg-[#020612] border border-white/10 flex items-center justify-center p-3 shadow-[0_0_30px_rgba(0,240,255,0.15)] ring-1 ring-white/5">
          <img 
            src="/nara-circle-256.png" 
            alt="NARA Protocol" 
            className="w-full h-full object-contain"
          />
        </div>

        {/* Status Chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-[#00F0FF] text-[10px] sm:text-[11px] font-bold tracking-widest uppercase mb-4 shadow-[0_0_12px_rgba(0,240,255,0.15)]">
          <span className="w-2 h-2 rounded-full bg-[#00F0FF] animate-pulse" />
          <span>STATION // UNDER CONSTRUCTION</span>
        </div>

        {/* Primary Headline */}
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight font-sans mb-3">
          COMING SOON
        </h1>

        <div className="text-xs sm:text-sm font-semibold tracking-wider text-cyan-300 uppercase mb-4">
          NARA SOVEREIGN APP & WORLD ENGINE
        </div>

        {/* Grounded & Natural Explanation */}
        <p className="text-xs sm:text-[13px] text-[#8fa1b8] leading-relaxed mb-6 font-sans max-w-md mx-auto">
          The sovereign coordinate grid station, fleet unboxing chamber, and position forge are currently in final development on Base. Verified token swaps, dynamic pool liquidity, and on-chain telemetry are fully live right now.
        </p>

        {/* Live Contract Address Pill */}
        <div className="w-full bg-[#020612] border border-white/10 p-3 sm:p-3.5 rounded-2xl mb-6 text-left space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-[#5c6d84]">
            <span className="flex items-center gap-1.5">
              <Cpu size={13} className="text-[#00F0FF]" />
              <span>OFFICIAL TOKEN CONTRACT (BASE 8453)</span>
            </span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck size={12} weight="bold" />
              VERIFIED
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs text-white font-mono break-all select-all">
              {PROTOCOL_CONSTANTS.tokenContract}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
              title="Copy Contract Address"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-400" />
                  <span className="text-emerald-300 font-bold">COPIED</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>COPY</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Action Button Navigation Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
          {/* Swap DEX */}
          <button
            type="button"
            onClick={() => goTo("/swap")}
            className="w-full py-3 px-4 rounded-xl bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 border border-[#00F0FF]/40 hover:border-[#00F0FF] text-white font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.15)] active:scale-95"
          >
            <ArrowsLeftRight size={15} weight="bold" className="text-[#00F0FF]" />
            <span>LAUNCH SWAP (LIVE)</span>
          </button>

          {/* Sewer Meme Terminal */}
          <button
            type="button"
            onClick={() => goTo("/")}
            className="w-full py-3 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 hover:text-white font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <span className="text-sm">🚽</span>
            <span>SEWER TERMINAL</span>
          </button>

          {/* Telegram Announcements */}
          <a
            href={SOCIAL_LINKS.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[#8fa1b8] hover:text-white font-medium tracking-wider uppercase transition-all flex items-center justify-center gap-2 no-underline"
          >
            <TelegramLogo size={15} weight="fill" className="text-sky-400" />
            <span>TELEGRAM ALERTS</span>
            <ArrowSquareOut size={12} className="opacity-60" />
          </a>

          {/* Technical Docs */}
          <a
            href={SOCIAL_LINKS.publicDocs}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[#8fa1b8] hover:text-white font-medium tracking-wider uppercase transition-all flex items-center justify-center gap-2 no-underline"
          >
            <BookOpen size={15} className="text-amber-400" />
            <span>TECHNICAL DOCS</span>
            <ArrowSquareOut size={12} className="opacity-60" />
          </a>
        </div>

      </div>
    </div>
  );
}
