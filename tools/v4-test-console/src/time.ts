const MAX_DATE_SECONDS = 8_640_000_000_000n;

export function formatTimestampSeconds(timestampSeconds: bigint): string {
  if (timestampSeconds <= 0n) return "—";
  if (timestampSeconds > MAX_DATE_SECONDS) return "Unavailable";

  const date = new Date(Number(timestampSeconds) * 1_000);
  if (!Number.isFinite(date.getTime())) return "Unavailable";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "Unavailable";
  }
}
