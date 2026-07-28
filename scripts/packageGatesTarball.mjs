/**
 * packageGatesTarball — build the allowlisted-source tarball for the Linux security-gate runner.
 *
 * Produces ../nara-gates.tgz (next to the repo dir) containing a top-level `nara-protocol-hardhat/`
 * with contracts, tests, the echidna harness/config, package files and scripts/run-gates-linux.sh —
 * but NOT node_modules/artifacts/cache/reports/.git. That is exactly what scripts/run-gates-linux.sh
 * expects at /root/nara-gates.tgz.
 *
 * Usage:  npm run gates:package
 * Then:   scp nara-gates.tgz root@<box>:/root/
 *         scp nara-protocol-hardhat/scripts/run-gates-linux.sh root@<box>:/root/
 *         ssh root@<box> 'bash /root/run-gates-linux.sh'
 *
 * Requires `tar` on PATH (bundled with Windows 10+, Git Bash, and Linux).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";

const REPO_DIR = "nara-protocol-hardhat";
const OUT = "nara-gates.tgz";
const parent = resolve(process.cwd(), "..");

const EXCLUDE_DIRS = [
  "node_modules",
  "artifacts",
  "cache",
  ".venv-slither",
  ".git",
  "types",
  "deployments",
  "slither-reports",
  "aderyn-reports",
  "echidna/corpus",
  "echidna/coverage",
  "archive",
];

const args = [
  "czf",
  OUT,
  ...EXCLUDE_DIRS.flatMap((d) => ["--exclude", `${REPO_DIR}/${d}`]),
  "--exclude",
  "*.log",
  REPO_DIR,
];

console.log(`Packaging ${REPO_DIR}/ -> ${parent}/${OUT} (excluding generated/heavy dirs)`);
execFileSync("tar", args, { cwd: parent, stdio: "inherit" });

const outPath = resolve(parent, OUT);
if (!existsSync(outPath)) {
  console.error("FAILED: tarball not produced");
  process.exit(1);
}
const mb = (statSync(outPath).size / (1024 * 1024)).toFixed(1);
console.log(`Wrote ${outPath} (${mb} MB)`);
console.log("Next: scp it + scripts/run-gates-linux.sh to the box, then run bash /root/run-gates-linux.sh");
