import { useState } from "react";
import { PROTOCOL_CONSTANTS } from "../lib/content";
import { Copy, Check } from "@phosphor-icons/react";

export interface ContractPillProps {
  className?: string;
}

export default function ContractPill({ className = "" }: ContractPillProps) {
  const [copied, setCopied] = useState(false);
  const ca = "0xB633...19c1";

  const handleCopy = () => {
    navigator.clipboard.writeText(PROTOCOL_CONSTANTS.tokenContract);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button
      onClick={handleCopy}
      className={`btn-ticks inline-flex items-center gap-2 cursor-pointer transition-all duration-200 text-[11px] sm:text-xs tracking-wider whitespace-nowrap focus:outline-none ${className}`}
      title="Click to copy verified $NARA Base token contract address"
    >
      <span className="corner tl"></span>
      <span className="corner tr"></span>
      <span className="corner bl"></span>
      <span className="corner br"></span>
      <span className="text-cyan-400 font-bold">$NARA CONTRACT:</span>
      <span className="text-white/85 font-mono">{copied ? "COPIED" : ca}</span>
      {copied ? (
        <Check size={12} weight="bold" className="text-emerald-400 shrink-0" />
      ) : (
        <Copy size={12} className="text-dim group-hover:text-cyan-300 transition-colors shrink-0" />
      )}
    </button>
  );
}
