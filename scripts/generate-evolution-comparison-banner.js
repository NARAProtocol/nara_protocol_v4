import fs from "node:fs";

const t1 = fs.readFileSync("evolution_tier1_dormant.svg", "utf8").replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
const t2 = fs.readFileSync("evolution_tier2_ignition.svg", "utf8").replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
const t3 = fs.readFileSync("evolution_tier3_turbine.svg", "utf8").replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
const t4 = fs.readFileSync("evolution_tier4_singularity.svg", "utf8").replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
const t5 = fs.readFileSync("evolution_tier5_supernova.svg", "utf8").replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");

const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5200 1200" width="5200" height="1200" style="background:#030407;">
  <!-- Header -->
  <rect width="5200" height="1200" fill="#030407"/>
  <text x="2600" y="80" fill="#FFFFFF" font-family="'Satoshi', sans-serif" font-size="44" font-weight="900" letter-spacing="4" text-anchor="middle">NARA V4 — DYNAMIC STRUCTURAL EVOLUTION METAMORPHOSIS</text>
  <text x="2600" y="120" fill="#00DFD8" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="700" letter-spacing="3" text-anchor="middle">ON-CHAIN YIELD PROGRESSION (0.00 ETH ➔ 10.00+ ETH LIFETIME CLAIM)</text>

  <!-- 5 Cards Side-by-Side -->
  <g transform="translate(50, 150) scale(0.96)">
    <g transform="translate(0, 0)">${t1}</g>
    <g transform="translate(1040, 0)">${t2}</g>
    <g transform="translate(2080, 0)">${t3}</g>
    <g transform="translate(3120, 0)">${t4}</g>
    <g transform="translate(4160, 0)">${t5}</g>
  </g>
</svg>`;

fs.writeFileSync("evolution_metamorphosis_banner.svg", banner);
console.log("✅ Panoramic comparison banner generated: evolution_metamorphosis_banner.svg");
