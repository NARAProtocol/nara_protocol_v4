import { SOCIAL_LINKS } from "../lib/content";
import { ArrowUpRight } from "@phosphor-icons/react";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-void/80 backdrop-blur-xl">
      <div className="shell flex h-16 items-center justify-between">
        {/* Brand: ONLY Logo, NO name text */}
        <div className="flex items-center">
          <a href="/" className="flex items-center group" aria-label="NARA Protocol">
            <img 
              src="/nara-logo.svg" 
              alt="NARA" 
              className="w-10 h-10 transition-transform duration-200 group-hover:scale-105"
            />
          </a>
        </div>

        {/* Useful Protocol Navigation (Clean & Intentional) */}
        <nav className="hidden md:flex items-center gap-6 font-mono text-xs">
          <a
            href={SOCIAL_LINKS.publicDocs}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dim hover:text-white transition-colors"
          >
            DOCUMENTATION
          </a>

          <a
            href={SOCIAL_LINKS.basescanToken}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dim hover:text-white transition-colors"
          >
            EXPLORER
          </a>

          <a
            href={SOCIAL_LINKS.dexscreener}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dim hover:text-white transition-colors"
          >
            ANALYTICS
          </a>

          <a
            href={SOCIAL_LINKS.uniswapHooklistPr}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/40 transition-colors"
          >
            <span>HOOKLIST #1643</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </a>
        </nav>

        {/* Primary Action Button */}
        <div className="flex items-center gap-3">
          <a
            href={SOCIAL_LINKS.swapApp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-base-blue hover:bg-base-blue/90 text-white font-mono text-xs font-bold tracking-wider transition-all duration-200 shadow-glow"
          >
            <span>ENTER APP</span>
            <ArrowUpRight size={14} weight="bold" />
          </a>
        </div>
      </div>
    </header>
  );
}
