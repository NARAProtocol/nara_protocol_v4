import { SOCIAL_LINKS } from "../lib/content";
import { ArrowSquareOut } from "@phosphor-icons/react";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-void/90 py-12">
      <div className="shell flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-8">
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
            Autonomous Uniswap v4 Dynamic Hook and time-weighted commitment consensus. Non-custodial, fixed 1,000,000 supply, zero upgradeability proxies on Base.
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
                  <span>Enter App</span>
                  <ArrowSquareOut size={11} />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Mandatory Legal, Risk & Communications Disclaimer */}
      <div className="shell pt-6 border-t border-white/5 font-mono text-[11px] text-muted space-y-2">
        <p className="leading-relaxed">
          <strong className="text-silver font-bold">Regulatory & Risk Notice:</strong> NARA is experimental, decentralized open-source software deployed on the Base blockchain. Nothing contained herein constitutes financial, legal, tax, or investment advice, nor an offer, invitation, or solicitation to purchase crypto-assets. Interacting with smart contracts involves substantial risk, including total loss of capital. Protocol actions are entirely self-directed and non-custodial.
        </p>
        <div className="flex flex-wrap gap-4 pt-1 text-dim">
          <a 
            href="https://github.com/NARAProtocol/nara_protocol/blob/main/LEGAL.md" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-white underline underline-offset-2"
          >
            Legal Notice & Jurisdictional Disclosure
          </a>
          <span>•</span>
          <a 
            href="https://github.com/NARAProtocol/nara_protocol/blob/main/docs/Risk_Assessment.md" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-white underline underline-offset-2"
          >
            Comprehensive Risk Assessment
          </a>
          <span>•</span>
          <a 
            href="https://github.com/NARAProtocol/nara_protocol/blob/main/docs/ADMIN_POWERS.md" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-white underline underline-offset-2"
          >
            Admin Powers & Timelock Transparency
          </a>
        </div>
      </div>
    </footer>
  );
}
