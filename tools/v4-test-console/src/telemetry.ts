const ADDRESS_OR_HASH = /0x([0-9a-f]{4})[0-9a-f]{32,56}([0-9a-f]{4})/gi;
const URL_QUERY = /(https?:\/\/[^\s?]+)\?[^\s]*/gi;
const AUTH_VALUE = /((?:authorization|bearer|private[_-]?key)\s*[:=]\s*)\S+/gi;
const MAX_DEPTH = 5;

export function redactTelemetryText(value: string): string {
  return value
    .replace(ADDRESS_OR_HASH, "0x$1…$2")
    .replace(URL_QUERY, "$1?<redacted>")
    .replace(AUTH_VALUE, "$1<redacted>");
}

export function scrubTelemetryValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactTelemetryText(value);
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "<truncated>";
  if (Array.isArray(value)) return value.map((entry) => scrubTelemetryValue(entry, depth + 1));

  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:user|email|ip_address|wallet|address|calldata|authorization)$/i.test(key)) {
      clean[key] = "<redacted>";
    } else {
      clean[key] = scrubTelemetryValue(entry, depth + 1);
    }
  }
  return clean;
}

function validPublicDsn(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && Boolean(url.username);
  } catch {
    return false;
  }
}

export async function initializeTelemetry(env: ImportMetaEnv): Promise<boolean> {
  const dsn = env.VITE_SENTRY_DSN?.trim() || "";
  if (!validPublicDsn(dsn)) return false;

  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    environment: env.VITE_SENTRY_ENVIRONMENT?.trim() || "preview",
    release: env.VITE_SENTRY_RELEASE?.trim() || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    normalizeDepth: 3,
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i],
    ignoreErrors: [
      /MaxListenersExceededWarning/i,
      /ObjectMultiplex - orphaned data for stream/i,
    ],
    beforeBreadcrumb(breadcrumb) {
      if (/^ui\.input$/i.test(breadcrumb.category || "")) return null;
      return scrubTelemetryValue(breadcrumb) as typeof breadcrumb;
    },
    beforeSend(event) {
      const scrubbed = scrubTelemetryValue(event) as typeof event;
      scrubbed.user = undefined;
      return scrubbed;
    },
  });
  return true;
}
