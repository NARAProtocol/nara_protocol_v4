/**
 * Procedural Web Audio Synthesizer for NARA NFT Unboxing & Card Reveal.
 * 100% self-contained: Zero external MP3/WAV files, zero network latency, zero broken assets.
 * Generates tactile mechanical clicks, pneumatic releases, laser sweeps, and grand orchestral chimes.
 */

class UnboxingAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = localStorage.getItem("nara_unboxing_audio_muted") === "true";
      } catch {
        this.muted = false;
      }
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("nara_unboxing_audio_muted", String(this.muted));
      } catch {}
    }
    return this.muted;
  }

  /**
   * Subtle high-frequency mechanical hover blip
   */
  public playHover(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = "sine";
      osc.frequency.setValueAtTime(820, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);

      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch {}
  }

  /**
   * Stage 1 -> 2: Heavy hydraulic unbolt + pneumatic compressed air hiss
   */
  public playHydraulicBreach(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. Sub-bass thump (Heavy mechanical unlatch)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.33);

      // 2. High-pressure pneumatic steam hiss (Filtered noise burst)
      const bufferSize = Math.floor(ctx.sampleRate * 0.35);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2400, now);
      filter.frequency.exponentialRampToValueAtTime(800, now + 0.35);
      filter.Q.setValueAtTime(2.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.08, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.36);
    } catch {}
  }

  /**
   * Stage 2: Vertical laser scanning chirp sweep
   */
  public playLaserScan(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.linearRampToValueAtTime(2400, now + 0.35);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.65);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.66);
    } catch {}
  }

  /**
   * Continuous scan telemetry alias
   */
  public playScan(): void {
    this.playLaserScan();
  }

  /**
   * Scan ring complete: high crystalline dual chime right as the dial snaps shut
   */
  public playComplete(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [1046.5, 1567.98].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.001, now + idx * 0.04);
        gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.04 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.04 + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.5);
      });
    } catch {}
  }

  /**
   * Tension buildup hum right before the card breach
   */
  public playTensionRumble(): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.6);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(180, now);
      filter.frequency.linearRampToValueAtTime(600, now + 0.6);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.66);
    } catch {}
  }

  /**
   * Stage 3: The Grand Reveal Chord & Resonance Shockwave per Alloy Tier
   */
  public playRevealBurst(tierStr?: string): void {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const tier = (tierStr || "").toLowerCase();
      const now = ctx.currentTime;

      // 1. Universal Impact Sub-Bass Shockwave
      const impactOsc = ctx.createOscillator();
      const impactGain = ctx.createGain();
      impactOsc.type = "sine";
      impactOsc.frequency.setValueAtTime(110, now);
      impactOsc.frequency.exponentialRampToValueAtTime(24, now + 0.45);

      impactGain.gain.setValueAtTime(0.45, now);
      impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      impactOsc.connect(impactGain);
      impactGain.connect(ctx.destination);
      impactOsc.start(now);
      impactOsc.stop(now + 0.55);

      // 2. Harmonic chord customized for each physical alloy
      let frequencies: number[] = [261.63, 329.63, 392.00, 523.25]; // Default C major
      let isApex = false;

      if (tier.includes("gold") || tier.includes("24k") || tier.includes("apex")) {
        // 👑 24K Gilded Gold: Radiant Major 9th Chord + Crystalline Bell Overtones
        // Frequencies: C5 (523Hz), E5 (659Hz), G5 (784Hz), B5 (987Hz), D6 (1174Hz), high sparkle E7 (2637Hz)
        frequencies = [523.25, 659.25, 783.99, 987.77, 1174.66, 2637.02];
        isApex = true;
      } else if (tier.includes("damascus") || tier.includes("meteorite") || tier.includes("legendary")) {
        // 🌌 Damascus Meteorite: Ethereal Suspended Quantum Chime (D4, A4, D5, F#5, B5)
        frequencies = [293.66, 440.0, 587.33, 739.99, 987.77];
      } else if (tier.includes("obsidian") || tier.includes("void") || tier.includes("amethyst") || tier.includes("purple") || tier.includes("rare")) {
        // 🔮 Obsidian Void: Imperial Royal Amethyst Minor/Major Mystery Chord (E4, B4, G5, C6)
        frequencies = [329.63, 493.88, 783.99, 1046.50];
      } else if (tier.includes("emerald") || tier.includes("cybernetic")) {
        // 🟢 Cybernetic Emerald: Crisp Dual-Tone Cyber Matrix (F#4, C#5, A#5)
        frequencies = [369.99, 554.37, 932.33];
      } else {
        // 🪙 Titanium Slate: Clean Industrial Metallic Ring (A4, E5)
        frequencies = [440.0, 659.25];
      }

      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = isApex ? (idx % 2 === 0 ? "sine" : "triangle") : "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.03);

        const decayDuration = isApex ? 2.8 : 1.6;
        const baseVolume = isApex ? 0.08 : 0.05;

        gain.gain.setValueAtTime(0.001, now + idx * 0.03);
        gain.gain.linearRampToValueAtTime(baseVolume, now + idx * 0.03 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.03 + decayDuration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.03);
        osc.stop(now + idx * 0.03 + decayDuration + 0.05);
      });
    } catch {}
  }
}

export const unboxingAudio = new UnboxingAudioEngine();
