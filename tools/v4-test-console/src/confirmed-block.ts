type ConfirmedBlockReader = {
  getBlock(parameters: { blockNumber: bigint }): Promise<unknown>;
};

type ConfirmedBlockWaitOptions = {
  attempts?: number;
  intervalMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
};

export function isBlockNotFoundError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (typeof current === "string") {
      const message = current.toLowerCase();
      return message.includes("block not found")
        || message.includes("requested resource not found");
    }
    if (typeof current !== "object") return false;
    const value = current as Record<string, unknown>;
    const message = [value.message, value.details, value.shortMessage]
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ")
      .toLowerCase();
    if (message.includes("block not found") || message.includes("requested resource not found")) {
      return true;
    }
    current = value.cause;
  }
  return false;
}

export async function waitForConfirmedBlockState(
  client: ConfirmedBlockReader,
  blockNumber: bigint,
  options: ConfirmedBlockWaitOptions = {},
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 20);
  const intervalMs = Math.max(0, options.intervalMs ?? 500);
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await client.getBlock({ blockNumber });
      return;
    } catch (error) {
      if (!isBlockNotFoundError(error)) throw error;
      lastError = error;
    }
    if (attempt + 1 < attempts) await wait(intervalMs);
  }

  throw new Error(
    `Base confirmed block ${blockNumber}, but the read service has not indexed it yet. Reload to finish updating; do not repeat the transaction.`,
    { cause: lastError },
  );
}
