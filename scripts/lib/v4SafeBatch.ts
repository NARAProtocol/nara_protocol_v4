import { ethers } from "ethers";
import { encodeSafeMultiSendTransactions } from "./v4AtomicPoolLaunch.js";
import {
  BASE_MULTISEND_CALL_ONLY,
  BASE_MULTISEND_CALL_ONLY_CODEHASH,
  NARA_SAFE_ABI,
} from "./v4SafeEvidence.js";

const SAFE_EXECUTION_ABI = [
  ...NARA_SAFE_ABI,
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) returns (bool success)",
  "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
] as const;
const MULTISEND_ABI = ["function multiSend(bytes transactions)"] as const;

export interface SafeBatchCall {
  to: string;
  value: string;
  data: string;
}

export interface DecodedSafeExecution {
  transactionReceipt: {
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
    status: 1;
    gasUsed: string;
  };
  safeTransactionHash: string;
  safeNonce: string;
  outer: {
    to: string;
    value: string;
    operation: number;
    safeTxGas: string;
    baseGas: string;
    gasPrice: string;
    gasToken: string;
    refundReceiver: string;
  };
  calls: SafeBatchCall[];
}

export interface SafeBatchSimulationEvidence {
  safeTransaction: {
    to: string;
    value: "0";
    data: string;
    operation: 1;
    safeTxGas: "0";
    baseGas: "0";
    gasPrice: "0";
    gasToken: string;
    refundReceiver: string;
    nonce: string;
  };
  safeTxHash: string;
  packedTransactionsHash: string;
  multiSendCallOnly: string;
  multiSendCallOnlyCodeHash: string;
  simulatedAtBlock: number;
  simulation: "PASS: Safe.simulateAndRevert -> canonical MultiSendCallOnly.multiSend";
}

function revertData(error: unknown): string | undefined {
  const candidate = error as {
    data?: unknown;
    error?: { data?: unknown };
    info?: { error?: { data?: unknown } };
  };
  for (const value of [candidate.data, candidate.error?.data, candidate.info?.error?.data]) {
    if (typeof value === "string" && ethers.isHexString(value)) return value;
  }
  return undefined;
}

export function decodeSafeSimulationResult(data: string): { succeeded: boolean; response: string } {
  const bytes = ethers.getBytes(data);
  if (bytes.length < 64) throw new Error("Safe simulation revert payload is shorter than two words");
  const successWord = BigInt(ethers.hexlify(bytes.slice(0, 32)));
  const responseLength = Number(BigInt(ethers.hexlify(bytes.slice(32, 64))));
  if ((successWord !== 0n && successWord !== 1n) || !Number.isSafeInteger(responseLength)) {
    throw new Error("Safe simulation revert header is malformed");
  }
  if (bytes.length !== 64 + responseLength) {
    throw new Error("Safe simulation revert response length does not match the payload");
  }
  return {
    succeeded: successWord === 1n,
    response: ethers.hexlify(bytes.slice(64)),
  };
}

export async function buildAndSimulateSafeBatch(
  provider: ethers.Provider & { send(method: string, params: unknown[]): Promise<unknown> },
  safeAddress: string,
  safeNonce: bigint,
  calls: readonly SafeBatchCall[],
  blockNumber: number,
): Promise<SafeBatchSimulationEvidence> {
  const safe = ethers.getAddress(safeAddress);
  const targetCodes = await Promise.all(
    [...new Set(calls.map((call) => ethers.getAddress(call.to)))].map(async (target) => ({
      target,
      code: await provider.getCode(target, blockNumber),
    })),
  );
  for (const { target, code } of targetCodes) {
    if (code === "0x") throw new Error(`Safe batch target has no runtime code at the simulation block: ${target}`);
  }
  const multiSendCode = await provider.getCode(BASE_MULTISEND_CALL_ONLY, blockNumber);
  const multiSendCodeHash = ethers.keccak256(multiSendCode).toLowerCase();
  if (multiSendCodeHash !== BASE_MULTISEND_CALL_ONLY_CODEHASH) {
    throw new Error("MultiSendCallOnly runtime code hash differs from approved Safe 1.4.1 infrastructure");
  }
  const packedTransactions = encodeSafeMultiSendTransactions(
    calls.map((call) => ({
      operation: 0 as const,
      to: ethers.getAddress(call.to),
      value: call.value,
      data: call.data,
    })),
  );
  const multiSendCall = new ethers.Interface(MULTISEND_ABI).encodeFunctionData("multiSend", [packedTransactions]);
  const safeInterface = new ethers.Interface(SAFE_EXECUTION_ABI);
  const simulationCall = safeInterface.encodeFunctionData("simulateAndRevert", [
    BASE_MULTISEND_CALL_ONLY,
    multiSendCall,
  ]);
  try {
    await provider.send("eth_call", [
      { to: safe, data: simulationCall },
      ethers.toQuantity(blockNumber),
    ]);
    throw new Error("Safe simulateAndRevert unexpectedly returned without reverting");
  } catch (error) {
    const data = revertData(error);
    if (data) {
      try {
        const { succeeded } = decodeSafeSimulationResult(data);
        if (!succeeded) throw new Error("Safe batch simulation returned failure");
      } catch (decodeError) {
        if (decodeError instanceof Error && decodeError.message === "Safe batch simulation returned failure") {
          throw decodeError;
        }
        throw new Error("Could not decode Safe simulateAndRevert result");
      }
    } else {
      throw new Error("Safe simulateAndRevert returned no decodable result");
    }
  }

  const safeTransaction = {
    to: ethers.getAddress(BASE_MULTISEND_CALL_ONLY),
    value: "0" as const,
    data: multiSendCall,
    operation: 1 as const,
    safeTxGas: "0" as const,
    baseGas: "0" as const,
    gasPrice: "0" as const,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: safeNonce.toString(),
  };
  const safeContract = new ethers.Contract(safe, NARA_SAFE_ABI, provider);
  const safeTxHash = await safeContract.getTransactionHash(
    safeTransaction.to,
    safeTransaction.value,
    safeTransaction.data,
    safeTransaction.operation,
    safeTransaction.safeTxGas,
    safeTransaction.baseGas,
    safeTransaction.gasPrice,
    safeTransaction.gasToken,
    safeTransaction.refundReceiver,
    safeTransaction.nonce,
    { blockTag: blockNumber },
  );

  return {
    safeTransaction,
    safeTxHash: String(safeTxHash),
    packedTransactionsHash: ethers.keccak256(packedTransactions),
    multiSendCallOnly: ethers.getAddress(BASE_MULTISEND_CALL_ONLY),
    multiSendCallOnlyCodeHash: multiSendCodeHash,
    simulatedAtBlock: blockNumber,
    simulation: "PASS: Safe.simulateAndRevert -> canonical MultiSendCallOnly.multiSend",
  };
}

export function decodeMultiSendCalls(packed: string): SafeBatchCall[] {
  const bytes = ethers.getBytes(packed);
  const calls: SafeBatchCall[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 85) throw new Error("Truncated Safe MultiSend transaction header");
    const operation = bytes[offset];
    const to = ethers.getAddress(ethers.hexlify(bytes.slice(offset + 1, offset + 21)));
    const value = BigInt(ethers.hexlify(bytes.slice(offset + 21, offset + 53)));
    const dataLength = Number(BigInt(ethers.hexlify(bytes.slice(offset + 53, offset + 85))));
    const dataStart = offset + 85;
    const dataEnd = dataStart + dataLength;
    if (!Number.isSafeInteger(dataLength) || dataEnd > bytes.length) {
      throw new Error("Invalid Safe MultiSend transaction data length");
    }
    if (operation !== 0) throw new Error("Position NFT finalization inner operations must all be CALL");
    calls.push({ to, value: value.toString(), data: ethers.hexlify(bytes.slice(dataStart, dataEnd)) });
    offset = dataEnd;
  }
  if (offset !== bytes.length) throw new Error("Safe MultiSend payload has trailing bytes");
  return calls;
}

export async function decodeAndVerifySafeExecution(
  provider: ethers.Provider,
  safeAddress: string,
  transactionHash: string,
  expectedCalls: readonly SafeBatchCall[],
  expectedPlan: SafeBatchSimulationEvidence,
): Promise<DecodedSafeExecution> {
  const safe = ethers.getAddress(safeAddress);
  const [transaction, receipt] = await Promise.all([
    provider.getTransaction(transactionHash),
    provider.getTransactionReceipt(transactionHash),
  ]);
  if (!transaction || !receipt || receipt.status !== 1 || ethers.getAddress(transaction.to ?? ethers.ZeroAddress) !== safe) {
    throw new Error("Safe finalization transaction/receipt is missing, reverted, or targets the wrong Safe");
  }
  const receiptBlock = await provider.getBlock(receipt.blockNumber);
  if (
    transaction.hash.toLowerCase() !== transactionHash.toLowerCase() ||
    receipt.hash.toLowerCase() !== transactionHash.toLowerCase() ||
    !receiptBlock?.hash ||
    /^0x0{64}$/i.test(receiptBlock.hash) ||
    receiptBlock.hash.toLowerCase() !== receipt.blockHash.toLowerCase()
  ) {
    throw new Error("Safe finalization transaction/receipt block evidence is not canonical");
  }

  const safeInterface = new ethers.Interface(SAFE_EXECUTION_ABI);
  const parsed = safeInterface.parseTransaction({ data: transaction.data, value: transaction.value });
  if (!parsed || parsed.name !== "execTransaction") {
    throw new Error("Safe finalization transaction is not execTransaction");
  }
  const [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver] = parsed.args;
  if (
    ethers.getAddress(to) !== ethers.getAddress(BASE_MULTISEND_CALL_ONLY) ||
    value !== 0n ||
    Number(operation) !== 1
  ) {
    throw new Error("Safe finalization must delegatecall the canonical MultiSendCallOnly with zero value");
  }
  const planned = expectedPlan.safeTransaction;
  if (
    ethers.getAddress(to) !== ethers.getAddress(planned.to) ||
    value.toString() !== planned.value ||
    String(data).toLowerCase() !== planned.data.toLowerCase() ||
    Number(operation) !== planned.operation ||
    safeTxGas.toString() !== planned.safeTxGas ||
    baseGas.toString() !== planned.baseGas ||
    gasPrice.toString() !== planned.gasPrice ||
    ethers.getAddress(gasToken) !== ethers.getAddress(planned.gasToken) ||
    ethers.getAddress(refundReceiver) !== ethers.getAddress(planned.refundReceiver)
  ) {
    throw new Error("Executed Safe outer transaction differs from the reviewed zero-reimbursement plan");
  }
  const multiSendCode = await provider.getCode(BASE_MULTISEND_CALL_ONLY, receipt.blockNumber);
  if (ethers.keccak256(multiSendCode).toLowerCase() !== BASE_MULTISEND_CALL_ONLY_CODEHASH) {
    throw new Error("Executed Safe transaction used an unapproved MultiSendCallOnly runtime");
  }
  const multiSendInterface = new ethers.Interface(MULTISEND_ABI);
  const multiSend = multiSendInterface.parseTransaction({ data });
  if (!multiSend || multiSend.name !== "multiSend") throw new Error("Safe finalization payload is not multiSend(bytes)");
  const calls = decodeMultiSendCalls(multiSend.args[0]);
  const normalizedExpected = expectedCalls.map((call) => ({
    to: ethers.getAddress(call.to),
    value: BigInt(call.value).toString(),
    data: call.data.toLowerCase(),
  }));
  const normalizedActual = calls.map((call) => ({ ...call, data: call.data.toLowerCase() }));
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error("Safe finalization inner calls differ from the exact reviewed five-call batch");
  }

  const successEvent = safeInterface.getEvent("ExecutionSuccess");
  if (!successEvent) throw new Error("Safe ExecutionSuccess event is absent from the canonical ABI");
  const successTopic = successEvent.topicHash;
  const successLogs = receipt.logs.filter(
    (log) => ethers.getAddress(log.address) === safe && log.topics[0]?.toLowerCase() === successTopic.toLowerCase(),
  );
  if (successLogs.length !== 1) throw new Error("Safe finalization receipt lacks exactly one ExecutionSuccess event");
  const success = safeInterface.parseLog(successLogs[0]);
  if (!success) throw new Error("Could not decode Safe ExecutionSuccess event");
  const safeTransactionHash = String(success.args.txHash);
  if (BigInt(success.args.payment) !== 0n) {
    throw new Error("Safe finalization unexpectedly paid a gas reimbursement");
  }

  const safeContract = new ethers.Contract(safe, NARA_SAFE_ABI, provider);
  const calculatedHash = await safeContract.getTransactionHash(
    to,
    value,
    data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
    BigInt(planned.nonce),
    { blockTag: receipt.blockNumber },
  );
  if (
    String(calculatedHash).toLowerCase() !== safeTransactionHash.toLowerCase() ||
    safeTransactionHash.toLowerCase() !== expectedPlan.safeTxHash.toLowerCase()
  ) {
    throw new Error("Recorded Safe nonce does not reproduce the executed Safe transaction hash");
  }

  return {
    transactionReceipt: {
      transactionHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: 1,
      gasUsed: receipt.gasUsed.toString(),
    },
    safeTransactionHash,
    safeNonce: planned.nonce,
    outer: {
      to: ethers.getAddress(to),
      value: value.toString(),
      operation: Number(operation),
      safeTxGas: safeTxGas.toString(),
      baseGas: baseGas.toString(),
      gasPrice: gasPrice.toString(),
      gasToken: ethers.getAddress(gasToken),
      refundReceiver: ethers.getAddress(refundReceiver),
    },
    calls,
  };
}
