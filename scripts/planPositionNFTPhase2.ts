process.env.V4_POSITION_NFT_MODE = "plan";
process.env.V4_POSITION_NFT_WRITE_PLAN_EVIDENCE = "0";
await import("./deployPositionNFTStack.js");
