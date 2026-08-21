import { ethers } from "ethers";

export const NARA_PRODUCTION_SAFE_OWNERS = [
  "0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e",
  "0xC019Dc79412c4b20103ac4ce97B2615FF45D490d",
  "0x42365cAE9abB6cb357dd485734CAd75a2d3c6664",
] as const;

export const BASE_SAFE_141_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
export const BASE_SAFE_141_SINGLETON_CODEHASH =
  "0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff";
export const BASE_MULTISEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
export const BASE_MULTISEND_CALL_ONLY_CODEHASH =
  "0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939";
export const SAFE_MODULE_SENTINEL = "0x0000000000000000000000000000000000000001";
export const SAFE_GUARD_STORAGE_SLOT = BigInt(
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8",
);
export const SAFE_FALLBACK_HANDLER_STORAGE_SLOT = BigInt(
  "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5",
);
export const NARA_SAFE_FALLBACK_HANDLER = "0xfd0732dc9e303f09fcef3a7388ad10a83459ec99";
export const NARA_SAFE_FALLBACK_HANDLER_CODEHASH =
  "0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9";

export const NARA_SAFE_ABI = [
  "function masterCopy() view returns (address)",
  "function VERSION() view returns (string)",
  "function nonce() view returns (uint256)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getStorageAt(uint256 offset,uint256 length) view returns (bytes)",
  "function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function simulateAndRevert(address targetContract,bytes calldataPayload)",
] as const;

export interface CanonicalSafeEvidence {
  address: string;
  version: "1.4.1";
  threshold: "2";
  owners: string[];
  nonce: string;
  modules: string[];
  guard: string;
  fallbackHandler: string;
  singleton: string;
  safeRuntimeCodeHash: string;
  singletonRuntimeCodeHash: string;
  fallbackHandlerRuntimeCodeHash: string;
  verifiedAtBlock: number;
  verifiedAtBlockHash: string;
}

function normalizedSet(addresses: readonly string[]): string[] {
  return addresses.map((value) => ethers.getAddress(value).toLowerCase()).sort();
}

export async function readCanonicalNaraSafeEvidence(
  provider: ethers.Provider,
  safeAddress: string,
  expectedSafeRuntimeCodeHash: string,
  blockNumber: number,
): Promise<CanonicalSafeEvidence> {
  const safe = ethers.getAddress(safeAddress);
  const block = await provider.getBlock(blockNumber);
  if (!block?.hash || /^0x0{64}$/i.test(block.hash)) {
    throw new Error("Safe verification block does not have a canonical non-zero block hash");
  }
  const callAtBlock = { blockTag: blockNumber };
  const contract = new ethers.Contract(safe, NARA_SAFE_ABI, provider);
  const [
    safeCode,
    singletonCode,
    singleton,
    version,
    nonce,
    threshold,
    owners,
    guardStorage,
    fallbackHandlerStorage,
    fallbackHandlerCode,
    modulesPage,
  ] = await Promise.all([
    provider.getCode(safe, blockNumber),
    provider.getCode(BASE_SAFE_141_SINGLETON, blockNumber),
    contract.masterCopy(callAtBlock),
    contract.VERSION(callAtBlock),
    contract.nonce(callAtBlock),
    contract.getThreshold(callAtBlock),
    contract.getOwners(callAtBlock),
    contract.getStorageAt(SAFE_GUARD_STORAGE_SLOT, 1, callAtBlock),
    contract.getStorageAt(SAFE_FALLBACK_HANDLER_STORAGE_SLOT, 1, callAtBlock),
    provider.getCode(NARA_SAFE_FALLBACK_HANDLER, blockNumber),
    contract.getModulesPaginated(SAFE_MODULE_SENTINEL, 10, callAtBlock),
  ]);

  const safeCodeHash = ethers.keccak256(safeCode).toLowerCase();
  const singletonCodeHash = ethers.keccak256(singletonCode).toLowerCase();
  const guard = ethers.getAddress(ethers.dataSlice(guardStorage, 12));
  const fallbackHandler = ethers.getAddress(ethers.dataSlice(fallbackHandlerStorage, 12));
  const fallbackHandlerRuntimeCodeHash = ethers.keccak256(fallbackHandlerCode).toLowerCase();
  const modules = (modulesPage[0] as string[]).map((value) => ethers.getAddress(value));
  const nextModule = ethers.getAddress(modulesPage[1]);
  const normalizedOwners = (owners as string[]).map((value) => ethers.getAddress(value));

  if (safeCodeHash !== expectedSafeRuntimeCodeHash.toLowerCase()) {
    throw new Error("Production Safe runtime code hash differs from the pinned core manifest");
  }
  if (
    ethers.getAddress(singleton) !== ethers.getAddress(BASE_SAFE_141_SINGLETON) ||
    singletonCodeHash !== BASE_SAFE_141_SINGLETON_CODEHASH
  ) {
    throw new Error("Production Safe is not bound to the approved Base Safe 1.4.1 singleton");
  }
  if (version !== "1.4.1" || threshold !== 2n) {
    throw new Error("Production Safe must remain the approved v1.4.1 2-of-3 configuration");
  }
  if (
    JSON.stringify(normalizedSet(normalizedOwners)) !==
    JSON.stringify(normalizedSet(NARA_PRODUCTION_SAFE_OWNERS))
  ) {
    throw new Error("Production Safe owner set differs from the approved custody handoff");
  }
  if (guard !== ethers.ZeroAddress) {
    throw new Error("Production Safe must not have an active guard");
  }
  if (
    fallbackHandler !== ethers.getAddress(NARA_SAFE_FALLBACK_HANDLER) ||
    fallbackHandlerRuntimeCodeHash !== NARA_SAFE_FALLBACK_HANDLER_CODEHASH
  ) {
    throw new Error("Production Safe fallback handler differs from the approved code-pinned handler");
  }
  if (modules.length !== 0 || nextModule !== ethers.getAddress(SAFE_MODULE_SENTINEL)) {
    throw new Error("Production Safe must not have active modules");
  }

  return {
    address: safe,
    version: "1.4.1",
    threshold: "2",
    owners: normalizedOwners,
    nonce: nonce.toString(),
    modules,
    guard,
    fallbackHandler,
    singleton: ethers.getAddress(singleton),
    safeRuntimeCodeHash: safeCodeHash,
    singletonRuntimeCodeHash: singletonCodeHash,
    fallbackHandlerRuntimeCodeHash,
    verifiedAtBlock: blockNumber,
    verifiedAtBlockHash: block.hash,
  };
}
