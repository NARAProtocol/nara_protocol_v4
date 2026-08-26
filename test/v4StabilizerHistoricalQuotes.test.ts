import { expect } from "chai";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import {
  collectCanonicalHistoricalSourceFlow,
  quoteV4ExactInputAtBlock,
  type HistoricalBlock,
  type HistoricalReadProvider,
  type HistoricalReceipt,
} from "../scripts/matrix/stabilizerHistoricalQuotes.js";
import {
  V4_POOL_MANAGER_SWAP_EVENT_ABI,
  type CanonicalSwapLog,
} from "../scripts/matrix/stabilizerSwapFlow.js";

const BLOCK_NUMBER = 50_399_791;
const BLOCK_HASH = `0x${"50".repeat(32)}`;
const REORG_HASH = `0x${"51".repeat(32)}`;
const TX_A = `0x${"aa".repeat(32)}`;
const TX_B = `0x${"bb".repeat(32)}`;
const POOL_ID = `0x${"12".repeat(32)}`;
const OTHER_POOL_ID = `0x${"34".repeat(32)}`;
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const QUOTER = "0x0d5e0F971ED27FBfF6c2837bf31316121532048D";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NARA = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
const HOOK = "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088";
const SENDER = "0x2222222222222222222222222222222222222222";
const swapInterface = new ethers.Interface([V4_POOL_MANAGER_SWAP_EVENT_ABI]);
const quoterInterface = new ethers.Interface([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);

function swapLog(
  transactionHash: string,
  index: number,
  amount0: bigint,
  amount1: bigint,
  poolId = POOL_ID
): CanonicalSwapLog {
  const encoded = swapInterface.encodeEventLog(
    swapInterface.getEvent("Swap")!,
    [poolId, SENDER, amount0, amount1, 2n ** 96n, 1_000_000n, 0, 3_000]
  );
  return {
    address: POOL_MANAGER,
    transactionHash,
    index,
    topics: encoded.topics,
    data: encoded.data,
  };
}

function receipt(
  hash: string,
  logs: readonly CanonicalSwapLog[],
  overrides: Partial<HistoricalReceipt> = {}
): HistoricalReceipt {
  return {
    hash,
    blockNumber: BLOCK_NUMBER,
    blockHash: BLOCK_HASH,
    status: 1,
    logs,
    ...overrides,
  };
}

class MockProvider implements HistoricalReadProvider {
  readonly receipts = new Map<string, HistoricalReceipt>();
  readonly calls: { to: string; data: string; blockTag: number }[] = [];
  blocks: Array<HistoricalBlock | null> = [
    { number: BLOCK_NUMBER, hash: BLOCK_HASH },
  ];
  quoteResult = quoterInterface.encodeFunctionResult("quoteExactInputSingle", [
    777n,
    88_888n,
  ]);
  quoteError = false;
  blockReads = 0;

  async getBlock(_blockNumber: number): Promise<HistoricalBlock | null> {
    const block =
      this.blocks[Math.min(this.blockReads, this.blocks.length - 1)];
    this.blockReads++;
    return block;
  }

  async getTransactionReceipt(
    transactionHash: string
  ): Promise<HistoricalReceipt | null> {
    return this.receipts.get(transactionHash) ?? null;
  }

  async call(transaction: {
    to: string;
    data: string;
    blockTag: number;
  }): Promise<string> {
    this.calls.push(transaction);
    if (this.quoteError) throw new Error("archive node rejected exact block");
    return this.quoteResult;
  }
}

function sourceOptions() {
  return {
    triggerBlockNumber: BLOCK_NUMBER,
    triggerBlockHash: BLOCK_HASH,
    transactionHashes: [TX_A, TX_B],
    poolManager: POOL_MANAGER,
    poolId: POOL_ID,
    tokenIsCurrency0: false,
    expectedSide: "pump" as const,
  };
}

function quoteOptions(side: "pump" | "floor" = "pump") {
  return {
    blockNumber: BLOCK_NUMBER,
    blockHash: BLOCK_HASH,
    quoter: QUOTER,
    currency0: USDC,
    currency1: NARA,
    fee: 3_000,
    tickSpacing: 60,
    hook: HOOK,
    tokenIsCurrency0: false,
    side,
    exactAmount: side === "pump" ? 100_000_000n : 2_000_000_000_000_000_000n,
  };
}

async function expectRejected(
  promise: Promise<unknown>,
  expectedMessage: string
): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  expect(error).to.be.instanceOf(Error);
  expect((error as Error).message).to.equal(expectedMessage);
}

describe("v4 stabilizer historical quotes", () => {
  it("verifies and aggregates exact canonical source flows across receipts", async () => {
    const provider = new MockProvider();
    const unrelated = swapLog(TX_A, 1, -1n, 1n, OTHER_POOL_ID);
    provider.receipts.set(
      TX_A,
      receipt(TX_A, [
        unrelated,
        swapLog(TX_A, 2, -40_000_001n, 800_000_000_000_000_001n),
      ])
    );
    provider.receipts.set(
      TX_B,
      receipt(TX_B, [
        swapLog(TX_B, 5, -59_999_999n, 1_199_999_999_999_999_999n),
      ])
    );

    const result = await collectCanonicalHistoricalSourceFlow(
      provider,
      sourceOptions()
    );

    expect(result.side).to.equal("pump");
    expect(result.transactionHashes).to.deep.equal([TX_A, TX_B]);
    expect(result.swapLogCount).to.equal(2);
    expect(result.amount0CallerDelta).to.equal(-100_000_000n);
    expect(result.amount1CallerDelta).to.equal(2_000_000_000_000_000_000n);
    expect(result.usdcIn).to.equal(100_000_000n);
    expect(result.naraOut).to.equal(2_000_000_000_000_000_000n);
    expect(provider.blockReads).to.equal(2);
  });

  it("rejects absent receipts and multi-block transaction sets", async () => {
    const absent = new MockProvider();
    await expectRejected(
      collectCanonicalHistoricalSourceFlow(absent, sourceOptions()),
      "historical_quote_rejected:receipt_absent"
    );

    const multiBlock = new MockProvider();
    multiBlock.receipts.set(TX_A, receipt(TX_A, [swapLog(TX_A, 1, -1n, 1n)]));
    multiBlock.receipts.set(
      TX_B,
      receipt(TX_B, [swapLog(TX_B, 2, -1n, 1n)], {
        blockNumber: BLOCK_NUMBER + 1,
        blockHash: REORG_HASH,
      })
    );
    await expectRejected(
      collectCanonicalHistoricalSourceFlow(multiBlock, sourceOptions()),
      "historical_quote_rejected:multi_block_transaction_set"
    );
  });

  it("rejects reorged blocks and source directions inconsistent with the trigger", async () => {
    const reorged = new MockProvider();
    reorged.blocks = [{ number: BLOCK_NUMBER, hash: REORG_HASH }];
    await expectRejected(
      collectCanonicalHistoricalSourceFlow(reorged, sourceOptions()),
      "historical_quote_rejected:canonical_block_hash_mismatch"
    );

    const reorgedDuringCollection = new MockProvider();
    reorgedDuringCollection.blocks = [
      { number: BLOCK_NUMBER, hash: BLOCK_HASH },
      { number: BLOCK_NUMBER, hash: REORG_HASH },
    ];
    reorgedDuringCollection.receipts.set(
      TX_A,
      receipt(TX_A, [swapLog(TX_A, 1, -1n, 1n)])
    );
    reorgedDuringCollection.receipts.set(
      TX_B,
      receipt(TX_B, [swapLog(TX_B, 2, -1n, 1n)])
    );
    await expectRejected(
      collectCanonicalHistoricalSourceFlow(
        reorgedDuringCollection,
        sourceOptions()
      ),
      "historical_quote_rejected:canonical_block_hash_mismatch"
    );

    const wrongDirection = new MockProvider();
    wrongDirection.receipts.set(
      TX_A,
      receipt(TX_A, [swapLog(TX_A, 1, 10n, -20n)])
    );
    wrongDirection.receipts.set(
      TX_B,
      receipt(TX_B, [swapLog(TX_B, 2, 10n, -20n)])
    );
    await expectRejected(
      collectCanonicalHistoricalSourceFlow(wrongDirection, sourceOptions()),
      "canonical_swap_flow_rejected:unexpected_trigger_direction"
    );
  });

  it("quotes an arbitrary pump input only at the exact block tag", async () => {
    const provider = new MockProvider();

    const quote = await quoteV4ExactInputAtBlock(provider, quoteOptions());

    expect(quote).to.deep.equal({
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
      side: "pump",
      semantics: "exact_input_usdc_to_nara",
      inputAsset: "USDC",
      outputAsset: "NARA",
      exactAmountIn: 100_000_000n,
      amountOut: 777n,
      gasEstimate: 88_888n,
      zeroForOne: true,
    });
    expect(provider.calls).to.have.length(1);
    expect(provider.calls[0]).to.include({
      to: QUOTER,
      blockTag: BLOCK_NUMBER,
    });
    const decoded = quoterInterface.decodeFunctionData(
      "quoteExactInputSingle",
      provider.calls[0].data
    );
    expect(decoded.params.exactAmount).to.equal(100_000_000n);
    expect(decoded.params.zeroForOne).to.equal(true);
    expect(provider.blockReads).to.equal(2);
  });

  it("quotes a sell with correct direction and semantics", async () => {
    const provider = new MockProvider();

    const quote = await quoteV4ExactInputAtBlock(
      provider,
      quoteOptions("floor")
    );

    expect(quote.side).to.equal("floor");
    expect(quote.semantics).to.equal("exact_input_nara_to_usdc");
    expect(quote.inputAsset).to.equal("NARA");
    expect(quote.outputAsset).to.equal("USDC");
    expect(quote.zeroForOne).to.equal(false);
    expect(provider.calls[0].blockTag).to.equal(BLOCK_NUMBER);
  });

  it("rejects a reorg during quoting and never falls back to current head", async () => {
    const provider = new MockProvider();
    provider.blocks = [
      { number: BLOCK_NUMBER, hash: BLOCK_HASH },
      { number: BLOCK_NUMBER, hash: REORG_HASH },
    ];
    await expectRejected(
      quoteV4ExactInputAtBlock(provider, quoteOptions()),
      "historical_quote_rejected:canonical_block_hash_mismatch"
    );
    expect(provider.calls).to.have.length(1);
    expect(provider.calls[0].blockTag).to.equal(BLOCK_NUMBER);

    const unavailable = new MockProvider();
    unavailable.quoteError = true;
    await expectRejected(
      quoteV4ExactInputAtBlock(unavailable, quoteOptions()),
      "historical_quote_rejected:block_pinned_quote_failed"
    );
    expect(unavailable.calls).to.have.length(1);
    expect(unavailable.calls[0].blockTag).to.equal(BLOCK_NUMBER);
  });

  it("has no environment, signer, transaction, write, or CLI surface", () => {
    const source = readFileSync(
      "scripts/matrix/stabilizerHistoricalQuotes.ts",
      "utf8"
    );

    expect(source).not.to.contain("process.env");
    expect(source).not.to.match(
      /JsonRpcProvider|Wallet|Signer|sendTransaction/
    );
    expect(source).not.to.match(/readFile|writeFile|appendFile|fetch\(/);
    expect(source).not.to.contain("process.argv");
  });
});
