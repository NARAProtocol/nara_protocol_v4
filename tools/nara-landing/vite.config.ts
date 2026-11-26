import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { onRequest as onQuoteRequest } from "./functions/api/quote.js";
import { onRequest as onSupplyRequest } from "./functions/api/supply.js";
import { handleWebauthnRequest } from "./functions/_shared/webauthnCore.js";
import {
  onRequestGet as onLeaderboardGet,
  onRequestHead as onLeaderboardHead,
  onRequestPost as onLeaderboardPost,
  onRequestOptions as onLeaderboardOptions,
} from "./functions/api/leaderboard.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

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

// Multi-page static site (index.html + vault.html) + Cloudflare Pages Functions (/api/*).
// Mounts dev/preview middleware so both `vite` and `vite preview` (`npm run test:smoke`) serve
// clean routes (/vault, /s/vault) and the real Pages Function handlers without 404 console errors.
function attachApiMiddleware(server: { middlewares: { use: (fn: any) => void } }) {
  const devLeaderboardKv = createDevKv();

  server.middlewares.use(async (req: any, res: any, next: () => void) => {
    const rawUrl = req.url || "";
    const qIdx = rawUrl.indexOf("?");
    const pathname = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
    const search = qIdx === -1 ? "" : rawUrl.slice(qIdx);

    if (pathname === "/meme" || pathname === "/meme/" || pathname === "/meme.html") {
      res.writeHead(301, { Location: "/" });
      res.end();
      return;
    }
    if (pathname === "/vault" || pathname === "/vault/") {
      req.url = `/vault.html${search}`;
      next();
      return;
    }
    if (pathname === "/privacy" || pathname === "/privacy/") {
      req.url = `/privacy.html${search}`;
      next();
      return;
    }
    if (pathname === "/terms" || pathname === "/terms/") {
      req.url = `/terms.html${search}`;
      next();
      return;
    }
    if (pathname === "/accessibility" || pathname === "/accessibility/") {
      req.url = `/accessibility.html${search}`;
      next();
      return;
    }
    if (pathname === "/s/vault" || pathname === "/s/vault/") {
      req.url = `/s/vault.html${search}`;
      next();
      return;
    }
    if (pathname === "/.well-known/webauthn") {
      try {
        const fullUrl = `http://${req.headers.host || "127.0.0.1:4173"}${rawUrl}`;
        const webReq = new Request(fullUrl, { method: req.method || "GET" });
        const webRes = handleWebauthnRequest(webReq);
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
      closeBundle() {
        const builtVault = path.join(ROOT_DIR, "dist", "vault.html");
        const vaultDir = path.join(ROOT_DIR, "dist", "vault");
        if (fs.existsSync(builtVault)) {
          fs.mkdirSync(vaultDir, { recursive: true });
          fs.copyFileSync(builtVault, path.join(vaultDir, "index.html"));
        }
      },
    },
  ],
  build: {
    sourcemap: false,
    minify: "esbuild",
    target: "es2020",
    rollupOptions: {
      input: {
        main: path.join(ROOT_DIR, "index.html"),
        vault: path.join(ROOT_DIR, "vault.html"),
      },
    },
  },
  esbuild: {
    // Keep console.error in production: bindActions() uses it to report broken data-on-* bindings.
    drop: ["debugger"],
    pure: mode === "production" ? ["console.log", "console.debug", "console.info", "console.warn"] : [],
  },
  server: { port: 5180, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1", strictPort: true },
}));
