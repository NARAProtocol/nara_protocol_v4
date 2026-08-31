import { expect } from "chai";
import { ethers } from "ethers";
import { basename, dirname, resolve } from "node:path";
import {
  assertTreasuryRangeFinalizationPersistenceSnapshot,
  buildTreasuryRangeManagerDeploymentEvidence,
  parseTreasuryRangeDeploymentPacket,
  retireTreasuryRangeDeploymentArtifacts,
  treasuryRangeDeploymentEvidencePath,
  treasuryRangeExecutedArtifactPath,
  type TreasuryRangeArtifactFileOperations,
  type TreasuryRangeFinalizationPersistenceSnapshot,
} from "../scripts/finalizeV4TreasuryRangeManagerDeployment.js";
import {
  CREATE2_DEPLOYER_ABI,
  TREASURY_RANGE_DEPLOYMENT_REVIEW_CHECKS,
} from "../scripts/lib/v4TreasuryRangeSafeBuilder.js";
import { BASE_MULTISEND_CALL_ONLY, BASE_MULTISEND_CALL_ONLY_CODEHASH } from "../scripts/lib/v4SafeEvidence.js";

const DEPLOYMENT_SAFE = "0x1000000000000000000000000000000000000001";
const TREASURY_SAFE = "0x2000000000000000000000000000000000000002";
const CREATE2_DEPLOYER = "0x3000000000000000000000000000000000000003";
const MANAGER_RUNTIME_HASH = `0x${"44".repeat(32)}`;
const BLOCK_HASH = `0x${"55".repeat(32)}`;
const STRATEGY_HASH = `0x${"66".repeat(32)}`;
const SAFE_TX_HASH = `0x${"77".repeat(32)}`;
const PACKED_HASH = `0x${"88".repeat(32)}`;
const SALT = `0x${"99".repeat(32)}`;
const INIT_CODE = "0x6000600055";
const INIT_CODE_HASH = ethers.keccak256(INIT_CODE);
const PREDICTED = ethers.getCreate2Address(CREATE2_DEPLOYER, SALT, INIT_CODE_HASH);

function packetFixture(): Record<string, unknown> {
  const deployData = new ethers.Interface(CREATE2_DEPLOYER_ABI).encodeFunctionData("deploy", [SALT, INIT_CODE]);
  const call = { to: CREATE2_DEPLOYER, value: "0", data: deployData };
  const blockTimestamp = 2_000_000_000;
  const validUntil = blockTimestamp + 900;
  const simulation = {
    safeTransaction: {
      to: ethers.getAddress(BASE_MULTISEND_CALL_ONLY),
      value: "0",
      data: "0x1234",
      operation: 1,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: ethers.ZeroAddress,
      refundReceiver: ethers.ZeroAddress,
      nonce: "7",
    },
    safeTxHash: SAFE_TX_HASH,
    packedTransactionsHash: PACKED_HASH,
    multiSendCallOnly: ethers.getAddress(BASE_MULTISEND_CALL_ONLY),
    multiSendCallOnlyCodeHash: BASE_MULTISEND_CALL_ONLY_CODEHASH,
    simulatedAtBlock: 123,
    simulation: "PASS: Safe.simulateAndRevert -> canonical MultiSendCallOnly.multiSend",
  };
  const review = {
    changeId: "NARA-TEST",
    purpose: "NARA v4 Treasury Range Manager deployment",
    noBroadcast: true,
    humanApprovalRequired: true,
    repositoryHead: "ab".repeat(20),
    strategyHash: STRATEGY_HASH,
    chainId: "8453",
    blockNumber: 123,
    blockHash: BLOCK_HASH,
    blockTimestamp,
    validUntil,
    signingSafeRole: "deployment_executor",
    signingSafe: { address: DEPLOYMENT_SAFE, nonce: "7" },
    safeRoles: { deploymentExecutorSafe: DEPLOYMENT_SAFE, treasuryRangeSafe: TREASURY_SAFE },
    calls: [call],
    simulation,
    runtime: {},
    externalDependencies: {},
    protectedRelease: {},
    checks: TREASURY_RANGE_DEPLOYMENT_REVIEW_CHECKS,
    details: {
      strategyPath: "deployments/v4-treasury-range-strategy-candidate.json",
      deployer: CREATE2_DEPLOYER,
      predictedManager: PREDICTED,
      salt: SALT,
      initCodeHash: INIT_CODE_HASH,
      initCodeBytes: ethers.getBytes(INIT_CODE).length,
      runtimeCodeHash: MANAGER_RUNTIME_HASH,
      runtimeBytes: 100,
      deploymentDeadline: String(validUntil),
      constructorArguments: {
        treasurySafe: TREASURY_SAFE,
        nara: "0x4000000000000000000000000000000000000004",
        usdc: "0x5000000000000000000000000000000000000005",
        liquidityVault: "0x6000000000000000000000000000000000000006",
        poolManager: "0x7000000000000000000000000000000000000007",
        positionManager: "0x8000000000000000000000000000000000000008",
        permit2: "0x9000000000000000000000000000000000000009",
        hook: "0xA00000000000000000000000000000000000000A",
        poolFee: 3000,
        tickSpacing: 60,
        poolId: `0x${"aa".repeat(32)}`,
      },
      safeRoles: { deploymentExecutorSafe: DEPLOYMENT_SAFE, treasuryRangeSafe: TREASURY_SAFE },
    },
  };
  return {
    version: "1.0",
    chainId: "8453",
    createdAt: blockTimestamp * 1_000,
    meta: {
      name: "UNEXECUTED NARA v4 Treasury Range Manager deployment",
      description: `Human-review-only packet; strategy ${STRATEGY_HASH}; nonce 7; expires ${validUntil}`,
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: DEPLOYMENT_SAFE,
      checksum: SAFE_TX_HASH,
    },
    transactions: [{ ...call, contractMethod: null, contractInputsValues: null }],
    naraEvidence: review,
  };
}

function parse(packet: Record<string, unknown>) {
  return parseTreasuryRangeDeploymentPacket(packet, {
    deploymentExecutorSafe: DEPLOYMENT_SAFE,
    treasuryRangeSafe: TREASURY_SAFE,
    create2Deployer: CREATE2_DEPLOYER,
  });
}

function fakeArtifactFileOperations(initialPaths: readonly string[], failRenameAt?: number) {
  const files = new Set(initialPaths.map((path) => resolve(path)));
  let renameCalls = 0;
  const operations: TreasuryRangeArtifactFileOperations = {
    exists: (path) => files.has(resolve(path)),
    rename: (source, destination) => {
      renameCalls += 1;
      if (renameCalls === failRenameAt) throw new Error(`injected rename failure ${renameCalls}`);
      const normalizedSource = resolve(source);
      const normalizedDestination = resolve(destination);
      if (!files.has(normalizedSource)) throw new Error(`missing source ${normalizedSource}`);
      if (files.has(normalizedDestination)) throw new Error(`destination exists ${normalizedDestination}`);
      files.delete(normalizedSource);
      files.add(normalizedDestination);
    },
  };
  return { files, operations };
}

describe("Treasury Range Manager deployment finalizer", function () {
  it("accepts only the exact unsigned deployment-executor Safe/CREATE2 packet", function () {
    const parsed = parse(packetFixture());
    expect(parsed.details.predictedManager).to.equal(PREDICTED);
    expect(parsed.details.constructorArguments.treasurySafe).to.equal(TREASURY_SAFE);
    expect(parsed.review.signingSafeRole).to.equal("deployment_executor");
    expect(parsed.review.safeRoles.deploymentExecutorSafe).to.equal(DEPLOYMENT_SAFE);
    expect(parsed.review.safeRoles.treasuryRangeSafe).to.equal(TREASURY_SAFE);
    expect(parsed.initCode).to.equal(INIT_CODE);
  });

  it("fails closed on role confusion, calldata drift, metadata drift, and extra fields", function () {
    const roleConfusion = packetFixture();
    (roleConfusion.naraEvidence as any).signingSafe.address = TREASURY_SAFE;
    expect(() => parse(roleConfusion)).to.throw(/Safe roles/);

    const calldataDrift = packetFixture();
    (calldataDrift.naraEvidence as any).details.initCodeHash = ethers.ZeroHash;
    expect(() => parse(calldataDrift)).to.throw(/details do not reproduce/);

    const metadataDrift = packetFixture();
    (metadataDrift.meta as any).checksum = ethers.ZeroHash;
    expect(() => parse(metadataDrift)).to.throw(/metadata/);

    const extraField = packetFixture();
    (extraField as any).broadcast = true;
    expect(() => parse(extraField)).to.throw(/missing or extra fields/);
  });

  it("emits v3 evidence with distinct roles and a sanitized 1-of-1 owner hash", function () {
    const parsed = parse(packetFixture());
    const rawOwner = "0xF00000000000000000000000000000000000000F";
    const candidate: any = {
      schemaVersion: "nara.v4.treasury-range-manager-deployment.v3",
      status: "deployed_verified",
      originCommit: "ab".repeat(20),
      deploymentTransactionHash: `0x${"bc".repeat(32)}`,
      deploymentBlock: 456,
      deploymentBlockHash: `0x${"cd".repeat(32)}`,
      predictedAddress: PREDICTED,
      deployedAddress: PREDICTED,
      runtimeCodeHash: MANAGER_RUNTIME_HASH,
      deploymentExecutorSafeExecution: {
        safe: DEPLOYMENT_SAFE,
        transactionHash: `0x${"bc".repeat(32)}`,
        safeTransactionHash: SAFE_TX_HASH,
        nonce: "7",
        executionSuccessLogIndex: 3,
        safeTransaction: parsed.simulation.safeTransaction,
        packedTransactionsHash: PACKED_HASH,
        multiSendCallOnly: ethers.getAddress(BASE_MULTISEND_CALL_ONLY),
        multiSendCallOnlyCodeHash: BASE_MULTISEND_CALL_ONLY_CODEHASH,
        innerCalls: parsed.calls,
      },
      treasuryRangeSafePolicy: {
        address: TREASURY_SAFE,
        runtimeCodeHash: `0x${"de".repeat(32)}`,
        version: "1.4.1",
        threshold: "1",
        ownerCount: 1,
        ownerSetHash: `0x${"ef".repeat(32)}`,
      },
      create2Deployment: {
        deployer: CREATE2_DEPLOYER,
        deployedAddress: PREDICTED,
        salt: SALT,
        initCodeHash: INIT_CODE_HASH,
        deployedLogIndex: 2,
      },
      constructorBindings: {
        ...parsed.details.constructorArguments,
        deploymentDeadline: parsed.details.deploymentDeadline,
      },
    };
    candidate.treasuryRangeSafePolicy.owners = [rawOwner];
    expect(() => buildTreasuryRangeManagerDeploymentEvidence(candidate)).to.throw(/missing or extra fields/);
    delete candidate.treasuryRangeSafePolicy.owners;
    const evidence = buildTreasuryRangeManagerDeploymentEvidence(candidate);
    expect(evidence.deploymentExecutorSafeExecution.safe).to.equal(DEPLOYMENT_SAFE);
    expect(evidence.treasuryRangeSafePolicy.address).to.equal(TREASURY_SAFE);
    expect(evidence.treasuryRangeSafePolicy.ownerCount).to.equal(1);
    expect(evidence.treasuryRangeSafePolicy.ownerSetHash).to.equal(`0x${"ef".repeat(32)}`);
    expect(JSON.stringify(evidence)).not.to.contain('"owners"');
    expect(JSON.stringify(evidence).toLowerCase()).not.to.contain(rawOwner.toLowerCase());
    expect(treasuryRangeDeploymentEvidencePath(456)).to.match(/v4-treasury-range-manager-deployment-456\.json$/);

    const stringBlock = JSON.parse(JSON.stringify(candidate));
    stringBlock.deploymentBlock = "456";
    expect(() => buildTreasuryRangeManagerDeploymentEvidence(stringBlock)).to.throw(/JSON non-negative safe integer/);

    const booleanLogIndex = JSON.parse(JSON.stringify(candidate));
    booleanLogIndex.create2Deployment.deployedLogIndex = true;
    expect(() => buildTreasuryRangeManagerDeploymentEvidence(booleanLogIndex)).to.throw(/JSON non-negative safe integer/);

    const stringTickSpacing = JSON.parse(JSON.stringify(candidate));
    stringTickSpacing.constructorBindings.tickSpacing = "60";
    expect(() => buildTreasuryRangeManagerDeploymentEvidence(stringTickSpacing)).to.throw(/JSON safe integer/);
  });

  it("maps the exact same-directory packet pair to EXECUTED-DO-NOT-IMPORT names", function () {
    const packetPath = resolve("deployments", "UNEXECUTED-v4-treasury-range-deployment-456-nonce-7.json");
    const reviewPath = packetPath.replace(/\.json$/, ".md");
    const retiredPacketPath = treasuryRangeExecutedArtifactPath(packetPath);
    const retiredReviewPath = treasuryRangeExecutedArtifactPath(reviewPath);
    expect(dirname(retiredPacketPath)).to.equal(dirname(packetPath));
    expect(dirname(retiredReviewPath)).to.equal(dirname(reviewPath));
    expect(basename(retiredPacketPath)).to.equal("EXECUTED-DO-NOT-IMPORT-v4-treasury-range-deployment-456-nonce-7.json");
    expect(basename(retiredReviewPath)).to.equal("EXECUTED-DO-NOT-IMPORT-v4-treasury-range-deployment-456-nonce-7.md");
    expect(() => treasuryRangeExecutedArtifactPath(resolve("deployments", "other.json"))).to.throw(/canonical UNEXECUTED/);
  });

  it("retires both artifacts without overwrite and rolls back a synchronous pair failure", function () {
    const packetPath = resolve("deployments", "UNEXECUTED-v4-treasury-range-deployment-456-nonce-7.json");
    const reviewPath = packetPath.replace(/\.json$/, ".md");
    const retiredPacketPath = treasuryRangeExecutedArtifactPath(packetPath);
    const retiredReviewPath = treasuryRangeExecutedArtifactPath(reviewPath);

    const collision = fakeArtifactFileOperations([packetPath, reviewPath, retiredPacketPath]);
    expect(() => retireTreasuryRangeDeploymentArtifacts(packetPath, reviewPath, collision.operations))
      .to.throw(/Refusing to overwrite/);
    expect(collision.files.has(packetPath)).to.equal(true);
    expect(collision.files.has(reviewPath)).to.equal(true);

    const rollback = fakeArtifactFileOperations([packetPath, reviewPath], 2);
    expect(() => retireTreasuryRangeDeploymentArtifacts(packetPath, reviewPath, rollback.operations))
      .to.throw(/rolled back/);
    expect(rollback.files.has(packetPath)).to.equal(true);
    expect(rollback.files.has(reviewPath)).to.equal(true);
    expect(rollback.files.has(retiredPacketPath)).to.equal(false);
    expect(rollback.files.has(retiredReviewPath)).to.equal(false);

    const success = fakeArtifactFileOperations([packetPath, reviewPath]);
    const retired = retireTreasuryRangeDeploymentArtifacts(packetPath, reviewPath, success.operations);
    expect(retired).to.deep.equal({ packetPath: retiredPacketPath, reviewPath: retiredReviewPath });
    expect(success.files.has(packetPath)).to.equal(false);
    expect(success.files.has(reviewPath)).to.equal(false);
    expect(success.files.has(retiredPacketPath)).to.equal(true);
    expect(success.files.has(retiredReviewPath)).to.equal(true);
  });

  it("fails closed if HEAD, receipt, deployment block, or readback block changes before persistence", function () {
    const snapshot: TreasuryRangeFinalizationPersistenceSnapshot = {
      repositoryHead: "ab".repeat(20),
      deploymentReceipt: "receipt-fingerprint",
      deploymentBlock: { number: 456, hash: `0x${"cd".repeat(32)}` },
      readbackBlock: { number: 460, hash: `0x${"de".repeat(32)}` },
    };
    expect(() => assertTreasuryRangeFinalizationPersistenceSnapshot(snapshot, structuredClone(snapshot))).not.to.throw();
    const changed = [
      { ...snapshot, repositoryHead: "ef".repeat(20) },
      { ...snapshot, deploymentReceipt: "changed-receipt" },
      { ...snapshot, deploymentBlock: { ...snapshot.deploymentBlock, hash: ethers.ZeroHash } },
      { ...snapshot, readbackBlock: { ...snapshot.readbackBlock, hash: ethers.ZeroHash } },
    ];
    for (const candidate of changed) {
      expect(() => assertTreasuryRangeFinalizationPersistenceSnapshot(snapshot, candidate))
        .to.throw(/changed immediately before persistence/);
    }
  });
});
