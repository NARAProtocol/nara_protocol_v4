export type StabilizerTriggerSide = "pump" | "floor";

/**
 * Returns true exactly once per side/transaction pair for the supplied scan.
 * The caller owns the Set, keeping deduplication bounded to one scan range.
 */
export function shouldRecordTriggerSkip(
  seen: Set<string>,
  side: StabilizerTriggerSide,
  txHash: string
): boolean {
  const key = `${side}:${txHash.toLowerCase()}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
