import { X } from "@phosphor-icons/react";
import { useEffect } from "react";
import { PROTOCOL_CONSTANTS } from "../lib/content";

export interface LegalModalProps {
  onClose: () => void;
}

export default function LegalModal({ onClose }: LegalModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg p-6 rounded-2xl bg-[#090d16] border border-white/10 font-mono text-xs space-y-4 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="font-bold text-silver uppercase tracking-wider">
            LEGAL NOTICES & PROTOCOL TERMS
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded text-dim hover:text-white transition-colors focus:outline-none"
            aria-label="Close modal"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="text-dim space-y-3 font-sans text-xs leading-relaxed max-h-80 overflow-y-auto pr-1">
          <p>
            <strong className="text-white">Autonomous Software:</strong> NARA Protocol is an immutable, non-custodial software suite deployed on the Base blockchain (Chain ID 8453). All contract logic, parameters, and time cadences execute autonomously onchain.
          </p>
          <p>
            <strong className="text-white">Self-Directed Actions:</strong> Interacting with NARA smart contracts is entirely peer-to-peer and self-directed. The protocol does not offer managed investment products, financial advice, or guaranteed returns.
          </p>
          <p>
            <strong className="text-white">Verified Smart Contracts:</strong>
            <br />
            • Token ($NARA): <span className="font-mono text-[11px] text-silver">{PROTOCOL_CONSTANTS.tokenContract}</span>
            <br />
            • Engine v4: <span className="font-mono text-[11px] text-silver">{PROTOCOL_CONSTANTS.engineContract}</span>
            <br />
            • Uniswap Hook: <span className="font-mono text-[11px] text-silver">{PROTOCOL_CONSTANTS.hookContract} ({PROTOCOL_CONSTANTS.hookBitmask})</span>
          </p>
        </div>

        <div className="pt-3 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold transition-colors focus:outline-none"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
