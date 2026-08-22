import { ethers } from "ethers";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const POSITION_NFT_PHASE2_CHANGE_ID = "NARA-20260821-v4-position-nft-phase2";
export const POSITION_NFT_PHASE2_CHAIN_ID = 8453n;
export const POSITION_NFT_PHASE2_ROYALTY_BPS = 1_000;
export const POSITION_NFT_PHASE2_REQUIRED_CI_JOBS = [
  "build \u00b7 test \u00b7 size",
  "slither (advisory)",
  "aderyn (advisory)",
  "echidna (advisory)",
] as const;

export const POSITION_NFT_PHASE2_CONTRACTS = [
  "NARAArtMetadataV1",
  "NARAArtSecurityPrintV1",
  "NARAArtCorePlateV1",
  "NARAArtGenesisPlateV1",
  "NARAPositionRendererV5",
  "NARAPositionAccountV4",
  "NARAPositionNFTV4",
] as const;

export type PositionNftPhase2ContractName = (typeof POSITION_NFT_PHASE2_CONTRACTS)[number];

export const POSITION_NFT_PHASE2_FQNS: Readonly<Record<PositionNftPhase2ContractName, string>> = {
  NARAArtMetadataV1: "contracts/v4/NARAArtMetadataV1.sol:NARAArtMetadataV1",
  NARAArtSecurityPrintV1: "contracts/v4/NARAArtSecurityPrintV1.sol:NARAArtSecurityPrintV1",
  NARAArtCorePlateV1: "contracts/v4/NARAArtCorePlateV1.sol:NARAArtCorePlateV1",
  NARAArtGenesisPlateV1: "contracts/v4/NARAArtGenesisPlateV1.sol:NARAArtGenesisPlateV1",
  NARAPositionRendererV5: "contracts/v4/NARAPositionRendererV5.sol:NARAPositionRendererV5",
  NARAPositionAccountV4: "contracts/v4/NARAPositionAccountV4.sol:NARAPositionAccountV4",
  NARAPositionNFTV4: "contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4",
};

export const POSITION_NFT_PHASE2_FINALIZATION_CALLS = [
  "setDefaultRoyalty(production.treasury,1000)",
  "setClaimFees(0,0)",
  "setClaimFeeRecipient(0x0000000000000000000000000000000000000000)",
  "freezeRoyalties()",
  "freezeClaimFees()",
] as const;

export const POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT = Object.freeze({
  status: "embedded_only_pending_source_verification",
  path: null,
  instruction: "Do not extract or import. The JIT builder emits the only production Safe import after source verification.",
});

export function canonicalPositionNftPhase2RehearsalBatchArtifact(path: string) {
  return {
    status: "rehearsal_do_not_import",
    path,
    instruction: "Fork rehearsal only. Never import, sign, send, execute, rename, or promote this artifact.",
  };
}

export interface PositionNftArtifactEvidence {
  fullyQualifiedName: string;
  sourceName: string;
  contractName: string;
  sourceSha256: string;
  artifactSha256: string;
  abiSha256: string;
  creationBytecodeHash: string;
  deployedBytecodeTemplateHash: string;
  compilerInputSha256: string;
  compilerSourcesSha256: string;
  contractMetadataSha256: string;
  solcVersion: string;
  solcLongVersion: string;
  compilerSettings: {
    optimizer: unknown;
    viaIR: unknown;
    evmVersion: unknown;
    metadata: unknown;
  };
}

export interface PositionNftPhase2GateAttestation {
  schemaVersion: 1;
  changeId: string;
  sourceCommit: string;
  evidenceCommit: string;
  ci: {
    status: "pass";
    repository: "NARAProtocol/nara_protocol_v4";
    headSha: string;
    runUrl: string;
    workflowPath: ".github/workflows/ci.yml";
    requiredJobs: typeof POSITION_NFT_PHASE2_REQUIRED_CI_JOBS;
  };
  sourceCi: {
    status: "pass";
    repository: "NARAProtocol/nara_protocol_v4";
    headSha: string;
    runUrl: string;
    workflowPath: ".github/workflows/ci.yml";
    requiredJobs: typeof POSITION_NFT_PHASE2_REQUIRED_CI_JOBS;
  };
  releaseControl: {
    status: "pass";
    repository: "NARAProtocol/nara_protocol_v4";
    protectedBranch: "main";
    sourceCommitSignatureVerified: true;
    evidenceCommitSignatureVerified: true;
    sourcePullRequestNumber: number;
    sourcePullRequestUrl: string;
    evidencePullRequestNumber: number;
    evidencePullRequestUrl: string;
    mergedToProtectedMain: true;
    administratorsEnforced: true;
    signedCommitsRequired: true;
    linearHistoryRequired: true;
    forcePushesAllowed: false;
    branchDeletionAllowed: false;
    conversationResolutionRequired: true;
    canonicalCiRequired: true;
    noBypassActors: true;
  };
  staticAnalysis: {
    status: "pass";
    analyzedCommit: string;
    slitherReportSha256: string;
    slitherReportPath: string;
    aderynReportSha256: string;
    aderynReportPath: string;
    echidnaReportSha256: string;
    echidnaReportPath: string;
    allFindingsReconciled: true;
  };
  artifactBuild: {
    status: "pass";
    sourceCommit: string;
    evidencePath: string;
    evidenceSha256: string;
  };
  independentAudit: {
    status: "pass";
    auditedCommit: string;
    reportPath: string;
    reportSha256: string;
    unresolvedConfirmedIssues: 0;
  };
  artQa: {
    status: "pass";
    reviewedCommit: string;
    evidencePath: string;
    evidenceSha256: string;
    browser: string;
    marketplaceDecoder: string;
    thumbnailSizes: [64, 128, 300];
    backgrounds: ["light", "neutral", "dark"];
  };
  roadmapGate: {
    status: "approved";
    evidencePath: string;
    evidenceSha256: string;
    marketCapFloorTargetUsd: 100000;
    sequenceDecision: "floor_satisfied" | "nft_deployment_authorized_before_floor";
    strategicBufferReviewed: true;
    observedAtBlock: number;
    observedAtBlockHash: string;
  };
  deploymentPlan: {
    status: "approved";
    deployer: string;
    expectedStartNonce: number;
    predictedAddresses: Record<PositionNftPhase2ContractName, string>;
    dedicatedIdleSigner: true;
    noPriorPhase2Attempt: true;
    observedAtBlock: number;
    observedAtBlockHash: string;
    validUntilBlock: number;
    evidencePath: string;
    evidenceSha256: string;
  };
  productionPolicy: {
    status: "approved";
    ownerSafe: string;
    royaltyReceiver: string;
    royaltyBps: 1000;
    naraClaimFeeBps: 0;
    tokenClaimFeeBps: 0;
    claimFeeRecipient: string;
    resetThenFreezeFees: true;
    genesisDistributorDeferred: true;
    dataLensDeferred: true;
    genesisMintersRemainConfigurable: true;
    permissionlessMintFromDeploymentAcknowledged: true;
  };
  humanApproval: {
    status: "approved";
    reference: string;
    approvedAt: string;
  };
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${label} must be a 64-character SHA-256 hash`);
  }
  return value.toLowerCase();
}

function requireReference(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 500) {
    throw new Error(`${label} must be a non-empty reference`);
  }
  return value;
}

function requireEvidencePath(value: unknown, label: string): string {
  const path = requireReference(value, label).replace(/\\/g, "/");
  if (
    path.startsWith("/") ||
    /^[a-z]:\//i.test(path) ||
    path.split("/").includes("..") ||
    !/\.(?:json|md|txt)$/i.test(path)
  ) {
    throw new Error(`${label} must be a repository-relative .json, .md, or .txt path`);
  }
  return path;
}

function requireExactObjectKeys(value: unknown, expected: readonly string[], label: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object with exact keys`);
  }
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} contains missing or unapproved extra fields`);
  }
}

export function assertPositionNftPhase2GateAttestation(
  value: unknown,
  expectedEvidenceCommit: string,
  expectedSafe: string,
  expectedTreasury: string,
): PositionNftPhase2GateAttestation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Position NFT gate attestation must be an object");
  }
  const attestation = value as PositionNftPhase2GateAttestation;
  requireExactObjectKeys(attestation, [
    "schemaVersion",
    "changeId",
    "sourceCommit",
    "evidenceCommit",
    "ci",
    "sourceCi",
    "releaseControl",
    "staticAnalysis",
    "artifactBuild",
    "independentAudit",
    "artQa",
    "roadmapGate",
    "deploymentPlan",
    "productionPolicy",
    "humanApproval",
  ], "Position NFT gate attestation");
  const ciKeys = ["status", "repository", "headSha", "runUrl", "workflowPath", "requiredJobs"] as const;
  requireExactObjectKeys(attestation.ci, ciKeys, "Position NFT gate attestation ci");
  requireExactObjectKeys(attestation.sourceCi, ciKeys, "Position NFT gate attestation sourceCi");
  requireExactObjectKeys(attestation.releaseControl, [
    "status",
    "repository",
    "protectedBranch",
    "sourceCommitSignatureVerified",
    "evidenceCommitSignatureVerified",
    "sourcePullRequestNumber",
    "sourcePullRequestUrl",
    "evidencePullRequestNumber",
    "evidencePullRequestUrl",
    "mergedToProtectedMain",
    "administratorsEnforced",
    "signedCommitsRequired",
    "linearHistoryRequired",
    "forcePushesAllowed",
    "branchDeletionAllowed",
    "conversationResolutionRequired",
    "canonicalCiRequired",
    "noBypassActors",
  ], "Position NFT gate attestation releaseControl");
  requireExactObjectKeys(attestation.staticAnalysis, [
    "status",
    "analyzedCommit",
    "slitherReportSha256",
    "slitherReportPath",
    "aderynReportSha256",
    "aderynReportPath",
    "echidnaReportSha256",
    "echidnaReportPath",
    "allFindingsReconciled",
  ], "Position NFT gate attestation staticAnalysis");
  requireExactObjectKeys(attestation.artifactBuild, [
    "status",
    "sourceCommit",
    "evidencePath",
    "evidenceSha256",
  ], "Position NFT gate attestation artifactBuild");
  requireExactObjectKeys(attestation.independentAudit, [
    "status",
    "auditedCommit",
    "reportPath",
    "reportSha256",
    "unresolvedConfirmedIssues",
  ], "Position NFT gate attestation independentAudit");
  requireExactObjectKeys(attestation.artQa, [
    "status",
    "reviewedCommit",
    "evidencePath",
    "evidenceSha256",
    "browser",
    "marketplaceDecoder",
    "thumbnailSizes",
    "backgrounds",
  ], "Position NFT gate attestation artQa");
  requireExactObjectKeys(attestation.roadmapGate, [
    "status",
    "evidencePath",
    "evidenceSha256",
    "marketCapFloorTargetUsd",
    "sequenceDecision",
    "strategicBufferReviewed",
    "observedAtBlock",
    "observedAtBlockHash",
  ], "Position NFT gate attestation roadmapGate");
  requireExactObjectKeys(attestation.deploymentPlan, [
    "status",
    "deployer",
    "expectedStartNonce",
    "predictedAddresses",
    "dedicatedIdleSigner",
    "noPriorPhase2Attempt",
    "observedAtBlock",
    "observedAtBlockHash",
    "validUntilBlock",
    "evidencePath",
    "evidenceSha256",
  ], "Position NFT gate attestation deploymentPlan");
  requireExactObjectKeys(attestation.productionPolicy, [
    "status",
    "ownerSafe",
    "royaltyReceiver",
    "royaltyBps",
    "naraClaimFeeBps",
    "tokenClaimFeeBps",
    "claimFeeRecipient",
    "resetThenFreezeFees",
    "genesisDistributorDeferred",
    "dataLensDeferred",
    "genesisMintersRemainConfigurable",
    "permissionlessMintFromDeploymentAcknowledged",
  ], "Position NFT gate attestation productionPolicy");
  requireExactObjectKeys(attestation.humanApproval, [
    "status",
    "reference",
    "approvedAt",
  ], "Position NFT gate attestation humanApproval");
  requireExactObjectKeys(
    attestation.deploymentPlan?.predictedAddresses,
    POSITION_NFT_PHASE2_CONTRACTS,
    "Position NFT gate attestation deploymentPlan.predictedAddresses (exact seven Phase-2 contracts)",
  );
  const evidenceCommit = expectedEvidenceCommit.toLowerCase();
  if (attestation.schemaVersion !== 1 || attestation.changeId !== POSITION_NFT_PHASE2_CHANGE_ID) {
    throw new Error("Position NFT gate attestation schema/change ID mismatch");
  }
  const sourceCommit = attestation.sourceCommit?.toLowerCase();
  if (
    !/^[0-9a-f]{40}$/.test(sourceCommit ?? "") ||
    attestation.evidenceCommit?.toLowerCase() !== evidenceCommit ||
    sourceCommit === evidenceCommit
  ) {
    throw new Error("Position NFT gate attestation does not bind distinct source/evidence commits");
  }
  if (
    attestation.ci?.status !== "pass" ||
    attestation.ci.repository !== "NARAProtocol/nara_protocol_v4" ||
    attestation.ci.headSha?.toLowerCase() !== evidenceCommit ||
    attestation.ci.workflowPath !== ".github/workflows/ci.yml" ||
    JSON.stringify(attestation.ci.requiredJobs) !== JSON.stringify(POSITION_NFT_PHASE2_REQUIRED_CI_JOBS) ||
    !/^https:\/\/github\.com\/NARAProtocol\/nara_protocol_v4\/actions\/runs\/\d+(?:\/.*)?$/i.test(
      attestation.ci.runUrl ?? "",
    )
  ) {
    throw new Error("Position NFT gate attestation lacks passing canonical GitHub CI for the release commit");
  }
  if (
    attestation.sourceCi?.status !== "pass" ||
    attestation.sourceCi.repository !== "NARAProtocol/nara_protocol_v4" ||
    attestation.sourceCi.headSha?.toLowerCase() !== sourceCommit ||
    attestation.sourceCi.workflowPath !== ".github/workflows/ci.yml" ||
    JSON.stringify(attestation.sourceCi.requiredJobs) !== JSON.stringify(attestation.ci.requiredJobs) ||
    !/^https:\/\/github\.com\/NARAProtocol\/nara_protocol_v4\/actions\/runs\/\d+(?:\/.*)?$/i.test(
      attestation.sourceCi.runUrl ?? "",
    )
  ) {
    throw new Error("Position NFT gate attestation lacks passing canonical GitHub CI for the source commit");
  }
  const releaseControl = attestation.releaseControl;
  if (
    releaseControl?.status !== "pass" ||
    releaseControl.repository !== "NARAProtocol/nara_protocol_v4" ||
    releaseControl.protectedBranch !== "main" ||
    releaseControl.sourceCommitSignatureVerified !== true ||
    releaseControl.evidenceCommitSignatureVerified !== true ||
    !Number.isSafeInteger(releaseControl.sourcePullRequestNumber) ||
    releaseControl.sourcePullRequestNumber <= 0 ||
    !Number.isSafeInteger(releaseControl.evidencePullRequestNumber) ||
    releaseControl.evidencePullRequestNumber <= 0 ||
    !/^https:\/\/github\.com\/NARAProtocol\/nara_protocol_v4\/pull\/\d+$/i.test(
      releaseControl.sourcePullRequestUrl ?? "",
    ) ||
    !/^https:\/\/github\.com\/NARAProtocol\/nara_protocol_v4\/pull\/\d+$/i.test(
      releaseControl.evidencePullRequestUrl ?? "",
    ) ||
    releaseControl.mergedToProtectedMain !== true ||
    releaseControl.administratorsEnforced !== true ||
    releaseControl.signedCommitsRequired !== true ||
    releaseControl.linearHistoryRequired !== true ||
    releaseControl.forcePushesAllowed !== false ||
    releaseControl.branchDeletionAllowed !== false ||
    releaseControl.conversationResolutionRequired !== true ||
    releaseControl.canonicalCiRequired !== true ||
    releaseControl.noBypassActors !== true
  ) {
    throw new Error("Signed-commit / protected-main / merged-PR release-control evidence is incomplete");
  }
  if (
    attestation.staticAnalysis?.status !== "pass" ||
    attestation.staticAnalysis.analyzedCommit?.toLowerCase() !== sourceCommit ||
    attestation.staticAnalysis.allFindingsReconciled !== true
  ) {
    throw new Error("Position NFT static-analysis evidence is missing or unreconciled");
  }
  requireSha256(attestation.staticAnalysis.slitherReportSha256, "Slither report hash");
  requireEvidencePath(attestation.staticAnalysis.slitherReportPath, "Slither report path");
  requireSha256(attestation.staticAnalysis.aderynReportSha256, "Aderyn report hash");
  requireEvidencePath(attestation.staticAnalysis.aderynReportPath, "Aderyn report path");
  requireSha256(attestation.staticAnalysis.echidnaReportSha256, "Echidna report hash");
  requireEvidencePath(attestation.staticAnalysis.echidnaReportPath, "Echidna report path");
  if (
    attestation.artifactBuild?.status !== "pass" ||
    attestation.artifactBuild.sourceCommit?.toLowerCase() !== sourceCommit
  ) {
    throw new Error("Clean-build artifact evidence is missing or bound to the wrong source commit");
  }
  requireEvidencePath(attestation.artifactBuild.evidencePath, "Artifact build evidence path");
  requireSha256(attestation.artifactBuild.evidenceSha256, "Artifact build evidence hash");
  if (
    attestation.independentAudit?.status !== "pass" ||
    attestation.independentAudit.auditedCommit?.toLowerCase() !== sourceCommit ||
    attestation.independentAudit.unresolvedConfirmedIssues !== 0
  ) {
    throw new Error("Final-commit independent audit evidence is missing or has unresolved confirmed issues");
  }
  requireEvidencePath(attestation.independentAudit.reportPath, "Independent audit report path");
  requireSha256(attestation.independentAudit.reportSha256, "Independent audit report hash");
  if (
    attestation.artQa?.status !== "pass" ||
    attestation.artQa.reviewedCommit?.toLowerCase() !== sourceCommit ||
    JSON.stringify(attestation.artQa.thumbnailSizes) !== JSON.stringify([64, 128, 300]) ||
    JSON.stringify(attestation.artQa.backgrounds) !== JSON.stringify(["light", "neutral", "dark"])
  ) {
    throw new Error("Browser/marketplace art QA evidence is incomplete");
  }
  requireEvidencePath(attestation.artQa.evidencePath, "Art QA evidence path");
  requireReference(attestation.artQa.browser, "Art QA browser");
  requireReference(attestation.artQa.marketplaceDecoder, "Art QA marketplace decoder");
  requireSha256(attestation.artQa.evidenceSha256, "Art QA evidence hash");
  if (
    attestation.roadmapGate?.status !== "approved" ||
    attestation.roadmapGate.marketCapFloorTargetUsd !== 100000 ||
    (attestation.roadmapGate.sequenceDecision !== "floor_satisfied" &&
      attestation.roadmapGate.sequenceDecision !== "nft_deployment_authorized_before_floor") ||
    attestation.roadmapGate.strategicBufferReviewed !== true ||
    !Number.isSafeInteger(attestation.roadmapGate.observedAtBlock) ||
    attestation.roadmapGate.observedAtBlock <= 0 ||
    !/^0x[0-9a-f]{64}$/i.test(attestation.roadmapGate.observedAtBlockHash ?? "")
  ) {
    throw new Error("Master-roadmap market-cap floor / strategic-buffer approval evidence is missing");
  }
  requireEvidencePath(attestation.roadmapGate.evidencePath, "Roadmap gate evidence path");
  requireSha256(attestation.roadmapGate.evidenceSha256, "Roadmap gate evidence hash");
  const deploymentPlan = attestation.deploymentPlan;
  if (
    deploymentPlan?.status !== "approved" ||
    !ethers.isAddress(deploymentPlan.deployer) ||
    !Number.isSafeInteger(deploymentPlan.expectedStartNonce) ||
    deploymentPlan.expectedStartNonce < 0 ||
    deploymentPlan.dedicatedIdleSigner !== true ||
    deploymentPlan.noPriorPhase2Attempt !== true ||
    !Number.isSafeInteger(deploymentPlan.observedAtBlock) ||
    deploymentPlan.observedAtBlock <= 0 ||
    !/^0x[0-9a-f]{64}$/i.test(deploymentPlan.observedAtBlockHash ?? "") ||
    !Number.isSafeInteger(deploymentPlan.validUntilBlock) ||
    deploymentPlan.validUntilBlock <= deploymentPlan.observedAtBlock ||
    deploymentPlan.validUntilBlock - deploymentPlan.observedAtBlock > 43_200
  ) {
    throw new Error("Dedicated deployment-signer / one-attempt plan evidence is missing or invalid");
  }
  if (
    !deploymentPlan.predictedAddresses ||
    Object.keys(deploymentPlan.predictedAddresses).sort().join(",") !==
      [...POSITION_NFT_PHASE2_CONTRACTS].sort().join(",")
  ) {
    throw new Error("Deployment plan must contain the exact seven predicted contract addresses");
  }
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    ethers.getAddress(deploymentPlan.predictedAddresses[name]);
  }
  requireEvidencePath(deploymentPlan.evidencePath, "Deployment plan evidence path");
  requireSha256(deploymentPlan.evidenceSha256, "Deployment plan evidence hash");
  const policy = attestation.productionPolicy;
  if (
    policy?.status !== "approved" ||
    ethers.getAddress(policy.ownerSafe) !== ethers.getAddress(expectedSafe) ||
    ethers.getAddress(policy.royaltyReceiver) !== ethers.getAddress(expectedTreasury) ||
    policy.royaltyBps !== POSITION_NFT_PHASE2_ROYALTY_BPS ||
    policy.naraClaimFeeBps !== 0 ||
    policy.tokenClaimFeeBps !== 0 ||
    ethers.getAddress(policy.claimFeeRecipient) !== ethers.ZeroAddress ||
    policy.resetThenFreezeFees !== true ||
    policy.genesisDistributorDeferred !== true ||
    policy.dataLensDeferred !== true ||
    policy.genesisMintersRemainConfigurable !== true ||
    policy.permissionlessMintFromDeploymentAcknowledged !== true
  ) {
    throw new Error("Production NFT policy approval does not match the canonical Phase-2 policy");
  }
  if (attestation.humanApproval?.status !== "approved" || !Number.isFinite(Date.parse(attestation.humanApproval.approvedAt))) {
    throw new Error("Explicit human production approval evidence is missing");
  }
  requireReference(attestation.humanApproval.reference, "Human approval reference");
  return attestation;
}

function githubReleaseHeaders(): Record<string, string> {
  let token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    try {
      token = execFileSync("gh", ["auth", "token"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // Fall through to the fail-closed error without printing credential-manager output.
    }
  }
  if (!token) {
    throw new Error("Authenticated GitHub read access is required for release-control verification");
  }
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "nara-v4-position-nft-release-control",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchAllGitHubItems(
  initialUrl: string,
  headers: Record<string, string>,
  label: string,
  itemKey?: string,
): Promise<{ items: any[]; totalCount?: number }> {
  const items: any[] = [];
  const seen = new Set<string>();
  let nextUrl: string | undefined = initialUrl;
  let totalCount: number | undefined;
  while (nextUrl !== undefined) {
    if (seen.has(nextUrl) || seen.size >= 100) throw new Error(`GitHub ${label} pagination is cyclic or excessive`);
    const parsedUrl = new URL(nextUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "api.github.com") {
      throw new Error(`GitHub ${label} pagination left the canonical API origin`);
    }
    seen.add(nextUrl);
    const response: Response = await fetch(nextUrl, { headers });
    if (!response.ok) throw new Error(`GitHub ${label} verification failed (${response.status})`);
    const payload = await response.json() as any;
    const pageItems = itemKey === undefined ? payload : payload?.[itemKey];
    if (!Array.isArray(pageItems)) throw new Error(`GitHub ${label} page is malformed`);
    items.push(...pageItems);
    if (itemKey !== undefined) {
      if (!Number.isSafeInteger(payload.total_count) || payload.total_count < 0) {
        throw new Error(`GitHub ${label} total_count is malformed`);
      }
      if (totalCount !== undefined && totalCount !== payload.total_count) {
        throw new Error(`GitHub ${label} total_count changed during pagination`);
      }
      totalCount = payload.total_count;
    }
    const nextMatch: RegExpMatchArray | null = (response.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/i);
    nextUrl = nextMatch?.[1];
  }
  if (totalCount !== undefined && totalCount !== items.length) {
    throw new Error(`GitHub ${label} pagination did not return total_count items`);
  }
  return { items, ...(totalCount === undefined ? {} : { totalCount }) };
}

export async function verifyPositionNftPhase2ReleaseControl(
  attestation: PositionNftPhase2GateAttestation,
): Promise<void> {
  const headers = githubReleaseHeaders();
  const repositoryApi = "https://api.github.com/repos/NARAProtocol/nara_protocol_v4";
  const sourceRunId = attestation.sourceCi.runUrl.match(/\/actions\/runs\/(\d+)/)?.[1];
  const evidenceRunId = attestation.ci.runUrl.match(/\/actions\/runs\/(\d+)/)?.[1];
  if (!sourceRunId || !evidenceRunId) throw new Error("Canonical source/evidence CI run IDs are invalid");
  const [sourceResponse, evidenceResponse, sourcePullsPage, evidencePullsPage, protectionResponse,
    signaturesResponse, sourceRunResponse, sourceJobsPage, evidenceRunResponse,
    evidenceJobsPage, rulesetsPage] = await Promise.all([
    fetch(`${repositoryApi}/commits/${attestation.sourceCommit}`, { headers }),
    fetch(`${repositoryApi}/commits/${attestation.evidenceCommit}`, { headers }),
    fetchAllGitHubItems(
      `${repositoryApi}/commits/${attestation.sourceCommit}/pulls?per_page=100`,
      headers,
      "source merged pull requests",
    ),
    fetchAllGitHubItems(
      `${repositoryApi}/commits/${attestation.evidenceCommit}/pulls?per_page=100`,
      headers,
      "evidence merged pull requests",
    ),
    fetch(`${repositoryApi}/branches/main/protection`, { headers }),
    fetch(`${repositoryApi}/branches/main/protection/required_signatures`, { headers }),
    fetch(`${repositoryApi}/actions/runs/${sourceRunId}`, { headers }),
    fetchAllGitHubItems(
      `${repositoryApi}/actions/runs/${sourceRunId}/jobs?per_page=100`,
      headers,
      "source CI jobs",
      "jobs",
    ),
    fetch(`${repositoryApi}/actions/runs/${evidenceRunId}`, { headers }),
    fetchAllGitHubItems(
      `${repositoryApi}/actions/runs/${evidenceRunId}/jobs?per_page=100`,
      headers,
      "evidence CI jobs",
      "jobs",
    ),
    fetchAllGitHubItems(
      `${repositoryApi}/rulesets?includes_parents=true&per_page=100`,
      headers,
      "repository rulesets",
    ),
  ]);
  for (const [label, response] of [
    ["source commit", sourceResponse],
    ["evidence commit", evidenceResponse],
    ["main branch protection", protectionResponse],
    ["main signed-commit protection", signaturesResponse],
    ["source CI run", sourceRunResponse],
    ["evidence CI run", evidenceRunResponse],
  ] as const) {
    if (!response.ok) throw new Error(`GitHub ${label} verification failed (${response.status})`);
  }
  const [source, evidence, protection, signatures, sourceRun, evidenceRun] = await Promise.all([
    sourceResponse.json() as Promise<any>,
    evidenceResponse.json() as Promise<any>,
    protectionResponse.json() as Promise<any>,
    signaturesResponse.json() as Promise<any>,
    sourceRunResponse.json() as Promise<any>,
    evidenceRunResponse.json() as Promise<any>,
  ]);
  const sourcePulls = sourcePullsPage.items;
  const evidencePulls = evidencePullsPage.items;
  const sourceJobs = { total_count: sourceJobsPage.totalCount, jobs: sourceJobsPage.items };
  const evidenceJobs = { total_count: evidenceJobsPage.totalCount, jobs: evidenceJobsPage.items };
  const rulesets = rulesetsPage.items;
  const rulesetDetailResponses = await Promise.all(rulesets.map((ruleset) => {
    if (!Number.isSafeInteger(ruleset.id) || ruleset.id <= 0) {
      throw new Error("GitHub repository ruleset summary has an invalid ID");
    }
    return fetch(`${repositoryApi}/rulesets/${ruleset.id}?includes_parents=true`, { headers });
  }));
  for (const response of rulesetDetailResponses) {
    if (!response.ok) {
      throw new Error(`GitHub ruleset-detail verification failed (${response.status})`);
    }
  }
  const rulesetDetails = await Promise.all(
    rulesetDetailResponses.map((response) => response.json() as Promise<any>),
  );
  if (
    String(source.sha).toLowerCase() !== attestation.sourceCommit.toLowerCase() ||
    source.commit?.verification?.verified !== true ||
    String(evidence.sha).toLowerCase() !== attestation.evidenceCommit.toLowerCase() ||
    evidence.commit?.verification?.verified !== true
  ) {
    throw new Error("Source and evidence commits must both have valid GitHub signature verification");
  }
  const releaseControl = attestation.releaseControl;
  const exactMergedPull = (
    pulls: any[],
    number: number,
    url: string,
    commit: string,
  ): boolean => pulls.filter((pull) =>
    pull.number === number &&
    String(pull.html_url).replace(/\/$/, "") === url.replace(/\/$/, "") &&
    pull.state === "closed" &&
    typeof pull.merged_at === "string" &&
    pull.base?.ref === "main" &&
    pull.base?.repo?.full_name === "NARAProtocol/nara_protocol_v4" &&
    String(pull.merge_commit_sha).toLowerCase() === commit.toLowerCase()
  ).length === 1;
  if (
    !exactMergedPull(
      sourcePulls,
      releaseControl.sourcePullRequestNumber,
      releaseControl.sourcePullRequestUrl,
      attestation.sourceCommit,
    ) ||
    !exactMergedPull(
      evidencePulls,
      releaseControl.evidencePullRequestNumber,
      releaseControl.evidencePullRequestUrl,
      attestation.evidenceCommit,
    )
  ) {
    throw new Error("Source/evidence commits are not the exact merge results of their approved main-branch pull requests");
  }
  const exactSuccessfulCi = (
    run: any,
    jobs: any,
    evidenceForRun: PositionNftPhase2GateAttestation["ci"],
    commit: string,
  ): boolean =>
    String(run.head_sha).toLowerCase() === commit.toLowerCase() &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    run.path === evidenceForRun.workflowPath &&
    run.name === "NARA v4 CI" &&
    run.head_branch === "main" &&
    run.event === "push" &&
    String(run.html_url).replace(/\/$/, "") === evidenceForRun.runUrl.replace(/\/$/, "") &&
    Number.isSafeInteger(jobs.total_count) &&
    jobs.total_count === (Array.isArray(jobs.jobs) ? jobs.jobs.length : -1) &&
    evidenceForRun.requiredJobs.every((requiredJob) => {
      const matches = Array.isArray(jobs.jobs)
        ? jobs.jobs.filter((job: any) => job.name === requiredJob && job.conclusion === "success")
        : [];
      return matches.length === 1;
    });
  if (
    !exactSuccessfulCi(sourceRun, sourceJobs, attestation.sourceCi, attestation.sourceCommit) ||
    !exactSuccessfulCi(evidenceRun, evidenceJobs, attestation.ci, attestation.evidenceCommit)
  ) {
    throw new Error("Canonical GitHub CI did not pass all required jobs for both source and evidence commits");
  }
  const requiredContexts = new Set<string>([
    ...(Array.isArray(protection.required_status_checks?.contexts)
      ? protection.required_status_checks.contexts.map(String)
      : []),
    ...(Array.isArray(protection.required_status_checks?.checks)
      ? protection.required_status_checks.checks.map((check: any) => String(check.context))
      : []),
  ]);
  const classicBypass = protection.required_pull_request_reviews?.bypass_pull_request_allowances;
  const classicBypassEmpty = classicBypass === undefined || classicBypass === null || (
    classicBypass &&
    ["users", "teams", "apps"].every((key) =>
      Array.isArray(classicBypass[key]) && classicBypass[key].length === 0
    )
  );
  const rulesetBypassEmpty = rulesetDetails.length === rulesets.length && rulesetDetails.every((ruleset, index) =>
    ruleset.id === rulesets[index].id &&
    Array.isArray(ruleset.bypass_actors) &&
    ruleset.bypass_actors.length === 0
  );
  if (
    protection.enforce_admins?.enabled !== true ||
    !protection.required_pull_request_reviews ||
    signatures.enabled !== true ||
    protection.required_linear_history?.enabled !== true ||
    protection.allow_force_pushes?.enabled !== false ||
    protection.allow_deletions?.enabled !== false ||
    protection.required_conversation_resolution?.enabled !== true ||
    !classicBypassEmpty ||
    !rulesetBypassEmpty ||
    attestation.ci.requiredJobs.some((job) => !requiredContexts.has(job))
  ) {
    throw new Error("GitHub main protection does not enforce the approved signed linear PR/CI release policy");
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

export async function collectPositionNftPhase2ArtifactEvidence(
  artifacts: any,
): Promise<Record<PositionNftPhase2ContractName, PositionNftArtifactEvidence>> {
  const result = {} as Record<PositionNftPhase2ContractName, PositionNftArtifactEvidence>;
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    const fullyQualifiedName = POSITION_NFT_PHASE2_FQNS[name];
    const artifact = await artifacts.readArtifact(fullyQualifiedName);
    const buildInfoId = await artifacts.getBuildInfoId(fullyQualifiedName);
    if (!buildInfoId) throw new Error(`Missing Hardhat build-info ID for ${fullyQualifiedName}`);
    const [buildInfoPath, buildInfoOutputPath] = await Promise.all([
      artifacts.getBuildInfoPath(buildInfoId),
      artifacts.getBuildInfoOutputPath(buildInfoId),
    ]);
    if (!buildInfoPath || !buildInfoOutputPath) {
      throw new Error(`Missing Hardhat build-info files for ${fullyQualifiedName}`);
    }
    const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));
    const buildInfoOutput = JSON.parse(readFileSync(buildInfoOutputPath, "utf8"));
    for (const [compilerSourceName, compilerSource] of Object.entries(
      buildInfo.input?.sources ?? {},
    ) as Array<[string, { content?: unknown }]>) {
      const mappedProjectSource = Object.entries(buildInfo.userSourceNameMap ?? {})
        .find(([, mapped]) => mapped === compilerSourceName)?.[0];
      const projectPrefixMatch = compilerSourceName.startsWith("project/")
        ? compilerSourceName.slice("project/".length)
        : undefined;
      const packageMatch = compilerSourceName.match(/^npm\/(@[^/]+\/[^@/]+|[^@/]+)@[^/]+\/(.+)$/);
      const sourcePath = mappedProjectSource ??
        projectPrefixMatch ??
        (packageMatch ? join("node_modules", packageMatch[1], packageMatch[2]) : undefined);
      if (!sourcePath || !existsSync(sourcePath) || typeof compilerSource.content !== "string") {
        throw new Error(`Cannot reproduce compiler input source ${compilerSourceName} from the workspace`);
      }
      const workspaceContent = readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
      if (workspaceContent !== compilerSource.content.replace(/\r\n/g, "\n")) {
        throw new Error(`Compiler input source differs from the workspace: ${compilerSourceName}`);
      }
    }
    const mappedSourceName = buildInfo.userSourceNameMap?.[artifact.sourceName] ??
      (buildInfo.input?.sources?.[`project/${artifact.sourceName}`] ? `project/${artifact.sourceName}` : undefined) ??
      (buildInfo.input?.sources?.[artifact.sourceName] ? artifact.sourceName : undefined);
    if (typeof mappedSourceName !== "string") {
      throw new Error(`Build info does not map source ${artifact.sourceName}`);
    }
    const outputContract = buildInfoOutput.output?.contracts?.[mappedSourceName]?.[artifact.contractName];
    if (!outputContract || typeof outputContract.metadata !== "string") {
      throw new Error(`Missing compiler metadata for ${fullyQualifiedName}`);
    }
    const settings = buildInfo.input?.settings ?? {};
    const source = readFileSync(artifact.sourceName, "utf8").replace(/\r\n/g, "\n");
    const compiledSource = buildInfo.input?.sources?.[mappedSourceName]?.content;
    if (typeof compiledSource !== "string" || compiledSource.replace(/\r\n/g, "\n") !== source) {
      throw new Error(`Workspace source differs from the compiler input for ${fullyQualifiedName}`);
    }
    const compiledCreationBytecode = `0x${outputContract.evm?.bytecode?.object ?? ""}`;
    const compiledDeployedBytecode = `0x${outputContract.evm?.deployedBytecode?.object ?? ""}`;
    if (
      canonicalJson(artifact.abi) !== canonicalJson(outputContract.abi) ||
      artifact.bytecode.toLowerCase() !== compiledCreationBytecode.toLowerCase() ||
      artifact.deployedBytecode.toLowerCase() !== compiledDeployedBytecode.toLowerCase()
    ) {
      throw new Error(`Hardhat artifact differs from its compiler output for ${fullyQualifiedName}`);
    }
    if (
      buildInfo.solcVersion !== "0.8.34" ||
      buildInfo.solcLongVersion !== "0.8.34+commit.80d5c536" ||
      settings.optimizer?.enabled !== true ||
      settings.optimizer?.runs !== 1 ||
      settings.viaIR !== true ||
      settings.evmVersion !== "cancun"
    ) {
      throw new Error(`Unexpected compiler/settings for ${fullyQualifiedName}`);
    }
    result[name] = {
      fullyQualifiedName,
      sourceName: artifact.sourceName,
      contractName: artifact.contractName,
      sourceSha256: sha256(source),
      artifactSha256: sha256(canonicalJson(artifact)),
      abiSha256: sha256(canonicalJson(artifact.abi)),
      creationBytecodeHash: ethers.keccak256(artifact.bytecode),
      deployedBytecodeTemplateHash: ethers.keccak256(artifact.deployedBytecode),
      compilerInputSha256: sha256(canonicalJson(buildInfo.input)),
      compilerSourcesSha256: sha256(canonicalJson(buildInfo.input.sources)),
      contractMetadataSha256: sha256(outputContract.metadata),
      solcVersion: buildInfo.solcVersion,
      solcLongVersion: buildInfo.solcLongVersion,
      compilerSettings: {
        optimizer: settings.optimizer ?? null,
        viaIR: settings.viaIR ?? null,
        evmVersion: settings.evmVersion ?? null,
        metadata: settings.metadata ?? null,
      },
    };
  }
  return result;
}

export interface PositionNftPhase2Policy {
  owner: string;
  royaltyReceiver: string;
  royaltyBps: number;
  naraClaimFeeBps: number;
  tokenClaimFeeBps: number;
  claimFeeRecipient: string;
  freezeRoyalties: boolean;
  freezeClaimFees: boolean;
  deployGenesisDistributor: boolean;
  deployDataLens: boolean;
  freezeGenesisMinters: boolean;
}

export function canonicalPositionNftPhase2Policy(safe: string, treasury: string): PositionNftPhase2Policy {
  return {
    owner: ethers.getAddress(safe),
    royaltyReceiver: ethers.getAddress(treasury),
    royaltyBps: POSITION_NFT_PHASE2_ROYALTY_BPS,
    naraClaimFeeBps: 0,
    tokenClaimFeeBps: 0,
    claimFeeRecipient: ethers.ZeroAddress,
    freezeRoyalties: true,
    freezeClaimFees: true,
    deployGenesisDistributor: false,
    deployDataLens: false,
    freezeGenesisMinters: false,
  };
}

export function assertCanonicalPositionNftPhase2Policy(
  policy: PositionNftPhase2Policy,
  expectedSafe: string,
  expectedTreasury: string,
): void {
  if (ethers.getAddress(policy.owner) !== ethers.getAddress(expectedSafe)) {
    throw new Error("Phase-2 Position NFT owner must be the canonical production Safe");
  }
  if (
    ethers.getAddress(policy.royaltyReceiver) !== ethers.getAddress(expectedTreasury) ||
    policy.royaltyBps !== POSITION_NFT_PHASE2_ROYALTY_BPS
  ) {
    throw new Error("Phase-2 Position NFT royalties must be 1000 BPS to the canonical production treasury");
  }
  if (
    policy.naraClaimFeeBps !== 0 ||
    policy.tokenClaimFeeBps !== 0 ||
    ethers.getAddress(policy.claimFeeRecipient) !== ethers.ZeroAddress
  ) {
    throw new Error("Phase-2 Position NFT wrapper claim fees must launch at zero with no recipient");
  }
  if (!policy.freezeRoyalties || !policy.freezeClaimFees) {
    throw new Error("Phase-2 1000-BPS treasury royalties and zero wrapper claim fees must be permanently frozen");
  }
  if (policy.deployGenesisDistributor || policy.deployDataLens) {
    throw new Error("Genesis distribution and the data lens belong to later deployment phases");
  }
  if (policy.freezeGenesisMinters) {
    throw new Error("Genesis minters must remain Safe-configurable until the separately reviewed bond phase");
  }
}

export function buildPositionNftPhase2FinalizationBatch(
  safe: string,
  positionNft: string,
  treasury: string,
  evidence: Record<string, unknown>,
  createdAt: number,
) {
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) {
    throw new Error("Safe finalization batch createdAt must be a positive deterministic millisecond timestamp");
  }
  const normalizedSafe = ethers.getAddress(safe);
  const normalizedNft = ethers.getAddress(positionNft);
  const normalizedTreasury = ethers.getAddress(treasury);
  const rehearsalDoNotImport = evidence.deploymentMode === "rehearse";
  if (normalizedTreasury === ethers.ZeroAddress) {
    throw new Error("Position NFT royalty treasury cannot be the zero address");
  }
  const iface = new ethers.Interface([
    "function setDefaultRoyalty(address receiver,uint96 feeNumerator)",
    "function setClaimFees(uint16 naraClaimFeeBps,uint16 tokenClaimFeeBps)",
    "function setClaimFeeRecipient(address recipient)",
    "function freezeRoyalties()",
    "function freezeClaimFees()",
  ]);

  const transactions = [
    {
      to: normalizedNft,
      value: "0",
      data: iface.encodeFunctionData("setDefaultRoyalty", [
        normalizedTreasury,
        POSITION_NFT_PHASE2_ROYALTY_BPS,
      ]),
      contractMethod: null,
      contractInputsValues: null,
    },
    {
      to: normalizedNft,
      value: "0",
      data: iface.encodeFunctionData("setClaimFees", [0, 0]),
      contractMethod: null,
      contractInputsValues: null,
    },
    {
      to: normalizedNft,
      value: "0",
      data: iface.encodeFunctionData("setClaimFeeRecipient", [ethers.ZeroAddress]),
      contractMethod: null,
      contractInputsValues: null,
    },
    {
      to: normalizedNft,
      value: "0",
      data: iface.encodeFunctionData("freezeRoyalties"),
      contractMethod: null,
      contractInputsValues: null,
    },
    {
      to: normalizedNft,
      value: "0",
      data: iface.encodeFunctionData("freezeClaimFees"),
      contractMethod: null,
      contractInputsValues: null,
    },
  ];

  return {
    version: "1.0",
    chainId: POSITION_NFT_PHASE2_CHAIN_ID.toString(),
    createdAt,
    meta: {
      name: rehearsalDoNotImport
        ? "REHEARSAL - DO NOT IMPORT - NARA v4 Position NFT Phase-2"
        : "UNEXECUTED - NARA v4 Position NFT Phase-2 fixed-royalty finalization",
      description: rehearsalDoNotImport
        ? "FORK REHEARSAL ONLY. This Safe batch targets ephemeral rehearsal contracts and must never be imported or signed."
        : "Five calls pin ERC-2981 royalties at 10% to the production treasury, reset wrapper claim fees to zero, and permanently freeze both policies. Re-verify the target, full batch, and simulation immediately before Safe signing.",
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: normalizedSafe,
      createdFromOwnerAddress: "",
    },
    transactions,
    naraEvidence: {
      ...evidence,
      ...(rehearsalDoNotImport
        ? { rehearsalWarning: "FORK_REHEARSAL_DO_NOT_IMPORT_OR_SIGN" }
        : {}),
      changeId: POSITION_NFT_PHASE2_CHANGE_ID,
      positionNft: normalizedNft,
      intendedPostState: {
        royaltyReceiver: normalizedTreasury,
        royaltyBps: POSITION_NFT_PHASE2_ROYALTY_BPS,
        royaltiesFrozen: true,
        naraClaimFeeBps: 0,
        tokenClaimFeeBps: 0,
        claimFeeRecipient: ethers.ZeroAddress,
        claimFeesFrozen: true,
        genesisMintersFrozen: false,
      },
      exactCallOrder: POSITION_NFT_PHASE2_FINALIZATION_CALLS,
    },
  };
}
