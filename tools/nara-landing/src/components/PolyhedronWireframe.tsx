export type PolyhedronTier =
  | "gold"
  | "damascus"
  | "obsidian"
  | "emerald"
  | "slate"
  | "rare"
  | "uncommon"
  | "legendary"
  | "common";

interface PolyhedronWireframeProps {
  tier?: PolyhedronTier | string;
  size?: number;
  className?: string;
}

export default function PolyhedronWireframe({
  tier = "uncommon",
  size = 46,
  className = "",
}: PolyhedronWireframeProps) {
  const normTier = (tier || "").toLowerCase();

  const isGold = normTier.includes("gold") || normTier.includes("grail") || normTier.includes("apex");
  const isDamascus = (normTier.includes("damascus") || normTier.includes("meteorite") || normTier === "legendary") && !isGold;
  const isObsidian = normTier.includes("obsidian") || normTier === "rare" || normTier.includes("void") || normTier.includes("purple");
  const isEmerald = normTier.includes("emerald") || normTier === "uncommon" || normTier.includes("cybernetic");
  const isSlate = normTier.includes("slate") || normTier === "common" || normTier.includes("titanium");

  // Calibrated colors and lighting
  let strokeColor = "#34D399";
  let glowColor = "rgba(52, 211, 153, 0.85)";
  let fillColor = "rgba(52, 211, 153, 0.18)";
  let vertexColor = "#ECFDF5";
  let tierKey = "emerald";

  if (isGold) {
    strokeColor = "#FFD54F";
    glowColor = "rgba(255, 213, 79, 0.9)";
    fillColor = "rgba(255, 213, 79, 0.22)";
    vertexColor = "#FFFDE7";
    tierKey = "gold";
  } else if (isDamascus) {
    strokeColor = "#00F0FF";
    glowColor = "rgba(0, 240, 255, 0.85)";
    fillColor = "rgba(0, 240, 255, 0.2)";
    vertexColor = "#E0F7FA";
    tierKey = "damascus";
  } else if (isObsidian) {
    strokeColor = "#C084FC";
    glowColor = "rgba(192, 132, 252, 0.85)";
    fillColor = "rgba(192, 132, 252, 0.2)";
    vertexColor = "#F3E8FF";
    tierKey = "obsidian";
  } else if (isSlate) {
    strokeColor = "#94A3B8";
    glowColor = "rgba(148, 163, 184, 0.55)";
    fillColor = "rgba(148, 163, 184, 0.12)";
    vertexColor = "#FFFFFF";
    tierKey = "slate";
  } else if (isEmerald) {
    strokeColor = "#34D399";
    glowColor = "rgba(52, 211, 153, 0.85)";
    fillColor = "rgba(52, 211, 153, 0.18)";
    vertexColor = "#ECFDF5";
    tierKey = "emerald";
  }

  const filterId = `glow-${tierKey}-${size}`;

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={glowColor} />
          </filter>
        </defs>

        {/* 1. GOLD TIER: Stellated Octahedron / Merkaba Star */}
        {isGold && (
          <g filter={`url(#${filterId})`}>
            {/* Shaded faceted triangles */}
            <polygon points="24,4 38,20 24,26" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.85" />
            <polygon points="24,4 10,20 24,26" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.95" />
            <polygon points="24,44 38,28 24,22" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.85" />
            <polygon points="24,44 10,28 24,22" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.95" />
            
            {/* Outer stellated star edges */}
            <polygon points="24,4 30,16 42,16 33,24 37,36 24,29 11,36 15,24 6,16 18,16" stroke={strokeColor} strokeWidth="1.2" strokeLinejoin="round" />
            
            {/* Inner radiant diamond */}
            <polygon points="24,14 34,24 24,34 14,24" stroke={strokeColor} strokeWidth="1.4" fill={fillColor} />
            <line x1="24" y1="4" x2="24" y2="44" stroke={strokeColor} strokeWidth="1" strokeDasharray="3 2" />
            <line x1="6" y1="24" x2="42" y2="24" stroke={strokeColor} strokeWidth="1" strokeDasharray="3 2" />

            {/* Vertices */}
            {[[24, 4], [42, 16], [37, 36], [24, 44], [11, 36], [6, 16], [24, 24]].map(([vx, vy], idx) => (
              <circle key={idx} cx={vx} cy={vy} r="1.6" fill={vertexColor} />
            ))}
          </g>
        )}

        {/* 2. DAMASCUS TIER: Geodesic 20-Faced Icosahedron */}
        {isDamascus && (
          <g filter={`url(#${filterId})`}>
            {/* Shaded 3D Facets */}
            <polygon points="24,16 34,31 14,31" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.9" />
            <polygon points="24,5 41,15 24,16" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.5" />
            <polygon points="24,5 24,16 7,15" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.6" />
            <polygon points="14,31 34,31 24,43" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.4" />

            {/* Outer Hexagon Silhouette */}
            <polygon points="24,5 41,15 41,33 24,43 7,33 7,15" stroke={strokeColor} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />

            {/* Internal Wireframe Edges */}
            <g stroke={strokeColor} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
              <line x1="24" y1="5" x2="24" y2="16" />
              <line x1="7" y1="15" x2="24" y2="16" />
              <line x1="41" y1="15" x2="24" y2="16" />
              <line x1="24" y1="16" x2="34" y2="31" />
              <line x1="34" y1="31" x2="14" y2="31" />
              <line x1="14" y1="31" x2="24" y2="16" />
              <line x1="41" y1="15" x2="34" y2="31" />
              <line x1="41" y1="33" x2="34" y2="31" />
              <line x1="24" y1="43" x2="34" y2="31" />
              <line x1="7" y1="15" x2="14" y2="31" />
              <line x1="7" y1="33" x2="14" y2="31" />
              <line x1="24" y1="43" x2="14" y2="31" />
            </g>

            {/* Luminous Vertices */}
            {[[24, 5], [41, 15], [41, 33], [24, 43], [7, 33], [7, 15], [24, 16], [34, 31], [14, 31]].map(([vx, vy], idx) => (
              <circle key={idx} cx={vx} cy={vy} r="1.6" fill={vertexColor} />
            ))}
          </g>
        )}

        {/* 3. OBSIDIAN TIER: Double-Pyramid Octahedron Crystal */}
        {isObsidian && (
          <g filter={`url(#${filterId})`}>
            {/* Shaded crystal facets */}
            <polygon points="24,4 39,24 24,28" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.8" />
            <polygon points="24,4 9,24 24,28" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.9" />
            <polygon points="24,44 39,24 24,28" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.6" />
            <polygon points="24,44 9,24 24,28" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" opacity="0.7" />

            {/* Outer Diamond Crystal Silhouette */}
            <polygon points="24,4 39,24 24,44 9,24" stroke={strokeColor} strokeWidth="1.4" strokeLinejoin="round" />

            {/* Equator belt and internal keel */}
            <line x1="9" y1="24" x2="39" y2="24" stroke={strokeColor} strokeWidth="1.1" />
            <line x1="24" y1="4" x2="24" y2="44" stroke={strokeColor} strokeWidth="1.3" strokeDasharray="3 2" />
            <polygon points="24,12 33,24 24,36 15,24" stroke={strokeColor} strokeWidth="1" strokeDasharray="2 2" fill={fillColor} opacity="0.5" />

            {/* Vertices */}
            {[[24, 4], [39, 24], [24, 44], [9, 24], [24, 28]].map(([vx, vy], idx) => (
              <circle key={idx} cx={vx} cy={vy} r="1.7" fill={vertexColor} />
            ))}
          </g>
        )}

        {/* 4. EMERALD TIER: Hexagonal Bipyramid Prism (Cybernetic Emerald) */}
        {isEmerald && !isGold && !isDamascus && !isObsidian && (
          <g filter={`url(#${filterId})`}>
            {/* Facets */}
            <polygon points="24,5 38,18 24,25" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.85" />
            <polygon points="24,5 10,18 24,25" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.95" />
            <polygon points="24,43 38,30 24,25" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.75" />
            <polygon points="24,43 10,30 24,25" fill={fillColor} stroke={strokeColor} strokeWidth="0.75" opacity="0.85" />

            {/* Hexagonal waist silhouette */}
            <polygon points="24,5 38,18 38,30 24,43 10,30 10,18" stroke={strokeColor} strokeWidth="1.3" strokeLinejoin="round" />

            {/* Laser contours connecting equator to poles */}
            <line x1="10" y1="18" x2="38" y2="18" stroke={strokeColor} strokeWidth="1" opacity="0.7" />
            <line x1="10" y1="30" x2="38" y2="30" stroke={strokeColor} strokeWidth="1" opacity="0.7" />
            <line x1="24" y1="5" x2="24" y2="43" stroke={strokeColor} strokeWidth="1.3" />
            <line x1="24" y1="25" x2="38" y2="18" stroke={strokeColor} strokeWidth="0.9" />
            <line x1="24" y1="25" x2="10" y2="18" stroke={strokeColor} strokeWidth="0.9" />
            <line x1="24" y1="25" x2="38" y2="30" stroke={strokeColor} strokeWidth="0.9" />
            <line x1="24" y1="25" x2="10" y2="30" stroke={strokeColor} strokeWidth="0.9" />

            {/* Vertices */}
            {[[24, 5], [38, 18], [38, 30], [24, 43], [10, 30], [10, 18], [24, 25]].map(([vx, vy], idx) => (
              <circle key={idx} cx={vx} cy={vy} r="1.6" fill={vertexColor} />
            ))}
          </g>
        )}

        {/* 5. SLATE TIER: Isometric Precision Cube / Tesseract */}
        {isSlate && !isGold && !isDamascus && !isObsidian && !isEmerald && (
          <g filter={`url(#${filterId})`}>
            {/* Top rhomboid face */}
            <polygon points="24,6 38,15 24,24 10,15" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" opacity="0.9" />
            {/* Left face */}
            <polygon points="10,15 24,24 24,42 10,33" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" opacity="0.7" />
            {/* Right face */}
            <polygon points="24,24 38,15 38,33 24,42" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" opacity="0.8" />

            {/* Inner Tesseract/Cube core */}
            <line x1="24" y1="24" x2="24" y2="42" stroke={strokeColor} strokeWidth="1.4" />
            <line x1="10" y1="15" x2="24" y2="24" stroke={strokeColor} strokeWidth="1.4" />
            <line x1="38" y1="15" x2="24" y2="24" stroke={strokeColor} strokeWidth="1.4" />

            {/* Dashed hidden rear lines */}
            <line x1="24" y1="6" x2="24" y2="24" stroke={strokeColor} strokeWidth="0.9" strokeDasharray="3 2" opacity="0.45" />

            {/* Vertices */}
            {[[24, 6], [38, 15], [38, 33], [24, 42], [10, 33], [10, 15], [24, 24]].map(([vx, vy], idx) => (
              <circle key={idx} cx={vx} cy={vy} r="1.5" fill={vertexColor} />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
