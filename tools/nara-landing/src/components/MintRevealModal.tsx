import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  Sparkle,
  Cpu,
  ArrowRight,
  X,
  Lightning,
  CircleNotch,
} from "@phosphor-icons/react";
import { useGrid } from "../context/GridContext";
import {
  extractAlloyFromItem,
  DEFAULT_BASE_RPC,
  GRID_ADDRESSES,
  positionNftAbi,
  parseTokenUri,
  PositionNftItem,
} from "../lib/gridContracts";
import TacticalNumber from "./TacticalNumber";
import PullRulesContent from "./PullRulesContent";

export default function MintRevealModal() {
  const {
    mintRevealItem,
    setMintRevealItem,
    handleEquip,
    slottedTokenIds,
    navigate,
  } = useGrid();

  const [loadingPlate, setLoadingPlate] = useState(false);
  // CRITICAL: All hooks MUST be declared before any conditional return so React
  // sees a stable hook order between the modal-closed and modal-open renders.
  const [showRules, setShowRules] = useState<boolean>(false);

  // Close on ESC key press
  useEffect(() => {
    if (!mintRevealItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMintRevealItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mintRevealItem, setMintRevealItem]);

  // Auto-fetch the on-chain SVG plate and traits if missing on initial modal trigger
  useEffect(() => {
    const currentItem = mintRevealItem;
    if (!currentItem) return;
    if (currentItem.imageSvg && currentItem.attributes?.length > 0) return;

    let isMounted = true;
    setLoadingPlate(true);

    async function fetchPlate() {
      if (!currentItem) return;
      try {
        const readProvider = new ethers.providers.JsonRpcProvider(DEFAULT_BASE_RPC);
        const readNft = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, readProvider);
        const uri = await readNft.tokenURI(currentItem.tokenId);
        if (!isMounted || !uri) return;
        const parsed = parseTokenUri(uri);
        const updated: PositionNftItem = {
          ...currentItem,
          name: parsed.name || currentItem.name,
          description: parsed.description || currentItem.description,
          imageSvg: parsed.imageSvg || currentItem.imageSvg,
          attributes: parsed.attributes?.length ? parsed.attributes : currentItem.attributes,
        };
        setMintRevealItem(updated);
      } catch (err) {
        console.warn("Could not load on-chain plate in reveal modal:", err);
      } finally {
        if (isMounted) setLoadingPlate(false);
      }
    }

    fetchPlate();
    return () => {
      isMounted = false;
    };
  }, [mintRevealItem?.tokenId]);

  if (!mintRevealItem) return null;

  const alloy = extractAlloyFromItem(mintRevealItem);
  const isSlotted = slottedTokenIds.some((id) => id.eq(mintRevealItem.tokenId));
  const isDeckFull = slottedTokenIds.length >= 6;

  // Extract key attributes (on-chain trait names are preserved verbatim for decode;
  // user-facing labels below use approved NARA vocabulary)
  const participationPower =
    mintRevealItem.attributes.find(
      (a) => a.trait_type === "Effective Staking Power"
    )?.value || "4.00X";

  const baseMultiplier =
    mintRevealItem.attributes.find(
      (a) => a.trait_type === "Base Lock Multiplier"
    )?.value || "4.00X";

  const rank =
    mintRevealItem.attributes.find(
      (a) => a.trait_type === "Progression Rank"
    )?.value || "Rank 10";

  const timeCommitment =
    mintRevealItem.attributes.find(
      (a) => a.trait_type === "Time Commitment"
    )?.value || "365 Days";

  const onEquipClick = async () => {
    if (!isSlotted && !isDeckFull) {
      await handleEquip(mintRevealItem.tokenId);
    }
    setMintRevealItem(null);
    navigate("/grid");
  };

  const onViewVaultClick = () => {
    setMintRevealItem(null);
    navigate("/vault");
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) setMintRevealItem(null);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200"
    >
      {/* Background ambient glow matching alloy tier */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[140px] opacity-25 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: alloy.accentColorHex }}
      />

      <div className="relative w-full max-w-lg rounded-3xl bg-[#060a18]/98 border border-white/20 p-6 sm:p-7 space-y-6 shadow-[0_25px_60px_rgba(0,0,0,0.95)] max-h-[92vh] overflow-y-auto font-sans ring-1 ring-white/10">
        {/* Close Button */}
        <button
          onClick={() => setMintRevealItem(null)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors z-20"
          aria-label="Close unboxing modal"
        >
          <X size={18} />
        </button>

        {/* Header Ribbon & Pull Title */}
        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-[11px] font-sans font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(0,240,255,0.2)]">
            <Sparkle size={13} weight="fill" className="text-cyan-300 animate-spin" />
            <span>ON-CHAIN REVEAL · TOKEN #{mintRevealItem.tokenId.toString()}</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">{alloy.icon}</span>
              <h2
                className="text-xl sm:text-2xl font-black uppercase tracking-tight font-display drop-shadow-[0_0_18px_rgba(255,255,255,0.3)]"
                style={{ color: alloy.accentColorHex }}
              >
                {alloy.name}
              </h2>
            </div>
            <div className="inline-block">
              <span
                className={`text-[10px] font-mono font-bold px-3 py-0.5 rounded-full uppercase border ${alloy.bgClass} ${alloy.borderClass} ${alloy.colorClass} ${alloy.glowClass} tracking-wider`}
              >
                {alloy.badgeLabel}
              </span>
            </div>
          </div>
        </div>

        {/* SVG Plate Artwork Canvas */}
        <div
          className="w-full flex items-center justify-center bg-[#02050b] rounded-2xl border p-4 sm:p-5 relative overflow-hidden group shadow-inner transition-all duration-300"
          style={{ borderColor: `${alloy.accentColorHex}40` }}
        >
          {/* Subtle gradient ray */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none bg-gradient-to-b from-transparent via-white/5 to-transparent"
          />

          {loadingPlate ? (
            <div className="text-center space-y-3 py-12 font-sans">
              <CircleNotch size={48} className="text-cyan-400 mx-auto animate-spin" />
              <div className="space-y-1">
                <span className="text-xs text-white font-bold block uppercase tracking-wider">
                  DECODING ON-CHAIN HARDWARE PLATE...
                </span>
                <span className="text-[11px] text-cyan-300 block font-mono">
                  Reading Base Mainnet contract metadata
                </span>
              </div>
            </div>
          ) : mintRevealItem.imageSvg ? (
            mintRevealItem.imageSvg.trim().startsWith("<svg") ? (
              <div
                className="w-full max-w-[290px] rounded-xl overflow-hidden shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
                dangerouslySetInnerHTML={{ __html: mintRevealItem.imageSvg }}
              />
            ) : (
              <img
                src={mintRevealItem.imageSvg}
                alt={mintRevealItem.name}
                className="w-full max-w-[290px] h-auto object-contain rounded-xl shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
              />
            )
          ) : (
            <div className="text-center space-y-3 py-10 font-sans">
              <Cpu size={56} className="text-cyan-400/60 mx-auto animate-pulse" />
              <div className="space-y-1">
                <span className="text-xs text-white font-bold block uppercase tracking-wider">
                  ON-CHAIN NARA POSITION PLATE
                </span>
                <span className="text-xs text-slate-400 block font-mono">
                  <TacticalNumber value={mintRevealItem.amount} symbol="NARA" /> Committed
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Key Traits & Power Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-[#03060e] border border-white/[0.08] text-center space-y-1">
            <span className="text-[10px] font-sans font-semibold text-slate-400 block uppercase tracking-wider">
              PARTICIPATION POWER
            </span>
            <span className="text-base font-black text-cyan-300 font-mono block drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              {participationPower}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#03060e] border border-white/[0.08] text-center space-y-1">
            <span className="text-[10px] font-sans font-semibold text-slate-400 block uppercase tracking-wider">
              BASE MULTIPLIER
            </span>
            <span className="text-base font-black text-white font-mono block">
              {baseMultiplier}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#03060e] border border-white/[0.08] text-center space-y-1">
            <span className="text-[10px] font-sans font-semibold text-slate-400 block uppercase tracking-wider">
              HORIZON & RANK
            </span>
            <span className="text-xs font-bold text-slate-200 font-mono block pt-0.5 truncate" title={String(rank)}>
              {timeCommitment} · {rank}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#03060e] border border-white/[0.08] text-center space-y-1">
            <span className="text-[10px] font-sans font-semibold text-slate-400 block uppercase tracking-wider">
              ACTIVE CELLS
            </span>
            <span className="text-xs font-bold text-cyan-200 font-mono block pt-0.5">
              <TacticalNumber value={mintRevealItem.amount} symbol="CELLS" />
            </span>
          </div>
        </div>

        {/* Proactive Guidance Callout */}
        <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-slate-300 flex items-start gap-2.5">
          <Lightning size={16} className="shrink-0 text-cyan-400 mt-0.5" />
          <p className="leading-relaxed">
            Your NFT is minted and active on Base. It commands continuous 15-minute pulse rewards. Slot it to your Fleet Deck for up to{" "}
            <strong className="text-cyan-300 font-semibold">+25% formation synergy</strong>!
          </p>        </div>

        {/* On-Chain Pull Luck & Drop Rules Breakdown */}
        <div className="p-4 rounded-2xl bg-[#03060f] border border-white/10 space-y-3 shadow-inner">
          <button
            type="button"
            onClick={() => setShowRules(!showRules)}
            className="w-full flex items-center justify-between text-left font-bold text-white uppercase tracking-wider text-[11px] group focus:outline-none"
          >
            <span className="flex items-center gap-1.5 text-cyan-300 group-hover:text-cyan-200 transition-colors">
              <Sparkle size={14} weight="fill" className="text-cyan-400" />
              <span>HOW ON-CHAIN PULL LUCK & WHALE GATES WORK</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 group-hover:bg-white/10 text-slate-300 border border-white/10 transition-colors">
              {showRules ? "HIDE RULES ▲" : "VIEW RULES ▼"}
            </span>
          </button>

          {showRules && (
            <div className="pt-2 border-t border-white/[0.08] animate-in fade-in duration-200">
              <PullRulesContent />
            </div>
          )}
        </div>

        {/* Action CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onEquipClick}
            disabled={isDeckFull && !isSlotted}
            className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 hover:text-white text-xs font-sans font-bold tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:shadow-[0_0_28px_rgba(0,240,255,0.4)] flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
          >
            <Lightning size={14} weight="fill" className="text-cyan-300" />
            <span>{isSlotted ? "VIEW ON FLEET DECK" : "EQUIP TO FLEET DECK"}</span>
          </button>

          <button
            type="button"
            onClick={onViewVaultClick}
            className="w-full sm:w-auto py-3 px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-sans font-bold text-slate-200 hover:text-white transition-all active:scale-95 text-center flex items-center justify-center gap-1.5"
          >
            <span>VIEW IN VAULT</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
