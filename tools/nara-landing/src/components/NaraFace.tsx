import { useState, useEffect, useRef } from "react";
import { TELEMETRY_NODES } from "../lib/content";

export default function NaraFace() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeNode, setActiveNode] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // Normalized between -1 and 1
      const normX = Math.max(-1, Math.min(1, (e.clientX - centerX) / (rect.width / 2)));
      const normY = Math.max(-1, Math.min(1, (e.clientY - centerY) / (rect.height / 2)));
      setMousePos({ x: normX, y: normY });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Parallax offsets
  const sigilTiltX = mousePos.x * 8;
  const sigilTiltY = mousePos.y * 8;

  return (
    <div 
      ref={containerRef}
      className="relative w-full max-w-[560px] aspect-square mx-auto flex items-center justify-center select-none"
    >
      {/* Background Quantum Aura Glow */}
      <div 
        className="absolute inset-4 rounded-full pointer-events-none transition-transform duration-700 ease-out"
        style={{
          background: "radial-gradient(circle, rgba(0,0,255,0.18) 0%, rgba(255,215,0,0.06) 45%, rgba(4,5,8,0) 70%)",
          transform: `translate(${mousePos.x * 20}px, ${mousePos.y * 20}px)`,
        }}
      />

      {/* Main Kinetic SVG Instrument */}
      <svg 
        viewBox="0 0 1000 1000" 
        className="w-full h-full transform-gpu relative z-10 overflow-visible"
        aria-label="NARA Sovereign Reticle Face"
      >
        <defs>
          <radialGradient id="naraOcularGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0000FF" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#00F0FF" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#FFD700" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#040508" stopOpacity="0" />
          </radialGradient>
          <filter id="sigilBloom" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* --- LAYER 1: OUTER STATIC BRUTALIST CHASSIS --- */}
        <rect 
          x="30" y="30" width="940" height="940" rx="24" 
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" 
        />
        {/* Precision Corner Chamfers */}
        <path d="M 40 120 V 40 H 120" fill="none" stroke="#0000FF" strokeWidth="4" strokeLinecap="square" />
        <path d="M 960 120 V 40 H 880" fill="none" stroke="#0000FF" strokeWidth="4" strokeLinecap="square" />
        <path d="M 40 880 V 960 H 120" fill="none" stroke="#0000FF" strokeWidth="4" strokeLinecap="square" />
        <path d="M 960 880 V 960 H 880" fill="none" stroke="#0000FF" strokeWidth="4" strokeLinecap="square" />

        {/* Chassis Cardinal Coordinates */}
        <text x="50" y="80" fill="#0000FF" fontFamily="'IBM Plex Mono', monospace" fontSize="14" fontWeight="700" letterSpacing="2">
          SEC // 01
        </text>
        <text x="950" y="80" textAnchor="end" fill="#FFD700" fontFamily="'IBM Plex Mono', monospace" fontSize="14" fontWeight="700" letterSpacing="2">
          BASE: 8453
        </text>
        <text x="50" y="940" fill="rgba(255,255,255,0.3)" fontFamily="'IBM Plex Mono', monospace" fontSize="13" letterSpacing="1.5">
          HOOK: 0x2088
        </text>
        <text x="950" y="940" textAnchor="end" fill="rgba(255,255,255,0.3)" fontFamily="'IBM Plex Mono', monospace" fontSize="13" letterSpacing="1.5">
          CAP: 1,000,000
        </text>

        {/* --- LAYER 2: ROTATING ASTROLABE COMPASS RINGS --- */}
        {/* Ring A: Outer Clockwise Slow Coordinate Ring (90s) */}
        <g className="animate-[spin_90s_linear_infinite]" style={{ transformOrigin: "500px 500px" }}>
          <circle cx="500" cy="500" r="410" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
          <circle cx="500" cy="500" r="390" fill="none" stroke="rgba(255, 215, 0, 0.25)" strokeWidth="1.5" strokeDasharray="3 9" />
          {/* Compass Ticks */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 500 500)`}>
              <line x1="500" y1="95" x2="500" y2="115" stroke={deg % 90 === 0 ? "#FFD700" : "rgba(255,255,255,0.3)"} strokeWidth={deg % 90 === 0 ? "2.5" : "1"} />
            </g>
          ))}
        </g>

        {/* Ring B: Counter-Clockwise Azimuth Ring (50s) */}
        <g className="animate-[spin_50s_linear_infinite_reverse]" style={{ transformOrigin: "500px 500px" }}>
          <circle cx="500" cy="500" r="320" fill="none" stroke="rgba(0, 0, 255, 0.4)" strokeWidth="1.5" strokeDasharray="18 10" />
          <circle cx="500" cy="500" r="280" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
          {/* Sector Crosshairs */}
          <line x1="160" y1="500" x2="220" y2="500" stroke="#0000FF" strokeWidth="2" opacity="0.8" />
          <line x1="780" y1="500" x2="840" y2="500" stroke="#0000FF" strokeWidth="2" opacity="0.8" />
          <line x1="500" y1="160" x2="500" y2="220" stroke="#0000FF" strokeWidth="2" opacity="0.8" />
          <line x1="500" y1="780" x2="500" y2="840" stroke="#0000FF" strokeWidth="2" opacity="0.8" />
        </g>

        {/* --- LAYER 3: 4 TACTICAL INTERACTIVE NODES --- */}
        {/* Node 0: Top (Hook) */}
        <g 
          className="cursor-pointer group"
          onMouseEnter={() => setActiveNode(0)}
          onMouseLeave={() => setActiveNode(null)}
        >
          <circle cx="500" cy="220" r="22" fill="#040508" stroke={activeNode === 0 ? "#00F0FF" : "rgba(255,255,255,0.2)"} strokeWidth="2" />
          <circle cx="500" cy="220" r="8" fill={activeNode === 0 ? "#00F0FF" : "#0000FF"} className="transition-colors duration-300" />
          <text x="500" y="185" textAnchor="middle" fill={activeNode === 0 ? "#00F0FF" : "#8E9AA8"} fontFamily="'IBM Plex Mono', monospace" fontSize="12" fontWeight="700" letterSpacing="1">
            01 // HOOK
          </text>
        </g>

        {/* Node 1: Right (Engine) */}
        <g 
          className="cursor-pointer group"
          onMouseEnter={() => setActiveNode(1)}
          onMouseLeave={() => setActiveNode(null)}
        >
          <circle cx="780" cy="500" r="22" fill="#040508" stroke={activeNode === 1 ? "#FFD700" : "rgba(255,255,255,0.2)"} strokeWidth="2" />
          <circle cx="780" cy="500" r="8" fill={activeNode === 1 ? "#FFD700" : "rgba(255,215,0,0.5)"} className="transition-colors duration-300" />
          <text x="815" y="504" textAnchor="start" fill={activeNode === 1 ? "#FFD700" : "#8E9AA8"} fontFamily="'IBM Plex Mono', monospace" fontSize="12" fontWeight="700" letterSpacing="1">
            02 // ENGINE
          </text>
        </g>

        {/* Node 2: Bottom (Range) */}
        <g 
          className="cursor-pointer group"
          onMouseEnter={() => setActiveNode(2)}
          onMouseLeave={() => setActiveNode(null)}
        >
          <circle cx="500" cy="780" r="22" fill="#040508" stroke={activeNode === 2 ? "#10B981" : "rgba(255,255,255,0.2)"} strokeWidth="2" />
          <circle cx="500" cy="780" r="8" fill={activeNode === 2 ? "#10B981" : "#0000FF"} className="transition-colors duration-300" />
          <text x="500" y="825" textAnchor="middle" fill={activeNode === 2 ? "#10B981" : "#8E9AA8"} fontFamily="'IBM Plex Mono', monospace" fontSize="12" fontWeight="700" letterSpacing="1">
            03 // RANGE
          </text>
        </g>

        {/* Node 3: Left (Supply) */}
        <g 
          className="cursor-pointer group"
          onMouseEnter={() => setActiveNode(3)}
          onMouseLeave={() => setActiveNode(null)}
        >
          <circle cx="220" cy="500" r="22" fill="#040508" stroke={activeNode === 3 ? "#FFFFFF" : "rgba(255,255,255,0.2)"} strokeWidth="2" />
          <circle cx="220" cy="500" r="8" fill={activeNode === 3 ? "#FFFFFF" : "#8E9AA8"} className="transition-colors duration-300" />
          <text x="185" y="504" textAnchor="end" fill={activeNode === 3 ? "#FFFFFF" : "#8E9AA8"} fontFamily="'IBM Plex Mono', monospace" fontSize="12" fontWeight="700" letterSpacing="1">
            04 // 1M CAP
          </text>
        </g>

        {/* --- LAYER 4: THE KINETIC CENTERPIECE (NARA "N" FACE) --- */}
        <g 
          style={{
            transform: `translate(${500 + sigilTiltX}px, ${500 + sigilTiltY}px)`,
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* Inner Monolith Core Disc with Sovereign Cut Emblem */}
          <circle cx="0" cy="0" r="160" fill="#040508" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
          
          {/* Dual Concentric White Rings */}
          <circle cx="0" cy="0" r="136" fill="none" stroke="#FFFFFF" strokeWidth="4" />
          <circle cx="0" cy="0" r="114" fill="none" stroke="#FFFFFF" strokeWidth="4" />

          {/* 15 Precision Epoch Rim Notches */}
          {Array.from({ length: 15 }).map((_, i) => (
            <line 
              key={i}
              x1="0" y1="-146" x2="0" y2="-104" 
              stroke="#FFFFFF" strokeWidth="5" strokeLinecap="square" 
              transform={`rotate(${i * 24})`} 
            />
          ))}

          {/* Solid White Sovereign Cut N Monogram */}
          <g fill="#FFFFFF">
            {/* Left Pillar with Chamfer */}
            <polygon points="-58,-28 -42,-44 -26,-44 -26,44 -58,44" />
            {/* Right Pillar with Chamfer */}
            <polygon points="26,-44 42,-44 58,-28 58,44 26,44" />
            {/* Diagonal Upper */}
            <polygon points="-42,-44 -20,-44 8,-2 -14,-2" />
            {/* Diagonal Lower */}
            <polygon points="2,12 24,12 42,44 20,44" />
            {/* Center Bridge with Incision */}
            <polygon points="-30,-30 -22,-30 30,30 22,30" />
          </g>
        </g>
      </svg>

      {/* Reactive Tactical HUD Overlay when a Node is active */}
      {activeNode !== null && (
        <div 
          className="absolute bottom-4 inset-x-4 sm:inset-x-8 p-4 rounded-lg bg-surface/95 border border-white/15 backdrop-blur-md text-left transition-all duration-200 z-20 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-1.5 font-mono text-[11px] tracking-wider">
            <span className="text-base-blue font-bold">{TELEMETRY_NODES[activeNode].label}</span>
            <span className="text-muted">{TELEMETRY_NODES[activeNode].spec}</span>
          </div>
          <div className="text-sm font-display font-bold text-silver mb-1">
            {TELEMETRY_NODES[activeNode].headline}
          </div>
          <div className="text-xs text-dim leading-relaxed font-sans">
            {TELEMETRY_NODES[activeNode].desc}
          </div>
        </div>
      )}
    </div>
  );
}
