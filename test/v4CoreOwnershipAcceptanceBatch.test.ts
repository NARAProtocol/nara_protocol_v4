import { expect } from "chai";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Interface, ZeroAddress, ZeroHash } from "ethers";

type SafeBatch = {
  chainId: string;
  meta: { createdFromSafeAddress: string };
  transactions: Array<{ to: string; value: string; data: string }>;
  naraEvidence: {
    status: string;
    originCommit: string;
    safe: string;
    hook: string;
    vault: string;
    acceptOwnershipSelector: string;
    preState: {
      hookPendingOwner: string;
      vaultPendingOwner: string;
    };
  };
};

type DeploymentManifest = {
  chainId: string;
  originCommit: string;
  finalAdmin: string;
  hook: string;
  vault: string;
  poolRegistered: boolean;
  poolInitialized: boolean;
  liquiditySeeded: boolean;
  runtimeCodeHashes: { compounder: unknown };
};

type ReceiptReconciliation = {
  chain: { chainId: string };
  release: { releaseCommit: string };
  inputs: { manifest: { sha256: string } };
  summary: {
    expectedReceipts: number;
    canonicalReceiptsFound: number;
    successfulCanonicalReceipts: number;
    journalZeroBlockHashes: number;
    supplementedZeroBlockHashes: number;
    nonZeroBlockHashMismatches: number;
    otherFieldMismatches: number;
    reconciledReceipts: number;
    unreconciledReceipts: number;
    result: string;
  };
  receipts: Array<{
    canonical: { blockHash: string; status: number };
    comparison: { reconciled: boolean };
  }>;
};

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(relativePath, "utf8")) as T;
}

describe("fresh v4 core ownership-acceptance Safe batch", function () {
  it("matches the immutable dormant deployment manifest", function () {
    const batch = loadJson<SafeBatch>(
      "deployments/v4-core-ownership-acceptance-batch.json",
    );
    const manifest = loadJson<DeploymentManifest>(
      "deployments/v4-base-usdc-2026-08-08T22-16-06-220Z.json",
    );

    expect(batch.chainId).to.equal("8453");
    expect(batch.chainId).to.equal(manifest.chainId);
    expect(batch.naraEvidence.originCommit).to.equal(manifest.originCommit);
    expect(batch.meta.createdFromSafeAddress).to.equal(manifest.finalAdmin);
    expect(batch.naraEvidence.safe).to.equal(manifest.finalAdmin);
    expect(batch.naraEvidence.hook).to.equal(manifest.hook);
    expect(batch.naraEvidence.vault).to.equal(manifest.vault);
    expect(batch.naraEvidence.preState.hookPendingOwner).to.equal(
      manifest.finalAdmin,
    );
    expect(batch.naraEvidence.preState.vaultPendingOwner).to.equal(
      manifest.finalAdmin,
    );
    expect(manifest.poolRegistered).to.equal(false);
    expect(manifest.poolInitialized).to.equal(false);
    expect(manifest.liquiditySeeded).to.equal(false);
    expect(manifest.runtimeCodeHashes.compounder).to.equal(null);
  });

  it("contains only the two direct acceptOwnership calls", function () {
    const batch = loadJson<SafeBatch>(
      "deployments/v4-core-ownership-acceptance-batch.json",
    );
    const selector = new Interface([
      "function acceptOwnership()",
    ]).encodeFunctionData("acceptOwnership");

    expect(batch.naraEvidence.status).to.equal("UNEXECUTED");
    expect(batch.naraEvidence.acceptOwnershipSelector).to.equal(selector);
    expect(batch.transactions).to.deep.equal([
      { to: batch.naraEvidence.hook, value: "0", data: selector, contractMethod: null, contractInputsValues: null },
      { to: batch.naraEvidence.vault, value: "0", data: selector, contractMethod: null, contractInputsValues: null },
    ]);
    expect(batch.transactions.every(({ to }) => to !== ZeroAddress)).to.equal(true);
  });

  it("pins a complete, passing canonical-receipt reconciliation", function () {
    const manifestPath =
      "deployments/v4-base-usdc-2026-08-08T22-16-06-220Z.json";
    const manifest = loadJson<DeploymentManifest>(manifestPath);
    const evidence = loadJson<ReceiptReconciliation>(
      "deployments/v4-base-usdc-receipt-reconciliation-2026-08-08.json",
    );
    const canonicalManifestBytes = readFileSync(manifestPath, "utf8").replace(/\r\n/g, "\n");
    const manifestHash = `0x${createHash("sha256")
      .update(canonicalManifestBytes)
      .digest("hex")}`;

    expect(evidence.chain.chainId).to.equal(manifest.chainId);
    expect(evidence.release.releaseCommit).to.equal(manifest.originCommit);
    expect(evidence.inputs.manifest.sha256).to.equal(manifestHash);
    expect(evidence.summary).to.include({
      expectedReceipts: 31,
      canonicalReceiptsFound: 31,
      successfulCanonicalReceipts: 31,
      journalZeroBlockHashes: 24,
      supplementedZeroBlockHashes: 24,
      nonZeroBlockHashMismatches: 0,
      otherFieldMismatches: 0,
      reconciledReceipts: 31,
      unreconciledReceipts: 0,
      result: "PASS",
    });
    expect(evidence.receipts).to.have.length(31);
    expect(
      evidence.receipts.every(
        ({ canonical, comparison }) =>
          canonical.status === 1 &&
          canonical.blockHash !== ZeroHash &&
          comparison.reconciled,
      ),
    ).to.equal(true);
  });
});
