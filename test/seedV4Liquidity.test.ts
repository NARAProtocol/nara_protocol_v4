import { expect } from "chai";
import { ethers } from "ethers";
import {
  mintedTokenIdFromReceipt,
  requireApprovedSeedAmounts,
} from "../scripts/seedV4Liquidity.js";

const POSITION_MANAGER = "0x00000000000000000000000000000000000000a1";
const OWNER = "0x00000000000000000000000000000000000000b2";
const TRANSFER = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

function transferLog(from: string, to: string, tokenId: bigint, address = POSITION_MANAGER) {
  const encoded = TRANSFER.encodeEventLog(TRANSFER.getEvent("Transfer"), [from, to, tokenId]);
  return {
    address,
    topics: encoded.topics,
    data: encoded.data,
  };
}

describe("seedV4Liquidity hardening", function () {
  it("accepts only the approved 60,000 NARA / 300 USDC launch ratio", function () {
    expect(() => requireApprovedSeedAmounts("60000", "300")).not.to.throw();
    expect(() => requireApprovedSeedAmounts("30", "300")).to.throw("Refusing unapproved launch ratio");
    expect(() => requireApprovedSeedAmounts("60000", "299.99")).to.throw("Refusing unapproved launch ratio");
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
