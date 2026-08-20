import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const swapRoot = resolve(appDirectory, "swap-site");
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
  const rawRpc = rootEnv.BASE_MAINNET_RPC_URL || rootEnv.BASE_RPC_URL;
  const proxy = rawRpc ? (() => {
    const upstream = new URL(rawRpc);
    const upstreamPath = `${upstream.pathname}${upstream.search}`;
    return {
      "/base-rpc": {
        target: upstream.origin,
        changeOrigin: true,
        secure: true,
        rewrite: () => upstreamPath,
      },
    };
  })() : undefined;

  return {
    root: swapRoot,
    publicDir: resolve(appDirectory, "public"),
    plugins: [react()],
    define: {
      "import.meta.env.VITE_REOWN_PROJECT_ID": JSON.stringify(reownProjectId),
    },
    build: {
      outDir: resolve(appDirectory, "dist-swap"),
      emptyOutDir: true,
    },
    server: {
      host: "127.0.0.1",
      port: 4175,
      strictPort: true,
      proxy,
    },
    preview: {
      host: "127.0.0.1",
      port: 4175,
      strictPort: true,
      proxy,
    },
  };
});
