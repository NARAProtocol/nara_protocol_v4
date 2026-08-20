export type TransactionStage = "checking" | "wallet" | "submitted" | "syncing" | "complete" | "error";

export type TransactionProgress = {
  action: string;
  stage: TransactionStage;
  step: 0 | 1 | 2 | 3 | 4;
  detail: string;
  startedAt: number;
  hash?: `0x${string}`;
  canCheck?: boolean;
  diagnostic?: string;
};

export type StoredPendingTransaction = {
  action: string;
  hash: `0x${string}`;
  startedAt: number;
};

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function pendingTransactionStorageKey(wallet: string): string {
  return `nara-v4-test-console:pending-transaction:8453:${wallet.toLowerCase()}`;
}

export function shouldApplyReadSnapshot(latestAppliedBlock: bigint, candidateBlock: bigint): boolean {
  return candidateBlock >= latestAppliedBlock;
}

export function shouldDismissProgressForReview(progress: TransactionProgress | null): boolean {
  return progress?.stage === "complete";
}

export function shouldCloseReviewForProgress(progress: TransactionProgress | null): boolean {
  return progress?.stage === "wallet"
    || progress?.stage === "submitted"
    || progress?.stage === "syncing";
}

export function parseStoredPendingTransaction(raw: string | null): StoredPendingTransaction | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredPendingTransaction>;
    if (
      typeof value.action !== "string"
      || value.action.trim().length === 0
      || typeof value.hash !== "string"
      || !HASH_PATTERN.test(value.hash)
      || typeof value.startedAt !== "number"
      || !Number.isFinite(value.startedAt)
      || value.startedAt <= 0
    ) return null;
    return {
      action: value.action,
      hash: value.hash as `0x${string}`,
      startedAt: value.startedAt,
    };
  } catch {
    return null;
  }
}

export function progressButtonLabel(
  progress: TransactionProgress | null,
  actionIsPending: boolean,
  idleLabel: string,
): string {
  if (!actionIsPending || !progress) return idleLabel;
  switch (progress.stage) {
    case "checking": return "Checking current state…";
    case "wallet": return "Confirm or reject in wallet";
    case "submitted": return "Waiting for Base…";
    case "syncing": return "Confirmed — updating…";
    case "complete": return "Complete";
    case "error": return "Action stopped";
  }
}

export function elapsedLabel(startedAt: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
