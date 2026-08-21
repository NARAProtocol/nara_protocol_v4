/** Recoverably quarantine stale/partial pre-execution Position NFT Safe artifacts. */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { POSITION_NFT_PHASE2_CHANGE_ID } from "./lib/v4PositionNftPhase2.js";

const DEPLOYMENT_DIR = "deployments";
const CONFIRMATION = "QUARANTINE-INCOMPLETE-NARA-20260821-v4-position-nft-phase2";
const CANDIDATE = /^(?:UNEXECUTED|PENDING-PACKET-LINK-DO-NOT-IMPORT)-v4-position-nft-phase2-/;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main(): void {
  if (process.env.V4_POSITION_NFT_INCOMPLETE_QUARANTINE_CONFIRM?.trim() !== CONFIRMATION) {
    throw new Error(`Set V4_POSITION_NFT_INCOMPLETE_QUARANTINE_CONFIRM=${CONFIRMATION}`);
  }
  if (!existsSync(DEPLOYMENT_DIR)) throw new Error("Deployments directory is missing");
  const candidates = readdirSync(DEPLOYMENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && CANDIDATE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (candidates.length === 0) throw new Error("No stale or partial Position NFT JIT artifacts were found");

  const plan = candidates.map((name) => {
    const source = join(DEPLOYMENT_DIR, name);
    const target = join(DEPLOYMENT_DIR, `INCOMPLETE-DO-NOT-IMPORT-${name}`);
    if (existsSync(target)) throw new Error(`Refusing to overwrite prior quarantine evidence: ${target}`);
    return { source, target, sha256: sha256(source) };
  });
  for (const item of plan) {
    renameSync(item.source, item.target);
    if (existsSync(item.source) || !existsSync(item.target) || sha256(item.target) !== item.sha256) {
      throw new Error(`Quarantine rename did not preserve exact bytes: ${item.source}`);
    }
  }
  console.log(JSON.stringify({
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    status: "INCOMPLETE_DO_NOT_IMPORT",
    recoverable: true,
    artifacts: plan,
  }, null, 2));
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Incomplete Safe artifact quarantine failed";
  console.error(message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 600));
  process.exitCode = 1;
}
