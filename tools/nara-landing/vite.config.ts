import { defineConfig } from "vite";
import { onRequest as onQuoteRequest } from "./functions/api/quote.js";
import { onRequest as onSupplyRequest } from "./functions/api/supply.js";
import {
  onRequestGet as onLeaderboardGet,
  onRequestHead as onLeaderboardHead,
  onRequestPost as onLeaderboardPost,
  onRequestOptions as onLeaderboardOptions,
} from "./functions/api/leaderboard.js";

function createDevKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const val = store.get(key);
      if (val === undefined) return null;
      return type === "json" ? JSON.parse(val) : val;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function readNodeRequestBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Single static page + Cloudflare Pages Functions (/api/leaderboard, /api/quote, /api/supply).
// Mounts dev/preview middleware so both `vite` and `vite preview` (`npm run test:smoke`) serve
// the real Pages Function handlers without 404 console errors.
function attachApiMiddleware(server: { middlewares: { use: (fn: any) => void } }) {
  const devLeaderboardKv = createDevKv();

  server.middlewares.use(async (req: any, res: any, next: () => void) => {
    const rawUrl = req.url || "";
    if (rawUrl === "/meme" || rawUrl === "/meme/" || rawUrl === "/meme.html") {
      res.writeHead(301, { Location: "/" });
      res.end();
      return;
    }
    if (rawUrl.startsWith("/api/leaderboard")) {
      try {
        const fullUrl = `http://${req.headers.host || "127.0.0.1:4173"}${rawUrl}`;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers || {})) {
          if (typeof v === "string") headers.set(k, v);
          else if (Array.isArray(v)) headers.set(k, v.join(", "));
        }
        if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", "127.0.0.1");
        const method = (req.method || "GET").toUpperCase();
        const body = method === "POST" ? await readNodeRequestBody(req) : undefined;
        const webReq = new Request(fullUrl, { method, headers, body });
        const env = {
          NARA_LEADERBOARD_KV: devLeaderboardKv,
          TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY || "",
          AWARD_ADMIN_TOKEN: process.env.AWARD_ADMIN_TOKEN || "",
          AWARD_CLAIM_SALT: process.env.AWARD_CLAIM_SALT || "",
        };
        const handler =
          method === "POST"
            ? onLeaderboardPost
            : method === "HEAD"
              ? onLeaderboardHead
              : method === "OPTIONS"
                ? onLeaderboardOptions
                : onLeaderboardGet;
        const webRes = await handler({ request: webReq, env });
        res.statusCode = webRes.status;
        webRes.headers.forEach((value: string, key: string) => {
          res.setHeader(key, value);
        });
        const buf = Buffer.from(await webRes.arrayBuffer());
        res.end(buf);
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "server_error" }));
      }
      return;
    }
    if (rawUrl.startsWith("/api/quote") || rawUrl.startsWith("/api/supply")) {
      try {
        const fullUrl = `http://${req.headers.host || "127.0.0.1:4173"}${rawUrl}`;
        const webReq = new Request(fullUrl, { method: req.method || "GET" });
        const handler = rawUrl.startsWith("/api/quote") ? onQuoteRequest : onSupplyRequest;
        const webRes = await handler({ request: webReq, env: {} });
        res.statusCode = webRes.status;
        webRes.headers.forEach((value: string, key: string) => {
          res.setHeader(key, value);
        });
        const buf = Buffer.from(await webRes.arrayBuffer());
        res.end(buf);
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "upstream_rpc_unavailable" }));
      }
      return;
    }
    next();
  });
}

export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: "nara-dev-routes",
      configureServer(server) {
        attachApiMiddleware(server);
      },
      configurePreviewServer(server) {
        attachApiMiddleware(server);
      },
    },
  ],
  build: {
    sourcemap: false,
    minify: "esbuild",
    target: "es2020",
  },
  esbuild: {
    // Keep console.error in production: bindActions() uses it to report broken data-on-* bindings.
    drop: ["debugger"],
    pure: mode === "production" ? ["console.log", "console.debug", "console.info", "console.warn"] : [],
  },
  server: { port: 5180, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1", strictPort: true },
}));
