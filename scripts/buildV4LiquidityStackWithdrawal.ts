/**
 * Build and read-only simulate the matured historical v4 liquidity withdrawal.
 *
 * This script never signs, proposes, submits, or broadcasts a transaction. It
 * emits a Safe Transaction Builder JSON file only after the exact four-call
 * MultiSendCallOnly payload succeeds through Safe.simulateAndRevert at one
 * pinned Base block.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_CHAIN_ID,
  CHANGE_ID,
  MULTISEND_CALL_ONLY,
  MULTISEND_RUNTIME_CODE_HASH,
  SAFE,
  SAFE_MODULE_SENTINEL,
  SAFE_OWNERS,
  SAFE_RUNTIME_CODE_HASH,
  SAFE_THRESHOLD,
  SAFE_VERSION,
  STACK,
  bpsFloor,
  decodePositionTicks,
  encodeMultiSendCalls,
  positionPrincipalAtSpot,
  withdrawalCallPlan,
  type TokenPair,
} from "./lib/v4LiquidityWithdrawal.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const RECOVERY_KIND_WIND_DOWN = 3n;
const RECOVERY_ETA = 1_786_140_035n;
const RECOVERY_DELAY = 604_800n;
const DEFAULT_VALIDITY_SECONDS = 3_600n;
const DEFAULT_MIN_OUT_BPS = 9_900n;
const ERC721_RECEIVED_SELECTOR = "0x150b7a02";
const POOLS_STORAGE_SLOT = 6n;
const UINT128_MASK = (1n << 128n) - 1n;
const UINT256_MASK = (1n << 256n) - 1n;
const Q128 = 1n << 128n;

const ERC20_ABI = ["function balanceOf(address account) view returns(uint256)"];
const VAULT_ABI = [
  "function owner() view returns(address)",
  "function token() view returns(address)",
  "function base() view returns(address)",
  "function hook() view returns(address)",
  "function compounder() view returns(address)",
  "function compounderFrozen() view returns(bool)",
  "function compoundKeeper(address) view returns(bool)",
  "function routeMode() view returns(uint8)",
  "function balances() view returns(uint256 tokenBalance,uint256 baseBalance)",
  "function compoundAll(uint256 minLiquidityAdded,uint64 deadline,bytes data) returns(uint256 liquidityAdded)",
];
const COMPOUNDER_ABI = [
  "function owner() view returns(address)",
  "function nara() view returns(address)",
  "function usdc() view returns(address)",
  "function vault() view returns(address)",
  "function poolManager() view returns(address)",
  "function positionManager() view returns(address)",
  "function RECOVERY_DELAY() view returns(uint64)",
  "function positionTokenId() view returns(uint256)",
  "function bankedBalances() view returns(uint256 naraBanked,uint256 usdcBanked)",
  "function pendingRecovery() view returns(uint8 kind,address to,uint64 eta)",
  "function executeRecovery()",
];
const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns(address)",
  "function getPositionLiquidity(uint256 tokenId) view returns(uint128)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,uint256 info)",
  "function modifyLiquidities(bytes unlockData,uint256 deadline) payable",
];
const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) view returns(bytes32 value)",
  "function extsload(bytes32 startSlot,uint256 nSlots) view returns(bytes32[] values)",
];
const SAFE_ABI = [
  "function VERSION() view returns(string)",
  "function nonce() view returns(uint256)",
  "function getThreshold() view returns(uint256)",
  "function getOwners() view returns(address[])",
  "function getModulesPaginated(address start,uint256 pageSize) view returns(address[] modules,address next)",
  "function onERC721Received(address operator,address from,uint256 tokenId,bytes data) view returns(bytes4)",
  "function simulateAndRevert(address targetContract,bytes calldataPayload)",
];
const MULTISEND_ABI = ["function multiSend(bytes transactions)"];

type PoolKeySnapshot = {
  currency0: string;
  currency1: string;
  fee: bigint;
  tickSpacing: bigint;
  hooks: string;
};

type PositionSnapshot = {
  tokenId: bigint;
  owner: string;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  principal: TokenPair;
  fees: TokenPair;
};

function requiredRpcUrl(): string {
  const value = process.env.BASE_MAINNET_RPC_URL ?? process.env.BASE_RPC_URL;
  if (!value) throw new Error("Missing BASE_RPC_URL or BASE_MAINNET_RPC_URL");
  return value;
}

function envUint(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an unsigned integer`);
  return BigInt(raw);
}

function sameAddress(actual: string, expected: string, label: string): void {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function sameBigint(actual: bigint, expected: bigint, label: string): void {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function word(value: bigint): string {
  return ethers.zeroPadValue(ethers.toBeHex(value & UINT256_MASK), 32);
}

function addSlot(slot: string, offset: bigint): string {
  return word(BigInt(slot) + offset);
}

function subtractModulo256(...values: bigint[]): bigint {
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) result = (result - values[i]) & UINT256_MASK;
  return result;
}

function signed24(value: bigint): number {
  const raw = Number(value & 0xff_ffffn);
  return raw >= 0x80_0000 ? raw - 0x100_0000 : raw;
}

function nestedErrorData(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.data === "string" && ethers.isHexString(record.data)) return record.data;
  return nestedErrorData(record.error) ?? nestedErrorData(record.info);
}

function decodeSafeSimulation(error: unknown): { success: boolean; response: string } {
  const data = nestedErrorData(error);
  if (!data || ethers.dataLength(data) < 64) {
    throw new Error("Safe simulateAndRevert did not return its canonical result payload");
  }
  const bytes = ethers.getBytes(data);
  const success = BigInt(ethers.hexlify(bytes.slice(0, 32))) === 1n;
  const responseSize = Number(BigInt(ethers.hexlify(bytes.slice(32, 64))));
  if (!Number.isSafeInteger(responseSize) || bytes.length !== 64 + responseSize) {
    throw new Error("Safe simulateAndRevert returned an invalid result length");
  }
  return { success, response: ethers.hexlify(bytes.slice(64)) };
}

function formatPair(pair: TokenPair): Record<string, string> {
  return {
    naraRaw: pair.amount0.toString(),
    nara: ethers.formatUnits(pair.amount0, 18),
    usdcRaw: pair.amount1.toString(),
    usdc: ethers.formatUnits(pair.amount1, 6),
  };
}

async function main(): Promise<void> {
  const validitySeconds = envUint("V4_WITHDRAWAL_VALIDITY_SECONDS", DEFAULT_VALIDITY_SECONDS);
  const minOutBps = envUint("V4_WITHDRAWAL_MIN_OUT_BPS", DEFAULT_MIN_OUT_BPS);
  if (validitySeconds < 600n || validitySeconds > 21_600n) {
    throw new Error("V4_WITHDRAWAL_VALIDITY_SECONDS must be between 600 and 21600");
  }
  if (minOutBps < 9_000n || minOutBps > 10_000n) {
    throw new Error("V4_WITHDRAWAL_MIN_OUT_BPS must be between 9000 and 10000");
  }

  const provider = new ethers.JsonRpcProvider(requiredRpcUrl());
  try {
    const network = await provider.getNetwork();
    sameBigint(network.chainId, BASE_CHAIN_ID, "chain ID");
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Latest Base block is unavailable");
    const blockTag = block.number;
    const callOverrides = { blockTag };
    const blockTimestamp = BigInt(block.timestamp);
    if (blockTimestamp < RECOVERY_ETA) throw new Error("WindDown recovery is not mature");
    const deadline = blockTimestamp + validitySeconds;

    const vault = new ethers.Contract(STACK.vault, VAULT_ABI, provider);
    const compounder = new ethers.Contract(STACK.compounder, COMPOUNDER_ABI, provider);
    const positionManager = new ethers.Contract(STACK.positionManager, POSITION_MANAGER_ABI, provider);
    const poolManager = new ethers.Contract(STACK.poolManager, POOL_MANAGER_ABI, provider);
    const safe = new ethers.Contract(SAFE, SAFE_ABI, provider);
    const nara = new ethers.Contract(STACK.nara, ERC20_ABI, provider);
    const usdc = new ethers.Contract(STACK.usdc, ERC20_ABI, provider);

    const codeTargets = {
      nara: STACK.nara,
      usdc: STACK.usdc,
      poolManager: STACK.poolManager,
      positionManager: STACK.positionManager,
      vault: STACK.vault,
      hook: STACK.hook,
      compounder: STACK.compounder,
    } as const;
    const observedCodeHashes: Record<string, string> = {};
    for (const [name, address] of Object.entries(codeTargets)) {
      const hash = ethers.keccak256(await provider.getCode(address, blockTag));
      const expected = STACK.runtimeCodeHashes[name as keyof typeof STACK.runtimeCodeHashes];
      if (hash !== expected) throw new Error(`${name} runtime code hash changed`);
      observedCodeHashes[name] = hash;
    }
    const safeCodeHash = ethers.keccak256(await provider.getCode(SAFE, blockTag));
    if (safeCodeHash !== SAFE_RUNTIME_CODE_HASH) throw new Error("Safe runtime code hash changed");
    const multiSendCodeHash = ethers.keccak256(await provider.getCode(MULTISEND_CALL_ONLY, blockTag));
    if (multiSendCodeHash !== MULTISEND_RUNTIME_CODE_HASH) {
      throw new Error("MultiSendCallOnly runtime code hash changed");
    }

    const [safeVersion, safeNonce, safeThreshold, safeOwners, modulesPage, receiverSelector] = await Promise.all([
      safe.VERSION(callOverrides) as Promise<string>,
      safe.nonce(callOverrides) as Promise<bigint>,
      safe.getThreshold(callOverrides) as Promise<bigint>,
      safe.getOwners(callOverrides) as Promise<string[]>,
      safe.getModulesPaginated(SAFE_MODULE_SENTINEL, 10n, callOverrides) as Promise<[string[], string]>,
      safe.onERC721Received(ethers.ZeroAddress, ethers.ZeroAddress, 0n, "0x", callOverrides) as Promise<string>,
    ]);
    if (safeVersion !== SAFE_VERSION) throw new Error(`Safe version changed: ${safeVersion}`);
    sameBigint(safeThreshold, SAFE_THRESHOLD, "Safe threshold");
    const actualOwners = safeOwners.map((owner) => ethers.getAddress(owner)).sort();
    const expectedOwners = SAFE_OWNERS.map((owner) => ethers.getAddress(owner)).sort();
    if (JSON.stringify(actualOwners) !== JSON.stringify(expectedOwners)) throw new Error("Safe owner set changed");
    if (modulesPage[0].length !== 0 || ethers.getAddress(modulesPage[1]) !== SAFE_MODULE_SENTINEL) {
      throw new Error("Safe module state changed");
    }
    if (receiverSelector !== ERC721_RECEIVED_SELECTOR) throw new Error("Safe cannot receive the compounder NFT");

    const [
      vaultOwner,
      vaultToken,
      vaultBase,
      vaultHook,
      vaultCompounder,
      compounderFrozen,
      keeperAuthorized,
      routeMode,
      vaultBalances,
      compounderOwner,
      compounderNara,
      compounderUsdc,
      compounderVault,
      compounderPoolManager,
      compounderPositionManager,
      recoveryDelay,
      positionTokenId,
      bankedBalances,
      pendingRecovery,
    ] = await Promise.all([
      vault.owner(callOverrides) as Promise<string>,
      vault.token(callOverrides) as Promise<string>,
      vault.base(callOverrides) as Promise<string>,
      vault.hook(callOverrides) as Promise<string>,
      vault.compounder(callOverrides) as Promise<string>,
      vault.compounderFrozen(callOverrides) as Promise<boolean>,
      vault.compoundKeeper(STACK.keeper, callOverrides) as Promise<boolean>,
      vault.routeMode(callOverrides) as Promise<bigint>,
      vault.balances(callOverrides) as Promise<{ tokenBalance: bigint; baseBalance: bigint }>,
      compounder.owner(callOverrides) as Promise<string>,
      compounder.nara(callOverrides) as Promise<string>,
      compounder.usdc(callOverrides) as Promise<string>,
      compounder.vault(callOverrides) as Promise<string>,
      compounder.poolManager(callOverrides) as Promise<string>,
      compounder.positionManager(callOverrides) as Promise<string>,
      compounder.RECOVERY_DELAY(callOverrides) as Promise<bigint>,
      compounder.positionTokenId(callOverrides) as Promise<bigint>,
      compounder.bankedBalances(callOverrides) as Promise<{ naraBanked: bigint; usdcBanked: bigint }>,
      compounder.pendingRecovery(callOverrides) as Promise<{ kind: bigint; to: string; eta: bigint }>,
    ]);
    sameAddress(vaultOwner, SAFE, "Vault owner");
    sameAddress(vaultToken, STACK.nara, "Vault token");
    sameAddress(vaultBase, STACK.usdc, "Vault base");
    sameAddress(vaultHook, STACK.hook, "Vault hook");
    sameAddress(vaultCompounder, STACK.compounder, "Vault compounder");
    if (!compounderFrozen) throw new Error("Vault compounder is not frozen");
    if (keeperAuthorized) throw new Error("Historical compound keeper is authorized");
    sameBigint(routeMode, 0n, "Vault route mode");
    sameAddress(compounderOwner, SAFE, "Compounder owner");
    sameAddress(compounderNara, STACK.nara, "Compounder NARA");
    sameAddress(compounderUsdc, STACK.usdc, "Compounder USDC");
    sameAddress(compounderVault, STACK.vault, "Compounder vault");
    sameAddress(compounderPoolManager, STACK.poolManager, "Compounder PoolManager");
    sameAddress(compounderPositionManager, STACK.positionManager, "Compounder PositionManager");
    sameBigint(recoveryDelay, RECOVERY_DELAY, "Recovery delay");
    sameBigint(positionTokenId, STACK.compounderPositionTokenId, "Compounder position token ID");
    sameBigint(pendingRecovery.kind, RECOVERY_KIND_WIND_DOWN, "Pending recovery kind");
    sameAddress(pendingRecovery.to, SAFE, "Pending recovery recipient");
    sameBigint(pendingRecovery.eta, RECOVERY_ETA, "Pending recovery ETA");

    const poolStateSlot = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [STACK.poolId, word(POOLS_STORAGE_SLOT)]),
    );
    const feeGrowthGlobalSlot = addSlot(poolStateSlot, 1n);
    const activeLiquiditySlot = addSlot(poolStateSlot, 3n);
    const ticksMappingSlot = addSlot(poolStateSlot, 4n);
    const positionsMappingSlot = addSlot(poolStateSlot, 6n);
    const loadWord = async (slot: string): Promise<string> =>
      poolManager["extsload(bytes32)"](slot, callOverrides) as Promise<string>;
    const loadWords = async (slot: string, count: bigint): Promise<string[]> =>
      poolManager["extsload(bytes32,uint256)"](slot, count, callOverrides) as Promise<string[]>;

    const slot0Word = BigInt(await loadWord(poolStateSlot));
    const sqrtPriceX96 = slot0Word & ((1n << 160n) - 1n);
    const currentTick = signed24(slot0Word >> 160n);
    const feeGrowthGlobals = await loadWords(feeGrowthGlobalSlot, 2n);
    const feeGrowthGlobal0X128 = BigInt(feeGrowthGlobals[0]);
    const feeGrowthGlobal1X128 = BigInt(feeGrowthGlobals[1]);

    const feeGrowthInside = async (tickLower: number, tickUpper: number) => {
      const lowerSlot = ethers.keccak256(
        ethers.solidityPacked(["int256", "bytes32"], [BigInt(tickLower), ticksMappingSlot]),
      );
      const upperSlot = ethers.keccak256(
        ethers.solidityPacked(["int256", "bytes32"], [BigInt(tickUpper), ticksMappingSlot]),
      );
      const [lowerWords, upperWords] = await Promise.all([
        loadWords(addSlot(lowerSlot, 1n), 2n),
        loadWords(addSlot(upperSlot, 1n), 2n),
      ]);
      const [lower0, lower1, upper0, upper1] = [
        BigInt(lowerWords[0]), BigInt(lowerWords[1]), BigInt(upperWords[0]), BigInt(upperWords[1]),
      ];
      if (currentTick < tickLower) {
        return { amount0: subtractModulo256(lower0, upper0), amount1: subtractModulo256(lower1, upper1) };
      }
      if (currentTick >= tickUpper) {
        return { amount0: subtractModulo256(upper0, lower0), amount1: subtractModulo256(upper1, lower1) };
      }
      return {
        amount0: subtractModulo256(feeGrowthGlobal0X128, lower0, upper0),
        amount1: subtractModulo256(feeGrowthGlobal1X128, lower1, upper1),
      };
    };

    const positionSnapshot = async (tokenId: bigint): Promise<PositionSnapshot> => {
      const [owner, liquidity, result] = await Promise.all([
        positionManager.ownerOf(tokenId, callOverrides) as Promise<string>,
        positionManager.getPositionLiquidity(tokenId, callOverrides) as Promise<bigint>,
        positionManager.getPoolAndPositionInfo(tokenId, callOverrides) as Promise<[PoolKeySnapshot, bigint]>,
      ]);
      if (liquidity <= 0n) throw new Error(`Position ${tokenId} has no liquidity`);
      const [key, packedInfo] = result;
      sameAddress(key.currency0, STACK.nara, `Position ${tokenId} currency0`);
      sameAddress(key.currency1, STACK.usdc, `Position ${tokenId} currency1`);
      const actualPoolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,address)"],
        [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]],
      ));
      if (actualPoolId !== STACK.poolId) throw new Error(`Position ${tokenId} pool ID changed`);
      const ticks = decodePositionTicks(packedInfo);
      const positionId = ethers.solidityPackedKeccak256(
        ["address", "int24", "int24", "bytes32"],
        [STACK.positionManager, ticks.tickLower, ticks.tickUpper, word(tokenId)],
      );
      const positionSlot = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "bytes32"], [positionId, positionsMappingSlot]),
      );
      const [positionWords, inside] = await Promise.all([
        loadWords(positionSlot, 3n),
        feeGrowthInside(ticks.tickLower, ticks.tickUpper),
      ]);
      if ((BigInt(positionWords[0]) & UINT128_MASK) !== liquidity) {
        throw new Error(`Position ${tokenId} storage liquidity mismatch`);
      }
      const principal = positionPrincipalAtSpot({
        liquidity,
        sqrtPriceX96,
        currentTick,
        tickLower: ticks.tickLower,
        tickUpper: ticks.tickUpper,
      });
      const fees = {
        amount0: (subtractModulo256(inside.amount0, BigInt(positionWords[1])) * liquidity) / Q128,
        amount1: (subtractModulo256(inside.amount1, BigInt(positionWords[2])) * liquidity) / Q128,
      };
      return { tokenId, owner, liquidity, ...ticks, principal, fees };
    };

    const [seedPosition, compounderPosition] = await Promise.all([
      positionSnapshot(STACK.seedPositionTokenId),
      positionSnapshot(STACK.compounderPositionTokenId),
    ]);
    sameAddress(seedPosition.owner, SAFE, "Seed position owner");
    sameAddress(compounderPosition.owner, STACK.compounder, "Compounder position owner");
    const activeLiquidity = BigInt(await loadWord(activeLiquiditySlot)) & UINT128_MASK;
    sameBigint(
      activeLiquidity,
      seedPosition.liquidity + compounderPosition.liquidity,
      "Named positions versus active pool liquidity",
    );

    const compoundAllData = vault.interface.encodeFunctionData("compoundAll", [1n, deadline, "0x"]);
    const compoundAllResult = await provider.call({
      from: SAFE,
      to: STACK.vault,
      data: compoundAllData,
      blockTag,
    });
    const expectedLiquidityAdded = vault.interface.decodeFunctionResult("compoundAll", compoundAllResult)[0] as bigint;
    if (expectedLiquidityAdded <= 0n) throw new Error("Retirement drain would add zero liquidity");
    const projectedCompounderLiquidity = compounderPosition.liquidity + expectedLiquidityAdded;
    const projectedCompounderPrincipal = positionPrincipalAtSpot({
      liquidity: projectedCompounderLiquidity,
      sqrtPriceX96,
      currentTick,
      tickLower: compounderPosition.tickLower,
      tickUpper: compounderPosition.tickUpper,
    });
    const seedMin = {
      amount0: bpsFloor(seedPosition.principal.amount0, minOutBps),
      amount1: bpsFloor(seedPosition.principal.amount1, minOutBps),
    };
    const compounderMin = {
      amount0: bpsFloor(projectedCompounderPrincipal.amount0, minOutBps),
      amount1: bpsFloor(projectedCompounderPrincipal.amount1, minOutBps),
    };
    const transactions = withdrawalCallPlan({ deadline, seedMin, compounderMin });

    const multiSendTransactions = encodeMultiSendCalls(transactions);
    const multiSendPayload = new ethers.Interface(MULTISEND_ABI).encodeFunctionData(
      "multiSend",
      [multiSendTransactions],
    );
    const safeSimulationPayload = safe.interface.encodeFunctionData("simulateAndRevert", [
      MULTISEND_CALL_ONLY,
      multiSendPayload,
    ]);
    let simulation: { success: boolean; response: string };
    try {
      await provider.call({
        from: SAFE_OWNERS[0],
        to: SAFE,
        data: safeSimulationPayload,
        gasLimit: 20_000_000n,
        blockTag,
      });
      throw new Error("Safe simulateAndRevert unexpectedly returned without reverting");
    } catch (error) {
      simulation = decodeSafeSimulation(error);
    }
    if (!simulation.success) {
      const selector = ethers.dataLength(simulation.response) >= 4
        ? ethers.dataSlice(simulation.response, 0, 4)
        : "empty";
      throw new Error(`Exact withdrawal batch simulation failed (${selector})`);
    }

    const scoped = {
      amount0:
        seedPosition.principal.amount0 + seedPosition.fees.amount0
        + compounderPosition.principal.amount0 + compounderPosition.fees.amount0
        + vaultBalances.tokenBalance + bankedBalances.naraBanked,
      amount1:
        seedPosition.principal.amount1 + seedPosition.fees.amount1
        + compounderPosition.principal.amount1 + compounderPosition.fees.amount1
        + vaultBalances.baseBalance + bankedBalances.usdcBanked,
    };
    const [safeNara, safeUsdc, reserveNara] = await Promise.all([
      nara.balanceOf(SAFE, callOverrides) as Promise<bigint>,
      usdc.balanceOf(SAFE, callOverrides) as Promise<bigint>,
      nara.balanceOf(STACK.rewardReserve, callOverrides) as Promise<bigint>,
    ]);

    const output = {
      version: "1.0",
      chainId: Number(BASE_CHAIN_ID),
      createdAt: Date.now(),
      meta: {
        name: "NARA historical v4 liquidity-stack atomic withdrawal",
        description:
          "UNEXECUTED, SHORT-LIVED PAYLOAD. Drains the historical Vault, executes matured WindDown, burns both historical LP NFTs, and takes NARA/USDC to the custody Safe.",
        txBuilderVersion: "1.18.0",
        createdFromSafeAddress: SAFE,
        createdFromOwnerAddress: "",
      },
      transactions,
      naraEvidence: {
        changeId: CHANGE_ID,
        evidenceState: "built-and-simulated-not-signed-not-submitted-not-broadcast",
        network: "base",
        chainId: Number(BASE_CHAIN_ID),
        snapshotBlock: {
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
          timestampIso: new Date(block.timestamp * 1_000).toISOString(),
        },
        expiry: {
          deadlineUnix: deadline.toString(),
          deadlineIso: new Date(Number(deadline) * 1_000).toISOString(),
          validitySeconds: validitySeconds.toString(),
          rule: "Do not import, sign, or execute after this deadline. Rebuild from a fresh Base block.",
        },
        custodySafe: {
          address: SAFE,
          version: safeVersion,
          nonceAtSnapshot: safeNonce.toString(),
          threshold: safeThreshold.toString(),
          owners: actualOwners,
          enabledModules: modulesPage[0],
          runtimeCodeHash: safeCodeHash,
          erc721ReceiverSelector: receiverSelector,
        },
        runtimeCodeHashes: {
          ...observedCodeHashes,
          safe: safeCodeHash,
          multiSendCallOnly: multiSendCodeHash,
        },
        recovery: {
          kind: "WindDown",
          kindCode: pendingRecovery.kind.toString(),
          destination: pendingRecovery.to,
          etaUnix: pendingRecovery.eta.toString(),
          etaIso: new Date(Number(pendingRecovery.eta) * 1_000).toISOString(),
          maturedAtSnapshot: true,
          keeperAuthorized,
        },
        inventory: {
          vault: formatPair({ amount0: vaultBalances.tokenBalance, amount1: vaultBalances.baseBalance }),
          compounderBank: formatPair({ amount0: bankedBalances.naraBanked, amount1: bankedBalances.usdcBanked }),
          seedPosition: {
            tokenId: seedPosition.tokenId.toString(),
            owner: seedPosition.owner,
            liquidity: seedPosition.liquidity.toString(),
            principal: formatPair(seedPosition.principal),
            fees: formatPair(seedPosition.fees),
          },
          compounderPosition: {
            tokenId: compounderPosition.tokenId.toString(),
            owner: compounderPosition.owner,
            liquidityBeforeDrain: compounderPosition.liquidity.toString(),
            expectedLiquidityAddedByDrain: expectedLiquidityAdded.toString(),
            projectedLiquidityBeforeBurn: projectedCompounderLiquidity.toString(),
            principalBeforeDrain: formatPair(compounderPosition.principal),
            feesBeforeDrain: formatPair(compounderPosition.fees),
          },
          totalActualTokensAcrossScope: formatPair(scoped),
          safeBalanceBefore: formatPair({ amount0: safeNara, amount1: safeUsdc }),
          rewardReserveNaraBefore: {
            raw: reserveNara.toString(),
            nara: ethers.formatUnits(reserveNara, 18),
          },
        },
        safeguards: {
          minLiquidityAdded: "1",
          burnPrincipalMinOutBps: minOutBps.toString(),
          seedBurnPrincipalMinimum: formatPair(seedMin),
          compounderBurnPrincipalMinimum: formatPair(compounderMin),
          poolActiveLiquidityAtSnapshot: activeLiquidity.toString(),
          namedPositionsEqualAllActiveLiquidity: true,
          noSwap: true,
          recipientIsCustodySafe: true,
          rewardReserveCallIncluded: false,
        },
        callPlan: [
          "Vault.compoundAll(1, deadline, 0x) drains all Vault NARA/USDC into the bound Compounder.",
          "Compounder.executeRecovery() consumes the matured WindDown and sends its bank plus LP NFT to the Safe.",
          "PositionManager.modifyLiquidities(BURN_POSITION + TAKE_PAIR) burns seed NFT 2884402 and sends both currencies to the Safe.",
          "PositionManager.modifyLiquidities(BURN_POSITION + TAKE_PAIR) burns compounder NFT 2885838 and sends both currencies to the Safe.",
        ],
        simulation: {
          method: "Safe.simulateAndRevert -> canonical MultiSendCallOnly",
          exactPayloadAtSnapshot: "succeeded-and-reverted-read-only",
          response: simulation.response,
          multiSendCallOnly: MULTISEND_CALL_ONLY,
          onchainWrites: "none",
        },
        operatorWarnings: [
          "NO BROADCAST: this file was generated by read-only calls and contains no signatures.",
          "THIS BURNS BOTH HISTORICAL LP NFTS. It deliberately uses BURN_POSITION so all live liquidity is removed without hard-coding post-drain liquidity.",
          "Do not execute executeRecovery() alone. Import and execute all four calls as one Safe batch or do nothing.",
          "Do not re-run proposeRecovery(); doing so restarts the seven-day delay.",
          "Two Safe owner confirmations are required. Never paste or expose a private key.",
          "Re-simulate in Safe immediately before signing. Any state or code mismatch must abort execution.",
          "The 99% principal minimums are per currency and exclude fees. A material price/composition move causes the whole batch to revert.",
          "Recovered NARA remains NARA. This payload performs no conversion, sale, replacement deployment, or new liquidity seed.",
          "After execution, verify zero Vault/bank balances, both NFTs burned, old pool active liquidity zero, exact Safe token deltas, and the reward reserve unchanged.",
        ],
      },
    };

    const outputDir = resolve(repoRoot, "deployments");
    mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, `v4-liquidity-stack-withdrawal-batch-${block.number}.json`);
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Safe withdrawal batch written: ${outputPath}`);
    console.log(`Snapshot block: ${block.number} (${block.hash})`);
    console.log(`Deadline: ${new Date(Number(deadline) * 1_000).toISOString()}`);
    console.log(`Scoped USDC: ${ethers.formatUnits(scoped.amount1, 6)}`);
    console.log(`Scoped NARA: ${ethers.formatUnits(scoped.amount0, 18)}`);
    console.log("Exact Safe MultiSendCallOnly simulation succeeded. Nothing was signed or broadcast.");
  } finally {
    provider.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
