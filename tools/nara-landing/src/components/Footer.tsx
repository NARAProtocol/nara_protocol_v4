import { SOCIAL_LINKS } from "../lib/content";
import { ArrowSquareOut } from "@phosphor-icons/react";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-void/90 py-12">
      <div className="shell flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        {/* Left Col: Brand Logo Only */}
        <div>
          <div className="flex items-center mb-3">
            <img 
              src="/nara-logo.svg" 
              alt="NARA" 
              className="w-9 h-9 opacity-90" 
            />
          </div>

          <p className="text-muted font-mono text-xs max-w-md leading-relaxed">
            Autonomous Uniswap v4 Hook and time-weighted commitment consensus. Non-custodial, fixed 1,000,000 supply, zero upgradeability proxies.
          </p>
        </div>

        {/* Right Col: Authoritative Ecosystem Links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 font-mono text-xs">
          <div>
            <div className="text-silver font-bold mb-2">EXPLORERS</div>
            <ul className="space-y-1.5 text-dim">
              <li>
                <a href={SOCIAL_LINKS.basescanToken} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                  <span>BaseScan Token</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.basescanEngine} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                  <span>BaseScan Engine</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.dexscreener} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                  <span>DexScreener</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-silver font-bold mb-2">VERIFICATION</div>
            <ul className="space-y-1.5 text-dim">
              <li>
                <a href={SOCIAL_LINKS.uniswapHooklistPr} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1 text-emerald-400">
                  <span>Uniswap Hook #1643</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.defillamaPr} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                  <span>DefiLlama PR #20841</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                  <span>GitHub Repository</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-silver font-bold mb-2">COMMUNITY</div>
            <ul className="space-y-1.5 text-dim">
              <li>
                <a href={SOCIAL_LINKS.farcaster} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                  <span>Farcaster</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
                  <span>X / Twitter</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
              <li>
                <a href={SOCIAL_LINKS.swapApp} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1 text-base-blue font-bold">
                  <span>Launch Swap App</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
