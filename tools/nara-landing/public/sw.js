/**
 * NARA landing offline service worker.
 *
 * Scope: keep the home shell (game, fonts, flush SFX, hashed bundles) available offline.
 * Every other navigation (/swap, /app, /docs, /github, /audit, /research/*, /s/*, 404s)
 * and every /api/* call goes straight to the network, so Cloudflare Pages redirects and
 * the leaderboard Function behave exactly as they do without a service worker.
 */

const CACHE_NAME = "nara-landing-shell-v20261109b";
const SHELL_KEY = "/";

// Only paths that exist and answer 200 directly. Never list "/index.html": Cloudflare Pages
// answers it with a 308 to "/", and cache.add() of that redirected response stalls the install
// in Chrome, leaving the worker stuck in "installing" and never activating (verified 2026-11-09).
const PRECACHE_ASSETS = [
  "/",
  "/site.webmanifest",
  "/favicon.svg",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/apple-touch-icon.png",
  "/nara_meme_hero.jpg",
  "/flush.mp3",
  "/fonts/JetBrainsMono-latin.woff2",
  "/fonts/SpaceGrotesk-latin.woff2",
];

function isShellNavigation(url) {
  return url.pathname === "/" || url.pathname === "/index.html";
}

function isCacheable(response) {
  // 200 only: a 206 (range request for audio) or a redirect must never be stored as the asset.
  return !!response && response.status === 200 && response.type === "basic";
}

async function precacheShellBundles(cache) {
  try {
    const shell = await cache.match(SHELL_KEY);
    if (!shell) return;
    const html = await shell.clone().text();
    const assets = [...new Set(html.match(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2?|png|jpe?g|svg|webp)/g) || [])];
    await Promise.all(assets.map((asset) => cache.add(new Request(asset, { cache: "reload" })).catch(() => {})));
  } catch {
    // Non-fatal: the shell still loads from the network.
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(PRECACHE_ASSETS.map((asset) => cache.add(new Request(asset, { cache: "reload" })).catch(() => {})));
      await precacheShellBundles(cache);
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/")) return;

  if (request.mode === "navigate") {
    // Only the home shell is served from cache when offline. Passing the original Request to
    // fetch() keeps navigation semantics (redirects are followed by the browser).
    if (!isShellNavigation(url)) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_KEY, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => (await caches.match(SHELL_KEY)) || new Response("Offline", { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain" } }))
    );
    return;
  }

  // Same-origin static assets: cache first, refresh in the background (stale-while-revalidate).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
      const network = fetch(request).then((response) => {
        if (isCacheable(response)) cache.put(request, response.clone()).catch(() => {});
        return response;
      });
      if (cached) {
        network.catch(() => {});
        return cached;
      }
      return network;
    })()
  );
});
