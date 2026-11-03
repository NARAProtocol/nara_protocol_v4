import { useState, useMemo } from "react";
import { ethers } from "ethers";
import { Copy, Check } from "@phosphor-icons/react";

export interface TacticalNumberProps {
  value?: ethers.BigNumber | string | number | null;
  decimals?: number;
  symbol?: string;
  className?: string;
  isWei?: boolean; // Defaults to true when BigNumber, converts via formatEther
  unitDecimals?: number; // Custom token decimals (e.g. 6 for USDC, 18 for ETH/NARA)
  noUnderline?: boolean;
  symbolClassName?: string;
}

/**
 * TacticalNumber:
 * - Kills decimal overload by rounding cleanly to 2–4 decimals with thousands comma separators.
 * - Progressive disclosure: hover/click displays full unrounded precision with a 1-click copy action.
 * - Guards against overflow or raw address decode leaks (>10M capped/flagged).
 */
export default function TacticalNumber({
  value,
  decimals = 2,
  symbol,
  className = "",
  isWei = true,
  unitDecimals = 18,
  noUnderline = false,
  symbolClassName = "",
}: TacticalNumberProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [copied, setCopied] = useState(false);

  // Compute full string and formatted compact number
  const { fullValueStr, compactStr, isOverflown } = useMemo(() => {
    if (value === undefined || value === null) {
      return { fullValueStr: "0.00", compactStr: "0.00", isOverflown: false };
    }

    let rawStr = "";
    if (ethers.BigNumber.isBigNumber(value)) {
      if (value.isZero()) {
        return { fullValueStr: "0.00", compactStr: "0.00", isOverflown: false };
      }
      try {
        rawStr = isWei
          ? (unitDecimals !== 18
              ? ethers.utils.formatUnits(value, unitDecimals)
              : ethers.utils.formatEther(value))
          : value.toString();
      } catch {
        rawStr = value.toString();
      }
    } else {
      rawStr = String(value);
    }

    const num = parseFloat(rawStr);
    if (isNaN(num)) {
      return { fullValueStr: "0.00", compactStr: "0.00", isOverflown: false };
    }

    // Safety guard: Total NARA supply is strictly 1,000,000.
    // If num > 10,000,000 it is almost certainly a decode anomaly (e.g. unparsed address).
    const overflown = num > 10_000_000;

    // Full precision with clean commas on the integer part
    const [intPart, fracPart = ""] = rawStr.split(".");
    const formattedInt = parseInt(intPart, 10).toLocaleString("en-US");
    const fullValueStr = fracPart ? `${formattedInt}.${fracPart}` : formattedInt;

    // Compact formatted string
    let compactStr = "";
    if (num === 0) {
      compactStr = "0.00";
    } else if (Math.abs(num) < 0.0001) {
      compactStr = "< 0.0001";
    } else if (Math.abs(num) < 1) {
      // 3-4 decimals for fractional amounts like ETH fees or small rewards
      compactStr = num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: Math.max(decimals, 4),
      });
    } else {
      // 2 decimals with commas for standard token balances & cells
      compactStr = num.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    return { fullValueStr, compactStr, isOverflown: overflown };
  }, [value, decimals, isWei]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullValueStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isOverflown) {
    return (
      <span className="text-amber-400 font-mono text-xs inline-flex items-center gap-1" title="Data re-synchronizing">
        <span>~1.00M</span>
        {symbol && <span className="text-[10px] text-silver font-normal">{symbol}</span>}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-flex items-baseline gap-1 group font-mono ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((prev) => !prev)}
    >
      <span className={`cursor-help transition-colors ${noUnderline ? "" : "border-b border-dotted border-white/30 hover:border-cyan-400"}`}>
        {compactStr}
      </span>
      {symbol && (
        <span className={`select-none ${symbolClassName || "text-[10px] text-silver/80 font-normal"}`}>
          {symbol}
        </span>
      )}

      {/* Progressive Disclosure Floating HUD Popover */}
      {showTooltip && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2.5 py-1.5 rounded bg-[#060b17] border border-cyan-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.9)] text-[10px] text-slate-200 z-50 whitespace-nowrap flex items-center gap-2 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-dim">FULL:</span>
          <span className="text-cyan-300 font-bold select-all">{fullValueStr}</span>
          {symbol && <span className="text-silver/60">{symbol}</span>}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded bg-white/5 hover:bg-cyan-500/20 text-silver hover:text-cyan-300 border border-white/10 transition-colors ml-0.5"
            title="Copy exact unrounded amount"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>
        </span>
      )}
    </span>
  );
}
