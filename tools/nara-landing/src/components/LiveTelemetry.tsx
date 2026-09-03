import { useState, useEffect } from "react";
import { PROTOCOL_CONSTANTS, SOCIAL_LINKS } from "../lib/content";
import { Copy, Check, ArrowSquareOut } from "@phosphor-icons/react";

export default function LiveTelemetry() {
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

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
          setCurrentBlock(parseInt(data.result, 16));
        }
      } catch (err) {
        // Quiet fallback if rate-limited
      }
    }

    fetchBaseBlock();
    const interval = setInterval(fetchBaseBlock, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(PROTOCOL_CONSTANTS.tokenContract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section className="shell my-8">
      <div className="p-4 sm:p-6 rounded-xl border border-white/10 bg-surface/70 backdrop-blur-md">
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-nara-emerald animate-pulse" />
            <span className="font-mono text-xs text-silver font-bold uppercase tracking-wider">
              Onchain Base Telemetry
            </span>
            <span className="text-muted font-mono text-xs">
              // Block: {currentBlock ? `#${currentBlock.toLocaleString()}` : "Syncing..."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={SOCIAL_LINKS.basescanToken}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-dim hover:text-white transition-colors"
            >
              <span>BaseScan</span>
              <ArrowSquareOut size={13} />
            </a>
            <span className="text-white/10">•</span>
            <a
              href={SOCIAL_LINKS.dexscreener}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-dim hover:text-white transition-colors"
            >
              <span>DexScreener</span>
              <ArrowSquareOut size={13} />
            </a>
          </div>
        </div>

        {/* Tactical Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-white/5">
          <div>
            <div className="font-mono text-[11px] text-muted mb-1">TOTAL SUPPLY</div>
            <div className="font-mono text-sm sm:text-base font-bold text-silver">
              1,000,000.00
            </div>
            <div className="font-mono text-[10px] text-dim">Fixed Non-Mintable</div>
          </div>

          <div>
            <div className="font-mono text-[11px] text-muted mb-1">EPOCH CADENCE</div>
            <div className="font-mono text-sm sm:text-base font-bold text-silver">
              15 Minutes
            </div>
            <div className="font-mono text-[10px] text-dim">96 Cycles Daily</div>
          </div>

          <div>
            <div className="font-mono text-[11px] text-muted mb-1">PROTOCOL FEES</div>
            <div className="font-mono text-sm sm:text-base font-bold text-emerald-400">
              Auto-Captured
            </div>
            <div className="font-mono text-[10px] text-dim">Uniswap v4 Vault</div>
          </div>

          <div>
            <div className="font-mono text-[11px] text-muted mb-1">COMMITTED STAKE</div>
            <div className="font-mono text-sm sm:text-base font-bold text-silver">
              ~7,080 NARA
            </div>
            <div className="font-mono text-[10px] text-dim">Active in V4 Engine</div>
          </div>
        </div>

        {/* 1-Click Tactile Contract Copy Bar */}
        <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-xs text-dim">
            <span className="text-muted">TOKEN ADDRESS:</span>
            <span className="text-silver font-semibold truncate max-w-[280px] sm:max-w-none">
              {PROTOCOL_CONSTANTS.tokenContract}
            </span>
          </div>

          <button
            onClick={handleCopy}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded font-mono text-xs font-bold transition-all duration-150 ${
              copied
                ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
            }`}
          >
            {copied ? (
              <>
                <Check size={14} weight="bold" />
                <span>COPIED TO CLIPBOARD</span>
              </>
            ) : (
              <>
                <Copy size={14} weight="bold" />
                <span>COPY CONTRACT</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
