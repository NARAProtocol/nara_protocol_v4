// Smoke test: loads the page, exercises every control, fails on console errors, page errors
// or failed same-origin requests. Writes screenshots to SMOKE_OUT (default ./smoke-out).
//
//   SMOKE_URL            base URL (default http://127.0.0.1:4173 = `npm run preview`)
//   SMOKE_SWAP_GATED     "1" when the build has SWAP_PUBLIC_LAUNCHED=false (gated SWAP button + modal)
//   SMOKE_EXPECT_SUBMIT  expected victory submit state text (default: any honest state)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.SMOKE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const OUT = process.env.SMOKE_OUT || path.resolve("smoke-out");
const EXPECT_SWAP_GATED = process.env.SMOKE_SWAP_GATED === "1";
const EXPECT_SUBMIT = process.env.SMOKE_EXPECT_SUBMIT || "";
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const note = (m) => console.log(`  ${m}`);
const fail = (m) => { problems.push(m); console.error(`  FAIL ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Prefer an installed Chrome (no browser download needed); fall back to Playwright's Chromium.
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
} catch {
  browser = await chromium.launch({ headless: true });
}
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
  baseURL: BASE,
});
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  const loc = msg.location()?.url || "";
  if (loc.includes("challenges.cloudflare.com") || /font-size:0;color:transparent|challenges\.cloudflare\.com|cloudflarecaptcha\.com|Fetch API cannot load data:,/.test(text)) return;
  fail(`console.error: ${text}`);
});
page.on("pageerror", (err) => fail(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => {
  if (req.url().startsWith(BASE) && !req.url().includes("/cdn-cgi/rum")) fail(`request failed: ${req.url()} ${req.failure()?.errorText}`);
});
page.on("response", (res) => {
  const u = res.url();
  if (u.startsWith(BASE) && res.status() >= 400 && !u.includes("/api/leaderboard")) fail(`HTTP ${res.status()} ${u}`);
});
page.on("dialog", (d) => d.accept());

const popups = [];
context.on("page", (p) => { popups.push(p.url() || "(pending)"); p.close().catch(() => {}); });

console.log(`smoke: ${BASE}`);
await page.goto("/", { waitUntil: "networkidle" });

// Boot state
if ((await page.locator("#flushCounter").innerText()).trim() !== "0") fail("flush counter not 0 on fresh load");
if (!(await page.locator("#tweetPreviewDisplay").innerText()).includes("0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f")) fail("tweet preview missing full CA");
const ticker = await page.locator("#sewerTickerText").innerText();
if (!/Local game ready/.test(ticker)) fail(`boot log line unexpected: ${ticker}`);

// SFX toggle cycles flush -> coin -> off -> flush
for (const expected of ["SFX: COIN", "SFX: OFF", "SFX: FLUSH"]) {
  await page.click("#audioToggleBtn");
  const label = (await page.locator("#audioLabel").innerText()).trim();
  if (label !== expected) fail(`audio label ${label} != ${expected}`);
}
note("sfx toggle ok");

// Flush x3 with the 1.0s cooldown. Loot drops open a modal whose backdrop click is itself a
// flush (by design), so dispatch clicks on the button directly and close modals with Escape.
const readCounter = async () => Number(await page.locator("#flushCounter").innerText());
const clickFlush = () => page.evaluate(() => document.getElementById("headerFlushBtn").click());
const before = await readCounter();
for (let i = 1; i <= 3; i++) {
  await clickFlush();
  await sleep(1100);
  await page.keyboard.press("Escape");
}
if ((await readCounter()) !== before + 3) fail(`expected ${before + 3} flushes, got ${await readCounter()}`);
// Two clicks in the same tick: the second must be throttled by the cooldown
await page.evaluate(() => { const b = document.getElementById("headerFlushBtn"); b.click(); b.click(); });
await sleep(150);
if ((await readCounter()) !== before + 4) fail(`cooldown did not throttle: ${await readCounter()}`);
if (!(await page.locator("#quickTweetLabel").innerText()).includes(`[${before + 4}]`)) fail("quick tweet label not updated");
await sleep(1100);
await page.keyboard.press("Escape");
note("flush + cooldown ok");

// Copy CA
await page.click("#copyBtn");
const clip = await page.evaluate(() => navigator.clipboard.readText());
if (clip !== "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f") fail(`clipboard got ${clip}`);
note("copy ca ok");

// Tweet modes + reroll + copy tweet
for (const mode of ["receipt", "lore", "unhinged", "sticker", "flex"]) {
  await page.click(`#tabBtn-${mode}`);
  const text = await page.locator("#tweetPreviewDisplay").innerText();
  if (!text.trim()) fail(`empty preview for ${mode}`);
  if (!text.includes("0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f")) fail(`missing full CA in ${mode} preview`);
  if (/0x91FB\.\.\.Ae0f|Card image|naraprotocol\.(com|io)/i.test(text)) fail(`truncated CA, fake image notice, or duplicate URL in ${mode} preview: ${text.slice(0, 120)}`);
  if (/NFT|on-chain|onchain|meme\.html/i.test(text)) fail(`banned wording in ${mode} preview: ${text.slice(0, 80)}`);
}
await page.click('[data-on-click="rerollActiveMode"]');
await page.click('[data-on-click="copyForgeTweetText"]');
const copiedTweet = await page.evaluate(() => navigator.clipboard.readText());
const copiedUrlMatch = copiedTweet.match(/https:\/\/[^\s]+/);
if (!copiedUrlMatch || new URL(copiedUrlMatch[0]).hostname !== "naraprotocol.io") fail("copied tweet lacks share url");
note("forge ok");

// Share anchors carry encoded intent URLs
const xHref = await page.locator("#forgeXBtn").getAttribute("href");
if (!xHref?.startsWith("https://x.com/intent/post?text=")) fail(`forge X href ${xHref}`);
const castHref = await page.locator("#forgeCastBtn").getAttribute("href");
if (!castHref?.startsWith("https://warpcast.com/~/compose?text=")) fail(`forge cast href ${castHref}`);

// Binding integrity: every data-on-* attribute resolved to a known action
if (await page.evaluate(() => document.documentElement.hasAttribute("data-nara-bind-error"))) {
  fail(`unknown data-on-* action: ${await page.evaluate(() => document.documentElement.getAttribute("data-nara-bind-error"))}`);
}

// SWAP gate. Gated: a <button> with no href, so middle-click / open-in-new-tab cannot reach
// CryptoSLIP. Launched: a real <a href> with noopener.
const swapTag = await page.locator("#headerSwapBtn").evaluate((el) => el.tagName);
const swapHref = await page.locator("#headerSwapBtn").getAttribute("href");
if (EXPECT_SWAP_GATED) {
  if (swapTag !== "BUTTON" || swapHref !== null) fail(`gated swap must be a <button> without href, got <${swapTag} href=${swapHref}>`);
  const popupsBefore = popups.length;
  await page.click("#headerSwapBtn", { button: "middle" });
  await sleep(500);
  if (popups.length !== popupsBefore) fail("middle-click on gated SWAP opened a new tab");
  await page.keyboard.press("Escape");
} else {
  if (swapTag !== "A" || swapHref !== "https://cryptoslip-g29s.4everland.app/?v=cs-1794196154337") fail(`launched swap must link to CryptoSLIP, got <${swapTag} href=${swapHref}>`);
  const swapRel = await page.locator("#headerSwapBtn").getAttribute("rel");
  if (!/noopener/.test(swapRel || "")) fail("swap link lacks rel=noopener");
}
await page.click("#headerSwapBtn");
await sleep(400);
const modalVisible = await page.locator("#swapPrelaunchModal").isVisible();
if (EXPECT_SWAP_GATED && !modalVisible) fail("swap modal did not open while gated");
if (!EXPECT_SWAP_GATED && modalVisible) fail("swap modal opened although launched");
if (modalVisible) {
  const modalText = await page.locator("#swapPrelaunchModal").innerText();
  if (!/CryptoSLIP/i.test(modalText)) fail("swap modal does not mention CryptoSLIP");
  if (/VERIFIED/.test(modalText)) fail("swap modal still claims VERIFIED");
  await page.keyboard.press("Escape");
  if (await page.locator("#swapPrelaunchModal").isVisible()) fail("Escape did not close swap modal");
}
note(`swap gate ok (gated=${EXPECT_SWAP_GATED})`);

// MetaMask button without a wallet falls back to copy
await page.click("#mmBtn");
await sleep(300);
if (!(await page.locator("#mmBtnLabel").innerText()).includes("CA COPIED")) fail("metamask fallback label missing");
note("metamask fallback ok");

// Leaderboard refresh does not throw
await page.click('[data-on-click="refreshLeaderboardUI"]');
await sleep(300);

// External links: every target=_blank anchor has rel=noopener and an https href
const anchors = await page.$$eval('a[target="_blank"]', (as) => as.map((a) => ({ href: a.getAttribute("href"), rel: a.getAttribute("rel") })));
for (const a of anchors) {
  if (!/noopener/.test(a.rel || "")) fail(`anchor without noopener: ${a.href}`);
  if (!/^https:\/\//.test(a.href || "")) fail(`non-https external anchor: ${a.href}`);
}
note(`external anchors ok (${anchors.length})`);

// Victory flow: preset 12 cards and a fresh counter so the first flush guarantees a drop
await page.evaluate(() => {
  const unlocked = {};
  for (let i = 1; i <= 12; i++) unlocked[i] = { count: 1, serial: 1000 + i, firstDropAt: Date.now() };
  localStorage.setItem("nara_sewer_stash", JSON.stringify({ unlocked, activeStickerId: 1, totalDrops: 12 }));
  localStorage.setItem("nara_flush_progress", JSON.stringify({ flushCount: 0, previousTierLevel: 1 }));
  localStorage.setItem("nara_current_run_flushes_v1", "33");
});
await page.reload({ waitUntil: "networkidle" });
await page.click("#headerFlushBtn");
await sleep(1500);
if (!(await page.locator("#victoryModal").isVisible())) fail("victory modal did not open after 12/12 drop");
else {
  const victoryText = await page.locator("#victoryModal").innerText();
  if (/NFT|onchain|on-chain/i.test(victoryText)) fail("victory modal has banned wording");
  if (!/SELF-REPORTED/i.test(victoryText)) fail("victory modal does not say self-reported");
  await page.fill("#victoryHandleInput", "smoke_op");
  // Turnstile (when configured) needs a moment to render its token
  await sleep(2500);
  await page.click("#victorySubmitBtn");
  await sleep(2500);
  const btn = (await page.locator("#victorySubmitBtnText").innerText()).trim();
  if (!/SAVED ON DEVICE|POSTED TO BOARD|SUBMIT SCORE/.test(btn)) fail(`unexpected submit state ${btn}`);
  if (btn === "SUBMIT SCORE" && !(await page.locator("#victorySubmitNotice").isVisible())) fail("submit gave no feedback");
  if (EXPECT_SUBMIT && !btn.includes(EXPECT_SUBMIT)) fail(`submit state "${btn}" does not include "${EXPECT_SUBMIT}"`);
  const boardText = await page.locator("#fameBoardBody").innerText();
  if (!boardText.includes("@smoke_op")) fail("board did not render the entry");
  note(`victory submit state: ${btn}`);
  await page.screenshot({ path: path.join(OUT, "victory-1440.png") });
  await page.keyboard.press("Escape");
}

// Banned wording anywhere on the page, including closed modals (textContent, not innerText)
const bodyText = await page.evaluate(() => document.body.textContent || "");
for (const bad of [/\bNFTs?\b/i, /on-?chain (poop|collectible|sticker)/i, /Dividend/i, /Live Base telemetry/i, /VERIFIED ON BASE/i, /CONTRACT: VERIFIED/i, /15M EPOCH/i, /OFFICIAL RUN SCORE/i, /VICTORY PROOF/i]) {
  if (bad.test(bodyText)) fail(`banned wording on page: ${bad}`);
}
if (!/financial advice/i.test(bodyText)) fail("disclaimer line missing");

// Screenshots
await page.screenshot({ path: path.join(OUT, "home-1440.png"), fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/", { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(OUT, "home-390.png"), fullPage: true });
const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
if (scrollW > 390) fail(`horizontal overflow on mobile: ${scrollW}px`);

await browser.close();
if (popups.length) note(`popups opened (closed): ${popups.length}`);
if (problems.length) {
  console.error(`\nsmoke: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("smoke: ok");
