import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import {
  BASE_PERMIT2,
  BASE_POSITION_MANAGER,
  BASE_POOL_MANAGER,
  BASE_UNIVERSAL_ROUTER,
  BASE_USDC,
  DEFAULT_V4_ENGINE,
  DEFAULT_V4_HOOK,
  DEFAULT_V4_LP_TOKEN_ID,
  DEFAULT_V4_NARA,
  DEFAULT_V4_POOL_ID,
  DEFAULT_V4_VAULT,
  QUARANTINED_STAGE_A_HOOK,
  QUARANTINED_STAGE_A_POOL_ID,
  assertCanonicalV4PoolConfig,
} from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const deploymentsDir = resolve(repoRoot, "deployments");

type JsonObject = Record<string, unknown>;

type RetiredValues = Map<string, Set<string>>;

const HISTORICAL_MANIFEST_PATTERN =
  /(?:v4-liquidity-replacement|controlled-stage-a|v4-pool-redeploy)/i;
const HISTORICAL_STATE_PATTERN =
  /(?:quarantin|retir|histor|incident|recover|wind[- ]?down|withdraw|stage[- ]?a|replacement)/i;

function normalized(value: string): string {
  return value.toLowerCase();
}

function knownRetiredValues(): RetiredValues {
  return new Map<string, Set<string>>([
    ["V4_NARA_TOKEN", new Set([
      normalized(DEFAULT_V4_NARA),
      normalized("0x65E247AA3aa9C0131b2984b894c3D24c41341D7A"),
    ])],
    ["V4_ENGINE", new Set([
      normalized(DEFAULT_V4_ENGINE),
      normalized("0xbC2492BA73dE35d1114b5c18d7db633aca8963c9"),
    ])],
    ["V4_HOOK", new Set([
      normalized(DEFAULT_V4_HOOK),
      normalized(QUARANTINED_STAGE_A_HOOK),
      normalized("0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088"),
    ])],
    ["V4_VAULT", new Set([
      normalized(DEFAULT_V4_VAULT),
      normalized("0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d"),
    ])],
    ["V4_COMPOUNDER", new Set([
      normalized("0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98"),
    ])],
    ["V4_POOL_ID", new Set([
      normalized(DEFAULT_V4_POOL_ID),
      normalized(QUARANTINED_STAGE_A_POOL_ID),
      normalized("0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318"),
    ])],
    ["V4_LP_TOKEN_ID", new Set([DEFAULT_V4_LP_TOKEN_ID.toString()])],
  ]);
}

function addRetiredValue(values: RetiredValues, key: string, value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return;
  const bucket = values.get(key) ?? new Set<string>();
  bucket.add(normalized(value.trim()));
  values.set(key, bucket);
}

export function collectHistoricalManifestValues(directory = deploymentsDir): RetiredValues {
  const values = knownRetiredValues();
  if (!existsSync(directory)) return values;

  for (const name of readdirSync(directory).filter((entry) => HISTORICAL_MANIFEST_PATTERN.test(entry))) {
    const path = resolve(directory, name);
    if (!statSync(path).isFile() || !name.endsWith(".json")) continue;
    const manifest = readJsonFile(path);
    addRetiredValue(values, "V4_NARA_TOKEN", manifest.token);
    addRetiredValue(values, "V4_ENGINE", manifest.engine);
    addRetiredValue(values, "V4_HOOK", manifest.hook);
    addRetiredValue(values, "V4_VAULT", manifest.vault);
    addRetiredValue(values, "V4_POOL_ID", manifest.poolId);
    addRetiredValue(values, "V4_LP_TOKEN_ID", manifest.lpTokenId);
    addRetiredValue(values, "V4_COMPOUNDER", manifest.compounder);
    addRetiredValue(values, "V4_REWARD_RESERVE", manifest.rewardReserve);
  }

  return values;
}

function readArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === name) return args[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

export function latestDeploymentFile(directory = deploymentsDir): string {
  const canonical = resolve(directory, "v4-base-usdc-latest.json");
  if (existsSync(canonical)) return canonical;

  if (!existsSync(directory)) {
    throw new Error("No deployments directory found. Run npm run deploy:v4:base:usdc first.");
  }

  const candidates = readdirSync(directory)
    .filter((name) => /^v4-base-usdc-.*\.json$/.test(name) && name !== "v4-base-usdc-latest.json")
    .map((name) => resolve(directory, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (candidates.length === 0) {
    throw new Error("No v4-base-usdc deployment log found. Run npm run deploy:v4:base:usdc first.");
  }

  return candidates[0];
}

export function readJsonFile(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function stringField(source: JsonObject, name: string): string {
  const value = source[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Deployment log is missing string field: ${name}`);
  }
  return value.trim();
}

function numberField(source: JsonObject, name: string, fallback?: number): number {
  const value = source[name];
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isInteger(Number(value))) return Number(value);
  if (fallback !== undefined) return fallback;
  throw new Error(`Deployment log is missing integer field: ${name}`);
}

function optionalStringField(source: JsonObject, name: string): string | undefined {
  const value = source[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function objectField(source: JsonObject, name: string): JsonObject | undefined {
  const value = source[name];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function firstOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function optionalNonNegativeInteger(name: string, ...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`Deployment log has invalid non-negative integer field: ${name}`);
    }
    return parsed.toString();
  }
  return undefined;
}

function checkedAddress(name: string, value: string): string {
  try {
    return ethers.getAddress(value);
  } catch {
    throw new Error(`Deployment log has invalid address field: ${name}`);
  }
}

function checkedHash(name: string, value: string): string {
  if (!ethers.isHexString(value, 32)) {
    throw new Error(`Deployment log has invalid bytes32 field: ${name}`);
  }
  return value.toLowerCase();
}

function setOptionalAddress(entries: Record<string, string>, key: string, value: string | undefined) {
  if (value !== undefined) entries[key] = checkedAddress(key, value);
}

function setOptionalHash(entries: Record<string, string>, key: string, value: string | undefined) {
  if (value !== undefined) entries[key] = checkedHash(key, value);
}

export function latestSeedLpTokenId(
  deployment: JsonObject,
  directory = deploymentsDir,
): string | undefined {
  const canonical = resolve(directory, "v4-liquidity-seed-latest.json");
  if (!existsSync(canonical)) return undefined;
  const seed = readJsonFile(canonical);
  const linkedFields = ["token", "hook", "vault", "engine", "poolId"] as const;
  for (const field of linkedFields) {
    const expected = optionalStringField(deployment, field);
    const actual = optionalStringField(seed, field);
    if (expected === undefined || actual === undefined || normalized(expected) !== normalized(actual)) {
      throw new Error(
        `Refusing LP token ID from a seed manifest that does not match the fresh core field: ${field}`,
      );
    }
  }
  if (numberField(seed, "chainId") !== numberField(deployment, "chainId")) {
    throw new Error("Refusing LP token ID from a seed manifest on a different chain.");
  }
  return optionalStringField(seed, "lpTokenId");
}

function envLine(key: string, value: string): string {
  return `${key}=${value}`;
}

function upsertEnvFile(path: string, entries: Record<string, string>) {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;

    const key = match[1];
    if (!(key in entries)) return line;

    seen.add(key);
    return envLine(key, entries[key]);
  });

  const missing = Object.entries(entries)
    .filter(([key]) => !seen.has(key))
    .map(([key, value]) => envLine(key, value));

  if (missing.length > 0) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
    nextLines.push("# Fresh V4 launch config");
    nextLines.push(...missing);
  }

  writeFileSync(path, `${nextLines.join("\n").replace(/\n+$/, "")}\n`);
}

export function validateFresh(
  deployment: JsonObject,
  entries: Record<string, string>,
  sourcePath: string,
  retiredValues = collectHistoricalManifestValues(),
) {
  if (HISTORICAL_MANIFEST_PATTERN.test(basename(sourcePath))) {
    throw new Error("Refusing to generate fresh V4 config from a historical liquidity/recovery manifest.");
  }
  if (numberField(deployment, "chainId") !== 8453) {
    throw new Error("Fresh V4 launch manifests must target Base mainnet chainId 8453.");
  }
  if (deployment.replacementLiquidityTrioRequired === true) {
    throw new Error("Refusing to generate fresh V4 config from a manifest that requires replacement liquidity.");
  }
  for (const key of ["mode", "activationState", "liquidityStackStatus", "status", "snapshotSemantics"]) {
    const value = optionalStringField(deployment, key);
    if (value !== undefined && HISTORICAL_STATE_PATTERN.test(value)) {
      throw new Error(`Refusing historical/quarantined deployment state in ${key}.`);
    }
  }
  if (deployment.replacementLiquidityTrioDeployed === true || objectField(deployment, "replacementTrio")) {
    throw new Error("Refusing a replacement-liquidity incident manifest as a fresh full-v4 origin.");
  }

  for (const [key, expected] of [
    ["V4_BASE_TOKEN", BASE_USDC],
    ["V4_POOL_MANAGER", BASE_POOL_MANAGER],
    ["V4_POSITION_MANAGER", BASE_POSITION_MANAGER],
    ["V4_PERMIT2", BASE_PERMIT2],
    ["V4_UNIVERSAL_ROUTER", BASE_UNIVERSAL_ROUTER],
  ] as const) {
    if (ethers.getAddress(entries[key]) !== ethers.getAddress(expected)) {
      throw new Error(`${key} is not the canonical Base deployment.`);
    }
  }

  for (const requiredEvidence of [
    "V4_ADMIN_ADDRESS",
    "V4_SAFE",
    "V4_DEPLOYER",
    "V4_TREASURY_ADDRESS",
    "V4_REWARD_RESERVE",
    "V4_ENGINE_DEPLOYMENT_BLOCK",
    "V4_ENGINE_DEPLOYMENT_TX_HASH",
    "V4_SAFE_CODEHASH",
    "V4_RELEASE_COMMIT",
  ]) {
    if (!entries[requiredEvidence]) {
      throw new Error(`Fresh V4 origin is missing required evidence: ${requiredEvidence}`);
    }
  }
  if (entries.V4_ADMIN_ADDRESS !== entries.V4_SAFE) {
    throw new Error("Fresh V4 final admin and custody Safe must match.");
  }

  const retiredHits = Object.entries(entries)
    .filter(([key, value]) => retiredValues.get(key)?.has(normalized(value)))
    .map(([key]) => key);

  if (retiredHits.length > 0) {
    throw new Error(
      `Refusing to generate fresh V4 config from retired incident-stack value(s): ${retiredHits.join(", ")}. ` +
      "Run a fresh full-v4 deploy first; this launch sync has no recovery bypass.",
    );
  }
}

export function buildFreshEnvEntries(
  deployment: JsonObject,
  lpTokenId: string,
): Record<string, string> {
  const poolKey = (deployment.poolKey ?? {}) as JsonObject;
  const token = checkedAddress("token", stringField(deployment, "token"));
  const engine = checkedAddress("engine", stringField(deployment, "engine"));
  const hook = checkedAddress("hook", stringField(deployment, "hook"));
  const vault = checkedAddress("vault", stringField(deployment, "vault"));
  const base = checkedAddress("usdc", optionalStringField(deployment, "usdc") ?? BASE_USDC);
  const fee = numberField(deployment, "poolFee", numberField(poolKey, "fee", 3000));
  const tickSpacing = numberField(deployment, "tickSpacing", numberField(poolKey, "tickSpacing", 60));
  const poolId = stringField(deployment, "poolId").toLowerCase();

  assertCanonicalV4PoolConfig({ token, base, hook, fee, tickSpacing, poolId });

  const entries: Record<string, string> = {
    V4_NARA_TOKEN: token,
    V4_ENGINE: engine,
    V4_HOOK: hook,
    V4_VAULT: vault,
    V4_POOL_ID: poolId,
    V4_LP_TOKEN_ID: BigInt(lpTokenId).toString(),
    V4_POOL_FEE: fee.toString(),
    V4_TICK_SPACING: tickSpacing.toString(),
    V4_BASE_TOKEN: base,
    V4_POOL_MANAGER: checkedAddress(
      "poolManager",
      optionalStringField(deployment, "poolManager") ?? BASE_POOL_MANAGER,
    ),
    V4_POSITION_MANAGER: checkedAddress(
      "positionManager",
      optionalStringField(deployment, "positionManager") ?? BASE_POSITION_MANAGER,
    ),
    V4_PERMIT2: checkedAddress("permit2", optionalStringField(deployment, "permit2") ?? BASE_PERMIT2),
    V4_UNIVERSAL_ROUTER: checkedAddress(
      "universalRouter",
      optionalStringField(deployment, "universalRouter") ?? BASE_UNIVERSAL_ROUTER,
    ),
  };

  const finalAdmin = optionalStringField(deployment, "finalAdmin");
  const safe = firstOptionalString(deployment.custodySafe, deployment.safe, finalAdmin);
  setOptionalAddress(entries, "V4_ADMIN_ADDRESS", finalAdmin);
  setOptionalAddress(entries, "V4_SAFE", safe);
  setOptionalAddress(entries, "V4_DEPLOYER", optionalStringField(deployment, "deployer"));
  setOptionalAddress(entries, "V4_TREASURY_ADDRESS", optionalStringField(deployment, "treasury"));
  setOptionalAddress(entries, "V4_REWARD_RESERVE", optionalStringField(deployment, "rewardReserve"));
  setOptionalAddress(entries, "V4_LAUNCHER", optionalStringField(deployment, "launcher"));
  setOptionalAddress(
    entries,
    "V4_CREATE2_HOOK_DEPLOYER",
    optionalStringField(deployment, "create2HookDeployer"),
  );

  const compounder = optionalStringField(deployment, "compounder");
  setOptionalAddress(entries, "V4_COMPOUNDER", compounder);
  setOptionalAddress(entries, "V4_COMPOUNDER_ADDRESS", compounder);
  const compoundKeeper = firstOptionalString(
    deployment.compoundKeeper,
    objectField(deployment, "compoundKeeper")?.address,
  );
  setOptionalAddress(entries, "V4_COMPOUND_KEEPER_ADDRESS", compoundKeeper);

  const transactionEvidence = objectField(deployment, "transactionEvidence");
  const deploymentBlocks = objectField(deployment, "deploymentBlocks");
  const deploymentReceipts = objectField(deployment, "deploymentReceipts");
  const engineReceipt = deploymentReceipts ? objectField(deploymentReceipts, "engine") : undefined;
  const engineDeploymentBlock = optionalNonNegativeInteger(
    "engineDeploymentBlock",
    deployment.engineDeploymentBlock,
    deploymentBlocks?.engine,
    transactionEvidence?.engineDeploymentBlock,
    transactionEvidence?.tokenEngineLaunchBlock,
  );
  if (engineDeploymentBlock !== undefined) entries.V4_ENGINE_DEPLOYMENT_BLOCK = engineDeploymentBlock;
  setOptionalHash(
    entries,
    "V4_ENGINE_DEPLOYMENT_TX_HASH",
    firstOptionalString(
      deployment.engineDeploymentTransactionHash,
      engineReceipt?.transactionHash,
      transactionEvidence?.tokenEngineLaunch,
    ),
  );

  const runtimeCodeHashes = objectField(deployment, "runtimeCodeHashes");
  const safeRuntimeEvidence = runtimeCodeHashes
    ? objectField(runtimeCodeHashes, "safe")
    : undefined;
  const custody = objectField(deployment, "custody");
  setOptionalHash(
    entries,
    "V4_SAFE_CODEHASH",
    firstOptionalString(
      deployment.safeCodeHash,
      deployment.custodySafeCodeHash,
      safeRuntimeEvidence?.codeHash,
      runtimeCodeHashes?.safe,
      custody?.safeCodeHash,
    ),
  );
  setOptionalHash(entries, "V4_HOOK_INIT_CODE_HASH", optionalStringField(deployment, "hookInitCodeHash"));

  const releaseSource = objectField(deployment, "releaseSource");
  const releaseCommit = firstOptionalString(
    deployment.originCommit,
    deployment.releaseCommit,
    releaseSource?.releaseCommit,
  );
  if (releaseCommit !== undefined) {
    if (!/^[0-9a-f]{40}$/i.test(releaseCommit)) {
      throw new Error("Deployment log releaseCommit must be a full 40-character Git commit.");
    }
    entries.V4_RELEASE_COMMIT = releaseCommit.toLowerCase();
  }

  return entries;
}

function main() {
  const sourceArg = readArg("--source");
  const sourcePath = sourceArg ? resolve(repoRoot, sourceArg) : latestDeploymentFile();
  const outputPath = resolve(repoRoot, readArg("--output") ?? ".env.v4.fresh");
  const writeDotenv = hasFlag("--write-dotenv");
  if (hasFlag("--allow-retired")) {
    throw new Error("--allow-retired is not supported by the fresh launch sync. Use recovery-specific tooling.");
  }
  const deployment = readJsonFile(sourcePath);

  const lpTokenId =
    readArg("--lp-token-id") ??
    optionalStringField(deployment, "lpTokenId") ??
    latestSeedLpTokenId(deployment) ??
    "0";

  const entries = buildFreshEnvEntries(deployment, lpTokenId);
  validateFresh(deployment, entries, sourcePath);

  const body = [
    "# Fresh V4 launch config",
    `# Generated from deployments/${basename(sourcePath)}`,
    "# V4_LP_TOKEN_ID=0 is a pre-seed placeholder. Replace it after liquidity seed prints the LP NFT token ID.",
    ...Object.entries(entries).map(([key, value]) => envLine(key, value)),
    "",
  ].join("\n");

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, body);
  console.log(`Wrote ${outputPath}`);

  if (writeDotenv) {
    upsertEnvFile(resolve(repoRoot, ".env"), entries);
    console.log("Updated .env V4 launch config keys.");
  }

  console.log("Fresh V4 env config ready.");
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
