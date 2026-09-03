import NaraFace from "./NaraFace";
import { SOCIAL_LINKS } from "../lib/content";
import { ArrowUpRight, BookOpen, ShieldCheck } from "@phosphor-icons/react";

export default function HeroReticle() {
  return (
    <section className="relative pt-12 pb-16 overflow-hidden flex flex-col items-center text-center">
      {/* Structural Minimalist Header Title */}
      <div className="shell max-w-4xl mx-auto mb-8 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/[0.04] border border-white/10 font-mono text-[11px] text-silver uppercase tracking-widest mb-4">
          <span>DECENTRALIZED ARCHITECTURE // BASE 8453</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-black tracking-tight text-white leading-none mb-4">
          THE SOVEREIGN <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-silver via-white to-dim">
            LIQUIDITY INSTRUMENT.
          </span>
        </h1>

        <p className="text-dim font-mono text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed">
          1,000,000 fixed non-mintable supply. Zero inflation. Autonomous Uniswap v4 fee capture. Time-weighted commitment consensus on Base.
        </p>
      </div>

      {/* The Central Interactive Sovereign Cut NARA Face */}
      <div className="w-full relative z-20 my-2">
        <NaraFace />
      </div>

      {/* Primary Action Button Rail */}
      <div className="shell max-w-xl mx-auto mt-6 z-10 flex flex-wrap items-center justify-center gap-3 font-mono text-xs">
        <a
          href={SOCIAL_LINKS.swapApp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded bg-base-blue hover:bg-base-blue/90 text-white font-bold tracking-wider transition-all duration-200 shadow-glow"
        >
          <span>ENTER APP // SWAP</span>
          <ArrowUpRight size={16} weight="bold" />
        </a>

        <a
          href="#how-it-works"
          className="inline-flex items-center gap-2 px-5 py-3 rounded bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold transition-all duration-200"
        >
          <BookOpen size={16} weight="bold" />
          <span>HOW IT WORKS</span>
        </a>

        <a
          href={SOCIAL_LINKS.noobGuide}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-3 rounded bg-surface hover:bg-surface/80 text-emerald-400 border border-emerald-500/30 font-semibold transition-all duration-200"
        >
          <ShieldCheck size={16} weight="bold" />
          <span>DOCUMENTATION</span>
        </a>
      </div>
    </section>
  );
}
