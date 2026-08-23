import { ethers } from "ethers";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");

export const PRODUCTION_V4_MANIFEST_PATH = resolve(
    repoRoot,
    "deployments",
    "v4-production-activation-2026-08-09.json",
);
export const PRODUCTION_V4_MANIFEST_SHA256 =
    "e525b8c6508c454b951fdb422eb6ad03b51a120827b22efc4ae64a3862ddd066";
export const PRODUCTION_V4_CHANGE_ID = "NARA-20260809-v4-production-activation";

export const BASE_UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
export const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const BASE_POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
export const BASE_POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const RETIRED_INCIDENT_V4_NARA = "0x58c209B95350aFBEFa17137CEd209f8c4b7D896D";
export const RETIRED_INCIDENT_V4_HOOK = "0x86ED92166aF1f97Fba75A9b12D9b1F7FfEE5E088";
export const DEFAULT_V4_POOL_FEE = 3000;
export const DEFAULT_V4_TICK_SPACING = 60;
export const RETIRED_INCIDENT_V4_LP_TOKEN_ID = 2187473n;
export const RETIRED_INCIDENT_V4_POOL_ID = "0x1d291f26281fb2a8dda28c0c35bd79251956dfef110266f4c53e62e65239ba34";
export const RETIRED_INCIDENT_V4_VAULT = "0x58C3f6E6b005009B775C0912B003D39660D14391";
export const RETIRED_INCIDENT_V4_ENGINE = "0x9E8cE51805b13a4d75c324F75B06ABc00d9b1E03";
export const V4_HOOK_FLAG_MASK = 0x3fffn;
export const REQUIRED_V4_HOOK_FLAGS = 0x2088n;
export const QUARANTINED_STAGE_A_HOOK = "0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088";
export const QUARANTINED_STAGE_A_POOL_ID =
    "0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3";

const RETIRED_DEFAULTS_FLAG = "V4_ALLOW_RETIRED_DEFAULTS";
const QUARANTINED_STAGE_A_FLAG = "V4_ALLOW_QUARANTINED_STAGE_A";

export interface V4PoolConfigInput {
    token: string;
    base: string;
    hook: string;
    fee: number;
    tickSpacing: number;
    poolId: string;
}

export interface CanonicalV4PoolKey {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hook: string;
    poolId: string;
    tokenIsCurrency0: boolean;
}

export interface V4LiveConfig {
    universalRouter: string;
    permit2: string;
    poolManager: string;
    positionManager: string;
    token: string;
    base: string;
    hook: string;
    fee: number;
    tickSpacing: number;
    lpTokenId: bigint;
    poolId: string;
    vault: string;
    engine: string;
    canonicalPoolKey: CanonicalV4PoolKey;
}

export interface ProductionV4Deployment {
    changeId: string;
    manifestPath: string;
    manifestSha256: string;
    chainId: bigint;
    originCommit: string;
    token: string;
    engine: string;
    hook: string;
    vault: string;
    compounder: string;
    safe: string;
    admin: string;
    treasury: string;
    deployer: string;
    launcher: string;
    rewardReserve: string;
    create2HookDeployer: string;
    base: string;
    poolManager: string;
    positionManager: string;
    permit2: string;
    universalRouter: string;
    poolId: string;
    poolFee: number;
    tickSpacing: number;
    lpTokenId: bigint;
    engineDeploymentBlock: bigint;
    engineDeploymentTransactionHash: string;
    safeCodeHash: string;
    runtimeCodeHashes: Readonly<Record<"token" | "engine" | "hook" | "vault" | "compounder" | "safe", string>>;
}

export function deriveV4PoolKey(input: Omit<V4PoolConfigInput, "poolId">): CanonicalV4PoolKey {
    const token = ethers.getAddress(input.token);
    const base = ethers.getAddress(input.base);
    const hook = ethers.getAddress(input.hook);
    if (token === base) throw new Error("V4 token and base must be different currencies");

    const tokenIsCurrency0 = BigInt(token) < BigInt(base);
    const [currency0, currency1] = tokenIsCurrency0 ? [token, base] : [base, token];
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)"],
        [[currency0, currency1, input.fee, input.tickSpacing, hook]],
    );

    return {
        currency0,
        currency1,
        fee: input.fee,
        tickSpacing: input.tickSpacing,
        hook,
        poolId: ethers.keccak256(encoded),
        tokenIsCurrency0,
    };
}

export function assertCanonicalV4PoolConfig(input: V4PoolConfigInput): CanonicalV4PoolKey {
    const hook = ethers.getAddress(input.hook);
    const actualHookFlags = BigInt(hook) & V4_HOOK_FLAG_MASK;
    if (actualHookFlags !== REQUIRED_V4_HOOK_FLAGS) {
        throw new Error(
            `V4_HOOK permission bits must equal 0x2088; received 0x${actualHookFlags.toString(16).padStart(4, "0")}`,
        );
    }
    if (input.fee !== DEFAULT_V4_POOL_FEE) {
        throw new Error(`V4_POOL_FEE must equal the canonical fee ${DEFAULT_V4_POOL_FEE}; received ${input.fee}`);
    }
    if (input.tickSpacing !== DEFAULT_V4_TICK_SPACING) {
        throw new Error(
            `V4_TICK_SPACING must equal the canonical spacing ${DEFAULT_V4_TICK_SPACING}; received ${input.tickSpacing}`,
        );
    }
    if (!ethers.isHexString(input.poolId, 32)) {
        throw new Error(`V4_POOL_ID must be a 32-byte hex value; received ${input.poolId}`);
    }

    const key = deriveV4PoolKey(input);
    if (key.poolId.toLowerCase() !== input.poolId.toLowerCase()) {
        throw new Error(
            `V4_POOL_ID does not match the configured canonical PoolKey; expected ${key.poolId}, received ${input.poolId}`,
        );
    }
    return key;
}

function readEnv(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value && value.length > 0 ? value : undefined;
}

export function requiredEnv(name: string): string {
    const value = readEnv(name);
    if (!value) {
        throw new Error(`Missing env: ${name}`);
    }
    return value;
}

export function requiredBaseRpcUrl(): string {
    const value = readEnv("BASE_RPC_URL") ?? readEnv("BASE_MAINNET_RPC_URL");
    if (!value) {
        throw new Error("Missing env: BASE_RPC_URL or BASE_MAINNET_RPC_URL");
    }
    return value;
}

export function optionalEnv(name: string, fallback: string): string {
    return readEnv(name) ?? fallback;
}

function parseNumber(name: string, fallback: number): number {
    const value = readEnv(name);
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        throw new Error(`Invalid integer env: ${name}=${value}`);
    }
    return parsed;
}

function parseBigInt(name: string, fallback: bigint): bigint {
    const value = readEnv(name);
    return value ? BigInt(value) : fallback;
}

function requiredLaunchEnv(name: string, retiredFallback: string): string {
    const value = readEnv(name);
    if (value) return value;
    if (readEnv(RETIRED_DEFAULTS_FLAG) === "1") return retiredFallback;
    throw new Error(
        `Missing env: ${name}. The built-in fallback is a retired incident-stack address. ` +
        `Set ${name} for the fresh v4 launch config, or set ${RETIRED_DEFAULTS_FLAG}=1 only for retired-stack recovery checks.`,
    );
}

function parseRequiredLaunchBigInt(name: string, retiredFallback: bigint): bigint {
    const value = readEnv(name);
    if (value) return BigInt(value);
    if (readEnv(RETIRED_DEFAULTS_FLAG) === "1") return retiredFallback;
    throw new Error(
        `Missing env: ${name}. The built-in fallback belongs to the retired incident stack. ` +
        `Set ${name} for the fresh v4 launch config, or set ${RETIRED_DEFAULTS_FLAG}=1 only for retired-stack recovery checks.`,
    );
}

type JsonObject = Record<string, unknown>;

function jsonObject(value: unknown, label: string): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Production v4 manifest field ${label} must be an object`);
    }
    return value as JsonObject;
}

function jsonString(object: JsonObject, key: string, label = key): string {
    const value = object[key];
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Production v4 manifest field ${label} must be a non-empty string`);
    }
    return value;
}

function jsonInteger(object: JsonObject, key: string, label = key): bigint {
    const value = object[key];
    if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/.test(String(value))) {
        throw new Error(`Production v4 manifest field ${label} must be a non-negative integer`);
    }
    return BigInt(value);
}

function normalizedManifestSha256(raw: string): string {
    return createHash("sha256").update(raw.replace(/\r\n/g, "\n")).digest("hex");
}

export function canonicalProductionV4Deployment(
    manifestPath = PRODUCTION_V4_MANIFEST_PATH,
): ProductionV4Deployment {
    const raw = readFileSync(manifestPath, "utf8");
    const manifestSha256 = normalizedManifestSha256(raw);
    if (manifestSha256 !== PRODUCTION_V4_MANIFEST_SHA256) {
        throw new Error(
            `Production v4 manifest hash mismatch: expected ${PRODUCTION_V4_MANIFEST_SHA256}, ` +
            `received ${manifestSha256}`,
        );
    }

    const manifest = jsonObject(JSON.parse(raw), "root");
    const changeId = jsonString(manifest, "changeId");
    if (changeId !== PRODUCTION_V4_CHANGE_ID) {
        throw new Error(`Production v4 manifest changeId mismatch: expected ${PRODUCTION_V4_CHANGE_ID}, received ${changeId}`);
    }
    const envSync = jsonObject(manifest.envSync, "envSync");
    const contracts = jsonObject(manifest.contracts, "contracts");
    const custody = jsonObject(manifest.custody, "custody");
    const contract = (key: string) => jsonObject(contracts[key], `contracts.${key}`);
    const runtimeCodeHash = (key: string) =>
        jsonString(contract(key), "runtimeCodeHash", `contracts.${key}.runtimeCodeHash`).toLowerCase();
    const address = (key: string) => ethers.getAddress(jsonString(envSync, key, `envSync.${key}`));

    return {
        changeId,
        manifestPath,
        manifestSha256,
        chainId: jsonInteger(envSync, "chainId", "envSync.chainId"),
        originCommit: jsonString(envSync, "originCommit", "envSync.originCommit").toLowerCase(),
        token: address("token"),
        engine: address("engine"),
        hook: address("hook"),
        vault: address("vault"),
        compounder: address("compounder"),
        safe: address("custodySafe"),
        admin: address("finalAdmin"),
        treasury: address("treasury"),
        deployer: address("deployer"),
        launcher: address("launcher"),
        rewardReserve: address("rewardReserve"),
        create2HookDeployer: address("create2HookDeployer"),
        base: address("usdc"),
        poolManager: address("poolManager"),
        positionManager: address("positionManager"),
        permit2: address("permit2"),
        universalRouter: address("universalRouter"),
        poolId: jsonString(envSync, "poolId", "envSync.poolId").toLowerCase(),
        poolFee: Number(jsonInteger(envSync, "poolFee", "envSync.poolFee")),
        tickSpacing: Number(jsonInteger(envSync, "tickSpacing", "envSync.tickSpacing")),
        lpTokenId: jsonInteger(envSync, "lpTokenId", "envSync.lpTokenId"),
        engineDeploymentBlock: jsonInteger(envSync, "engineDeploymentBlock", "envSync.engineDeploymentBlock"),
        engineDeploymentTransactionHash: jsonString(
            envSync,
            "engineDeploymentTransactionHash",
            "envSync.engineDeploymentTransactionHash",
        ).toLowerCase(),
        safeCodeHash: jsonString(custody, "safeRuntimeCodeHash", "custody.safeRuntimeCodeHash").toLowerCase(),
        runtimeCodeHashes: {
            token: runtimeCodeHash("token"),
            engine: runtimeCodeHash("engine"),
            hook: runtimeCodeHash("liquidityHook"),
            vault: runtimeCodeHash("liquidityVault"),
            compounder: runtimeCodeHash("liquidityCompounder"),
            safe: jsonString(custody, "safeRuntimeCodeHash", "custody.safeRuntimeCodeHash").toLowerCase(),
        },
    };
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string {
    const value = environment[key]?.trim();
    if (!value) throw new Error(`Production v4 runtime requires explicit env key ${key}`);
    return value;
}

function equalProductionValue(key: string, actual: string, expected: string): void {
    let matches: boolean;
    if (/^0x[0-9a-fA-F]{40}$/.test(expected)) {
        matches = ethers.getAddress(actual) === ethers.getAddress(expected);
    } else if (/^\d+$/.test(expected)) {
        matches = /^\d+$/.test(actual) && BigInt(actual) === BigInt(expected);
    } else {
        matches = actual.toLowerCase() === expected.toLowerCase();
    }
    if (!matches) {
        throw new Error(`Production v4 manifest mismatch for ${key}: expected ${expected}, received ${actual}`);
    }
}

export function assertProductionV4Config(
    config: V4LiveConfig,
    environment: NodeJS.ProcessEnv = process.env,
    deployment = canonicalProductionV4Deployment(),
): ProductionV4Deployment {
    const configuredValues: ReadonlyArray<[string, string, string]> = [
        ["V4_NARA_TOKEN", config.token, deployment.token],
        ["V4_ENGINE", config.engine, deployment.engine],
        ["V4_HOOK", config.hook, deployment.hook],
        ["V4_VAULT", config.vault, deployment.vault],
        ["V4_BASE_TOKEN", config.base, deployment.base],
        ["V4_POOL_MANAGER", config.poolManager, deployment.poolManager],
        ["V4_POSITION_MANAGER", config.positionManager, deployment.positionManager],
        ["V4_PERMIT2", config.permit2, deployment.permit2],
        ["V4_UNIVERSAL_ROUTER", config.universalRouter, deployment.universalRouter],
        ["V4_POOL_ID", config.poolId, deployment.poolId],
        ["V4_POOL_FEE", String(config.fee), String(deployment.poolFee)],
        ["V4_TICK_SPACING", String(config.tickSpacing), String(deployment.tickSpacing)],
        ["V4_LP_TOKEN_ID", String(config.lpTokenId), String(deployment.lpTokenId)],
    ];
    for (const [key, actual, expected] of configuredValues) equalProductionValue(key, actual, expected);

    const requiredManifestEnv: ReadonlyArray<[string, string]> = [
        ["V4_ADMIN_ADDRESS", deployment.admin],
        ["V4_SAFE", deployment.safe],
        ["V4_DEPLOYER", deployment.deployer],
        ["V4_TREASURY_ADDRESS", deployment.treasury],
        ["V4_REWARD_RESERVE", deployment.rewardReserve],
        ["V4_LAUNCHER", deployment.launcher],
        ["V4_CREATE2_HOOK_DEPLOYER", deployment.create2HookDeployer],
        ["V4_COMPOUNDER", deployment.compounder],
        ["V4_COMPOUNDER_ADDRESS", deployment.compounder],
        ["V4_ENGINE_DEPLOYMENT_BLOCK", String(deployment.engineDeploymentBlock)],
        ["V4_ENGINE_DEPLOYMENT_TX_HASH", deployment.engineDeploymentTransactionHash],
        ["V4_SAFE_CODEHASH", deployment.safeCodeHash],
        ["V4_RELEASE_COMMIT", deployment.originCommit],
    ];
    for (const [key, expected] of requiredManifestEnv) {
        equalProductionValue(key, requiredEnvironmentValue(environment, key), expected);
    }
    return deployment;
}

export async function assertProductionV4Runtime(
    provider: ethers.Provider,
    config = currentV4Config(),
): Promise<ProductionV4Deployment> {
    const deployment = assertProductionV4Config(config);
    const network = await provider.getNetwork();
    if (network.chainId !== deployment.chainId) {
        throw new Error(`Production v4 chain mismatch: expected ${deployment.chainId}, received ${network.chainId}`);
    }
    const targets = [
        ["token", deployment.token],
        ["engine", deployment.engine],
        ["hook", deployment.hook],
        ["vault", deployment.vault],
        ["compounder", deployment.compounder],
        ["safe", deployment.safe],
    ] as const;
    const codes: string[] = [];
    for (const [, address] of targets) {
        for (let i = 0; i < 5; i++) {
            try {
                const code = await provider.getCode(address);
                await new Promise((r) => setTimeout(r, 100));
                codes.push(code);
                break;
            } catch (err: any) {
                if (i === 4) throw err;
                await new Promise((r) => setTimeout(r, 1000 * Math.pow(1.5, i)));
            }
        }
    }
    for (let index = 0; index < targets.length; index += 1) {
        const [label, address] = targets[index];
        const code = codes[index];
        if (code === "0x") throw new Error(`Production v4 ${label} has no runtime code at ${address}`);
        const actualHash = ethers.keccak256(code).toLowerCase();
        const expectedHash = deployment.runtimeCodeHashes[label];
        if (actualHash !== expectedHash) {
            throw new Error(
                `Production v4 ${label} runtime hash mismatch at ${address}: ` +
                `expected ${expectedHash}, received ${actualHash}`,
            );
        }
    }
    return deployment;
}

export function productionV4RuntimeBanner(deployment: ProductionV4Deployment): string {
    return [
        `release=${deployment.changeId}`,
        `manifestSha256=${deployment.manifestSha256}`,
        `originCommit=${deployment.originCommit}`,
        `engine=${deployment.engine}`,
        `hook=${deployment.hook}`,
        `poolId=${deployment.poolId}`,
    ].join(" ");
}

export function currentV4Config(options: { requireProduction?: boolean } = {}): V4LiveConfig {
    const token = ethers.getAddress(requiredLaunchEnv("V4_NARA_TOKEN", RETIRED_INCIDENT_V4_NARA));
    const base = ethers.getAddress(optionalEnv("V4_BASE_TOKEN", BASE_USDC));

    const config = {
        universalRouter: ethers.getAddress(optionalEnv("V4_UNIVERSAL_ROUTER", BASE_UNIVERSAL_ROUTER)),
        permit2: ethers.getAddress(optionalEnv("V4_PERMIT2", BASE_PERMIT2)),
        poolManager: ethers.getAddress(optionalEnv("V4_POOL_MANAGER", BASE_POOL_MANAGER)),
        positionManager: ethers.getAddress(optionalEnv("V4_POSITION_MANAGER", BASE_POSITION_MANAGER)),
        token,
        base,
        hook: ethers.getAddress(requiredLaunchEnv("V4_HOOK", RETIRED_INCIDENT_V4_HOOK)),
        fee: parseNumber("V4_POOL_FEE", DEFAULT_V4_POOL_FEE),
        tickSpacing: parseNumber("V4_TICK_SPACING", DEFAULT_V4_TICK_SPACING),
        lpTokenId: parseRequiredLaunchBigInt("V4_LP_TOKEN_ID", RETIRED_INCIDENT_V4_LP_TOKEN_ID),
        poolId: requiredLaunchEnv("V4_POOL_ID", RETIRED_INCIDENT_V4_POOL_ID).toLowerCase(),
        vault: ethers.getAddress(requiredLaunchEnv("V4_VAULT", RETIRED_INCIDENT_V4_VAULT)),
        engine: ethers.getAddress(requiredLaunchEnv("V4_ENGINE", RETIRED_INCIDENT_V4_ENGINE)),
    };

    const canonicalPoolKey = assertCanonicalV4PoolConfig(config);

    const isQuarantinedStageA =
        config.hook.toLowerCase() === QUARANTINED_STAGE_A_HOOK.toLowerCase() ||
        config.poolId === QUARANTINED_STAGE_A_POOL_ID;
    if (isQuarantinedStageA && readEnv(QUARANTINED_STAGE_A_FLAG) !== "1") {
        throw new Error(
            "Configured hook/pool belongs to the quarantined Stage A liquidity stack. " +
            `Set ${QUARANTINED_STAGE_A_FLAG}=1 only for explicit read-only recovery analysis; ` +
            "never initialize or seed that pool.",
        );
    }

    const result = { ...config, canonicalPoolKey };
    if (options.requireProduction !== false) assertProductionV4Config(result);
    return result;
}
