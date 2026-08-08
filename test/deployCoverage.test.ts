/**
 * Deploy-coverage guard.
 *
 * Fails if any DEPLOYABLE v4 contract is not referenced by at least one deploy script. This stops the
 * "we added a contract but forgot to wire it into launch" failure mode (e.g. the compounder gap found
 * 2026-06-29). Pure filesystem check — no network, runs in the normal suite.
 *
 * Convention relied upon: one deployable contract per file, contract name == file basename.
 * Non-deployable kinds (interfaces/, libraries/, mocks/) are excluded by directory. Contracts that are
 * intentionally NOT deployed at launch must be listed in INTENTIONALLY_NOT_DEPLOYED with a reason.
 */
import { expect } from "chai";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const CONTRACTS_ROOT = join(process.cwd(), "contracts", "v4");
const SCRIPTS_ROOT = join(process.cwd(), "scripts");

// Directories whose .sol files are never standalone-deployable.
const EXCLUDED_DIRS = new Set(["mocks", "interfaces", "libraries"]);

// Contracts that legitimately have no deploy-script reference, with the reason.
const INTENTIONALLY_NOT_DEPLOYED: Record<string, string> = {
  NARAEngineTypes: "types/structs only — not a deployable contract",
  NARABondDepositoryV4: "raw-position bond path superseded by NARABondDepositoryV4NFT",
  NARAFractionalPositionV4: "deployed per-position by NARAFractionalPositionFactoryV4 at runtime, not at launch",
  NARAPositionRendererV4: "legacy renderer kept for artifact compatibility; launch uses modular NARAPositionRendererV5",
};

function listSolFiles(dir: string, rel = ""): { name: string; rel: string }[] {
  const out: { name: string; rel: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const relPath = rel ? `${rel}/${entry}` : entry;
    if (statSync(abs).isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      out.push(...listSolFiles(abs, relPath));
    } else if (entry.endsWith(".sol")) {
      out.push({ name: entry.replace(/\.sol$/, ""), rel: relPath });
    }
  }
  return out;
}

function readAllDeployScripts(): string {
  let blob = "";
  for (const entry of readdirSync(SCRIPTS_ROOT)) {
    if (entry.startsWith("deploy") && entry.endsWith(".ts")) {
      blob += readFileSync(join(SCRIPTS_ROOT, entry), "utf8");
    }
  }
  return blob;
}

describe("deploy coverage (v4)", () => {
  it("freezes the fresh-deployment onchain name and symbol as NARA", () => {
    const source = readFileSync(join(SCRIPTS_ROOT, "deployV4BaseUsdc.ts"), "utf8");
    expect(source).to.include('const canonicalTokenName = "NARA";');
    expect(source).to.include('const canonicalTokenSymbol = "NARA";');
    expect(source).not.to.include('const canonicalTokenName = "NARA Token";');
  });

  it("every deployable v4 contract is referenced by a deploy script (or explicitly excluded)", () => {
    const contracts = listSolFiles(CONTRACTS_ROOT);
    const deployBlob = readAllDeployScripts();
    expect(deployBlob.length, "no deploy scripts found").to.be.greaterThan(0);

    const orphans: string[] = [];
    for (const { name, rel } of contracts) {
      if (name in INTENTIONALLY_NOT_DEPLOYED) continue;
      // Reference must be the whole identifier (avoid matching a prefix of a longer name).
      const referenced = new RegExp(`\\b${name}\\b`).test(deployBlob);
      if (!referenced) orphans.push(`${name}  (${rel})`);
    }

    expect(
      orphans,
      `These deployable v4 contracts are NOT wired into any deploy script. Either add them to a ` +
        `deploy script, or add them to INTENTIONALLY_NOT_DEPLOYED with a reason:\n  - ${orphans.join("\n  - ")}`,
    ).to.deep.equal([]);
  });

  it("no stale entry in INTENTIONALLY_NOT_DEPLOYED (each must still exist as a v4 .sol file)", () => {
    const names = new Set(listSolFiles(CONTRACTS_ROOT).map((c) => c.name));
    const stale = Object.keys(INTENTIONALLY_NOT_DEPLOYED).filter((n) => !names.has(n));
    expect(stale, `INTENTIONALLY_NOT_DEPLOYED lists names with no matching v4 .sol file: ${stale.join(", ")}`).to.deep.equal([]);
  });
});
