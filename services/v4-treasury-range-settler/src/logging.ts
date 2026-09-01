const SAFE_FIELDS = new Set([
  "event",
  "level",
  "instanceId",
  "manager",
  "wallet",
  "blockNumber",
  "blockHash",
  "transactionHash",
  "orderId",
  "orderIds",
  "reasonCode",
  "count",
  "balanceWei",
  "expected",
  "actual",
  "source",
  "rpcSource",
  "operation",
  "latencyMs",
  "nonce",
  "pendingAgeMs",
  "terminalStatus",
  "timestamp",
  "message",
]);

export type LogLevel = "info" | "warn" | "error";

export function redactLogValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(/(?:https?|wss?):\/\/[^\s"']+/gi, "<redacted-url>");
}

export function structuredLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const output: Record<string, unknown> = { level, event, timestamp: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (SAFE_FIELDS.has(key)) output[key] = redactLogValue(value);
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

export function safeErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
  if (typeof candidate.code === "string" && /^[A-Z0-9_]+$/.test(candidate.code)) return candidate.code;
  if (typeof candidate.message === "string" && /^[A-Z][A-Z0-9_]{2,95}$/.test(candidate.message)) return candidate.message;
  if (typeof candidate.name === "string" && /^[A-Za-z0-9_]+$/.test(candidate.name)) return candidate.name;
  return "UNKNOWN_ERROR";
}

export async function postStatus(url: string, body: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Status endpoint returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}
