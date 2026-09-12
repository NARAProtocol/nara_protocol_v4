import { useState, useEffect } from "react";
import { 
  X, 
  Compass, 
  HourglassMedium, 
  SquaresFour, 
  ShieldCheck, 
  ArrowUpRight, 
  TelegramLogo,
  CheckCircle,
  Flame,
  ArrowsClockwise,
  Coins,
  Lightning,
  ClockAfternoon
} from "@phosphor-icons/react";
import { SOCIAL_LINKS } from "../lib/content";

interface VisionModalProps {
  onClose: () => void;
}

export default function VisionModal({ onClose }: VisionModalProps) {
  const [activeTab, setActiveTab] = useState<"continent" | "pulse" | "roadmap" | "longevity">("continent");

  // Close on ESC key press (parity with LegalModal dismissal behavior)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-2xl animate-fadeIn">
      {/* Double-Bezel Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-surface/95 border border-white/15 ring-1 ring-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/10 bg-black/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img src="/nara-logo-transparent.png" alt="NARA" className="w-7 h-7 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
            <div>
              <div className="font-mono text-xs font-bold tracking-widest text-silver uppercase flex items-center gap-2">
                <span>THE SOVEREIGN BLUEPRINT</span>
                <span className="text-white/20">|</span>
                <span className="text-cyan-400 font-semibold text-[10px]">VISION & ARCHITECTURE</span>
              </div>
              <div className="font-mono text-[10px] text-muted tracking-wide hidden sm:block">
                Autonomous Fixed-Supply Wealth Engine on Base (Chain ID: 8453)
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-silver hover:text-white transition-colors focus:outline-none"
            aria-label="Close modal"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Tab Navigation Rail */}
        <div className="flex items-center gap-2 px-6 sm:px-8 py-3 border-b border-white/5 bg-black/40 overflow-x-auto no-scrollbar font-mono text-xs">
          <button
            onClick={() => setActiveTab("continent")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none ${
              activeTab === "continent"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.2)] font-bold"
                : "text-dim hover:text-silver hover:bg-white/5"
            }`}
          >
            <Compass size={15} weight="bold" />
            <span>01 // THE CONTINENT</span>
          </button>

          <button
            onClick={() => setActiveTab("pulse")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none ${
              activeTab === "pulse"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.2)] font-bold"
                : "text-dim hover:text-silver hover:bg-white/5"
            }`}
          >
            <HourglassMedium size={15} weight="bold" />
            <span>02 // PULSE & SACRIFICE</span>
          </button>

          <button
            onClick={() => setActiveTab("roadmap")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none ${
              activeTab === "roadmap"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.2)] font-bold"
                : "text-dim hover:text-silver hover:bg-white/5"
            }`}
          >
            <SquaresFour size={15} weight="bold" />
            <span>03 // ECOSYSTEM MATRIX</span>
          </button>

          <button
            onClick={() => setActiveTab("longevity")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-200 whitespace-nowrap focus:outline-none ${
              activeTab === "longevity"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.2)] font-bold"
                : "text-dim hover:text-silver hover:bg-white/5"
            }`}
          >
            <ShieldCheck size={15} weight="bold" />
            <span>04 // LONGEVITY & SAFETY</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 p-6 sm:p-8 overflow-y-auto font-sans text-xs sm:text-sm leading-relaxed space-y-6 text-silver/90 bg-void/80">
          
          {/* TAB 1: THE CONTINENT */}
          {activeTab === "continent" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-cyan-400 font-bold uppercase tracking-widest">
                  PILLAR 01 // VISUAL DISTRIBUTION FOR NARA SUPREMACY
                </div>
                <h3 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
                  A Fairer World. Built by People.
                </h3>
                <p className="text-dim">
                  Most token distributions fail because they treat participants as exit liquidity—printing trillions of tokens, giving 80% to insiders, and dumping on the public. NARA was designed to break this cycle forever through an interactive, sovereign gaming continent.
                </p>
              </div>

              {/* The 1 Token = 1 Tile Box */}
              <div className="p-5 rounded-2xl bg-surface/90 border border-white/10 space-y-4">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-white uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span>The 1 Token = 1 Sovereign Tile Parity</span>
                </div>
                <p className="text-dim text-xs leading-relaxed">
                  We mapped the protocol to a living 3D continent of exactly <strong className="text-white">1,000,000 coordinates</strong> (a 1,000 × 1,000 matrix). The total supply of NARA is mathematically capped at exactly <strong className="text-white">1,000,000 NARA</strong> forever. There is no mint function. No team member, algorithm, or entity can ever spawn a 1,000,001st tile.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono text-xs">
                  <div className="p-3.5 rounded-xl bg-black/50 border border-white/5 space-y-1">
                    <div className="text-muted text-[10px] uppercase">1 NARA LOCKED</div>
                    <div className="font-bold text-silver">1 Sovereign Tile</div>
                    <div className="text-[10px] text-dim">Individual Beacon</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-black/50 border border-cyan-400/20 space-y-1">
                    <div className="text-muted text-[10px] uppercase">100 NARA LOCKED</div>
                    <div className="font-bold text-cyan-300">100-Tile District</div>
                    <div className="text-[10px] text-dim">Fortified Territory</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-1">
                    <div className="text-muted text-[10px] uppercase">1,000 NARA LOCKED</div>
                    <div className="font-bold text-white">1,000-Tile Sector</div>
                    <div className="text-[10px] text-dim">Sovereign Province</div>
                  </div>
                </div>
              </div>

              {/* Locking is Claiming */}
              <div className="p-5 rounded-2xl bg-surface/90 border border-white/10 space-y-3">
                <h4 className="font-mono text-xs font-bold text-silver uppercase tracking-wider flex items-center gap-2">
                  <Lightning size={16} className="text-cyan-400" weight="fill" />
                  <span>How Territory Is Claimed: Buy & Lock to Ignite</span>
                </h4>
                <p className="text-dim text-xs leading-relaxed">
                  Holding loose tokens idle in a wallet leaves you off the Sovereign Grid. To claim territory, players <strong className="text-white">buy NARA and lock it</strong> inside the autonomous Engine. Locking ignites your coordinates on the map, erects your beacon, and immediately qualifies your position for ongoing 15-minute epoch distributions.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: PULSE & SACRIFICE */}
          {activeTab === "pulse" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-cyan-400 font-bold uppercase tracking-widest">
                  PILLAR 02 // TIME-WEIGHTED REWARD ARCHITECTURE
                </div>
                <h3 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
                  The 15-Minute Pulse & The Sacrificial Law
                </h3>
                <p className="text-dim">
                  The protocol does not rely on static promises. It advances via an autonomous 900-second on-chain heartbeat.
                </p>
              </div>

              {/* 15-Minute Pulse Detail */}
              <div className="p-5 rounded-2xl bg-surface/90 border border-white/10 space-y-3">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-white uppercase tracking-wider">
                  <ArrowsClockwise size={16} className="text-cyan-400 animate-spin" />
                  <span>96 Discrete Cycles Every 24 Hours (All Protocol Inflows)</span>
                </div>
                <p className="text-dim text-xs leading-relaxed">
                  Every 15 minutes, the Engine settles an epoch. It distributes rule-based allocations from the sealed 650,000 NARA reserve along with <strong className="text-white">all protocol-generated fees across the entire ecosystem</strong>:
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <span className="text-cyan-400 font-bold">SWAP VOLATILITY</span>
                    <p className="text-dim text-[11px] font-sans">Dynamic Hook fees captured from arbitrage & DEX trade volume.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <span className="text-silver font-bold">ETH & TOKEN FEEDS</span>
                    <p className="text-dim text-[11px] font-sans">Native ETH via `notifyEthRewards` and ERC-20s (USDC) via `notifyTokenRewards`.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <span className="text-white font-bold">FLASH & APP REVENUE</span>
                    <p className="text-dim text-[11px] font-sans">Singleton flash accounting fees and future game/ecosystem inflows.</p>
                  </div>
                </div>
              </div>

              {/* Sacrificial Law Detail */}
              <div className="p-5 rounded-2xl bg-gradient-to-b from-rose-950/20 to-surface/90 border border-rose-500/20 space-y-3">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-rose-400 uppercase tracking-wider">
                  <Flame size={16} weight="fill" />
                  <span>The Sacrificial Law: Dead Beacons Feed the Living</span>
                </div>
                <p className="text-dim text-xs leading-relaxed">
                  In conventional crypto, when impatient holders panic and sell, they crash the price for everyone else. In NARA, <strong className="text-white">sellers surrender their future allocation share to the committed survivors</strong>:
                </p>
                <ul className="space-y-2.5 text-xs text-silver/80">
                  <li className="flex items-start gap-2.5">
                    <span className="text-rose-400 font-bold">•</span>
                    <span>When an unlock occurs, that user's Position NFT is <strong className="text-white">permanently burned (`_burn`) from the blockchain forever</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-rose-400 font-bold">•</span>
                    <span>Their position weight is immediately stripped from active network weight (the denominator in the distribution formula).</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>Because the Engine's 15-minute emission rate continues uninterrupted, <strong className="text-emerald-300">the per-tile reward share of every remaining locked participant automatically increases</strong>.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: ECOSYSTEM MATRIX */}
          {activeTab === "roadmap" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-cyan-400 font-bold uppercase tracking-widest">
                  PILLAR 03 // STAGED ECOSYSTEM ARCHITECTURE
                </div>
                <h3 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
                  Every Road Routes Value Home to the Grid
                </h3>
                <p className="text-dim">
                  NARA is not an isolated token. It is a multi-layered economic matrix where all future products funnel fee capture back into locked holders.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Position NFTs */}
                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>POSITION NFTs (NARAPOS)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PHASE 2</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    100% on-chain SVG machine relics. When participants want liquidity, they do not dump NARA on Uniswap. Instead, they trade their yield-bearing Position NFT on secondary markets. <strong className="text-white">Liquidity is unlocked with zero sell pressure on the token.</strong>
                  </p>
                </div>

                {/* veBaskets */}
                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>veBASKETS (CATEGORY INDICES)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">PREVIEW</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    Thematic index baskets on Base (CORE, AI, FINANCE, CULTURE). Mint and burn rebalancing fees and protocol liquidity route directly through NARA, capturing ecosystem volume for the Engine.
                  </p>
                </div>

                {/* Uniswap v4 Hook & Fee Transfer */}
                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>UNISWAP v4 DYNAMIC HOOK</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">ACTIVE #2088</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    Dynamic fee curve capturing arbitrage and swap volatility into protocol reserves. As Protocol-Owned Liquidity (POL) reaches self-sustaining depth, accumulated fee capture channels directly into active grid allocations.
                  </p>
                </div>

                {/* Genesis Bonds */}
                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                    <span>GENESIS BONDS</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">INACTIVE / PLANNED</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    Bonds are built for commitment, not selling. Bond buyers acquire discounted NARA that is delivered pre-locked into vesting Position NFTs, locking supply into the grid rather than creating liquid sell pressure.
                  </p>
                </div>
              </div>

              {/* Future Apps & Flash Accounting */}
              <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                <div className="flex items-center justify-between font-mono text-xs font-bold text-white">
                  <div className="flex items-center gap-2">
                    <Coins size={15} className="text-cyan-400" />
                    <span>FUTURE APPS & PERPETUAL REPLENISHMENT</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-400/20">ETERNAL</span>
                </div>
                <p className="text-dim text-xs leading-relaxed">
                  Any future game, decentralized application, or external liquidity pool built on NARA routes its revenue directly into the Engine via open reward deposit functions (`depositRewards`), perpetually funding active beacons on the grid.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: LONGEVITY & SAFETY */}
          {activeTab === "longevity" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="font-mono text-[11px] text-cyan-400 font-bold uppercase tracking-widest">
                  PILLAR 04 // BANK-GRADE SECURITY & LIFETIME HORIZON
                </div>
                <h3 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
                  Engineered for Decades. Impossible to Rug.
                </h3>
                <p className="text-dim">
                  Security is not a marketing promise—it is mathematically hardcoded into immutable Solidity bytecode.
                </p>
              </div>

              {/* Longevity Banner */}
              <div className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-400/20 space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  <ClockAfternoon size={16} />
                  <span>Decades-Long Operational Horizon (175,200+ Epochs)</span>
                </div>
                <p className="text-dim text-xs leading-relaxed">
                  The initial sealed reserve of 650,000 NARA follows an asymptotic epoch decay curve engineered to sustain allocations over years (up to 175,200 lock epochs). As baseline emissions mature, autonomous fee capture from the Uniswap v4 Hook, veBaskets, and open reward replenishment (`depositRewards`) transition the Sovereign Grid into a multi-decade self-funding wealth engine.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Zero Upgrade Proxies</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    `NARAEngine.sol` and `$NARA` contain no proxy patterns. Code is immutable. No developer or multisig can alter contract logic or inflate the 1,000,000 token cap.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Sealed Reward Reserve</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    The 650,000 NARA reserve in `NARARewardReserve.sol` contains zero admin withdrawal functions. NARA sweeping is explicitly forbidden (`NaraSweepForbidden`). Funds release strictly via mathematical epoch formulas.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Isolated Smart Accounts</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    Every position owns its own dedicated EIP-1167 clone account. User funds are segregated and never pooled into a monolithic honeypot contract.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface/90 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-white">
                    <CheckCircle size={15} weight="fill" className="text-emerald-400" />
                    <span>Perpetual Replenishment</span>
                  </div>
                  <p className="text-dim text-xs leading-relaxed">
                    The Engine provides open reward deposition (`depositRewards`), allowing any entity or application to replenish NARA allocations indefinitely without protocol governance gates.
                  </p>
                </div>
              </div>

              {/* Disclaimers & Transparency Note */}
              <div className="p-4 rounded-2xl bg-black/60 border border-white/5 font-mono text-[11px] text-muted space-y-1">
                <div className="text-silver font-bold uppercase tracking-wider">LEGAL & NON-CUSTODIAL COMPLIANCE</div>
                <p>
                  NARA Protocol is autonomous, non-custodial software deployed on Base (Chain ID 8453). Rule-based allocations depend on network participation, trading fees, and time-weighted commitment. There are no guaranteed returns, profits, or interest. All interactions are peer-to-peer and self-directed.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Modal Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-8 py-4 border-t border-white/10 bg-black/70 backdrop-blur-md font-mono text-xs">
          <div className="flex items-center gap-2 text-dim text-[11px]">
            <span>VERIFIED BASE CONTRACTS</span>
            <span className="text-white/20">•</span>
            <span className="text-silver">CA: 0xB633...19c1</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <a
              href={SOCIAL_LINKS.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-400/30 font-bold transition-colors focus:outline-none"
            >
              <TelegramLogo size={14} weight="fill" />
              <span>JOIN TELEGRAM</span>
            </a>

            <a
              href={SOCIAL_LINKS.swapApp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-base-blue hover:bg-base-blue/90 text-white font-bold transition-all shadow-glow focus:outline-none"
            >
              <span>ENTER APP</span>
              <ArrowUpRight size={14} weight="bold" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
