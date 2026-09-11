import { useState, useEffect } from "react";
import { SOCIAL_LINKS, PROTOCOL_CONSTANTS } from "../lib/content";
import LegalModal from "./LegalModal";
import { useGrid } from "../context/GridContext";
import { 
  TelegramLogo, 
  TwitterLogo, 
  GithubLogo, 
  ShieldCheck, 
  ArrowsClockwise, 
  Heart 
} from "@phosphor-icons/react";

export interface FooterProps {
  /** Optional external handler to open Legal Modal. If omitted, Footer manages LegalModal internally. */
  onOpenLegal?: () => void;
  className?: string;
}

function MetaMaskFoxIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg 
      fill="none" 
      viewBox="0 0 35 33" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0`}
    >
      <g strokeLinecap="round" strokeLinejoin="round" strokeWidth=".25">
        <path d="m32.9582 1-13.1341 9.7183 2.4424-5.72731z" fill="#e17726" stroke="#e17726"/>
        <g fill="#e27625" stroke="#e27625">
          <path d="m2.66296 1 13.01714 9.809-2.3254-5.81802z"/>
          <path d="m28.2295 23.5335-3.4947 5.3386 7.4829 2.0603 2.1436-7.2823z"/>
          <path d="m1.27281 23.6501 2.13055 7.2823 7.46994-2.0603-3.48166-5.3386z"/>
          <path d="m10.4706 14.5149-2.0786 3.1358 7.405.3369-.2469-7.969z"/>
          <path d="m25.1505 14.5149-5.1575-4.58704-.1688 8.05974 7.4049-.3369z"/>
          <path d="m10.8733 28.8721 4.4819-2.1639-3.8583-3.0062z"/>
          <path d="m20.2659 26.7082 4.4689 2.1639-.6105-5.1701z"/>
        </g>
        <path d="m24.7348 28.8721-4.469-2.1639.3638 2.9025-.039 1.231z" fill="#d5bfb2" stroke="#d5bfb2"/>
        <path d="m10.8732 28.8721 4.1572 1.9696-.026-1.231.3508-2.9025z" fill="#d5bfb2" stroke="#d5bfb2"/>
        <path d="m15.1084 21.7842-3.7155-1.0884 2.6243-1.2051z" fill="#233447" stroke="#233447"/>
        <path d="m20.5126 21.7842 1.0913-2.2935 2.6372 1.2051z" fill="#233447" stroke="#233447"/>
        <path d="m10.8733 28.8721.6495-5.3386-4.13117.1167z" fill="#cc6228" stroke="#cc6228"/>
        <path d="m24.0982 23.5335.6366 5.3386 3.4946-5.2219z" fill="#cc6228" stroke="#cc6228"/>
        <path d="m27.2291 17.6507-7.405.3369.6885 3.7966 1.0913-2.2935 2.6372 1.2051z" fill="#cc6228" stroke="#cc6228"/>
        <path d="m11.3929 20.6958 2.6242-1.2051 1.0913 2.2935.6885-3.7966-7.40495-.3369z" fill="#cc6228" stroke="#cc6228"/>
        <path d="m8.392 17.6507 3.1049 6.0513-.1039-3.0062z" fill="#e27525" stroke="#e27525"/>
      </g>
    </svg>
  );
}

export default function Footer({ onOpenLegal, className = "" }: FooterProps) {
  // Single source of truth: derive the pulse clock from the on-chain epoch state
  // (same epochTimestamp the Grid telemetry uses) instead of wall-clock UTC math,
  // eliminating the 2-clock drift between Footer and Grid stations.
  const { epochTimestamp, currentEpoch } = useGrid();
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number }>({ minutes: 15, seconds: 0 });
  const [dailyEpoch, setDailyEpoch] = useState(1);
  const [tokenStatus, setTokenStatus] = useState<"idle" | "added" | "copied">("idle");
  const [internalShowLegal, setInternalShowLegal] = useState(false);

  useEffect(() => {
    const updateEpoch = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const interval = 900; // 15 minutes
      const elapsed =
        epochTimestamp > 0
          ? (nowSec - epochTimestamp) % interval
          : nowSec % interval; // graceful fallback until first on-chain sync lands
      const remainingSec = Math.max(0, interval - elapsed);
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      setTimeLeft({ minutes: m, seconds: s });
      const dailyIdx = Math.floor((nowSec % 86400) / 900) + 1;
      setDailyEpoch(dailyIdx);
    };

    updateEpoch();
    const interval = setInterval(updateEpoch, 1000);
    return () => clearInterval(interval);
  }, [epochTimestamp]);

  const handleCopyFallback = () => {
    navigator.clipboard.writeText(PROTOCOL_CONSTANTS.tokenContract);
    setTokenStatus("copied");
    setTimeout(() => setTokenStatus("idle"), 3000);
  };

  const handleAddToMetaMask = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const wasAdded = await (window as any).ethereum.request({
          method: "wallet_watchAsset",
          params: {
            type: "ERC20",
            options: {
              address: PROTOCOL_CONSTANTS.tokenContract,
              symbol: "NARA",
              decimals: 18,
              image: "https://naraprotocol.com/nara_token_256.png",
            },
          },
        });
        if (wasAdded) {
          setTokenStatus("added");
          setTimeout(() => setTokenStatus("idle"), 3000);
        }
      } catch (err) {
        console.error(err);
        handleCopyFallback();
      }
    } else {
      handleCopyFallback();
    }
  };

  const handleLegalClick = () => {
    if (onOpenLegal) {
      onOpenLegal();
    } else {
      setInternalShowLegal(true);
    }
  };

  return (
    <>
      <footer className={`hidden md:flex relative mt-auto mb-4 mx-auto w-[94%] sm:w-[92%] max-w-5xl z-20 flex-col items-center gap-1.5 sm:gap-2 ${className}`}>
        <div className="w-full px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-black/65 backdrop-blur-2xl border border-white/10 ring-1 ring-white/5 shadow-[0_12px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)] flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 text-[10px] sm:text-[11px] font-mono text-muted">
          
          {/* Left: MetaMask Add Token + Built with ❤️ on Base */}
          <div className="flex items-center gap-2 sm:gap-2.5 text-dim shrink-0">
            <button
              onClick={handleAddToMetaMask}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono whitespace-nowrap transition-all duration-200 shrink-0 ${
                tokenStatus !== "idle"
                  ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.3)] font-bold"
                  : "bg-white/[0.04] hover:bg-white/[0.08] border-white/10 hover:border-amber-500/40 text-silver hover:text-white"
              }`}
              title="Add $NARA token to MetaMask"
            >
              <MetaMaskFoxIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {tokenStatus === "added" ? "ADDED TO METAMASK" : tokenStatus === "copied" ? "ADDRESS COPIED" : "ADD $NARA"}
              </span>
            </button>

            <span className="text-white/15">·</span>

            <a
              href="https://base.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono text-dim hover:text-silver transition-colors whitespace-nowrap"
            >
              <span>Built with</span>
              <Heart size={11} weight="fill" className="text-rose-500 shrink-0 animate-pulse" />
              <span>on</span>
              <span className="text-[#0052FF] font-bold">Base</span>
            </a>
          </div>

          {/* Center: Socials, GitHub Docs & Legals */}
          <div className="flex items-center gap-3 sm:gap-4 text-dim">
            <a
              href={SOCIAL_LINKS.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cyan-300 transition-colors flex items-center gap-1"
            >
              <TelegramLogo size={13} weight="fill" />
              <span className="hidden md:inline">Telegram</span>
            </a>
            <span className="text-white/15">•</span>
            <a
              href={SOCIAL_LINKS.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <TwitterLogo size={13} weight="fill" />
              <span className="hidden md:inline">X</span>
            </a>
            <span className="text-white/15">•</span>
            <a
              href={SOCIAL_LINKS.publicDocs}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1"
              title="Documentation & GitHub Repository"
            >
              <GithubLogo size={13} weight="fill" />
              <span className="hidden md:inline">GitHub</span>
            </a>
            <span className="text-white/15">|</span>
            <button
              onClick={handleLegalClick}
              className="hover:text-white transition-colors underline underline-offset-2 flex items-center gap-1 focus:outline-none"
            >
              <ShieldCheck size={13} weight="bold" />
              <span>LEGALS</span>
            </button>
          </div>

          {/* Right: Live 15-Min Pulse (on-chain epoch-derived; EPOCH n/96 = daily slot index) */}
          <div className="flex items-center gap-1.5 text-silver font-semibold whitespace-nowrap">
            <ArrowsClockwise size={12} className="text-cyan-400 animate-spin" />
            <span>
              PULSE {String(timeLeft.minutes).padStart(2, "0")}:{String(timeLeft.seconds).padStart(2, "0")} (EPOCH {dailyEpoch}/96)
            </span>
            {currentEpoch > 0 && (
              <span className="hidden lg:inline text-cyan-400/90" title="Live protocol epoch counter">
                · #{currentEpoch}
              </span>
              )}
          </div>

        </div>

        {/* Legal Copyright Line */}
        <div className="text-[9px] sm:text-[10px] font-mono text-white/35 tracking-wider uppercase select-none text-center">
          © 2026 NARA PROTOCOL. ALL RIGHTS RESERVED.
        </div>
      </footer>

      {/* Internal Legal Modal if not delegated to parent */}
      {!onOpenLegal && internalShowLegal && (
        <LegalModal onClose={() => setInternalShowLegal(false)} />
      )}
    </>
  );
}
