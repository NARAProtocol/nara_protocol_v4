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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/[0.03] border border-white/10 font-mono text-[11px] text-nara-gold uppercase tracking-widest mb-3">
          <span>THE UNBEATABLE MOAT</span>
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-black text-white tracking-tight">
          HOW NARA WORKS
        </h2>
        <p className="text-dim text-xs sm:text-sm font-mono mt-3 max-w-xl mx-auto leading-relaxed">
          No PhD required. How a simple, unyielding mathematical game turns patience into an unstoppable advantage.
        </p>
      </div>

      {/* 3 Core Pillars in Layman Terms */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* PILLAR 1: FIXED SCARCITY */}
        <div className="p-6 rounded-xl border border-white/10 bg-surface/60 backdrop-blur-md flex flex-col justify-between hover:border-white/30 transition-colors group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-silver">
                RULE 01 // SCARCITY
              </span>
              <button
                onClick={() => toggleInfo(1)}
                className="p-1 rounded text-muted hover:text-white transition-colors"
                title="Contract Proof"
              >
                <Info size={16} weight="bold" />
              </button>
            </div>

            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-silver mb-4">
              <ShieldCheck size={22} weight="duotone" />
            </div>

            <h3 className="font-display text-xl font-bold text-white mb-2">
              No Printing Press. Ever.
            </h3>

            <p className="text-xs text-dim leading-relaxed font-sans mb-4">
              Most crypto tokens print billions of new coins to dump on you. NARA is capped at exactly <strong>1,000,000 tokens</strong> forever. There is no mint function, zero venture capital unlocks, and zero inflation.
            </p>

            {activeInfo === 1 && (
              <div className="p-3 rounded bg-black/50 border border-white/10 font-mono text-[11px] text-muted space-y-1 mb-4">
                <div>• Supply: <span className="text-silver">1,000,000.000000000000000000</span></div>
                <div>• Mint Function: <span className="text-emerald-400">NONE (Code Sealed)</span></div>
                <div>• Verified on BaseScan: <a href={SOCIAL_LINKS.basescanToken} target="_blank" rel="noopener noreferrer" className="text-base-blue underline">View Contract</a></div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between font-mono text-xs text-muted">
            <span>MAX CAP</span>
            <span className="text-silver font-bold">1,000,000 NARA</span>
          </div>
        </div>

        {/* PILLAR 2: 15-MINUTE CLOCKWORK */}
        <div className="p-6 rounded-xl border border-white/10 bg-surface/60 backdrop-blur-md flex flex-col justify-between hover:border-white/30 transition-colors group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-silver">
                RULE 02 // TIME
              </span>
              <button
                onClick={() => toggleInfo(2)}
                className="p-1 rounded text-muted hover:text-white transition-colors"
                title="Contract Proof"
              >
                <Info size={16} weight="bold" />
              </button>
            </div>

            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-silver mb-4">
              <HourglassMedium size={22} weight="duotone" />
            </div>

            <h3 className="font-display text-xl font-bold text-white mb-2">
              96 Payouts Every Day.
            </h3>

            <p className="text-xs text-dim leading-relaxed font-sans mb-4">
              Time is money. Every 15 minutes (900 seconds), the blockchain calculates protocol trading fees and streams real rewards directly to committed holders around the clock.
            </p>

            {activeInfo === 2 && (
              <div className="p-3 rounded bg-black/50 border border-white/10 font-mono text-[11px] text-muted space-y-1 mb-4">
                <div>• Interval: <span className="text-silver">900 seconds (15 min)</span></div>
                <div>• Daily Cadence: <span className="text-silver">96 Epochs / Day</span></div>
                <div>• Engine: <a href={SOCIAL_LINKS.basescanEngine} target="_blank" rel="noopener noreferrer" className="text-base-blue underline">View Staking Engine</a></div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between font-mono text-xs text-muted">
            <span>FREQUENCY</span>
            <span className="text-silver font-bold">EVERY 15 MIN</span>
          </div>
        </div>

        {/* PILLAR 3: THE SACRIFICIAL LAW (THE MOAT) */}
        <div className="p-6 rounded-xl border border-nara-gold/30 bg-nara-gold/[0.03] backdrop-blur-md flex flex-col justify-between hover:border-nara-gold/60 transition-colors group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs font-bold text-nara-gold">
                RULE 03 // THE MOAT
              </span>
              <button
                onClick={() => toggleInfo(3)}
                className="p-1 rounded text-muted hover:text-white transition-colors"
                title="Mechanism Disclosure"
              >
                <Info size={16} weight="bold" />
              </button>
            </div>

            <div className="w-10 h-10 rounded-lg bg-nara-gold/10 border border-nara-gold/20 flex items-center justify-center text-nara-gold mb-4">
              <Flame size={22} weight="duotone" />
            </div>

            <h3 className="font-display text-xl font-bold text-white mb-2">
              Panic Sellers Feed You.
            </h3>

            <p className="text-xs text-dim leading-relaxed font-sans mb-4">
              When an impatient staker panic-sells, their onchain position is <strong>permanently destroyed and burned</strong>. Their future rewards don't vanish—<strong>they are automatically transferred directly to the patient holders who remained.</strong>
            </p>

            {activeInfo === 3 && (
              <div className="p-3 rounded bg-black/50 border border-white/10 font-mono text-[11px] text-muted space-y-1 mb-4">
                <div>• Action on exit: <span className="text-rose-400">Position Burned Forever</span></div>
                <div>• Consequence: <span className="text-emerald-400">Network Weight Shrinks</span></div>
                <div>• Result: <span className="text-silver">Remaining Yield Shares Multiply</span></div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between font-mono text-xs text-muted">
            <span>THE DYNAMIC</span>
            <span className="text-nara-gold font-bold">YIELD AUTO-SPIKES</span>
          </div>
        </div>
      </div>

      {/* The Curiosity Trap: Visual Paper-Hands vs Patient Survivor Comparison */}
      <div className="p-8 rounded-2xl border border-white/10 bg-surface/40 backdrop-blur-md">
        <div className="text-center max-w-xl mx-auto mb-8">
          <span className="font-mono text-xs text-dim uppercase tracking-wider">THE GAME-THEORETIC REALITY</span>
          <h3 className="text-xl sm:text-2xl font-display font-black text-white mt-1">
            Every Exit is a Direct Gift to the Survivors.
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          {/* Panic Seller Box */}
          <div className="p-6 rounded-xl border border-rose-500/20 bg-rose-500/[0.03]">
            <div className="text-rose-400 font-bold mb-3 flex items-center gap-2">
              <span>✕</span>
              <span>THE PANIC SELLER</span>
            </div>
            <ul className="space-y-2 text-dim">
              <li>• Unlocks early when prices fluctuate.</li>
              <li>• Onchain position is permanently burned from the network.</li>
              <li>• Forfeits all future 15-minute reward streams forever.</li>
            </ul>
          </div>

          {/* Patient Survivor Box */}
          <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04]">
            <div className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
              <span>✓</span>
              <span>THE PATIENT SURVIVOR</span>
            </div>
            <ul className="space-y-2 text-dim">
              <li>• Holds their ground across time epochs.</li>
              <li>• As panic sellers burn out, total network weight drops.</li>
              <li>• <strong>Your reward percentage AUTOMATICALLY DOUBLES or TRIPLES without spending an extra dollar.</strong></li>
            </ul>
          </div>
        </div>

        {/* Action Link to the Full Beginner Guide */}
        <div className="mt-8 text-center">
          <a
            href={SOCIAL_LINKS.noobGuide}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-mono text-silver hover:text-white underline underline-offset-4 transition-colors"
          >
            <span>Read the full Beginner's Guide on GitHub</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
