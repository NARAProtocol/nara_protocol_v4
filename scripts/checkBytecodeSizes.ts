import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_DEPLOYED_SIZE = 24_576;
const MAX_INITCODE_SIZE = 49_152;

interface ArtifactLike {
  bytecode: string;
  deployedBytecode: string;
  contractName?: string;
}

function sizeFromHex(hex: string): number {
  if (!hex || hex === "0x") return 0;
  return (hex.length - 2) / 2;
}

function formatStatus(size: number, limit: number): string {
  return size <= limit ? "ok" : "too large";
}

function formatRow(label: string, deployed: number, initcode: number): string {
  const deployedStatus = formatStatus(deployed, MAX_DEPLOYED_SIZE).padEnd(9, " ");
  const initStatus = formatStatus(initcode, MAX_INITCODE_SIZE).padEnd(9, " ");
  return `${label.padEnd(28, " ")} deployed=${String(deployed).padStart(5, " ")} (${deployedStatus})  init=${String(initcode).padStart(5, " ")} (${initStatus})`;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptDir);
const contractsDir = join(rootDir, "contracts");
const artifactsDir = join(rootDir, "artifacts", "contracts");

function findSolidityFiles(dir: string): string[] {
  const entries = readdirSync(dir).sort();
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === "test") continue;
      files.push(...findSolidityFiles(fullPath));
      continue;
    }

    if (stat.isFile() && entry.endsWith(".sol")) {
      files.push(relative(contractsDir, fullPath));
    }
  }

  return files;
}

const contractFiles = findSolidityFiles(contractsDir);

if (contractFiles.length === 0) {
  throw new Error("No Solidity contracts found in contracts/");
}

const failures: string[] = [];

function hardhat(command: string): void {
  if (process.platform === "win32") {
    execFileSync("cmd", ["/c", "npx", "hardhat", command], {
      cwd: rootDir,
      stdio: "inherit",
    });
    return;
  }

  execFileSync("npx", ["hardhat", command], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

console.log("Rebuilding clean plain artifacts before measuring bytecode size...");
hardhat("clean");
hardhat("compile");

console.log("Bytecode size check (plain build artifacts)");
console.log(`Limits: deployed <= ${MAX_DEPLOYED_SIZE}, initcode <= ${MAX_INITCODE_SIZE}`);
console.log("Coverage builds add instrumentation and are not valid deploy-size checks.");
console.log("");

for (const fileName of contractFiles) {
  const contractName = fileName.split(/[\\/]/).pop()!.replace(/\.sol$/, "");
  const artifactPath = join(artifactsDir, fileName, `${contractName}.json`);
  const label = fileName.replace(/\.sol$/, "");

  if (!existsSync(artifactPath)) {
    console.log(`${label.padEnd(36, " ")} skipped (no same-name artifact)`);
    continue;
  }

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as ArtifactLike;
  const deployedSize = sizeFromHex(artifact.deployedBytecode);
  const initcodeSize = sizeFromHex(artifact.bytecode);

  console.log(formatRow(label, deployedSize, initcodeSize));

  if (deployedSize > MAX_DEPLOYED_SIZE) {
    failures.push(`${contractName}: deployed bytecode ${deployedSize} exceeds ${MAX_DEPLOYED_SIZE}`);
  }
  if (initcodeSize > MAX_INITCODE_SIZE) {
    failures.push(`${contractName}: initcode ${initcodeSize} exceeds ${MAX_INITCODE_SIZE}`);
  }
}

if (failures.length > 0) {
  console.log("");
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("");
  console.log("All deployable artifacts are within the EVM size limits.");
}
