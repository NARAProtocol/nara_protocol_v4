import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { X, Cpu, CircleNotch } from "@phosphor-icons/react";
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

export default function PositionInspectModal() {
  const {
    inspectModalItem,
    setInspectModalItem,
    slottedTokenIds,
    handleEquip,
    handleUnequip,
    handleHarvestSingle,
    actionBusy,
  } = useGrid();

  const [loadingPlate, setLoadingPlate] = useState(false);

  // Auto-fetch the on-chain SVG plate if missing
  useEffect(() => {
    const currentItem = inspectModalItem;
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
        setInspectModalItem(updated);
      } catch (err) {
        console.warn("Could not load on-chain plate in inspect modal:", err);
      } finally {
        if (isMounted) setLoadingPlate(false);
      }
    }

    fetchPlate();
    return () => {
      isMounted = false;
    };
  }, [inspectModalItem?.tokenId]);

  // Close on ESC key press
  useEffect(() => {
    if (!inspectModalItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspectModalItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectModalItem, setInspectModalItem]);

  if (!inspectModalItem) return null;

  const inspectAlloy = extractAlloyFromItem(inspectModalItem);
  const isSlotted = slottedTokenIds.some((id) => id.eq(inspectModalItem.tokenId));
  const isDeckFull = slottedTokenIds.length >= 6;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) setInspectModalItem(null);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
    >
      {/* Ambient glow matching alloy */}
      <div
        className="absolute w-[450px] h-[450px] rounded-full blur-[130px] opacity-20 pointer-events-none transition-all duration-500"
        style={{ backgroundColor: inspectAlloy.accentColorHex }}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-[#060a18]/98 border border-white/15 p-6 space-y-5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto font-sans ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{inspectAlloy.icon}</span>
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-display">
                {inspectModalItem.name}
              </h3>
              <span
                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${inspectAlloy.bgClass} ${inspectAlloy.borderClass} ${inspectAlloy.colorClass} ${inspectAlloy.glowClass} inline-block`}
              >
                {inspectAlloy.badgeLabel} · {inspectAlloy.name}
              </span>
            </div>
          </div>
          <button
            onClick={() => setInspectModalItem(null)}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* SVG Render or Plate Artwork */}
        <div className="w-full flex items-center justify-center bg-[#02050b] rounded-xl border border-white/[0.08] p-4 min-h-[220px]">
          {loadingPlate ? (
            <div className="text-center space-y-3 py-10 font-sans">
              <CircleNotch size={40} className="text-cyan-400 mx-auto animate-spin" />
              <div className="space-y-0.5">
                <span className="text-xs text-white font-bold block uppercase tracking-wider">
                  DECODING ON-CHAIN HARDWARE PLATE...
                </span>
                <span className="text-[11px] text-slate-400 block font-mono">
                  Loading authentic SVG from Base
                </span>
              </div>
            </div>
          ) : inspectModalItem.imageSvg ? (
            inspectModalItem.imageSvg.trim().startsWith("<svg") ? (
              <div
                className="w-full max-w-[280px] rounded-lg overflow-hidden shadow-2xl"
                dangerouslySetInnerHTML={{ __html: inspectModalItem.imageSvg }}
              />
            ) : (
              <img
                src={inspectModalItem.imageSvg}
                alt={inspectModalItem.name}
                className="w-full max-w-[280px] h-auto object-contain rounded-lg shadow-2xl"
              />
            )
          ) : (
            <div className="text-center space-y-2 py-8 font-sans">
              <Cpu size={48} className="text-cyan-400/60 mx-auto" />
              <span className="text-xs text-slate-200 block font-semibold">
                ON-CHAIN NARA POSITION PLATE
              </span>
              <span className="text-xs text-slate-400 block font-mono">
                <TacticalNumber value={inspectModalItem.amount} symbol="NARA" /> Committed
              </span>
            </div>
          )}
        </div>

        {/* Trait Badges */}
        {inspectModalItem.attributes.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {inspectModalItem.attributes.map((attr, i) => (
              <div key={i} className="p-2.5 rounded-xl bg-[#03060e] border border-white/[0.08] space-y-0.5">
                <span className="text-[10px] font-sans font-semibold text-slate-400 block uppercase tracking-wider">
                  {attr.trait_type}
                </span>
                <span className="text-xs font-bold text-white font-mono">{attr.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Claimable Rewards & 1-Click Harvest */}
        {((inspectModalItem.claimableNara && !inspectModalItem.claimableNara.isZero()) ||
          (inspectModalItem.claimableEth && !inspectModalItem.claimableEth.isZero())) && (
          <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between gap-3 font-sans shadow-lg">
            <div className="space-y-0.5">
              <span className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wider block">
                CLAIMABLE FROM THIS CELL
              </span>
              <div className="flex items-center gap-3 font-mono text-xs font-bold text-white">
                {inspectModalItem.claimableNara && !inspectModalItem.claimableNara.isZero() && (
                  <span className="text-cyan-300">
                    <TacticalNumber value={inspectModalItem.claimableNara} symbol="NARA" decimals={2} />
                  </span>
                )}
                {inspectModalItem.claimableEth && !inspectModalItem.claimableEth.isZero() && (
                  <span className="text-amber-300">
                    <TacticalNumber value={inspectModalItem.claimableEth} symbol="ETH" decimals={4} />
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await handleHarvestSingle(inspectModalItem.tokenId);
              }}
              disabled={actionBusy === `harvest-${inspectModalItem.tokenId.toString()}`}
              className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-sans font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.35)] shrink-0 active:scale-95 disabled:opacity-50"
            >
              {actionBusy === `harvest-${inspectModalItem.tokenId.toString()}` ? "HARVESTING..." : "HARVEST"}
            </button>
          </div>
        )}

        {/* Modal Bottom Actions */}
        <div className="pt-2 flex items-center justify-between gap-3">
          <div>
            {isSlotted ? (
              <button
                type="button"
                onClick={async () => {
                  await handleUnequip(inspectModalItem.tokenId);
                }}
                className="px-4 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs font-bold transition-all active:scale-95"
              >
                UNSLOT FROM DECK
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (!isDeckFull) {
                    await handleEquip(inspectModalItem.tokenId);
                  }
                }}
                disabled={isDeckFull}
                className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
              >
                {isDeckFull ? "FLEET DECK FULL (6/6)" : "EQUIP TO FLEET DECK"}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setInspectModalItem(null)}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/15 transition-all active:scale-95"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
