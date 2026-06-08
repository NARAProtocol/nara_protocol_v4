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

const RETIRED_DEFAULTS_FLAG = "V4_ALLOW_RETIRED_DEFAULTS";

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

    return {
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
}
