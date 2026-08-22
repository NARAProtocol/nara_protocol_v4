import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, keccak256, parseAbi } from "viem";
import { base } from "viem/chains";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../../..");
try {
  process.loadEnvFile(resolve(repositoryRoot, ".env"));
} catch {
  // The public Base RPC remains a usable fallback when no local env file exists.
}
const manifest = JSON.parse(await readFile(
  resolve(repositoryRoot, "deployments/v4-production-activation-2026-08-09.json"),
  "utf8",
));
const deployment = {
  account: manifest.envSync.deployer,
  nara: manifest.envSync.token,
  usdc: manifest.envSync.usdc,
  hook: manifest.envSync.hook,
  permit2: manifest.envSync.permit2,
  universalRouter: manifest.envSync.universalRouter,
  quoter: manifest.infrastructure.officialV4Quoter,
  fee: manifest.envSync.poolFee,
  tickSpacing: manifest.envSync.tickSpacing,
};
const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
const hookAbi = parseAbi([
  "function quotePoolFeeDetailed(bool isBuy,uint256 amountIn) view returns (uint16 marginalFeeBps,uint16 effectiveFeeBps,uint256 feeAmount)",
]);
const client = createPublicClient({
  chain: base,
  transport: http(
    process.env.BASE_MAINNET_RPC_URL
      || process.env.BASE_RPC_URL
      || "https://mainnet.base.org",
  ),
});
const naraIsCurrency0 = BigInt(deployment.nara) < BigInt(deployment.usdc);
const poolKey = {
  currency0: naraIsCurrency0 ? deployment.nara : deployment.usdc,
  currency1: naraIsCurrency0 ? deployment.usdc : deployment.nara,
  fee: deployment.fee,
  tickSpacing: deployment.tickSpacing,
  hooks: deployment.hook,
};
const blockNumber = await client.getBlockNumber();
const codeTargets = [
  ["NARA", deployment.nara, manifest.contracts.token.runtimeCodeHash],
  ["USDC", deployment.usdc, "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab"],
  ["NARA hook", deployment.hook, manifest.contracts.liquidityHook.runtimeCodeHash],
  ["Permit2", deployment.permit2, "0xa67739abc3ede9dbdc0491636c67d6a14ac07fab9030c3f509b1eb7b11dff8ed"],
  ["Universal Router", deployment.universalRouter, "0x27713951fb0660a1422b710122022d90723d883dc7b72949be79cb2957d234e0"],
  ["v4 Quoter", deployment.quoter, "0x9a5c0cdd56325bef0e48cdab071a4b6a7f877e1271c2e08510998d724a038bb3"],
];
const codes = await Promise.all(codeTargets.map(([, address]) =>
  client.getBytecode({ address, blockNumber })
));
codeTargets.forEach(([label, , expected], index) => {
  const code = codes[index];
  if (!code || code === "0x") throw new Error(`${label} bytecode is missing`);
  if (keccak256(code).toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} bytecode hash differs from the approved production route`);
  }
});

async function check(name, isBuy, amountIn) {
  const [quote, fee] = await Promise.all([
    client.simulateContract({
      account: deployment.account,
      address: deployment.quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{
        poolKey,
        zeroForOne: isBuy ? !naraIsCurrency0 : naraIsCurrency0,
        exactAmount: amountIn,
        hookData: "0x",
      }],
      blockNumber,
    }),
    client.readContract({
      address: deployment.hook,
      abi: hookAbi,
      functionName: "quotePoolFeeDetailed",
      args: [isBuy, amountIn],
      blockNumber,
    }),
  ]);
  const amountOut = quote.result.amountOut ?? quote.result[0];
  const feeAmount = fee.feeAmount ?? fee[2];
  if (amountOut <= 0n) throw new Error(`${name} quote returned zero output`);
  if (feeAmount > amountIn) throw new Error(`${name} NARA fee exceeds its input`);
  return {
    direction: name,
    amountIn: amountIn.toString(),
    naraFeeAmount: feeAmount.toString(),
    amountAfterNaraFee: (amountIn - feeAmount).toString(),
    amountOut: amountOut.toString(),
    effectiveHookFeeBps: (fee.effectiveFeeBps ?? fee[1]).toString(),
    marginalHookFeeBps: (fee.marginalFeeBps ?? fee[0]).toString(),
  };
}

const [buy, sell] = await Promise.all([
  check("USDC_TO_NARA", true, 1_000_000n),
  check("NARA_TO_USDC", false, 100n * 10n ** 18n),
]);

console.log(JSON.stringify({ chainId: base.id, blockNumber: blockNumber.toString(), buy, sell }, null, 2));
