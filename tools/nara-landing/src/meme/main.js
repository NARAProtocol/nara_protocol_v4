import {
  NARA_CONTRACT, NARA_SYMBOL, NARA_DECIMALS, NARA_IMAGE, BASE_CHAIN_ID_HEX,
  CANONICAL_URL, resolveCryptoSlipBuyUrl, SWAP_PUBLIC_LAUNCHED, TURNSTILE_SITE_KEY,
} from "./config.js";
import { notifyMiniAppHostReady } from "./erc8021.js";
import {
  initBuyExperience,
  isBuyModalOpen,
  openBuyModal,
  closeBuyModal,
  copyBuyModalCA,
  setBuyModalDirection,
  setBuyModalAsset,
  setBuyModalPreset,
  setBuyModalMax,
  setBuyModalSlippage,
  handleBuyModalAmountInput,
  disconnectBuyWallet,
  getConnectedWalletProvider,
  getConnectedAccount,
  applyLowFeeSwapSize,
  refreshBuyQuote,
  executeBuyModalSwap,
} from "./buyModal.js";
import {
  initAnchorSeats,
  refreshAnchorSeats,
  selectAnchorSeat,
  setAnchorTierFilter,
  cancelSeatReview,
  copySeatLink,
  toggleAnchorSpecs,
  toggleCardHelp,
  buyAnchorSeat,
  jumpToAnchorSeats,
  getAnchorShowcaseSummary,
} from "./anchorSeats.js";

function syncBodyScrollLock() {
  if (typeof document === "undefined") return;
  const modalIds = ["lootModal", "victoryModal", "swapPrelaunchModal", "buyNaraModal", "anchorCardHelpModal", "anchorSeatReviewDrawer"];
  const anyOpen = modalIds.some((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });
  document.body.classList.toggle("overflow-hidden", anyOpen);
}

// --- SWAP GATE ---
// SWAP_PUBLIC_LAUNCHED lives in config.js. While false, SWAP shows the pre-launch modal.
// When true, the header SWAP element is a real <a href=CRYPTOSLIP_URL target=_blank rel=noopener>
// and the browser follows it (popup-blocker proof); non-anchor callers open it safely.
function handleSwapButtonClick(e) {
  playMechanicalClick();
  if (SWAP_PUBLIC_LAUNCHED) {
    // The control is a real <a href=CRYPTOSLIP_URL target=_blank rel=noopener> (see initSwapControl);
    // the browser follows it. Non-anchor callers open it safely.
    const isAnchor = !!(e && e.currentTarget && e.currentTarget.tagName === "A");
    if (!isAnchor) openSafeWindow(resolveCryptoSlipBuyUrl());
    return;
  }
  if (e && e.preventDefault) e.preventDefault();
  const modal = document.getElementById("swapPrelaunchModal");
  if (modal) {
    modal.classList.remove("hidden");
    syncBodyScrollLock();
  }
}

// While gated, the header SWAP control is a <button> without an href, so middle-click,
// "open link in new tab", long-press and link previews cannot reach CryptoSLIP. Once
// launched it becomes a real link before any user interaction (popup-blocker proof).
function initSwapControl() {
  const el = document.getElementById("headerSwapBtn");
  if (!el || !SWAP_PUBLIC_LAUNCHED) return;
  const a = document.createElement("a");
  a.id = el.id;
  a.className = `${el.className} no-underline`;
  a.href = resolveCryptoSlipBuyUrl();
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = "Swap on CryptoSLIP, the NARA swap app (opens in a new tab)";
  a.setAttribute("aria-label", "Swap on CryptoSLIP, opens in a new tab");
  a.setAttribute("data-on-click", "handleSwapButtonClick");
  while (el.firstChild) a.appendChild(el.firstChild);
  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  mark.className = "hidden sm:inline text-[9px] opacity-70";
  mark.textContent = "↗";
  a.appendChild(mark);
  el.replaceWith(a);
}

function closeSwapModal(e) {
  if (e) e.stopPropagation();
  playMechanicalClick();
  const modal = document.getElementById("swapPrelaunchModal");
  if (modal) {
    modal.classList.add("hidden");
    syncBodyScrollLock();
  }
}

// --- HIGH-PERFORMANCE PROCEDURAL & RECORDED AUDIO ENGINE ---
let audioCtx = null;
let masterLimiter = null;
let cachedPinkNoiseBuffer = null;
let realFlushAudioBuffer = null;
let isFlushAudioLoading = false;
// Modes: 'flush' (authentic recorded flush & bubbling siphon) | 'arcade' (crisp 8-bit candle coin) | 'mute'
let soundMode = 'flush';

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();

      // Master Dynamics Compressor & Soft Limiter:
      // Prevents digital clipping, distortion, and ear fatigue during rapid 100+ spam clicking
      masterLimiter = audioCtx.createDynamicsCompressor();
      masterLimiter.threshold.setValueAtTime(-14, audioCtx.currentTime);
      masterLimiter.knee.setValueAtTime(6, audioCtx.currentTime);
      masterLimiter.ratio.setValueAtTime(12, audioCtx.currentTime);
      masterLimiter.attack.setValueAtTime(0.003, audioCtx.currentTime);
      masterLimiter.release.setValueAtTime(0.12, audioCtx.currentTime);
      masterLimiter.connect(audioCtx.destination);

      // Pre-allocate 0.8s cyclic Pink Noise buffer once
      // Pink noise has equal energy per octave (-3dB/octave) which perfectly models turbulent fluids & water whoosh
      const bufferSize = Math.floor(audioCtx.sampleRate * 0.8);
      cachedPinkNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = cachedPinkNoiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      }
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Load authentic recorded flush audio file from public endpoint /flush.mp3
function loadRealFlushAudio() {
  if (realFlushAudioBuffer || isFlushAudioLoading) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  isFlushAudioLoading = true;
  fetch('/flush.mp3')
    .then(res => {
      if (!res.ok) throw new Error('Audio fetch status ' + res.status);
      return res.arrayBuffer();
    })
    .then(ab => ctx.decodeAudioData(ab))
    .then(decodedBuf => {
      realFlushAudioBuffer = decodedBuf;
      isFlushAudioLoading = false;
    })
    .catch(err => {
      console.warn('Fallback to procedural liquid flush:', err);
      isFlushAudioLoading = false;
    });
}

// Audio unlock for mobile and desktop user gestures
function unlockAudioOnce() {
  getAudioContext();
  loadRealFlushAudio();
  window.removeEventListener('touchstart', unlockAudioOnce);
  window.removeEventListener('pointerdown', unlockAudioOnce);
}
window.addEventListener('touchstart', unlockAudioOnce, { passive: true });
window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
if (document.readyState === 'complete') {
  setTimeout(loadRealFlushAudio, 250);
} else {
  window.addEventListener('load', () => setTimeout(loadRealFlushAudio, 250));
}

function toggleAudio() {
  const label = document.getElementById("audioLabel");
  const onIcon = document.getElementById("audioIconOn");
  const offIcon = document.getElementById("audioIconOff");
  const modeBadge = document.getElementById("audioModeBadge");

  if (soundMode === 'flush') {
    soundMode = 'arcade';
    if (label) label.innerText = "SFX: COIN";
    if (modeBadge) modeBadge.innerText = "🪙";
    if (onIcon) {
      onIcon.classList.remove("hidden", "text-naraGreen");
      onIcon.classList.add("text-amber-400");
    }
    if (offIcon) offIcon.classList.add("hidden");
    try { playArcadeChime(getAudioContext()); } catch (e) {}
  } else if (soundMode === 'arcade') {
    soundMode = 'mute';
    if (label) label.innerText = "SFX: OFF";
    if (modeBadge) modeBadge.innerText = "🔇";
    if (onIcon) onIcon.classList.add("hidden");
    if (offIcon) offIcon.classList.remove("hidden");
  } else {
    soundMode = 'flush';
    if (label) label.innerText = "SFX: FLUSH";
    if (modeBadge) modeBadge.innerText = "💧";
    if (onIcon) {
      onIcon.classList.remove("hidden", "text-amber-400");
      onIcon.classList.add("text-naraGreen");
    }
    if (offIcon) offIcon.classList.add("hidden");
    playHydraulicFlushSound();
  }
}

// Subtle low-pitch mechanical hydraulic valve resistance click when clicked while recharging
function playRechargeTick() {
  if (soundMode === 'mute') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const target = masterLimiter || ctx.destination;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.035);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);
    osc.connect(gain);
    gain.connect(target);
    osc.start(t);
    osc.stop(t + 0.042);
  } catch (e) {}
}

function playMechanicalClick() {
  if (soundMode === 'mute') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const target = masterLimiter || ctx.destination;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(750, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.024);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.045, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    osc.connect(gain);
    gain.connect(target);
    osc.start(t);
    osc.stop(t + 0.032);
  } catch (e) {}
}

// Minnaert physical bubble blip synthesis (upward frequency chirp simulating rising/collapsing liquid bubble)
function playLiquidBubble(ctx, target, startTime, startFreq, endFreq, dur, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + dur);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + dur * 0.22);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

  osc.connect(gain);
  gain.connect(target);
  osc.start(startTime);
  osc.stop(startTime + dur + 0.01);
}

// Authentic Liquid Swirl & Bubbling Drain Siphon
// Zero harsh transients: smooth 70ms attack, resonant bandpass swirl, playful bubbles, gentle porcelain hum
function playWaterVortexFlush(ctx) {
  const t = ctx.currentTime;
  const target = masterLimiter || ctx.destination;

  // 1. Fluid Swirl Layer: Filtered Pink Noise with resonant bandpass sweep
  if (cachedPinkNoiseBuffer) {
    const noise = ctx.createBufferSource();
    noise.buffer = cachedPinkNoiseBuffer;

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = "bandpass";
    bpFilter.Q.setValueAtTime(2.6, t);
    bpFilter.frequency.setValueAtTime(540, t);
    bpFilter.frequency.exponentialRampToValueAtTime(210, t + 0.58);

    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = "lowpass";
    lpFilter.frequency.setValueAtTime(680, t);
    lpFilter.frequency.exponentialRampToValueAtTime(160, t + 0.58);

    const noiseGain = ctx.createGain();
    // Gentle 70ms linear attack completely eliminates the gunshot / firing transient
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.linearRampToValueAtTime(0.18, t + 0.07);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);

    noise.connect(bpFilter);
    bpFilter.connect(lpFilter);
    lpFilter.connect(noiseGain);
    noiseGain.connect(target);

    noise.start(t);
    noise.stop(t + 0.65);
  }

  // 2. Playful Water Bubble Blips (bloop, bloop, glug)
  playLiquidBubble(ctx, target, t + 0.03, 260, 520, 0.045, 0.09);
  playLiquidBubble(ctx, target, t + 0.10, 380, 760, 0.040, 0.08);
  playLiquidBubble(ctx, target, t + 0.22, 220, 460, 0.055, 0.10);
  playLiquidBubble(ctx, target, t + 0.35, 310, 620, 0.048, 0.07);

  // 3. Gentle Porcelain Resonator (warm water mass, NOT an artillery cannon)
  const drainOsc = ctx.createOscillator();
  const drainGain = ctx.createGain();
  drainOsc.type = "sine";
  drainOsc.frequency.setValueAtTime(105, t);
  drainOsc.frequency.exponentialRampToValueAtTime(55, t + 0.48);

  drainGain.gain.setValueAtTime(0.0001, t);
  drainGain.gain.linearRampToValueAtTime(0.09, t + 0.08);
  drainGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.50);

  drainOsc.connect(drainGain);
  drainGain.connect(target);

  drainOsc.start(t);
  drainOsc.stop(t + 0.52);
}

// Crisp 8-Bit Green Candle Arcade Ping (for high-speed degen gaming)
function playArcadeChime(ctx) {
  const t = ctx.currentTime;
  const target = masterLimiter || ctx.destination;
  const notes = [
    { freq: 987.77, start: t, dur: 0.10, vol: 0.11 },      // B5
    { freq: 1318.51, start: t + 0.06, dur: 0.22, vol: 0.14 } // E6
  ];

  notes.forEach(({ freq, start, dur, vol }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(target);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
}

// Celebratory Promotion Fanfare (Plays on Tier Rank Promotions)
function playPromotionFanfare() {
  if (soundMode === 'mute') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const target = masterLimiter || ctx.destination;
    const chord = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    chord.forEach((freq, idx) => {
      const start = t + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
      osc.connect(gain);
      gain.connect(target);
      osc.start(start);
      osc.stop(start + 0.40);
    });
  } catch (e) {}
}

// Sparkling 4-Note Loot Drop Fanfare (Plays when Dredging Sticker Cards)
function playLootDropChime() {
  if (soundMode === 'mute') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const target = masterLimiter || ctx.destination;
    const notes = [
      { freq: 587.33, start: t, dur: 0.12, vol: 0.05 },        // D5
      { freq: 739.99, start: t + 0.07, dur: 0.12, vol: 0.06 }, // F#5
      { freq: 880.00, start: t + 0.14, dur: 0.14, vol: 0.07 }, // A5
      { freq: 1174.66, start: t + 0.22, dur: 0.26, vol: 0.08 } // D6
    ];
    notes.forEach(({ freq, start, dur, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(target);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  } catch (e) {}
}

// Glorious Gold Victory Fanfare (Plays on Conquering all 12/12 Cards)
function playVictoryFanfare() {
  if (soundMode === 'mute') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const target = masterLimiter || ctx.destination;
    const arpeggio = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C5, E5, G5, C6, E6, G6
    arpeggio.forEach((freq, idx) => {
      const start = t + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
      osc.connect(gain);
      gain.connect(target);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  } catch (e) {}
}

function playHydraulicFlushSound() {
  if (soundMode === 'mute') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (soundMode === 'arcade') {
      playArcadeChime(ctx);
    } else if (realFlushAudioBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = realFlushAudioBuffer;
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.9, ctx.currentTime);
      source.connect(gainNode);
      gainNode.connect(masterLimiter || ctx.destination);
      source.start(ctx.currentTime);
    } else {
      loadRealFlushAudio();
      playWaterVortexFlush(ctx);
    }
  } catch (e) {
    try { playWaterVortexFlush(getAudioContext()); } catch (err) {}
  }
}

// --- RETINA DPR-AWARE CANDLESTICK PHYSICS ---
const canvas = document.getElementById("candleCanvas");
const ctx = canvas.getContext("2d");
let candles = [];
const MAX_CANDLES = 500;
let flushCount = 0;
let dpr = 1;

// --- XSS PROTECTION & INPUT SANITIZATION ---
function escapeHTML(value) {
  const str = typeof value === 'string' ? value : String(value ?? '');
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- FLUSH & RUN PROGRESS PERSISTENCE ---
let runFlushes = 0;
let bestRunRecord = null;
let runWon = false;
let dredgePressure = 0; // 0..100 pity pressure gauge for guaranteed new drops
let dryNewStreak = 0;
let questShared = false;
let lastAwardPass = null;
let victoryPlatform = "x";
let resetConfirmArmedUntil = 0;
let resetConfirmTimer = null;

let sessionOperatorSecret = "";

function generateCsprngHex16() {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    return "";
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getOperatorSecret() {
  if (/^[a-f0-9]{24,64}$/i.test(sessionOperatorSecret)) {
    return sessionOperatorSecret;
  }
  try {
    let secret = localStorage.getItem("nara_operator_secret_v1") || "";
    if (!/^[a-f0-9]{24,64}$/i.test(secret)) {
      secret = generateCsprngHex16();
      if (!secret) return "";
      localStorage.setItem("nara_operator_secret_v1", secret);
    }
    sessionOperatorSecret = secret;
    return secret;
  } catch (e) {
    sessionOperatorSecret = generateCsprngHex16();
    return sessionOperatorSecret;
  }
}

function loadFlushProgress() {
  try {
    const saved = localStorage.getItem("nara_flush_progress");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.flushCount === "number" && Number.isFinite(parsed.flushCount)) {
        flushCount = Math.max(0, Math.min(1000000, Math.floor(parsed.flushCount)));
        previousTierLevel = Math.max(1, Math.min(9, Math.floor(Number(parsed.previousTierLevel) || 1)));
        runWon = parsed.runWon === true && Object.keys(userStash.unlocked).length >= STICKER_COLLECTION.length;
        if (typeof parsed.dredgePressure === "number" && Number.isFinite(parsed.dredgePressure)) {
          dredgePressure = Math.max(0, Math.min(100, Math.floor(parsed.dredgePressure)));
        }
        if (typeof parsed.dryNewStreak === "number" && Number.isFinite(parsed.dryNewStreak)) {
          dryNewStreak = Math.max(0, Math.min(200, Math.floor(parsed.dryNewStreak)));
        }
      }
    }
    const savedRun = localStorage.getItem("nara_current_run_flushes_v1");
    if (savedRun !== null) {
      const num = parseInt(savedRun, 10);
      if (Number.isFinite(num) && num >= 0) runFlushes = num;
    }
    const savedBest = localStorage.getItem("nara_best_run_record_v1");
    if (savedBest !== null) {
      const num = parseInt(savedBest, 10);
      if (Number.isFinite(num) && num >= 12) bestRunRecord = num;
    }
    questShared = localStorage.getItem("nara_quest_shared_v1") === "1";
    const savedPass = localStorage.getItem("nara_award_pass_v1");
    if (savedPass) {
      const parsedPass = JSON.parse(savedPass);
      if (parsedPass && typeof parsedPass.claimCode === "string" && parsedPass.claimCode) {
        lastAwardPass = parsedPass;
      }
    }
  } catch (e) {}
  updateRunDisplayUI();
  updateQuestUI();
}

function saveFlushProgress() {
  try {
    localStorage.setItem("nara_flush_progress", JSON.stringify({
      flushCount: Math.max(0, Math.floor(flushCount)),
      previousTierLevel: Math.max(1, Math.min(9, Math.floor(previousTierLevel))),
      runWon: !!runWon,
      dredgePressure: Math.max(0, Math.min(100, Math.floor(dredgePressure))),
      dryNewStreak: Math.max(0, Math.floor(dryNewStreak)),
    }));
    localStorage.setItem("nara_current_run_flushes_v1", String(runFlushes));
    if (bestRunRecord !== null) {
      localStorage.setItem("nara_best_run_record_v1", String(bestRunRecord));
    }
  } catch (e) {}
}

function updateRunDisplayUI() {
  const runEl = document.getElementById("runFlushesCount");
  if (runEl) runEl.innerText = runFlushes;
  const bestEl = document.getElementById("bestRecordCount");
  if (bestEl) {
    bestEl.innerText = bestRunRecord !== null ? `${bestRunRecord} CLICKS` : "--";
  }
  const pressureEl = document.getElementById("vaultDredgePressureText");
  if (pressureEl) {
    pressureEl.innerText = `${dredgePressure}%`;
    pressureEl.className = dredgePressure >= 80
      ? "px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-bold"
      : "px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-400/30 text-amber-300 font-semibold";
  }
  const heroBar = document.getElementById("heroPressureBar");
  if (heroBar) heroBar.style.width = `${dredgePressure}%`;
  const heroVault = document.getElementById("heroVaultCount");
  if (heroVault) heroVault.innerText = String(Object.keys(userStash.unlocked).length);
}

function markQuestShared() {
  if (!questShared) {
    questShared = true;
    try { localStorage.setItem("nara_quest_shared_v1", "1"); } catch (e) {}
    updateQuestUI();
  }
}

function setQuestStepDone(btnId, badgeId, isDone, doneLabel, todoLabel) {
  const btn = document.getElementById(btnId);
  const badge = document.getElementById(badgeId);
  if (btn) {
    btn.classList.toggle("border-emerald-400/45", isDone);
    btn.classList.toggle("bg-emerald-500/[0.06]", isDone);
    btn.classList.toggle("border-white/[0.07]", !isDone);
    btn.classList.toggle("bg-[#090E18]", !isDone);
  }
  if (badge) {
    badge.innerText = isDone ? doneLabel : todoLabel;
    badge.className = isDone
      ? "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border border-emerald-400/50 bg-emerald-500/15 text-emerald-300 shrink-0"
      : "px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border border-white/12 bg-white/[0.03] text-slate-400 shrink-0";
  }
}

function updateQuestUI() {
  const unlockedCount = Object.keys(userStash.unlocked).length;
  const s1 = flushCount > 0;
  const s2 = questShared;
  const s3 = unlockedCount >= STICKER_COLLECTION.length;
  const s4 = !!(lastAwardPass && lastAwardPass.claimCode);
  const completed = [s1, s2, s3, s4].filter(Boolean).length;

  setQuestStepDone("questStep1Btn", "questStep1Badge", s1, "✓ FLUSHED", "START");
  setQuestStepDone("questStep2Btn", "questStep2Badge", s2, "✓ SHARED", "POST");
  setQuestStepDone("questStep3Btn", "questStep3Badge", s3, "✓ 12/12", `${unlockedCount}/12`);
  setQuestStepDone("questStep4Btn", "questStep4Badge", s4, "✓ SEALED", s3 ? "CLAIM" : "SEAL");

  const pill = document.getElementById("questProgressPill");
  if (pill) {
    pill.innerText = `${completed} / 4 Steps`;
    pill.className = completed === 4
      ? "px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/45 text-emerald-300 font-mono font-semibold text-xs"
      : "px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-300 font-mono font-semibold text-xs";
  }

  const claimBadge = document.getElementById("questMyClaimBadge");
  if (claimBadge) {
    if (s4) {
      claimBadge.innerText = `PASS: ${lastAwardPass.claimCode} (${lastAwardPass.handle})`;
      claimBadge.classList.remove("hidden");
    } else {
      claimBadge.classList.add("hidden");
    }
  }
}

function spawnFloatingFeedback(text, tone = "green", e = null) {
  const layer = document.getElementById("flushFloatLayer");
  if (!layer) return;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const badge = document.createElement("span");
  const toneClass = tone === "gold"
    ? "text-amber-300 border-amber-400/70 bg-black/85"
    : tone === "cyan"
      ? "text-[#00F0FF] border-[#00F0FF]/60 bg-black/85"
      : "text-naraGreen border-naraGreen/60 bg-black/85";
  badge.className = `float-flush-badge px-2 py-0.5 border ${toneClass}`;
  badge.innerText = text;

  let leftPct = 42 + Math.random() * 16;
  let topPct = 36 + Math.random() * 14;
  if (e && typeof e.clientX === "number" && e.clientX > 0) {
    const rect = layer.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      leftPct = Math.max(12, Math.min(82, ((e.clientX - rect.left) / rect.width) * 100));
      topPct = Math.max(18, Math.min(76, ((e.clientY - rect.top) / rect.height) * 100));
    }
  }
  badge.style.left = `${leftPct.toFixed(1)}%`;
  badge.style.top = `${topPct.toFixed(1)}%`;
  layer.appendChild(badge);
  setTimeout(() => badge.remove(), 860);
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

class Candlestick {
  constructor(x, y) {
    this.x = x || Math.random() * window.innerWidth;
    this.y = y || -30;
    this.isGreen = Math.random() > 0.35;
    this.color = this.isGreen ? "#39FF14" : "#FF2A2A";
    this.glow = this.isGreen ? "rgba(57,255,20,0.5)" : "rgba(255,42,42,0.4)";
    this.bodyWidth = Math.random() * 8 + 6;
    this.bodyHeight = Math.random() * 26 + 14;
    this.wickTop = Math.random() * 12 + 6;
    this.wickBottom = Math.random() * 12 + 6;
    
    this.vx = (Math.random() - 0.5) * 12;
    this.vy = Math.random() * 4 + 4;
    this.gravity = 0.32;
    this.rotation = Math.random() * Math.PI * 2;
    this.vRot = (Math.random() - 0.5) * 0.18;
    this.alpha = 1;
    this.life = 0;
    this.maxLife = Math.random() * 140 + 120;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.rotation += this.vRot;
    this.life++;
    this.vx *= 0.985;
    if (this.life > this.maxLife - 30) {
      this.alpha = Math.max(0, (this.maxLife - this.life) / 30);
    }
  }

  draw(c) {
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.rotation);
    c.globalAlpha = this.alpha;
    c.shadowColor = this.glow;
    c.shadowBlur = 8;

    c.strokeStyle = this.color;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -this.bodyHeight / 2 - this.wickTop);
    c.lineTo(0, -this.bodyHeight / 2);
    c.stroke();

    c.fillStyle = this.color;
    c.fillRect(-this.bodyWidth / 2, -this.bodyHeight / 2, this.bodyWidth, this.bodyHeight);

    c.beginPath();
    c.moveTo(0, this.bodyHeight / 2);
    c.lineTo(0, this.bodyHeight / 2 + this.wickBottom);
    c.stroke();

    c.restore();
  }
}

let candleRafId = null;

function animateCandles() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (let i = candles.length - 1; i >= 0; i--) {
    candles[i].update();
    candles[i].draw(ctx);
    if (candles[i].alpha <= 0 || candles[i].y > window.innerHeight + 60) {
      candles.splice(i, 1);
    }
  }
  // Hard cap to prevent memory leak during spam clicking
  if (candles.length > MAX_CANDLES) {
    candles = candles.slice(-MAX_CANDLES);
  }
  if (candles.length > 0 && !document.hidden) {
    candleRafId = requestAnimationFrame(animateCandles);
  } else {
    candleRafId = null;
  }
}

function startCandleLoop() {
  if (candleRafId === null && candles.length > 0 && !document.hidden) {
    candleRafId = requestAnimationFrame(animateCandles);
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && candles.length > 0) startCandleLoop();
});

// --- OPERATOR PROGRESSION & TIER MATRIX (LEVELS 1 TO 9) ---
const OPERATOR_LEVELS = [
  { minFlushes: 0, level: 1, rank: "Sewer Recruit", title: "Novice Toilet Operator", color: "#9CA3AF" },
  { minFlushes: 5, level: 2, rank: "Candlestick Handler", title: "Green Paper Specialist", color: "#34D399" },
  { minFlushes: 15, level: 3, rank: "3 AM Chart Watcher", title: "Porcelain Scout", color: "#60A5FA" },
  { minFlushes: 30, level: 4, rank: "Sewer Liquidator", title: "Submerged Bear Hunter", color: "#A78BFA" },
  { minFlushes: 50, level: 5, rank: "Base Sewer Tactician", title: "Tactical Plunger Master", color: "#FBBF24" },
  { minFlushes: 75, level: 6, rank: "Hydraulic Warlord", title: "Commanding Flush General", color: "#F87171" },
  { minFlushes: 100, level: 7, rank: "Porcelain Warlord", title: "100+ Bear Purger", color: "#39FF14" },
  { minFlushes: 200, level: 8, rank: "Uniswap Hook Master", title: "Pipe Pressure Veteran", color: "#38BDF8" },
  { minFlushes: 420, level: 9, rank: "GOD CANDLE DEITY", title: "Sovereign Porcelain Overlord", color: "#FFD700" }
];

function getOperatorTier(count) {
  for (let i = OPERATOR_LEVELS.length - 1; i >= 0; i--) {
    if (count >= OPERATOR_LEVELS[i].minFlushes) {
      const tier = OPERATOR_LEVELS[i];
      const nextTier = OPERATOR_LEVELS[i + 1] || null;
      let progress = 100;
      if (nextTier) {
        const range = nextTier.minFlushes - tier.minFlushes;
        const current = count - tier.minFlushes;
        progress = Math.min(100, Math.max(0, Math.floor((current / range) * 100)));
      }
      return { ...tier, progress, nextTier };
    }
  }
  return { ...OPERATOR_LEVELS[0], progress: 0, nextTier: OPERATOR_LEVELS[1] };
}

const RANDOM_HOOKS = [
  (n) => n > 0
    ? `The toad stared into my soul while I flushed ${n} ${n === 1 ? 'short' : 'shorts'}.`
    : `The toad stared into my soul from the porcelain bowl on Base.`,
  (n) => n > 0
    ? `Checked charts at 3 AM. Flushed ${n} ${n === 1 ? 'bear' : 'bears'} down $NARA.`
    : `Checked charts at 3 AM. Found the $NARA bowl. Machine loading.`,
  (n) => n > 0
    ? `Read the candlestick roll: BANKS FAIL. ${n} ${n === 1 ? 'bear' : 'bears'} flushed.`
    : `Read the candlestick roll closely: BANKS FAIL. Token first.`,
  (n) => n > 0
    ? `Flushed ${n} ${n === 1 ? 'time' : 'times'}. The pipes whispered: token first.`
    : `The sewer pipes whispered: token first. The machine follows.`,
  (n) => n > 0
    ? `Just wiped the floor with ${n} liquidated ${n === 1 ? 'short' : 'shorts'} on Base.`
    : `Just wiped the floor with liquidated shorts. Base is live.`,
  (n) => n > 0
    ? `The candlestick roll doesn't lie: BANKS FAIL. ${n} purged.`
    : `The candlestick roll doesn't lie: BANKS FAIL. Green candles only.`,
  (n) => n > 0
    ? `Told him not to short $NARA. Flushed him ${n} ${n === 1 ? 'time' : 'times'}.`
    : `Told him not to short $NARA on Base. Green candles loading.`,
  (n) => n > 0
    ? `Red candle paper wiped. ${n} ${n === 1 ? 'flush' : 'flushes'} later, green remains.`
    : `Red candle paper wiped. Only green God candles remain on Base.`,
  (n) => n > 0
    ? `Doctor said stop checking charts. Flushed ${n} ${n === 1 ? 'bear' : 'bears'} instead.`
    : `Doctor said stop checking charts on the toilet. Opened $NARA.`,
  (n) => n > 0
    ? `Token first. The machine follows. ${n} ${n === 1 ? 'bear' : 'bears'} purged.`
    : `Token first. The machine follows. The revolution starts on Base.`,
  (n) => n > 0
    ? `Decoded the candlestick roll: BANKS FAIL. ${n} ${n === 1 ? 'time' : 'times'} flushed.`
    : `Decoded the candlestick roll wicks: BANKS FAIL. Pure catharsis.`,
  (n) => n > 0
    ? `No whitepaper needed. Flushed ${n} ${n === 1 ? 'short seller' : 'short sellers'} on Base.`
    : `No whitepaper needed when green candles wipe out the bears.`
];

const RANDOM_REPLY_BAITS = [
  "Drop your purge score 👇",
  "How many bears did you flush? 👇",
  "Beat my score or wipe with red paper 👇",
  "Can anyone top this operator rank? 👇",
  "Drop your score if you survived the flush 👇"
];

let currentRoll = {
  rank: OPERATOR_LEVELS[0].rank,
  hook: "",
  cta: RANDOM_REPLY_BAITS[0],
  opId: Math.floor(1000 + Math.random() * 9000)
};

let activeTweetMode = 'flex'; // 'flex' | 'receipt' | 'lore' | 'unhinged' | 'sticker'
let xNoLinkMaxReach = false;
let combo = 0;
let comboTimer = null;
let previousTierLevel = 1;

function rollNewDegenMessage(count) {
  const hookFn = RANDOM_HOOKS[Math.floor(Math.random() * RANDOM_HOOKS.length)];
  const cta = RANDOM_REPLY_BAITS[Math.floor(Math.random() * RANDOM_REPLY_BAITS.length)];
  const hook = hookFn(count);
  currentRoll.hook = hook;
  currentRoll.cta = cta;
  return currentRoll;
}

// --- VIRAL SOCIAL POSTING ENGINE (X + FARCASTER MAX-REACH, RFC-3986 STRICT & POPUP-PROOF) ---
// Share links point at canonical origin or dedicated /s/{slug} OpenGraph card routes (/s/1..12, /s/vault, /s/win).
function getShareUrl(slugOverride) {
  const base = CANONICAL_URL.replace(/\/$/, "");
  if (slugOverride) {
    return `${base}/s/${slugOverride}`;
  }
  if (activeTweetMode === 'sticker') {
    const stickerId = (userStash && userStash.activeStickerId) || 1;
    return `${base}/s/${stickerId}`;
  }
  return CANONICAL_URL;
}

function buildXIntentUrl(text, shareUrl, omitUrl = false) {
  if (omitUrl || !shareUrl) {
    return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  }
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
}

function buildWarpcastComposeUrl(text, embedUrl) {
  const targetEmbed = embedUrl || CANONICAL_URL;
  return `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(targetEmbed)}`;
}

function buildSelfReplyPayload(shareUrl) {
  const url = shareUrl || getShareUrl();
  return `${url}\n$NARA on Base: ${NARA_CONTRACT}`;
}

// Computes X (Twitter) weighted character length:
// - Astral-plane / emoji characters count as 2 chars (variation selectors \uFE0F stripped)
// - Attached &url= counts as 24 chars (1 space + 23-char t.co wrapper)
function getXWeightedLength(text, hasUrl = true) {
  let len = 0;
  for (const ch of text.replace(/\uFE0F/g, "")) {
    len += ch.codePointAt(0) > 0x1f00 ? 2 : 1;
  }
  return hasUrl ? len + 24 : len;
}

const RECEIPT_OUTCOMES = [
  "Wiped clean down the porcelain bowl 🚽",
  "Siphoned straight into Base liquidity 🪠",
  "Flushed by 900s green candles 🕯️",
  "Settled on Base 8453 ⚡",
];

const LORE_WHISPERS = [
  "token first. the machine follows.",
  "read the candlestick roll: BANKS FAIL.",
  "green candles only in the porcelain bowl.",
  "he who controls the roll controls Base.",
  "bears belong in the sewer pipes.",
];

let receiptOutcomeIdx = 0;
let loreWhisperIdx = 0;

function buildTweetByMode(mode, count, roll) {
  const tier = getOperatorTier(count);
  const opId = roll.opId;

  if (mode === 'receipt') {
    const bears = count > 0 ? count : 1;
    const outcome = RECEIPT_OUTCOMES[receiptOutcomeIdx % RECEIPT_OUTCOMES.length];
    return `Liquidation desk log #${opId} on Base:\n\n• Target: ${bears} overleveraged ${bears === 1 ? 'short' : 'shorts'}\n• Outcome: ${outcome}\n• Engine: $NARA 900s pulse (@NARA_protocol)\n\nDrop your run score 👇`;
  }

  if (mode === 'lore') {
    const whisper = LORE_WHISPERS[loreWhisperIdx % LORE_WHISPERS.length];
    return `${roll.hook}\n\n1,000,000 fixed $NARA supply on Base. ~99.5% sealed out of float while 900s pulses pay committed holders.\n\n"${whisper}" — @NARA_protocol`;
  }

  if (mode === 'unhinged') {
    const n = count || 69;
    return `Doctor told me to stop checking charts on the toilet.\n\nFlushed ${n} ${n === 1 ? 'bear' : 'bears'} down the $NARA bowl on Base instead (${tier.rank}).\n\n${roll.cta}`;
  }

  if (mode === 'sticker') {
    const unlockedCount = userStash && userStash.unlocked ? Object.keys(userStash.unlocked).length : 0;
    if (unlockedCount === 0) {
      return `12 rare $NARA sewer cards hiding in the porcelain vault on Base (@NARA_protocol).\n\nFewest clicks to 12/12 takes the Fame Board. Try a run 👇`;
    }
    const stickerId = userStash.activeStickerId || 1;
    const sticker = STICKER_COLLECTION.find(s => s.id === stickerId) || STICKER_COLLECTION[0];
    const serial = (userStash.unlocked[sticker.id] && userStash.unlocked[sticker.id].serial) || roll.opId;
    return `Pulled ${sticker.deco} ${sticker.name} (${sticker.rarity} · #${String(serial).padStart(4, "0")}) from the $NARA vault on Base.\n\n"${sticker.quote}"\n\n${unlockedCount}/12 dredged — see what you pull 👇`;
  }

  // Default: 'flex'
  if (count > 0) {
    return `${roll.hook}\n\nLogged ${count} ${count === 1 ? 'purge' : 'purges'} in the $NARA terminal on Base (${tier.rank} · @NARA_protocol).\n\n${roll.cta}`;
  }
  return `${roll.hook}\n\nStepping into the $NARA porcelain terminal on Base (@NARA_protocol).\n\n${roll.cta}`;
}

function setTweetMode(mode) {
  playMechanicalClick();
  activeTweetMode = mode;
  
  const modes = ['flex', 'receipt', 'lore', 'unhinged', 'sticker'];
  modes.forEach(m => {
    const btn = document.getElementById(`tabBtn-${m}`);
    if (btn) {
      btn.setAttribute("aria-pressed", m === mode ? "true" : "false");
      if (m === mode) {
        btn.className = "px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold font-sans bg-white text-slate-950 border border-white transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-naraGreen outline-none";
      } else {
        const extraColor = m === 'sticker' ? 'text-amber-300 hover:text-white border-amber-400/30' : 'text-slate-300 hover:text-white border-white/10';
        btn.className = `px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-medium font-sans bg-white/[0.04] hover:bg-white/[0.08] ${extraColor} border transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-white outline-none`;
      }
    }
  });

  updateForgeUI();
}

function rerollActiveMode() {
  playMechanicalClick();
  rollNewDegenMessage(flushCount);
  currentRoll.opId = Math.floor(1000 + Math.random() * 9000);
  receiptOutcomeIdx++;
  loreWhisperIdx++;

  if (activeTweetMode === 'sticker' && userStash && userStash.unlocked) {
    const unlockedIds = Object.keys(userStash.unlocked).map(Number).filter(Boolean);
    if (unlockedIds.length > 1) {
      const curIdx = unlockedIds.indexOf(userStash.activeStickerId);
      userStash.activeStickerId = unlockedIds[(curIdx + 1) % unlockedIds.length];
      saveUserStash();
    }
  }

  updateForgeUI();

  const preview = document.getElementById("tweetPreviewDisplay");
  if (preview) {
    preview.classList.add("text-naraGreen");
    setTimeout(() => preview.classList.remove("text-naraGreen"), 200);
  }
}

function updateForgeUI() {
  if (!currentRoll.hook) {
    rollNewDegenMessage(flushCount);
  }
  const tier = getOperatorTier(flushCount);
  const shareUrl = getShareUrl();
  const text = buildTweetByMode(activeTweetMode, flushCount, currentRoll);

  // 1. Status Bar updates
  const rankLabel = document.getElementById("operatorRankLabel");
  const titleLabel = document.getElementById("operatorTitleLabel");
  const xpPercentLabel = document.getElementById("xpPercentLabel");
  const xpBar = document.getElementById("xpProgressBar");
  const xpTitle = document.getElementById("xpTitleLabel");

  if (rankLabel) rankLabel.innerText = `LVL ${tier.level}: ${tier.rank.toUpperCase()}`;
  if (titleLabel) titleLabel.innerText = tier.title.toUpperCase();
  if (xpPercentLabel) xpPercentLabel.innerText = `${tier.progress}%`;
  if (xpBar) {
    xpBar.style.width = `${tier.progress}%`;
    xpBar.parentElement?.setAttribute("aria-valuenow", String(tier.progress));
  }
  if (xpTitle) {
    xpTitle.innerText = tier.nextTier ? `XP TO LVL ${tier.nextTier.level} (${tier.nextTier.minFlushes - flushCount} LEFT)` : `MAX DEITY TIER REACHED`;
  }

  // 2. Terminal Preview update (using true X-weighted length)
  const preview = document.getElementById("tweetPreviewDisplay");
  const replyPreview = document.getElementById("replyPreviewDisplay");
  const reachModeBtn = document.getElementById("toggleXReachModeBtn");
  const reachModeLabel = document.getElementById("xReachModeLabel");
  const charCountLabel = document.getElementById("charCountLabel");
  const hasUrlInX = !xNoLinkMaxReach;
  const xWeightedLen = getXWeightedLength(text, hasUrlInX);
  if (preview) preview.innerText = text;
  if (replyPreview) {
    replyPreview.innerText = `SELF-REPLY: ${shareUrl.replace(/^https?:\/\//, "")} · CA ${NARA_CONTRACT.slice(0, 6)}…${NARA_CONTRACT.slice(-4)}`;
  }
  if (reachModeBtn) {
    reachModeBtn.setAttribute("aria-pressed", xNoLinkMaxReach ? "true" : "false");
    reachModeBtn.className = xNoLinkMaxReach
      ? "px-2.5 py-1 min-h-[26px] rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-300 text-[10px] font-semibold cursor-pointer"
      : "px-2.5 py-1 min-h-[26px] rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-[10px] font-semibold cursor-pointer";
  }
  if (reachModeLabel) {
    reachModeLabel.innerText = xNoLinkMaxReach ? "X MODE: MAX REACH · NO LINK" : "X MODE: OG CARD LINK";
  }
  if (charCountLabel) {
    charCountLabel.innerText = `${xWeightedLen} / 280 CHARS`;
    if (xWeightedLen > 280) {
      charCountLabel.classList.add("text-red-400");
      charCountLabel.classList.remove("text-white/50");
    } else {
      charCountLabel.classList.remove("text-red-400");
      charCountLabel.classList.add("text-white/50");
    }
  }

  // 3. Share URL encoding & anchor pre-population (Native Farcaster embeds[] + X link mode)
  const xUrl = buildXIntentUrl(text, shareUrl, xNoLinkMaxReach);
  const warpcastUrl = buildWarpcastComposeUrl(text, shareUrl);

  const forgeX = document.getElementById("forgeXBtn");
  const forgeCast = document.getElementById("forgeCastBtn");
  const quickBtn = document.getElementById("quickTweetBtn");
  const quickCast = document.getElementById("quickCastBtn");
  const mTweet = document.getElementById("milestoneTweetBtn");
  const mCast = document.getElementById("milestoneCastBtn");

  if (forgeX) forgeX.href = xUrl;
  if (forgeCast) forgeCast.href = warpcastUrl;
  if (quickBtn) quickBtn.href = buildXIntentUrl(text, shareUrl, false);
  if (quickCast) quickCast.href = warpcastUrl;
  if (mTweet) mTweet.href = buildXIntentUrl(text, shareUrl, false);
  if (mCast) mCast.href = warpcastUrl;
  const shareStashBtn = document.getElementById("shareStashBtn");
  if (shareStashBtn && shareStashBtn.tagName === "A") {
    shareStashBtn.href = buildStashTweetUrl();
  }
  const castStashBtn = document.getElementById("castStashBtn");
  if (castStashBtn && castStashBtn.tagName === "A") {
    castStashBtn.href = buildStashCastUrl();
  }
  const shareVaultXBtn = document.getElementById("shareVaultXBtn");
  if (shareVaultXBtn && shareVaultXBtn.tagName === "A") {
    shareVaultXBtn.href = buildVaultShowcaseShareData().xUrl;
  }
  const shareVaultCastBtn = document.getElementById("shareVaultCastBtn");
  if (shareVaultCastBtn && shareVaultCastBtn.tagName === "A") {
    shareVaultCastBtn.href = buildVaultShowcaseShareData().castUrl;
  }

  // 4. Toggle Copy Card Image button visibility
  const forgeCardBtn = document.getElementById("forgeCopyCardBtn");
  const hasUnlockedStickers = userStash && userStash.unlocked && Object.keys(userStash.unlocked).length > 0;
  if (forgeCardBtn) {
    if (activeTweetMode === 'sticker' && hasUnlockedStickers) {
      forgeCardBtn.classList.remove("hidden");
    } else {
      forgeCardBtn.classList.add("hidden");
    }
  }
}

function handleForgeClick(e, platform) {
  playMechanicalClick();
  markQuestShared();
  updateForgeUI();
  const forgeX = document.getElementById("forgeXBtn");
  const forgeCast = document.getElementById("forgeCastBtn");
  const targetUrl = platform === "warpcast" ? forgeCast?.href : forgeX?.href;
  
  if (e && e.currentTarget && e.currentTarget.tagName && e.currentTarget.tagName.toLowerCase() === "a") {
    if (targetUrl) e.currentTarget.href = targetUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(targetUrl);
  }
}

function handleShareClick(e, platform) {
  handleForgeClick(e, platform);
}

function toggleXReachMode() {
  playMechanicalClick();
  xNoLinkMaxReach = !xNoLinkMaxReach;
  updateForgeUI();
  injectSewerEvent(
    xNoLinkMaxReach
      ? "[X REACH] Max-Reach No-Link mode active — attach image & paste Self-Reply + CA below!"
      : "[X REACH] OG Card Link mode active — auto-attaches OpenGraph preview card."
  );
}

function copyForgeReplyText() {
  playMechanicalClick();
  const payload = buildSelfReplyPayload(getShareUrl());
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payload).catch(() => copyTextFallback(payload));
  } else {
    copyTextFallback(payload);
  }
  const btnLabel = document.getElementById("copyReplyBtnLabel");
  if (btnLabel) {
    btnLabel.innerText = "✓ REPLY + CA COPIED!";
    setTimeout(() => { btnLabel.innerText = "COPY SELF-REPLY + CA"; }, 2200);
  }
  injectSewerEvent("[X REACH] Copied link + Base contract address for your self-reply.");
}

function buildVaultShowcaseShareData() {
  const summary = getAnchorShowcaseSummary();
  const shareUrl = getShareUrl("vault");
  const entryEth = summary.minEthDisplay || "1.61";
  const priceLine =
    summary.spotUsdPerNara && summary.maxDiscountPct && summary.maxDiscountPct > 10
      ? `• Wave 1 from ${entryEth} ETH (up to -${summary.maxDiscountPct}% vs $${Math.round(summary.spotUsdPerNara).toLocaleString("en-US")} V4 spot on larger tiers)`
      : `• Wave 1 entry from ${entryEth} ETH across 6 monotonic tiers`;
  const chestLine = summary.totalAccruedNaraDisplay
    ? `• +${summary.totalAccruedNaraDisplay} $NARA accrued inside chests`
    : "• 900s $NARA pulses + ETH/USDC cash stack inside each receipt";
  const text = `Wave 1 $NARA Vault Receipts on Base (@NARA_protocol):\n\n${priceLine}\n• 0% AMM slippage · 90D–365D across 6 tiers (up to 4.00x duration weight)\n${chestLine}\n\nInspect 29 Wave 1 vaults 👇`;
  return {
    text,
    shareUrl,
    xUrl: buildXIntentUrl(text, shareUrl, false),
    castUrl: buildWarpcastComposeUrl(text, shareUrl),
  };
}

function shareVaultOnX(e) {
  playMechanicalClick();
  markQuestShared();
  const { xUrl } = buildVaultShowcaseShareData();
  if (e && e.currentTarget && e.currentTarget.tagName && e.currentTarget.tagName.toLowerCase() === "a") {
    e.currentTarget.href = xUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(xUrl);
  }
}

function shareVaultOnCast(e) {
  playMechanicalClick();
  markQuestShared();
  const { castUrl } = buildVaultShowcaseShareData();
  if (e && e.currentTarget && e.currentTarget.tagName && e.currentTarget.tagName.toLowerCase() === "a") {
    e.currentTarget.href = castUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(castUrl);
  }
}

function copyForgeTweetText() {
  playMechanicalClick();
  const baseText = buildTweetByMode(activeTweetMode, flushCount, currentRoll);
  const text = xNoLinkMaxReach ? baseText : `${baseText}\n${getShareUrl()}`;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  } else {
    copyTextFallback(text);
  }

  const toast = document.getElementById("copyToast");
  const btnLabel = document.getElementById("forgeCopyBtnLabel");
  if (btnLabel) {
    btnLabel.innerText = "COPIED!";
    setTimeout(() => { btnLabel.innerText = "COPY TWEET"; }, 2000);
  }
  if (toast) {
    toast.classList.remove("hidden");
    setTimeout(() => { toast.classList.add("hidden"); }, 1600);
  }
}

function updateComboUI() {
  const container = document.getElementById("comboContainer");
  const label = document.getElementById("comboLabel");
  if (!container || !label) return;

  if (combo <= 1) {
    label.innerText = "1X";
    container.className = "px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-slate-400 flex items-center gap-1 transition-all";
  } else if (combo < 10) {
    const mult = Math.min(5, Math.floor(combo / 2) + 1);
    label.innerText = `${mult}X`;
    container.className = "px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[11px] font-mono text-emerald-300 font-bold flex items-center gap-1 transition-all";
  } else if (combo < 25) {
    label.innerText = `10X OVERDRIVE`;
    container.className = "px-2.5 py-0.5 rounded-full bg-hazardRed/20 border border-hazardRed/60 text-[11px] font-mono text-red-300 font-bold flex items-center gap-1 transition-all";
  } else {
    label.innerText = `25X MAX`;
    container.className = "px-2.5 py-0.5 rounded-full bg-naraGreen text-slate-950 border border-naraGreen text-[11px] font-mono font-bold flex items-center gap-1 transition-all";
  }
}

function openSafeWindow(url) {
  if (!url) return;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
  } catch (err) {
    try {
      const win = window.open(url, "_blank");
      if (!win || win.closed || typeof win.closed === "undefined") {
        window.location.href = url;
      }
    } catch (e) {
      window.location.href = url;
    }
  }
}

// --- LOCAL GRID LOG ---
// Only events from THIS browser session appear here, plus rotating true tips while idle.
const IDLE_TIPS = [
  "Tip: press SPACE or F to flush without clicking.",
  "Tip: look closely at the candlestick toilet paper roll — the hidden cipher is BANKS FAIL (#BanksFail).",
  "Tip: stickers and scores save in this browser only. Clearing site data resets them.",
  "Tip: the Fame Board is self-reported. Fewest clicks to 12/12 wins.",
  "Tip: click BUY $NARA at the top to swap ETH or USDC on the Base Uniswap v4 Hook, or open CryptoSLIP to commit 1+ NARA.",
  "Tip: COPY puts the full token address on your clipboard. Check it before any swap.",
  "Tip: ADD $NARA TO METAMASK asks your wallet to switch to Base, then to show the token.",
];
let idleTipIndex = 0;
let lastLogAt = Date.now();

function injectSewerEvent(text) {
  const ticker = document.getElementById("sewerTickerText");
  lastLogAt = Date.now();
  if (ticker) {
    ticker.innerText = text;
    ticker.classList.add("text-naraGreen");
    setTimeout(() => ticker.classList.remove("text-naraGreen"), 800);
  }
}

setInterval(() => {
  if (document.hidden) return;
  if (Date.now() - lastLogAt < 9000) return; // let real events breathe
  const ticker = document.getElementById("sewerTickerText");
  if (!ticker) return;
  ticker.innerText = IDLE_TIPS[idleTipIndex % IDLE_TIPS.length];
  idleTipIndex++;
}, 9000);

// --- 12 DECORATED POOP STICKER CARDS (device-local collection; nothing here is a token) ---
const STICKER_COLLECTION = [
  { id: 1, key: 'rusty_floater', name: 'Rusty Pipe Floater', icon: '💩', deco: '🔧', rarity: 'COMMON', dropWeight: 350, border: '#94a3b8', bg: 'rgba(148,163,184,0.2)', perk: '+10 Liquidated Bears', quote: 'Survives any sewer pressure.' },
  { id: 2, key: 'green_candle', name: 'Green Candle Shitter', icon: '💩', deco: '🕯️', rarity: 'COMMON', dropWeight: 250, border: '#34d399', bg: 'rgba(52,211,153,0.2)', perk: '+25% Candle Wicks', quote: 'Wiped with red paper. Rose with green candles.' },
  { id: 3, key: 'soggy_whitepaper', name: 'Soggy Whitepaper Stool', icon: '💩', deco: '📜', rarity: 'COMMON', dropWeight: 150, border: '#cbd5e1', bg: 'rgba(203,213,225,0.2)', perk: '+20 Roadmaps Burned', quote: 'Better than reading the whitepaper.' },
  { id: 4, key: 'base_blue', name: 'Based Blue Floater', icon: '💩', deco: '🔵', rarity: 'UNCOMMON', dropWeight: 90, border: '#0052FF', bg: 'rgba(0,82,255,0.25)', perk: '+50 Hard Base Gas', quote: 'Blue as the Base logo. Floats forever.' },
  { id: 5, key: 'toxic_sludge', name: 'Radioactive Toxic Sludge', icon: '💩', deco: '☢️', rarity: 'UNCOMMON', dropWeight: 60, border: '#a3e635', bg: 'rgba(163,230,53,0.25)', perk: '+99.4% Toxicity', quote: 'Do not touch without rubber gloves.' },
  { id: 6, key: 'plunger_ninja', name: 'Plunger Samurai', icon: '💩', deco: '🪠', rarity: 'RARE', dropWeight: 35, border: '#06b6d4', bg: 'rgba(6,182,212,0.25)', perk: '+200 Siphon Force', quote: 'Master of the 1000-flush strike.' },
  { id: 7, key: 'toad_pepe', name: 'Pepe Sewer Toad', icon: '💩', deco: '🐸', rarity: 'RARE', dropWeight: 25, border: '#10b981', bg: 'rgba(16,185,129,0.25)', perk: '+420 Smug Alpha', quote: 'Feels good man in the porcelain bowl.' },
  { id: 8, key: 'sir_flushes', name: 'Sir Flushes-a-Lot', icon: '💩', deco: '🎩', rarity: 'EPIC', dropWeight: 18, border: '#a855f7', bg: 'rgba(168,85,247,0.3)', perk: '+500 High Society Class', quote: 'Indubitably porcelain, my good sir.' },
  { id: 9, key: 'gigachad_turd', name: 'Based Gigachad Turd', icon: '💩', deco: '🕶️', rarity: 'EPIC', dropWeight: 12, border: '#f43f5e', bg: 'rgba(244,63,94,0.3)', perk: '+1000 Green God Candles', quote: 'Never sold. Never flushed backwards.' },
  { id: 10, key: 'crown_royal', name: 'Crown Royal Golden Stool', icon: '💩', deco: '👑', rarity: 'LEGENDARY', dropWeight: 6, border: '#f59e0b', bg: 'rgba(245,158,11,0.35)', perk: '+5000 Royal Flush Power', quote: 'Bow before the porcelain monarch.' },
  { id: 11, key: 'diamond_hands', name: 'Diamond Hands Floater', icon: '💩', deco: '💎', rarity: 'LEGENDARY', dropWeight: 3, border: '#67e8f9', bg: 'rgba(103,232,249,0.35)', perk: '+10000 Impervious Volatility', quote: 'Immune to dumps, impervious to gravity.' },
  { id: 12, key: 'cyber_god', name: 'Cyber God Overlord', icon: '💩', deco: '🛸', rarity: 'MYTHIC', dropWeight: 1, border: '#39FF14', bg: 'rgba(57,255,20,0.4)', perk: '+∞ Infinite Machine Float', quote: 'I am the flush. I am the machine. I am NARA.' }
];

let userStash = {
  unlocked: {},
  activeStickerId: 1,
  totalDrops: 0
};
let currentInspectedSticker = null;

function loadUserStash() {
  try {
    const saved = localStorage.getItem("nara_sewer_stash");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.unlocked === "object" && parsed.unlocked !== null) {
        const sanitizedUnlocked = {};
        for (const [key, item] of Object.entries(parsed.unlocked)) {
          const numericId = parseInt(key, 10);
          const exists = STICKER_COLLECTION.some(s => s.id === numericId);
          if (exists && item && typeof item === "object") {
            sanitizedUnlocked[numericId] = {
              id: numericId,
              serial: Math.max(1, Math.min(999999, Math.floor(Number(item.serial) || 1))),
              count: Math.max(1, Math.min(999999, Math.floor(Number(item.count) || 1))),
              firstDropAt: Math.max(0, Math.floor(Number(item.firstDropAt || item.firstDiscoveredAt) || Date.now())),
            };
          }
        }
        const activeId = Number(parsed.activeStickerId);
        userStash = {
          unlocked: sanitizedUnlocked,
          activeStickerId: STICKER_COLLECTION.some(s => s.id === activeId) ? activeId : 1,
          totalDrops: Math.max(0, Math.min(1000000, Math.floor(Number(parsed.totalDrops) || 0)))
        };
      }
    }
  } catch (e) {}
}

function saveUserStash() {
  try {
    localStorage.setItem("nara_sewer_stash", JSON.stringify(userStash));
  } catch (e) {}
}

function formatStickerTweet(sticker, serial, _opRank, flushNum) {
  const bears = flushNum > 0 ? flushNum : 1;
  return `Pulled ${sticker.deco} ${sticker.name} (${sticker.rarity} · #${String(serial).padStart(4, "0")}) in ${bears} ${bears === 1 ? 'click' : 'clicks'} on $NARA (@NARA_protocol).\n\n"${sticker.quote}"\n\nSee what you dredge on Base 👇`;
}

function renderStickerCardCanvas(sticker, serial, opRank, flushNum) {
  const cardCanvas = document.getElementById("cardCanvas");
  if (!cardCanvas) return;
  const c = cardCanvas.getContext("2d");
  const W = 600;
  const H = 600;
  cardCanvas.width = W;
  cardCanvas.height = H;

  // 1. Metallic Gradient Background
  const bgGrad = c.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, "#0E1118");
  bgGrad.addColorStop(0.5, "#080A0E");
  bgGrad.addColorStop(1, "#040507");
  c.fillStyle = bgGrad;
  c.fillRect(0, 0, W, H);

  // Subtle Background Grid
  c.strokeStyle = "rgba(255, 255, 255, 0.028)";
  c.lineWidth = 1;
  for (let x = 20; x < W - 20; x += 30) {
    c.beginPath(); c.moveTo(x, 20); c.lineTo(x, H - 20); c.stroke();
  }
  for (let y = 20; y < H - 20; y += 30) {
    c.beginPath(); c.moveTo(20, y); c.lineTo(W - 20, y); c.stroke();
  }

  // 2. Neon Glowing Card Frame
  c.save();
  c.strokeStyle = sticker.border || "#39FF14";
  c.lineWidth = 2.5;
  c.shadowColor = sticker.border || "#39FF14";
  c.shadowBlur = 18;
  c.strokeRect(20, 20, W - 40, H - 40);
  c.restore();

  // Corner Brackets
  const bSize = 14;
  c.strokeStyle = "#FFFFFF";
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(25, 25 + bSize); c.lineTo(25, 25); c.lineTo(25 + bSize, 25); c.stroke();
  c.beginPath(); c.moveTo(W - 25 - bSize, 25); c.lineTo(W - 25, 25); c.lineTo(W - 25, 25 + bSize); c.stroke();
  c.beginPath(); c.moveTo(25, H - 25 - bSize); c.lineTo(25, H - 25); c.lineTo(25 + bSize, H - 25); c.stroke();
  c.beginPath(); c.moveTo(W - 25 - bSize, H - 25); c.lineTo(W - 25, H - 25); c.lineTo(W - 25, H - 25 - bSize); c.stroke();

  // 3. Top Header
  c.font = "bold 13px 'JetBrains Mono', monospace";
  c.fillStyle = "rgba(255, 255, 255, 0.7)";
  c.textAlign = "left";
  c.fillText("NARA // PORCELAIN DREDGE CARD", 42, 52);

  c.textAlign = "right";
  c.fillStyle = "#0052FF";
  c.fillText("BASE [8453]", W - 42, 52);

  // 4. Center Halo & Avatar Circle
  const cx = W / 2;
  const cy = 205;
  const radGlow = c.createRadialGradient(cx, cy, 10, cx, cy, 135);
  radGlow.addColorStop(0, sticker.bg || "rgba(57, 255, 20, 0.25)");
  radGlow.addColorStop(1, "transparent");
  c.fillStyle = radGlow;
  c.beginPath();
  c.arc(cx, cy, 135, 0, Math.PI * 2);
  c.fill();

  // Avatar Circular Border
  c.strokeStyle = "rgba(255, 255, 255, 0.15)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(cx, cy, 95, 0, Math.PI * 2);
  c.stroke();

  // 5. Emojis (Poop + Decoration)
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "105px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  c.fillText(sticker.icon, cx - 10, cy + 12);

  c.font = "55px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  c.fillText(sticker.deco, cx + 46, cy - 36);

  // 6. Rarity Pill
  c.textBaseline = "alphabetic";
  const rarityText = `${sticker.rarity} // ${sticker.dropWeight ? (sticker.dropWeight / 10).toFixed(1) + '%' : 'EXCLUSIVE'}`;
  c.font = "bold 11px 'JetBrains Mono', monospace";
  const textW = c.measureText(rarityText).width;
  const pillW = textW + 22;
  const pillH = 22;
  const pillX = cx - pillW / 2;
  const pillY = 316;

  c.fillStyle = sticker.border || "#39FF14";
  c.globalAlpha = 0.15;
  c.fillRect(pillX, pillY, pillW, pillH);
  c.globalAlpha = 1.0;
  c.strokeStyle = sticker.border || "#39FF14";
  c.lineWidth = 1;
  c.strokeRect(pillX, pillY, pillW, pillH);

  c.fillStyle = sticker.border || "#39FF14";
  c.fillText(rarityText, cx, pillY + 15);

  // 7. Sticker Name
  c.font = "900 24px 'Space Grotesk', sans-serif";
  c.fillStyle = "#FFFFFF";
  c.textAlign = "center";
  c.fillText(sticker.name.toUpperCase(), cx, 372);

  // 8. Serial & Operator
  c.font = "12px 'JetBrains Mono', monospace";
  c.fillStyle = "rgba(255, 255, 255, 0.65)";
  c.fillText(`SERIAL: #${String(serial).padStart(4, '0')} // OP: ${opRank}`, cx, 400);

  // 9. Perk Box
  const boxY = 418;
  const boxH = 48;
  c.fillStyle = "rgba(0, 0, 0, 0.4)";
  c.fillRect(40, boxY, W - 80, boxH);
  c.strokeStyle = "rgba(255, 255, 255, 0.08)";
  c.strokeRect(40, boxY, W - 80, boxH);

  c.font = "bold 12px 'JetBrains Mono', monospace";
  c.fillStyle = sticker.border || "#39FF14";
  c.fillText(`⚡ PERK: ${sticker.perk}`, cx, boxY + 20);

  c.font = "italic 11px 'Space Grotesk', sans-serif";
  c.fillStyle = "rgba(255, 255, 255, 0.6)";
  c.fillText(`"${sticker.quote}"`, cx, boxY + 39);

  // 10. Footer Bar
  c.strokeStyle = "rgba(255, 255, 255, 0.1)";
  c.beginPath();
  c.moveTo(40, 520);
  c.lineTo(W - 40, 520);
  c.stroke();

  c.font = "10px 'JetBrains Mono', monospace";
  c.fillStyle = "rgba(255, 255, 255, 0.45)";
  c.textAlign = "left";
  c.fillText("CA: 0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f", 42, 545);

  c.textAlign = "right";
  c.fillStyle = "#39FF14";
  c.fillText("naraprotocol.io", W - 42, 545);
}

function pauseLootAutoDismiss() {
  const modal = document.getElementById("lootModal");
  const dismissBar = document.getElementById("modalAutoDismissBar");
  const statusText = document.getElementById("modalStatusText");
  if (modal && modal._autoDismiss) {
    clearTimeout(modal._autoDismiss);
    modal._autoDismiss = null;
  }
  if (dismissBar) {
    dismissBar.style.display = "none";
  }
  if (statusText && !statusText.innerText.includes("INSPECTING")) {
    statusText.innerText = "⭐ CARD STASHED IN VAULT (INSPECTING)";
  }
}

function handleLootBackdropClick(e) {
  if (e) e.stopPropagation();
  closeLootModal(e);
  // Fast non-blocking flush: if player clicked outside card while gameplay was active, flush immediately if ready
  if (!isFlushingCooldown) {
    triggerHydraulicFlush();
  }
}

function handleKeepFlushingClick(e) {
  if (e) e.stopPropagation();
  closeLootModal(e);
  if (!isFlushingCooldown) {
    triggerHydraulicFlush();
  }
}

function showLootModal(sticker, serial, isNew, flushNum, isExplicitInspect = false) {
  const modal = document.getElementById("lootModal");
  const statusText = document.getElementById("modalStatusText");
  const nameEl = document.getElementById("modalCardName");
  const rarityEl = document.getElementById("modalCardRarity");
  const serialEl = document.getElementById("modalCardSerial");
  const perkEl = document.getElementById("modalCardPerk");
  const copyOverlay = document.getElementById("cardCopyOverlay");
  const dismissBar = document.getElementById("modalAutoDismissBar");

  if (copyOverlay) copyOverlay.classList.add("hidden");

  if (statusText) {
    if (isExplicitInspect) {
      statusText.innerText = "👁️ INSPECTING SEWER VAULT CARD";
    } else {
      statusText.innerText = isNew ? "⭐ NEW SEWER STICKER DISCOVERED!" : "🔥 DUPLICATE STICKER DREDGED!";
    }
  }
  if (nameEl) nameEl.innerText = sticker.name.toUpperCase();
  if (rarityEl) {
    rarityEl.innerText = sticker.rarity;
    rarityEl.style.color = sticker.border;
    rarityEl.style.borderColor = sticker.border;
  }
  if (serialEl) serialEl.innerText = `SERIAL: #${String(serial).padStart(4, '0')}`;
  if (perkEl) {
    perkEl.innerText = sticker.perk;
    perkEl.style.color = sticker.border;
  }

  currentInspectedSticker = { sticker, serial };
  const tier = getOperatorTier(flushCount);
  renderStickerCardCanvas(sticker, serial, tier.rank.toUpperCase(), flushNum || flushCount);

  if (modal) {
    modal.classList.remove("hidden");
    syncBodyScrollLock();
    const modalBox = document.getElementById("lootModalBox");
    if (modalBox) modalBox.scrollTop = 0;
    clearTimeout(modal._autoDismiss);
    modal._autoDismiss = null;

    // Auto-dismiss after 4.5s for random dredge drops so user has time to inspect the card
    // If user flushes again or closes, it closes immediately
    if (!isExplicitInspect) {
      if (dismissBar) {
        dismissBar.style.display = "block";
        dismissBar.style.transition = "none";
        dismissBar.style.width = "100%";
        void dismissBar.offsetWidth; // force layout reflow
        dismissBar.style.transition = "width 4500ms linear";
        dismissBar.style.width = "0%";
      }
      modal._autoDismiss = setTimeout(() => {
        closeLootModal();
      }, 4500);
    } else {
      if (dismissBar) {
        dismissBar.style.display = "none";
      }
    }
  }
}

function openCardInspector(stickerId) {
  playMechanicalClick();
  const sticker = STICKER_COLLECTION.find(s => s.id === stickerId);
  if (!sticker) return;
  const stashItem = userStash.unlocked[stickerId] || { serial: currentRoll.opId || 1337 };
  userStash.activeStickerId = stickerId;
  showLootModal(sticker, stashItem.serial, false, flushCount, true);
  if (activeTweetMode === 'sticker') updateForgeUI();
}

function closeLootModal(e) {
  if (e) e.stopPropagation();
  if (!e) playMechanicalClick();
  const modal = document.getElementById("lootModal");
  if (modal) {
    clearTimeout(modal._autoDismiss);
    modal._autoDismiss = null;
    modal.classList.add("hidden");
    syncBodyScrollLock();
  }
}

async function writeCanvasPngToClipboard(cardCanvas) {
  if (!cardCanvas || !cardCanvas.toBlob || !navigator.clipboard || !window.ClipboardItem) {
    return false;
  }
  const blobPromise = new Promise((resolve, reject) => {
    cardCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/png");
  });
  try {
    // Pass Promise directly to ClipboardItem so Safari/WebKit preserves transient user activation
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
    return true;
  } catch (_err) {
    try {
      const blob = await blobPromise;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch (err2) {
      console.warn("Clipboard image copy fallback:", err2);
      return false;
    }
  }
}

async function copyCardAndTweet() {
  playMechanicalClick();
  markQuestShared();
  const cardCanvas = document.getElementById("cardCanvas");
  const copyOverlay = document.getElementById("cardCopyOverlay");
  const btnText = document.getElementById("modalTweetBtnText");

  if (!currentInspectedSticker) return;
  const { sticker, serial } = currentInspectedSticker;
  const tier = getOperatorTier(flushCount);
  const tweetText = formatStickerTweet(sticker, serial, tier.rank, flushCount);
  const shareUrl = getShareUrl(sticker.id);
  const xUrl = buildXIntentUrl(tweetText, shareUrl, xNoLinkMaxReach);

  // 1. Check for Mobile Native Web Share API with File attachment (1-click direct to Twitter / Telegram app!)
  if (cardCanvas && cardCanvas.toBlob && typeof navigator !== "undefined" && navigator.canShare) {
    try {
      const blob = await new Promise(resolve => cardCanvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const fileName = `NARA_STICKER_${String(sticker.id).padStart(2, '0')}_${serial}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          if (btnText) btnText.innerText = "OPENING SHARE SHEET...";
          await navigator.share({
            title: `NARA Sticker Drop #${serial}`,
            text: `${tweetText}\n${shareUrl}`,
            files: [file]
          });
          if (btnText) btnText.innerText = "✓ SHARED!";
          setTimeout(() => {
            if (btnText) btnText.innerText = "📋 COPY CARD & TWEET ON X";
          }, 2500);
          return;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (btnText) btnText.innerText = "📋 COPY CARD & TWEET ON X";
        return;
      }
      console.warn('Native share fallback:', err);
    }
  }

  // 2. Desktop / Fallback: Copy image to clipboard
  const imageCopied = await writeCanvasPngToClipboard(cardCanvas);

  if (copyOverlay) {
    copyOverlay.classList.remove("hidden");
    copyOverlay.innerHTML = imageCopied
      ? `<span class="text-2xl mb-1">📋✓</span><span>CARD COPIED TO CLIPBOARD!</span><span class="text-[9px] text-white/70 normal-case mt-1 font-sans">Press Ctrl+V in your tweet to attach!</span>`
      : `<span class="text-2xl mb-1">💾</span><span>CARD READY TO ATTACH!</span><span class="text-[9px] text-white/70 normal-case mt-1 font-sans">Browser blocked clipboard image. Click DOWNLOAD below to attach!</span>`;
  }
  if (btnText) btnText.innerText = imageCopied ? "✓ COPIED! OPENING X..." : "OPENING X...";

  setTimeout(() => {
    openSafeWindow(xUrl);
    setTimeout(() => {
      if (btnText) btnText.innerText = "📋 COPY CARD & POST ON X";
    }, 3000);
  }, 700);
}

function castInspectedSticker() {
  playMechanicalClick();
  markQuestShared();
  if (!currentInspectedSticker) return;
  const { sticker, serial } = currentInspectedSticker;
  const tier = getOperatorTier(flushCount);
  const text = formatStickerTweet(sticker, serial, tier.rank, flushCount);
  const shareUrl = getShareUrl(sticker.id);
  openSafeWindow(buildWarpcastComposeUrl(text, shareUrl));
}

function downloadCardPNG() {
  playMechanicalClick();
  const cardCanvas = document.getElementById("cardCanvas");
  if (!cardCanvas || !currentInspectedSticker) return;
  const { sticker, serial } = currentInspectedSticker;
  const dataUrl = cardCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `NARA_STICKER_${String(sticker.id).padStart(2, '0')}_${serial}.png`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 100);
  injectSewerEvent(`[DOWNLOAD] Saved ${sticker.name} high-res collectible card.`);
}

async function copyStickerCardFromForge() {
  playMechanicalClick();
  const btnLabel = document.getElementById("forgeCardBtnLabel");
  const stickerId = userStash.activeStickerId || 1;
  const sticker = STICKER_COLLECTION.find(s => s.id === stickerId) || STICKER_COLLECTION[0];
  const stashItem = userStash.unlocked[sticker.id] || { serial: currentRoll.opId || 1337 };
  const tier = getOperatorTier(flushCount);

  renderStickerCardCanvas(sticker, stashItem.serial, tier.rank.toUpperCase(), flushCount);
  const cardCanvas = document.getElementById("cardCanvas");

  const imageCopied = await writeCanvasPngToClipboard(cardCanvas);

  if (btnLabel) {
    btnLabel.innerText = imageCopied ? "COPIED! PRESS CTRL+V" : "COPY FAILED (DOWNLOAD BELOW)";
    setTimeout(() => { btnLabel.innerText = "COPY CARD IMAGE"; }, 2500);
  }

  const toast = document.getElementById("copyToast");
  if (toast) {
    toast.innerText = imageCopied
      ? "✓ STICKER CARD COPIED! PRESS CTRL+V IN TWITTER"
      : "⚠️ CLIPBOARD BLOCKED — USE DOWNLOAD IN LOCKER";
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
      toast.innerText = "✓ Copied to clipboard · Ready to paste";
    }, 2500);
  }
}

function buildStashShareData() {
  const unlockedKeys = Object.keys(userStash.unlocked);
  const count = unlockedKeys.length;
  const tier = getOperatorTier(flushCount);
  const base = CANONICAL_URL.replace(/\/$/, "");
  const shareUrl = count > 0 ? `${base}/s/${userStash.activeStickerId || 1}` : `${base}/s/win`;
  const text = `${count}/12 $NARA sewer cards dredged on Base (${tier.rank} · ${flushCount} ${flushCount === 1 ? 'click' : 'clicks'}).\n\nPressure gauge is primed — chasing the full 12/12 Fame Board run on @NARA_protocol 👇`;
  return { text, shareUrl };
}

function buildStashTweetUrl() {
  const { text, shareUrl } = buildStashShareData();
  return buildXIntentUrl(text, shareUrl, false);
}

function buildStashCastUrl() {
  const { text, shareUrl } = buildStashShareData();
  return buildWarpcastComposeUrl(text, shareUrl);
}

function shareFullStashTweet(e) {
  playMechanicalClick();
  markQuestShared();
  const xUrl = buildStashTweetUrl();
  if (e && e.currentTarget && e.currentTarget.tagName && e.currentTarget.tagName.toLowerCase() === "a") {
    e.currentTarget.href = xUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(xUrl);
  }
}

function shareFullStashCast(e) {
  playMechanicalClick();
  markQuestShared();
  const castUrl = buildStashCastUrl();
  if (e && e.currentTarget && e.currentTarget.tagName && e.currentTarget.tagName.toLowerCase() === "a") {
    e.currentTarget.href = castUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(castUrl);
  }
}

function updateVaultUI() {
  const grid = document.getElementById("vaultGrid");
  const countEl = document.getElementById("vaultUnlockedCount");
  const percentEl = document.getElementById("vaultProgressPercent");
  const shareStashBtn = document.getElementById("shareStashBtn");
  if (!grid) return;

  const unlockedKeys = Object.keys(userStash.unlocked);
  const count = unlockedKeys.length;
  const pct = Math.round((count / STICKER_COLLECTION.length) * 100);

  if (countEl) countEl.innerText = count;
  if (percentEl) percentEl.innerText = pct;
  const badgeBtn = document.getElementById("vaultProgressBadge");
  if (badgeBtn) {
    if (count >= STICKER_COLLECTION.length) {
      badgeBtn.classList.remove("cursor-default");
      badgeBtn.classList.add("cursor-pointer", "hover:bg-emerald-500/20", "hover:border-naraGreen");
      badgeBtn.title = "12/12 Vault Conquered! Click to open Victory & Fame Board submission";
    } else {
      badgeBtn.classList.add("cursor-default");
      badgeBtn.classList.remove("cursor-pointer", "hover:bg-emerald-500/20", "hover:border-naraGreen");
      badgeBtn.title = "Vault collection progress";
    }
  }
  if (shareStashBtn && shareStashBtn.tagName === "A") {
    shareStashBtn.href = buildStashTweetUrl();
  }
  const castStashBtn = document.getElementById("castStashBtn");
  if (castStashBtn && castStashBtn.tagName === "A") {
    castStashBtn.href = buildStashCastUrl();
  }

  grid.innerHTML = "";
  STICKER_COLLECTION.forEach(sticker => {
    const stashItem = userStash.unlocked[sticker.id];
    const isUnlocked = !!stashItem;
    const cardBtn = document.createElement("button");
    cardBtn.type = "button";

    if (isUnlocked) {
      cardBtn.className = "relative w-full min-h-[98px] rounded-xl bg-[#0D131F] border p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer group focus-visible:ring-2 focus-visible:ring-naraGreen outline-none";
      cardBtn.style.borderColor = `${sticker.border}88`;
      cardBtn.setAttribute("aria-label", `Inspect unlocked sticker #${sticker.id}: ${sticker.name} (${sticker.rarity})`);
      cardBtn.addEventListener("click", () => openCardInspector(sticker.id));

      cardBtn.innerHTML = `
        <div class="relative flex items-center justify-center select-none">
          <span class="text-3xl">${sticker.icon}</span>
          <span class="absolute -top-1 -right-1.5 text-sm">${sticker.deco}</span>
        </div>
        <div class="w-full truncate text-xs font-medium text-white font-sans select-none">
          ${sticker.name}
        </div>
      `;
    } else {
      cardBtn.className = "relative w-full min-h-[98px] rounded-xl bg-[#090E18] border border-white/[0.06] hover:border-white/20 p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer select-none group focus-visible:ring-2 focus-visible:ring-white/50 outline-none";
      cardBtn.setAttribute("aria-label", `Locked sticker #${sticker.id} (${sticker.rarity}) — tap to flush and dredge`);
      cardBtn.addEventListener("click", (ev) => {
        cardBtn.classList.remove("animate-pulse");
        void cardBtn.offsetWidth;
        cardBtn.classList.add("animate-pulse");
        setTimeout(() => cardBtn.classList.remove("animate-pulse"), 450);
        triggerHydraulicFlush(ev);
      });

      cardBtn.innerHTML = `
        <div class="text-2xl opacity-30 grayscale group-hover:opacity-65 transition-opacity">
          💩
        </div>
        <div class="text-[11px] font-mono text-slate-500 group-hover:text-slate-300">
          #${String(sticker.id).padStart(2, '0')}
        </div>
      `;
    }
    grid.appendChild(cardBtn);
  });
  updateRunDisplayUI();
  updateQuestUI();
}

function checkLootDrop(count, evt = null) {
  const milestones = [10, 25, 50, 69, 100, 200, 420];
  const isMilestone = milestones.includes(count) || milestones.includes(runFlushes);
  const isFirst = count === 1 || runFlushes === 1;
  const lockedPool = STICKER_COLLECTION.filter((s) => !userStash.unlocked[s.id]);
  const pressureGuaranteed = dredgePressure >= 100;
  const dropChance = lockedPool.length > 0 ? Math.min(0.92, 0.34 + dredgePressure * 0.004) : 0.30;
  const willDrop = isFirst || isMilestone || pressureGuaranteed || Math.random() < dropChance;

  if (!willDrop) {
    if (lockedPool.length > 0) {
      dredgePressure = Math.min(100, dredgePressure + 34);
      dryNewStreak++;
      saveFlushProgress();
      updateRunDisplayUI();
    }
    return;
  }

  let pool = STICKER_COLLECTION;
  if (lockedPool.length > 0) {
    const forceNewCard = isFirst || isMilestone || pressureGuaranteed || dryNewStreak >= 1 || Math.random() < 0.78;
    if (forceNewCard) {
      pool = isMilestone && lockedPool.some((s) => s.rarity !== "COMMON")
        ? lockedPool.filter((s) => s.rarity !== "COMMON")
        : lockedPool;
    } else if (isMilestone) {
      pool = STICKER_COLLECTION.filter((s) => s.rarity !== "COMMON");
    }
  } else if (isMilestone) {
    pool = STICKER_COLLECTION.filter((s) => s.rarity !== "COMMON");
  }

  // Soften weight tail (pow 0.42) so all 12 rarities stay achievable within ~25-60 clicks
  const weights = pool.map((s) => Math.max(2, Math.pow(s.dropWeight || 10, 0.42)));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * totalWeight;
  let chosen = pool[0];
  for (let i = 0; i < pool.length; i++) {
    if (r < weights[i]) {
      chosen = pool[i];
      break;
    }
    r -= weights[i];
  }

  const isNew = !userStash.unlocked[chosen.id];
  const serial = isNew
    ? Math.floor(1000 + Math.random() * 9000)
    : userStash.unlocked[chosen.id].serial;

  if (isNew) {
    userStash.unlocked[chosen.id] = {
      count: 1,
      serial: serial,
      firstDropAt: Date.now()
    };
    dredgePressure = 0;
    dryNewStreak = 0;
  } else {
    userStash.unlocked[chosen.id].count++;
    if (lockedPool.length > 0) {
      dredgePressure = Math.min(100, dredgePressure + 45);
      dryNewStreak++;
    }
  }
  userStash.activeStickerId = chosen.id;
  userStash.totalDrops = (userStash.totalDrops || 0) + 1;
  saveUserStash();
  saveFlushProgress();

  playLootDropChime();
  injectSewerEvent(`🚽 [SEWER DREDGE] You dredged: ${chosen.deco} ${chosen.name} (${chosen.rarity})!`);
  spawnFloatingFeedback(isNew ? `🎴 NEW ${chosen.name.split(" ")[0]}!` : `♻️ DUPE +PRESSURE`, isNew ? "gold" : "cyan", evt);
  const hintEl = document.getElementById("vaultHintText");
  if (hintEl) {
    hintEl.innerText = isNew
      ? `DREDGED #${String(chosen.id).padStart(2, "0")} ${chosen.name.toUpperCase()}! (${Object.keys(userStash.unlocked).length}/12)`
      : `DUPLICATE DROPPED — PRESSURE CHARGED TO ${dredgePressure}% FOR NEXT NEW CARD`;
  }
  showLootModal(chosen, serial, isNew, count);
  updateVaultUI();
  updateRunDisplayUI();
  updateQuestUI();
  if (activeTweetMode === 'sticker') {
    updateForgeUI();
  }

  // Check for 12/12 Victory Conquered!
  const totalUnlocked = Object.keys(userStash.unlocked).length;
  if (totalUnlocked === 12 && !runWon) {
    runWon = true;
    saveFlushProgress();
    setTimeout(() => {
      triggerVictoryFlow();
    }, 600);
  }
}

// --- CLIENT-SIDE 1.0s HYDRAULIC COOLDOWN & ANTI-AUTO-CLICKER ---
let lastFlushTimestamp = 0;
let isFlushingCooldown = false;
const FLUSH_RATE_LIMIT_MS = 1000; // Strict 1.0-second hydraulic cooldown

function triggerHydraulicFlush(evt = null) {
  const now = Date.now();
  if (isFlushingCooldown || (now - lastFlushTimestamp < FLUSH_RATE_LIMIT_MS)) {
    // Visual and acoustic feedback on early clicks during active 1.0s hydraulic recharge
    const headerBtn = document.getElementById("headerFlushBtn");
    const cooldownBar = document.getElementById("flushCooldownBar");
    if (headerBtn) {
      headerBtn.classList.remove("animate-pulse");
      void headerBtn.offsetWidth;
      headerBtn.classList.add("animate-pulse");
    }
    if (cooldownBar) {
      cooldownBar.classList.add("bg-hazardRed/70");
      setTimeout(() => cooldownBar.classList.remove("bg-hazardRed/70"), 120);
    }
    playRechargeTick();
    return; // Throttled
  }
  isFlushingCooldown = true;
  lastFlushTimestamp = now;

  // If loot modal is showing from a previous dredge auto-drop, dismiss it now that cooldown passed
  const lootModal = document.getElementById("lootModal");
  if (lootModal && !lootModal.classList.contains("hidden") && lootModal._autoDismiss) {
    closeLootModal();
  }

  // Mobile haptic vibration feedback
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(combo >= 10 ? [20, 30, 20, 30, 25] : [15, 35, 20]);
    } catch (e) {}
  }

  // Update Cooldown Gauge UI
  const headerBtn = document.getElementById("headerFlushBtn");
  const headerLabel = document.getElementById("headerFlushBtnLabel");
  const cooldownBar = document.getElementById("flushCooldownBar");
  const hoverText = document.getElementById("artHoverText");

  if (headerBtn) headerBtn.classList.add("opacity-75", "cursor-wait");
  if (headerLabel) headerLabel.innerHTML = '1.0s';
  if (hoverText) hoverText.innerHTML = 'Recharging pressure (1.0s)…';

  if (cooldownBar) {
    cooldownBar.style.transition = "none";
    cooldownBar.style.width = "0%";
    void cooldownBar.offsetWidth; // Force layout reflow
    cooldownBar.style.transition = "width 1000ms linear";
    cooldownBar.style.width = "100%";
  }

  setTimeout(() => {
    isFlushingCooldown = false;
    if (headerBtn) headerBtn.classList.remove("opacity-75", "cursor-wait");
    if (headerLabel) headerLabel.innerHTML = 'Flush';
    if (hoverText) hoverText.innerHTML = 'Click or press Space to flush candles';
    if (cooldownBar) {
      cooldownBar.style.transition = "none";
      cooldownBar.style.width = "0%";
    }
  }, FLUSH_RATE_LIMIT_MS);

  playHydraulicFlushSound();

  const shell = document.getElementById("appShell") || document.getElementById("pageBody");
  shell.classList.remove("screen-flush-active");
  void shell.offsetWidth;
  shell.classList.add("screen-flush-active");

  // Visual flash
  const ambient = document.getElementById("ambientGreen");
  ambient.style.background = combo >= 10 ? "rgba(57, 255, 20, 0.45)" : "rgba(57, 255, 20, 0.25)";
  setTimeout(() => {
    ambient.style.background = "rgba(57, 255, 20, 0.05)";
  }, 400);

  flushCount++;
  if (!runWon) {
    runFlushes++;
  }
  const counterEl = document.getElementById("flushCounter");
  if (counterEl) counterEl.innerText = flushCount;
  const runCounterEl = document.getElementById("runFlushesCount");
  if (runCounterEl) runCounterEl.innerText = runFlushes;

  // Persist progress
  saveFlushProgress();
  updateRunDisplayUI();
  updateQuestUI();

  // Update Quick Tweet button label
  const quickLabel = document.getElementById("quickTweetLabel");
  if (quickLabel) {
    quickLabel.innerText = `POST [${flushCount}]`;
  }

  // Combo management
  combo++;
  updateComboUI();
  spawnFloatingFeedback(combo >= 5 ? `🔥 COMBO x${combo}` : `+1 FLUSH [${flushCount}]`, combo >= 10 ? "gold" : "green", evt);
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => {
    combo = 0;
    updateComboUI();
  }, 1600);

  // Roll a fresh, unique message for this state and update entire Forge
  rollNewDegenMessage(flushCount);
  updateForgeUI();

  // Check for Tier Level Up!
  const tier = getOperatorTier(flushCount);
  if (tier.level > previousTierLevel) {
    previousTierLevel = tier.level;
    saveFlushProgress();
    playPromotionFanfare();
    injectSewerEvent(`⚡ [PROMOTION] YOU reached LVL ${tier.level}: ${tier.rank.toUpperCase()}!`);
    showMilestone(flushCount, currentRoll, tier);
  } else {
    // ALWAYS update the banner if it's currently open, so it never freezes on old numbers!
    const banner = document.getElementById("milestoneBanner");
    if (banner && !banner.classList.contains("hidden")) {
      const rankBadge = document.getElementById("milestoneRankBadge");
      const previewEl = document.getElementById("milestoneQuotePreview");
      if (rankBadge) rankBadge.innerText = `[OP #${currentRoll.opId}] LVL ${tier.level}: ${tier.rank.toUpperCase()} // ${flushCount} PURGES`;
      if (previewEl) previewEl.innerText = `"${currentRoll.hook}"`;
      resetBannerAutoDismiss();
    }
  }

  // Trigger popout at iconic milestones (10, 25, 50, 69, 100, 200, 420)
  if (flushCount === 10 || flushCount === 25 || flushCount === 50 || flushCount === 69 || flushCount === 100 || flushCount === 200 || flushCount === 420) {
    showMilestone(flushCount, currentRoll, tier);
  }

  // Check for Collectible Sticker Loot Dredge!
  checkLootDrop(flushCount, evt);

  // Candlestick burst count multiplies with combo overdrive! (Respect OS prefers-reduced-motion)
  const reduceMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    const burstCount = combo >= 20 ? 90 : (combo >= 10 ? 65 : 45);
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * 0.38;

    for (let i = 0; i < burstCount; i++) {
      const c = new Candlestick(
        originX + (Math.random() - 0.5) * 200,
        originY + (Math.random() - 0.5) * 120
      );
      c.vx = (Math.random() - 0.5) * (combo >= 10 ? 32 : 22);
      c.vy = (Math.random() * -14) - 3;
      candles.push(c);
    }
    startCandleLoop();
  }
}

let bannerDismissTimer = null;
function resetBannerAutoDismiss() {
  clearTimeout(bannerDismissTimer);
  bannerDismissTimer = setTimeout(() => {
    const banner = document.getElementById("milestoneBanner");
    if (banner) banner.classList.add("hidden");
  }, 7000);
}

function rerollBannerQuote(e) {
  if (e) e.stopPropagation();
  playMechanicalClick();
  rollNewDegenMessage(flushCount);
  currentRoll.opId = Math.floor(1000 + Math.random() * 9000);
  const tier = getOperatorTier(flushCount);
  const rankBadge = document.getElementById("milestoneRankBadge");
  const previewEl = document.getElementById("milestoneQuotePreview");
  if (rankBadge) rankBadge.innerText = `[OP #${currentRoll.opId}] LVL ${tier.level}: ${tier.rank.toUpperCase()} // ${flushCount} PURGES`;
  if (previewEl) previewEl.innerText = `"${currentRoll.hook}"`;
  updateForgeUI();
  resetBannerAutoDismiss();
}

function showMilestone(count, roll, tier) {
  const banner = document.getElementById("milestoneBanner");
  const rankBadge = document.getElementById("milestoneRankBadge");
  const previewEl = document.getElementById("milestoneQuotePreview");
  const currentTier = tier || getOperatorTier(count);
  if (banner && rankBadge && previewEl) {
    rankBadge.innerText = `[OP #${roll.opId}] PROMOTION: LVL ${currentTier.level} ${currentTier.rank.toUpperCase()} // ${count} PURGES`;
    previewEl.innerText = `"${roll.hook}"`;
    banner.classList.remove("hidden");
    resetBannerAutoDismiss();
  }
}

function dismissMilestone(e) {
  if (e) e.stopPropagation();
  clearTimeout(bannerDismissTimer);
  document.getElementById("milestoneBanner")?.classList.add("hidden");
}

// --- ALL-TIME FAME BOARD & VICTORY ENGINE ---
const DEFAULT_FAME_BOARD = [];

function getRatingTier(score) {
  if (score < 35) {
    return { name: "GOD-TIER PORCELAIN DEITY", color: "#FFD700", border: "#FFD700", bg: "rgba(255, 215, 0, 0.15)" };
  } else if (score < 50) {
    return { name: "ELITE SEWER TACTICIAN", color: "#38BDF8", border: "#38BDF8", bg: "rgba(56, 189, 248, 0.15)" };
  } else if (score < 70) {
    return { name: "CERTIFIED PURGER", color: "#39FF14", border: "#39FF14", bg: "rgba(57, 255, 20, 0.15)" };
  } else {
    return { name: "PERSISTENT BEAR SLAYER", color: "#A855F7", border: "#A855F7", bg: "rgba(168, 85, 247, 0.15)" };
  }
}

let localFameBoard = [];

function isLegacyMockSeed(handle) {
  if (!handle || typeof handle !== "string") return true;
  const h = handle.trim().toLowerCase();
  return (
    h === "@satoshi_plunger" ||
    h === "@vitalik_roll" ||
    h === "@base_general" ||
    h === "@degen_harvester" ||
    h === "@sewer_sniper"
  );
}

function safePostHref(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return "";
    const host = u.hostname.toLowerCase();
    if (host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com" || host === "mobile.twitter.com") {
      const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,20})\/status\/(\d{5,25})\/?$/);
      return m ? `https://x.com/${m[1]}/status/${m[2]}` : "";
    }
    if (host === "warpcast.com" || host === "www.warpcast.com" || host === "farcaster.xyz" || host === "www.farcaster.xyz") {
      const m = u.pathname.match(/^\/([A-Za-z0-9_.-]{1,30})\/(0x[a-fA-F0-9]{4,64})\/?$/);
      return m ? `https://warpcast.com/${m[1]}/${m[2]}` : "";
    }
  } catch (e) {}
  return "";
}

// Normalize any board row (API JSON or localStorage) to known types before it reaches the DOM.
function sanitizeBoardEntry(item) {
  if (!item || typeof item !== "object" || typeof item.handle !== "string") return null;
  const score = Number(item.score);
  if (!Number.isFinite(score) || score < 1) return null;
  const plat = typeof item.platform === "string" && ["x", "tg", "fc"].includes(item.platform.toLowerCase())
    ? item.platform.toLowerCase()
    : "x";
  return {
    handle: item.handle.slice(0, 24),
    score: Math.floor(score),
    tier: typeof item.tier === "string" ? item.tier.slice(0, 40) : getRatingTier(Math.floor(score)).name,
    date: typeof item.date === "string" ? item.date.slice(0, 24) : "RECENT",
    timestamp: Number(item.timestamp) || 0,
    platform: plat,
    walletHint: typeof item.walletHint === "string" ? item.walletHint.slice(0, 16) : "",
    postUrl: safePostHref(item.postUrl),
    awardReady: item.awardReady === true,
  };
}

function loadLocalFameBoard() {
  try {
    const saved = localStorage.getItem("nara_fame_board_v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        localFameBoard = parsed.map(sanitizeBoardEntry).filter(item => item && !isLegacyMockSeed(item.handle));
        return;
      }
    }
  } catch (e) {}
  localFameBoard = [];
}

function saveLocalFameBoard() {
  try {
    localStorage.setItem("nara_fame_board_v1", JSON.stringify(localFameBoard));
  } catch (e) {}
}

function renderFameBoard(entries) {
  const tbody = document.getElementById("fameBoardBody");
  if (!tbody) return;
  const list = (Array.isArray(entries) ? entries : localFameBoard).map(sanitizeBoardEntry).filter(item => item && !isLegacyMockSeed(item.handle));

  tbody.innerHTML = "";
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr id="emptyFameBoardRow">
        <td colspan="5" class="py-10 px-4 text-center">
          <div class="flex flex-col items-center justify-center gap-2 text-slate-400">
            <div class="text-sm font-semibold text-amber-300 font-sans">
              Leaderboard is open · Claim the #1 spot
            </div>
            <div class="text-xs text-slate-400 max-w-md font-sans leading-relaxed">
              Dredge all 12 sticker cards (~25–55 clicks with the pressure gauge) to record your handle and generate an Award Claim Pass.
            </div>
            <button
              type="button"
              data-on-click="startRunFromBoard"
              class="mt-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-sans font-bold text-xs cursor-pointer transition-colors"
            >
              Start a Run Now
            </button>
          </div>
        </td>
      </tr>
    `;
    bindActions(tbody);
    return;
  }

  list.forEach((entry, idx) => {
    const rank = idx + 1;
    const score = Number(entry.score) || 0;
    const tier = getRatingTier(score);
    let rankBadge = `#${rank}`;
    let rankClass = "text-slate-400 font-mono";

    if (rank === 1) {
      rankBadge = "🥇 1st";
      rankClass = "text-amber-300 font-bold font-mono";
    } else if (rank === 2) {
      rankBadge = "🥈 2nd";
      rankClass = "text-slate-200 font-bold font-mono";
    } else if (rank === 3) {
      rankBadge = "🥉 3rd";
      rankClass = "text-amber-500 font-bold font-mono";
    }

    const platLabel = (entry.platform || "x").toUpperCase();
    const walletPill = entry.walletHint
      ? `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">${escapeHTML(entry.walletHint)}</span>`
      : "";
    const passPill = entry.awardReady
      ? `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-amber-400/40 bg-amber-500/10 text-amber-300">Pass ✓</span>`
      : "";
    const postLink = entry.postUrl
      ? `<a href="${escapeHTML(entry.postUrl)}" target="_blank" rel="noopener noreferrer" class="ml-1.5 text-[11px] text-sky-300 hover:underline no-underline">Post ↗</a>`
      : "";

    const tr = document.createElement("tr");
    tr.className = rank === 1 ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08] transition-colors" : "hover:bg-white/[0.02] transition-colors";
    tr.innerHTML = `
      <td class="py-3 px-3 sm:px-4 text-center text-xs ${rankClass}">${rankBadge}</td>
      <td class="py-3 px-3 sm:px-4 font-mono font-semibold text-xs text-white">
        <span class="inline-flex flex-wrap items-center gap-1">
          <span class="px-1.5 py-0.5 rounded text-[10px] border border-white/15 bg-white/[0.05] text-slate-300">${platLabel}</span>
          <span>${escapeHTML(entry.handle)}</span>
          ${walletPill}${passPill}${postLink}
        </span>
      </td>
      <td class="py-3 px-3 sm:px-4 text-center font-mono font-bold text-xs text-amber-300">
        ${score} <span class="text-[10px] text-slate-400 font-normal">clicks</span>
      </td>
      <td class="py-3 px-3 sm:px-4 hidden sm:table-cell">
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold border" style="color:${tier.color}; border-color:${tier.border}66; background:${tier.bg};">
          ${tier.name}
        </span>
      </td>
      <td class="py-3 px-3 sm:px-4 text-right hidden md:table-cell text-slate-400 font-mono text-xs">
        ${escapeHTML(entry.date || "Recent")}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function syncFameBoardFromAPI() {
  try {
    const res = await fetch("/api/leaderboard", { method: "GET" });
    if (res.ok) {
      const remoteData = await res.json();
      if (Array.isArray(remoteData)) {
        const cleanRemote = remoteData.map(sanitizeBoardEntry).filter(item => item && !isLegacyMockSeed(item.handle));
        // Merge with any offline submissions in localFameBoard
        const merged = [...cleanRemote];
        localFameBoard.forEach(localItem => {
          if (!isLegacyMockSeed(localItem.handle) && !merged.some(m => m.handle.toLowerCase() === localItem.handle.toLowerCase() && m.score === localItem.score)) {
            merged.push(localItem);
          }
        });
        merged.sort((a, b) => a.score - b.score);
        localFameBoard = merged.slice(0, 50).map((item, idx) => ({ ...item, rank: idx + 1 }));
        saveLocalFameBoard();
        renderFameBoard(localFameBoard);
        return;
      }
    }
  } catch (err) {
    // Functions API not available (e.g. running on Vite or static file)
  }
  renderFameBoard(localFameBoard);
}

function refreshLeaderboardUI() {
  playMechanicalClick();
  syncFameBoardFromAPI();
  injectSewerEvent("[FAME BOARD] Leaderboard telemetry refreshed.");
}

// --- CLOUDFLARE TURNSTILE (only loaded when the victory modal opens and a site key exists) ---
let turnstileWidgetId = null;
let turnstileFailed = false;
let isSubmittingVictory = false;

function ensureTurnstile() {
  if (!TURNSTILE_SITE_KEY) return;
  const mount = document.getElementById("victoryTurnstile");
  if (!mount) return;
  mount.classList.remove("hidden");
  const render = () => {
    if (!window.turnstile) return;
    try {
      turnstileFailed = false;
      if (turnstileWidgetId === null) {
        turnstileWidgetId = window.turnstile.render(mount, {
          sitekey: TURNSTILE_SITE_KEY,
          action: "fame_board_submit",
          theme: "dark",
          size: "flexible",
          "error-callback": () => { turnstileFailed = true; },
          "expired-callback": () => {
            if (window.turnstile && turnstileWidgetId !== null) {
              try { window.turnstile.reset(turnstileWidgetId); } catch (e) {}
            }
          },
        });
      } else {
        window.turnstile.reset(turnstileWidgetId);
      }
    } catch (err) {
      turnstileFailed = true;
    }
  };
  if (window.turnstile) { render(); return; }
  if (document.getElementById("turnstileScript")) return;
  window.addEventListener("nara:turnstile-ready", render, { once: true });
  window.naraTurnstileReady = () => window.dispatchEvent(new Event("nara:turnstile-ready"));
  const s = document.createElement("script");
  s.id = "turnstileScript";
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=naraTurnstileReady&render=explicit";
  s.async = true;
  s.defer = true;
  s.onerror = () => { turnstileFailed = true; };
  document.head.appendChild(s);
}

const SUBMIT_STATES = {
  idle:       { btn: "SUBMIT SCORE",      note: "", cls: "text-white/60" },
  invalid:    { btn: "SUBMIT SCORE",      note: "Enter a valid handle (2–20 chars, not a reserved name).", cls: "text-red-400" },
  verify:     { btn: "SUBMIT SCORE",      note: "Complete the check above first.", cls: "text-amber-300" },
  loading:    { btn: "SUBMIT SCORE",      note: "Verification is still loading. Try again in a moment.", cls: "text-amber-300" },
  blocked:    { btn: "✓ SAVED ON DEVICE", note: "The verification widget could not load (blocked by your browser?). Saved in this browser only.", cls: "text-amber-300" },
  submitting: { btn: "SUBMITTING...",     note: "", cls: "text-white/60" },
  posted:     { btn: "✓ POSTED TO BOARD", note: "✓ Posted to the global Fame Board and saved in this browser.", cls: "text-naraGreen" },
  local:      { btn: "✓ SAVED ON DEVICE", note: "Global board is offline. Your record is saved in this browser only.", cls: "text-amber-300" },
  limited:    { btn: "✓ SAVED ON DEVICE", note: "Too many submissions from your network. Saved in this browser; try again later.", cls: "text-amber-300" },
  rejected:   { btn: "✓ SAVED ON DEVICE", note: "The board rejected this entry. Saved in this browser only.", cls: "text-amber-300" },
  locked:     { btn: "HANDLE LOCKED",     note: "That handle is already claimed by another operator key. Pick your own handle.", cls: "text-red-400" },
};

function setSubmitState(state) {
  const btnText = document.getElementById("victorySubmitBtnText");
  const notice = document.getElementById("victorySubmitNotice");
  const copy = SUBMIT_STATES[state] || SUBMIT_STATES.idle;
  if (btnText) btnText.innerText = copy.btn;
  if (notice) {
    notice.innerText = copy.note;
    notice.className = `text-[8px] font-mono mt-1 ${copy.cls}${copy.note ? "" : " hidden"}`;
  }
}

function setVictoryPlatform(_e, plat) {
  playMechanicalClick();
  const next = ["x", "tg", "fc"].includes(plat) ? plat : "x";
  victoryPlatform = next;
  ["x", "tg", "fc"].forEach((key) => {
    const btn = document.getElementById(`victoryPlatBtn-${key}`);
    if (!btn) return;
    const active = key === next;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.className = active
      ? "px-2 py-0.5 min-h-[26px] bg-white text-black text-[9px] font-bold uppercase cursor-pointer"
      : "px-2 py-0.5 min-h-[26px] bg-white/[0.06] border border-white/15 text-white/70 text-[9px] font-bold uppercase cursor-pointer";
  });
}

function renderAwardClaimPass(pass) {
  const box = document.getElementById("victoryClaimPassBox");
  const codeEl = document.getElementById("victoryClaimCodeValue");
  const metaEl = document.getElementById("victoryClaimMeta");
  if (!box || !codeEl || !metaEl) return;
  if (!pass || !pass.claimCode) {
    box.classList.add("hidden");
    return;
  }
  codeEl.innerText = pass.claimCode;
  const walletTag = pass.walletHint ? ` · ${pass.walletHint}` : "";
  const modeTag = pass.verifiedGlobal ? "Global Pass" : "Device Pass";
  metaEl.innerText = `${(pass.platform || "x").toUpperCase()} ${pass.handle} · ${pass.score} clicks${walletTag} · ${modeTag}`;
  box.classList.remove("hidden");
}

function offlineClaimCode(handle, score) {
  let h = 2166136261;
  const seed = `${handle.toLowerCase()}:${score}:${getOperatorSecret()}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const part1 = (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `PASS-${part1.slice(0, 4)}-${part1.slice(4, 8)}`;
}

async function fillVictoryConnectedWallet() {
  playMechanicalClick();
  const input = document.getElementById("victoryWalletInput");
  if (!input) return;
  const addr = getConnectedAccount();
  if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
    input.value = addr;
    injectSewerEvent(`[AWARD ROUTE] Loaded connected wallet ${addr.slice(0, 6)}…${addr.slice(-4)}.`);
    return;
  }
  const notice = document.getElementById("victorySubmitNotice");
  if (notice) {
    notice.innerText = "Connect a wallet in BUY $NARA first, or paste any Base 0x address manually.";
    notice.className = "text-[8px] font-mono mt-1 text-amber-300";
  }
}

function copyAwardClaimPass() {
  playMechanicalClick();
  if (!lastAwardPass || !lastAwardPass.claimCode) return;
  const summary = [
    "NARA PROTOCOL — AWARD CLAIM PASS",
    `Operator: ${(lastAwardPass.platform || "x").toUpperCase()} ${lastAwardPass.handle}`,
    `Claim Code: ${lastAwardPass.claimCode}`,
    `Score: ${lastAwardPass.score} clicks (12/12 Sewer Vault)`,
    lastAwardPass.walletHint ? `Wallet: ${lastAwardPass.walletHint}` : "Wallet: Claim via CryptoSLIP DM",
    lastAwardPass.postUrl ? `Post: ${lastAwardPass.postUrl}` : null,
  ].filter(Boolean).join("\n");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(summary).catch(() => copyTextFallback(summary));
  } else {
    copyTextFallback(summary);
  }
  const label = document.getElementById("victoryCopyPassLabel");
  if (label) {
    label.innerText = "✓ CLAIM PASS COPIED!";
    setTimeout(() => { label.innerText = "📋 COPY AWARD CLAIM PASS"; }, 2200);
  }
  injectSewerEvent(`[AWARD PASS] Copied Claim Code ${lastAwardPass.claimCode} for ${lastAwardPass.handle}.`);
}

function triggerVictoryFlow() {
  // Close any open loot modal so victory modal is immediately visible and body scroll is clean
  closeLootModal();
  playVictoryFanfare();

  // Explosive Gold & Emerald Candlestick shower (Respect OS prefers-reduced-motion)
  const reduceMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * 0.35;
    for (let i = 0; i < 110; i++) {
      const c = new Candlestick(
        originX + (Math.random() - 0.5) * 350,
        originY + (Math.random() - 0.5) * 160
      );
      c.isGreen = true;
      c.color = Math.random() > 0.4 ? "#FFD700" : "#39FF14";
      c.glow = Math.random() > 0.4 ? "rgba(255, 215, 0, 0.7)" : "rgba(57, 255, 20, 0.7)";
      c.vx = (Math.random() - 0.5) * 30;
      c.vy = (Math.random() * -18) - 5;
      candles.push(c);
    }
    startCandleLoop();
  }

  // Update personal best record
  const effectiveScore = Math.max(12, runFlushes || 12);
  if (runFlushes < 12) runFlushes = effectiveScore;
  if (bestRunRecord === null || runFlushes < bestRunRecord) {
    bestRunRecord = runFlushes;
    saveFlushProgress();
    updateRunDisplayUI();
  }

  const rating = getRatingTier(runFlushes);
  const scoreEl = document.getElementById("victoryScoreNumber");
  const tierEl = document.getElementById("victoryTierBadge");
  const handleInput = document.getElementById("victoryHandleInput");
  const walletInput = document.getElementById("victoryWalletInput");
  const postInput = document.getElementById("victoryPostUrlInput");
  const notice = document.getElementById("victorySubmitNotice");

  if (scoreEl) scoreEl.innerText = runFlushes;
  if (tierEl) {
    tierEl.innerText = rating.name;
    tierEl.style.color = rating.color;
    tierEl.style.borderColor = rating.border;
    tierEl.style.background = rating.bg;
  }
  if (notice) notice.classList.add("hidden");
  setSubmitState("idle");
  ensureTurnstile();

  // Remember last used handle & optional award route fields
  try {
    const savedHandle = localStorage.getItem("nara_operator_handle_v1");
    if (savedHandle && handleInput && !handleInput.value) {
      handleInput.value = savedHandle;
    }
    const savedPlat = localStorage.getItem("nara_operator_platform_v1");
    if (savedPlat) setVictoryPlatform(null, savedPlat);
    const savedWallet = localStorage.getItem("nara_operator_wallet_v1");
    if (savedWallet && walletInput && !walletInput.value) {
      walletInput.value = savedWallet;
    } else if (walletInput && !walletInput.value) {
      const connected = getConnectedAccount();
      if (connected) walletInput.value = connected;
    }
    const savedPost = localStorage.getItem("nara_operator_post_v1");
    if (savedPost && postInput && !postInput.value) {
      postInput.value = savedPost;
    }
  } catch (e) {}

  renderAwardClaimPass(lastAwardPass);

  const modal = document.getElementById("victoryModal");
  if (modal) {
    modal.classList.remove("hidden");
    syncBodyScrollLock();
  }
  const vicTweetBtn = document.getElementById("victoryTweetBtn");
  if (vicTweetBtn) vicTweetBtn.href = buildVictoryTweetUrl();
  const vicCastBtn = document.getElementById("victoryCastBtn");
  if (vicCastBtn) vicCastBtn.href = buildVictoryCastUrl();

  injectSewerEvent(`👑 [VICTORY] 12/12 VAULT CONQUERED IN ${runFlushes} CLICKS! Rating: ${rating.name}`);
}

function reopenVictoryIfWon() {
  if (Object.keys(userStash.unlocked).length >= STICKER_COLLECTION.length) {
    triggerVictoryFlow();
  }
}

function closeVictoryModal(e) {
  if (e) e.stopPropagation();
  playMechanicalClick();
  const modal = document.getElementById("victoryModal");
  if (modal) {
    modal.classList.add("hidden");
    syncBodyScrollLock();
  }
}

async function submitVictoryToFameBoard() {
  if (isSubmittingVictory) return;
  playMechanicalClick();
  const handleInput = document.getElementById("victoryHandleInput");
  const walletInput = document.getElementById("victoryWalletInput");
  const postInput = document.getElementById("victoryPostUrlInput");
  const rawHandle = handleInput ? handleInput.value.trim() : "";
  const cleanHandle = `@${rawHandle.replace(/@/g, "").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 20)}`;
  if (cleanHandle.length < 2 || isLegacyMockSeed(cleanHandle)) {
    setSubmitState("invalid");
    if (handleInput) handleInput.focus();
    return;
  }
  const rawWallet = walletInput ? walletInput.value.trim() : "";
  const cleanWallet = /^0x[a-fA-F0-9]{40}$/.test(rawWallet) ? rawWallet : "";
  const cleanPostUrl = safePostHref(postInput ? postInput.value.trim() : "");
  const walletHint = cleanWallet ? `${cleanWallet.slice(0, 6)}…${cleanWallet.slice(-4)}` : "";

  try {
    localStorage.setItem("nara_operator_handle_v1", cleanHandle);
    localStorage.setItem("nara_operator_platform_v1", victoryPlatform);
    if (cleanWallet) localStorage.setItem("nara_operator_wallet_v1", cleanWallet);
    if (cleanPostUrl) localStorage.setItem("nara_operator_post_v1", cleanPostUrl);
  } catch (e) {}

  // 1. Always save locally first (device record)
  const rating = getRatingTier(runFlushes);
  const newEntry = {
    handle: cleanHandle,
    score: runFlushes,
    tier: rating.name,
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    timestamp: Date.now(),
    platform: victoryPlatform,
    walletHint,
    postUrl: cleanPostUrl,
    awardReady: true,
  };
  const existingIdx = localFameBoard.findIndex((e) => e.handle.toLowerCase() === cleanHandle.toLowerCase());
  if (existingIdx !== -1) {
    if (runFlushes < localFameBoard[existingIdx].score) localFameBoard[existingIdx] = newEntry;
  } else {
    localFameBoard.push(newEntry);
  }
  localFameBoard.sort((a, b) => a.score - b.score);
  localFameBoard = localFameBoard.slice(0, 50).map((item, idx) => ({ ...item, rank: idx + 1 }));
  saveLocalFameBoard();
  renderFameBoard(localFameBoard);

  const issueLocalPass = () => {
    lastAwardPass = {
      handle: cleanHandle,
      platform: victoryPlatform,
      score: runFlushes,
      walletHint,
      postUrl: cleanPostUrl,
      claimCode: offlineClaimCode(cleanHandle, runFlushes),
      verifiedGlobal: false,
      issuedAt: Date.now(),
    };
    try { localStorage.setItem("nara_award_pass_v1", JSON.stringify(lastAwardPass)); } catch (e) {}
    renderAwardClaimPass(lastAwardPass);
    updateQuestUI();
  };

  // 2. Global board only when Turnstile is configured and the check passed
  if (!TURNSTILE_SITE_KEY) {
    issueLocalPass();
    setSubmitState("local");
    injectSewerEvent(`[FAME BOARD] ${cleanHandle} saved ${runFlushes} clicks & Claim Pass ${lastAwardPass.claimCode}.`);
    return;
  }
  let token = "";
  try {
    if (window.turnstile && turnstileWidgetId !== null) token = window.turnstile.getResponse(turnstileWidgetId) || "";
  } catch (e) {}
  if (!token) {
    issueLocalPass();
    if (turnstileFailed || (!window.turnstile && !document.getElementById("turnstileScript"))) {
      setSubmitState("blocked");
    } else if (!window.turnstile || turnstileWidgetId === null) {
      setSubmitState("loading");
    } else {
      setSubmitState("verify");
    }
    return;
  }

  isSubmittingVictory = true;
  setSubmitState("submitting");
  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: cleanHandle,
        platform: victoryPlatform,
        wallet: cleanWallet,
        postUrl: cleanPostUrl,
        operatorKey: getOperatorSecret(),
        score: runFlushes,
        cards: 12,
        turnstileToken: token,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.board)) {
        localFameBoard = data.board.map(sanitizeBoardEntry).filter(Boolean);
        saveLocalFameBoard();
        renderFameBoard(localFameBoard);
      }
      const serverRow = Array.isArray(data?.board)
        ? data.board.find((r) => typeof r?.handle === "string" && r.handle.toLowerCase() === cleanHandle.toLowerCase())
        : null;
      lastAwardPass = {
        handle: cleanHandle,
        platform: victoryPlatform,
        score: runFlushes,
        walletHint: serverRow?.walletHint || walletHint,
        postUrl: cleanPostUrl,
        claimCode: data?.claimCode || offlineClaimCode(cleanHandle, runFlushes),
        verifiedGlobal: true,
        issuedAt: Date.now(),
      };
      try { localStorage.setItem("nara_award_pass_v1", JSON.stringify(lastAwardPass)); } catch (e) {}
      renderAwardClaimPass(lastAwardPass);
      updateQuestUI();
      setSubmitState("posted");
      injectSewerEvent(`[FAME BOARD] ${cleanHandle} posted ${runFlushes} clicks // Pass ${lastAwardPass.claimCode}.`);
    } else if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      if (errData && errData.error === "handle_locked") {
        setSubmitState("locked");
      } else {
        issueLocalPass();
        setSubmitState("rejected");
      }
    } else if (res.status === 429) {
      issueLocalPass();
      setSubmitState("limited");
    } else if (res.status === 503) {
      issueLocalPass();
      setSubmitState("local");
    } else {
      issueLocalPass();
      setSubmitState("rejected");
    }
  } catch (err) {
    issueLocalPass();
    setSubmitState("local");
  } finally {
    isSubmittingVictory = false;
    if (window.turnstile && turnstileWidgetId !== null) { try { window.turnstile.reset(turnstileWidgetId); } catch (e) {} }
  }
}

function buildVictoryShareData() {
  const rating = getRatingTier(runFlushes);
  const text = `Cleared all 12/12 $NARA vault cards in ${runFlushes} clicks on Base 🏆\n\nRank: ${rating.name} (@NARA_protocol)\n\nThink you can clear the Fame Board in fewer clicks? 👇`;
  const shareUrl = getShareUrl("win");
  return { text, shareUrl };
}

function buildVictoryTweetUrl() {
  const { text, shareUrl } = buildVictoryShareData();
  return buildXIntentUrl(text, shareUrl, false);
}

function buildVictoryCastUrl() {
  const { text, shareUrl } = buildVictoryShareData();
  return buildWarpcastComposeUrl(text, shareUrl);
}

function handleVictoryTweet(e) {
  playMechanicalClick();
  markQuestShared();
  const xUrl = buildVictoryTweetUrl();
  if (e && e.currentTarget && e.currentTarget.tagName && e.currentTarget.tagName.toLowerCase() === "a") {
    e.currentTarget.href = xUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(xUrl);
  }
}

function handleVictoryCast(e) {
  playMechanicalClick();
  markQuestShared();
  const castUrl = buildVictoryCastUrl();
  if (e && e.currentTarget && e.currentTarget.tagName && e.currentTarget.tagName.toLowerCase() === "a") {
    e.currentTarget.href = castUrl;
  } else {
    if (e && e.preventDefault) e.preventDefault();
    openSafeWindow(castUrl);
  }
}

function clearResetArming() {
  resetConfirmArmedUntil = 0;
  clearTimeout(resetConfirmTimer);
  resetConfirmTimer = null;
  const btn = document.getElementById("resetRunBtn");
  if (btn) {
    btn.innerText = "RESET RUN";
    btn.classList.remove("bg-hazardRed", "text-white", "border-white");
  }
}

function resetAndStartNewRun() {
  playMechanicalClick();
  clearResetArming();
  // Reset unlocked cards and run flushes for new attempt
  userStash.unlocked = {};
  userStash.activeStickerId = 1;
  saveUserStash();

  runFlushes = 0;
  runWon = false;
  dredgePressure = 0;
  dryNewStreak = 0;
  saveFlushProgress();
  updateRunDisplayUI();
  updateVaultUI();
  updateForgeUI();
  updateQuestUI();

  closeVictoryModal();
  const hintEl = document.getElementById("vaultHintText");
  if (hintEl) hintEl.innerText = "Tap any locked card to dredge · Click any unlocked card to share";
  injectSewerEvent("Fresh run initialized. All 12 cards reset — race for fewer clicks.");
}

function confirmResetRun() {
  playMechanicalClick();
  const now = Date.now();
  if (now < resetConfirmArmedUntil) {
    resetAndStartNewRun();
    return;
  }
  const unlockedCount = Object.keys(userStash.unlocked).length;
  resetConfirmArmedUntil = now + 4000;
  const btn = document.getElementById("resetRunBtn");
  if (btn) {
    btn.innerText = "⚠️ CONFIRM RESET?";
    btn.classList.add("bg-hazardRed", "text-white", "border-white");
  }
  injectSewerEvent(`[SYSTEM] Tap RESET RUN again within 4s to restart (${unlockedCount}/12 cleared; best preserved).`);
  clearTimeout(resetConfirmTimer);
  resetConfirmTimer = setTimeout(() => {
    clearResetArming();
  }, 4000);
}

// --- INTERACTIVE QUEST, CIPHER JUMP & CLAIM VERIFIER ---
function jumpToVaultOrVictory() {
  playMechanicalClick();
  if (Object.keys(userStash.unlocked).length >= STICKER_COLLECTION.length) {
    triggerVictoryFlow();
    return;
  }
  const vault = document.getElementById("stickerVaultSection");
  if (vault) vault.scrollIntoView({ behavior: "smooth", block: "start" });
}

function revealBanksFailCipher() {
  playMechanicalClick();
  const details = document.getElementById("protocolSpecsDetails");
  if (details) details.open = true;
  const cipherCard = document.getElementById("banksFailCipherCard");
  if (cipherCard) {
    cipherCard.scrollIntoView({ behavior: "smooth", block: "center" });
    cipherCard.classList.add("ring-2", "ring-naraGreen");
    setTimeout(() => cipherCard.classList.remove("ring-2", "ring-naraGreen"), 1600);
  }
  injectSewerEvent("[CIPHER] Decoded #BanksFail Candlestick Toilet Paper Roll Pillars.");
}

function questShareAction() {
  playMechanicalClick();
  markQuestShared();
  const forgeX = document.getElementById("forgeXBtn");
  if (forgeX) {
    forgeX.scrollIntoView({ behavior: "smooth", block: "center" });
    forgeX.classList.add("ring-2", "ring-naraGreen");
    setTimeout(() => forgeX.classList.remove("ring-2", "ring-naraGreen"), 1400);
  }
  injectSewerEvent("[QUEST] Share step armed — hit POST ON X or CAST in the Forge!");
}

function openAwardPassOrInfo() {
  playMechanicalClick();
  if (Object.keys(userStash.unlocked).length >= STICKER_COLLECTION.length) {
    triggerVictoryFlow();
    return;
  }
  const board = document.getElementById("fameBoardSection");
  if (board) board.scrollIntoView({ behavior: "smooth", block: "start" });
  const remaining = Math.max(0, STICKER_COLLECTION.length - Object.keys(userStash.unlocked).length);
  injectSewerEvent(`[AWARD PASS] Dredge ${remaining} more sticker cards to seal your Fame Board Claim Pass!`);
}

function startRunFromBoard() {
  const hero = document.getElementById("artHousing");
  if (hero) hero.scrollIntoView({ behavior: "smooth", block: "center" });
  triggerHydraulicFlush();
}

function toggleVerifyPassBar() {
  playMechanicalClick();
  const bar = document.getElementById("verifyPassBar");
  if (!bar) return;
  bar.classList.toggle("hidden");
  if (!bar.classList.contains("hidden")) {
    const hInput = document.getElementById("verifyHandleInput");
    const cInput = document.getElementById("verifyClaimInput");
    if (hInput && !hInput.value && lastAwardPass?.handle) hInput.value = lastAwardPass.handle;
    if (cInput && !cInput.value && lastAwardPass?.claimCode) cInput.value = lastAwardPass.claimCode;
    if (hInput) hInput.focus();
  }
}

async function verifyClaimCodeUI() {
  playMechanicalClick();
  const hInput = document.getElementById("verifyHandleInput");
  const cInput = document.getElementById("verifyClaimInput");
  const resultEl = document.getElementById("verifyPassResult");
  if (!resultEl) return;

  const rawHandle = hInput ? hInput.value.trim() : "";
  const handle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;
  const code = (cInput ? cInput.value.trim().toUpperCase() : "");
  if (handle.length < 2 || !code) {
    resultEl.innerText = "Enter @handle + claim code.";
    resultEl.className = "text-[10px] font-mono text-red-400";
    return;
  }
  resultEl.innerText = "Checking...";
  resultEl.className = "text-[10px] font-mono text-white/60";

  if (!code.startsWith("PASS-")) {
    try {
      const url = `/api/leaderboard?verify=1&handle=${encodeURIComponent(handle)}&claim=${encodeURIComponent(code)}`;
      const res = await fetch(url);
      if (res.status === 429) {
        resultEl.innerText = "⏳ Too many verification attempts. Try again later.";
        resultEl.className = "text-[10px] font-mono text-amber-300";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data && data.valid) {
          resultEl.innerText = `✓ VERIFIED GLOBAL PASS (${data.score} clicks)`;
          resultEl.className = "text-[10px] font-mono text-naraGreen font-bold";
          return;
        }
        if (data && typeof data.reason === "string" && data.reason !== "dev_api_offline") {
          resultEl.innerText = `✕ NOT VERIFIED (${data.reason})`;
          resultEl.className = "text-[10px] font-mono text-red-400";
          return;
        }
      }
    } catch (e) {}
  }

  if (lastAwardPass && lastAwardPass.handle.toLowerCase() === handle.toLowerCase() && lastAwardPass.claimCode === code) {
    resultEl.innerText = `✓ MATCHED LOCAL DEVICE PASS (${lastAwardPass.score} clicks)`;
    resultEl.className = "text-[10px] font-mono text-amber-300 font-bold";
  } else {
    resultEl.innerText = "✕ Pass not found on board.";
    resultEl.className = "text-[10px] font-mono text-red-400";
  }
}

let eraseConfirmArmedUntil = 0;
let eraseConfirmTimer = null;

function clearEraseArming() {
  eraseConfirmArmedUntil = 0;
  clearTimeout(eraseConfirmTimer);
  eraseConfirmTimer = null;
  const btn = document.getElementById("erasePassBtn");
  if (btn) {
    btn.innerText = "Erase Entry";
    btn.classList.remove("bg-red-500/30", "text-white", "border-red-400");
  }
}

async function eraseClaimCodeUI() {
  playMechanicalClick();
  const hInput = document.getElementById("verifyHandleInput");
  const cInput = document.getElementById("verifyClaimInput");
  const resultEl = document.getElementById("verifyPassResult");
  const btn = document.getElementById("erasePassBtn");
  if (!resultEl) return;

  const rawHandle = hInput ? hInput.value.trim() : "";
  const handle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;
  const code = cInput ? cInput.value.trim().toUpperCase() : "";
  if (handle.length < 2 || !code) {
    clearEraseArming();
    resultEl.innerText = "Enter @handle + claim code.";
    resultEl.className = "text-[10px] font-mono text-red-400";
    return;
  }

  const now = Date.now();
  if (now >= eraseConfirmArmedUntil) {
    eraseConfirmArmedUntil = now + 5000;
    if (btn) {
      btn.innerText = "Confirm Erase?";
      btn.classList.add("bg-red-500/30", "text-white", "border-red-400");
    }
    resultEl.innerText = "Tap Confirm Erase? within 5s.";
    resultEl.className = "text-[10px] font-mono text-amber-300";
    clearTimeout(eraseConfirmTimer);
    eraseConfirmTimer = setTimeout(() => {
      clearEraseArming();
    }, 5000);
    return;
  }

  clearEraseArming();
  resultEl.innerText = "Erasing...";
  resultEl.className = "text-[10px] font-mono text-white/60";

  let serverDeleted = false;
  let serverRateLimited = false;
  if (!code.startsWith("PASS-")) {
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          handle,
          claimCode: code,
          operatorKey: getOperatorSecret(),
        }),
      });
      if (res.status === 429) {
        serverRateLimited = true;
      } else if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.deleted) {
          serverDeleted = true;
          if (Array.isArray(data.board)) {
            localFameBoard = data.board.map(sanitizeBoardEntry).filter(Boolean);
          }
        }
      }
    } catch (e) {}
  }

  if (serverRateLimited) {
    resultEl.innerText = "⏳ Too many erase attempts. Try again later.";
    resultEl.className = "text-[10px] font-mono text-amber-300";
    return;
  }

  const localMatched = Boolean(
    lastAwardPass &&
      lastAwardPass.handle.toLowerCase() === handle.toLowerCase() &&
      lastAwardPass.claimCode === code
  );

  if (serverDeleted || localMatched) {
    localFameBoard = localFameBoard
      .filter((item) => item && item.handle.toLowerCase() !== handle.toLowerCase())
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
    saveLocalFameBoard();
    renderFameBoard(localFameBoard);

    if (lastAwardPass && lastAwardPass.handle.toLowerCase() === handle.toLowerCase()) {
      lastAwardPass = null;
      try {
        localStorage.removeItem("nara_award_pass_v1");
        localStorage.removeItem("nara_operator_handle_v1");
        localStorage.removeItem("nara_operator_wallet_v1");
        localStorage.removeItem("nara_operator_post_v1");
      } catch (e) {}
      renderAwardClaimPass(null);
    }
    resultEl.innerText = "✓ ENTRY ERASED FROM BOARD";
    resultEl.className = "text-[10px] font-mono text-naraGreen font-bold";
    injectSewerEvent(`[PRIVACY] Erased Fame Board entry for ${handle}.`);
  } else {
    resultEl.innerText = "✕ Could not verify pass to erase.";
    resultEl.className = "text-[10px] font-mono text-red-400";
  }
}

// --- BULLETPROOF IN-APP BROWSER CLIPBOARD COPY ---
function copyTextFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch (err) {
    console.error("Fallback copy failed", err);
  }
  document.body.removeChild(ta);
}

// --- CONTRACT & METAMASK WITH BASE CHAIN CHECK ---
function copyCA() {
  playMechanicalClick();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(NARA_CONTRACT).catch(() => copyTextFallback(NARA_CONTRACT));
  } else {
    copyTextFallback(NARA_CONTRACT);
  }
  const btnText = document.getElementById("copyBtnText");
  if (btnText) {
    btnText.innerText = "COPIED";
    btnText.classList.add("text-naraGreen");
    setTimeout(() => {
      btnText.innerText = "COPY";
      btnText.classList.remove("text-naraGreen");
    }, 2500);
  }
}

function getEthereumProvider() {
  const connected = getConnectedWalletProvider();
  if (connected && typeof connected.request === "function") return connected;
  if (typeof window === "undefined" || !window.ethereum) return null;
  if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
    return window.ethereum.providers.find((p) => p && p.isMetaMask) || window.ethereum.providers[0];
  }
  return window.ethereum;
}

let isWalletRequestPending = false;

async function addNaraToMetaMask() {
  if (isWalletRequestPending) return;
  playMechanicalClick();
  const label = document.getElementById("mmBtnLabel");
  const receiptBtn = document.getElementById("buyReceiptWatchBtn");
  const provider = getEthereumProvider();
  if (provider && typeof provider.request === "function") {
    isWalletRequestPending = true;
    try {
      // 1. Ensure user is on Base Mainnet (0x2105 / 8453)
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_CHAIN_ID_HEX }],
        });
      } catch (switchError) {
        // 4902 indicates chain has not been added to wallet (check nested provider error too)
        const errCode = switchError?.code ?? switchError?.data?.originalError?.code;
        if (errCode === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BASE_CHAIN_ID_HEX,
              chainName: 'Base',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org']
            }],
          });
        } else {
          throw switchError;
        }
      }

      // 2. Add $NARA asset to wallet
      const wasAdded = await provider.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: NARA_CONTRACT,
            symbol: NARA_SYMBOL,
            decimals: NARA_DECIMALS,
            image: NARA_IMAGE,
          },
        },
      });
      if (wasAdded) {
        if (label) {
          label.innerText = "TOKEN ADDED";
          label.classList.add("text-naraGreen");
          setTimeout(() => {
            label.innerText = "ADD $NARA TO METAMASK";
            label.classList.remove("text-naraGreen");
          }, 3000);
        }
        if (receiptBtn) {
          receiptBtn.textContent = "✓ $NARA IN WALLET";
          setTimeout(() => {
            receiptBtn.textContent = "+ SHOW $NARA IN WALLET";
          }, 3000);
        }
      }
    } catch (err) {
      console.warn("Wallet interaction fallback to copy", err);
      copyCA();
      if (label) {
        label.innerText = "CA COPIED TO CLIPBOARD";
        setTimeout(() => {
          label.innerText = "ADD $NARA TO METAMASK";
        }, 3000);
      }
      if (receiptBtn) {
        receiptBtn.textContent = "CA COPIED ✓";
        setTimeout(() => {
          receiptBtn.textContent = "+ SHOW $NARA IN WALLET";
        }, 3000);
      }
    } finally {
      isWalletRequestPending = false;
    }
  } else {
    copyCA();
    if (label) {
      label.innerText = "CA COPIED TO CLIPBOARD";
      setTimeout(() => {
        label.innerText = "ADD $NARA TO METAMASK";
      }, 3000);
    }
    if (receiptBtn) {
      receiptBtn.textContent = "CA COPIED ✓";
      setTimeout(() => {
        receiptBtn.textContent = "+ SHOW $NARA IN WALLET";
      }, 3000);
    }
  }
}

// --- KEYBOARD SHORTCUTS ---
document.addEventListener("keydown", (e) => {
  // Never hijack browser shortcuts (Ctrl+F, Cmd+F, Alt+F, etc.)
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

  if (e.key === "Escape") {
    const vicModal = document.getElementById("victoryModal");
    const swapModal = document.getElementById("swapPrelaunchModal");
    const lootModal = document.getElementById("lootModal");
    if (isBuyModalOpen()) {
      closeBuyModal();
    } else if (vicModal && !vicModal.classList.contains("hidden")) {
      closeVictoryModal();
    } else if (swapModal && !swapModal.classList.contains("hidden")) {
      closeSwapModal();
    } else if (lootModal && !lootModal.classList.contains("hidden")) {
      closeLootModal();
    } else {
      dismissMilestone();
    }
    return;
  }

  if (e.key === " " || e.key === "f" || e.key === "F") {
    if (e.repeat) return;
    // Allow Space to activate focused buttons/links naturally
    if (e.key === " " && (tag === "BUTTON" || tag === "A" || e.target?.getAttribute?.("role") === "button")) {
      return;
    }
    const vicModal = document.getElementById("victoryModal");
    const swapModal = document.getElementById("swapPrelaunchModal");
    const lootModal = document.getElementById("lootModal");
    // Do not flush behind blocking modals (or explicit card inspect modal)
    if (
      isBuyModalOpen() ||
      (vicModal && !vicModal.classList.contains("hidden")) ||
      (swapModal && !swapModal.classList.contains("hidden")) ||
      (lootModal && !lootModal.classList.contains("hidden") && !lootModal._autoDismiss)
    ) {
      return;
    }
    e.preventDefault();
    triggerHydraulicFlush();
  }
});

// --- DECLARATIVE EVENT BINDING (CSP-safe replacement for inline on*= attributes) ---
// Markup uses data-on-<event>="actionName[:arg]". Each action below mirrors the exact
// call that the former inline attribute made, including whether the event was passed.
const ACTIONS = {
  stopPropagation: (e) => e.stopPropagation(),
  toggleAudio: () => toggleAudio(),
  openBuyModal: () => openBuyModal(),
  closeBuyModal: (e) => closeBuyModal(e),
  closeBuyModalBackdrop: (e) => closeBuyModal(e),
  copyBuyModalCA: () => copyBuyModalCA(),
  setBuyModalDirection: (e, arg) => setBuyModalDirection(e, arg),
  setBuyModalAsset: (e, arg) => setBuyModalAsset(e, arg),
  setBuyModalPreset: (e, arg) => setBuyModalPreset(e, arg),
  setBuyModalMax: () => setBuyModalMax(),
  setBuyModalSlippage: (e, arg) => setBuyModalSlippage(e, arg),
  handleBuyModalAmountInput: (e) => handleBuyModalAmountInput(e),
  disconnectBuyWallet: () => disconnectBuyWallet(),
  refreshBuyQuote: () => refreshBuyQuote(),
  executeBuyModalSwap: () => executeBuyModalSwap(),
  handleSwapButtonClick: (e) => handleSwapButtonClick(e),
  triggerHydraulicFlush: (e) => triggerHydraulicFlush(e),
  flushOnKeydown: (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      triggerHydraulicFlush(e);
    }
  },
  copyCA: () => copyCA(),
  handleShareClick: (e, arg) => handleShareClick(e, arg),
  rerollBannerQuote: (e) => rerollBannerQuote(e),
  dismissMilestone: (e) => dismissMilestone(e),
  setTweetMode: (_e, arg) => setTweetMode(arg),
  rerollActiveMode: () => rerollActiveMode(),
  handleForgeClick: (e, arg) => handleForgeClick(e, arg),
  toggleXReachMode: () => toggleXReachMode(),
  copyForgeReplyText: () => copyForgeReplyText(),
  shareVaultOnX: (e) => shareVaultOnX(e),
  shareVaultOnCast: (e) => shareVaultOnCast(e),
  copyForgeTweetText: () => copyForgeTweetText(),
  copyStickerCardFromForge: () => copyStickerCardFromForge(),
  confirmResetRun: () => confirmResetRun(),
  reopenVictoryIfWon: () => reopenVictoryIfWon(),
  shareFullStashTweet: (e) => shareFullStashTweet(e),
  shareFullStashCast: (e) => shareFullStashCast(e),
  refreshLeaderboardUI: () => refreshLeaderboardUI(),
  addNaraToMetaMask: () => addNaraToMetaMask(),
  handleLootBackdropClick: (e) => handleLootBackdropClick(e),
  pauseLootAutoDismiss: () => pauseLootAutoDismiss(),
  closeLootModal: () => closeLootModal(),
  copyCardAndTweet: () => copyCardAndTweet(),
  castInspectedSticker: () => castInspectedSticker(),
  downloadCardPNG: () => downloadCardPNG(),
  handleKeepFlushingClick: (e) => handleKeepFlushingClick(e),
  closeSwapModalBackdrop: (e) => closeSwapModal(e),
  closeSwapModal: () => closeSwapModal(),
  closeVictoryModalBackdrop: (e) => closeVictoryModal(e),
  closeVictoryModal: () => closeVictoryModal(),
  submitOnEnter: (e) => { if (e.key === "Enter") { e.preventDefault(); submitVictoryToFameBoard(); } },
  submitVictoryToFameBoard: () => submitVictoryToFameBoard(),
  handleVictoryTweet: (e) => handleVictoryTweet(e),
  handleVictoryCast: (e) => handleVictoryCast(e),
  resetAndStartNewRun: () => resetAndStartNewRun(),
  jumpToVaultOrVictory: () => jumpToVaultOrVictory(),
  revealBanksFailCipher: () => revealBanksFailCipher(),
  questShareAction: () => questShareAction(),
  openAwardPassOrInfo: () => openAwardPassOrInfo(),
  startRunFromBoard: () => startRunFromBoard(),
  toggleVerifyPassBar: () => toggleVerifyPassBar(),
  verifyClaimCodeUI: () => verifyClaimCodeUI(),
  eraseClaimCodeUI: () => eraseClaimCodeUI(),
  setVictoryPlatform: (e, arg) => setVictoryPlatform(e, arg),
  fillVictoryConnectedWallet: () => fillVictoryConnectedWallet(),
  copyAwardClaimPass: () => copyAwardClaimPass(),
  applyLowFeeSwapSize: () => applyLowFeeSwapSize(),
  refreshAnchorSeats: () => refreshAnchorSeats(true),
  selectAnchorSeat: (e, arg) => selectAnchorSeat(e, arg),
  setAnchorTierFilter: (e, arg) => setAnchorTierFilter(e, arg),
  cancelSeatReview: (e) => cancelSeatReview(e),
  copySeatLink: (e, arg) => copySeatLink(e, arg),
  toggleAnchorSpecs: (e) => toggleAnchorSpecs(e),
  toggleCardHelp: (e, arg) => toggleCardHelp(e, arg),
  buyAnchorSeat: (e, arg) => buyAnchorSeat(e, arg),
  jumpToAnchorSeats: () => jumpToAnchorSeats(),
  jumpToSector: (_e, sectorId) => {
    playMechanicalClick();
    const map = {
      capital: "anchorSeatsSection",
      arcade: "sectorArcade",
      registry: "sectorRegistry",
    };
    const target = document.getElementById(map[sectorId] || sectorId);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  },
};

const BOUND_EVENTS = ["click", "keydown", "mouseenter", "touchstart", "input"];
const boundActionElements = new WeakSet();

function bindActions(root = document) {
  const selector = BOUND_EVENTS.map((evt) => `[data-on-${evt}]`).join(",");
  const unknown = [];
  root.querySelectorAll(selector).forEach((el) => {
    if (boundActionElements.has(el)) return;
    boundActionElements.add(el);
    BOUND_EVENTS.forEach((evt) => {
      const spec = el.getAttribute(`data-on-${evt}`);
      if (!spec) return;
      const [name, arg] = spec.split(":");
      const action = ACTIONS[name];
      if (!action) {
        unknown.push(`${evt}:${name}`);
        return;
      }
      const options = evt === "touchstart" ? { passive: true } : undefined;
      el.addEventListener(evt, (e) => action(e, arg), options);
    });
  });
  if (unknown.length) {
    // console.error survives the production build (see vite.config.ts) and the attribute is
    // asserted by tests/smoke.mjs, so a typo in a data-on-* attribute cannot ship silently.
    document.documentElement.setAttribute("data-nara-bind-error", unknown.join(","));
    console.error(`[nara] unknown actions: ${unknown.join(", ")}`);
    throw new Error(`[nara] unknown actions: ${unknown.join(", ")}`);
  }
}

// --- SYSTEM INITIALIZATION ---
notifyMiniAppHostReady();
initSwapControl();
bindActions();
loadUserStash();
loadFlushProgress();
loadLocalFameBoard();
renderFameBoard(localFameBoard);
syncFameBoardFromAPI();
updateVaultUI();
rollNewDegenMessage(flushCount);
updateForgeUI();

// Restore flush counter display from persisted state
const _counterEl = document.getElementById("flushCounter");
if (_counterEl && flushCount > 0) _counterEl.innerText = flushCount;
const _quickLabel = document.getElementById("quickTweetLabel");
if (_quickLabel && flushCount > 0) _quickLabel.innerText = `POST [${flushCount}]`;

initBuyExperience({
  playClick: playMechanicalClick,
  playSuccess: () => {
    if (soundMode === "mute") return;
    try { playArcadeChime(getAudioContext()); } catch (e) {}
  },
  copyCA,
  onModalVisibilityChange: syncBodyScrollLock,
});

initAnchorSeats({
  bindActions,
  playClick: playMechanicalClick,
  playSuccess: () => {
    if (soundMode === "mute") return;
    try { playArcadeChime(getAudioContext()); } catch (e) {}
  },
  onModalVisibilityChange: syncBodyScrollLock,
});

if (typeof navigator !== "undefined" && "serviceWorker" in navigator && import.meta.env?.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

