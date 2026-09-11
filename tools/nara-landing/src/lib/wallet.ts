/**
 * Web3-Onboard wallet bootstrap for Base mainnet.
 */
import { init } from "@web3-onboard/react";
import injectedModule from "@web3-onboard/injected-wallets";
import walletConnectModule from "@web3-onboard/walletconnect";
import { BASE_CHAIN_ID, DEFAULT_BASE_RPC } from "./gridContracts";

const injected = injectedModule();

const wcProjectId =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID) ||
  "00000000000000000000000000000000";

const walletConnect = walletConnectModule({
  projectId: wcProjectId,
  requiredChains: [BASE_CHAIN_ID],
  dappUrl: "https://naraprotocol.pro",
});

export const onboard = init({
  wallets: [injected, walletConnect],
  chains: [
    {
      id: "0x2105",
      token: "ETH",
      label: "Base",
      rpcUrl: DEFAULT_BASE_RPC,
    },
  ],
  appMetadata: {
    name: "NARA Protocol",
    icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='#00F0FF'/></svg>",
    description: "Sovereign Grid on Base",
    recommendedInjectedWallets: [
      { name: "MetaMask", url: "https://metamask.io" },
      { name: "Rabby", url: "https://rabby.io" },
    ],
  },
  accountCenter: { desktop: { enabled: false }, mobile: { enabled: false } },
  theme: "dark",
});
