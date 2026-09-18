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
            const devLeaderboard: any[] = [];
            if (req.url === "/api/leaderboard" || req.url?.startsWith("/api/leaderboard")) {
              res.setHeader("Content-Type", "application/json");
              if (req.method === "POST") {
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", () => {
                  try {
                    const data = JSON.parse(body);
                    if (data && data.handle) {
                      devLeaderboard.push({
                        rank: devLeaderboard.length + 1,
                        handle: data.handle,
                        score: data.score,
                        tier: data.tier || "CERTIFIED PURGER",
                        date: "TODAY"
                      });
                      devLeaderboard.sort((a, b) => a.score - b.score);
                      devLeaderboard.forEach((item, idx) => { item.rank = idx + 1; });
                    }
                  } catch (e) {}
                  res.writeHead(200);
                  res.end(JSON.stringify({ ok: true, list: devLeaderboard }));
                });
                return;
              }
              res.writeHead(200);
              res.end(JSON.stringify(devLeaderboard));
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


