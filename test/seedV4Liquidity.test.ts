import { expect } from "chai";
import { ethers } from "ethers";
import {
  mintedTokenIdFromReceipt,
  requireApprovedSeedAmounts,
  requireNonQuarantinedLiquidityStack,
  seedInitializationPlan,
} from "../scripts/seedV4Liquidity.js";

const POSITION_MANAGER = "0x00000000000000000000000000000000000000a1";
const OWNER = "0x00000000000000000000000000000000000000b2";
const TRANSFER = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

function transferLog(from: string, to: string, tokenId: bigint, address = POSITION_MANAGER) {
  const encoded = TRANSFER.encodeEventLog(TRANSFER.getEvent("Transfer")!, [from, to, tokenId]);
  return {
    address,
    topics: encoded.topics,
    data: encoded.data,
  };
}

describe("seedV4Liquidity hardening", function () {
  it("refuses the quarantined Stage A hook or pool ID", function () {
    const safeHook = "0x0000000000000000000000000000000000002088";
    const safePool = `0x${"11".repeat(32)}`;
    const stageAHook = "0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088";
    const stageAPool = "0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3";

    expect(() => requireNonQuarantinedLiquidityStack(safeHook, safePool)).not.to.throw();
    expect(() => requireNonQuarantinedLiquidityStack(stageAHook, safePool))
      .to.throw("Refusing to seed the quarantined Stage A liquidity stack");
    expect(() => requireNonQuarantinedLiquidityStack(safeHook, stageAPool))
      .to.throw("Refusing to seed the quarantined Stage A liquidity stack");
  });

  it("accepts only the approved 60,000 NARA / 300 USDC launch ratio", function () {
    expect(() => requireApprovedSeedAmounts("60000", "300")).not.to.throw();
    expect(() => requireApprovedSeedAmounts("30", "300")).to.throw("Refusing unapproved launch ratio");
    expect(() => requireApprovedSeedAmounts("60000", "299.99")).to.throw("Refusing unapproved launch ratio");
  });

  it("derives only a price-safe legacy recovery plan", function () {
    const expected = 123_456n;
    expect(seedInitializationPlan(0n, expected)).to.equal("initialize-and-mint");
    expect(seedInitializationPlan(expected, expected)).to.equal("mint-only");
    expect(() => seedInitializationPlan(expected + 1n, expected))
      .to.throw("Pool initialization price mismatch");
    expect(() => seedInitializationPlan(0n, 0n))
      .to.throw("expectedSqrtPriceX96 is not configured");
  });

  it("derives the minted LP token ID from the confirmed PositionManager Transfer log", function () {
    const receipt = {
      logs: [
        transferLog(ethers.ZeroAddress, OWNER, 91n, "0x00000000000000000000000000000000000000c3"),
        transferLog("0x00000000000000000000000000000000000000d4", OWNER, 92n),
        transferLog(ethers.ZeroAddress, OWNER, 93n),
      ],
    } as unknown as ethers.TransactionReceipt;

    expect(mintedTokenIdFromReceipt(receipt, POSITION_MANAGER, OWNER)).to.equal(93n);
  });

  it("fails closed when no unique expected LP mint exists", function () {
    const noMint = { logs: [] } as unknown as ethers.TransactionReceipt;
    expect(() => mintedTokenIdFromReceipt(noMint, POSITION_MANAGER, OWNER))
      .to.throw("Expected exactly one LP NFT mint in receipt, found 0");

    const duplicate = {
      logs: [
        transferLog(ethers.ZeroAddress, OWNER, 1n),
        transferLog(ethers.ZeroAddress, OWNER, 2n),
      ],
    } as unknown as ethers.TransactionReceipt;
    expect(() => mintedTokenIdFromReceipt(duplicate, POSITION_MANAGER, OWNER))
      .to.throw("Expected exactly one LP NFT mint in receipt, found 2");
  });
});
