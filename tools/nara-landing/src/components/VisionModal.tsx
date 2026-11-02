import { useState, useEffect } from "react";
import { 
  X, 
  HourglassMedium, 
  ShieldCheck, 
  ArrowUpRight, 
  TelegramLogo, 
  CheckCircle,
  ArrowsClockwise,
  ClockAfternoon,
  Cube,
  FileText,
  LockKey,
  Copy,
  Check,
  Scales,
  Sparkle,
  GameController
} from "@phosphor-icons/react";
import { PROTOCOL_CONSTANTS, SOCIAL_LINKS } from "../lib/content";

interface VisionModalProps {
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

export default function VisionModal({ onClose, onNavigate }: VisionModalProps) {
  const [activeTab, setActiveTab] = useState<"grid" | "pulse" | "hook" | "governance">("grid");
  const [copied, setCopied] = useState(false);

  // Lock body scroll and handle ESC key press
  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("overflow-hidden");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(PROTOCOL_CONSTANTS.tokenContract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-2xl animate-fadeIn cursor-pointer"
    >
      {/* Double-Bezel Modal Container */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#04091a]/98 border border-[#142948] ring-1 ring-white/10 shadow-[0_0_60px_rgba(0,0,0,0.95)] overflow-hidden cursor-default"
      >
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 border-b border-white/10 bg-[#020612]/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img 
              src="/nara-circle-256.png" 
              alt="NARA" 
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-contain drop-shadow-[0_0_10px_rgba(0,240,255,0.4)]" 
            />
            <div>
              <div className="font-mono text-xs font-bold tracking-widest text-[#8fa1b8] uppercase flex items-center gap-2">
                <span className="text-white">NARA PROTOCOL</span>
                <span className="text-white/20">|</span>
                <span className="text-[#00F0FF] font-semibold text-[10px]">BLUEPRINT & SPECIFICATION</span>
              </div>
              <div className="font-mono text-[10px] text-[#5c6d84] tracking-wide hidden sm:block">
                Phase 1: Trading & Community // Phase 2: Engine & Sovereign Tile Game on Base (Chain ID: 8453)
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/15 text-[#8fa1b8] hover:text-white transition-colors focus:outline-none cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Tab Navigation Rail */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-8 py-2.5 sm:py-3 border-b border-white/5 bg-[#01040d]/70 overflow-x-auto no-scrollbar font-mono text-xs [mask-image:linear-gradient(to_right,black_88%,transparent_100%)] sm:[mask-image:none]">
          <button
            onClick={() => setActiveTab("grid")}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none cursor-pointer ${
              activeTab === "grid"
                ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 shadow-[0_0_15px_rgba(0,240,255,0.15)] font-bold"
                : "text-[#8fa1b8] hover:text-white hover:bg-white/5"
            }`}
          >
            <Cube size={15} weight="bold" />
            <span>01 // PHASE 1: TRADING & COMMUNITY</span>
          </button>

          <button
            onClick={() => setActiveTab("pulse")}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none cursor-pointer ${
              activeTab === "pulse"
                ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 shadow-[0_0_15px_rgba(0,240,255,0.15)] font-bold"
                : "text-[#8fa1b8] hover:text-white hover:bg-white/5"
            }`}
          >
            <HourglassMedium size={15} weight="bold" />
            <span>02 // PHASE 2: ENGINE & TILE GAME</span>
          </button>

          <button
            onClick={() => setActiveTab("hook")}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none cursor-pointer ${
              activeTab === "hook"
                ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 shadow-[0_0_15px_rgba(0,240,255,0.15)] font-bold"
                : "text-[#8fa1b8] hover:text-white hover:bg-white/5"
            }`}
          >
            <ArrowsClockwise size={15} weight="bold" />
            <span>03 // UNISWAP V4 HOOK</span>
          </button>

          <button
            onClick={() => setActiveTab("governance")}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none cursor-pointer ${
              activeTab === "governance"
                ? "bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40 shadow-[0_0_15px_rgba(0,240,255,0.15)] font-bold"
                : "text-[#8fa1b8] hover:text-white hover:bg-white/5"
            }`}
          >
            <ShieldCheck size={15} weight="bold" />
            <span>04 // AUDITS & LEGAL DISCLOSURE</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 p-5 sm:p-8 overflow-y-auto font-sans text-xs sm:text-sm leading-relaxed space-y-6 text-[#8fa1b8] bg-[#020612]/60">
          
          {/* TAB 1: PHASE 1 TRADING, COMMUNITY & ULTRA-THIN SUPPLY */}
          {activeTab === "grid" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-[#00F0FF] font-bold uppercase tracking-widest flex items-center justify-between flex-wrap gap-2">
                  <span>PILLAR 01 // PHASE ONE: TRADING & COMMUNITY</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/15 text-[#00F0FF] border border-cyan-500/30 font-bold">
                    40 FLOAT · 999,960 LOCKED
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Phase One: Trading, Community & The Ultra-Thin Unlocked Supply
                </h3>
                <p className="text-[#8fa1b8] leading-relaxed">
                  Phase One of NARA Protocol is strictly dedicated to active trading, community formation, and authentic liquidity discovery on Base Mainnet. Before autonomous machine mechanics awaken, real participants coordinate around the most extreme supply scarcity in DeFi.
                </p>
              </div>

              {/* DEDICATED ULTRA-THIN SUPPLY CALLOUT (HIGHLIGHTED PROMINENTLY) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-cyan-950/30 to-[#020612] border-2 border-[#00F0FF]/50 shadow-[0_0_30px_rgba(0,240,255,0.15)] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#00F0FF] uppercase tracking-wider">
                    <Sparkle size={18} weight="fill" className="text-amber-400 animate-pulse" />
                    <span className="text-white text-sm font-extrabold tracking-wide">
                      THE UNLOCKED SUPPLY IS SUPER THIN: OVER 99.99% CONTRACT-LOCKED
                    </span>
                  </div>
                  <span className="font-mono text-[10px] px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold uppercase">
                    Strictly 40 NARA Float at Launch
                  </span>
                </div>
                <p className="text-slate-200 text-xs sm:text-[13px] leading-relaxed font-sans">
                  Most crypto launches flood the market with billions of unlocked tokens, predatory private seed rounds, and continuous developer inflation. <strong className="text-white font-bold">NARA did the opposite:</strong> The launch pool was seeded with <strong className="text-[#00F0FF]">strictly 40 NARA</strong> and 4,000 USDC ($100 spot, $4,000 circulating Mcap). Exactly <strong className="text-white">999,960 NARA (&gt;99.99%)</strong> are cryptographically locked inside verified on-chain contracts (<code className="text-[#00F0FF] font-mono">NARAEngine</code>, timelocks, and vaults). Zero loose tokens in private wallets. Zero VC pre-sales. Zero insider dumping cliffs. Every single dollar of buy pressure drives 100% genuine on-chain price discovery.
                </p>

                {/* 3-Stat Scarcity Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-black/60 border border-[#00F0FF]/30 space-y-1">
                    <div className="text-[#5c6d84] text-[10px] uppercase font-bold">CIRCULATING FLOAT</div>
                    <div className="font-bold text-[#00F0FF] text-base">40 NARA</div>
                    <div className="text-[10px] text-slate-400">0.004% of total supply</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/60 border border-white/10 space-y-1">
                    <div className="text-[#5c6d84] text-[10px] uppercase font-bold">CONTRACT-LOCKED</div>
                    <div className="font-bold text-white text-base">999,960 NARA</div>
                    <div className="text-[10px] text-slate-400">&gt;99.99% locked in engine & vaults</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/60 border border-emerald-500/30 space-y-1">
                    <div className="text-[#5c6d84] text-[10px] uppercase font-bold">VC & INSIDER CLIFFS</div>
                    <div className="font-bold text-emerald-400 text-base">0.00%</div>
                    <div className="text-[10px] text-slate-400">Zero team dumps or discounts</div>
                  </div>
                </div>
              </div>

              {/* Two-Phase Protocol Architecture Grid */}
              <div className="space-y-3">
                <div className="font-mono text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ArrowsClockwise size={16} className="text-[#00F0FF]" />
                  <span>The Two-Phase Architecture Roadmap</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 font-mono text-xs">
                  {/* Phase 1 Card */}
                  <div className="p-4 rounded-2xl bg-[#030816] border border-[#00F0FF]/50 shadow-[0_0_15px_rgba(0,240,255,0.08)] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#00F0FF] text-[13px]">PHASE 1 // ACTIVE NOW</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/15 text-[#00F0FF] border border-cyan-500/30">TRADING & COMMUNITY</span>
                    </div>
                    <div className="font-bold text-white text-sm font-sans">Public Trading & Organic Community</div>
                    <p className="text-[#8fa1b8] text-xs font-sans leading-relaxed">
                      Token first. Active trading on Uniswap v4 / Base Mainnet (<code className="text-[#00F0FF]">0x91FB...Ae0f</code>), organic liquidity formation, meme culture, and building an aligned, sovereign holder community. High buy pressure against an ultra-thin 40 NARA float establishes authentic price discovery without insider dilution.
                    </p>
                  </div>

                  {/* Phase 2 Card */}
                  <div className="p-4 rounded-2xl bg-[#030816] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-[13px]">PHASE 2 // COMING NEXT</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">THE MACHINE & TILES</span>
                    </div>
                    <div className="font-bold text-white text-sm font-sans">The Autonomous Engine & Tile Game</div>
                    <p className="text-[#8fa1b8] text-xs font-sans leading-relaxed">
                      The machine follows. Once community consensus and initial trading are established, the engine awakens: 900-second resource epochs (96 daily payouts), 100% ETH protocol fee routing to stakers, Forge Furnace fusion, and spatial distribution across the 1,000,000 Sovereign Tile Game (1 Token = 1 Sovereign Tile).
                    </p>
                  </div>
                </div>
              </div>

              {/* Direct Action Card: Trade on Swap & Join Community */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-[#030816] to-[#020612] border border-[#00F0FF]/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[#00F0FF] font-bold font-mono text-xs uppercase tracking-wider">
                    <Sparkle size={16} weight="fill" />
                    <span>Join Phase 1: Trade $NARA & Enter The Community</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs font-sans leading-relaxed">
                    Execute 1-click atomic swaps on Base Mainnet with zero aggregator markups, or join the official Telegram to build alongside fellow holders.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onNavigate) onNavigate("/swap");
                      else window.location.href = "/swap";
                    }}
                    className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-[#00F0FF] hover:text-white border border-cyan-400/40 font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.2)] active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>SWAP $NARA</span>
                    <ArrowUpRight size={13} weight="bold" />
                  </button>
                  <a
                    href={SOCIAL_LINKS.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10 font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 no-underline"
                  >
                    <TelegramLogo size={14} weight="fill" className="text-sky-400" />
                    <span>TELEGRAM</span>
                  </a>
                </div>
              </div>

              {/* Why Trading & Community First? */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#030816] border border-[#132640] space-y-2.5">
                <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#00F0FF]" weight="bold" />
                  <span>Why Trading & Community First ("Token First. The Machine Follows.")</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-[#8fa1b8]">
                  <div className="p-3.5 rounded-xl bg-[#020612] border border-white/5 space-y-1.5">
                    <span className="font-bold text-white block">Grassroots Decentralization</span>
                    <p className="text-[11px] font-sans leading-relaxed">
                      Activating complex game mechanics without an established community invites mercenary bots to hoard supply. By prioritizing trading and community culture first, the token disperses into the wallets of genuine believers and long-term ecosystem custodians.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#020612] border border-white/5 space-y-1.5">
                    <span className="font-bold text-white block">Zero Predatory Cartels</span>
                    <p className="text-[11px] font-sans leading-relaxed">
                      No venture capital syndicate purchased tokens at a fraction of market price. No seed rounds. No team vesting unlocks to crash the chart. Every participant acquires tokens on identical on-chain terms.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PHASE 2 THE AUTONOMOUS ENGINE & SOVEREIGN TILE GAME */}
          {activeTab === "pulse" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-[#00F0FF] font-bold uppercase tracking-widest flex items-center justify-between flex-wrap gap-2">
                  <span>PILLAR 02 // PHASE TWO: THE AUTONOMOUS ENGINE & SOVEREIGN TILE GAME</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold">
                    1 TOKEN ANCHORS 1 TILE
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Phase Two: The Engine Awakens & Distribution in the Tile Game
                </h3>
                <p className="text-[#8fa1b8] leading-relaxed">
                  Following Phase One trading and community consensus, <strong className="text-white">Phase Two awakens the autonomous economic engine</strong> and unlocks distribution across <strong className="text-cyan-400">The Sovereign Tile Game</strong> on Base.
                </p>
              </div>

              {/* Sovereign Tile Game Distribution Callout */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#030816] border border-[#132640] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white uppercase tracking-wider">
                    <Cube size={16} className="text-[#00F0FF]" weight="bold" />
                    <span>Spatial Distribution: The 1,000 × 1,000 Sovereign Grid</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/15 text-[#00F0FF] border border-cyan-500/30 font-mono font-bold">
                    1 TOKEN = 1 SOVEREIGN TILE
                  </span>
                </div>
                <p className="text-[#8fa1b8] text-xs leading-relaxed">
                  The fixed 1,000,000 NARA supply maps directly to a discrete 1,000 × 1,000 Euclidean grid on Base Mainnet. Players dredge rare collectibles, discover relics, and claim coordinates. Anchoring tokens locks circulating float directly into non-fungible ERC-721 position relics—transforming liquid traders into permanent territorial custodians.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-[#020612] border border-white/5 space-y-1">
                    <div className="text-[#5c6d84] text-[10px] uppercase font-bold">1 NARA ANCHORED</div>
                    <div className="font-bold text-white text-[13px]">1 Sovereign Tile</div>
                    <div className="text-[10px] text-[#8fa1b8]">Discrete Beacon Cell</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#020612] border border-[#00F0FF]/20 space-y-1">
                    <div className="text-[#5c6d84] text-[10px] uppercase font-bold">100 NARA ANCHORED</div>
                    <div className="font-bold text-[#00F0FF] text-[13px]">100-Tile District</div>
                    <div className="text-[10px] text-[#8fa1b8]">Contiguous Sector Outpost</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#020612] border border-white/5 space-y-1">
                    <div className="text-[#5c6d84] text-[10px] uppercase font-bold">1,000 NARA ANCHORED</div>
                    <div className="font-bold text-white text-[13px]">1,000-Tile Province</div>
                    <div className="text-[10px] text-[#8fa1b8]">Regional Fleet Bastion</div>
                  </div>
                </div>
              </div>

              {/* Interactive Gameplay Link */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#030816] to-[#020612] border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono text-xs uppercase tracking-wider">
                    <GameController size={16} weight="fill" />
                    <span>Experience The Sovereign Tile Game</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs font-sans leading-relaxed">
                    Dredge rare porcelain collectibles (Common to Mythic), pass milestones, and explore the grid interface.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      window.location.href = "/meme.html";
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-white border border-emerald-500/40 font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.2)] active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>PLAY TILE GAME 🎮</span>
                  </button>
                </div>
              </div>

              {/* The 900s Autonomous Pulse & Fee Routing Box */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#030816] border border-[#132640] space-y-3">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-white uppercase tracking-wider">
                  <ClockAfternoon size={16} className="text-[#00F0FF]" />
                  <span>900-Second Heartbeat & 96 Daily Autonomous Epochs</span>
                </div>
                <p className="text-[#8fa1b8] text-xs leading-relaxed">
                  The engine replaces arbitrary emissions with a deterministic on-chain chronometer: every 900 seconds (15 minutes), the protocol completes a discrete resource epoch. <strong className="text-white">100% of ETH protocol fees</strong> captured across Uniswap v4 dynamic hook swaps and game actions route programmatically to anchored tile holders.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 font-mono text-xs">
                  <div className="p-3.5 rounded-xl bg-[#020612] border border-white/5 space-y-1.5">
                    <span className="text-white font-bold block">SETTLE TO WALLET</span>
                    <p className="text-[#8fa1b8] text-[11px] font-sans leading-relaxed">
                      Participants can claim their settled resource allocations directly to their non-custodial address with standard cryptographic authorization.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#020612] border border-[#00F0FF]/20 space-y-1.5">
                    <span className="text-[#00F0FF] font-bold block">RE-ANCHOR TO GRID</span>
                    <p className="text-[#8fa1b8] text-[11px] font-sans leading-relaxed">
                      Alternatively, operators can commit their settled units to solidify coordinate holdings, commanding more ground and expanding spatial weight.
                    </p>
                  </div>
                </div>
              </div>

              {/* Time-Weighted Equalizer */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#030816] border border-[#132640] space-y-2.5">
                <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <LockKey size={16} className="text-[#00F0FF]" />
                  <span>Equalized Participation Multipliers</span>
                </h4>
                <p className="text-[#8fa1b8] text-xs leading-relaxed">
                  Protocol formulas prioritize sustained commitment over mercenary, short-term liquidity sniping. Positions anchored across longer time horizons receive calibrated mathematical weight curves, protecting the ecosystem from flash loan manipulation and aligning protocol flow with long-term network participants.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: UNISWAP V4 HOOK */}
          {activeTab === "hook" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-[#00F0FF] font-bold uppercase tracking-widest flex items-center justify-between flex-wrap gap-2">
                  <span>PILLAR 03 // AMM & ROUTING ARCHITECTURE</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-bold">
                    0x2088 HOOK · 1-CLICK ATOMIC SWAP
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Custom Uniswap v4 Dynamic Hook on Base
                </h3>
                <p className="text-[#8fa1b8] leading-relaxed">
                  NARA is anchored on a custom Uniswap v4 pool architecture. Rather than relying on rigid, passive AMM pools, trading is governed by an autonomous hook that protects protocol liquidity and eliminates intermediary aggregator rent-seeking.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 0x2088 Hook Permission Flags */}
                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>FLAG 0x2088 MINING</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-[#00F0FF] border border-cyan-500/20">VERIFIED</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    The hook contract was mined to address prefix <code className="text-white">0x2088</code> to execute <code className="text-[#00F0FF]">beforeInitialize</code>, <code className="text-[#00F0FF]">beforeSwap</code>, and <code className="text-[#00F0FF]">beforeSwapReturnDelta</code> callbacks in Uniswap v4's PoolManager.
                  </p>
                </div>

                {/* Protocol-Owned Reserves */}
                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>PROTOCOL RESERVES</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">NON-EXTRACTIVE</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    Trading fees captured by the hook recycle back into protocol-owned reserves via verified compounder contracts, strengthening pool depth and reducing price slippage over time.
                  </p>
                </div>

                {/* 1-Click Atomic Route */}
                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>1-CLICK ATOMIC ROUTE</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-[#00F0FF] border border-cyan-500/20">0% APP FEE</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    Swapping native ETH into NARA executes atomically (<code className="text-white">WRAP → V3 → V4 → SWEEP</code>). Zero ERC-20 approval transactions are required for native ETH trades, cutting transaction steps and gas costs in half.
                  </p>
                </div>

                {/* Modular Position Relics */}
                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>MODULAR POSITION RELICS</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">ON-CHAIN SVG</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    Positions anchored in the engine are represented by composable, on-chain SVG ERC-721 relics. Participants can transfer or trade anchored coordinates peer-to-peer without causing spot sell shock to the AMM pool.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDITS & LEGAL DISCLOSURES */}
          {activeTab === "governance" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-[#00F0FF] font-bold uppercase tracking-widest flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Scales size={14} className="text-[#00F0FF]" />
                    <span>PILLAR 04 // SECURITY AUDITS & LEGAL COMPLIANCE</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                    ZERO PROXIES · 1M FIXED SUPPLY
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Cryptographic Integrity & Verifiable Non-Custodial Architecture
                </h3>
                <p className="text-[#8fa1b8] leading-relaxed">
                  Synthesized across comprehensive security, interface, and growth flow audits (HYDRA, WEAVER, OWL, HAWK), NARA enforces security through immutable bytecode and transparent legal standards.
                </p>
              </div>

              {/* Core Audit Verified Invariants */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-1.5">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Fixed Supply Guarantee</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    Total supply is permanently capped at exactly 1,000,000 NARA. There are no mint functions, no hidden reserves, and no inflationary parameters.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-1.5">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Zero Upgrade Proxies</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    Core contracts contain zero proxy mechanisms (no UUPS, no transparent proxy). The bytecode deployed to Base is permanent and cannot be altered.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-1.5">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Contract vs Interface Clarity (HYDRA)</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    Per the HYDRA decentralization audit: The smart contracts on Base are 100% autonomous and non-custodial. Web domains serve only as open-source client interfaces; operators can always execute transactions directly via BaseScan or EVM RPCs.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#030816] border border-[#132640] space-y-1.5">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Non-Custodial Private Key Sovereignty</span>
                  </div>
                  <p className="text-[#8fa1b8] text-xs leading-relaxed">
                    Users maintain sole cryptographic custody over their private keys at all times. Neither the protocol nor any operator can freeze, confiscate, or reassign user assets.
                  </p>
                </div>
              </div>

              {/* Rigorous Legal & Regulatory Disclaimer */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#01040d] border border-white/10 font-mono text-[11px] text-[#5c6d84] space-y-2">
                <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider text-[11px]">
                  <FileText size={15} className="text-[#00F0FF]" />
                  <span>REGULATORY & TECHNICAL DISCLAIMER</span>
                </div>
                <p className="leading-relaxed">
                  NARA Protocol consists of decentralized, non-custodial software deployed on the Base blockchain (Chain ID: 8453). $NARA tokens represent cryptographic utility credentials and coordinate identifiers within the NARA gaming and spatial coordination environment.
                </p>
                <p className="leading-relaxed">
                  Nothing within this application, documentation, or associated smart contracts constitutes an offer, solicitation, or recommendation to purchase securities, debt instruments, or collective investment schemes in any jurisdiction. Epoch resource settlements are programmatic software state changes governed by deterministic formulas. There is no promise, expectation, or guarantee of financial returns, capital gains, or passive yields. All interactions are executed entirely peer-to-peer and self-directed by the participant at their own discretion.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Modal Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 sm:px-8 py-3.5 sm:py-4 border-t border-white/10 bg-[#020612]/90 backdrop-blur-md font-mono text-xs">
          
          {/* Canonical Address Pill with Copy */}
          <div className="flex items-center gap-2 text-[#5c6d84] text-[11px]">
            <span className="hidden sm:inline">CANONICAL:</span>
            <span className="text-white font-mono select-all">0x91FB...Ae0f</span>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Copy canonical contract address"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
          </div>

          {/* Action Rail: Swap, Play Tile Game, Community, BaseScan */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Direct Swap Action */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onNavigate) onNavigate("/swap");
                else window.location.href = "/swap";
              }}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-[#00F0FF] hover:text-white border border-cyan-400/40 hover:border-cyan-400 font-bold transition-all focus:outline-none cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.2)] active:scale-95"
            >
              <span>SWAP $NARA</span>
              <ArrowUpRight size={13} weight="bold" />
            </button>

            {/* Play Tile Game Action */}
            <button
              type="button"
              onClick={() => {
                onClose();
                window.location.href = "/meme.html";
              }}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-white border border-emerald-500/30 hover:border-emerald-400 font-bold transition-all focus:outline-none cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.15)] active:scale-95"
            >
              <GameController size={14} weight="fill" />
              <span>PLAY TILE GAME</span>
            </button>

            {/* Telegram Community */}
            <a
              href={SOCIAL_LINKS.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#8fa1b8] hover:text-white border border-white/10 font-bold transition-all focus:outline-none no-underline cursor-pointer"
            >
              <TelegramLogo size={14} weight="fill" className="text-sky-400" />
              <span>COMMUNITY</span>
            </a>

            {/* BaseScan Explorer */}
            <a
              href={SOCIAL_LINKS.basescanToken}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[#8fa1b8] hover:text-white font-bold transition-all focus:outline-none no-underline cursor-pointer"
            >
              <span>BASESCAN</span>
              <ArrowUpRight size={13} weight="bold" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
