import { ethers } from "ethers";

export const REWARD_NOTIFIER_ROLE = ethers.id("REWARD_NOTIFIER_ROLE");
const ROLE_GRANTED_TOPIC = ethers.id("RoleGranted(bytes32,address,address)");
const ROLE_REVOKED_TOPIC = ethers.id("RoleRevoked(bytes32,address,address)");
const DEFAULT_LOG_CHUNK_BLOCKS = 9_000;
const DEFAULT_LOG_QUERY_CONCURRENCY = 1;
const DEFAULT_LOG_QUERY_ATTEMPTS = 6;

export interface RewardNotifierContainmentEvidence {
  engine: string;
  launcher: string;
  token: string;
  treasury: string;
  role: string;
  deploymentBlock: number;
  deploymentBlockHash: string;
  deploymentTransactionHash: string;
  verifiedAtBlock: number;
  verifiedAtBlockHash: string;
  historyLogCount: number;
  grantCount: number;
  revokeCount: number;
  everGrantedAccounts: string[];
  reconstructedActiveHolders: [];
  onchainActiveHolders: [];
}

interface ProductionEngineAnchor {
  engine: string;
  launcher: string;
  token: string;
  treasury: string;
  engineDeploymentBlock: bigint;
  engineDeploymentTransactionHash: string;
}

interface RoleHistoryEntry {
  kind: "grant" | "revoke";
  account: string;
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
}

function canonicalRoleLogs(logs: readonly ethers.Log[]): string {
  return JSON.stringify(logs.map((log) => ({
    address: ethers.getAddress(log.address),
    topics: log.topics.map((topic) => topic.toLowerCase()),
    data: log.data.toLowerCase(),
    blockNumber: log.blockNumber,
    blockHash: log.blockHash.toLowerCase(),
    transactionHash: log.transactionHash.toLowerCase(),
    transactionIndex: log.transactionIndex,
    logIndex: log.index,
  })));
}

export function assertRewardNotifierHistoryUnchanged(
  baseline: RewardNotifierContainmentEvidence,
  current: RewardNotifierContainmentEvidence,
  label: string,
): void {
  if (current.verifiedAtBlock < baseline.verifiedAtBlock) {
    throw new Error(`${label} reward-notifier evidence predates the deployment baseline`);
  }
  const anchoredHistory = (value: RewardNotifierContainmentEvidence) => ({
    engine: ethers.getAddress(value.engine),
    launcher: ethers.getAddress(value.launcher),
    token: ethers.getAddress(value.token),
    treasury: ethers.getAddress(value.treasury),
    role: value.role.toLowerCase(),
    deploymentBlock: value.deploymentBlock,
    deploymentBlockHash: value.deploymentBlockHash.toLowerCase(),
    deploymentTransactionHash: value.deploymentTransactionHash.toLowerCase(),
    historyLogCount: value.historyLogCount,
    grantCount: value.grantCount,
    revokeCount: value.revokeCount,
    everGrantedAccounts: value.everGrantedAccounts.map(ethers.getAddress),
    reconstructedActiveHolders: value.reconstructedActiveHolders,
    onchainActiveHolders: value.onchainActiveHolders,
  });
  if (JSON.stringify(anchoredHistory(current)) !== JSON.stringify(anchoredHistory(baseline))) {
    throw new Error(`${label} detected REWARD_NOTIFIER_ROLE history drift after the deployment baseline`);
  }
}

export function activeRewardNotifierHolders(history: readonly RoleHistoryEntry[]): string[] {
  const active = new Map<string, string>();
  for (const entry of history) {
    const account = ethers.getAddress(entry.account);
    if (entry.kind === "grant") active.set(account.toLowerCase(), account);
    else active.delete(account.toLowerCase());
  }
  return [...active.values()].sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase()));
}

function roleLogChunkSize(): number {
  const value = Number(process.env.V4_ROLE_LOG_CHUNK_BLOCKS?.trim() || DEFAULT_LOG_CHUNK_BLOCKS);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error("V4_ROLE_LOG_CHUNK_BLOCKS must be between 1 and 10000");
  }
  return value;
}

async function roleHistoryLogs(
  provider: ethers.Provider,
  engine: string,
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  const logs: ethers.Log[] = [];
  const chunkSize = roleLogChunkSize();
  const concurrency = Number(process.env.V4_ROLE_LOG_CONCURRENCY?.trim() || DEFAULT_LOG_QUERY_CONCURRENCY);
  const ranges: Array<{ fromBlock: number; toBlock: number }> = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    ranges.push({ fromBlock: start, toBlock: Math.min(toBlock, start + chunkSize - 1) });
  }
  for (let offset = 0; offset < ranges.length; offset += concurrency) {
    if (offset > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const batch = ranges.slice(offset, offset + concurrency);
    const responses = await Promise.all(batch.map(async ({ fromBlock: start, toBlock: end }) => {
      for (let attempt = 1; attempt <= DEFAULT_LOG_QUERY_ATTEMPTS; attempt += 1) {
        try {
          return await provider.getLogs({
            address: engine,
            fromBlock: start,
            toBlock: end,
            topics: [[ROLE_GRANTED_TOPIC, ROLE_REVOKED_TOPIC], REWARD_NOTIFIER_ROLE],
          });
        } catch (error: any) {
          if (attempt === DEFAULT_LOG_QUERY_ATTEMPTS) {
            throw new Error(`Base RPC could not return role history for blocks ${start}-${end}: ${error?.message ?? "unknown error"}`);
          }
          const backoff = Math.min(10_000, attempt * 1_200 + Math.floor(Math.random() * 400));
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
      throw new Error("Unreachable role-history retry state");
    }));
    for (const response of responses) logs.push(...response);
  }
  return logs.sort(
    (left, right) =>
      left.blockNumber - right.blockNumber ||
      left.transactionIndex - right.transactionIndex ||
      left.index - right.index,
  );
}

export async function readRewardNotifierContainmentEvidence(
  provider: ethers.Provider,
  production: ProductionEngineAnchor,
  verifiedAtBlock: number,
): Promise<RewardNotifierContainmentEvidence> {
  const engine = ethers.getAddress(production.engine);
  const launcher = ethers.getAddress(production.launcher);
  const token = ethers.getAddress(production.token);
  const treasury = ethers.getAddress(production.treasury);
  const deploymentBlock = Number(production.engineDeploymentBlock);
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock <= 0) {
    throw new Error("Pinned Engine deployment block is invalid");
  }
  if (!Number.isSafeInteger(verifiedAtBlock) || verifiedAtBlock < deploymentBlock) {
    throw new Error("Reward-notifier verification block predates the Engine deployment");
  }
  if (!ethers.isHexString(production.engineDeploymentTransactionHash, 32)) {
    throw new Error("Pinned Engine deployment transaction hash is invalid");
  }

  const configuredHistoryRpc = process.env.V4_POSITION_NFT_MODE === "rehearse"
    ? undefined
    : process.env.V4_ROLE_HISTORY_RPC_URL?.trim();
  const historyProvider: ethers.Provider = configuredHistoryRpc
    ? new ethers.JsonRpcProvider(configuredHistoryRpc, 8453, { staticNetwork: true })
    : provider;
  const [mainNetwork, historyNetwork] = await Promise.all([
    provider.getNetwork(),
    historyProvider.getNetwork(),
  ]);
  if (mainNetwork.chainId !== 8453n || historyNetwork.chainId !== 8453n) {
    throw new Error("Reward-notifier containment requires Base chain 8453 for both RPCs");
  }

  const [
    mainDeploymentBlock,
    historyDeploymentBlock,
    mainVerificationBlock,
    historyVerificationBlock,
    deploymentReceipt,
    deploymentTransaction,
    codeBefore,
    codeAt,
    historyLatestBlock,
  ] = await Promise.all([
    provider.getBlock(deploymentBlock),
    historyProvider.getBlock(deploymentBlock),
    provider.getBlock(verifiedAtBlock),
    historyProvider.getBlock(verifiedAtBlock),
    provider.getTransactionReceipt(production.engineDeploymentTransactionHash),
    provider.getTransaction(production.engineDeploymentTransactionHash),
    provider.getCode(engine, deploymentBlock - 1),
    provider.getCode(engine, deploymentBlock),
    historyProvider.getBlockNumber(),
  ]);
  if (historyLatestBlock < verifiedAtBlock) {
    throw new Error("Role-history RPC is behind the required verification block");
  }
  if (
    !mainDeploymentBlock?.hash ||
    !historyDeploymentBlock?.hash ||
    mainDeploymentBlock.hash.toLowerCase() !== historyDeploymentBlock.hash.toLowerCase() ||
    !mainVerificationBlock?.hash ||
    !historyVerificationBlock?.hash ||
    mainVerificationBlock.hash.toLowerCase() !== historyVerificationBlock.hash.toLowerCase()
  ) {
    throw new Error("Role-history RPC does not agree with the Base RPC at the pinned blocks");
  }
  if (
    deploymentReceipt?.status !== 1 ||
    !deploymentTransaction ||
    deploymentReceipt.blockNumber !== deploymentBlock ||
    deploymentReceipt.blockHash.toLowerCase() !== mainDeploymentBlock.hash.toLowerCase() ||
    ethers.getAddress(deploymentTransaction.to ?? ethers.ZeroAddress) !== launcher ||
    codeBefore !== "0x" ||
    codeAt === "0x"
  ) {
    throw new Error("Launcher transaction/Engine code does not anchor the complete role history");
  }
  const launchedTopic = ethers.id("Launched(address,address,address,bytes32,string,string)");
  const launchedEventFound = deploymentReceipt.logs.some(
    (log) =>
      ethers.getAddress(log.address) === launcher &&
      log.topics[0]?.toLowerCase() === launchedTopic.toLowerCase() &&
      ethers.getAddress(ethers.dataSlice(log.topics[1] ?? "0x", 12)) === token &&
      ethers.getAddress(ethers.dataSlice(log.topics[2] ?? "0x", 12)) === engine &&
      ethers.getAddress(ethers.dataSlice(log.topics[3] ?? "0x", 12)) === treasury,
  );
  const launcherContract = new ethers.Contract(
    launcher,
    [
      "function deployedToken() view returns (address)",
      "function deployedEngine() view returns (address)",
      "function launched() view returns (bool)",
    ],
    provider,
  );
  const caller = deploymentTransaction.from;
  const [launchedToken, launchedEngine, launcherFinalized] = await Promise.all([
    launcherContract.deployedToken({ blockTag: deploymentBlock, from: caller }),
    launcherContract.deployedEngine({ blockTag: deploymentBlock, from: caller }),
    launcherContract.launched({ blockTag: deploymentBlock, from: caller }),
  ]);
  if (
    !launchedEventFound ||
    ethers.getAddress(launchedToken) !== token ||
    ethers.getAddress(launchedEngine) !== engine ||
    launcherFinalized !== true
  ) {
    throw new Error("NARALauncher event/state does not anchor the canonical token/Engine deployment");
  }
  const constructorGrantFound = deploymentReceipt.logs.some(
    (log) =>
      ethers.getAddress(log.address) === engine &&
      log.topics[0]?.toLowerCase() === ROLE_GRANTED_TOPIC.toLowerCase() &&
      log.topics[1]?.toLowerCase() === REWARD_NOTIFIER_ROLE.toLowerCase(),
  );
  if (!constructorGrantFound) {
    throw new Error("Engine deployment receipt lacks the constructor REWARD_NOTIFIER_ROLE grant");
  }

  const logs = await roleHistoryLogs(historyProvider, engine, deploymentBlock, verifiedAtBlock);
  const mainProviderLogs = configuredHistoryRpc
    ? await roleHistoryLogs(provider, engine, deploymentBlock, verifiedAtBlock)
    : null;
  if (mainProviderLogs && canonicalRoleLogs(mainProviderLogs) !== canonicalRoleLogs(logs)) {
    throw new Error("Base RPCs returned different REWARD_NOTIFIER_ROLE histories");
  }
  const history: RoleHistoryEntry[] = logs.map((log) => ({
    kind: log.topics[0]?.toLowerCase() === ROLE_GRANTED_TOPIC.toLowerCase() ? "grant" : "revoke",
    account: ethers.getAddress(ethers.dataSlice(log.topics[2] ?? "0x", 12)),
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.index,
  }));
  if (history.length === 0 || history[0].kind !== "grant" || history[0].blockNumber !== deploymentBlock) {
    throw new Error("REWARD_NOTIFIER_ROLE history is not anchored by its constructor grant");
  }
  const reconstructedActive = activeRewardNotifierHolders(history);
  const everGrantedAccounts = [...new Map(
    history
      .filter((entry) => entry.kind === "grant")
      .map((entry) => {
        const account = ethers.getAddress(entry.account);
        return [account.toLowerCase(), account] as const;
      }),
  ).values()].sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase()));
  const engineContract = new ethers.Contract(
    engine,
    ["function hasRole(bytes32 role,address account) view returns (bool)"],
    provider,
  );
  const onchainActive = (
    await Promise.all(
      everGrantedAccounts.map(async (account) =>
        await engineContract.hasRole(REWARD_NOTIFIER_ROLE, account, { blockTag: verifiedAtBlock, from: caller })
          ? account
          : undefined,
      ),
    )
  ).filter((account): account is string => account !== undefined);
  if (reconstructedActive.length !== 0 || onchainActive.length !== 0) {
    throw new Error(
      `REWARD_NOTIFIER_ROLE must have no holder: reconstructed=${reconstructedActive.join(",") || "none"} ` +
      `onchain=${onchainActive.join(",") || "none"}`,
    );
  }

  return {
    engine,
    launcher,
    token,
    treasury,
    role: REWARD_NOTIFIER_ROLE,
    deploymentBlock,
    deploymentBlockHash: mainDeploymentBlock.hash,
    deploymentTransactionHash: production.engineDeploymentTransactionHash.toLowerCase(),
    verifiedAtBlock,
    verifiedAtBlockHash: mainVerificationBlock.hash,
    historyLogCount: history.length,
    grantCount: history.filter((entry) => entry.kind === "grant").length,
    revokeCount: history.filter((entry) => entry.kind === "revoke").length,
    everGrantedAccounts,
    reconstructedActiveHolders: [],
    onchainActiveHolders: [],
  };
}
