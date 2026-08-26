import {
  applyVirtualBuy,
  applyVirtualSell,
  createStabilizerVirtualPortfolio,
  type StabilizerVirtualPortfolio,
} from "./stabilizerVirtualPortfolio.js";

export interface ExactInputQuote {
  readonly quoteType: "EXACT_INPUT";
  readonly amountIn: bigint;
  readonly amountOut: bigint;
}

export interface HistoricalFloorExitObservation {
  readonly offsetBlocks: number;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly quote: ExactInputQuote;
  readonly gasUsdc: bigint;
}

export interface HistoricalFloorCandidate {
  readonly id: string;
  readonly entryBlock: number;
  readonly entryBlockHash: string;
  readonly entryQuote: ExactInputQuote;
  readonly entryGasUsdc: bigint;
  readonly exits: readonly HistoricalFloorExitObservation[];
}

export interface HistoricalFloorOffsetResult {
  readonly offsetBlocks: number;
  readonly candidateCount: number;
  readonly entriesApplied: number;
  readonly entriesBlocked: number;
  readonly exitsApplied: number;
  readonly realizedPnlUsdc: bigint;
  readonly endingUsdcBalance: bigint;
  readonly endingNaraBalance: bigint;
  readonly sampleCount: number;
  readonly sampleMeanPnlUsdc: bigint | null;
  readonly sampleMedianPnlUsdc: bigint | null;
  readonly winRateBps: bigint | null;
  readonly statisticsStatus:
    | "BELOW_MINIMUM_SAMPLE_COUNT"
    | "MINIMUM_SAMPLE_COUNT_REACHED";
  readonly mode: "INDEPENDENT_FIXED_EXIT_POLICIES";
  readonly candidateTrace: readonly HistoricalFloorCandidateTrace[];
  readonly appliedEpisodes: readonly HistoricalFloorAppliedEpisode[];
  readonly verdict: "BLOCKED";
  readonly verdictReason: "HISTORICAL_EXITS_OMIT_INTERVENTION_IMPACT";
}

export interface HistoricalFloorPortfolioSnapshot {
  readonly usdcBalance: bigint;
  readonly naraBalance: bigint;
}

export interface HistoricalFloorCandidateTrace {
  readonly candidateId: string;
  readonly admissionStatus: "ADMITTED" | "BLOCKED";
  readonly admissionReason:
    | null
    | "PENDING_CAPITAL"
    | "RESERVE_AFTER_LOSS"
    | "RESERVE_AND_COSTS";
  readonly portfolioBefore: HistoricalFloorPortfolioSnapshot;
  readonly portfolioAfterEntry: HistoricalFloorPortfolioSnapshot;
  readonly portfolioAfterExit: HistoricalFloorPortfolioSnapshot | null;
  readonly entryBlock: number;
  readonly entryBlockHash: string;
  readonly entryExactUsdcIn: bigint;
  readonly entryExactNaraOut: bigint;
  readonly entryGasUsdc: bigint;
  readonly exitBlock: number;
  readonly exitBlockHash: string;
  readonly exitExactNaraIn: bigint;
  readonly exitExactUsdcOut: bigint;
  readonly exitGasUsdc: bigint;
  readonly realizedPnlUsdc: bigint | null;
}

export interface HistoricalFloorAppliedEpisode {
  readonly candidateId: string;
  readonly entryBlock: number;
  readonly entryBlockHash: string;
  readonly entryExactUsdcIn: bigint;
  readonly entryExactNaraOut: bigint;
  readonly entryGasUsdc: bigint;
  readonly exitBlock: number;
  readonly exitBlockHash: string;
  readonly exitExactNaraIn: bigint;
  readonly exitExactUsdcOut: bigint;
  readonly exitGasUsdc: bigint;
  readonly realizedPnlUsdc: bigint;
}

export interface HistoricalFloorEvaluation {
  readonly initialUsdcBalance: bigint;
  readonly reserveFloorUsdc: bigint;
  readonly entryCapUsdc: bigint;
  readonly mode: "INDEPENDENT_FIXED_EXIT_POLICIES";
  readonly offsets: readonly HistoricalFloorOffsetResult[];
  readonly verdict: "BLOCKED";
  readonly verdictReason: "HISTORICAL_EXITS_OMIT_INTERVENTION_IMPACT";
}

const INITIAL_USDC = 350_000_000n;
const RESERVE_USDC = 200_000_000n;
const ENTRY_CAP_USDC = 150_000_000n;
const BLOCK_HASH = /^0x[0-9a-fA-F]{64}$/;

function requireAtomic(name: string, value: bigint): void {
  if (typeof value !== "bigint") throw new Error(`${name} must be bigint`);
  if (value < 0n) throw new Error(`${name} must be non-negative`);
}

function requireBlock(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function requireHash(name: string, value: string): void {
  if (!BLOCK_HASH.test(value)) throw new Error(`${name} is not a block hash`);
}

function validateQuote(name: string, quote: ExactInputQuote): void {
  if (quote.quoteType !== "EXACT_INPUT") {
    throw new Error(`${name} must be an exact-input quote`);
  }
  requireAtomic(`${name}.amountIn`, quote.amountIn);
  requireAtomic(`${name}.amountOut`, quote.amountOut);
  if (quote.amountIn === 0n)
    throw new Error(`${name}.amountIn must be positive`);
}

function floorDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  if (numerator >= 0n) return numerator / denominator;
  return -((-numerator + denominator - 1n) / denominator);
}

function validateInputs(
  candidates: readonly HistoricalFloorCandidate[],
  offsets: readonly number[]
): void {
  if (offsets.length === 0) throw new Error("at least one offset is required");
  const offsetSet = new Set<number>();
  let priorOffset = 0;
  for (const offset of offsets) {
    if (!Number.isSafeInteger(offset) || offset <= 0) {
      throw new Error("offsets must be positive safe integers");
    }
    if (offset <= priorOffset || offsetSet.has(offset)) {
      throw new Error("offsets must increase strictly without duplicates");
    }
    offsetSet.add(offset);
    priorOffset = offset;
  }

  const ids = new Set<string>();
  const hashesByBlock = new Map<number, string>();
  let priorEntryBlock = -1;
  for (const candidate of candidates) {
    if (candidate.id.trim() === "") throw new Error("candidate id is empty");
    if (ids.has(candidate.id))
      throw new Error(`duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);
    requireBlock("entryBlock", candidate.entryBlock);
    if (candidate.entryBlock <= priorEntryBlock) {
      throw new Error("candidate entry blocks must increase strictly");
    }
    priorEntryBlock = candidate.entryBlock;
    requireHash("entryBlockHash", candidate.entryBlockHash);
    validateQuote("entryQuote", candidate.entryQuote);
    if (candidate.entryQuote.amountOut === 0n) {
      throw new Error("entryQuote.amountOut must be positive");
    }
    requireAtomic("entryGasUsdc", candidate.entryGasUsdc);
    if (candidate.entryQuote.amountIn > ENTRY_CAP_USDC) {
      throw new Error("entryQuote.amountIn exceeds entry cap");
    }

    const knownEntryHash = hashesByBlock.get(candidate.entryBlock);
    if (
      knownEntryHash &&
      knownEntryHash !== candidate.entryBlockHash.toLowerCase()
    ) {
      throw new Error("conflicting block hashes");
    }
    hashesByBlock.set(
      candidate.entryBlock,
      candidate.entryBlockHash.toLowerCase()
    );

    if (candidate.exits.length !== offsets.length) {
      throw new Error(`candidate ${candidate.id} has an exit observation gap`);
    }
    const seenOffsets = new Set<number>();
    let priorExitOffset = 0;
    for (const exit of candidate.exits) {
      if (
        !offsetSet.has(exit.offsetBlocks) ||
        seenOffsets.has(exit.offsetBlocks)
      ) {
        throw new Error(
          `candidate ${candidate.id} has duplicate or unknown exit observation`
        );
      }
      if (exit.offsetBlocks <= priorExitOffset) {
        throw new Error(
          `candidate ${candidate.id} exit observations are non-monotonic`
        );
      }
      priorExitOffset = exit.offsetBlocks;
      seenOffsets.add(exit.offsetBlocks);
      requireBlock("exit.blockNumber", exit.blockNumber);
      if (exit.blockNumber !== candidate.entryBlock + exit.offsetBlocks) {
        throw new Error(
          `candidate ${candidate.id} exit block does not match offset`
        );
      }
      requireHash("exit.blockHash", exit.blockHash);
      validateQuote("exit.quote", exit.quote);
      if (exit.quote.amountIn !== candidate.entryQuote.amountOut) {
        throw new Error(
          `candidate ${candidate.id} exit quote is not exact inventory input`
        );
      }
      requireAtomic("exit.gasUsdc", exit.gasUsdc);
      const normalizedHash = exit.blockHash.toLowerCase();
      const knownHash = hashesByBlock.get(exit.blockNumber);
      if (knownHash && knownHash !== normalizedHash) {
        throw new Error("conflicting block hashes");
      }
      hashesByBlock.set(exit.blockNumber, normalizedHash);
    }
  }
}

interface ScheduledExit {
  readonly candidate: HistoricalFloorCandidate;
  readonly observation: HistoricalFloorExitObservation;
  readonly traceIndex: number;
}

const snapshot = (
  state: StabilizerVirtualPortfolio
): HistoricalFloorPortfolioSnapshot => ({
  usdcBalance: state.usdcBalance,
  naraBalance: state.naraBalance,
});

function evaluateOffset(
  candidates: readonly HistoricalFloorCandidate[],
  offsetBlocks: number
): HistoricalFloorOffsetResult {
  let state = createStabilizerVirtualPortfolio(INITIAL_USDC);
  let actionOrder = 0;
  let entriesApplied = 0;
  let entriesBlocked = 0;
  let exitsApplied = 0;
  const pnlSamples: bigint[] = [];
  const appliedEpisodes: HistoricalFloorAppliedEpisode[] = [];
  const candidateTrace: HistoricalFloorCandidateTrace[] = [];
  const scheduled: ScheduledExit[] = [];

  const applyDueExits = (throughBlock: number): void => {
    while (
      scheduled.length > 0 &&
      scheduled[0].observation.blockNumber <= throughBlock
    ) {
      const due = scheduled.shift()!;
      actionOrder += 1;
      const sold = applyVirtualSell(state, {
        id: `exit:${due.candidate.id}:${offsetBlocks}`,
        order: actionOrder,
        naraSold: due.observation.quote.amountIn,
        usdcProceeds: due.observation.quote.amountOut,
        gasUsdc: due.observation.gasUsdc,
        explicitCostUsdc: 0n,
      });
      if (sold.status !== "applied") {
        throw new Error(`scheduled exit blocked for ${due.candidate.id}`);
      }
      state = sold.state;
      exitsApplied += 1;
      pnlSamples.push(sold.details.realizedPnlUsdc);
      candidateTrace[due.traceIndex] = {
        ...candidateTrace[due.traceIndex],
        portfolioAfterExit: snapshot(state),
        realizedPnlUsdc: sold.details.realizedPnlUsdc,
      };
      appliedEpisodes.push({
        candidateId: due.candidate.id,
        entryBlock: due.candidate.entryBlock,
        entryBlockHash: due.candidate.entryBlockHash.toLowerCase(),
        entryExactUsdcIn: due.candidate.entryQuote.amountIn,
        entryExactNaraOut: due.candidate.entryQuote.amountOut,
        entryGasUsdc: due.candidate.entryGasUsdc,
        exitBlock: due.observation.blockNumber,
        exitBlockHash: due.observation.blockHash.toLowerCase(),
        exitExactNaraIn: due.observation.quote.amountIn,
        exitExactUsdcOut: due.observation.quote.amountOut,
        exitGasUsdc: due.observation.gasUsdc,
        realizedPnlUsdc: sold.details.realizedPnlUsdc,
      });
    }
  };

  for (const candidate of candidates) {
    applyDueExits(candidate.entryBlock);
    const portfolioBefore = snapshot(state);
    const observation = candidate.exits.find(
      (exit) => exit.offsetBlocks === offsetBlocks
    )!;
    const reservedExitGasUsdc = scheduled.reduce(
      (sum, pending) => sum + pending.observation.gasUsdc,
      0n
    );
    const totalCommitted =
      candidate.entryQuote.amountIn +
      candidate.entryGasUsdc +
      observation.gasUsdc +
      reservedExitGasUsdc;
    if (state.usdcBalance - totalCommitted < RESERVE_USDC) {
      entriesBlocked += 1;
      candidateTrace.push({
        candidateId: candidate.id,
        admissionStatus: "BLOCKED",
        admissionReason:
          scheduled.length > 0
            ? "PENDING_CAPITAL"
            : state.realizedPnlUsdc < 0n
            ? "RESERVE_AFTER_LOSS"
            : "RESERVE_AND_COSTS",
        portfolioBefore,
        portfolioAfterEntry: portfolioBefore,
        portfolioAfterExit: null,
        entryBlock: candidate.entryBlock,
        entryBlockHash: candidate.entryBlockHash.toLowerCase(),
        entryExactUsdcIn: candidate.entryQuote.amountIn,
        entryExactNaraOut: candidate.entryQuote.amountOut,
        entryGasUsdc: candidate.entryGasUsdc,
        exitBlock: observation.blockNumber,
        exitBlockHash: observation.blockHash.toLowerCase(),
        exitExactNaraIn: observation.quote.amountIn,
        exitExactUsdcOut: observation.quote.amountOut,
        exitGasUsdc: observation.gasUsdc,
        realizedPnlUsdc: null,
      });
      continue;
    }
    actionOrder += 1;
    const bought = applyVirtualBuy(state, {
      id: `entry:${candidate.id}:${offsetBlocks}`,
      order: actionOrder,
      usdcSpent: candidate.entryQuote.amountIn,
      naraReceived: candidate.entryQuote.amountOut,
      gasUsdc: candidate.entryGasUsdc,
      explicitCostUsdc: 0n,
    });
    if (bought.status !== "applied")
      throw new Error("admitted entry was blocked");
    state = bought.state;
    entriesApplied += 1;
    const traceIndex = candidateTrace.length;
    candidateTrace.push({
      candidateId: candidate.id,
      admissionStatus: "ADMITTED",
      admissionReason: null,
      portfolioBefore,
      portfolioAfterEntry: snapshot(state),
      portfolioAfterExit: null,
      entryBlock: candidate.entryBlock,
      entryBlockHash: candidate.entryBlockHash.toLowerCase(),
      entryExactUsdcIn: candidate.entryQuote.amountIn,
      entryExactNaraOut: candidate.entryQuote.amountOut,
      entryGasUsdc: candidate.entryGasUsdc,
      exitBlock: observation.blockNumber,
      exitBlockHash: observation.blockHash.toLowerCase(),
      exitExactNaraIn: observation.quote.amountIn,
      exitExactUsdcOut: observation.quote.amountOut,
      exitGasUsdc: observation.gasUsdc,
      realizedPnlUsdc: null,
    });
    scheduled.push({ candidate, observation, traceIndex });
    scheduled.sort(
      (a, b) => a.observation.blockNumber - b.observation.blockNumber
    );
  }
  applyDueExits(Number.MAX_SAFE_INTEGER);

  const sorted = [...pnlSamples].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sampleCount = sorted.length;
  const totalPnl = sorted.reduce((sum, value) => sum + value, 0n);
  const mean =
    sampleCount === 0 ? null : floorDiv(totalPnl, BigInt(sampleCount));
  const median =
    sampleCount === 0
      ? null
      : sampleCount % 2 === 1
      ? sorted[Math.floor(sampleCount / 2)]
      : floorDiv(sorted[sampleCount / 2 - 1] + sorted[sampleCount / 2], 2n);
  const wins = sorted.filter((value) => value > 0n).length;

  return {
    offsetBlocks,
    candidateCount: candidates.length,
    entriesApplied,
    entriesBlocked,
    exitsApplied,
    realizedPnlUsdc: state.realizedPnlUsdc,
    endingUsdcBalance: state.usdcBalance,
    endingNaraBalance: state.naraBalance,
    sampleCount,
    sampleMeanPnlUsdc: mean,
    sampleMedianPnlUsdc: median,
    winRateBps:
      sampleCount === 0 ? null : (BigInt(wins) * 10_000n) / BigInt(sampleCount),
    statisticsStatus:
      sampleCount < 30
        ? "BELOW_MINIMUM_SAMPLE_COUNT"
        : "MINIMUM_SAMPLE_COUNT_REACHED",
    mode: "INDEPENDENT_FIXED_EXIT_POLICIES",
    candidateTrace,
    appliedEpisodes,
    verdict: "BLOCKED",
    verdictReason: "HISTORICAL_EXITS_OMIT_INTERVENTION_IMPACT",
  };
}

export function evaluateHistoricalFloorEv(
  candidates: readonly HistoricalFloorCandidate[],
  offsets: readonly number[]
): HistoricalFloorEvaluation {
  validateInputs(candidates, offsets);
  return {
    initialUsdcBalance: INITIAL_USDC,
    reserveFloorUsdc: RESERVE_USDC,
    entryCapUsdc: ENTRY_CAP_USDC,
    mode: "INDEPENDENT_FIXED_EXIT_POLICIES",
    offsets: offsets.map((offset) => evaluateOffset(candidates, offset)),
    verdict: "BLOCKED",
    verdictReason: "HISTORICAL_EXITS_OMIT_INTERVENTION_IMPACT",
  };
}
