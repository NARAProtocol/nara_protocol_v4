import {
  CSSProperties,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  Fingerprint,
  Sparkle,
  ShieldCheck,
} from "@phosphor-icons/react";

import { unboxingAudio } from "../lib/unboxingAudio";

import styles from "./UnboxingChamber.module.css";

interface UnboxingChamberProps {
  isBreaching: boolean;
  onBreachClick: () => void;
  onComplete?: () => void;
  tokenId: string;
  amountStr?: string;
  durationStr?: string;
}

const RING_RADIUS = 92;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const NORMAL_BREACH_DURATION = 3100;
const REDUCED_BREACH_DURATION = 650;
const COMPLETE_DELAY = 520;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

/*
  Purposefully uneven progression.

  The pauses around 40%, 70%, and 90% create anticipation
  without using random fake progress.
*/
function getChoreographedProgress(t: number) {
  const x = clamp(t);

  if (x < 0.18) {
    return (x / 0.18) * 31;
  }

  if (x < 0.34) {
    return 31 + ((x - 0.18) / 0.16) * 11;
  }

  if (x < 0.48) {
    return 42 + ((x - 0.34) / 0.14) * 4;
  }

  if (x < 0.66) {
    return 46 + ((x - 0.48) / 0.18) * 25;
  }

  if (x < 0.78) {
    return 71 + ((x - 0.66) / 0.12) * 6;
  }

  if (x < 0.91) {
    return 77 + ((x - 0.78) / 0.13) * 15;
  }

  return 92 + ((x - 0.91) / 0.09) * 8;
}

function getStatus(progress: number) {
  if (progress < 8) return "Initializing secure channel";
  if (progress < 31) return "Reading vault signature";
  if (progress < 46) return "Authenticating ownership";
  if (progress < 71) return "Decrypting asset layer";
  if (progress < 92) return "Verifying release state";
  if (progress < 100) return "Finalizing breach";
  return "Vault opened";
}

export default function UnboxingChamber({
  isBreaching,
  onBreachClick,
  onComplete,
  tokenId,
  amountStr = "100 CELLS",
  durationStr = "365 Days",
}: UnboxingChamberProps) {
  const gradientId = useId().replace(/:/g, "");

  const [scanProgress, setScanProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const animationFrameRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const hasPlayedComplete = useRef(false);
  const previousTokenIdRef = useRef(tokenId);

  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    cancelAnimation();
    clearCompletionTimer();
  }, [cancelAnimation, clearCompletionTimer]);

  const triggerCompletion = useCallback(() => {
    if (hasPlayedComplete.current) return;

    hasPlayedComplete.current = true;

    setScanProgress(100);

    try {
      unboxingAudio?.playComplete?.();
    } catch {
      // Audio failure must never interrupt the reveal.
    }

    try {
      navigator.vibrate?.([18, 25, 40]);
    } catch {
      // Haptics are optional.
    }

    setRevealed(true);

    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null;
      onCompleteRef.current?.();
    }, COMPLETE_DELAY);
  }, []);

  /*
    Reset automatically when the chamber receives
    a different asset without requiring a remount.
  */
  useEffect(() => {
    if (previousTokenIdRef.current === tokenId) return;

    previousTokenIdRef.current = tokenId;

    clearTimers();

    hasPlayedComplete.current = false;
    setScanProgress(0);
    setRevealed(false);
    setIsPressed(false);
  }, [tokenId, clearTimers]);

  /*
    Run the breach sequence.
  */
  useEffect(() => {
    if (!isBreaching || revealed) return;

    cancelAnimation();

    hasPlayedComplete.current = false;
    setScanProgress(0);

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const duration = prefersReducedMotion
      ? REDUCED_BREACH_DURATION
      : NORMAL_BREACH_DURATION;

    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const normalized = clamp(elapsed / duration);

      const progress = getChoreographedProgress(normalized);

      setScanProgress(progress);

      if (normalized >= 1) {
        animationFrameRef.current = null;
        triggerCompletion();
        return;
      }

      animationFrameRef.current = requestAnimationFrame(frame);
    };

    animationFrameRef.current = requestAnimationFrame(frame);

    return cancelAnimation;
  }, [
    isBreaching,
    revealed,
    cancelAnimation,
    triggerCompletion,
  ]);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const handleBreach = useCallback(() => {
    if (revealed) {
      // If already opened, immediate transition to card
      onCompleteRef.current?.();
      return;
    }

    if (isBreaching) return;

    try {
      navigator.vibrate?.(12);
    } catch {
      // Haptics are optional.
    }

    onBreachClick();
  }, [
    isBreaching,
    revealed,
    onBreachClick,
  ]);

  const dashOffset =
    RING_CIRCUMFERENCE *
    (1 - scanProgress / 100);

  const chamberStyle = {
    "--scan-progress": scanProgress,
  } as CSSProperties;

  return (
    <section
      className={[
        styles.chamber,
        isBreaching ? styles.breaching : "",
        revealed ? styles.revealed : "",
      ].join(" ")}
      style={chamberStyle}
      aria-live="polite"
    >
      <div
        className={styles.ambientGlow}
        aria-hidden="true"
      />

      <div
        className={styles.grid}
        aria-hidden="true"
      />

      <div
        className={styles.noise}
        aria-hidden="true"
      />

      {revealed && (
        <div
          className={styles.revealFlash}
          aria-hidden="true"
        />
      )}

      <header className={styles.header}>
        <div className={styles.protocol}>
          <span className={styles.protocolDot} />
          <span>SOVEREIGN GRID PROTOCOL</span>
        </div>

        <div className={styles.security}>
          <ShieldCheck
            size={14}
            weight="fill"
          />
          <span>SECURED</span>
        </div>
      </header>

      <div className={styles.assetIdentity}>
        <span className={styles.assetLabel}>
          SEALED HARDWARE CHASSIS
        </span>

        <span className={styles.assetId}>
          #{tokenId}
        </span>
      </div>

      <div className={styles.coreArea}>
        <div
          className={styles.orbitOuter}
          aria-hidden="true"
        />

        <div
          className={styles.orbitMiddle}
          aria-hidden="true"
        />

        <div
          className={styles.orbitInner}
          aria-hidden="true"
        />

        {isBreaching && !revealed && (
          <div
            className={styles.scanner}
            aria-hidden="true"
          >
            <div className={styles.scannerBeam} />
          </div>
        )}

        <div
          className={styles.particles}
          aria-hidden="true"
        >
          {Array.from({ length: 12 }).map((_, index) => (
            <span
              key={index}
              className={styles.particle}
              style={
                {
                  "--particle-index": index,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <svg
          className={styles.progressRing}
          viewBox="0 0 220 220"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`${gradientId}Gradient`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop
                offset="0%"
                stopColor="#84fff2"
              />
              <stop
                offset="45%"
                stopColor="#7b9cff"
              />
              <stop
                offset="100%"
                stopColor="#d88cff"
              />
            </linearGradient>

            <filter
              id={`${gradientId}Glow`}
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur
                stdDeviation="4"
                result="blur"
              />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            className={styles.ringTrack}
            cx="110"
            cy="110"
            r={RING_RADIUS}
          />

          <circle
            className={styles.ringProgress}
            cx="110"
            cy="110"
            r={RING_RADIUS}
            stroke={`url(#${gradientId}Gradient)`}
            filter={`url(#${gradientId}Glow)`}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <button
          type="button"
          className={[
            styles.coreButton,
            isPressed ? styles.corePressed : "",
          ].join(" ")}
          onClick={handleBreach}
          onPointerDown={() => setIsPressed(true)}
          onPointerUp={() => setIsPressed(false)}
          onPointerLeave={() => setIsPressed(false)}
          disabled={isBreaching && !revealed}
          aria-label={
            revealed
              ? "Vault opened"
              : isBreaching
                ? `Opening vault. ${Math.round(scanProgress)} percent`
                : "Open sealed vault"
          }
        >
          <div
            className={styles.coreReflection}
            aria-hidden="true"
          />

          <div
            className={styles.coreHalo}
            aria-hidden="true"
          />

          {!revealed ? (
            <>
              <Fingerprint
                className={styles.fingerprint}
                size={58}
                weight="thin"
              />

              {!isBreaching && (
                <>
                  <span className={styles.openLabel}>
                    BREACH
                  </span>

                  <span className={styles.openHint}>
                    TAP TO OPEN
                  </span>
                </>
              )}

              {isBreaching && (
                <>
                  <strong className={styles.percentage}>
                    {Math.round(scanProgress)}
                    <span>%</span>
                  </strong>

                  <span className={styles.scanningLabel}>
                    SCANNING
                  </span>
                </>
              )}
            </>
          ) : (
            <div className={styles.revealCore}>
              <Sparkle
                size={48}
                weight="fill"
              />

              <strong>OPEN</strong>

              <span>VERIFIED</span>
            </div>
          )}
        </button>
      </div>

      <div className={styles.statusArea}>
        <div className={styles.statusLine}>
          <span
            className={[
              styles.statusPulse,
              isBreaching
                ? styles.statusPulseActive
                : "",
            ].join(" ")}
          />

          <span>
            {revealed
              ? "Asset successfully released"
              : isBreaching
                ? getStatus(scanProgress)
                : "Awaiting biometric authorization"}
          </span>
        </div>

        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{
              width: `${scanProgress}%`,
            }}
          />
        </div>
      </div>

      <div className={styles.metadata}>
        <div className={styles.metadataItem}>
          <span>COMMITTED CELLS</span>
          <strong>{amountStr}</strong>
        </div>

        <div className={styles.metadataDivider} />

        <div className={styles.metadataItem}>
          <span>PULSE HORIZON</span>
          <strong>{durationStr}</strong>
        </div>
      </div>

      <footer className={styles.footer}>
        <span>CRYPTOGRAPHICALLY VERIFIED</span>

        <span className={styles.footerCode}>
          0x{tokenId.slice(0, 4).padEnd(4, "0")}
        </span>
      </footer>
    </section>
  );
}
