import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { X, CircleNotch, ArrowArcLeft } from "@phosphor-icons/react";
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
import PolyhedronWireframe from "./PolyhedronWireframe";

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

  // Check for on-chain Effective Staking Power (e.g. 5.50X for Damascus)
  const powerAttr = inspectModalItem.attributes?.find(
    (a) => a.trait_type === "Effective Staking Power"
  );
  let effectiveMultiplier = 0;
  if (powerAttr && typeof powerAttr.value === "string") {
    effectiveMultiplier = parseFloat(powerAttr.value.replace("X", ""));
  }

  const baseWeightBN = inspectModalItem.weight && !inspectModalItem.weight.isZero()
    ? inspectModalItem.weight
    : inspectModalItem.amount.mul(4);

  let mult = 1.0;
  if (!inspectModalItem.amount.isZero() && !baseWeightBN.isZero()) {
    mult = parseFloat(ethers.utils.formatEther(baseWeightBN)) / parseFloat(ethers.utils.formatEther(inspectModalItem.amount));
  }

  const baseLockAttr = inspectModalItem.attributes?.find(
    (a) => a.trait_type === "Base Lock Multiplier"
  );
  let baseLockMult = 4.0;
  if (baseLockAttr && typeof baseLockAttr.value === "string") {
    baseLockMult = parseFloat(baseLockAttr.value.replace("X", ""));
  }

  const isBoosted = effectiveMultiplier > baseLockMult + 0.05;
  const displayMult = isBoosted ? effectiveMultiplier : mult;
  const modalMultiplierStr = `${displayMult.toFixed(2)}X`;

  const weightBN = isBoosted && !inspectModalItem.amount.isZero()
    ? inspectModalItem.amount.mul(Math.round(displayMult * 1000)).div(1000)
    : baseWeightBN;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) setInspectModalItem(null);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
    >
      {/* Ambient glow matching alloy */}
      <div
        className="absolute w-[450px] h-[450px] rounded-full blur-[130px] opacity-20 pointer-events-none transition-all duration-500"
        style={{ backgroundColor: inspectAlloy.accentColorHex }}
      />

      {/* Modal Container: Flex Column with Sticky Header & Footer */}
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-[#060a18]/98 border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.95)] font-sans ring-1 ring-white/10 overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5 shrink-0 bg-[#060a18]">
          <div className="flex items-center gap-2.5">
            <span
              className="w-5 h-5 rounded-md flex items-center justify-center border text-[11px] shadow-sm"
              style={{
                borderColor: `${inspectAlloy.accentColorHex}80`,
                backgroundColor: `${inspectAlloy.accentColorHex}20`,
              }}
            >
              {inspectAlloy.icon}
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide font-sans">
                {inspectModalItem.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="text-[10px] font-mono px-2 py-0.2 rounded border font-bold uppercase"
                  style={{
                    color: inspectAlloy.accentColorHex,
                    borderColor: `${inspectAlloy.accentColorHex}50`,
                    backgroundColor: `${inspectAlloy.accentColorHex}15`,
                  }}
                >
                  {inspectAlloy.badgeLabel} • {inspectAlloy.name}
                </span>
              </div>
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

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* SVG Render or Plate Artwork */}
          <div className="w-full flex items-center justify-center bg-[#02050b] rounded-xl border border-white/[0.08] p-3 min-h-[190px] max-h-[240px] overflow-hidden relative">
            {loadingPlate ? (
              <div className="text-center space-y-3 py-8 font-sans">
                <CircleNotch size={36} className="text-cyan-400 mx-auto animate-spin" />
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
                  className="w-full max-h-[220px] flex items-center justify-center [&>svg]:max-h-[210px] [&>svg]:w-auto [&>svg]:mx-auto [&>svg]:object-contain shadow-2xl"
                  dangerouslySetInnerHTML={{ __html: inspectModalItem.imageSvg }}
                />
              ) : (
                <img
                  src={inspectModalItem.imageSvg}
                  alt={inspectModalItem.name}
                  className="max-h-[210px] w-auto object-contain rounded-lg shadow-2xl mx-auto"
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-2">
                <PolyhedronWireframe tier={inspectAlloy.tier} size={110} />
                <div className="text-center mt-2 space-y-0.5">
                  <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                    HARDWARE UNIT MATRIX
                  </span>
                  <div className="text-xs font-mono font-bold text-slate-200">
                    <TacticalNumber value={inspectModalItem.amount} symbol="NARA" /> Committed
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Position Metrics Bar: Cells, Multiplier, Weight */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#03060e] border border-white/[0.08] text-center font-mono">
            <div>
              <span className="text-[9px] font-sans font-semibold text-slate-400 uppercase tracking-wider block">
                COMMITTED CELLS
              </span>
              <span className="text-xs sm:text-sm font-bold text-white mt-0.5 block">
                <TacticalNumber value={inspectModalItem.amount} symbol="NARA" decimals={0} noUnderline />
              </span>
            </div>
            <div>
              <span className="text-[9px] font-sans font-semibold text-slate-400 uppercase tracking-wider block">
                {isBoosted ? "EFFECTIVE MULTIPLIER" : "BASE MULTIPLIER"}
              </span>
              <span className={`text-xs sm:text-sm font-bold mt-0.5 block ${isBoosted ? "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]" : "text-cyan-300"}`}>
                {isBoosted ? `⚡ ${modalMultiplierStr}` : modalMultiplierStr}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-sans font-semibold text-slate-400 uppercase tracking-wider block">
                {isBoosted ? "EFFECTIVE WEIGHT" : "ENGINE WEIGHT"}
              </span>
              <span className={`text-xs sm:text-sm font-bold mt-0.5 block ${isBoosted ? "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]" : "text-amber-300"}`}>
                <TacticalNumber value={weightBN} symbol="" decimals={0} noUnderline />
              </span>
            </div>
          </div>

          {/* Trait Badges */}
          {inspectModalItem.attributes.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
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
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="border-t border-white/[0.08] px-5 py-3.5 bg-[#060a18] flex items-center justify-between gap-3 shrink-0">
          <div>
            {isSlotted ? (
              <button
                type="button"
                onClick={async () => {
                  await handleUnequip(inspectModalItem.tokenId);
                }}
                className="px-4 py-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 hover:text-rose-200 text-xs font-bold transition-all active:scale-95 flex items-center gap-2"
              >
                <ArrowArcLeft size={15} weight="bold" />
                RECALL FROM FLEET
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
                className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-2"
              >
                <span>⚡</span>
                {isDeckFull ? "FLEET DECK FULL (6/6)" : "DEPLOY TO FLEET"}
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

