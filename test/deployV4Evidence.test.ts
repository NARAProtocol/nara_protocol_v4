import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(resolve("scripts/deployV4BaseUsdc.ts"), "utf8");
const MAIN = SOURCE.slice(SOURCE.indexOf("async function main()"));
const SMOKE = readFileSync(resolve("scripts/smokeTestV4Deployment.ts"), "utf8");
const BUY = readFileSync(resolve("scripts/swapUsdcForNara.ts"), "utf8");

describe("v4 Base deployment evidence hardening", function () {
  it("requires a clean authoritative release commit already contained in origin/main", function () {
    expect(SOURCE).to.contain('env("V4_RELEASE_COMMIT")');
    expect(SOURCE).to.contain("/^[0-9a-f]{40}$/");
    expect(SOURCE).to.contain('gitOutput(["rev-parse", "HEAD"])');
    expect(SOURCE).to.contain('gitOutput(["status", "--porcelain=v1", "--untracked-files=all"])');
    expect(SOURCE).to.contain('gitOutput(["remote", "get-url", "origin"])');
    expect(SOURCE).to.contain('gitOutput(["ls-remote", "origin", "refs/heads/main"])');
    expect(SOURCE).to.contain('["merge-base", "--is-ancestor", requested, "origin/main"]');
    expect(SOURCE).to.contain("V4_RELEASE_COMMIT must exactly match the checked-out HEAD");
    expect(SOURCE).to.contain("not contained in the locally fetched origin/main");
    expect(SOURCE).to.contain("V4_ALLOW_LEGACY_ADDRESS_FALLBACKS\",");
    expect(SOURCE).to.contain("is forbidden on Base");
  });

  it("runs treasury, source, checkpoint, and live-fee funding gates before the first transaction", function () {
    const sourceGate = MAIN.indexOf("requireReviewedBaseReleaseSource()");
    const retryGate = MAIN.indexOf("refuseBlindBaseRetry()");
    const treasuryGate = MAIN.indexOf("TREASURY_PRIVATE_KEY does not match V4_TREASURY_ADDRESS");
    const balanceGate = MAIN.indexOf("deployerBalance < requiredDeployerBalanceWei");
    const journalStart = MAIN.indexOf("activeJournal = new DeploymentReceiptJournal");
    const firstDeployment = MAIN.indexOf('"deploy.NARALauncher"');
    for (const position of [sourceGate, retryGate, treasuryGate, balanceGate, journalStart, firstDeployment]) {
      expect(position).to.be.greaterThan(-1);
    }
    expect(sourceGate).to.be.lessThan(firstDeployment);
    expect(retryGate).to.be.lessThan(firstDeployment);
    expect(treasuryGate).to.be.lessThan(firstDeployment);
    expect(balanceGate).to.be.lessThan(firstDeployment);
    expect(journalStart).to.be.lessThan(firstDeployment);
    expect(MAIN).to.contain("BASE_SAFE_141_PROXY_CODEHASH");
    expect(MAIN).to.contain("BASE_SAFE_141_SINGLETON_CODEHASH");
    expect(MAIN).to.contain("approved Safe v1.4.1 2-of-3 configuration");
    expect(MAIN).to.contain("canonical Base Uniswap v4 PoolManager");
    expect(SOURCE).to.contain("const MIN_BASE_DEPLOYER_BALANCE_WEI = 1_000_000_000_000_000n");
    expect(SOURCE).to.contain("BASE_DEPLOYMENT_GAS_BUDGET * sampledFeePerGasWei * BASE_DEPLOYMENT_FEE_SAFETY_MULTIPLIER");
    expect(SOURCE).to.contain("feeBasedMinimumWei > MIN_BASE_DEPLOYER_BALANCE_WEI");
    expect(SOURCE).to.contain("baseDeployerFundingGate");
  });

  it("binds both smoke swap paths to the reviewed public wallet address", function () {
    for (const script of [SMOKE, BUY]) {
      expect(script).to.contain('requiredEnv("SWAP_WALLET_ADDRESS")');
      expect(script).to.contain("does not match SWAP_WALLET_ADDRESS");
    }
  });

  it("durably checkpoints every prepared, submitted, and confirmed transaction", function () {
    expect(SOURCE).to.contain("fsyncSync(fd)");
    expect(SOURCE).to.contain('this.persist("transaction_prepared")');
    expect(SOURCE).to.contain('this.persist("transaction_submitted")');
    expect(SOURCE).to.contain('this.persist("transaction_confirmed")');
    expect(SOURCE).to.contain('this.persist("deployment_failed_no_resume")');
    expect(SOURCE).to.contain("NO_BLIND_RETRY");
    expect(SOURCE).to.contain("A true automatic resume is unsupported");
    expect(SOURCE).to.contain("V4_EXISTING_LAUNCHER resume is forbidden on Base");
  });

  it("records deployments, all transaction receipts, runtime hashes, and constructor inputs", function () {
    expect(SOURCE).to.contain("deployContractRecorded(");
    expect(SOURCE.match(/deployContractRecorded\(/g)?.length ?? 0).to.be.greaterThanOrEqual(5);
    expect(SOURCE).to.contain("canonicalReceiptEvidence(tx.provider, tx.hash, receipt)");
    expect(SOURCE).to.contain("canonicalReceiptEvidence(transaction.provider, transaction.hash, rawReceipt)");
    expect(SOURCE).not.to.contain('typeof receipt.blockHash === "string" ? receipt.blockHash : null');
    expect(SOURCE).to.contain("deploymentReceipts");
    expect(SOURCE).to.contain("engineDeploymentTransactionHash: launchReceipt.transactionHash");
    expect(SOURCE).to.contain("engineDeploymentBlock: launchReceipt.blockNumber");
    expect(SOURCE).to.contain("rewardNotifierHistory");
    expect(SOURCE).to.contain("scanFromBlock: launchReceipt.blockNumber");
    expect(SOURCE).to.contain("verificationBlock");
    expect(SOURCE).to.contain("getCode(address, verificationBlock)");
    expect(SOURCE).to.contain("runtimeCodeHashes");
    expect(SOURCE).to.contain("safe: finalAdmin");
    expect(SOURCE).to.contain("const safeCodeHash = runtimeCodeHashes.safe?.codeHash ?? null");
    expect(SOURCE).to.contain("safeCodeHash,");
    expect(SOURCE).to.contain("constructorAndInputEvidence");
    expect(SOURCE).to.contain("originCommit: releaseSource?.releaseCommit ?? null");
    expect(SOURCE).to.contain("creationCodeHash: engineCreationCodeHash");
    expect(SOURCE).to.contain("initCodeHash: hookInitCodeHash");
    expect(SOURCE).to.contain("receiptJournal: journal.manifestEvidence()");
  });

  it("forbids evidence suppression on Base and redacts failure output", function () {
    expect(SOURCE).to.contain("V4_SKIP_DEPLOYMENT_LOG is forbidden on Base");
    expect(SOURCE).to.contain("safeErrorMessage(error)");
    expect(SOURCE).to.contain("Do not blindly retry. Reconcile the receipt journal and onchain state first.");
    expect(SOURCE).not.to.contain("console.error(error)");
  });
});
