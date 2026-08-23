import type { Address } from "viem";

export type FundingAsset = "ETH" | "USDC";
export type ExternalFundingRoute = {
  id: "base-app" | "uniswap";
  name: string;
  action: string;
  url: string;
  detail: string;
};
export type SavedFundingIntent = {
  version: 1;
  kind: "trade" | "lock" | "unlock";
  tradeDirection?: "buy" | "sell";
  tradeAmount?: string;
  lockAmount?: string;
  durationEpochs?: string;
  createdAt: number;
};

const FUNDING_INTENT_PREFIX = "nara-v4-test-console:funding-intent:8453:";
export const FUNDING_INTENT_MAX_AGE_MS = 60 * 60 * 1_000;

export function fundingIntentStorageKey(address: Address | string): string {
  return `${FUNDING_INTENT_PREFIX}${address.toLowerCase()}`;
}

export function parseSavedFundingIntent(
  raw: string | null,
  now = Date.now(),
): SavedFundingIntent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedFundingIntent>;
    if (value.version !== 1) return null;
    if (value.kind !== "trade" && value.kind !== "lock" && value.kind !== "unlock") return null;
    if (!Number.isFinite(value.createdAt) || !value.createdAt) return null;
    if (value.createdAt > now || now - value.createdAt > FUNDING_INTENT_MAX_AGE_MS) return null;
    if (value.tradeDirection && value.tradeDirection !== "buy" && value.tradeDirection !== "sell") return null;
    return value as SavedFundingIntent;
  } catch {
    return null;
  }
}

export function fundingButtonLabel(asset: FundingAsset): string {
  return asset === "ETH" ? "Add ETH on Base" : "Add USDC on Base";
}

export function externalFundingRoutes(asset: FundingAsset): ExternalFundingRoute[] {
  return [
    {
      id: "base-app",
      name: "Base app / Coinbase",
      action: "Open Base app",
      url: "https://base.app/",
      detail: `Buy or transfer ${asset}; choose the Base network and this connected wallet.`,
    },
    {
      id: "uniswap",
      name: "Other payment providers",
      action: "Open Uniswap Buy",
      url: "https://app.uniswap.org/buy",
      detail: `Compare available providers for ${asset}; reconnect this same wallet and select Base.`,
    },
  ];
}
