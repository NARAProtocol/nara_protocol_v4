/**
 * Prepares and read-only simulates exactly one next action for the production
 * NARA v4 Engine lifecycle smoke:
 *
 *   approve -> lock -> claim -> unlock
 *
 * This script never loads a private key, signs, or broadcasts. The human test
 * wallet submits each decoded action independently after review.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
  requiredBaseRpcUrl,
  type ProductionV4Deployment,
} from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const BASE_CHAIN_ID = 8453n;
const NARA_DECIMALS = 18;
const WAD = 10n ** 18n;
const MAX_SMOKE_AMOUNT = WAD;
const MAX_JIT_SAFE_BACKLOG = 7n;
const GAS_MARGIN_BPS = 12_000n;
const BPS_DENOMINATOR = 10_000n;

export type LifecycleOptions = {
  wallet: string;
  amount: bigint;
  positionId?: bigint;
  lockTxHash?: string;
};

export type WeightConfig = {
  durationLinearWad: bigint;
  durationQuadraticWad: bigint;
  activationDelayEpochs: bigint;
  maxLockEpochs: bigint;
};

export type LockTerms = {
  grossAmount: bigint;
  tokenFee: bigint;
  netAmount: bigint;
  durationEpochs: bigint;
  minWeight: bigint;
  createdEpoch: bigint;
  activationEpoch: bigint;
  unlockEpoch: bigint;
};

type PreparedAction = {
  kind: "approve" | "lock" | "revoke" | "claim" | "unlock";
  target: string;
  value: bigint;
  data: string;
  method: string;
  args: Record<string, string>;
  basescanWriteUrl: string;
};

type ActionSimulation = PreparedAction & {
  simulation: "PASS";
  estimatedGas: bigint;
  gasLimitWithMargin: bigint;
  maxFeePerGas: bigint;
  estimatedMaxGasCost: bigint;
  requiredEth: bigint;
};

type EngineSnapshot = {
  blockNumber: number;
  blockTimestamp: number;
  currentEpoch: bigint;
  settledEpoch: bigint;
  backlog: bigint;
  epochLength: bigint;
  lockFeeBps: bigint;
  claimFeeBps: bigint;
  lockFeeWei: bigint;
  unlockFeeWei: bigint;
  pendingConfigTimestamp: bigint;
  stagedConfigEpoch: bigint;
  nextPositionId: bigint;
  weightConfig: WeightConfig;
};

function artifactAbi(relativePath: string): ethers.InterfaceAbi {
  const artifact = JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8")) as { abi?: unknown };
  if (!Array.isArray(artifact.abi)) throw new Error(`Generated ABI is missing: ${relativePath}`);
  return artifact.abi as ethers.InterfaceAbi;
}

function valueAfter(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

export function parseLifecycleArgs(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): LifecycleOptions {
  let wallet = environment.V4_ENGINE_LIFECYCLE_WALLET_ADDRESS?.trim();
  let amountText = "1";
  let positionId: bigint | undefined;
  let lockTxHash: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--wallet") {
      wallet = valueAfter(args, index, option);
      index += 1;
    } else if (option === "--amount") {
      amountText = valueAfter(args, index, option);
      index += 1;
    } else if (option === "--position-id") {
      const raw = valueAfter(args, index, option);
      if (!/^\d+$/.test(raw) || BigInt(raw) === 0n) throw new Error("--position-id must be a positive integer");
      positionId = BigInt(raw);
      index += 1;
    } else if (option === "--lock-tx") {
      const raw = valueAfter(args, index, option);
      if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new Error("--lock-tx must be a 32-byte transaction hash");
      lockTxHash = raw.toLowerCase();
      index += 1;
    } else if (option === "--execute" || option === "--broadcast") {
      throw new Error("This script never signs or broadcasts; submit the reviewed action from the human wallet");
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }

  if (!wallet) {
    throw new Error(
      "Missing --wallet (or V4_ENGINE_LIFECYCLE_WALLET_ADDRESS). Use a dedicated human-controlled test EOA, not the epoch keeper or Safe.",
    );
  }
  if (positionId !== undefined && lockTxHash !== undefined) {
    throw new Error("Use either --position-id or --lock-tx, not both");
  }

  let amount: bigint;
  try {
    amount = ethers.parseUnits(amountText, NARA_DECIMALS);
  } catch {
    throw new Error("--amount must be a decimal NARA amount with at most 18 decimals");
  }
  if (amount <= 0n || amount > MAX_SMOKE_AMOUNT) {
    throw new Error("Lifecycle smoke amount must be greater than 0 and no more than 1 NARA");
  }

  return {
    wallet: ethers.getAddress(wallet),
    amount,
    positionId,
    lockTxHash,
  };
}

function mulDivDown(value: bigint, multiplier: bigint, denominator: bigint): bigint {
  return (value * multiplier) / denominator;
}

export function computeWeight(config: WeightConfig, netAmount: bigint, durationEpochs: bigint): bigint {
  if (config.maxLockEpochs <= 0n) throw new Error("maxLockEpochs must be positive");
  const ratioWad = mulDivDown(durationEpochs, WAD, config.maxLockEpochs);
  const ratioSquaredWad = mulDivDown(ratioWad, ratioWad, WAD);
  const multiplierWad = WAD
    + mulDivDown(config.durationLinearWad, ratioWad, WAD)
    + mulDivDown(config.durationQuadraticWad, ratioSquaredWad, WAD);
  return mulDivDown(netAmount, multiplierWad, WAD);
}

export function buildLockTerms(
  config: WeightConfig,
  grossAmount: bigint,
  lockFeeBps: bigint,
  createdEpoch: bigint,
): LockTerms {
  const durationEpochs = config.activationDelayEpochs + 1n;
  if (durationEpochs > config.maxLockEpochs) throw new Error("Shortest lifecycle duration exceeds maxLockEpochs");
  const tokenFee = mulDivDown(grossAmount, lockFeeBps, BPS_DENOMINATOR);
  const netAmount = grossAmount - tokenFee;
  if (netAmount <= 0n) throw new Error("Lock fee consumes the lifecycle smoke amount");
  const minWeight = computeWeight(config, netAmount, durationEpochs);
  if (minWeight <= 0n) throw new Error("Lifecycle smoke would create zero position weight");
  return {
    grossAmount,
    tokenFee,
    netAmount,
    durationEpochs,
    minWeight,
    createdEpoch,
    activationEpoch: createdEpoch + config.activationDelayEpochs + 1n,
    unlockEpoch: createdEpoch + durationEpochs + 1n,
  };
}

function formatNara(value: bigint): string {
  return ethers.formatUnits(value, NARA_DECIMALS);
}

function formatEth(value: bigint): string {
  return ethers.formatEther(value);
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)]));
  }
  return value;
}

function knownForbiddenWallet(
  wallet: string,
  deployment: ProductionV4Deployment,
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const forbidden = new Map<string, string>([
    [deployment.safe.toLowerCase(), "custody Safe"],
    [deployment.admin.toLowerCase(), "production admin"],
    [deployment.treasury.toLowerCase(), "treasury"],
    [deployment.rewardReserve.toLowerCase(), "reward reserve"],
    [deployment.engine.toLowerCase(), "Engine contract"],
    [deployment.token.toLowerCase(), "NARA token contract"],
    [deployment.hook.toLowerCase(), "liquidity Hook"],
    [deployment.vault.toLowerCase(), "liquidity Vault"],
    [deployment.compounder.toLowerCase(), "liquidity Compounder"],
  ]);
  const configuredKeeper = environment.V4_EPOCH_KEEPER_ADDRESS?.trim();
  if (configuredKeeper && ethers.isAddress(configuredKeeper)) {
    forbidden.set(ethers.getAddress(configuredKeeper).toLowerCase(), "dedicated epoch keeper");
  }
  return forbidden.get(wallet.toLowerCase());
}

async function readSnapshot(
  provider: ethers.Provider,
  engine: ethers.Contract,
): Promise<EngineSnapshot> {
  const block = await provider.getBlock("latest");
  if (!block) throw new Error("Latest Base block is unavailable");
  const blockTag = block.number;
  const [currentEpoch, epochState, epochLength, lockFeeBps, claimFeeBps, lockFeeWei, unlockFeeWei,
    pendingConfigTimestamp, stagedConfigEpoch, nextPositionId, config] = await Promise.all([
    engine.currentEpoch({ blockTag }) as Promise<bigint>,
    engine.epochState({ blockTag }) as Promise<{ epoch: bigint }>,
    engine.EPOCH_LENGTH({ blockTag }) as Promise<bigint>,
    engine.lockFeeBps({ blockTag }) as Promise<bigint>,
    engine.claimFeeBps({ blockTag }) as Promise<bigint>,
    engine.lockFeeWei({ blockTag }) as Promise<bigint>,
    engine.unlockFeeWei({ blockTag }) as Promise<bigint>,
    engine.pendingConfigTimestamp({ blockTag }) as Promise<bigint>,
    engine.stagedConfigEpoch({ blockTag }) as Promise<bigint>,
    engine.nextPositionId({ blockTag }) as Promise<bigint>,
    engine.config({ blockTag }) as Promise<Record<string, bigint>>,
  ]);
  const settledEpoch = epochState.epoch;
  if (settledEpoch > currentEpoch) throw new Error("Engine settled epoch is ahead of its clock");
  return {
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
    currentEpoch,
    settledEpoch,
    backlog: currentEpoch - settledEpoch,
    epochLength,
    lockFeeBps,
    claimFeeBps,
    lockFeeWei,
    unlockFeeWei,
    pendingConfigTimestamp,
    stagedConfigEpoch,
    nextPositionId,
    weightConfig: {
      durationLinearWad: config.durationLinearWad,
      durationQuadraticWad: config.durationQuadraticWad,
      activationDelayEpochs: config.activationDelayEpochs,
      maxLockEpochs: config.maxLockEpochs,
    },
  };
}

async function simulateAction(
  provider: ethers.Provider,
  wallet: string,
  action: PreparedAction,
): Promise<ActionSimulation> {
  const request = { from: wallet, to: action.target, value: action.value, data: action.data };
  await provider.call(request);
  const estimatedGas = await provider.estimateGas(request);
  const gasLimitWithMargin = mulDivDown(estimatedGas, GAS_MARGIN_BPS, BPS_DENOMINATOR);
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (maxFeePerGas === null) throw new Error("Base fee data is unavailable");
  const estimatedMaxGasCost = gasLimitWithMargin * maxFeePerGas;
  return {
    ...action,
    simulation: "PASS",
    estimatedGas,
    gasLimitWithMargin,
    maxFeePerGas,
    estimatedMaxGasCost,
    requiredEth: action.value + estimatedMaxGasCost,
  };
}

async function positionIdFromLockTransaction(
  provider: ethers.Provider,
  engineAddress: string,
  engineInterface: ethers.Interface,
  wallet: string,
  txHash: string,
  expectedTerms: LockTerms,
  expectedLockFeeWei: bigint,
): Promise<bigint> {
  const [transaction, receipt] = await Promise.all([
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash),
  ]);
  if (!transaction || !receipt) throw new Error("Lock transaction or receipt is not available");
  if (receipt.status !== 1) throw new Error("Lock transaction did not succeed");
  if (ethers.getAddress(transaction.from) !== wallet) throw new Error("Lock transaction sender is not the lifecycle wallet");
  if (!transaction.to || ethers.getAddress(transaction.to) !== engineAddress) {
    throw new Error("Lock transaction target is not the production Engine");
  }
  const decoded = engineInterface.parseTransaction({ data: transaction.data, value: transaction.value });
  if (!decoded || decoded.name !== "lock") throw new Error("Transaction is not Engine.lock");
  const [amount, durationEpochs, minWeight] = decoded.args as unknown as [bigint, bigint, bigint];
  if (amount !== expectedTerms.grossAmount
    || durationEpochs !== expectedTerms.durationEpochs
    || minWeight !== expectedTerms.minWeight
    || transaction.value !== expectedLockFeeWei) {
    throw new Error("Lock transaction parameters do not match the bounded lifecycle plan");
  }

  const locked = receipt.logs
    .filter((log) => log.address.toLowerCase() === engineAddress.toLowerCase())
    .map((log) => {
      try { return engineInterface.parseLog(log); } catch { return null; }
    })
    .filter((log) => log?.name === "Locked");
  if (locked.length !== 1 || !locked[0]) throw new Error("Lock receipt must contain exactly one Engine Locked event");
  const owner = ethers.getAddress(locked[0].args.owner as string);
  if (owner !== wallet) throw new Error("Locked position owner is not the lifecycle wallet");
  return locked[0].args.positionId as bigint;
}

function actionOutput(action: ActionSimulation, walletEthBalance: bigint) {
  return {
    kind: action.kind,
    submitFrom: "human wallet only",
    walletMustEqual: undefined,
    target: action.target,
    valueWei: action.value,
    valueEth: formatEth(action.value),
    calldata: action.data,
    method: action.method,
    args: action.args,
    basescanWriteUrl: action.basescanWriteUrl,
    simulation: action.simulation,
    estimatedGas: action.estimatedGas,
    suggestedGasLimit: action.gasLimitWithMargin,
    estimatedMaxGasCostWei: action.estimatedMaxGasCost,
    estimatedMaxGasCostEth: formatEth(action.estimatedMaxGasCost),
    requiredEthWei: action.requiredEth,
    walletEthBalanceWei: walletEthBalance,
    readyToSubmit: walletEthBalance >= action.requiredEth,
    blocker: walletEthBalance >= action.requiredEth
      ? null
      : `Fund the lifecycle wallet with at least ${formatEth(action.requiredEth - walletEthBalance)} more Base ETH`,
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseLifecycleArgs(args);
  const config = currentV4Config();
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, Number(BASE_CHAIN_ID), {
    staticNetwork: true,
    batchMaxCount: 1,
  });

  try {
    const deployment = await assertProductionV4Runtime(provider, config);
    const forbiddenRole = knownForbiddenWallet(options.wallet, deployment, process.env);
    if (forbiddenRole) throw new Error(`Lifecycle wallet must be independent; received the ${forbiddenRole}`);
    if ((await provider.getCode(options.wallet)) !== "0x") {
      throw new Error("Lifecycle wallet must be a human-controlled EOA with no deployed contract code");
    }

    const engineInterface = new ethers.Interface(artifactAbi(
      "artifacts/contracts/v4/NARAEngine.sol/NARAEngine.json",
    ));
    const tokenInterface = new ethers.Interface(artifactAbi(
      "artifacts/contracts/v4/NARAToken.sol/NARAToken.json",
    ));
    const engine = new ethers.Contract(deployment.engine, engineInterface, provider);
    const token = new ethers.Contract(deployment.token, tokenInterface, provider);
    const actualNara = ethers.getAddress(await engine.NARA() as string);
    if (actualNara !== deployment.token) {
      throw new Error(`Engine NARA mismatch: expected ${deployment.token}, received ${actualNara}`);
    }
    const engineRoles = {
      defaultAdmin: await engine.hasRole(await engine.DEFAULT_ADMIN_ROLE(), options.wallet) as boolean,
      parameter: await engine.hasRole(await engine.PARAM_ROLE(), options.wallet) as boolean,
      treasury: await engine.hasRole(await engine.TREASURY_ROLE(), options.wallet) as boolean,
      rewardNotifier: await engine.hasRole(
        ethers.keccak256(ethers.toUtf8Bytes("REWARD_NOTIFIER_ROLE")),
        options.wallet,
      ) as boolean,
    };
    const activeEngineRoles = Object.entries(engineRoles).filter(([, active]) => active).map(([role]) => role);
    if (activeEngineRoles.length > 0) {
      throw new Error(`Lifecycle wallet retains Engine roles: ${activeEngineRoles.join(", ")}`);
    }

    const snapshot = await readSnapshot(provider, engine);
    if (snapshot.pendingConfigTimestamp !== 0n || snapshot.stagedConfigEpoch !== 0n) {
      throw new Error("Engine configuration update is pending or staged; lifecycle smoke must wait for stable configuration");
    }
    if (snapshot.backlog > MAX_JIT_SAFE_BACKLOG) {
      throw new Error(
        `Engine backlog ${snapshot.backlog} is too close to or above the eight-epoch JIT limit; wait for epoch maintenance`,
      );
    }

    const terms = buildLockTerms(
      snapshot.weightConfig,
      options.amount,
      snapshot.lockFeeBps,
      snapshot.currentEpoch,
    );
    const [walletNaraBalance, walletEthBalance, allowance] = await Promise.all([
      token.balanceOf(options.wallet) as Promise<bigint>,
      provider.getBalance(options.wallet),
      token.allowance(options.wallet, deployment.engine) as Promise<bigint>,
    ]);

    let positionId = options.positionId;
    if (options.lockTxHash) {
      positionId = await positionIdFromLockTransaction(
        provider,
        deployment.engine,
        engineInterface,
        options.wallet,
        options.lockTxHash,
        terms,
        snapshot.lockFeeWei,
      );
    }

    const report: Record<string, unknown> = {
      mode: "read-only; never signs or broadcasts",
      runtimeGuard: productionV4RuntimeBanner(deployment),
      snapshot: {
        blockNumber: snapshot.blockNumber,
        blockTimeUtc: new Date(snapshot.blockTimestamp * 1000).toISOString(),
        currentEpoch: snapshot.currentEpoch,
        settledEpoch: snapshot.settledEpoch,
        backlog: snapshot.backlog,
        epochLengthSeconds: snapshot.epochLength,
        activationDelayEpochs: snapshot.weightConfig.activationDelayEpochs,
      },
      contracts: { token: deployment.token, engine: deployment.engine },
      wallet: {
        address: options.wallet,
        engineRoles,
        naraBalance: formatNara(walletNaraBalance),
        ethBalance: formatEth(walletEthBalance),
        currentEngineAllowance: formatNara(allowance),
      },
      fees: {
        lockTokenFeeBps: snapshot.lockFeeBps,
        claimEthFeeBps: snapshot.claimFeeBps,
        lockFlatFeeWei: snapshot.lockFeeWei,
        lockFlatFeeEth: formatEth(snapshot.lockFeeWei),
        unlockFlatFeeWei: snapshot.unlockFeeWei,
        unlockFlatFeeEth: formatEth(snapshot.unlockFeeWei),
      },
      boundedLockPlan: {
        grossNara: formatNara(terms.grossAmount),
        tokenFeeNara: formatNara(terms.tokenFee),
        netLockedNara: formatNara(terms.netAmount),
        durationEpochs: terms.durationEpochs,
        minWeight: terms.minWeight,
        predictedPositionIdAtSnapshot: snapshot.nextPositionId,
        predictedCreatedEpoch: terms.createdEpoch,
        predictedActivationEpoch: terms.activationEpoch,
        predictedUnlockEpoch: terms.unlockEpoch,
        approximateMinutesToActivation: (terms.activationEpoch - terms.createdEpoch) * snapshot.epochLength / 60n,
        approximateMinutesToUnlock: (terms.unlockEpoch - terms.createdEpoch) * snapshot.epochLength / 60n,
      },
    };

    if (positionId === undefined) {
      if (walletNaraBalance < options.amount) {
        report.nextAction = {
          kind: "fund-nara",
          readyToSubmit: false,
          requiredNara: formatNara(options.amount - walletNaraBalance),
          blocker: "Transfer only the missing NARA amount to the independent lifecycle wallet, then rerun this script",
        };
      } else if (allowance < options.amount) {
        const action = await simulateAction(provider, options.wallet, {
          kind: "approve",
          target: deployment.token,
          value: 0n,
          data: tokenInterface.encodeFunctionData("approve", [deployment.engine, options.amount]),
          method: "approve(address spender,uint256 amount)",
          args: { spender: deployment.engine, amountRaw: options.amount.toString() },
          basescanWriteUrl: `https://basescan.org/address/${deployment.token}#writeContract`,
        });
        report.nextAction = { ...actionOutput(action, walletEthBalance), walletMustEqual: options.wallet };
      } else {
        const action = await simulateAction(provider, options.wallet, {
          kind: "lock",
          target: deployment.engine,
          value: snapshot.lockFeeWei,
          data: engineInterface.encodeFunctionData("lock", [
            terms.grossAmount,
            terms.durationEpochs,
            terms.minWeight,
          ]),
          method: "lock(uint256 amount,uint64 durationEpochs,uint256 minWeight)",
          args: {
            amountRaw: terms.grossAmount.toString(),
            durationEpochs: terms.durationEpochs.toString(),
            minWeight: terms.minWeight.toString(),
          },
          basescanWriteUrl: `https://basescan.org/address/${deployment.engine}#writeContract`,
        });
        report.nextAction = { ...actionOutput(action, walletEthBalance), walletMustEqual: options.wallet };
      }
    } else {
      const position = await engine.positionOf(positionId) as Record<string, bigint | string>;
      const owner = ethers.getAddress(position.owner as string);
      if (owner !== options.wallet) throw new Error(`Position ${positionId} is not owned by the lifecycle wallet`);
      const amount = position.amount as bigint;
      const activationEpoch = position.activationEpoch as bigint;
      const unlockEpoch = position.unlockEpoch as bigint;
      const [claimableNara, claimableEth] = await engine.claimableRewards(positionId) as [bigint, bigint];
      report.position = {
        positionId,
        owner,
        amountNara: formatNara(amount),
        weight: position.weight,
        activationEpoch,
        unlockEpoch,
        claimableNara: formatNara(claimableNara),
        claimableEth: formatEth(claimableEth),
      };

      if (allowance > 0n) {
        const action = await simulateAction(provider, options.wallet, {
          kind: "revoke",
          target: deployment.token,
          value: 0n,
          data: tokenInterface.encodeFunctionData("approve", [deployment.engine, 0n]),
          method: "approve(address spender,uint256 amount)",
          args: { spender: deployment.engine, amountRaw: "0" },
          basescanWriteUrl: `https://basescan.org/address/${deployment.token}#writeContract`,
        });
        report.nextAction = { ...actionOutput(action, walletEthBalance), walletMustEqual: options.wallet };
      } else if (amount === 0n) {
        report.nextAction = { kind: "complete", readyToSubmit: false, message: "Position is unlocked and closed" };
      } else if (snapshot.settledEpoch < activationEpoch) {
        report.nextAction = {
          kind: "wait-for-activation",
          readyToSubmit: false,
          epochsRemaining: activationEpoch - snapshot.settledEpoch,
          message: "No transaction is needed; rerun after the epoch maintainer settles the activation epoch",
        };
      } else if (claimableNara > 0n || claimableEth > 0n) {
        const action = await simulateAction(provider, options.wallet, {
          kind: "claim",
          target: deployment.engine,
          value: 0n,
          data: engineInterface.encodeFunctionData("claimRewards", [positionId, options.wallet]),
          method: "claimRewards(uint256 positionId,address to)",
          args: { positionId: positionId.toString(), to: options.wallet },
          basescanWriteUrl: `https://basescan.org/address/${deployment.engine}#writeContract`,
        });
        report.nextAction = { ...actionOutput(action, walletEthBalance), walletMustEqual: options.wallet };
      } else if (snapshot.settledEpoch < unlockEpoch) {
        report.nextAction = {
          kind: "wait-for-reward-or-unlock",
          readyToSubmit: false,
          epochsUntilUnlock: unlockEpoch - snapshot.settledEpoch,
          message: "No transaction is needed; rerun after another settled epoch",
        };
      } else {
        const action = await simulateAction(provider, options.wallet, {
          kind: "unlock",
          target: deployment.engine,
          value: snapshot.unlockFeeWei,
          data: engineInterface.encodeFunctionData("unlock", [positionId]),
          method: "unlock(uint256 positionId)",
          args: { positionId: positionId.toString() },
          basescanWriteUrl: `https://basescan.org/address/${deployment.engine}#writeContract`,
        });
        report.nextAction = { ...actionOutput(action, walletEthBalance), walletMustEqual: options.wallet };
      }
    }

    console.log(JSON.stringify(jsonSafe(report), null, 2));
  } finally {
    provider.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
