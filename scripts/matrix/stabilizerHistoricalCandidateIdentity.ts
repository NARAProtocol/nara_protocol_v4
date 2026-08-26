import type { StabilizerShadowSimulationEvidence } from "./summarizeStabilizerShadow.js";

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const OBSERVATION_ID = /^(0x[0-9a-fA-F]{64}):\d+$/;

/**
 * Selects the summarizer's canonical floor identities without reimplementing
 * its normalization. Duplicate immutable identities are rejected before a
 * historical harness can construct an RPC provider or request any quotes.
 */
export function selectUniqueHistoricalFloorCandidateEvidence(
  evidence: readonly StabilizerShadowSimulationEvidence[]
): StabilizerShadowSimulationEvidence[] {
  const selected: StabilizerShadowSimulationEvidence[] = [];
  const firstLineByIdentity = new Map<string, number>();
  for (const item of evidence) {
    if (item.side !== "floor") continue;
    if (item.identity.trim() === "") {
      throw new Error(`line ${item.line} has an empty immutable identity`);
    }
    const firstLine = firstLineByIdentity.get(item.identity);
    if (firstLine !== undefined) {
      throw new Error(
        `duplicate immutable candidate identity at lines ${firstLine} and ${item.line}`
      );
    }
    firstLineByIdentity.set(item.identity, item.line);
    selected.push(item);
  }
  return selected;
}

/**
 * Proves that the receipts requested by the historical harness are exactly
 * the transactions committed by the candidate's canonical observation IDs.
 */
export function bindCanonicalCandidateTransactionHashes(
  evidence: StabilizerShadowSimulationEvidence,
  rawTransactionHashes: readonly unknown[]
): string[] {
  const expected = new Set<string>();
  for (const observationId of evidence.observationIds) {
    const match = OBSERVATION_ID.exec(observationId);
    if (!match) {
      throw new Error(
        `line ${evidence.line} has a malformed canonical observation ID`
      );
    }
    expected.add(match[1].toLowerCase());
  }

  const observed: string[] = [];
  const observedSet = new Set<string>();
  for (const value of rawTransactionHashes) {
    if (typeof value !== "string" || !TRANSACTION_HASH.test(value)) {
      throw new Error(`line ${evidence.line} has an invalid transaction hash`);
    }
    const canonical = value.toLowerCase();
    if (observedSet.has(canonical)) {
      throw new Error(
        `line ${evidence.line} has a duplicate raw transaction hash`
      );
    }
    observedSet.add(canonical);
    observed.push(canonical);
  }

  const expectedSorted = [...expected].sort();
  const observedSorted = observed.sort();
  if (
    expectedSorted.length !== observedSorted.length ||
    expectedSorted.some((value, index) => value !== observedSorted[index])
  ) {
    throw new Error(
      `line ${evidence.line} transaction hash set does not match immutable observation identity`
    );
  }
  return observedSorted;
}
