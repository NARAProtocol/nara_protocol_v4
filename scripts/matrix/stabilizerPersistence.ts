export const STABILIZER_PERSISTENCE_OFFSETS = [1, 3, 5, 10, 20] as const;

export interface PersistencePoint {
  offsetBlocks: number;
  midUsdcPerNara: number;
  remainingMoveBps: number;
  persistenceBps: number | null;
}

export interface PersistenceResult {
  referenceMidUsdcPerNara: number;
  triggerMidUsdcPerNara: number;
  triggerMoveBps: number;
  points: PersistencePoint[];
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function moveBps(reference: number, observed: number): number {
  return Math.round(((observed - reference) / reference) * 10_000);
}

/**
 * Measures how much of a trigger-block move remains after later blocks.
 * A persistence value of 10_000 means the full move remains, 0 means full
 * reversion to the reference, and a negative value means an overshoot through
 * the reference price. Values above 10_000 indicate continuation.
 */
export function calculatePersistence(
  referenceMidUsdcPerNara: number,
  triggerMidUsdcPerNara: number,
  futureMids: ReadonlyArray<{ offsetBlocks: number; midUsdcPerNara: number }>
): PersistenceResult {
  assertPositiveFinite("referenceMidUsdcPerNara", referenceMidUsdcPerNara);
  assertPositiveFinite("triggerMidUsdcPerNara", triggerMidUsdcPerNara);
  const triggerMoveBps = moveBps(
    referenceMidUsdcPerNara,
    triggerMidUsdcPerNara
  );

  const seenOffsets = new Set<number>();
  const points = futureMids.map(({ offsetBlocks, midUsdcPerNara }) => {
    if (!Number.isSafeInteger(offsetBlocks) || offsetBlocks < 1) {
      throw new Error("offsetBlocks must be a positive safe integer");
    }
    if (seenOffsets.has(offsetBlocks)) {
      throw new Error(`duplicate persistence offset: ${offsetBlocks}`);
    }
    seenOffsets.add(offsetBlocks);
    assertPositiveFinite("midUsdcPerNara", midUsdcPerNara);

    const remainingMoveBps = moveBps(referenceMidUsdcPerNara, midUsdcPerNara);
    return {
      offsetBlocks,
      midUsdcPerNara,
      remainingMoveBps,
      persistenceBps:
        triggerMoveBps === 0
          ? null
          : Math.round((remainingMoveBps * 10_000) / triggerMoveBps),
    };
  });

  return {
    referenceMidUsdcPerNara,
    triggerMidUsdcPerNara,
    triggerMoveBps,
    points,
  };
}
