import { createHash } from "node:crypto";
import { ethers } from "ethers";
import {
  POSITION_NFT_PHASE2_CHAIN_ID,
  POSITION_NFT_PHASE2_CONTRACTS,
  POSITION_NFT_PHASE2_FQNS,
  type PositionNftPhase2ContractName,
} from "./v4PositionNftPhase2.js";

export interface BaseScanSourceProof {
  provider: "basescan-v2";
  explorerUrl: string;
  apiReference: string;
  contractName: string;
  compilerVersion: string;
  optimizationUsed: "1";
  runs: "1";
  evmVersion: string;
  proxy: "0";
  implementation: string;
  abiSha256: string;
  sourceCodeSha256: string;
  compilerSourcesSha256: string;
  constructorArgumentsHexSha256: string;
}

export interface PositionNftSourceVerificationEntry extends BaseScanSourceProof {
  status: "verified";
  address: string;
  fullyQualifiedName: string;
  constructorArguments: unknown[];
  constructorArgumentsSha256: string;
  expectedConstructorArgumentsHexSha256: string;
  artifactSha256: string;
  sourceSha256: string;
  compilerInputSha256: string;
  verifiedAt: string;
}

export interface PositionNftSourceVerificationEvidence {
  schemaVersion: 1;
  chainId: "8453";
  status: "verified";
  sourceCommit: string;
  evidenceCommit: string;
  pendingManifest: { path: string; sha256: string };
  contracts: Record<PositionNftPhase2ContractName, PositionNftSourceVerificationEntry>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function requireObject(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, any>;
}

function requireExactKeys(value: unknown, expected: readonly string[], label: string): Record<string, any> {
  const object = requireObject(value, label);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} contains missing or unapproved extra fields`);
  }
  return object;
}

function exactContractKeys(value: unknown, label: string): Record<string, any> {
  const object = requireObject(value, label);
  if (
    Object.keys(object).sort().join(",") !==
    [...POSITION_NFT_PHASE2_CONTRACTS].sort().join(",")
  ) {
    throw new Error(`${label} must contain the exact seven Position NFT contracts`);
  }
  return object;
}

export async function expectedConstructorArgumentsHex(
  artifact: { abi: any; bytecode: string },
  constructorArguments: readonly unknown[],
): Promise<string> {
  const transaction = await new ethers.ContractFactory(artifact.abi, artifact.bytecode)
    .getDeployTransaction(...constructorArguments);
  const data = String(transaction.data ?? "");
  if (!data.startsWith(artifact.bytecode) || !ethers.isHexString(data)) {
    throw new Error("Could not derive constructor arguments from the reviewed creation bytecode");
  }
  return `0x${data.slice(artifact.bytecode.length)}`.toLowerCase();
}

export async function queryBaseScanSourceProof(
  apiKey: string,
  address: string,
): Promise<BaseScanSourceProof> {
  if (apiKey.trim() === "") throw new Error("BASESCAN_API_KEY is required for source-verification evidence");
  const normalizedAddress = ethers.getAddress(address);
  const apiReference =
    `https://api.etherscan.io/v2/api?chainid=${POSITION_NFT_PHASE2_CHAIN_ID}` +
    `&module=contract&action=getsourcecode&address=${normalizedAddress}`;
  const response = await fetch(`${apiReference}&apikey=${encodeURIComponent(apiKey)}`, {
    headers: { Accept: "application/json", "User-Agent": "nara-v4-position-nft-source-verifier" },
  });
  if (!response.ok) throw new Error(`BaseScan source verification lookup failed (${response.status})`);
  const payload = await response.json() as { status?: unknown; message?: unknown; result?: unknown };
  if (payload.status !== "1" || !Array.isArray(payload.result) || payload.result.length !== 1) {
    throw new Error(`BaseScan did not return one verified source record (${String(payload.message)})`);
  }
  const result = requireObject(payload.result[0], "BaseScan source record");
  const sourceCode = String(result.SourceCode ?? "");
  const abi = String(result.ABI ?? "");
  if (
    sourceCode.trim() === "" ||
    abi.trim() === "" ||
    /not verified/i.test(abi) ||
    String(result.Proxy) !== "0" ||
    String(result.Implementation ?? "") !== ""
  ) {
    throw new Error("BaseScan source record is absent, unverified, or unexpectedly proxy-based");
  }
  JSON.parse(abi);
  const trimmedSourceCode = sourceCode.trim();
  const standardJsonSource = trimmedSourceCode.startsWith("{{") && trimmedSourceCode.endsWith("}}")
    ? trimmedSourceCode.slice(1, -1)
    : trimmedSourceCode;
  let compilerInput: Record<string, any>;
  try {
    compilerInput = requireObject(JSON.parse(standardJsonSource), "BaseScan standard-json source");
  } catch {
    throw new Error("BaseScan did not return reproducible standard-json compiler source");
  }
  if (!compilerInput.sources || typeof compilerInput.sources !== "object" || Array.isArray(compilerInput.sources)) {
    throw new Error("BaseScan standard-json source lacks the compiler source map");
  }
  const constructorArguments = String(result.ConstructorArguments ?? "").replace(/^0x/i, "");
  if (!/^[0-9a-f]*$/i.test(constructorArguments) || constructorArguments.length % 2 !== 0) {
    throw new Error("BaseScan returned malformed constructor arguments");
  }
  return {
    provider: "basescan-v2",
    explorerUrl: `https://basescan.org/address/${normalizedAddress}#code`,
    apiReference,
    contractName: String(result.ContractName ?? ""),
    compilerVersion: String(result.CompilerVersion ?? ""),
    optimizationUsed: String(result.OptimizationUsed) as "1",
    runs: String(result.Runs) as "1",
    evmVersion: String(result.EVMVersion ?? ""),
    proxy: "0",
    implementation: "",
    abiSha256: sha256(canonicalJson(JSON.parse(abi))),
    sourceCodeSha256: sha256(sourceCode.replace(/\r\n/g, "\n")),
    compilerSourcesSha256: sha256(canonicalJson(compilerInput.sources)),
    constructorArgumentsHexSha256: sha256(`0x${constructorArguments.toLowerCase()}`),
  };
}

export async function assertPositionNftSourceVerificationEvidence(
  value: unknown,
  context: {
    sourceCommit: string;
    evidenceCommit: string;
    pendingManifestPath: string;
    pendingManifestSha256: string;
    contracts: Record<string, any>;
    sourceArtifacts: Record<string, any>;
    artifacts: { readArtifact(fullyQualifiedName: string): Promise<any> };
  },
): Promise<PositionNftSourceVerificationEvidence> {
  const evidence = requireExactKeys(value, [
    "schemaVersion",
    "chainId",
    "status",
    "sourceCommit",
    "evidenceCommit",
    "pendingManifest",
    "contracts",
  ], "source verification evidence");
  if (
    evidence.schemaVersion !== 1 ||
    String(evidence.chainId) !== POSITION_NFT_PHASE2_CHAIN_ID.toString() ||
    evidence.status !== "verified" ||
    String(evidence.sourceCommit).toLowerCase() !== context.sourceCommit.toLowerCase() ||
    String(evidence.evidenceCommit).toLowerCase() !== context.evidenceCommit.toLowerCase()
  ) {
    throw new Error("Source-verification evidence header/release binding is invalid");
  }
  const supersedes = requireExactKeys(
    evidence.pendingManifest,
    ["path", "sha256"],
    "source verification pendingManifest",
  );
  if (
    supersedes.path !== context.pendingManifestPath ||
    String(supersedes.sha256).toLowerCase() !== context.pendingManifestSha256.toLowerCase()
  ) {
    throw new Error("Source-verification evidence does not hash-link the pending deployment manifest");
  }
  const entries = exactContractKeys(evidence.contracts, "source verification contracts");
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    const entry = requireExactKeys(entries[name], [
      "status",
      "address",
      "fullyQualifiedName",
      "constructorArguments",
      "constructorArgumentsSha256",
      "expectedConstructorArgumentsHexSha256",
      "artifactSha256",
      "sourceSha256",
      "compilerInputSha256",
      "verifiedAt",
      "provider",
      "explorerUrl",
      "apiReference",
      "contractName",
      "compilerVersion",
      "optimizationUsed",
      "runs",
      "evmVersion",
      "proxy",
      "implementation",
      "abiSha256",
      "sourceCodeSha256",
      "compilerSourcesSha256",
      "constructorArgumentsHexSha256",
    ], `source verification ${name}`);
    const contract = requireObject(context.contracts[name], `manifest contract ${name}`);
    const sourceArtifact = requireObject(context.sourceArtifacts[name], `manifest source artifact ${name}`);
    const address = ethers.getAddress(String(contract.address));
    const constructorArguments = contract.constructorArguments;
    if (!Array.isArray(constructorArguments)) throw new Error(`${name} constructor arguments are not an array`);
    const artifact = await context.artifacts.readArtifact(POSITION_NFT_PHASE2_FQNS[name]);
    const expectedArgumentsHex = await expectedConstructorArgumentsHex(artifact, constructorArguments);
    if (
      entry.status !== "verified" ||
      ethers.getAddress(String(entry.address)) !== address ||
      entry.fullyQualifiedName !== POSITION_NFT_PHASE2_FQNS[name] ||
      canonicalJson(entry.constructorArguments) !== canonicalJson(constructorArguments) ||
      entry.constructorArgumentsSha256 !== sha256(canonicalJson(constructorArguments)) ||
      entry.expectedConstructorArgumentsHexSha256 !== sha256(expectedArgumentsHex) ||
      entry.artifactSha256 !== sourceArtifact.artifactSha256 ||
      entry.sourceSha256 !== sourceArtifact.sourceSha256 ||
      entry.compilerInputSha256 !== sourceArtifact.compilerInputSha256 ||
      entry.compilerSourcesSha256 !== sourceArtifact.compilerSourcesSha256 ||
      entry.provider !== "basescan-v2" ||
      entry.explorerUrl !== `https://basescan.org/address/${address}#code` ||
      entry.apiReference !==
        `https://api.etherscan.io/v2/api?chainid=${POSITION_NFT_PHASE2_CHAIN_ID}` +
          `&module=contract&action=getsourcecode&address=${address}` ||
      entry.contractName !== name ||
      entry.compilerVersion !== `v${sourceArtifact.solcLongVersion}` ||
      entry.optimizationUsed !== "1" ||
      entry.runs !== "1" ||
      entry.evmVersion.toLowerCase() !== "cancun" ||
      entry.proxy !== "0" ||
      entry.implementation !== "" ||
      entry.abiSha256 !== sourceArtifact.abiSha256 ||
      entry.constructorArgumentsHexSha256 !== sha256(expectedArgumentsHex) ||
      !/^[0-9a-f]{64}$/i.test(String(entry.sourceCodeSha256)) ||
      !Number.isFinite(Date.parse(String(entry.verifiedAt)))
    ) {
      throw new Error(`${name} source-verification evidence does not bind the exact deployed reviewed source`);
    }
  }
  return evidence as PositionNftSourceVerificationEvidence;
}
