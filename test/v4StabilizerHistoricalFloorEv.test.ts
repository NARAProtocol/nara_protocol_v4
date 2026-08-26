import { expect } from "chai";
import {
  evaluateHistoricalFloorEv,
  type HistoricalFloorCandidate,
} from "../scripts/matrix/stabilizerHistoricalFloorEv.js";

const USDC = 10n ** 6n;
const NARA = 10n ** 18n;
const hash = (digit: string) => `0x${digit.repeat(64)}`;

function candidate(
  id: string,
  entryBlock: number,
  entryOut = 1_000n * NARA,
  exitOut = 160n * USDC,
  entryIn = 148n * USDC,
  entryGas = 1n * USDC,
  exitGas = 1n * USDC
): HistoricalFloorCandidate {
  return {
    id,
    entryBlock,
    entryBlockHash: hash("a"),
    entryQuote: {
      quoteType: "EXACT_INPUT",
      amountIn: entryIn,
      amountOut: entryOut,
    },
    entryGasUsdc: entryGas,
    exits: [
      {
        offsetBlocks: 5,
        blockNumber: entryBlock + 5,
        blockHash: hash("b"),
        quote: {
          quoteType: "EXACT_INPUT",
          amountIn: entryOut,
          amountOut: exitOut,
        },
        gasUsdc: exitGas,
      },
    ],
  };
}

describe("v4 stabilizer historical floor EV", () => {
  it("blocks overlapping entries while capital is committed", () => {
    const result = evaluateHistoricalFloorEv(
      [candidate("first", 100), candidate("overlap", 102)],
      [5]
    ).offsets[0];
    expect(result.entriesApplied).to.equal(1);
    expect(result.entriesBlocked).to.equal(1);
    expect(result.exitsApplied).to.equal(1);
    expect(result.endingNaraBalance).to.equal(0n);
    expect(
      result.candidateTrace.map((item) => item.admissionReason)
    ).to.deep.equal([null, "PENDING_CAPITAL"]);
  });

  it("preserves the 200-USDC reserve including entry and exit gas", () => {
    const tooLarge = candidate(
      "gas-boundary",
      100,
      1_000n * NARA,
      160n * USDC,
      149n * USDC,
      1n * USDC,
      1n * USDC
    );
    const result = evaluateHistoricalFloorEv([tooLarge], [5]).offsets[0];
    expect(result.entriesApplied).to.equal(0);
    expect(result.entriesBlocked).to.equal(1);
    expect(result.endingUsdcBalance).to.equal(350n * USDC);
  });

  it("accounts for a realized loss and sequentially reduced cash", () => {
    const losing = candidate("loss", 100, 1_000n * NARA, 140n * USDC);
    const result = evaluateHistoricalFloorEv(
      [losing, candidate("after-loss", 110)],
      [5]
    ).offsets[0];
    expect(result.realizedPnlUsdc).to.equal(-10n * USDC);
    expect(result.endingUsdcBalance).to.equal(340n * USDC);
    expect(result.sampleMeanPnlUsdc).to.equal(-10n * USDC);
    expect(result.winRateBps).to.equal(0n);
    expect(result.candidateTrace[1].admissionReason).to.equal(
      "RESERVE_AFTER_LOSS"
    );
  });

  it("keeps an apparently positive sample verdict BLOCKED", () => {
    const result = evaluateHistoricalFloorEv([candidate("win", 100)], [5]);
    expect(result.offsets[0].realizedPnlUsdc).to.equal(10n * USDC);
    expect(result.offsets[0].winRateBps).to.equal(10_000n);
    expect(result.offsets[0].verdict).to.equal("BLOCKED");
    expect(result.offsets[0].statisticsStatus).to.equal(
      "BELOW_MINIMUM_SAMPLE_COUNT"
    );
    expect(result.offsets[0].mode).to.equal("INDEPENDENT_FIXED_EXIT_POLICIES");
    expect(result.mode).to.equal("INDEPENDENT_FIXED_EXIT_POLICIES");
    expect(result.verdict).to.equal("BLOCKED");
    expect(result.verdictReason).to.equal(
      "HISTORICAL_EXITS_OMIT_INTERVENTION_IMPACT"
    );
    expect(result.offsets[0].appliedEpisodes).to.deep.equal([
      {
        candidateId: "win",
        entryBlock: 100,
        entryBlockHash: hash("a"),
        entryExactUsdcIn: 148n * USDC,
        entryExactNaraOut: 1_000n * NARA,
        entryGasUsdc: 1n * USDC,
        exitBlock: 105,
        exitBlockHash: hash("b"),
        exitExactNaraIn: 1_000n * NARA,
        exitExactUsdcOut: 160n * USDC,
        exitGasUsdc: 1n * USDC,
        realizedPnlUsdc: 10n * USDC,
      },
    ]);
    expect(result.offsets[0].candidateTrace[0]).to.include({
      candidateId: "win",
      admissionStatus: "ADMITTED",
      admissionReason: null,
      realizedPnlUsdc: 10n * USDC,
    });
    expect(result.offsets[0].candidateTrace[0].portfolioBefore).to.deep.equal({
      usdcBalance: 350n * USDC,
      naraBalance: 0n,
    });
    expect(
      result.offsets[0].candidateTrace[0].portfolioAfterEntry
    ).to.deep.equal({
      usdcBalance: 201n * USDC,
      naraBalance: 1_000n * NARA,
    });
    expect(
      result.offsets[0].candidateTrace[0].portfolioAfterExit
    ).to.deep.equal({
      usdcBalance: 360n * USDC,
      naraBalance: 0n,
    });
  });

  it("uses each offset's distinct exact exit quote without reuse", () => {
    const base = candidate("offsets", 100);
    const exitAmounts = [150n, 151n, 152n, 153n, 154n].map(
      (value) => value * USDC
    );
    const offsets = [1, 3, 5, 10, 20];
    const withOffsets: HistoricalFloorCandidate = {
      ...base,
      exits: offsets.map((offsetBlocks, index) => ({
        offsetBlocks,
        blockNumber: base.entryBlock + offsetBlocks,
        blockHash: hash(String(index + 1)),
        quote: {
          quoteType: "EXACT_INPUT",
          amountIn: base.entryQuote.amountOut,
          amountOut: exitAmounts[index],
        },
        gasUsdc: 1n * USDC,
      })),
    };

    const result = evaluateHistoricalFloorEv([withOffsets], offsets);
    expect(result.offsets.map((item) => item.realizedPnlUsdc)).to.deep.equal([
      0n,
      1n * USDC,
      2n * USDC,
      3n * USDC,
      4n * USDC,
    ]);
    expect(
      result.offsets.map((item) => item.appliedEpisodes[0].exitExactUsdcOut)
    ).to.deep.equal(exitAmounts);
  });

  it("rejects a missing fixed-offset quote observation", () => {
    const missing = { ...candidate("missing", 100), exits: [] };
    expect(() => evaluateHistoricalFloorEv([missing], [5])).to.throw(
      "exit observation gap"
    );
  });

  it("rejects non-monotonic candidates and duplicate observations", () => {
    expect(() =>
      evaluateHistoricalFloorEv(
        [candidate("later", 100), candidate("earlier", 99)],
        [5]
      )
    ).to.throw("entry blocks must increase strictly");
    const duplicate = candidate("duplicate", 100);
    expect(() =>
      evaluateHistoricalFloorEv(
        [{ ...duplicate, exits: [duplicate.exits[0], duplicate.exits[0]] }],
        [5, 10]
      )
    ).to.throw("duplicate or unknown exit observation");
  });

  it("rejects invalid hashes and nonexact quote inventory", () => {
    expect(() =>
      evaluateHistoricalFloorEv(
        [{ ...candidate("hash", 100), entryBlockHash: "0x1234" }],
        [5]
      )
    ).to.throw("not a block hash");
    const badExit = candidate("quote", 100);
    expect(() =>
      evaluateHistoricalFloorEv(
        [
          {
            ...badExit,
            exits: [
              {
                ...badExit.exits[0],
                quote: { ...badExit.exits[0].quote, amountIn: 999n * NARA },
              },
            ],
          },
        ],
        [5]
      )
    ).to.throw("exit quote is not exact inventory input");
  });

  it("reports conservative mean and median across sequential samples", () => {
    const result = evaluateHistoricalFloorEv(
      [
        candidate("one", 100, 1_000n * NARA, 151n * USDC),
        candidate("two", 110, 1_000n * NARA, 152n * USDC),
      ],
      [5]
    ).offsets[0];
    expect(result.entriesApplied).to.equal(2);
    expect(result.sampleCount).to.equal(2);
    expect(result.sampleMeanPnlUsdc).to.equal(1_500_000n);
    expect(result.sampleMedianPnlUsdc).to.equal(1_500_000n);
  });
});
