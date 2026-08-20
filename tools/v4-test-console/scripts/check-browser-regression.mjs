import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteBinary = join(appDirectory, "node_modules", "vite", "bin", "vite.js");
const baseUrl = process.env.NARA_CONSOLE_BROWSER_URL || "http://127.0.0.1:4174";
const failureArtifacts = mkdtempSync(join(tmpdir(), "nara-console-browser-"));
const serverOutput = [];

if (!existsSync(viteBinary)) throw new Error("Install console dependencies before running the browser regression.");

const server = spawn(process.execPath, [viteBinary, "preview", "--host", "127.0.0.1", "--port", "4174", "--strictPort"], {
  cwd: appDirectory,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
server.stdout.on("data", (chunk) => serverOutput.push(String(chunk).slice(0, 1000)));
server.stderr.on("data", (chunk) => serverOutput.push(String(chunk).slice(0, 1000)));

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite preview exited early. ${serverOutput.join(" ")}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Timed out waiting for the local NARA console preview.");
}

async function launchBrowser() {
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch(channel ? { channel, headless: true } : { headless: true });
    } catch (error) {
      if (channel === undefined) throw error;
    }
  }
  throw new Error("Chrome, Edge, or Playwright Chromium is required.");
}

const failures = [];
let browser;
try {
  await waitForServer();
  browser = await launchBrowser();
  for (const profile of [
    { name: "mobile", viewport: { width: 390, height: 844 } },
    { name: "desktop", viewport: { width: 1440, height: 1000 } },
  ]) {
    const page = await browser.newPage({ viewport: profile.viewport });
    const errors = [];
    const broadcastMethods = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location().url;
        if (location.endsWith("/favicon.ico") && /404/.test(message.text())) return;
        errors.push(location ? `${message.text()} (${location})` : message.text());
      }
    });
    page.on("request", (request) => {
      const body = request.postData() || "";
      for (const match of body.matchAll(/"method"\s*:\s*"(eth_sendRawTransaction|eth_sendTransaction)"/g)) {
        broadcastMethods.push(match[1]);
      }
    });

    try {
      const response = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45_000 });
      if (!response?.ok()) failures.push(`${profile.name}: HTTP ${response?.status()}`);
      await page.getByRole("button", { name: "NARAswap" }).click();
      await page.getByRole("heading", { name: "NARAswap", exact: true }).waitFor();
      await page.getByRole("group", { name: "Trade direction" }).waitFor();
      await page.getByRole("button", { name: /Connect wallet to continue/i }).waitFor();
      await page.getByText(/Nothing signs automatically/i).waitFor();

      const overlay = await page.locator(".vite-error-overlay, #webpack-dev-server-client-overlay").count();
      const blank = (await page.locator("body").innerText()).trim().length < 200;
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      if (overlay) failures.push(`${profile.name}: development error overlay is visible`);
      if (blank) failures.push(`${profile.name}: page content is unexpectedly blank`);
      if (profile.name === "mobile" && horizontalOverflow) failures.push("mobile: document overflows horizontally");
      if (broadcastMethods.length) failures.push(`${profile.name}: automated page attempted ${broadcastMethods.join(", ")}`);
      if (errors.length) failures.push(`${profile.name}: ${errors.join(" | ")}`);
    } catch (error) {
      const screenshot = join(failureArtifacts, `nara-console-${profile.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
      failures.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)} (screenshot ${screenshot})`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
  if (failures.length === 0) rmSync(failureArtifacts, { recursive: true, force: true });
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("browser regression passed: mobile, desktop, NARAswap shell, review copy, overflow, console, and no broadcast methods\n");
}
