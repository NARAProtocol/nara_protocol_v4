import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, sep } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const testRoot = resolve(repoRoot, "test");
const forkRoot = `${resolve(testRoot, "fork")}${sep}`;

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const tests = collectTests(testRoot)
  .filter((path) => !path.startsWith(forkRoot))
  .sort((left, right) => left.localeCompare(right));

if (tests.length === 0) throw new Error("No non-fork tests found");

const hardhatRoot = resolve(repoRoot, "node_modules", "hardhat");
const hardhatPackage = JSON.parse(readFileSync(resolve(hardhatRoot, "package.json"), "utf8"));
const hardhatBin = typeof hardhatPackage.bin === "string"
  ? hardhatPackage.bin
  : hardhatPackage.bin?.hardhat;
if (typeof hardhatBin !== "string") throw new Error("Hardhat CLI entry point is unavailable");

console.log(`Running ${tests.length} non-fork test files`);
const result = spawnSync(
  process.execPath,
  [resolve(hardhatRoot, hardhatBin), "test", ...tests],
  { cwd: repoRoot, env: process.env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
