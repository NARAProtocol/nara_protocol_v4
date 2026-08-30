import { ethers } from "ethers";

export const CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA = "nara.external.circle-fiat-token.v1" as const;
export const CIRCLE_FIAT_TOKEN_PROXY_MECHANISM = "zeppelinos-unstructured-admin-upgradeability-proxy" as const;
export const CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3" as const;
export const CIRCLE_FIAT_TOKEN_ADMIN_SLOT = "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b" as const;
export const BASE_MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const CIRCLE_FIAT_TOKEN_ABI = [
  "function owner() view returns(address)",
  "function pauser() view returns(address)",
  "function blacklister() view returns(address)",
  "function paused() view returns(bool)",
  "function isBlacklisted(address account) view returns(bool)",
] as const;
const CIRCLE_FIAT_TOKEN_INTERFACE = new ethers.Interface(CIRCLE_FIAT_TOKEN_ABI);
const MULTICALL3_INTERFACE = new ethers.Interface([
  "function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns(tuple(bool success,bytes returnData)[] returnData)",
]);

export interface CircleFiatTokenDependencyEvidence {
  schemaVersion: typeof CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA;
  mechanism: typeof CIRCLE_FIAT_TOKEN_PROXY_MECHANISM;
  proxyAddress: string;
  implementationSlot: typeof CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT;
  adminSlot: typeof CIRCLE_FIAT_TOKEN_ADMIN_SLOT;
  readerAddress: typeof BASE_MULTICALL3;
  readerRuntimeCodeHash: string;
  proxyRuntimeCodeHash: string;
  implementationAddress: string;
  implementationRuntimeCodeHash: string;
  admin: string;
  owner: string;
  pauser: string;
  blacklister: string;
  paused: boolean;
  monitoredAccounts: Record<string, { address: string; isBlacklisted: boolean }>;
}

export interface CircleFiatTokenDependencyRequest {
  <T>(operation: string, task: () => Promise<T>): Promise<T>;
}

async function settledOrThrow<T>(promises: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(promises);
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected) throw rejected.reason;
  return settled.map((result) => (result as PromiseFulfilledResult<T>).value);
}

export function treasuryRangeUsdcMonitoredAccounts(addresses: Readonly<{
  safe: string;
  poolManager: string;
  positionManager: string;
  permit2: string;
  liquidityVault: string;
  liquidityCompounder: string;
  rangeManager?: string;
}>): Readonly<Record<string, string>> {
  return {
    safe: addresses.safe,
    poolManager: addresses.poolManager,
    positionManager: addresses.positionManager,
    permit2: addresses.permit2,
    liquidityVault: addresses.liquidityVault,
    liquidityCompounder: addresses.liquidityCompounder,
    ...(addresses.rangeManager ? { rangeManager: addresses.rangeManager } : {}),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function address(value: unknown, label: string): string {
  try {
    if (typeof value !== "string") throw new Error();
    return ethers.getAddress(value);
  } catch {
    throw new Error(`${label} must be an EVM address`);
  }
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !ethers.isHexString(value, 32)) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase();
}

function storageAddress(word: string, label: string): string {
  if (!ethers.isHexString(word, 32) || !/^0x0{24}[0-9a-fA-F]{40}$/.test(word)) {
    throw new Error(`${label} does not contain one canonical address`);
  }
  const parsed = ethers.getAddress(`0x${word.slice(-40)}`);
  if (parsed === ethers.ZeroAddress) throw new Error(`${label} contains the zero address`);
  return parsed;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseCircleFiatTokenDependencyEvidence(value: unknown): CircleFiatTokenDependencyEvidence {
  const root = object(value, "USDC dependency evidence");
  if (root.schemaVersion !== CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA || root.mechanism !== CIRCLE_FIAT_TOKEN_PROXY_MECHANISM) {
    throw new Error("USDC dependency evidence has an unsupported schema or proxy mechanism");
  }
  if (root.implementationSlot !== CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT || root.adminSlot !== CIRCLE_FIAT_TOKEN_ADMIN_SLOT) {
    throw new Error("USDC dependency evidence has unexpected proxy slots");
  }
  if (typeof root.paused !== "boolean") throw new Error("USDC dependency paused state must be boolean");
  const accountsRaw = object(root.monitoredAccounts, "USDC dependency monitoredAccounts");
  const monitoredAccounts = Object.fromEntries(Object.entries(accountsRaw).map(([label, item]) => {
    if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(label)) throw new Error(`USDC dependency account label ${label} is invalid`);
    const account = object(item, `USDC dependency monitoredAccounts.${label}`);
    if (typeof account.isBlacklisted !== "boolean") throw new Error(`USDC dependency monitoredAccounts.${label}.isBlacklisted must be boolean`);
    return [label, { address: address(account.address, `USDC dependency monitoredAccounts.${label}.address`), isBlacklisted: account.isBlacklisted }];
  }));
  if (Object.keys(monitoredAccounts).length === 0) throw new Error("USDC dependency monitoredAccounts must not be empty");
  const uniqueAccounts = new Set(Object.values(monitoredAccounts).map((account) => account.address.toLowerCase()));
  if (uniqueAccounts.size !== Object.keys(monitoredAccounts).length) throw new Error("USDC dependency monitoredAccounts contains a duplicate address");
  const result: CircleFiatTokenDependencyEvidence = {
    schemaVersion: CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
    mechanism: CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
    proxyAddress: address(root.proxyAddress, "USDC dependency proxyAddress"),
    implementationSlot: CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
    adminSlot: CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
    readerAddress: address(root.readerAddress, "USDC dependency readerAddress") as typeof BASE_MULTICALL3,
    readerRuntimeCodeHash: hash(root.readerRuntimeCodeHash, "USDC dependency readerRuntimeCodeHash"),
    proxyRuntimeCodeHash: hash(root.proxyRuntimeCodeHash, "USDC dependency proxyRuntimeCodeHash"),
    implementationAddress: address(root.implementationAddress, "USDC dependency implementationAddress"),
    implementationRuntimeCodeHash: hash(root.implementationRuntimeCodeHash, "USDC dependency implementationRuntimeCodeHash"),
    admin: address(root.admin, "USDC dependency admin"),
    owner: address(root.owner, "USDC dependency owner"),
    pauser: address(root.pauser, "USDC dependency pauser"),
    blacklister: address(root.blacklister, "USDC dependency blacklister"),
    paused: root.paused,
    monitoredAccounts,
  };
  if (result.readerAddress !== BASE_MULTICALL3) throw new Error("USDC dependency readerAddress is not Base Multicall3");
  return result;
}

export function assertCircleFiatTokenDependencyHealthy(evidence: CircleFiatTokenDependencyEvidence): void {
  if (evidence.paused) throw new Error("USDC_IS_PAUSED");
  const blacklisted = Object.entries(evidence.monitoredAccounts).filter(([, account]) => account.isBlacklisted);
  if (blacklisted.length > 0) throw new Error(`USDC_MONITORED_ACCOUNT_BLACKLISTED_${blacklisted[0][0].toUpperCase()}`);
}

export function assertCircleFiatTokenDependencyExact(
  expected: CircleFiatTokenDependencyEvidence,
  actual: CircleFiatTokenDependencyEvidence,
): void {
  assertCircleFiatTokenDependencyHealthy(actual);
  if (canonical(expected) !== canonical(actual)) throw new Error("USDC_DEPENDENCY_EVIDENCE_CHANGED");
}

export async function readCircleFiatTokenDependency(
  provider: ethers.Provider,
  proxyAddress: string,
  monitoredAccounts: Readonly<Record<string, string>>,
  blockTag: number | string,
  request: CircleFiatTokenDependencyRequest = (_operation, task) => task(),
): Promise<CircleFiatTokenDependencyEvidence> {
  const proxy = ethers.getAddress(proxyAddress);
  const accountEntries = Object.entries(monitoredAccounts).sort(([left], [right]) => left.localeCompare(right));
  if (accountEntries.length === 0) throw new Error("USDC monitored account set must not be empty");
  const [implementationWord, adminWord, proxyCode] = await settledOrThrow([
    request("getStorage.implementation", () => provider.getStorage(proxy, CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT, blockTag)),
    request("getStorage.admin", () => provider.getStorage(proxy, CIRCLE_FIAT_TOKEN_ADMIN_SLOT, blockTag)),
    request("getCode.proxy", () => provider.getCode(proxy, blockTag)),
  ]);
  const implementationAddress = storageAddress(implementationWord, "USDC implementation slot");
  const admin = storageAddress(adminWord, "USDC admin slot");
  const [implementationCode, readerCode] = await settledOrThrow([
    request("getCode.implementation", () => provider.getCode(implementationAddress, blockTag)),
    request("getCode.reader", () => provider.getCode(BASE_MULTICALL3, blockTag)),
  ]);
  if (proxyCode === "0x" || implementationCode === "0x" || readerCode === "0x") {
    throw new Error("USDC proxy, implementation, or dependency reader has no runtime code");
  }
  // Bind the transparent-proxy storage semantics through the exact proxy code
  // hash, then batch unrestricted token views through code-hash-bound
  // Multicall3. This keeps the entire dependency read below strict RPC quotas.
  const callSpecs = [
    { method: "owner", args: [] as readonly unknown[] },
    { method: "pauser", args: [] as readonly unknown[] },
    { method: "blacklister", args: [] as readonly unknown[] },
    { method: "paused", args: [] as readonly unknown[] },
    ...accountEntries.map(([, account]) => ({ method: "isBlacklisted", args: [account] as readonly unknown[] })),
  ];
  const reader = new ethers.Contract(BASE_MULTICALL3, MULTICALL3_INTERFACE.fragments, provider);
  const batched = await request("call.multicall3", () => reader.aggregate3.staticCall(
    callSpecs.map((spec) => ({
      target: proxy,
      allowFailure: false,
      callData: CIRCLE_FIAT_TOKEN_INTERFACE.encodeFunctionData(spec.method, spec.args),
    })),
    { blockTag },
  ) as Promise<readonly ethers.Result[]>);
  if (batched.length !== callSpecs.length || batched.some((item) => item[0] !== true)) {
    throw new Error("USDC dependency reader returned incomplete call evidence");
  }
  const decoded = callSpecs.map((spec, index) =>
    CIRCLE_FIAT_TOKEN_INTERFACE.decodeFunctionResult(spec.method, String(batched[index][1]))[0]
  );
  const [owner, pauser, blacklister, paused, ...blacklistValues] = decoded;
  const evidence = parseCircleFiatTokenDependencyEvidence({
    schemaVersion: CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
    mechanism: CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
    proxyAddress: proxy,
    implementationSlot: CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
    adminSlot: CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
    readerAddress: BASE_MULTICALL3,
    readerRuntimeCodeHash: ethers.keccak256(readerCode),
    proxyRuntimeCodeHash: ethers.keccak256(proxyCode),
    implementationAddress,
    implementationRuntimeCodeHash: ethers.keccak256(implementationCode),
    admin,
    owner: String(owner),
    pauser: String(pauser),
    blacklister: String(blacklister),
    paused: Boolean(paused),
    monitoredAccounts: Object.fromEntries(accountEntries.map(([label, account], index) => [label, {
      address: account,
      isBlacklisted: Boolean(blacklistValues[index]),
    }])),
  });
  return evidence;
}
