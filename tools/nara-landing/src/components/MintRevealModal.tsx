import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import {
  Sparkle,
  Cpu,
  X,
  Lightning,
  CircleNotch,
  SpeakerHigh,
  SpeakerSlash,
  Copy,
  Check,
  ArrowsClockwise,
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
import UnboxingChamber from "./UnboxingChamber";
import { unboxingAudio } from "../lib/unboxingAudio";

type UnboxingStage = "capsule" | "breaching" | "burst" | "card";

export default function MintRevealModal() {
  const { mintRevealItem } = useGrid();
  if (!mintRevealItem) return null;

  return (
    <MintRevealModalContent
      key={mintRevealItem.tokenId ? mintRevealItem.tokenId.toString() : "sample"}
      initialItem={mintRevealItem}
    />
  );
}

function MintRevealModalContent({
  initialItem,
}: {
  initialItem: PositionNftItem;
}) {
  const {
    mintRevealItem,
    setMintRevealItem,
    handleEquip,
    slottedTokenIds,
    navigate,
  } = useGrid();

  const currentItem = mintRevealItem || initialItem;

  const [loadingPlate, setLoadingPlate] = useState(false);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [stage, setStage] = useState<UnboxingStage>("capsule");
  const [isMuted, setIsMuted] = useState<boolean>(unboxingAudio.isMuted());
  const [copiedFlex, setCopiedFlex] = useState<boolean>(false);

  // 3D Gyro Tilt tracking
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    setMintRevealItem(null);
  };

  // Close on ESC key press
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-fetch the on-chain SVG plate and traits if missing on initial modal trigger
  useEffect(() => {
    if (currentItem.imageSvg && currentItem.attributes?.length > 0) return;

    let isMounted = true;
    setLoadingPlate(true);

    async function fetchPlate() {
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
  }, [currentItem.tokenId]);

  const alloy = extractAlloyFromItem(currentItem);
  const isSlotted = slottedTokenIds.some((id) => id.eq(currentItem.tokenId));
  const isDeckFull = slottedTokenIds.length >= 6;

  // Extract key attributes
  const participationPower =
    currentItem.attributes.find(
      (a) => a.trait_type === "Effective Staking Power"
    )?.value || "4.00X";

  const baseMultiplier =
    currentItem.attributes.find(
      (a) => a.trait_type === "Base Lock Multiplier"
    )?.value || "4.00X";

  const rank =
    currentItem.attributes.find(
      (a) => a.trait_type === "Progression Rank"
    )?.value || "Apex Veteran";

  const timeCommitment =
    currentItem.attributes.find(
      (a) => a.trait_type === "Time Commitment"
    )?.value || "365 Days";

  // Mute toggle
  const toggleSound = () => {
    const nextMuted = unboxingAudio.toggleMute();
    setIsMuted(nextMuted);
  };

  // Precise timing breach sequence: Chamber manages ring progress & fires onScanComplete
  const startBreach = () => {
    if (stage !== "capsule") return;
    setStage("breaching");
    unboxingAudio.playHydraulicBreach();
    unboxingAudio.playLaserScan();
  };

  const onScanComplete = () => {
    setStage("burst");
    unboxingAudio.playRevealBurst(alloy.name);
    setTimeout(() => {
      setStage("card");
    }, 750);
  };

  // Skip straight to card for fast flow
  const skipToCard = () => {
    setStage("card");
    unboxingAudio.playRevealBurst(alloy.name);
  };

  // Replay unboxing
  const replayUnboxing = () => {
    setStage("capsule");
    setMousePos({ x: 0, y: 0 });
  };

  // Copy flex summary to clipboard
  const handleCopyFlex = () => {
    const shareText = `👑 Unboxed ${alloy.badgeLabel}: ${alloy.name} (Token #${currentItem.tokenId.toString()}) on @NARAProtocol! Power: ${participationPower} · Pure On-Chain Swiss Chronometer SVG on Base Mainnet.`;
    navigator.clipboard.writeText(shareText);
    setCopiedFlex(true);
    setTimeout(() => setCopiedFlex(false), 2500);
  };

  // Pointer/mouse move over card for 3D tilt & holographic glare
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardContainerRef.current) return;
    const rect = cardContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x: Math.max(-0.5, Math.min(0.5, x)), y: Math.max(-0.5, Math.min(0.5, y)) });
  };

  const handlePointerLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  const onEquipClick = async () => {
    if (!isSlotted && !isDeckFull) {
      await handleEquip(currentItem.tokenId);
    }
    handleClose();
    navigate("/grid");
  };

  const onViewVaultClick = () => {
    handleClose();
    navigate("/vault");
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && stage === "card") handleClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-300"
    >
      {/* Background Ambient Aura Matching Alloy */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full blur-[160px] opacity-30 pointer-events-none transition-all duration-1000"
        style={{ backgroundColor: stage === "capsule" ? "#00F0FF" : alloy.accentColorHex }}
      />

      {/* Blinding Radial Flash on Burst Detonation */}
      {stage === "burst" && (
        <div
          className="absolute inset-0 pointer-events-none z-50 animate-[ping_0.8s_ease-out_forwards] opacity-60"
          style={{
            background: `radial-gradient(circle at 50% 50%, #FFF 0%, ${alloy.accentColorHex} 40%, transparent 80%)`,
          }}
        />
      )}

      {/* Main Modal Container */}
      <div className="relative w-full max-w-lg rounded-3xl bg-[#050813]/98 border border-white/20 p-5 sm:p-7 space-y-5 shadow-[0_30px_90px_rgba(0,0,0,0.95)] max-h-[94vh] overflow-y-auto font-sans ring-1 ring-white/10">
        {/* Top Control Bar: Audio Mute, Skip, Close */}
        <div className="flex items-center justify-between pb-1 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
              title={isMuted ? "Unmute sound effects" : "Mute sound effects"}
            >
              {isMuted ? <SpeakerSlash size={14} className="text-red-400" /> : <SpeakerHigh size={14} className="text-cyan-400" />}
              <span>{isMuted ? "SFX MUTED" : "SFX ACTIVE"}</span>
            </button>

            {stage !== "card" && (
              <button
                type="button"
                onClick={skipToCard}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-300 text-xs font-mono uppercase tracking-wider transition-colors"
              >
                SKIP TO CARD ▶
              </button>
            )}
          </div>

          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors"
            aria-label="Close unboxing modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* STAGE 1 & 2: THE SEALED CAPSULE & BREACH */}
        {(stage === "capsule" || stage === "breaching") && (
          <UnboxingChamber
            isBreaching={stage === "breaching"}
            onBreachClick={startBreach}
            onComplete={onScanComplete}
            tokenId={currentItem.tokenId.toString()}
            amountStr={`${parseFloat(ethers.utils.formatEther(currentItem.amount || 0)).toLocaleString()} CELLS`}
            durationStr={String(timeCommitment)}
          />
        )}

        {/* STAGE 3 & 4: THE GRAND 3D CARD REVEAL */}
        {(stage === "burst" || stage === "card") && (
          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-500">
            {/* Header Ribbon & Pull Title */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-[11px] font-sans font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                <Sparkle size={13} weight="fill" className="text-cyan-300 animate-spin" />
                <span>ON-CHAIN REVEAL · TOKEN #{currentItem.tokenId.toString()}</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl">{alloy.icon}</span>
                  <h2
                    className="text-xl sm:text-2xl font-black uppercase tracking-tight font-display drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                    style={{ color: alloy.accentColorHex }}
                  >
                    {alloy.name}
                  </h2>
                </div>
                <div className="inline-block">
                  <span
                    className={`text-[11px] font-mono font-bold px-3.5 py-1 rounded-full uppercase border ${alloy.bgClass} ${alloy.borderClass} ${alloy.colorClass} ${alloy.glowClass} tracking-wider`}
                  >
                    {alloy.badgeLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* 3D Interactive Holographic Foil Card Canvas */}
            <div
              ref={cardContainerRef}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              className="w-full flex items-center justify-center bg-[#02050b] rounded-2xl border py-7 sm:py-8 px-4 sm:px-6 relative overflow-hidden group shadow-inner transition-all duration-300 select-none cursor-grab active:cursor-grabbing"
              style={{
                borderColor: `${alloy.accentColorHex}50`,
                perspective: "850px",
                transformStyle: "preserve-3d",
              }}
            >
              {/* Radial Emergence Shockwave Rings */}
              {stage === "burst" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <div
                    className="w-44 h-44 rounded-full border-2 animate-[radialShockwave_0.75s_cubic-bezier(0.16,1,0.3,1)_forwards]"
                    style={{ borderColor: alloy.accentColorHex }}
                  />
                  <div
                    className="w-44 h-44 rounded-full border border-dashed animate-[radialShockwave_0.75s_cubic-bezier(0.16,1,0.3,1)_0.08s_forwards]"
                    style={{ borderColor: "#FFFFFF" }}
                  />
                </div>
              )}

              {/* Holographic Specular Glare & Prismatic Foil Overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-30 transition-opacity duration-300"
                style={{
                  background: `
                    radial-gradient(circle at ${50 + mousePos.x * 90}% ${
                      50 + mousePos.y * 90
                    }%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 25%, transparent 65%),
                    linear-gradient(${115 + mousePos.x * 40}deg, transparent 20%, rgba(0, 240, 255, 0.12) 40%, rgba(255, 215, 0, 0.15) 50%, rgba(255, 0, 128, 0.12) 60%, transparent 80%)
                  `,
                  mixBlendMode: "overlay",
                  opacity: stage === "burst" ? 0.4 : 1,
                }}
              />

              {/* Tilting 3D Card Shell with Physical Center Emergence */}
              <div
                className={`w-full max-w-[290px] will-change-transform ${
                  stage === "burst"
                    ? "animate-[emergeCard_0.75s_cubic-bezier(0.16,1,0.3,1)_forwards]"
                    : "transition-transform duration-100 ease-out"
                }`}
                style={{
                  transform:
                    stage === "burst"
                      ? undefined
                      : `rotateX(${mousePos.y * -32}deg) rotateY(${mousePos.x * 32}deg) translateZ(14px) scale3d(1.04, 1.04, 1.04)`,
                  boxShadow: `${mousePos.x * -32}px ${mousePos.y * -32 + 28}px 60px rgba(0,0,0,0.9), 0 0 45px ${
                    alloy.accentColorHex
                  }45`,
                  transformStyle: "preserve-3d",
                }}
              >
                {loadingPlate ? (
                  <div className="text-center space-y-3 py-16 font-sans">
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
                ) : currentItem.imageSvg ? (
                  currentItem.imageSvg.trim().startsWith("<svg") ? (
                    <div
                      className="w-full rounded-xl overflow-hidden shadow-2xl"
                      dangerouslySetInnerHTML={{ __html: currentItem.imageSvg }}
                    />
                  ) : (
                    <img
                      src={currentItem.imageSvg}
                      alt={currentItem.name}
                      className="w-full h-auto object-contain rounded-xl shadow-2xl"
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
                        <TacticalNumber value={currentItem.amount} symbol="NARA" /> Committed
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive 3D Holographic Hint */}
            <div className="text-center">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                MOVE CURSOR TO TILT HOLOGRAPHIC SPECULAR FOIL
              </span>
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
                  <TacticalNumber value={currentItem.amount} symbol="CELLS" />
                </span>
              </div>
            </div>

            {/* Proactive Guidance Callout */}
            <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-slate-300 flex items-start gap-2.5">
              <Lightning size={16} className="shrink-0 text-cyan-400 mt-0.5" />
              <p className="leading-relaxed">
                Your NFT is minted and active on Base. It commands continuous 15-minute pulse rewards. Slot it to your Fleet Deck for up to{" "}
                <strong className="text-cyan-300 font-semibold">+25% formation synergy</strong>!
              </p>
            </div>

            {/* Drop Rules Breakdown Accordion */}
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

            {/* Elite Action CTAs Tray */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
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
                  onClick={handleCopyFlex}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-sans font-bold text-slate-200 hover:text-white transition-all active:scale-95 text-center flex items-center justify-center gap-1.5"
                >
                  {copiedFlex ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedFlex ? "COPIED FLEX!" : "SHARE PULL"}</span>
                </button>

                <button
                  type="button"
                  onClick={replayUnboxing}
                  className="w-full sm:w-auto py-3 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-sans font-bold text-slate-300 hover:text-white transition-all active:scale-95 text-center flex items-center justify-center gap-1"
                  title="Replay the unboxing ceremony"
                >
                  <ArrowsClockwise size={14} />
                  <span>REPLAY</span>
                </button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={onViewVaultClick}
                  className="text-[11px] font-mono text-slate-400 hover:text-cyan-300 underline underline-offset-4 transition-colors"
                >
                  VIEW FULL POSITION IN VAULT & REWARD LEDGER →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes emergeCard {
          0% {
            opacity: 0;
            transform: scale3d(0.28, 0.28, 0.28) translateZ(-80px) rotateX(20deg);
            filter: brightness(2.2) drop-shadow(0 0 45px ${alloy.accentColorHex});
          }
          65% {
            opacity: 1;
            transform: scale3d(1.06, 1.06, 1.06) translateZ(24px) rotateX(-2deg);
            filter: brightness(1.2) drop-shadow(0 0 35px ${alloy.accentColorHex});
          }
          100% {
            opacity: 1;
            transform: scale3d(1.04, 1.04, 1.04) translateZ(14px) rotateX(0deg);
            filter: brightness(1) drop-shadow(0 0 25px ${alloy.accentColorHex});
          }
        }
        @keyframes radialShockwave {
          0% {
            transform: scale(0.25);
            opacity: 0.95;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

