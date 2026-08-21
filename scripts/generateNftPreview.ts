/**
 * QUARANTINED historical preview entry point.
 *
 * This helper deployed the retired monolithic NARAPositionArtV1 and wrote to a
 * machine-specific directory. It is intentionally non-executable on every
 * network so it cannot be mistaken for the current Phase-2 art-QA flow.
 *
 * Use: npm run preview:v4:position-nft-art
 */
throw new Error(
  "QUARANTINED: generateNftPreview.ts targets retired Position NFT art. " +
    "Use npm run preview:v4:position-nft-art on the local Hardhat network.",
);
