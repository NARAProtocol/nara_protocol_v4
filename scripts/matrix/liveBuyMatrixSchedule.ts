export const LIVE_BUY_MATRIX_DEFAULT_COUNT = 100;
export const LIVE_BUY_MATRIX_DEFAULT_DELAY_SECONDS = 6;
export const LIVE_BUY_MATRIX_MIN_DELAY_SECONDS = 3;
export const LIVE_BUY_MATRIX_MAX_DELAY_SECONDS = 60;
export const LIVE_BUY_MATRIX_LEGACY_CONFIRMATION =
  "BUY_NARA_100_X_11_USDC_TEN_MIN";

export interface LiveBuyMatrixSchedule {
  readonly count: number;
  readonly delaySeconds: number;
  readonly executionConfirmation: string;
  readonly evidenceLabel: string;
}

function parseInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return parsed;
}

/**
 * Resolves the live buy schedule before any provider or signer is created.
 * Every non-default schedule receives a confirmation phrase that binds both
 * count and cadence so the legacy ten-minute confirmation cannot authorize it.
 */
export function resolveLiveBuyMatrixSchedule(input: {
  readonly count?: string;
  readonly delaySeconds?: string;
}): LiveBuyMatrixSchedule {
  const count = parseInteger(
    "V4_TEN_MIN_BUY_COUNT",
    input.count,
    LIVE_BUY_MATRIX_DEFAULT_COUNT,
    1,
    1_000
  );
  const delaySeconds = parseInteger(
    "V4_BUY_MATRIX_DELAY_SECONDS",
    input.delaySeconds,
    LIVE_BUY_MATRIX_DEFAULT_DELAY_SECONDS,
    LIVE_BUY_MATRIX_MIN_DELAY_SECONDS,
    LIVE_BUY_MATRIX_MAX_DELAY_SECONDS
  );
  const isLegacySchedule =
    count === LIVE_BUY_MATRIX_DEFAULT_COUNT &&
    delaySeconds === LIVE_BUY_MATRIX_DEFAULT_DELAY_SECONDS;
  return {
    count,
    delaySeconds,
    executionConfirmation: isLegacySchedule
      ? LIVE_BUY_MATRIX_LEGACY_CONFIRMATION
      : `BUY_NARA_${count}_X_11_USDC_${delaySeconds}_SECOND_MINIMUM`,
    evidenceLabel: isLegacySchedule
      ? "tenmin-100x11"
      : `${delaySeconds}s-${count}x11`,
  };
}
