#!/usr/bin/env node
// Fails the build if the landing tree references retired contracts, the Tailwind CDN,
// eval-permitting CSP, the dead meme.html URL, inline event handlers or inline scripts.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SCAN = ["index.html", "src", "public", "functions", "tests", "vite.config.ts", "tailwind.config.js", "wrangler.jsonc", "package.json", "README.md"];
const SKIP_DIRS = new Set(["node_modules", "dist", "fonts", "tokens", "smoke-out"]);
const BINARY = /\.(png|jpg|jpeg|webp|gif|ico|mp3|woff2?|svg)$/i;
const SELF = path.join("scripts", "check-denylist.cjs");

const RULES = [
  { re: /0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1/i, why: "retired NARA token (v3)" },
  { re: /0x58c209B95350aFBEFa17137CEd209f8c4b7D896D/i, why: "retired NARA token" },
  { re: /0x65E247AA3aa9C0131b2984b894c3D24c41341D7A/i, why: "retired NARA token" },
  { re: /0xE444de61752bD13D1D37Ee59c31ef4e489bd727C/i, why: "retired NARA token" },
  { re: /0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088/i, why: "retired v4 hook" },
  { re: /0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D/i, why: "retired v4 vault" },
  { re: /0x1e30584545a5b9e461ad72ff9c631c99039d30e1167932aa5eca5c734e297b2a/i, why: "retired v4 pool id" },
  { re: /cdn\.tailwindcss\.com/, why: "runtime Tailwind CDN", only: /(_headers|\.html|\.js|\.ts)$/i },
  { re: /unsafe-eval/, why: "CSP must not allow eval", only: /(_headers|\.html|\.js|\.ts)$/i },
  { re: /naraprotocol\.com\/meme\.html/, why: "dead canonical URL" },
  { re: /\son(click|dblclick|keydown|keyup|keypress|mouseenter|mouseleave|mouseover|mouseout|touchstart|touchend|load|error|submit|change|input|focus|blur)=/i, why: "inline event handler (breaks CSP)", onlyHtml: true },
  { re: /<script(?![^>]*\btype="module")(?![^>]*\bsrc=)/i, why: "inline <script> (breaks CSP)", onlyHtml: true },
  { re: /\b(NFT|on-?chain (poop|collectible|sticker)|Royal Dividend)\b/i, why: "stickers are device-local cards, not tokens", onlyHtml: true },
];

let hits = 0;

function scanFile(file) {
  if (BINARY.test(file)) return;
  const rel = path.relative(ROOT, file);
  if (rel === SELF) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rule of RULES) {
    // Address/URL rules apply to every scanned file; markup and wording rules only to the page and its module.
    if (rule.onlyHtml && !/\.(html|js)$/i.test(file)) continue;
    if (rule.only && !rule.only.test(file)) continue;
    const m = text.match(rule.re);
    if (m) {
      hits++;
      const line = text.slice(0, m.index).split("\n").length;
      console.error(`DENYLIST ${rel}:${line}: ${rule.why} -> ${m[0].slice(0, 70)}`);
    }
  }
}

function walk(p) {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(p))) return;
    for (const child of fs.readdirSync(p)) walk(path.join(p, child));
  } else {
    scanFile(p);
  }
}

for (const entry of SCAN) walk(path.join(ROOT, entry));

if (hits > 0) {
  console.error(`\n${hits} denylist hit(s). Fix them before building.`);
  process.exit(1);
}
console.log("denylist: clean");
