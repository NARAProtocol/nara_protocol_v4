process.env.V4_POSITION_NFT_ALLOW_PENDING = "1";
process.env.V4_POSITION_NFT_ALLOW_REHEARSAL = "0";
process.env.V4_POSITION_NFT_MANIFEST = "deployments/v4-position-nft-phase2-2026-08-21.json";
await import("./verifyPositionNFTPhase2.js");
