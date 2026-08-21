import {
  POSITION_NFT_PHASE2_CHAIN_ID,
  POSITION_NFT_PHASE2_CHANGE_ID,
  POSITION_NFT_PHASE2_FINALIZATION_CALLS,
} from "./v4PositionNftPhase2.js";

export interface CanonicalPositionNftSigningPacketInput {
  createdAt: string;
  packetPath: string;
  pendingManifestPath: string;
  pendingManifestSha256: string;
  sourceCommit: string;
  evidenceCommit: string;
  releaseCommit: string;
  sourceVerification: unknown;
  sourceVerificationArtifact: { path: string; sha256: string };
  signingBlockNumber: number;
  signingBlockHash: string;
  signingBlockTimestamp: number;
  productionRuntime: unknown;
  coreContainment: unknown;
  positionNftPhase2Runtime: unknown;
  safeSnapshot: any;
  positionNft: unknown;
  batch: any;
  batchSha256: string;
  signingBatchPath: string;
  safeTxHash: string;
  safeBatchPlan: unknown;
  freshnessCheck: unknown;
}

/** Construct the only accepted JIT Safe packet shape; callers compare it byte-for-byte. */
export function canonicalPositionNftPhase2SigningPacket(
  input: CanonicalPositionNftSigningPacketInput,
) {
  return {
    schemaVersion: 1,
    packetType: "nara_v4_position_nft_phase2_safe_signing_packet",
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    evidenceState: "unexecuted_safe_signing_packet",
    integrationReady: false,
    network: "base",
    chainId: POSITION_NFT_PHASE2_CHAIN_ID.toString(),
    createdAt: input.createdAt,
    packetPath: input.packetPath,
    supersedes: {
      pendingManifestPath: input.pendingManifestPath,
      pendingManifestSha256: input.pendingManifestSha256,
    },
    release: {
      sourceCommit: input.sourceCommit,
      evidenceCommit: input.evidenceCommit,
      releaseCommit: input.releaseCommit,
    },
    sourceVerification: input.sourceVerification,
    sourceVerificationArtifact: input.sourceVerificationArtifact,
    verifiedAtBlock: input.signingBlockNumber,
    verifiedAtBlockHash: input.signingBlockHash,
    pinnedBlock: {
      number: input.signingBlockNumber,
      hash: input.signingBlockHash,
      timestamp: input.signingBlockTimestamp,
    },
    productionRuntime: input.productionRuntime,
    coreContainment: input.coreContainment,
    positionNftPhase2Runtime: input.positionNftPhase2Runtime,
    safeSnapshot: input.safeSnapshot,
    positionNft: input.positionNft,
    exactCalls: POSITION_NFT_PHASE2_FINALIZATION_CALLS,
    batch: input.batch,
    batchSha256: input.batchSha256,
    safeTxBuilderImport: {
      status: "UNEXECUTED",
      artifactPath: input.signingBatchPath,
      artifactSha256: input.batchSha256,
      sourceCanonicalBatchPath: null,
      sourceCanonicalBatchLocation: "pendingManifest.safeFinalization.batch",
      byteIdentity: "identical_to_embedded_pending_canonical_batch",
      exactArtifactFieldInThisPacket: "batch",
      instruction:
        "Import only this exact batch after matching the separate packet's Safe nonce and safeTxHash immediately before signing.",
    },
    safeNonce: input.safeSnapshot.nonce,
    safeTxHash: input.safeTxHash,
    safeBatchPlan: input.safeBatchPlan,
    freshnessCheck: input.freshnessCheck,
    execution: {
      status: "UNEXECUTED",
      signing: "not_performed",
      sending: "not_performed",
      execution: "not_performed",
      instruction: "Rebuild this packet immediately before human Safe signing; never reuse it after the Safe nonce changes.",
    },
  };
}
