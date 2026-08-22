import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  base as baseWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  uniswapWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { http, fallback } from "viem";

import App from "./app";
import { initializeTelemetry } from "./telemetry";
import { resolveReownProjectId } from "./wallets";
import "@rainbow-me/rainbowkit/styles.css";
import "./styles.css";

const reownProjectId = resolveReownProjectId(import.meta.env);
const projectId = reownProjectId || "00000000000000000000000000000000";
const rpcUrl = import.meta.env.VITE_BASE_RPC_URL?.trim() || "/base-rpc";

// Keep the legacy mobile/extension EOA route separate from the passkey-powered
// Base Account route. This prevents "Coinbase Wallet" from silently opening a
// second smart-wallet session when a user explicitly chooses the fallback.
coinbaseWallet.preference = "eoaOnly";

const walletAppFallbacks = reownProjectId
  ? [coinbaseWallet, uniswapWallet, walletConnectWallet]
  : [coinbaseWallet];

const connectors = connectorsForWallets(
  [
    { groupName: "Wallet apps", wallets: walletAppFallbacks },
    { groupName: "Base Account (passkey)", wallets: [baseWallet] },
    { groupName: "Browser wallets", wallets: [metaMaskWallet, injectedWallet] },
  ],
  { appName: "NARA v4 Test Console", projectId },
);

const transport = fallback([
  http(rpcUrl, { batch: { batchSize: 50, wait: 12 } }),
  http("https://mainnet.base.org", { batch: { batchSize: 50, wait: 12 } }),
  http("https://base.publicnode.com", { batch: { batchSize: 50, wait: 12 } }),
  http("https://1rpc.io/base", { batch: { batchSize: 50, wait: 12 } }),
]);

const config = createConfig({
  connectors,
  chains: [base],
  transports: {
    [base.id]: transport,
  },
});


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
});

// Load the third-party SDK only when a maintainer intentionally configures a
// public DSN. The default preview build sends no telemetry.
void initializeTelemetry(import.meta.env);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
