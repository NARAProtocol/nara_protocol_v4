import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  uniswapWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, createStorage } from "wagmi";
import { base } from "wagmi/chains";
import { http } from "viem";

import { resolveReownProjectId } from "../../src/wallets";
import SwapApp from "./swap-app";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles.css";

const reownProjectId = resolveReownProjectId(import.meta.env);
const projectId = reownProjectId || "00000000000000000000000000000000";
const rpcUrl = import.meta.env.VITE_BASE_RPC_URL?.trim() || "/base-rpc";

// This connector is intentionally EOA-only. The separate Base Account/passkey
// connector is omitted because its hosted mobile signer failed before broadcast
// during the current production test. It stays available in the internal console.
coinbaseWallet.preference = "eoaOnly";

const walletApps = reownProjectId
  ? [coinbaseWallet, uniswapWallet, walletConnectWallet]
  : [coinbaseWallet];

const connectors = connectorsForWallets(
  [
    { groupName: "Wallet apps", wallets: walletApps },
    { groupName: "Browser wallets", wallets: [metaMaskWallet, injectedWallet] },
  ],
  { appName: "NARA Swap", projectId },
);

const config = createConfig({
  connectors,
  chains: [base],
  storage: createStorage({
    key: "nara-swap-preview",
    storage: window.localStorage,
  }),
  transports: {
    [base.id]: http(rpcUrl, { batch: { batchSize: 50, wait: 12 } }),
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <SwapApp />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
