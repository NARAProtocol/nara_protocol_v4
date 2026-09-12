import injectedModule from "@web3-onboard/injected-wallets";
import walletConnectModule from "@web3-onboard/walletconnect";
import { init } from "@web3-onboard/react";
import { NARA_MASTER_LOGO_SVG } from "./content";

// Project ID from env or public fallback
const WC_PROJECT_ID =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env &&
    (import.meta as any).env.VITE_WALLETCONNECT_PROJECT_ID) ||
  "b03ed6d8451c1e05022897815db0ad0b";

const injected = injectedModule();

const wc = walletConnectModule({
  projectId: WC_PROJECT_ID,
  requiredChains: [8453],
  optionalChains: [1],
  dappUrl: "https://naraprotocol.pro",
});

export const BASE_CHAIN_ID_DECIMAL = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105";

export const onboard = init({
  wallets: [injected, wc],
  chains: [
    {
      id: BASE_CHAIN_ID_HEX,
      token: "ETH",
      label: "Base",
      rpcUrl: "https://mainnet.base.org",
      namespace: "evm",
    },
  ],
  appMetadata: {
    name: "NARA DEX",
    icon: NARA_MASTER_LOGO_SVG,
    description: "NARA Fixed-Supply DEX & Aggregator on Base",
    recommendedInjectedWallets: [
      { name: "MetaMask", url: "https://metamask.io" },
      { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet" },
      { name: "Rabby", url: "https://rabby.io" },
    ],
  },
  connect: {
    autoConnectLastWallet: true,
  },
  accountCenter: {
    desktop: { enabled: false },
    mobile: { enabled: false },
  },
  theme: {
    "--w3o-background-color": "#060913",
    "--w3o-foreground-color": "#0d1527",
    "--w3o-text-color": "#ffffff",
    "--w3o-border-color": "rgba(79, 216, 255, 0.25)",
    "--w3o-action-color": "#00f0ff",
    "--w3o-border-radius": "4px",
    "--w3o-font-family": "'JetBrains Mono', monospace",
  },
});
