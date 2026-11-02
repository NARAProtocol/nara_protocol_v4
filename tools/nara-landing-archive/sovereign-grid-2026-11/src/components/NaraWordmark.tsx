interface NaraWordmarkProps {
  variant?: "full" | "nara-only" | "svg";
  className?: string;
  glow?: boolean;
}

export default function NaraWordmark({
  variant = "full",
  className = "w-full max-w-sm",
  glow = true,
}: NaraWordmarkProps) {
  if (variant === "svg") {
    return (
      <img
        src="/nara_protocol_wordmark.svg"
        alt="NARA PROTOCOL"
        className={`object-contain transition-transform duration-300 ${glow ? "drop-shadow-[0_0_25px_rgba(0,240,255,0.45)]" : ""} ${className}`}
      />
    );
  }

  if (variant === "nara-only") {
    return (
      <img
        src="/nara_wordmark_only_2048.png"
        alt="NARA"
        className={`object-contain transition-transform duration-300 ${glow ? "drop-shadow-[0_0_30px_rgba(56,189,248,0.5)]" : ""} ${className}`}
      />
    );
  }

  return (
    <img
      src="/nara_protocol_wordmark_2048.png"
      alt="NARA PROTOCOL"
      className={`object-contain transition-transform duration-300 ${glow ? "drop-shadow-[0_0_30px_rgba(56,189,248,0.5)]" : ""} ${className}`}
    />
  );
}
