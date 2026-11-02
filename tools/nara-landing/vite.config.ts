import { defineConfig } from "vite";

// Single static page + Cloudflare Pages Function (/api/leaderboard).
// _headers, _redirects and the Function only run on Pages (or `wrangler pages dev dist`);
// the dev middleware below only mimics the two routes the page touches.
export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: "nara-dev-routes",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || "";
          if (url === "/meme" || url === "/meme/" || url === "/meme.html") {
            res.writeHead(301, { Location: "/" });
            res.end();
            return;
          }
          if (url.startsWith("/api/leaderboard")) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            if (req.method === "POST") {
              res.writeHead(503);
              res.end(JSON.stringify({ error: "board_disabled" }));
              return;
            }
            res.writeHead(200);
            res.end("[]");
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
    target: "es2020",
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  server: { port: 5180, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1", strictPort: true },
}));
