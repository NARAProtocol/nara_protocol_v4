const rehearsalManifest = (globalThis as any).__NARA_POSITION_NFT_REHEARSAL_MANIFEST__;
if (typeof rehearsalManifest !== "string" || rehearsalManifest.length === 0) {
  throw new Error(
    "Rehearsal verification must run in the same process as rehearsePositionNFTPhase2.ts; run npm run rehearse:v4:position-nft",
  );
}
process.env.V4_POSITION_NFT_ALLOW_PENDING = "1";
process.env.V4_POSITION_NFT_ALLOW_REHEARSAL = "1";
process.env.V4_POSITION_NFT_MANIFEST = rehearsalManifest;
await import("./verifyPositionNFTPhase2.js");
