import { ethers } from "ethers";

export const BASE_UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
export const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const BASE_POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
export const BASE_POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const DEFAULT_V4_NARA = "0x58c209B95350aFBEFa17137CEd209f8c4b7D896D";
export const DEFAULT_V4_HOOK = "0x86ED92166aF1f97Fba75A9b12D9b1F7FfEE5E088";
export const DEFAULT_V4_POOL_FEE = 3000;
export const DEFAULT_V4_TICK_SPACING = 60;
export const DEFAULT_V4_LP_TOKEN_ID = 2187473n;
export const DEFAULT_V4_POOL_ID = "0x1d291f26281fb2a8dda28c0c35bd79251956dfef110266f4c53e62e65239ba34";
export const DEFAULT_V4_VAULT = "0x58C3f6E6b005009B775C0912B003D39660D14391";
export const DEFAULT_V4_ENGINE = "0x9E8cE51805b13a4d75c324F75B06ABc00d9b1E03";
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

export function currentV4Config() {
    const token = ethers.getAddress(requiredLaunchEnv("V4_NARA_TOKEN", DEFAULT_V4_NARA));
    const base = ethers.getAddress(optionalEnv("V4_BASE_TOKEN", BASE_USDC));

    const config = {
        universalRouter: ethers.getAddress(optionalEnv("V4_UNIVERSAL_ROUTER", BASE_UNIVERSAL_ROUTER)),
        permit2: ethers.getAddress(optionalEnv("V4_PERMIT2", BASE_PERMIT2)),
        poolManager: ethers.getAddress(optionalEnv("V4_POOL_MANAGER", BASE_POOL_MANAGER)),
        positionManager: ethers.getAddress(optionalEnv("V4_POSITION_MANAGER", BASE_POSITION_MANAGER)),
        token,
        base,
        hook: ethers.getAddress(requiredLaunchEnv("V4_HOOK", DEFAULT_V4_HOOK)),
        fee: parseNumber("V4_POOL_FEE", DEFAULT_V4_POOL_FEE),
        tickSpacing: parseNumber("V4_TICK_SPACING", DEFAULT_V4_TICK_SPACING),
        lpTokenId: parseRequiredLaunchBigInt("V4_LP_TOKEN_ID", DEFAULT_V4_LP_TOKEN_ID),
        poolId: requiredLaunchEnv("V4_POOL_ID", DEFAULT_V4_POOL_ID).toLowerCase(),
        vault: ethers.getAddress(requiredLaunchEnv("V4_VAULT", DEFAULT_V4_VAULT)),
        engine: ethers.getAddress(requiredLaunchEnv("V4_ENGINE", DEFAULT_V4_ENGINE)),
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

    return { ...config, canonicalPoolKey };
}
