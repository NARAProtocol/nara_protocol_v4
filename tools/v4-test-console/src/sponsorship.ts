import { keccak256, toHex, type Address, type Hex } from "viem";

export type SponsoredCall = {
  to: Address;
  data: Hex;
  value?: bigint;
};

export type SponsorshipTicket = {
  ticket: string;
  expiresAt: number;
  url: string;
};

export type StoredPendingCalls = {
  version: 1;
  action: string;
  id: string;
  startedAt: number;
};

export type WalletSendCallsCapabilities = Record<string, unknown>;

export type WalletSendCallsRequest = {
  method: "wallet_sendCalls";
  params: [{
    version: "2.0.0";
    from: Address;
    chainId: Hex;
    atomicRequired: true;
    calls: ReturnType<typeof normalizeSponsoredCalls>;
    capabilities?: WalletSendCallsCapabilities;
  }];
};

const PENDING_CALLS_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export function pendingCallsStorageKey(wallet: string): string {
  return `nara-v4-test-console:pending-calls:8453:${wallet.toLowerCase()}`;
}

export function tradeAtomicCompatibilityStorageKey(wallet: string): string {
  return `nara-v4-test-console:trade-atomic-compatibility:8453:${wallet.toLowerCase()}`;
}

export function parseStoredPendingCalls(raw: string | null, now = Date.now()): StoredPendingCalls | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredPendingCalls>;
    if (
      value.version !== 1
      || typeof value.action !== "string"
      || !value.action.trim()
      || typeof value.id !== "string"
      || value.id.length < 3
      || value.id.length > 512
      || typeof value.startedAt !== "number"
      || !Number.isFinite(value.startedAt)
      || value.startedAt <= 0
      || now - value.startedAt > PENDING_CALLS_MAX_AGE_MS
    ) return null;
    return value as StoredPendingCalls;
  } catch {
    return null;
  }
}

export function normalizeSponsoredCalls(calls: readonly SponsoredCall[]) {
  return calls.map((call) => ({
    to: call.to.toLowerCase(),
    value: `0x${(call.value ?? 0n).toString(16)}`,
    data: call.data.toLowerCase(),
  }));
}

export function buildWalletSendCallsRequest({
  address,
  chainId,
  calls,
  capabilities,
}: {
  address: Address;
  chainId: number;
  calls: readonly SponsoredCall[];
  capabilities?: WalletSendCallsCapabilities;
}): WalletSendCallsRequest {
  return {
    method: "wallet_sendCalls",
    params: [{
      version: "2.0.0",
      from: address,
      chainId: `0x${chainId.toString(16)}`,
      atomicRequired: true,
      calls: normalizeSponsoredCalls(calls),
      ...(capabilities ? { capabilities } : {}),
    }],
  };
}

export function walletCallsId(response: unknown): string {
  if (typeof response === "string" && response.length > 2) return response;
  if (response && typeof response === "object") {
    const value = response as Record<string, unknown>;
    for (const key of ["id", "batchId"] as const) {
      if (typeof value[key] === "string" && value[key].length > 2) return value[key];
    }
  }
  throw new Error("The wallet returned an invalid atomic action identifier.");
}

export function sponsoredCallsHash(calls: readonly SponsoredCall[]): Hex {
  return keccak256(toHex(JSON.stringify(normalizeSponsoredCalls(calls))));
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function messageFrom(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === "string" && body.error ? body.error : fallback;
}

export async function readSponsorshipAvailability(signal?: AbortSignal): Promise<boolean> {
  const response = await fetch("/api/paymaster", {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });
  const body = await responseBody(response);
  return response.ok && body.available === true;
}

export async function requestSponsorshipTicket({
  address,
  calls,
  signMessage,
}: {
  address: Address;
  calls: readonly SponsoredCall[];
  signMessage: (message: string) => Promise<Hex>;
}): Promise<SponsorshipTicket> {
  const callsHash = sponsoredCallsHash(calls);
  const challengeResponse = await fetch(
    `/api/paymaster?address=${encodeURIComponent(address)}&callsHash=${encodeURIComponent(callsHash)}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    },
  );
  const challenge = await responseBody(challengeResponse);
  if (!challengeResponse.ok || typeof challenge.message !== "string" || typeof challenge.nonce !== "string") {
    throw new Error(messageFrom(challenge, "Gas sponsorship could not be authorized."));
  }
  const signature = await signMessage(challenge.message);
  const ticketResponse = await fetch("/api/paymaster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      action: "ticket",
      address,
      calls: normalizeSponsoredCalls(calls),
      message: challenge.message,
      nonce: challenge.nonce,
      signature,
    }),
  });
  const ticket = await responseBody(ticketResponse);
  if (
    !ticketResponse.ok
    || typeof ticket.ticket !== "string"
    || typeof ticket.expiresAt !== "number"
  ) throw new Error(messageFrom(ticket, "Gas sponsorship ticket could not be created."));
  return {
    ticket: ticket.ticket,
    expiresAt: ticket.expiresAt,
    url: new URL("/api/paymaster", window.location.origin).toString(),
  };
}

type WalletExecutionCapabilities = {
  atomic?: { status?: string; supported?: string | boolean };
  paymasterService?: { supported?: boolean };
} | undefined;

export type AtomicCallsStatus = "supported" | "ready" | "unsupported" | "unknown";

export function atomicCallsStatus(capabilities: WalletExecutionCapabilities): AtomicCallsStatus {
  const atomic = capabilities?.atomic;
  const value = atomic?.status ?? atomic?.supported;
  if (value === "supported" || value === true) return "supported";
  if (value === "ready") return "ready";
  if (value === "unsupported" || value === false) return "unsupported";
  return "unknown";
}

export function supportsAtomicCalls(capabilities: WalletExecutionCapabilities): boolean {
  const status = atomicCallsStatus(capabilities);
  return status === "ready" || status === "supported";
}

export function supportsSponsoredAtomicCalls(capabilities: WalletExecutionCapabilities): boolean {
  return supportsAtomicCalls(capabilities)
    && capabilities?.paymasterService?.supported === true;
}

export function isAtomicSimulationGasValidationError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("intrinsic gas too high")
    || (
      normalized.includes("amount of gas provided")
      && normalized.includes("exceeds the limit allowed for the block")
    );
}
