/**
 * Read-only historical floor-defense EV screen over one canonical Matrix
 * session. Historical quotes are obtained from exact local Base fork states;
 * no signer or transaction is created. Because later canonical states omit the
 * hypothetical entry's price impact, every economic verdict remains BLOCKED.
 */
import { readFileSync } from "node:fs";
import { expect } from "chai";
import { ethers as ethersUtils } from "ethers";
import hre from "hardhat";
import { canonicalProductionV4Deployment } from "../../scripts/lib/v4LiveConfig.js";
import {
  evaluateHistoricalFloorEv,
  type HistoricalFloorCandidate,
} from "../../scripts/matrix/stabilizerHistoricalFloorEv.js";
import {
  bindCanonicalCandidateTransactionHashes,
  selectUniqueHistoricalFloorCandidateEvidence,
} from "../../scripts/matrix/stabilizerHistoricalCandidateIdentity.js";
import {
  collectCanonicalHistoricalSourceFlow,
  quoteV4ExactInputAtBlock,
  type HistoricalReadProvider,
} from "../../scripts/matrix/stabilizerHistoricalQuotes.js";
import { modeledGasUsdc } from "../../scripts/matrix/stabilizerGasModel.js";
import {
  BASE_V4_QUOTER,
  verifyProductionV4ReadOnlyRuntime,
} from "../../scripts/matrix/v4ReadOnlyPool.js";
import {
  parseCanonicalStabilizerShadowJsonl,
  summarizeStabilizerShadowText,
} from "../../scripts/matrix/summarizeStabilizerShadow.js";

const ARCHIVE_RPC = process.env.V4_STABILIZER_ARCHIVE_RPC_URL?.trim() ?? "";
const LEDGER_PATH = process.env.V4_STABILIZER_LEDGER_PATH?.trim() ?? "";
const SESSION_ID = process.env.V4_STABILIZER_SESSION_ID?.trim() ?? "";
const OFFSETS = [1, 3, 5, 10, 20] as const;
const ENTRY_USDC = 148n * 10n ** 6n;
const configured =
  ARCHIVE_RPC !== "" && LEDGER_PATH !== "" && SESSION_ID !== "";

interface FloorLedgerCandidate {
  id: string;
  triggerBlock: number;
  triggerBlockHash: string;
  transactionHashes: string[];
}

function requireBlock(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function requireHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a bytes32 hash`);
  }
  return value.toLowerCase();
}

function ledgerCandidates(jsonl: string): FloorLedgerCandidate[] {
  const summary = summarizeStabilizerShadowText(jsonl);
  const session = summary.sessions.find(
    (item) => item.sessionId === SESSION_ID
  );
  if (!session) throw new Error("requested Matrix session not found");
  if (!session.releaseEvidenceEligibility.eligible) {
    throw new Error(
      `requested Matrix session is release-ineligible: ${session.releaseEvidenceEligibility.exclusionReasons.join(
        ","
      )}`
    );
  }
  const canonicalEvidence = selectUniqueHistoricalFloorCandidateEvidence(
    session.simulationEvidence
  );
  const evidenceByLine = new Map(
    canonicalEvidence.map((evidence) => [evidence.line, evidence])
  );
  const parsed = parseCanonicalStabilizerShadowJsonl(jsonl);
  const candidates = parsed.entries
    .filter(
      (entry) =>
        entry.sessionId === SESSION_ID &&
        entry.schemaVersion === 2 &&
        entry.value.kind === "floorDefenseSimulated"
    )
    .map((entry) => {
      const transactionHashes = entry.value.transactionHashes;
      const evidence = evidenceByLine.get(entry.line);
      if (!evidence) {
        throw new Error(`line ${entry.line} has no canonical v2 identity`);
      }
      if (!Array.isArray(transactionHashes)) {
        throw new Error(`line ${entry.line} has invalid transaction hashes`);
      }
      const triggerBlockHash = requireHash(
        entry.value.triggerBlockHash,
        "triggerBlockHash"
      );
      if (triggerBlockHash !== evidence.triggerBlockHash) {
        throw new Error(`line ${entry.line} identity binding mismatch`);
      }
      return {
        id: evidence.identity,
        triggerBlock: requireBlock(entry.value.triggerBlock, "triggerBlock"),
        triggerBlockHash,
        transactionHashes: bindCanonicalCandidateTransactionHashes(
          evidence,
          transactionHashes
        ),
      };
    })
    .sort((a, b) => a.triggerBlock - b.triggerBlock);
  if (candidates.length !== canonicalEvidence.length) {
    throw new Error("canonical floor evidence count mismatch");
  }
  return candidates;
}

(configured ? describe : describe.skip)(
  "deployed NARA v4 - historical floor EV screen",
  function () {
    it("evaluates every canonical floor candidate without authorizing execution", async function () {
      this.timeout(1_800_000);
      const jsonl = readFileSync(LEDGER_PATH, "utf8");
      const selected = ledgerCandidates(jsonl);
      expect(selected).to.have.length(15);

      const deployment = canonicalProductionV4Deployment();
      const tokenIsCurrency0 =
        BigInt(deployment.token) < BigInt(deployment.base);
      const currency0 = tokenIsCurrency0 ? deployment.token : deployment.base;
      const currency1 = tokenIsCurrency0 ? deployment.base : deployment.token;
      const upstream = new ethersUtils.JsonRpcProvider(ARCHIVE_RPC, 8453, {
        staticNetwork: true,
      });
      const quoteAt = async (
        blockNumber: number,
        side: "pump" | "floor",
        exactAmount: bigint,
        verifyRuntime: boolean
      ) => {
        const connection = await hre.network.connect({
          network: "baseStabilizerArchiveFork",
          override: {
            forking: { url: ARCHIVE_RPC, blockNumber },
          },
        });
        try {
          expect(connection.networkName).to.equal("baseStabilizerArchiveFork");
          const forkProvider = (
            connection as unknown as {
              ethers: { provider: ethersUtils.Provider };
            }
          ).ethers.provider;
          expect((await forkProvider.getNetwork()).chainId).to.equal(8453n);
          const upstreamBlock = await upstream.getBlock(blockNumber);
          expect(upstreamBlock?.hash).to.match(/^0x[0-9a-fA-F]{64}$/);
          const forkBlock = await forkProvider.getBlock("latest");
          expect(forkBlock?.number).to.equal(blockNumber);
          expect(forkBlock?.hash?.toLowerCase()).to.equal(
            upstreamBlock!.hash!.toLowerCase()
          );
          if (verifyRuntime) {
            await verifyProductionV4ReadOnlyRuntime(forkProvider, deployment);
          }
          const quote = await quoteV4ExactInputAtBlock(
            forkProvider as unknown as HistoricalReadProvider,
            {
              blockNumber,
              blockHash: upstreamBlock!.hash!.toLowerCase(),
              quoter: BASE_V4_QUOTER,
              currency0,
              currency1,
              fee: deployment.poolFee,
              tickSpacing: deployment.tickSpacing,
              hook: deployment.hook,
              tokenIsCurrency0,
              side,
              exactAmount,
            }
          );
          return {
            quote,
            hash: upstreamBlock!.hash!.toLowerCase(),
            baseFeePerGas: forkBlock!.baseFeePerGas,
          };
        } finally {
          await connection.close();
        }
      };

      const collected: HistoricalFloorCandidate[] = [];
      try {
        for (const [index, candidate] of selected.entries()) {
          const source = await collectCanonicalHistoricalSourceFlow(
            upstream as unknown as HistoricalReadProvider,
            {
              triggerBlockNumber: candidate.triggerBlock,
              triggerBlockHash: candidate.triggerBlockHash,
              transactionHashes: candidate.transactionHashes,
              poolManager: deployment.poolManager,
              poolId: deployment.poolId,
              tokenIsCurrency0,
              expectedSide: "floor",
            }
          );
          expect(source.naraIn > 0n).to.equal(true);
          expect(source.usdcOut > 0n).to.equal(true);

          const entryBlock = candidate.triggerBlock + 1;
          const entryRead = await quoteAt(
            entryBlock,
            "pump",
            ENTRY_USDC,
            index === 0
          );
          const entry = entryRead.quote;
          const exits = [];
          for (const offsetBlocks of OFFSETS) {
            const exitBlock = entryBlock + offsetBlocks;
            const exitRead = await quoteAt(
              exitBlock,
              "floor",
              entry.amountOut,
              index === selected.length - 1 && offsetBlocks === OFFSETS.at(-1)
            );
            const exit = exitRead.quote;
            exits.push({
              offsetBlocks,
              blockNumber: exitBlock,
              blockHash: exitRead.hash,
              quote: {
                quoteType: "EXACT_INPUT" as const,
                amountIn: exit.exactAmountIn,
                amountOut: exit.amountOut,
              },
              gasUsdc: modeledGasUsdc(exit.gasEstimate, exitRead.baseFeePerGas),
            });
          }
          collected.push({
            id: candidate.id,
            entryBlock,
            entryBlockHash: entryRead.hash,
            entryQuote: {
              quoteType: "EXACT_INPUT",
              amountIn: entry.exactAmountIn,
              amountOut: entry.amountOut,
            },
            entryGasUsdc: modeledGasUsdc(
              entry.gasEstimate,
              entryRead.baseFeePerGas
            ),
            exits,
          });
        }
      } finally {
        upstream.destroy();
      }

      const evaluation = evaluateHistoricalFloorEv(collected, OFFSETS);
      expect(evaluation.verdict).to.equal("BLOCKED");
      expect(evaluation.offsets).to.have.length(OFFSETS.length);
      expect(
        evaluation.offsets.every((item) => item.endingNaraBalance === 0n)
      ).to.equal(true);

      console.log(
        JSON.stringify(
          {
            schemaVersion: 1,
            scope: "HISTORICAL_COUNTERFACTUAL_SCREEN",
            sessionId: SESSION_ID,
            candidatesQuoted: collected.length,
            candidateIdentitySchema:
              "chainId|poolId|configFingerprint|triggerBlockHash|sortedObservationIds",
            exitOffsetsRelativeToEntry: [...OFFSETS],
            offsetPortfolioMode: "INDEPENDENT_FIXED_EXIT_POLICIES",
            counterfactualStateMode:
              "canonical_history_omits_intervention_state",
            gasModel: {
              gasUnits: "max(350000, quoterEstimate*2)",
              gasPriceWei: "max(blockBaseFee*2, 10000000)",
              ethPriceUsdc: "5000",
              l1DataBufferUsdcPerAction: "0.05",
              limitations: [
                "APPROVAL_AND_BOOTSTRAP_COSTS_OMITTED",
                "FIXED_ETH_USDC_CONVERSION",
              ],
            },
            evaluation,
            evidenceComplete: false,
            verdict: "BLOCKED",
            executionAuthorized: false,
          },
          (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          2
        )
      );
    });
  }
);
