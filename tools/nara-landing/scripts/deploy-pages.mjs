#!/usr/bin/env node
// Deterministic Cloudflare Pages deploy wrapper for nara-landing.
// Ensures VITE_TURNSTILE_SITE_KEY is baked into the Vite bundle before uploading dist/.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_TURNSTILE_SITE_KEY = "0x4AAAAAAFw9wVG5-tTcQGo1";
const branchArg = process.argv[2] === "main" ? "main" : "preview";
const siteKey = (process.env.VITE_TURNSTILE_SITE_KEY || DEFAULT_TURNSTILE_SITE_KEY).trim();

if (!siteKey || !siteKey.startsWith("0x4")) {
  console.error("deploy-pages: refusing deploy without a valid VITE_TURNSTILE_SITE_KEY.");
  process.exit(1);
}

const env = { ...process.env, VITE_TURNSTILE_SITE_KEY: siteKey };

console.log(`deploy-pages: running check + build for branch=${branchArg} (sitekey=${siteKey})...`);
execSync("npm run check", { stdio: "inherit", env });

const assetsDir = path.resolve("dist", "assets");
const jsFiles = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js"))
  : [];

const hasSiteKeyInBundle = jsFiles.some((f) =>
  fs.readFileSync(path.join(assetsDir, f), "utf8").includes(siteKey)
);

if (!hasSiteKeyInBundle) {
  console.error(`deploy-pages: built JS bundle in dist/assets does not contain ${siteKey}. Aborting!`);
  process.exit(1);
}

console.log(`deploy-pages: bundle verified. Uploading dist/ to Cloudflare Pages (branch=${branchArg})...`);
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const res = spawnSync(
  npxCmd,
  ["wrangler", "pages", "deploy", "dist", "--project-name", "nara-landing", "--branch", branchArg],
  { stdio: "inherit", env, shell: process.platform === "win32" }
);

if (res.status !== 0) {
  process.exit(res.status || 1);
}
