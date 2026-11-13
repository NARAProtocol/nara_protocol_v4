// Smoke test: loads the page, exercises every control, fails on console errors, page errors
// or failed same-origin requests. Writes screenshots to SMOKE_OUT (default ./smoke-out).
//
//   SMOKE_URL            base URL (default http://127.0.0.1:4173 = `npm run preview`)
//   SMOKE_SWAP_GATED     "1" when the build has SWAP_PUBLIC_LAUNCHED=false (gated SWAP button + modal)
//   SMOKE_EXPECT_SUBMIT  expected victory submit state text (default: any honest state)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { CRYPTOSLIP_URL } from "../src/meme/config.js";

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
  const errText = req.failure()?.errorText || "";
  // In-flight background /api/* fetches cancelled when Playwright navigates/reloads are normal
  if (errText === "net::ERR_ABORTED" && req.url().includes("/api/")) return;
  if (req.url().startsWith(BASE) && !req.url().includes("/cdn-cgi/rum")) fail(`request failed: ${req.url()} ${errText}`);
});
page.on("response", (res) => {
  const u = res.url();
  if (
    u.startsWith(BASE) &&
    res.status() >= 400 &&
    !u.includes("/api/leaderboard") &&
    !u.includes("/api/quote") &&
    !u.includes("/api/supply")
  ) {
    fail(`HTTP ${res.status()} ${u}`);
  }
});
page.on("dialog", (d) => d.accept());

const popups = [];
context.on("page", (p) => { popups.push(p.url() || "(pending)"); p.close().catch(() => {}); });

console.log(`smoke: ${BASE}`);
await page.goto("/", { waitUntil: "load" });
await sleep(400);

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
// Also verify sticker mode share URL has proper slash (/s/1, never naraprotocol.ios/1)
await page.click("#tabBtn-sticker");
await page.click('[data-on-click="copyForgeTweetText"]');
const copiedStickerTweet = await page.evaluate(() => navigator.clipboard.readText());
if (!copiedStickerTweet.includes("https://naraprotocol.io/s/")) fail(`sticker share URL malformed: ${copiedStickerTweet}`);
await page.click("#tabBtn-flex");
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
  if (swapTag !== "A" || swapHref !== CRYPTOSLIP_URL) fail(`launched swap must link to CryptoSLIP, got <${swapTag} href=${swapHref}>`);
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

// First-screen artwork centerpiece & 1-Click Buy $NARA popup modal
if ((await page.locator("#heroBuySection").count()) !== 0) {
  fail("#heroBuySection must not exist on first screen");
}
const artBox = await page.locator("#artHousing").boundingBox();
if (!artBox || artBox.y > 180) {
  fail(`#artHousing must sit immediately at top of first screen, got y=${artBox?.y}`);
}
await page.click("#heroBuyBtn");
await sleep(250);
if (!(await page.locator("#buyNaraModal").isVisible())) {
  fail("clicking #heroBuyBtn did not open #buyNaraModal");
}
await page.click("#buyModalAssetUsdcBtn");
if ((await page.locator("#buyModalAmountInput").inputValue()) !== "100") {
  fail("switching modal asset to USDC did not preset 100");
}
await page.click("#buyModalAssetEthBtn");
if ((await page.locator("#buyModalAmountInput").inputValue()) !== "0.01") {
  fail("switching modal asset to ETH did not preset 0.01");
}
const countBeforeModalSpace = await readCounter();
await page.keyboard.press("Space");
await sleep(150);
if ((await readCounter()) !== countBeforeModalSpace) {
  fail("pressing Space inside open #buyNaraModal triggered background toilet flush");
}
await page.click("#buyTabSellBtn");
if ((await page.locator("#buyModalPayUnit").innerText()).trim() !== "NARA") {
  fail("switching to Sell tab did not switch pay unit to NARA");
}
await page.click("#buyTabBuyBtn");
await sleep(700);
await page.screenshot({ path: path.join(OUT, "buy-modal-1440.png") });
await page.keyboard.press("Escape");
await sleep(150);
if (await page.locator("#buyNaraModal").isVisible()) {
  fail("Escape did not close #buyNaraModal");
}
// Also verify top-bar #headerBuyBtn opens the modal
await page.click("#headerBuyBtn");
await sleep(200);
if (!(await page.locator("#buyNaraModal").isVisible())) {
  fail("clicking #headerBuyBtn did not open #buyNaraModal");
}
await page.keyboard.press("Escape");
await sleep(150);
note("clean artwork first-screen + buy popup modal ok");

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

// Interactive UX flows: Quest step 1 tracking, Locked card flush dredge, #BanksFail cipher jump, and 2-step Reset Run
if (!(await page.locator("#questStep1Badge").innerText()).includes("FLUSHED")) {
  fail("quest Step 1 did not update after first flush");
}
await page.click('[data-on-click="revealBanksFailCipher"]');
await sleep(250);
const specsOpen = await page.evaluate(() => Boolean(document.getElementById("protocolSpecsDetails")?.open));
if (!specsOpen) fail("#BanksFail cipher button did not open #protocolSpecsDetails");

// Wait for any previous flush cooldown, then click a locked card in the vault to trigger a dredge flush
await sleep(1100);
const flushesBeforeCard = Number(await page.locator("#flushCounter").innerText());
const lockedCard = page.locator("#vaultGrid button[aria-label^='Locked sticker']").first();
if (await lockedCard.count()) {
  await lockedCard.click();
  await sleep(300);
  const flushesAfterCard = Number(await page.locator("#flushCounter").innerText());
  if (flushesAfterCard <= flushesBeforeCard) fail("clicking locked vault card did not trigger flush");
  // Close auto-dismiss loot modal if it appeared on dredge
  if (await page.locator("#lootModal").isVisible()) {
    await page.keyboard.press("Escape");
    await sleep(150);
  }
}

// 2-step WebView-safe RESET RUN (first click arms, second click resets without native confirm())
await page.click("#resetRunBtn");
await sleep(100);
if (!(await page.locator("#resetRunBtn").innerText()).includes("CONFIRM RESET")) {
  fail("first RESET RUN click did not arm confirmation label");
}
await page.click("#resetRunBtn");
await sleep(200);
if ((await page.locator("#runFlushesCount").innerText()).trim() !== "0") {
  fail("second RESET RUN click did not reset runFlushesCount to 0");
}
note("interactive quest + cipher reveal + locked card dredge + 2-step reset ok");

// Victory flow: preset 12 cards and a fresh counter so the first flush guarantees a drop
await page.evaluate(() => {
  const unlocked = {};
  for (let i = 1; i <= 12; i++) unlocked[i] = { count: 1, serial: 1000 + i, firstDropAt: Date.now() };
  localStorage.setItem("nara_sewer_stash", JSON.stringify({ unlocked, activeStickerId: 1, totalDrops: 12 }));
  localStorage.setItem("nara_flush_progress", JSON.stringify({ flushCount: 0, previousTierLevel: 1 }));
  localStorage.setItem("nara_current_run_flushes_v1", "33");
});
await page.reload({ waitUntil: "load" });
await sleep(400);
await page.click("#headerFlushBtn");
await sleep(1500);
if (!(await page.locator("#victoryModal").isVisible())) fail("victory modal did not open after 12/12 drop");
else {
  const victoryText = await page.locator("#victoryModal").innerText();
  if (/NFT|onchain|on-chain/i.test(victoryText)) fail("victory modal has banned wording");
  if (!/SELF-REPORTED/i.test(victoryText)) fail("victory modal does not say self-reported");
  await page.click("#victoryPlatBtn-tg");
  await page.fill("#victoryHandleInput", "smoke_op");
  await page.click("#victoryAwardDetails summary");
  await page.fill("#victoryWalletInput", "0x1111111111111111111111111111111111111111");
  await page.fill("#victoryPostUrlInput", "https://x.com/nara/status/123456");
  // Turnstile (when configured) needs a moment to render its token
  await sleep(2500);
  await page.click("#victorySubmitBtn");
  await sleep(2500);
  const btn = (await page.locator("#victorySubmitBtnText").innerText()).trim();
  if (!/SAVED ON DEVICE|POSTED TO BOARD|SUBMIT SCORE/.test(btn)) fail(`unexpected submit state ${btn}`);
  if (btn === "SUBMIT SCORE" && !(await page.locator("#victorySubmitNotice").isVisible())) fail("submit gave no feedback");
  if (EXPECT_SUBMIT && !btn.includes(EXPECT_SUBMIT)) fail(`submit state "${btn}" does not include "${EXPECT_SUBMIT}"`);
  if (!(await page.locator("#victoryClaimPassBox").isVisible())) fail("Award Claim Pass box did not render after submit");
  const claimCode = (await page.locator("#victoryClaimCodeValue").innerText()).trim();
  if (!/^(NARA|PASS)-[A-F0-9]{4}-[A-F0-9]{4}$/.test(claimCode)) fail(`invalid claim code format: ${claimCode}`);
  const boardText = await page.locator("#fameBoardBody").innerText();
  if (!boardText.includes("@smoke_op")) fail("board did not render the entry");
  if (!boardText.includes("0x1111…1111")) fail("board did not render masked wallet hint");
  note(`victory submit state: ${btn} (${claimCode})`);
  await page.screenshot({ path: path.join(OUT, "victory-1440.png") });
  await page.keyboard.press("Escape");
  await sleep(200);

  // Claim Pass Verifier bar check
  await page.click("#toggleVerifyPassBtn");
  await sleep(150);
  await page.fill("#verifyHandleInput", "@smoke_op");
  await page.fill("#verifyClaimInput", claimCode);
  await page.click("#verifyPassBtn");
  await sleep(600);
  const verifyOut = (await page.locator("#verifyPassResult").innerText()).trim();
  if (!/VERIFIED|MATCHED/i.test(verifyOut)) fail(`claim code verifier failed: ${verifyOut}`);
  note(`claim verifier ok: ${verifyOut}`);
}

// Banned wording anywhere on the page, including closed modals (textContent, not innerText)
const bodyText = await page.evaluate(() => document.body.textContent || "");
for (const bad of [/\bNFTs?\b/i, /on-?chain (poop|collectible|sticker)/i, /Dividend/i, /Live Base telemetry/i, /VERIFIED ON BASE/i, /CONTRACT: VERIFIED/i, /15M EPOCH/i, /OFFICIAL RUN SCORE/i, /VICTORY PROOF/i]) {
  if (bad.test(bodyText)) fail(`banned wording on page: ${bad}`);
}
if (!/financial advice/i.test(bodyText)) fail("disclaimer line missing");

// Screenshots & Mobile Overflow + ?buy=1 Deep-Link Check
await page.screenshot({ path: path.join(OUT, "home-1440.png"), fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/", { waitUntil: "load" });
await sleep(500);
await page.screenshot({ path: path.join(OUT, "home-390.png"), fullPage: true });
const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
if (scrollW > 390) fail(`horizontal overflow on mobile: ${scrollW}px`);

await page.goto("/?buy=1", { waitUntil: "load" });
await sleep(400);
if (!(await page.locator("#buyNaraModal").isVisible())) fail("/?buy=1 deep-link did not auto-open #buyNaraModal");
if ((await page.evaluate(() => window.location.search)).includes("buy=1")) fail("/?buy=1 did not clean query param via replaceState");
await page.screenshot({ path: path.join(OUT, "buy-modal-390.png") });
const modalScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
if (modalScrollW > 390) fail(`horizontal overflow on mobile with buy modal open: ${modalScrollW}px`);

// Verify Victory modal also has zero horizontal overflow on 390px mobile viewport
await page.keyboard.press("Escape");
await sleep(200);
await page.click('[data-on-click="reopenVictoryIfWon"]');
await sleep(300);
if (await page.locator("#victoryModal").isVisible()) {
  const vicMobileW = await page.evaluate(() => document.documentElement.scrollWidth);
  if (vicMobileW > 390) fail(`horizontal overflow on mobile with victory modal open: ${vicMobileW}px`);
  await page.keyboard.press("Escape");
  await sleep(150);
}

// Full EIP-1193 Wallet Preflight Simulation Guard + 1-Click ETH->NARA Swap Lifecycle Test
const walletCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
await walletCtx.addInitScript(() => {
  const MOCK_ACCOUNT = "0x1111111111111111111111111111111111111111";
  const word = (v) => BigInt(v).toString(16).padStart(64, "0");
  const SQRT_PRICE = 1047402540000000000000000000000000n;
  window.__mockWalletState = {
    revertSwapSim: true,
    sentTxs: [],
    watchedAssets: [],
  };
  window.ethereum = {
    isMetaMask: true,
    on: () => {},
    removeListener: () => {},
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [MOCK_ACCOUNT];
      if (method === "eth_chainId") return "0x2105";
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_getBalance") return "0xde0b6b3a7640000"; // 1.0 ETH
      if (method === "eth_getBlockByNumber") {
        return { number: "0x3550000", timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16) };
      }
      if (method === "eth_call") {
        const call = (params && params[0]) || {};
        const data = String(call.data || "").toLowerCase();
        if (data.startsWith("0x3593564c")) {
          if (window.__mockWalletState.revertSwapSim) {
            const err = new Error("execution reverted: V4TooLittleReceived");
            err.code = 3;
            throw err;
          }
          return "0x";
        }
        if (data.startsWith("0x70a08231")) return "0x" + word(250_000_000n);
        if (data.startsWith("0x53e23e2e")) return "0x" + word(0n);
        if (data.startsWith("0x1e2eaeaf")) return "0x" + word(SQRT_PRICE);
        if (data.startsWith("0xc6a5026a")) return "0x" + word(26_000_000n) + word(0n) + word(0n) + word(100000n);
        if (data.startsWith("0xaa9d21cb")) return "0x" + word(4_250_000_000_000_000n) + word(120000n);
        if (data.startsWith("0x1a4aea4b")) return "0x" + word(1_203_800n) + word(24_796_200n);
        return "0x" + word(0n);
      }
      if (method === "eth_sendTransaction") {
        window.__mockWalletState.sentTxs.push(params[0]);
        return "0x" + "ab".repeat(32);
      }
      if (method === "eth_getTransactionReceipt") {
        return { status: "0x1", transactionHash: params[0] };
      }
      if (method === "wallet_watchAsset") {
        window.__mockWalletState.watchedAssets.push(params);
        return true;
      }
      return null;
    },
  };
});
const walletPage = await walletCtx.newPage();
await walletPage.goto("/?buy=1", { waitUntil: "load" });
await sleep(450);
// First click on #buyModalSubmitBtn connects the injected Base wallet in 1 click
await walletPage.click("#buyModalSubmitBtn");
await sleep(350);
// 1. Reverting swap is blocked BEFORE eth_sendTransaction
await walletPage.click("#buyModalSubmitBtn");
await sleep(350);
const statusAfterBlockedSim = await walletPage.locator("#buyModalStatusBox").innerText();
if (!/Safety simulation blocked a reverting swap/i.test(statusAfterBlockedSim)) {
  fail(`expected simulation guard error, got: ${statusAfterBlockedSim}`);
}
const sentCountAfterBlocked = await walletPage.evaluate(() => window.__mockWalletState.sentTxs.length);
if (sentCountAfterBlocked !== 0) fail("simulation revert did not block eth_sendTransaction");

// 2. Passing simulation broadcasts UniversalRouter swap & confirms receipt + wallet_watchAsset
await walletPage.evaluate(() => {
  window.__mockWalletState.revertSwapSim = false;
});
await sleep(450);
await walletPage.click("#buyModalSubmitBtn");
await sleep(500);
if (!(await walletPage.locator("#buyModalReceiptBox").isVisible())) {
  fail("confirmed ETH->NARA swap did not show #buyModalReceiptBox");
}
const swapCheck = await walletPage.evaluate(() => window.__mockWalletState.sentTxs[0]);
if (!swapCheck || swapCheck.to.toLowerCase() !== "0x6ff5693b99212da76ad316178a184ab56d299b43" || swapCheck.chainId !== "0x2105") {
  fail(`unexpected swap tx payload: ${JSON.stringify(swapCheck)}`);
}
if (swapCheck.data.toLowerCase().includes("eed718d239c5508775e312f60eb12792a49d4bba")) {
  fail("swap calldata must never reference secondary V3 NARA pool");
}
await walletPage.click("#buyReceiptWatchBtn");
await sleep(200);
const watched = await walletPage.evaluate(() => window.__mockWalletState.watchedAssets[0]);
if (!watched || !String(watched?.options?.image || "").endsWith("/nara_token_256.png")) {
  fail(`wallet_watchAsset did not pass /nara_token_256.png: ${JSON.stringify(watched)}`);
}
await walletCtx.close();
note("wallet preflight sim + 1-click swap e2e ok");

await browser.close();
if (popups.length) note(`popups opened (closed): ${popups.length}`);
if (problems.length) {
  console.error(`\nsmoke: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("smoke: ok");
