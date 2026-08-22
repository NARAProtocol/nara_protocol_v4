import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

const previewUrl = process.argv[2];
if (!previewUrl) {
  throw new Error("Usage: npm run check:preview -- https://<project>.pages.dev");
}

const parsedPreviewUrl = new URL(previewUrl);
if (parsedPreviewUrl.protocol !== "https:") {
  throw new Error("The preview smoke test requires an HTTPS URL.");
}
const rpcEndpoint = new URL("/base-rpc", parsedPreviewUrl).href;
const pageEndpoint = new URL("/", parsedPreviewUrl).href;

const chromeCandidates = [
  join(process.env.ProgramFiles || "", "Google/Chrome/Application/chrome.exe"),
  join(process.env["ProgramFiles(x86)"] || "", "Google/Chrome/Application/chrome.exe"),
  join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  join(process.env.ProgramFiles || "", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
];
const chromePath = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
if (!chromePath) throw new Error("Chrome or Edge is required for the live preview smoke test.");

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const temporaryRoot = realpathSync(tmpdir());
const profileDirectory = mkdtempSync(join(temporaryRoot, "nara-console-preview-"));
const browser = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--ignore-certificate-errors",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDirectory}`,
  previewUrl,
], {
  stdio: "ignore",
  windowsHide: true,
});

async function waitForDevTools() {
  const portFile = join(profileDirectory, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, "utf8").trim().split(/\r?\n/);
      if (port) return port;
    }
    if (browser.exitCode !== null) throw new Error("The headless browser exited before opening DevTools.");
    await delay(100);
  }
  throw new Error("Timed out while starting the headless browser.");
}

async function findPageTarget(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const target = targets.find((entry) => entry.type === "page" && entry.url.startsWith(previewUrl));
    if (target) return target;
    await delay(100);
  }
  throw new Error("The preview page did not open in the headless browser.");
}

let socket;
try {
  const port = await waitForDevTools();
  const target = await findPageTarget(port);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolveCall, rejectCall } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectCall(new Error(message.error.message));
    else resolveCall(message.result);
  });

  const call = (method, params = {}) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCall, rejectCall) => {
      pending.set(id, { resolveCall, rejectCall });
    });
  };
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const originalFetch = window.fetch.bind(window);
      window.__naraRpcLog = [];
      window.fetch = async (input, init = {}) => {
        const requestUrl = typeof input === 'string' ? input : input?.url || '';
        const isRpc = requestUrl === '/base-rpc' || requestUrl.endsWith('/base-rpc');
        let methods = [];
        if (isRpc && typeof init.body === 'string') {
          try {
            const payload = JSON.parse(init.body);
            methods = (Array.isArray(payload) ? payload : [payload]).map((entry) => entry?.method || 'invalid');
          } catch {}
        }
        try {
          const response = await originalFetch(input, init);
          if (isRpc) {
            let error = '';
            try {
              const body = await response.clone().json();
              const entries = Array.isArray(body) ? body : [body];
              error = entries.map((entry) => entry?.error?.message).filter(Boolean).join(' | ');
            } catch {}
            window.__naraRpcLog.push({methods, status: response.status, error});
          }
          return response;
        } catch (error) {
          if (isRpc) window.__naraRpcLog.push({methods, status: 0, error: error?.message || 'fetch failed'});
          throw error;
        }
      };
    })();`,
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  await call("Page.navigate", { url: previewUrl });
  let navigationState;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await delay(100);
    try {
      navigationState = await evaluate(`({
        href: location.href,
        origin: location.origin,
        readyState: document.readyState
      })`);
    } catch {
      continue;
    }
    if (navigationState.origin === parsedPreviewUrl.origin && navigationState.readyState === "complete") break;
  }
  if (navigationState?.origin !== parsedPreviewUrl.origin || navigationState.readyState !== "complete") {
    throw new Error(`The preview page did not finish navigation (current URL: ${navigationState?.href || "unknown"}).`);
  }

  const readResult = await evaluate(`fetch(${JSON.stringify(rpcEndpoint)}, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc:'2.0', id:1, method:'eth_chainId', params:[]})
  }).then(async response => ({status: response.status, body: await response.json()}))`);
  const blockedResult = await evaluate(`fetch(${JSON.stringify(rpcEndpoint)}, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc:'2.0', id:2, method:'eth_sendRawTransaction', params:['0xdeadbeef']})
  }).then(async response => ({status: response.status, body: await response.json()}))`);
  const headerResult = await evaluate(`fetch(${JSON.stringify(pageEndpoint)}, {method:'HEAD'}).then(response => ({
    status: response.status,
    robots: response.headers.get('x-robots-tag'),
    frame: response.headers.get('x-frame-options')
  }))`);

  await call("Page.reload", { ignoreCache: true });
  let pageState;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(250);
    pageState = await evaluate(`({
      title: document.title,
      body: document.body?.innerText || '',
      robots: document.querySelector('meta[name="robots"]')?.content || ''
    })`);
    if (pageState.body.includes("Core bytecode verified") && /Current epoch\s+\d+/.test(pageState.body)) break;
  }

  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = resolve("mobile-preview.png");
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  const rpcLog = await evaluate("window.__naraRpcLog || []");

  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const qrState = await evaluate(`(() => {
    window.scrollTo(0, 0);
    const details = document.querySelector('.mobile-handoff');
    if (details) details.open = true;
    const image = document.querySelector('.mobile-handoff-panel img');
    return {
      visible: Boolean(details) && getComputedStyle(details).display !== 'none',
      open: Boolean(details?.open),
      loaded: Boolean(image?.complete && image?.naturalWidth > 0),
      source: image?.getAttribute('src') || ''
    };
  })()`);
  await delay(200);
  const desktopScreenshot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const desktopScreenshotPath = resolve("desktop-qr-preview.png");
  writeFileSync(desktopScreenshotPath, Buffer.from(desktopScreenshot.data, "base64"));

  console.log(`Browser: ${basename(chromePath)}`);
  console.log(`Page: HTTP ${headerResult.status}; ${pageState.title}`);
  console.log(`Security headers: robots=${headerResult.robots}; frame=${headerResult.frame}`);
  console.log(`Read-only RPC: HTTP ${readResult.status}; chain ID ${readResult.body.result || "missing"}`);
  console.log(`Transaction RPC method: HTTP ${blockedResult.status}`);
  console.log(`Core bytecode verified: ${pageState.body.includes("Core bytecode verified")}`);
  console.log(`Protocol overview loaded: ${/Current epoch\s+\d+/.test(pageState.body)}`);
  if (!pageState.body.includes("Core bytecode verified") || !/Current epoch\s+\d+/.test(pageState.body)) {
    console.log(`Observed RPC calls: ${JSON.stringify(rpcLog)}`);
  }
  console.log(`Mobile screenshot: ${screenshotPath}`);
  console.log(`QR handoff ready: ${qrState.visible && qrState.open && qrState.loaded}`);
  console.log(`Desktop QR screenshot: ${desktopScreenshotPath}`);

  if (headerResult.status !== 200) throw new Error("The preview page did not return HTTP 200.");
  if (headerResult.robots !== "noindex, nofollow, noarchive") throw new Error("The preview no-index header is missing.");
  if (headerResult.frame !== "DENY") throw new Error("The preview frame-blocking header is missing.");
  if (readResult.status !== 200 || readResult.body.result !== "0x2105") throw new Error("The Base RPC read check failed.");
  if (blockedResult.status !== 403) throw new Error("The RPC write-method guard failed.");
  if (!pageState.body.includes("Core bytecode verified")) throw new Error("The live core bytecode check did not pass.");
  if (!/Current epoch\s+\d+/.test(pageState.body)) throw new Error("The live protocol overview did not load.");
  if (!qrState.visible || !qrState.open || !qrState.loaded || qrState.source !== "/mobile-preview-qr.svg") {
    throw new Error("The desktop QR handoff did not load correctly.");
  }
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser.exitCode === null) browser.kill();
  await delay(500);

  const relativeProfile = relative(temporaryRoot, profileDirectory);
  if (relativeProfile && !relativeProfile.startsWith(`..${sep}`) && relativeProfile !== "..") {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
}
