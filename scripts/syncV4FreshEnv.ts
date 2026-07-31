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
} from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const deploymentsDir = resolve(repoRoot, "deployments");

type JsonObject = Record<string, unknown>;

const retiredStrings = new Map<string, string>([
  ["V4_NARA_TOKEN", DEFAULT_V4_NARA.toLowerCase()],
  ["V4_ENGINE", DEFAULT_V4_ENGINE.toLowerCase()],
  ["V4_HOOK", DEFAULT_V4_HOOK.toLowerCase()],
  ["V4_VAULT", DEFAULT_V4_VAULT.toLowerCase()],
  ["V4_POOL_ID", DEFAULT_V4_POOL_ID.toLowerCase()],
  ["V4_LP_TOKEN_ID", DEFAULT_V4_LP_TOKEN_ID.toString()],
]);

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

function latestDeploymentFile(): string {
  const replacement = resolve(deploymentsDir, "v4-liquidity-replacement-latest.json");
  if (existsSync(replacement)) return replacement;

  const canonical = resolve(deploymentsDir, "v4-base-usdc-latest.json");
  if (existsSync(canonical)) return canonical;

  if (!existsSync(deploymentsDir)) {
    throw new Error("No deployments directory found. Run npm run deploy:v4:base:usdc first.");
  }

  const candidates = readdirSync(deploymentsDir)
    .filter((name) => /^v4-base-usdc-.*\.json$/.test(name) && name !== "v4-base-usdc-latest.json")
    .map((name) => resolve(deploymentsDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (candidates.length === 0) {
    throw new Error("No v4-base-usdc deployment log found. Run npm run deploy:v4:base:usdc first.");
  }

  return candidates[0];
}

function readJsonFile(path: string): JsonObject {
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

function latestSeedLpTokenId(): string | undefined {
  const canonical = resolve(deploymentsDir, "v4-liquidity-seed-latest.json");
  if (!existsSync(canonical)) return undefined;
  const seed = readJsonFile(canonical);
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

function validateFresh(entries: Record<string, string>, allowRetired: boolean) {
  if (allowRetired) return;

  const retiredHits = Object.entries(entries)
    .filter(([key, value]) => retiredStrings.get(key) === value.toLowerCase())
    .map(([key]) => key);

  if (retiredHits.length > 0) {
    throw new Error(
      `Refusing to generate fresh V4 config from retired incident-stack value(s): ${retiredHits.join(", ")}. ` +
      "Run a fresh deploy first, or pass --allow-retired only for recovery checks.",
    );
  }
}

function main() {
  const sourceArg = readArg("--source");
  const sourcePath = sourceArg ? resolve(repoRoot, sourceArg) : latestDeploymentFile();
  const outputPath = resolve(repoRoot, readArg("--output") ?? ".env.v4.fresh");
  const writeDotenv = hasFlag("--write-dotenv");
  const allowRetired = hasFlag("--allow-retired");
  const deployment = readJsonFile(sourcePath);
  if (
    deployment.replacementLiquidityTrioRequired === true ||
    (typeof deployment.liquidityStackStatus === "string" &&
      deployment.liquidityStackStatus.startsWith("quarantined"))
  ) {
    throw new Error(
      "Refusing to generate launch env from a quarantined liquidity manifest. " +
      "Deploy and verify the corrected replacement trio first.",
    );
  }
  const poolKey = (deployment.poolKey ?? {}) as JsonObject;

  const lpTokenId =
    readArg("--lp-token-id") ??
    optionalStringField(deployment, "lpTokenId") ??
    latestSeedLpTokenId() ??
    "0";

  const entries: Record<string, string> = {
    V4_NARA_TOKEN: ethers.getAddress(stringField(deployment, "token")),
    V4_ENGINE: ethers.getAddress(stringField(deployment, "engine")),
    V4_HOOK: ethers.getAddress(stringField(deployment, "hook")),
    V4_VAULT: ethers.getAddress(stringField(deployment, "vault")),
    V4_POOL_ID: stringField(deployment, "poolId").toLowerCase(),
    V4_LP_TOKEN_ID: BigInt(lpTokenId).toString(),
    V4_POOL_FEE: numberField(deployment, "poolFee", numberField(poolKey, "fee", 3000)).toString(),
    V4_TICK_SPACING: numberField(deployment, "tickSpacing", numberField(poolKey, "tickSpacing", 60)).toString(),
    V4_BASE_TOKEN: ethers.getAddress(optionalStringField(deployment, "usdc") ?? BASE_USDC),
    V4_POOL_MANAGER: ethers.getAddress(optionalStringField(deployment, "poolManager") ?? BASE_POOL_MANAGER),
    V4_POSITION_MANAGER: ethers.getAddress(optionalStringField(deployment, "positionManager") ?? BASE_POSITION_MANAGER),
    V4_PERMIT2: ethers.getAddress(optionalStringField(deployment, "permit2") ?? BASE_PERMIT2),
    V4_UNIVERSAL_ROUTER: ethers.getAddress(optionalStringField(deployment, "universalRouter") ?? BASE_UNIVERSAL_ROUTER),
  };

  validateFresh(entries, allowRetired);

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

main();
