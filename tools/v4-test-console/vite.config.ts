import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appDirectory, "../..");

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, repositoryRoot, "");
  const reownProjectId = process.env.VITE_REOWN_PROJECT_ID
    || process.env.VITE_WALLETCONNECT_PROJECT_ID
    || process.env.VITE_RAINBOW_PROJECT_ID
    || rootEnv.VITE_REOWN_PROJECT_ID
    || rootEnv.VITE_WALLETCONNECT_PROJECT_ID
    || rootEnv.VITE_RAINBOW_PROJECT_ID
    || "";
  const rawRpc = rootEnv.BASE_MAINNET_RPC_URL || rootEnv.BASE_RPC_URL || "https://mainnet.base.org";
  const proxy = (() => {
    const upstream = new URL(rawRpc);
    const upstreamPath = `${upstream.pathname}${upstream.search}`;
    return {
      "/base-rpc": {
        target: upstream.origin,
        changeOrigin: true,
        secure: true,
        rewrite: () => upstreamPath || "/",
      },
    };
  })();


  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_REOWN_PROJECT_ID": JSON.stringify(reownProjectId),
    },
    server: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: true,
      proxy,
    },
    preview: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: true,
      proxy,
    },
  };
});
