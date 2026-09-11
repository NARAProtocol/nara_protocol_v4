import { useState, useCallback, useEffect } from "react";
import { Widget, type TxData } from "@kyberswap/widgets";
import { ethers } from "ethers";
import { useGrid } from "../context/GridContext";
import {
  NARA_BASE_TOKENS,
  NARA_TOKEN_ADDRESS,
  ETH_TOKEN_ADDRESS,
  BASE_CHAIN_ID,
  type TokenInfo,
} from "../lib/tokens";
import { WarningCircle, X } from "@phosphor-icons/react";

/**
 * Ergonomically calibrated theme:
 * Designed for visual calmness, high contrast legibility,
 * and zero eye strain during financial transactions.
 */
const NARA_THEME = {
  text: "#FFFFFF",
  subText: "#94A3B8", // Cool slate for secondary metrics
  primary: "#090D16", // Deep obsidian chassis interior
  dialog: "#0D1322", // Elevated surface for token selector modal
  secondary: "#101626", // Soft recessed input wells
  interactive: "#192237", // Tactile hover & interaction states
  stroke: "rgba(255, 255, 255, 0.08)", // Whisper-quiet hairlines (no harsh neon glare)
  accent: "#0052FF", // Authentic Base Blue
  success: "#10B981", // Calming emerald green
  warning: "#F59E0B", // Warm amber
  error: "#EF4444", // Clean rose
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  borderRadius: "16px", // Smooth modern squircle curvature
  buttonRadius: "12px", // Comfortable, tactile button bounds
  boxShadow: "none",
};

export default function NaraSwapWidget() {
  const {
    wallet,
    connectedAddress,
    connectedChainId,
    isWrongChain,
    connect,
    handleSwitchToBase,
    fetchState,
  } = useGrid();

  const [tokenIn, setTokenIn] = useState<string>(ETH_TOKEN_ADDRESS);
  const [tokenOut, setTokenOut] = useState<string>(NARA_TOKEN_ADDRESS);
  const [txError, setTxError] = useState<string | null>(null);

  // Dynamically scale widget width to viewport to eliminate mobile overflow
  const [widgetWidth, setWidgetWidth] = useState<number>(() =>
    typeof window !== "undefined" ? Math.min(window.innerWidth - 32, 432) : 432
  );

  useEffect(() => {
    const handleResize = () => {
      setWidgetWidth(Math.min(window.innerWidth - 32, 432));
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle transaction submission from Kyber widget
  const handleSubmitTx = useCallback(
    async (txData: TxData): Promise<string> => {
      setTxError(null);
      if (!connectedAddress) {
        try {
          await connect();
        } catch {}
        throw new Error("Wallet not connected. Please connect wallet and retry.");
      }

      if (isWrongChain) {
        await handleSwitchToBase();
        throw new Error("Please switch network to Base Mainnet before confirming.");
      }

      try {
        const provider = new ethers.providers.Web3Provider(wallet.provider as any, "any");
        const signer = provider.getSigner();
        const tx = await signer.sendTransaction({
          from: txData.from,
          to: txData.to,
          value: txData.value,
          data: txData.data,
          gasLimit: txData.gasLimit ? ethers.BigNumber.from(txData.gasLimit) : undefined,
        });

        // Automatically refresh protocol state after confirmation so NARA balance syncs
        tx.wait(1).then(() => {
          if (fetchState) fetchState();
        }).catch(console.warn);

        return tx.hash;
      } catch (err: any) {
        const message =
          err?.reason ||
          err?.data?.message ||
          err?.message ||
          "Transaction was cancelled or rejected";
        setTxError(message);
        throw err;
      }
    },
    [wallet, isWrongChain, connect, handleSwitchToBase, fetchState]
  );

  return (
    <div className="w-full max-w-[460px] mx-auto flex flex-col items-center">
      {/* Network Warning Banner if connected to non-Base chain */}
      {isWrongChain && (
        <div className="w-full mb-3 p-3 bg-amber-950/40 border border-amber-500/30 rounded-2xl font-mono text-xs text-amber-200 flex items-center justify-between backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <WarningCircle size={18} className="text-amber-400 shrink-0" />
            <span>Connected to wrong network</span>
          </div>
          <button
            onClick={handleSwitchToBase}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[10px] font-bold tracking-wider rounded-lg transition-colors"
          >
            SWITCH TO BASE
          </button>
        </div>
      )}

      {/* 
        Single Unified Double-Bezel Hardware Chassis:
        Outer Shell: Machined subtle gradient hairline + deep ambient shadow
        Inner Core: Recessed Obsidian plate with integrated telemetry micro-bar
      */}
      <div className="relative w-full rounded-[24px] p-[1px] bg-gradient-to-b from-white/[0.12] via-white/[0.04] to-transparent shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)]">
        <div className="relative w-full rounded-[23px] bg-[#080C16]/95 backdrop-blur-2xl p-2 sm:p-3 overflow-hidden border border-white/[0.04] nara-dex-chassis">
          
          {/* Integrated Micro-Header Bar */}
          <div className="flex items-center justify-between px-3 pt-2 pb-2 text-xs border-b border-white/[0.04] mb-2">
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <span className="font-semibold tracking-wider text-white">NARA DEX</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 text-[10px]">BASE 8453</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-medium">
              <span>0% DEX ROUTING FEE</span>
            </div>
          </div>

          {/* Kyber Widget Flush Integration (Supports ANY Base Token, 100% Symmetrically Centered) */}
          <Widget
            client="nara-dex"
            chainId={BASE_CHAIN_ID}
            width={widgetWidth}
            tokenList={NARA_BASE_TOKENS}
            defaultTokenIn={tokenIn}
            defaultTokenOut={tokenOut}
            theme={NARA_THEME}
            enableRoute={true}
            showRate={true}
            showDetail={true}
            connectedAccount={{
              address: wallet?.accounts?.[0]?.address,
              chainId: connectedChainId,
            }}
            onSubmitTx={handleSubmitTx}
            onSwitchChain={handleSwitchToBase}
            onSourceTokenChange={(token: TokenInfo) => setTokenIn(token.address)}
            onDestinationTokenChange={(token: TokenInfo) => setTokenOut(token.address)}
            onError={(e: any) => {
              console.warn("KyberWidget internal error:", e);
            }}
          />
        </div>
      </div>

      {/* Transaction Error Notification (inline, dismissible) */}
      {txError && (
        <div className="w-full mt-3 p-3 bg-rose-950/50 border border-rose-500/30 rounded-2xl font-mono text-xs text-rose-200 flex items-center justify-between backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <WarningCircle size={18} className="text-rose-400 shrink-0" />
            <span className="line-clamp-2">{txError}</span>
          </div>
          <button
            onClick={() => setTxError(null)}
            className="text-rose-400/60 hover:text-rose-200 p-1 shrink-0"
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
