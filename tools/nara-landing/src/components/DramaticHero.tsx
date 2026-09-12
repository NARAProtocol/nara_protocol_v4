import { useState, useEffect } from "react";
import { SOCIAL_LINKS, PROTOCOL_CONSTANTS } from "../lib/content";
import { 
  ArrowUpRight, 
  Copy, 
  Check, 
  Info, 
  TelegramLogo, 
  TerminalWindow,
  Compass,
  ArrowSquareOut
} from "@phosphor-icons/react";

export default function DramaticHero() {
  // Real-time 15-minute epoch clock math (cadence = 900s)
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number }>({ minutes: 15, seconds: 0 });
  const [epochProgress, setEpochProgress] = useState(0);
  const [dailyEpoch, setDailyEpoch] = useState(1);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  useEffect(() => {
    const updateEpochClock = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const epochSeconds = nowSec % 900;
      const remainingSec = 900 - epochSeconds;
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      setTimeLeft({ minutes: m, seconds: s });
      setEpochProgress(Number(((epochSeconds / 900) * 100).toFixed(1)));
      const dailyIdx = Math.floor((nowSec % 86400) / 900) + 1;
      setDailyEpoch(dailyIdx);
    };

    updateEpochClock();
    const interval = setInterval(updateEpochClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let baseBlock = 0;
    let syncTime = 0;

    async function fetchBaseBlock() {
      try {
        const res = await fetch("https://mainnet.base.org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          }),
        });
        const data = await res.json();
        if (data && data.result && isMounted) {
          baseBlock = parseInt(data.result, 16);
          syncTime = Date.now();
          setCurrentBlock(baseBlock);
        }
      } catch {
        // Quiet fallback
      }
    }

    fetchBaseBlock();
    // Low-frequency network re-sync every 60s (saves 87% of background RPC calls)
    const resyncInterval = setInterval(fetchBaseBlock, 60000);

    // Smooth client-side block interpolation matching Base 2-second block production
    const tickInterval = setInterval(() => {
      if (baseBlock > 0 && isMounted) {
        const elapsedSec = Math.floor((Date.now() - syncTime) / 1000);
        const estimatedAdvance = Math.floor(elapsedSec / 2);
        setCurrentBlock(baseBlock + estimatedAdvance);
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(resyncInterval);
      clearInterval(tickInterval);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(PROTOCOL_CONSTANTS.tokenContract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const toggleTooltip = (key: string) => {
    setActiveTooltip(activeTooltip === key ? null : key);
  };

  return (
    <section className="relative w-full min-h-[100dvh] flex flex-col justify-center pt-8 pb-16 overflow-hidden">
      {/* Background Ambience: Deepest OLED Void with micro radial glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(0,0,255,0.08),rgba(4,5,8,0))] z-0" />

      <div className="shell relative z-10 w-full">
        {/* Editorial Split Grid: Left Typography & Controls / Right Dramatic Monolith Nexus */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* LEFT COLUMN: Agency Typography, Live Epoch Pulse, & Double-Bezel HUD (7 cols / ~58%) */}
          <div className="lg:col-span-7 flex flex-col items-start text-left space-y-6 sm:space-y-8">
            
            {/* Status Pill & Live Chain Pulse */}
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 ring-1 ring-white/5 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-mono text-[11px] font-semibold text-silver tracking-widest uppercase">
                PHASE ONE // SOVEREIGN GRID
              </span>
              <span className="text-white/20">|</span>
              <span className="font-mono text-[10px] text-muted">
                BASE {currentBlock ? `#${currentBlock.toLocaleString()}` : "#8453"}
              </span>
            </div>

            {/* Massive Display Typography (Satoshi / Anti-Center Left Aligned) */}
            <div className="space-y-3 max-w-2xl">
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-black tracking-tight text-white leading-[0.96]">
                THE TIME-WEIGHTED <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-silver to-dim">
                  WEALTH INSTRUMENT.
                </span>
              </h1>
              
              <p className="text-dim font-sans text-sm sm:text-base leading-relaxed max-w-xl pt-2">
                Fixed 1,000,000 supply. Zero inflation. An autonomous onchain game where impatience permanently surrenders yield to time.
              </p>
            </div>

            {/* Live 15-Minute Epoch Cadence HUD (Double-Bezel Architecture) */}
            <div className="w-full max-w-xl p-1.5 sm:p-2 rounded-2xl bg-white/[0.02] border border-white/10 ring-1 ring-white/5 shadow-2xl">
              <div className="p-4 sm:p-5 rounded-xl bg-surface/90 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-xl">
                
                {/* HUD Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-base-blue animate-pulse" />
                    <span className="text-silver font-bold tracking-wider uppercase">
                      15-MIN ENGINE CADENCE
                    </span>
                    <button
                      onClick={() => toggleTooltip("epoch")}
                      className="text-muted hover:text-white transition-colors p-0.5"
                      aria-label="Epoch explanation"
                    >
                      <Info size={14} weight="bold" />
                    </button>
                  </div>
                  <div className="text-dim text-[11px]">
                    EPOCH <span className="text-silver font-bold">{dailyEpoch}</span> / 96 DAILY
                  </div>
                </div>

                {/* Progressive Disclosure: Tooltip for Epoch */}
                {activeTooltip === "epoch" && (
                  <div className="p-3 mb-3 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px] text-silver/80 space-y-1">
                    <p>
                      The NARA Engine advances state every 900 seconds (15 minutes). Trading fees captured by the Uniswap v4 Hook are calculated and streamed across 96 discrete daily cycles.
                    </p>
                  </div>
                )}

                {/* Ticking Countdown & Progress Bar */}
                <div className="grid grid-cols-2 gap-4 items-center">
                  <div>
                    <div className="text-[10px] font-mono text-muted tracking-wider uppercase mb-0.5">
                      NEXT REWARD PULSE IN
                    </div>
                    <div className="font-mono text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                      <span>
                        {String(timeLeft.minutes).padStart(2, "0")}:
                        {String(timeLeft.seconds).padStart(2, "0")}
                      </span>
                      <span className="text-xs font-normal text-muted">UTC</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between font-mono text-[10px] text-muted">
                      <span>CYCLE PROGRESS</span>
                      <span className="text-silver font-bold">{epochProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/5 border border-white/10 overflow-hidden p-0.5">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-base-blue to-emerald-400 transition-all duration-1000 ease-out"
                        style={{ width: `${epochProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Sub-Stats Strip */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5 font-mono text-[10px]">
                  <div>
                    <span className="text-muted block">FIXED CAP</span>
                    <span className="text-silver font-bold">1,000,000 NARA</span>
                  </div>
                  <div>
                    <span className="text-muted block">V4 HOOK</span>
                    <span className="text-emerald-400 font-bold">ACTIVE #2088</span>
                  </div>
                  <div>
                    <span className="text-muted block">GAME MECHANIC</span>
                    <span className="text-silver font-bold">SACRIFICIAL YIELD</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tactile Button-in-Button Action Rail */}
            <div className="flex flex-wrap items-center gap-3 pt-2 w-full max-w-xl font-mono text-xs">
              
              {/* Primary CTA: Enter App with Nested Button-in-Button Disc */}
              <a
                href={SOCIAL_LINKS.swapApp}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-between gap-3 pl-5 pr-2 py-2 rounded-full bg-base-blue hover:bg-base-blue/90 text-white font-bold tracking-wider transition-all duration-300 shadow-glow active:scale-[0.98]"
              >
                <span>ENTER APP // SWAP</span>
                <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-white/25">
                  <ArrowUpRight size={14} weight="bold" />
                </span>
              </a>

              {/* Secondary CTA: Telegram Portal */}
              <a
                href={SOCIAL_LINKS.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-between gap-3 pl-4 pr-2 py-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-silver border border-white/10 ring-1 ring-white/5 transition-all duration-300 active:scale-[0.98]"
              >
                <span className="font-semibold">TELEGRAM PORTAL</span>
                <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                  <TelegramLogo size={14} weight="fill" />
                </span>
              </a>

              {/* 1-Click Tactile Contract Copy Pill */}
              <button
                onClick={handleCopy}
                className={`group inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full border transition-all duration-200 active:scale-[0.98] ${
                  copied
                    ? "bg-emerald-500 text-black border-emerald-400 font-bold shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    : "bg-white/[0.02] hover:bg-white/[0.06] text-muted hover:text-silver border-white/10"
                }`}
                title="Copy Verified Token Contract"
              >
                {copied ? (
                  <>
                    <Check size={14} weight="bold" />
                    <span>0xB633... COPIED</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} weight="bold" className="transition-transform group-hover:scale-110" />
                    <span>CA: 0xB633...19c1</span>
                  </>
                )}
              </button>
            </div>

            {/* Verifiable Network Endpoints Rail */}
            <div className="flex flex-wrap items-center gap-4 pt-1 font-mono text-[11px] text-muted">
              <span className="text-silver/40 uppercase tracking-wider">VERIFIED ON:</span>
              <a
                href={SOCIAL_LINKS.basescanToken}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <span>BaseScan</span>
                <ArrowSquareOut size={11} />
              </a>
              <span className="text-white/10">•</span>
              <a
                href={SOCIAL_LINKS.dexscreener}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <span>DexScreener</span>
                <ArrowSquareOut size={11} />
              </a>
              <span className="text-white/10">•</span>
              <a
                href={SOCIAL_LINKS.uniswapHooklistPr}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 text-emerald-500/80 flex items-center gap-1 transition-colors"
              >
                <span>Uniswap Hook #1643</span>
                <ArrowSquareOut size={11} />
              </a>
              <span className="text-white/10">•</span>
              <a
                href={SOCIAL_LINKS.publicDocs}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white flex items-center gap-1 transition-colors"
              >
                <span>Docs</span>
                <ArrowSquareOut size={11} />
              </a>
            </div>

          </div>

          {/* RIGHT COLUMN: The Dramatic 3D Monolith & Sovereign Game Grid (5 cols / ~42%) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative w-full mt-4 lg:mt-0">
            
            {/* Machined Double-Bezel Frame for the Approved Split Layout Visual */}
            <div className="relative w-full p-2 sm:p-2.5 rounded-3xl bg-white/[0.02] border border-white/10 ring-1 ring-white/5 shadow-glass group overflow-hidden">
              
              {/* Corner Reticle Machined Accents */}
              <div className="absolute top-3 left-3 w-2 h-2 border-t border-l border-white/30 z-20 pointer-events-none" />
              <div className="absolute top-3 right-3 w-2 h-2 border-t border-r border-white/30 z-20 pointer-events-none" />
              <div className="absolute bottom-3 left-3 w-2 h-2 border-b border-l border-white/30 z-20 pointer-events-none" />
              <div className="absolute bottom-3 right-3 w-2 h-2 border-b border-r border-white/30 z-20 pointer-events-none" />

              {/* Inner High-Precision Core */}
              <div className="relative rounded-2xl overflow-hidden bg-void border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] aspect-[16/10] sm:aspect-[16/10] flex items-center justify-center">
                
                {/* Approved Split Layout Hero Image */}
                <img
                  src="/NARA_Phase_One_Hero_Split_Layout_1920x1080.png"
                  alt="NARA Sovereign Grid Phase One"
                  className="w-full h-full object-cover object-center transform transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  loading="eager"
                />

                {/* Subtle Cinematic Vignette Blending */}
                <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/20 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-void/60 via-transparent to-void/40 pointer-events-none" />

                {/* Floating Tactical Overlay Badge */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-20 font-mono text-[10px]">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/80 border border-white/15 backdrop-blur-md text-silver font-semibold tracking-wider">
                    <TerminalWindow size={13} weight="bold" className="text-base-blue" />
                    <span>SOVEREIGN MATRIX // V4 CORE</span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>DEPLOYED & VERIFIED</span>
                  </div>
                </div>

                {/* Top Floating Mini Compass Pill */}
                <div className="absolute top-4 right-4 z-20 font-mono text-[10px]">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 border border-white/15 backdrop-blur-md text-dim">
                    <Compass size={13} weight="bold" className="text-silver" />
                    <span>GRID 1920x1080</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Subtle Caption / Explanatory Underline */}
            <div className="flex items-center justify-between w-full px-2 pt-3 font-mono text-[11px] text-muted">
              <div className="flex items-center gap-1.5">
                <span className="text-silver/60 font-semibold">PHASE 01:</span>
                <span>SOVEREIGN TIME-WEIGHTED GAME</span>
              </div>
              <a
                href={SOCIAL_LINKS.publicDocs}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                <span>SPEC v4.0</span>
                <ArrowSquareOut size={11} />
              </a>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
