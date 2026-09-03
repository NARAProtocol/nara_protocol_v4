import { useState } from "react";
import { Info, ArrowUpRight, Flame, HourglassMedium, ShieldCheck } from "@phosphor-icons/react";
import { SOCIAL_LINKS } from "../lib/content";

export default function PrimitivesGrid() {
  const [activeInfo, setActiveInfo] = useState<number | null>(null);

  const toggleInfo = (index: number) => {
    setActiveInfo(activeInfo === index ? null : index);
  };

  return (
    <section id="how-it-works" className="shell my-16 scroll-mt-20">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/[0.03] border border-white/10 font-mono text-[11px] text-silver uppercase tracking-widest mb-3">
          <span>ONCHAIN MECHANISMS</span>
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-black text-white tracking-tight">
          HOW NARA OPERATES
        </h2>
        <p className="text-dim text-xs sm:text-sm font-mono mt-3 max-w-xl mx-auto leading-relaxed">
          Autonomous smart contract rules executed purely on the Base blockchain. No discretionary human operators, zero upgradeability proxies.
        </p>
      </div>

      {/* 3 Core Pillars: Scarcity, Time, Weight Transfer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* PILLAR 1: FIXED SCARCITY */}
        <div className="p-6 rounded-xl border border-white/10 bg-surface/60 backdrop-blur-md flex flex-col justify-between hover:border-white/30 transition-colors group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-silver">
                PRIMITIVE 01 // SCARCITY
              </span>
              <button
                onClick={() => toggleInfo(1)}
                className="p-1 rounded text-muted hover:text-white transition-colors"
                title="Technical Specifications"
              >
                <Info size={16} weight="bold" />
              </button>
            </div>

            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-silver mb-4">
              <ShieldCheck size={22} weight="duotone" />
            </div>

            <h3 className="font-display text-xl font-bold text-white mb-2">
              Fixed 1,000,000 Cap
            </h3>

            <p className="text-xs text-dim leading-relaxed font-sans mb-4">
              Immutable total supply sealed at genesis. The smart contract has zero minting functions, zero owner privileges to create tokens, and zero inflationary dilution.
            </p>

            {activeInfo === 1 && (
              <div className="p-3 rounded bg-black/50 border border-white/10 font-mono text-[11px] text-muted space-y-1 mb-4">
                <div>• Total Supply: <span className="text-silver">1,000,000.000000000000000000</span></div>
                <div>• Mint Function: <span className="text-emerald-400">None (Hardcoded)</span></div>
                <div>• Verified Contract: <a href={SOCIAL_LINKS.basescanToken} target="_blank" rel="noopener noreferrer" className="text-base-blue underline">BaseScan Explorer</a></div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between font-mono text-xs text-muted">
            <span>MAX CEILING</span>
            <span className="text-silver font-bold">1,000,000 NARA</span>
          </div>
        </div>

        {/* PILLAR 2: 15-MINUTE CLOCKWORK */}
        <div className="p-6 rounded-xl border border-white/10 bg-surface/60 backdrop-blur-md flex flex-col justify-between hover:border-white/30 transition-colors group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-silver">
                PRIMITIVE 02 // CADENCE
              </span>
              <button
                onClick={() => toggleInfo(2)}
                className="p-1 rounded text-muted hover:text-white transition-colors"
                title="Technical Specifications"
              >
                <Info size={16} weight="bold" />
              </button>
            </div>

            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-silver mb-4">
              <HourglassMedium size={22} weight="duotone" />
            </div>

            <h3 className="font-display text-xl font-bold text-white mb-2">
              15-Minute Epochs
            </h3>

            <p className="text-xs text-dim leading-relaxed font-sans mb-4">
              Discrete cyclical consensus. Every 15 minutes (900 seconds), the staking engine computes epoch fee distributions according to time-weighted quadratic commitment rules.
            </p>

            {activeInfo === 2 && (
              <div className="p-3 rounded bg-black/50 border border-white/10 font-mono text-[11px] text-muted space-y-1 mb-4">
                <div>• Duration: <span className="text-silver">900 seconds (15 min)</span></div>
                <div>• Frequency: <span className="text-silver">96 Epochs Daily</span></div>
                <div>• Engine: <a href={SOCIAL_LINKS.basescanEngine} target="_blank" rel="noopener noreferrer" className="text-base-blue underline">NARAEngine.sol</a></div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between font-mono text-xs text-muted">
            <span>CADENCE</span>
            <span className="text-silver font-bold">96 EPOCHS / DAY</span>
          </div>
        </div>

        {/* PILLAR 3: SACRIFICIAL WEIGHT TRANSFER */}
        <div className="p-6 rounded-xl border border-white/10 bg-surface/60 backdrop-blur-md flex flex-col justify-between hover:border-white/30 transition-colors group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-silver">
                PRIMITIVE 03 // DYNAMICS
              </span>
              <button
                onClick={() => toggleInfo(3)}
                className="p-1 rounded text-muted hover:text-white transition-colors"
                title="Mechanism Disclosure"
              >
                <Info size={16} weight="bold" />
              </button>
            </div>

            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-silver mb-4">
              <Flame size={22} weight="duotone" />
            </div>

            <h3 className="font-display text-xl font-bold text-white mb-2">
              Weight Redistribution
            </h3>

            <p className="text-xs text-dim leading-relaxed font-sans mb-4">
              When a position is unlocked, its bearer NFT is permanently executed and burned onchain. As total network weight decreases, remaining active positions represent a proportionally larger share of epoch distributions.
            </p>

            {activeInfo === 3 && (
              <div className="p-3 rounded bg-black/50 border border-white/10 font-mono text-[11px] text-muted space-y-1 mb-4">
                <div>• Unlock behavior: <span className="text-rose-400">Position NFT Burned</span></div>
                <div>• Network effect: <span className="text-silver">Total Weight Contracts</span></div>
                <div>• Active positions: <span className="text-emerald-400">Proportional Share Expands</span></div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between font-mono text-xs text-muted">
            <span>EQUILIBRIUM</span>
            <span className="text-silver font-bold">NON-CUSTODIAL</span>
          </div>
        </div>
      </div>

      {/* Factual Mechanics Breakdown: Exit vs Commitment */}
      <div className="p-8 rounded-2xl border border-white/10 bg-surface/40 backdrop-blur-md">
        <div className="text-center max-w-xl mx-auto mb-8">
          <span className="font-mono text-xs text-dim uppercase tracking-wider">ONCHAIN CONSENSUS DYNAMICS</span>
          <h3 className="text-xl sm:text-2xl font-display font-black text-white mt-1">
            Mathematical Balance of Commitment
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          {/* Unlocking / Burn Tile */}
          <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="text-silver font-bold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>POSITION EXIT & BURN</span>
            </div>
            <ul className="space-y-2 text-dim leading-relaxed">
              <li>• Positions may unlock when their lock duration reaches maturity.</li>
              <li>• Unlocking executes an irrevocable onchain burn (`_burn(tokenId)`).</li>
              <li>• The position's weight is immediately subtracted from active network weight.</li>
            </ul>
          </div>

          {/* Active Commitment Tile */}
          <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="text-silver font-bold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>ACTIVE PARTICIPATION</span>
            </div>
            <ul className="space-y-2 text-dim leading-relaxed">
              <li>• Active positions maintain time-weighted quadratic consensus weight.</li>
              <li>• When other participants exit, overall denominator weight contracts.</li>
              <li>• Remaining active stakers automatically retain a larger proportional share of epoch fee distributions.</li>
            </ul>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="mt-8 text-center">
          <a
            href={SOCIAL_LINKS.noobGuide}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-mono text-dim hover:text-white underline underline-offset-4 transition-colors"
          >
            <span>Review Full Architectural Specifications in Documentation</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
