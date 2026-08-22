export type PublicWalletEnvironment = {
  VITE_REOWN_PROJECT_ID?: string;
  VITE_WALLETCONNECT_PROJECT_ID?: string;
  VITE_RAINBOW_PROJECT_ID?: string;
};

export type WalletConnectorIdentity = {
  id?: string;
  type?: string;
  rkDetails?: { id?: string };
};

export type WalletErrorDiagnostic = {
  message: string;
  code: string | null;
  name: string | null;
  details: string | null;
};

type BrowserProvider = {
  isCoinbaseBrowser?: boolean;
  providers?: BrowserProvider[];
};

export const REOWN_PROJECT_ID_ENV_KEYS = [
  "VITE_REOWN_PROJECT_ID",
  "VITE_WALLETCONNECT_PROJECT_ID",
  "VITE_RAINBOW_PROJECT_ID",
] as const;

export function resolveReownProjectId(environment: PublicWalletEnvironment): string | null {
  for (const key of REOWN_PROJECT_ID_ENV_KEYS) {
    const value = environment[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function isBaseAccountConnector(connector: unknown): boolean {
  if (!connector || typeof connector !== "object") return false;
  const identity = connector as WalletConnectorIdentity;
  return identity.id === "baseAccount"
    || identity.type === "baseAccount"
    || identity.rkDetails?.id === "base";
}

export function isCoinbaseBrowserEnvironment(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const provider = (value as { ethereum?: BrowserProvider }).ethereum;
  if (!provider) return false;
  if (provider.isCoinbaseBrowser === true) return true;
  return Array.isArray(provider.providers)
    && provider.providers.some((candidate) => candidate?.isCoinbaseBrowser === true);
}

export function needsBaseAccountActivation({
  baseAccount,
  bytecode,
}: {
  baseAccount: boolean;
  bytecode: string | undefined;
}): boolean {
  return baseAccount
    && (!bytecode || bytecode === "0x");
}

function cleanDiagnosticText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/0x[0-9a-fA-F]{84,}/g, (hex) => `${hex.slice(0, 18)}…${hex.slice(-8)}`)
    .replace(/https?:\/\/\S+/gi, "[redacted URL]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 320 ? `${cleaned.slice(0, 317)}…` : cleaned;
}

export function walletErrorDiagnostic(error: unknown): WalletErrorDiagnostic {
  const visited = new Set<unknown>();
  const queue: unknown[] = [error];
  let message: string | null = null;
  let code: string | null = null;
  let name: string | null = null;
  let details: string | null = null;

  for (let depth = 0; depth < 12 && queue.length > 0; depth += 1) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (typeof current !== "object") {
      message ||= cleanDiagnosticText(current);
      break;
    }
    const value = current as Record<string, unknown>;
    message ||= cleanDiagnosticText(value.shortMessage) || cleanDiagnosticText(value.message);
    details ||= cleanDiagnosticText(value.details)
      || cleanDiagnosticText((value.data as Record<string, unknown> | undefined)?.message)
      || cleanDiagnosticText((value.data as Record<string, unknown> | undefined)?.reason);
    if (code === null && (typeof value.code === "number" || typeof value.code === "string")) {
      code = String(value.code);
    }
    name ||= cleanDiagnosticText(value.name);
    for (const nested of [value.cause, value.error, value.data, value.originalError]) {
      if (nested && !visited.has(nested)) queue.push(nested);
    }
  }

  return {
    message: message || details || "The wallet request failed.",
    code,
    name,
    details: details && details !== message ? details : null,
  };
}

export function walletErrorMessage(error: unknown): string {
  const diagnostic = walletErrorDiagnostic(error);
  const suffix = [
    diagnostic.code ? `code ${diagnostic.code}` : null,
    diagnostic.details,
  ].filter(Boolean).join(" · ");
  return suffix ? `${diagnostic.message} (${suffix})` : diagnostic.message;
}
