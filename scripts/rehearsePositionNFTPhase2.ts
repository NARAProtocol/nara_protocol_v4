process.env.V4_POSITION_NFT_MODE = "rehearse";
await import("./deployPositionNFTStack.js");
if (!process.exitCode) {
  await import("./verifyRehearsalPositionNFTPhase2.js");
}
