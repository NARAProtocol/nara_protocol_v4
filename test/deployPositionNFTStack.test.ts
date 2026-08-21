import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import {
  POSITION_NFT_PHASE2_CHAIN_ID,
  POSITION_NFT_PHASE2_CHANGE_ID,
  POSITION_NFT_PHASE2_CONTRACTS,
  POSITION_NFT_PHASE2_REQUIRED_CI_JOBS,
  assertPositionNftPhase2GateAttestation,
  assertCanonicalPositionNftPhase2Policy,
  buildPositionNftPhase2FinalizationBatch,
  canonicalPositionNftPhase2Policy,
  type PositionNftPhase2Policy,
} from "../scripts/lib/v4PositionNftPhase2.js";
import { decodeMultiSendCalls, decodeSafeSimulationResult } from "../scripts/lib/v4SafeBatch.js";
import { encodeSafeMultiSendTransactions } from "../scripts/lib/v4AtomicPoolLaunch.js";
import { assertPositionNftSourceVerificationEvidence } from "../scripts/lib/v4PositionNftSourceVerification.js";
import {
  activeRewardNotifierHolders,
  assertRewardNotifierHistoryUnchanged,
  type RewardNotifierContainmentEvidence,
} from "../scripts/lib/v4RewardNotifierContainment.js";

const repoRoot = resolve(import.meta.dirname, "..");
const safe = "0x1111111111111111111111111111111111111111";
const positionNft = "0x2222222222222222222222222222222222222222";
const treasury = "0x4444444444444444444444444444444444444444";
const sourceCommit = "a".repeat(40);
const evidenceCommit = "b".repeat(40);
const evidencePrefix = "release-evidence/NARA-20260821-v4-position-nft-phase2/";

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function changed(
  policy: PositionNftPhase2Policy,
  patch: Partial<PositionNftPhase2Policy>,
): PositionNftPhase2Policy {
  return { ...policy, ...patch };
}

function gateAttestation(): any {
  const predictedAddresses = Object.fromEntries(
    POSITION_NFT_PHASE2_CONTRACTS.map((name, index) => [
      name,
      ethers.getAddress(`0x${(index + 10).toString(16).padStart(40, "0")}`),
    ]),
  );
  const file = (name: string) => `${evidencePrefix}${name}`;
  const hash = "c".repeat(64);
  return {
    schemaVersion: 1,
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    sourceCommit,
    evidenceCommit,
    ci: {
      status: "pass",
      repository: "NARAProtocol/nara_protocol_v4",
      headSha: evidenceCommit,
      runUrl: "https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/123",
      workflowPath: ".github/workflows/ci.yml",
      requiredJobs: [...POSITION_NFT_PHASE2_REQUIRED_CI_JOBS],
    },
    sourceCi: {
      status: "pass",
      repository: "NARAProtocol/nara_protocol_v4",
      headSha: sourceCommit,
      runUrl: "https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/122",
      workflowPath: ".github/workflows/ci.yml",
      requiredJobs: [...POSITION_NFT_PHASE2_REQUIRED_CI_JOBS],
    },
    releaseControl: {
      status: "pass",
      repository: "NARAProtocol/nara_protocol_v4",
      protectedBranch: "main",
      sourceCommitSignatureVerified: true,
      evidenceCommitSignatureVerified: true,
      sourcePullRequestNumber: 30,
      sourcePullRequestUrl: "https://github.com/NARAProtocol/nara_protocol_v4/pull/30",
      evidencePullRequestNumber: 31,
      evidencePullRequestUrl: "https://github.com/NARAProtocol/nara_protocol_v4/pull/31",
      mergedToProtectedMain: true,
      administratorsEnforced: true,
      signedCommitsRequired: true,
      linearHistoryRequired: true,
      forcePushesAllowed: false,
      branchDeletionAllowed: false,
      conversationResolutionRequired: true,
      canonicalCiRequired: true,
      noBypassActors: true,
    },
    staticAnalysis: {
      status: "pass",
      analyzedCommit: sourceCommit,
      slitherReportSha256: hash,
      slitherReportPath: file("slither.json"),
      aderynReportSha256: hash,
      aderynReportPath: file("aderyn.json"),
      echidnaReportSha256: hash,
      echidnaReportPath: file("echidna.json"),
      allFindingsReconciled: true,
    },
    artifactBuild: {
      status: "pass",
      sourceCommit,
      evidencePath: file("artifact-build.json"),
      evidenceSha256: hash,
    },
    independentAudit: {
      status: "pass",
      auditedCommit: sourceCommit,
      reportPath: file("independent-audit.md"),
      reportSha256: hash,
      unresolvedConfirmedIssues: 0,
    },
    artQa: {
      status: "pass",
      reviewedCommit: sourceCommit,
      evidencePath: file("art-qa.json"),
      evidenceSha256: hash,
      browser: "Chromium",
      marketplaceDecoder: "OpenSea-compatible metadata decoder",
      thumbnailSizes: [64, 128, 300],
      backgrounds: ["light", "neutral", "dark"],
    },
    roadmapGate: {
      status: "approved",
      evidencePath: file("roadmap-gate.json"),
      evidenceSha256: hash,
      marketCapFloorTargetUsd: 100000,
      sequenceDecision: "nft_deployment_authorized_before_floor",
      strategicBufferReviewed: true,
      observedAtBlock: 1,
      observedAtBlockHash: `0x${"d".repeat(64)}`,
    },
    deploymentPlan: {
      status: "approved",
      deployer: "0x3333333333333333333333333333333333333333",
      expectedStartNonce: 7,
      predictedAddresses,
      dedicatedIdleSigner: true,
      noPriorPhase2Attempt: true,
      observedAtBlock: 2,
      observedAtBlockHash: `0x${"e".repeat(64)}`,
      validUntilBlock: 43_202,
      evidencePath: file("deployment-plan.json"),
      evidenceSha256: hash,
    },
    productionPolicy: {
      status: "approved",
      ownerSafe: safe,
      royaltyReceiver: treasury,
      royaltyBps: 1000,
      naraClaimFeeBps: 0,
      tokenClaimFeeBps: 0,
      claimFeeRecipient: ethers.ZeroAddress,
      resetThenFreezeFees: true,
      genesisDistributorDeferred: true,
      dataLensDeferred: true,
      genesisMintersRemainConfigurable: true,
      permissionlessMintFromDeploymentAcknowledged: true,
    },
    humanApproval: {
      status: "approved",
      reference: "release approval record",
      approvedAt: "2026-08-21T12:00:00.000Z",
    },
  };
}

describe("Position NFT Phase-2 deployment policy", () => {
  it("pins the change ID, Base chain, and exact seven-contract roadmap scope", () => {
    expect(POSITION_NFT_PHASE2_CHANGE_ID).to.equal("NARA-20260821-v4-position-nft-phase2");
    expect(POSITION_NFT_PHASE2_CHAIN_ID).to.equal(8453n);
    expect([...POSITION_NFT_PHASE2_CONTRACTS]).to.deep.equal([
      "NARAArtMetadataV1",
      "NARAArtSecurityPrintV1",
      "NARAArtCorePlateV1",
      "NARAArtGenesisPlateV1",
      "NARAPositionRendererV5",
      "NARAPositionAccountV4",
      "NARAPositionNFTV4",
    ]);
  });

  it("uses Safe ownership, fixed treasury royalties, zero claim fees, and defers later phases", () => {
    const policy = canonicalPositionNftPhase2Policy(safe, treasury);
    expect(() => assertCanonicalPositionNftPhase2Policy(policy, safe, treasury)).not.to.throw();
    expect(policy).to.deep.include({
      owner: ethers.getAddress(safe),
      royaltyReceiver: ethers.getAddress(treasury),
      royaltyBps: 1000,
      naraClaimFeeBps: 0,
      tokenClaimFeeBps: 0,
      claimFeeRecipient: ethers.ZeroAddress,
      freezeRoyalties: true,
      freezeClaimFees: true,
      deployGenesisDistributor: false,
      deployDataLens: false,
      freezeGenesisMinters: false,
    });
  });

  it("rejects every policy deviation that could widen authority or Phase-2 scope", () => {
    const policy = canonicalPositionNftPhase2Policy(safe, treasury);
    const invalidPolicies: Array<Partial<PositionNftPhase2Policy>> = [
      { owner: positionNft },
      { royaltyReceiver: safe },
      { royaltyBps: 999 },
      { naraClaimFeeBps: 1 },
      { tokenClaimFeeBps: 1 },
      { claimFeeRecipient: safe },
      { freezeRoyalties: false },
      { freezeClaimFees: false },
      { deployGenesisDistributor: true },
      { deployDataLens: true },
      { freezeGenesisMinters: true },
    ];

    for (const policyPatch of invalidPolicies) {
      expect(
        () => assertCanonicalPositionNftPhase2Policy(changed(policy, policyPatch), safe, treasury),
        JSON.stringify(policyPatch),
      ).to.throw();
    }
  });

  it("builds a deterministic Safe batch that pins 10% treasury royalties and zero claim fees before freezing", () => {
    const batch = buildPositionNftPhase2FinalizationBatch(safe, positionNft, treasury, {
      releaseCommit: "a".repeat(40),
    }, 1_777_777_777_000);
    const iface = new ethers.Interface([
      "function setDefaultRoyalty(address receiver,uint96 feeNumerator)",
      "function setClaimFees(uint16 naraClaimFeeBps,uint16 tokenClaimFeeBps)",
      "function setClaimFeeRecipient(address recipient)",
      "function freezeRoyalties()",
      "function freezeClaimFees()",
    ]);

    expect(batch.chainId).to.equal("8453");
    expect(batch.createdAt).to.equal(1_777_777_777_000);
    expect(batch.meta.name).to.match(/^UNEXECUTED/);
    expect(batch.meta.createdFromSafeAddress).to.equal(ethers.getAddress(safe));
    expect(batch.transactions).to.deep.equal([
      {
        to: ethers.getAddress(positionNft),
        value: "0",
        data: iface.encodeFunctionData("setDefaultRoyalty", [treasury, 1000]),
        contractMethod: null,
        contractInputsValues: null,
      },
      {
        to: ethers.getAddress(positionNft),
        value: "0",
        data: iface.encodeFunctionData("setClaimFees", [0, 0]),
        contractMethod: null,
        contractInputsValues: null,
      },
      {
        to: ethers.getAddress(positionNft),
        value: "0",
        data: iface.encodeFunctionData("setClaimFeeRecipient", [ethers.ZeroAddress]),
        contractMethod: null,
        contractInputsValues: null,
      },
      {
        to: ethers.getAddress(positionNft),
        value: "0",
        data: iface.encodeFunctionData("freezeRoyalties"),
        contractMethod: null,
        contractInputsValues: null,
      },
      {
        to: ethers.getAddress(positionNft),
        value: "0",
        data: iface.encodeFunctionData("freezeClaimFees"),
        contractMethod: null,
        contractInputsValues: null,
      },
    ]);
    expect(batch.naraEvidence).to.deep.include({
      changeId: POSITION_NFT_PHASE2_CHANGE_ID,
      positionNft: ethers.getAddress(positionNft),
      releaseCommit: "a".repeat(40),
    });
    expect(batch.naraEvidence.intendedPostState).to.deep.include({
      royaltyReceiver: ethers.getAddress(treasury),
      royaltyBps: 1000,
      royaltiesFrozen: true,
      naraClaimFeeBps: 0,
      tokenClaimFeeBps: 0,
      claimFeeRecipient: ethers.ZeroAddress,
      claimFeesFrozen: true,
    });

    const rehearsalBatch = buildPositionNftPhase2FinalizationBatch(safe, positionNft, treasury, {
      deploymentMode: "rehearse",
      releaseCommit: null,
    }, 1_777_777_777_000);
    expect(rehearsalBatch.meta.name).to.match(/^REHEARSAL - DO NOT IMPORT/);
    expect(rehearsalBatch.meta.description).to.contain("must never be imported or signed");
    expect(rehearsalBatch.naraEvidence.rehearsalWarning).to.equal(
      "FORK_REHEARSAL_DO_NOT_IMPORT_OR_SIGN",
    );
  });

  it("accepts only the exact two-commit release gate and rejects traversal or incomplete deployment plans", () => {
    const attestation = gateAttestation();
    expect(() => assertPositionNftPhase2GateAttestation(attestation, evidenceCommit, safe, treasury)).not.to.throw();

    const traversal = structuredClone(attestation);
    traversal.independentAudit.reportPath = `${evidencePrefix}../../package.json`;
    expect(() => assertPositionNftPhase2GateAttestation(traversal, evidenceCommit, safe, treasury)).to.throw(
      "repository-relative",
    );

    const incomplete = structuredClone(attestation);
    delete incomplete.deploymentPlan.predictedAddresses.NARAPositionNFTV4;
    expect(() => assertPositionNftPhase2GateAttestation(incomplete, evidenceCommit, safe, treasury)).to.throw(
      "exact seven",
    );

    const wrongTreasury = structuredClone(attestation);
    wrongTreasury.productionPolicy.royaltyReceiver = safe;
    expect(() => assertPositionNftPhase2GateAttestation(wrongTreasury, evidenceCommit, safe, treasury)).to.throw(
      "canonical Phase-2 policy",
    );

    const unprotected = structuredClone(attestation);
    unprotected.releaseControl.signedCommitsRequired = false;
    expect(() => assertPositionNftPhase2GateAttestation(unprotected, evidenceCommit, safe, treasury)).to.throw(
      "release-control evidence",
    );

    const leakedRoot = structuredClone(attestation);
    leakedRoot.apiKey = "must-not-be-embedded";
    expect(() => assertPositionNftPhase2GateAttestation(leakedRoot, evidenceCommit, safe, treasury)).to.throw(
      "unapproved extra fields",
    );

    const leakedNested = structuredClone(attestation);
    leakedNested.releaseControl.privateNote = "must-not-be-embedded";
    expect(() => assertPositionNftPhase2GateAttestation(leakedNested, evidenceCommit, safe, treasury)).to.throw(
      "unapproved extra fields",
    );
  });

  it("decodes Safe simulation payloads fail-closed and preserves exact MultiSend call order", () => {
    const successPayload = ethers.hexlify(ethers.concat([
      ethers.zeroPadValue("0x01", 32),
      ethers.zeroPadValue("0x02", 32),
      "0x1234",
    ]));
    expect(decodeSafeSimulationResult(successPayload)).to.deep.equal({ succeeded: true, response: "0x1234" });
    expect(() => decodeSafeSimulationResult("0x01")).to.throw("shorter than two words");

    const calls = [
      { operation: 0 as const, to: safe, value: "0", data: "0x1234" },
      { operation: 0 as const, to: positionNft, value: "7", data: "0xabcd" },
    ];
    const packed = encodeSafeMultiSendTransactions(calls);
    expect(decodeMultiSendCalls(packed)).to.deep.equal(calls.map(({ to, value, data }) => ({
      to: ethers.getAddress(to),
      value,
      data,
    })));
    expect(() => decodeMultiSendCalls(`${packed}00`)).to.throw();
  });

  it("reconstructs reward-notifier holders and rejects even transient post-baseline role history", () => {
    const account = "0x5555555555555555555555555555555555555555";
    const grant = {
      kind: "grant" as const,
      account,
      blockNumber: 10,
      transactionIndex: 0,
      logIndex: 0,
    };
    const revoke = {
      kind: "revoke" as const,
      account,
      blockNumber: 11,
      transactionIndex: 0,
      logIndex: 0,
    };
    expect(activeRewardNotifierHolders([grant])).to.deep.equal([ethers.getAddress(account)]);
    expect(activeRewardNotifierHolders([grant, revoke])).to.deep.equal([]);

    const baseline: RewardNotifierContainmentEvidence = {
      engine: positionNft,
      launcher: safe,
      token: account,
      treasury,
      role: ethers.id("REWARD_NOTIFIER_ROLE"),
      deploymentBlock: 10,
      deploymentBlockHash: `0x${"1".repeat(64)}`,
      deploymentTransactionHash: `0x${"2".repeat(64)}`,
      verifiedAtBlock: 12,
      verifiedAtBlockHash: `0x${"3".repeat(64)}`,
      historyLogCount: 2,
      grantCount: 1,
      revokeCount: 1,
      everGrantedAccounts: [ethers.getAddress(account)],
      reconstructedActiveHolders: [],
      onchainActiveHolders: [],
    };
    const unchanged = {
      ...baseline,
      verifiedAtBlock: 20,
      verifiedAtBlockHash: `0x${"4".repeat(64)}`,
    };
    expect(() => assertRewardNotifierHistoryUnchanged(baseline, unchanged, "test")).not.to.throw();
    expect(() => assertRewardNotifierHistoryUnchanged(baseline, {
      ...unchanged,
      historyLogCount: 4,
      grantCount: 2,
      revokeCount: 2,
    }, "test")).to.throw("history drift");
  });

  it("keeps plan as the default and excludes every later-phase or unsafe legacy action", () => {
    const deployment = source("scripts/deployPositionNFTStack.ts");
    expect(deployment).to.contain('optionalEnv("V4_POSITION_NFT_MODE") ?? "plan"');
    expect(deployment).to.contain("assertProductionV4Runtime");
    expect(deployment).to.contain("canonicalReceiptEvidence");
    expect(deployment).to.contain("V4_POSITION_NFT_EXECUTION_CONFIRM");
    expect(deployment).to.contain("V4_POSITION_NFT_RELEASE_COMMIT");

    for (const forbidden of [
      "NARAGenesisRewardDistributorV4",
      "NARAPositionDataLensV1",
      "DRY_RUN",
      "transferOwnership",
    ]) {
      expect(deployment, forbidden).not.to.contain(forbidden);
    }
    expect(deployment).to.contain("Pre-NARAPositionNFTV4 creation");
    for (const guarded of [
      "scripts/buildPositionNFTPhase2Finalization.ts",
      "scripts/finalizePositionNFTPhase2Evidence.ts",
      "scripts/verifyPositionNFTPhase2.ts",
    ]) {
      expect(source(guarded), guarded).to.contain("assertRewardNotifierHistoryUnchanged");
    }
  });

  it("requires source proof before Safe signing and keeps art QA append-only and source-bound", () => {
    const builder = source("scripts/buildPositionNFTPhase2Finalization.ts");
    const sourceProofIndex = builder.indexOf("assertPositionNftSourceVerificationEvidence");
    const signingPacketIndex = builder.indexOf("const signingPacket =");
    expect(sourceProofIndex).to.be.greaterThan(-1);
    expect(builder).to.contain("queryBaseScanSourceProof");
    expect(builder).to.contain("sourceVerificationArtifact");
    expect(sourceProofIndex).to.be.lessThan(signingPacketIndex);

    const preview = source("scripts/previewPositionArt.ts");
    expect(preview).to.contain('resolve(REPOSITORY_ROOT, ".nara-art-qa")');
    expect(preview).to.contain('flag: "wx"');
    expect(preview).not.to.contain("rmSync");
    expect(preview).to.contain("metadata-qa.html");
    expect(preview).to.contain("qa-manifest.json");
    expect(preview).to.contain("sourceArtifacts");
    expect(preview).to.contain("sourceCommit");
  });

  it("keeps every legacy NFT preview or mock helper off Base", () => {
    for (const helper of ["scripts/generate-mock-nfts.ts", "scripts/print-svg-3.ts"]) {
      const helperSource = source(helper);
      expect(helperSource, helper).to.contain('hre.globalOptions.network ?? "default"');
      expect(helperSource, helper).to.contain('networkName !== "default" && networkName !== "hardhat"');
      expect(helperSource, helper).to.contain("network.chainId !== 31_337n");
      expect(helperSource, helper).to.contain("POSITION_NFT_PHASE2_ROYALTY_BPS");
      expect(helperSource, helper).not.to.match(/\n\s*500\s*[,)]/);
      expect(helperSource.indexOf("network.chainId !== 31_337n"), helper).to.be.lessThan(
        helperSource.indexOf("ethers.getSigners()"),
      );
    }

    const retiredPreview = source("scripts/generateNftPreview.ts");
    expect(retiredPreview).to.contain("QUARANTINED");
    expect(retiredPreview).to.contain("npm run preview:v4:position-nft-art");
    expect(retiredPreview).not.to.contain("getContractFactory");
  });

  it("quarantines every NFT-dependent Phase-3 deployer before network access", () => {
    for (const helper of ["scripts/deployRouterLens.ts", "scripts/deployComposabilityV4.ts"]) {
      const helperSource = source(helper);
      const quarantineIndex = helperSource.indexOf("QUARANTINED:");
      const connectIndex = helperSource.indexOf("network.connect()");
      expect(quarantineIndex, helper).to.be.greaterThan(-1);
      expect(connectIndex, helper).to.be.greaterThan(-1);
      expect(quarantineIndex, helper).to.be.lessThan(connectIndex);
      expect(helperSource, helper).to.contain("Phase 3");
      expect(helperSource, helper).to.contain("finalized Position NFT manifest");
    }
  });

  it("rejects unapproved fields before source-verification evidence can enter a signing packet", async () => {
    const base = {
      schemaVersion: 1,
      chainId: "8453",
      status: "verified",
      sourceCommit,
      evidenceCommit,
      pendingManifest: { path: "deployments/pending.json", sha256: "d".repeat(64) },
      contracts: {},
    };
    const context = {
      sourceCommit,
      evidenceCommit,
      pendingManifestPath: "deployments/pending.json",
      pendingManifestSha256: "d".repeat(64),
      contracts: {},
      sourceArtifacts: {},
      artifacts: { readArtifact: async () => ({}) },
    };
    for (const value of [
      { ...base, apiKey: "must-not-be-embedded" },
      { ...base, pendingManifest: { ...base.pendingManifest, privateNote: "must-not-be-embedded" } },
    ]) {
      let message = "";
      try {
        await assertPositionNftSourceVerificationEvidence(value, context);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).to.contain("unapproved extra fields");
    }
  });

  it("pins the three command wrappers and production evidence path", () => {
    const deployment = source("scripts/deployPositionNFTStack.ts");
    const verifier = source("scripts/verifyPositionNFTPhase2.ts");
    expect(deployment).to.contain("REHEARSAL-DO-NOT-IMPORT-v4-position-nft-phase2-finalization-");
    expect(deployment).to.contain("embedded_only_pending_source_verification");
    expect(deployment).to.contain("No standalone Safe import was written");
    expect(deployment).to.contain("stale or partial Safe artifacts exist");
    expect(deployment).to.contain("durableWriteNew(manifestPath");
    expect(verifier).to.contain("Same-process rehearsal Safe batch evidence is missing");
    expect(verifier).to.contain(
      "Pending production batch must remain embedded-only until all-seven source verification passes",
    );
    expect(source("scripts/planPositionNFTPhase2.ts")).to.contain(
      'process.env.V4_POSITION_NFT_MODE = "plan"',
    );
    expect(source("scripts/planPositionNFTPhase2.ts")).to.contain(
      'process.env.V4_POSITION_NFT_WRITE_PLAN_EVIDENCE = "0"',
    );
    expect(source("scripts/rehearsePositionNFTPhase2.ts")).to.contain(
      'process.env.V4_POSITION_NFT_MODE = "rehearse"',
    );
    expect(source("scripts/rehearsePositionNFTPhase2.ts")).to.contain(
      'await import("./verifyRehearsalPositionNFTPhase2.js")',
    );
    expect(source("scripts/verifyRehearsalPositionNFTPhase2.ts")).to.contain(
      "__NARA_POSITION_NFT_REHEARSAL_MANIFEST__",
    );
    expect(source("scripts/executePositionNFTPhase2.ts")).to.contain(
      'process.env.V4_POSITION_NFT_MODE = "execute"',
    );

    const packageJson = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["plan:v4:position-nft"]).to.equal(
      "hardhat run scripts/planPositionNFTPhase2.ts --network base",
    );
    expect(packageJson.scripts["rehearse:v4:position-nft"]).to.equal(
      "hardhat run scripts/rehearsePositionNFTPhase2.ts --network baseFork",
    );
    expect(packageJson.scripts["deploy:v4:position-nft"]).to.equal(
      "hardhat run scripts/executePositionNFTPhase2.ts --network base",
    );
    expect(packageJson.scripts["verify:v4:allocations"]).to.equal(
      "node scripts/refuseRetiredV4Allocations.mjs",
    );
    expect(source("scripts/verifyV4AllocationsLive.ts")).to.contain("QUARANTINED");
    expect(source(".gitignore")).to.contain(
      "!deployments/v4-position-nft-phase2-2026-08-21.json",
    );
    expect(source(".gitignore")).to.contain(
      "!deployments/v4-position-nft-phase2-finalized-2026-08-21.json",
    );
    expect(packageJson.scripts["build:v4:position-nft-finalization"]).to.contain(
      "verifyPendingPositionNFTPhase2.ts",
    );
    expect(packageJson.scripts["verify:v4:position-nft"]).to.equal(
      "hardhat run scripts/verifyFinalPositionNFTPhase2.ts --network base",
    );
    expect(source("scripts/verifyFinalPositionNFTPhase2.ts")).to.contain(
      'process.env.V4_POSITION_NFT_ALLOW_PENDING = "0"',
    );
    expect(source("scripts/verifyFinalPositionNFTPhase2.ts")).to.contain(
      'process.env.V4_POSITION_NFT_ALLOW_REHEARSAL = "0"',
    );
    expect(packageJson.scripts["finalize:v4:position-nft-evidence"]).to.contain(
      "verifyFinalPositionNFTPhase2.ts --network base",
    );
    expect(packageJson.scripts["finalize:v4:position-nft-evidence"]).to.contain(
      "quarantinePositionNFTPhase2SafeArtifacts.ts",
    );
    const quarantine = source("scripts/quarantinePositionNFTPhase2SafeArtifacts.ts");
    expect(quarantine).to.contain("EXECUTED-DO-NOT-IMPORT-v4-position-nft-phase2-");
    expect(quarantine).to.contain("renameSync");
    expect(quarantine).not.to.contain("unlinkSync");
    const incompleteQuarantine = source("scripts/quarantineIncompletePositionNFTPhase2SafeArtifacts.ts");
    expect(incompleteQuarantine).to.contain("INCOMPLETE-DO-NOT-IMPORT-");
    expect(incompleteQuarantine).to.contain("V4_POSITION_NFT_INCOMPLETE_QUARANTINE_CONFIRM");
    expect(incompleteQuarantine).not.to.contain("unlinkSync");
  });
});
