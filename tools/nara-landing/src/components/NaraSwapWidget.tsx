import { useState, useCallback, useEffect, useMemo } from "react";
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
 * Military Sci-Fi Arcade Theme calibrated to match CommitStation exactly:
 * - Midnight navy compartment: #050c1e
 * - Steel-blue precision border: #142948
 * - Recessed input wells: #030816
 * - Radiant cyan accents: #00F0FF
 * - High-contrast crisp typography: #FFFFFF / #8fa1b8
 */
const NARA_THEME = {
  text: "#FFFFFF",
  subText: "#8fa1b8", // Slate for secondary metrics matching CommitStation
  primary: "#050c1e", // Midnight navy compartment interior
  dialog: "#050c1e", // Surface for token selector modal
  secondary: "#030816", // Recessed input wells matching CommitStation
  interactive: "#0b162c", // Tactile buttons matching CommitStation preset pills
  stroke: "#142948", // Precision steel-blue borders matching CommitStation
  accent: "#00F0FF", // Radiant cyan matching active pills and deploy button
  success: "#00c875", // Emerald green matching loot matrix
  warning: "#f59e0b", // Warm amber
  error: "#ef4444", // Rose
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  borderRadius: "12px", // Matches CommitStation rounded-xl
  buttonRadius: "10px", // Matches CommitStation rounded-[10px]
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
    naraBalance,
    navigate,
  } = useGrid();

  const [tokenIn, setTokenIn] = useState<string>(ETH_TOKEN_ADDRESS);
  const [tokenOut, setTokenOut] = useState<string>(NARA_TOKEN_ADDRESS);
  const [txError, setTxError] = useState<string | null>(null);

  const formattedNaraBalance = useMemo(() => {
    if (!naraBalance || naraBalance.isZero()) return "0";
    const formatted = ethers.utils.formatEther(naraBalance);
    const [whole, dec = ""] = formatted.split(".");
    const safeDec = dec.slice(0, 2);
    const val = safeDec ? `${whole}.${safeDec}` : whole;
    return Number(val) > 0 ? Number(val).toLocaleString() : "0";
  }, [naraBalance]);

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
    [wallet, isWrongChain, connect, handleSwitchToBase, fetchState, connectedAddress]
  );

  const hasNara = naraBalance && !naraBalance.isZero();

  const onChassisClickCapture = (e: React.MouseEvent) => {
    if (!connectedAddress) {
      const target = e.target as HTMLElement;
      if (
        target.closest('button[class*="sc-jlZhew"]') ||
        target.innerText?.toLowerCase().includes("connect your wallet")
      ) {
        e.stopPropagation();
        e.preventDefault();
        connect();
      }
    }
  };

  return (
    <div className="w-full max-w-[480px] mx-auto flex flex-col items-center select-none font-sans">
      {/* Network Warning Banner if connected to non-Base chain */}
      {isWrongChain && (
        <div className="w-full mb-2.5 p-2.5 bg-amber-950/80 border border-amber-500/40 rounded-xl font-sans text-xs text-amber-200 flex items-center justify-between backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-2">
            <WarningCircle size={15} className="text-amber-400 shrink-0" />
            <span>Connected to wrong network</span>
          </div>
          <button
            onClick={handleSwitchToBase}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[10px] font-bold tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            SWITCH TO BASE
          </button>
        </div>
      )}

      {/* UNIFIED HERO MISSION CONSOLE CHASSIS (IDENTICAL TO COMMIT STATION) */}
      <div className="w-full p-2 sm:p-2.5 bg-[#04091a]/95 border border-[#0d1d36]/80 rounded-2xl shadow-2xl backdrop-blur-xl space-y-2.5">
        
        {/* COMPARTMENT 1: SWAP $NARA */}
        <div
          className="w-full rounded-xl bg-[#050c1e] border border-[#142948] p-2.5 sm:p-3.5 overflow-hidden nara-dex-chassis shadow-sm"
          onClickCapture={onChassisClickCapture}
        >
          
          {/* Tactical Header Bar */}
          <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-[#142948]">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-4 h-4 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/50 text-[10px] font-sans font-black shadow-[0_0_6px_rgba(0,240,255,0.3)]">
                1
              </span>
              <span className="text-[13px] font-sans font-semibold tracking-wider text-white uppercase select-none">
                SWAP $NARA
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 font-sans text-[10px] text-[#00F0FF] bg-[#00F0FF]/10 px-2.5 py-0.5 rounded-full border border-[#00F0FF]/30 font-semibold tracking-wider uppercase select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] shadow-[0_0_5px_#00F0FF]" />
                <span>BASE 8453</span>
              </div>
              <div className="hidden sm:flex items-center gap-1 font-sans text-[10px] text-[#8fa1b8] bg-[#030816] px-2.5 py-0.5 rounded-full border border-[#142948] font-medium tracking-wider uppercase select-none">
                <span>0% ROUTING FEE</span>
              </div>
            </div>
          </div>

          {/* Kyber Widget Flush Integration */}
          <Widget
            client="nara-dex"
            chainId={BASE_CHAIN_ID}
            width={widgetWidth}
            tokenList={NARA_BASE_TOKENS}
            defaultTokenIn={tokenIn}
            defaultTokenOut={tokenOut}
            title={<></>}
            theme={NARA_THEME}
            enableRoute={true}
            showRate={true}
            showDetail={false}
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

        {/* COMPARTMENT 2: FORWARD GUIDANCE / NEXT STEP */}
        <div className="w-full rounded-xl bg-[#050c1e] border border-[#142948] p-3 px-3.5 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-4 h-4 rounded bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/50 text-[10px] font-sans font-black shadow-[0_0_6px_rgba(0,240,255,0.3)] shrink-0">
              2
            </span>
            <div className="min-w-0">
              <div className="text-[11.5px] font-sans font-semibold tracking-wider text-white uppercase truncate">
                {hasNara ? "READY TO JOIN THE GRID" : "NEXT: COMMIT & DEPLOY"}
              </div>
              <div className="text-[10.5px] font-sans text-[#8fa1b8] truncate">
                {hasNara ? (
                  <span>
                    Wallet holds <span className="text-[#00F0FF] font-mono font-bold">{formattedNaraBalance} NARA</span> ready for deployment
                  </span>
                ) : (
                  "Acquire $NARA, then commit cells for 15-min pulses"
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/commit")}
            className={`h-[34px] px-3.5 rounded-xl font-sans font-bold text-[11px] uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer select-none ${
              hasNara
                ? "bg-[#00F0FF] hover:bg-[#33f3ff] text-[#041c24] shadow-[0_0_16px_rgba(0,240,255,0.65)] hover:shadow-[0_0_22px_rgba(0,240,255,0.85)]"
                : "bg-[#0b162c] hover:bg-[#11203e] text-[#8e9faf] hover:text-white border border-[#182e4e]"
            }`}
          >
            <span>{hasNara ? "DEPLOY NARA →" : "STEP 2 →"}</span>
          </button>
        </div>
      </div>

      {/* Transaction Error Notification (inline, dismissible) */}
      {txError && (
        <div className="w-full mt-2.5 p-2.5 bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md font-sans">
          <div className="flex items-center gap-2">
            <WarningCircle size={15} className="text-rose-400 shrink-0" />
            <span className="line-clamp-2 font-medium">{txError}</span>
          </div>
          <button
            onClick={() => setTxError(null)}
            className="text-rose-400 hover:text-white p-1 shrink-0 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
