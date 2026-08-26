import { defineConfig } from "hardhat/config";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatTypechain from "@nomicfoundation/hardhat-typechain";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "";
const BASE_RPC_URL =
  process.env.BASE_MAINNET_RPC_URL ||
  process.env.BASE_RPC_URL ||
  "https://mainnet.base.org";
const BASE_STABILIZER_ARCHIVE_RPC_URL =
  process.env.V4_STABILIZER_ARCHIVE_RPC_URL?.trim() ?? "";
const BASE_STABILIZER_FORK_BLOCK = (() => {
  if (!BASE_STABILIZER_ARCHIVE_RPC_URL) return null;
  const raw = process.env.V4_STABILIZER_FORK_BLOCK?.trim() ?? "";
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      "V4_STABILIZER_FORK_BLOCK must be set to the exact trigger block when V4_STABILIZER_ARCHIVE_RPC_URL is configured"
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("V4_STABILIZER_FORK_BLOCK must be a positive safe integer");
  }
  return value;
})();

const networks = {
  default: {
    type: "edr-simulated",
    chainType: "l1",
    allowUnlimitedContractSize: true,
    blockGasLimit: 60_000_000,
    hardfork: "cancun",
  },
  hardhat: {
    type: "edr-simulated",
    chainType: "l1",
    allowUnlimitedContractSize: true,
    blockGasLimit: 60_000_000,
    hardfork: "cancun",
  },
  localhost: {
    type: "http",
    chainType: "l1",
    url: process.env.LOCALHOST_RPC_URL ?? "http://127.0.0.1:8545",
    accounts: PRIVATE_KEY ? [PRIVATE_KEY] : "remote",
  },
} as const;

const optionalNetworks: Record<string, unknown> = {};

if (BASE_SEPOLIA_RPC_URL) {
  optionalNetworks.baseSepolia = {
    type: "http",
    chainType: "op",
    url: BASE_SEPOLIA_RPC_URL,
    accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
  };
}

if (BASE_RPC_URL) {
  optionalNetworks.base = {
    type: "http",
    chainType: "op",
    url: BASE_RPC_URL,
    accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
  };
  // Base mainnet fork for integration tests against real Uniswap v4 (PoolManager / PositionManager
  // / Permit2). Only present when an RPC is configured; fork tests skip otherwise.
  optionalNetworks.baseFork = {
    type: "edr-simulated",
    chainType: "op",
    chainId: 8453,
    allowUnlimitedContractSize: true,
    blockGasLimit: 60_000_000,
    hardfork: "isthmus",
    forking: {
      url: BASE_RPC_URL,
    },
  };
  // Immutable incident-state fork used only by the end-to-end liquidity
  // retirement proof. Keep the general Base fork on latest for other suites.
  optionalNetworks.baseLiquidityRetirementFork = {
    type: "edr-simulated",
    chainType: "op",
    chainId: 8453,
    allowUnlimitedContractSize: true,
    blockGasLimit: 60_000_000,
    hardfork: "isthmus",
    forking: {
      url: BASE_RPC_URL,
      blockNumber: 49_372_240,
    },
  };
  // Immutable matured pre-execution state for the exact final withdrawal
  // proof. Latest Base is intentionally post-retirement and must not be used
  // to regenerate or replay the consumed Safe batch.
  optionalNetworks.baseLiquidityWithdrawalFork = {
    type: "edr-simulated",
    chainType: "op",
    allowUnlimitedContractSize: true,
    blockGasLimit: 60_000_000,
    hardfork: "isthmus",
    forking: {
      url: BASE_RPC_URL,
      blockNumber: 49_715_120,
    },
  };
}

if (BASE_STABILIZER_ARCHIVE_RPC_URL && BASE_STABILIZER_FORK_BLOCK !== null) {
  // Opt-in, exact historical snapshot for the read-only stabilizer EV proof.
  // It is intentionally separate from the latest-state Base fork so a generic
  // RPC cannot silently turn historical evidence into a current-head quote.
  optionalNetworks.baseStabilizerArchiveFork = {
    type: "edr-simulated",
    chainType: "op",
    chainId: 8453,
    allowUnlimitedContractSize: true,
    blockGasLimit: 60_000_000,
    hardfork: "isthmus",
    forking: {
      url: BASE_STABILIZER_ARCHIVE_RPC_URL,
      blockNumber: BASE_STABILIZER_FORK_BLOCK,
    },
  };
}

export default defineConfig({
  plugins: [
    hardhatMocha,
    hardhatEthers,
    hardhatEthersChaiMatchers,
    hardhatTypechain,
    hardhatVerify,
  ],
  solidity: {
    compilers: [
      {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          evmVersion: "cancun",
          viaIR: true,
        },
      },
    ],
    overrides: {
      "contracts/v4/NARAToken.sol": {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "cancun",
          viaIR: true,
        },
      },
      "contracts/v4/NARALauncher.sol": {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "cancun",
          viaIR: true,
        },
      },
      "contracts/v4/NARAEngine.sol": {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          metadata: {
            bytecodeHash: "none",
          },
          evmVersion: "cancun",
          viaIR: true,
        },
      },
      "contracts/v4/NARALiquidityGrowthHook.sol": {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "cancun",
          viaIR: true,
        },
      },
      "contracts/v4/NARALiquidityGrowthVault.sol": {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "cancun",
          viaIR: true,
        },
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    ...networks,
    ...optionalNetworks,
  },
  verify: {
    etherscan: {
      apiKey: process.env.BASESCAN_API_KEY ?? "",
    },
  },
  test: {
    mocha: {
      timeout: 120000,
    },
  },
});
