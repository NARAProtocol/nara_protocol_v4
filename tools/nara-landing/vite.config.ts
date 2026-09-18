import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    plugins: [
      react(),
      {
        name: "route-rewrites",
        configureServer(server) {
          server.middlewares.use((req: any, res: any, next: () => void) => {
            if (req.url === "/meme" || req.url === "/meme/") {
              res.writeHead(302, { Location: "/" });
              res.end();
              return;
            }
            if (req.url === "/swap" || req.url === "/swap/") {
              res.writeHead(302, { Location: "/swap.html" });
              res.end();
              return;
            }
            if (req.url === "/api/leaderboard" || req.url?.startsWith("/api/leaderboard")) {
              res.setHeader("Content-Type", "application/json");
              if (req.method === "POST") {
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", () => {
                  res.writeHead(200);
                  res.end(JSON.stringify({ ok: true }));
                });
                return;
              }
              res.writeHead(200);
              res.end(JSON.stringify([
                { rank: 1, handle: "@Satoshi_Plunger", score: 31, tier: "GOD-TIER PORCELAIN DEITY", date: "Dec 2024" },
                { rank: 2, handle: "@Vitalik_Roll", score: 38, tier: "ELITE SEWER TACTICIAN", date: "Jan 2025" },
                { rank: 3, handle: "@Base_General", score: 44, tier: "ELITE SEWER TACTICIAN", date: "Feb 2025" },
                { rank: 4, handle: "@Degen_Harvester", score: 51, tier: "CERTIFIED PURGER", date: "Feb 2025" },
                { rank: 5, handle: "@Sewer_Sniper", score: 59, tier: "CERTIFIED PURGER", date: "Mar 2025" }
              ]));
              return;
            }
            next();
          });
        },
      },
    ],
    build: {
      sourcemap: false,
      minify: "esbuild",
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          swap: path.resolve(__dirname, "swap.html"),
        },
      },
    },
    esbuild: {
      drop: isProd ? ["console", "debugger"] : [],
    },
    define: {
      global: "globalThis",
    },
    server: { port: 5180, host: "127.0.0.1" },
  };
});


