import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve("../.env");
  const hardhatEnvPath = resolve("../../nara-protocol-hardhat/.env");
  const directPath = existsSync(envPath) ? envPath : existsSync(hardhatEnvPath) ? hardhatEnvPath : resolve("../../.env");
  if (!existsSync(directPath)) {
    throw new Error("No .env found at " + directPath);
  }
  const text = readFileSync(directPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

async function run() {
  const env = loadEnv();
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN is missing in .env");
  }

  console.log("1. Verifying Cloudflare API token...");
  const verifyRes = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const verifyJson = await verifyRes.json();
  console.log("Token verification status:", verifyJson.success ? "VALID" : "INVALID", verifyJson.messages);

  if (!verifyJson.success) {
    console.error("Token verification failed:", verifyJson.errors);
    return;
  }

  console.log("2. Fetching Cloudflare accounts...");
  const accountsRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const accountsJson = await accountsRes.json();
  if (!accountsJson.success || accountsJson.result.length === 0) {
    console.error("No accounts found or error:", accountsJson.errors);
    return;
  }

  const account = accountsJson.result[0];
  console.log("Found Account:", account.name, `(${account.id.slice(0, 6)}…${account.id.slice(-4)})`);

  console.log("3. Inspecting Pages projects in account...");
  const pagesRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.id}/pages/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pagesJson = await pagesRes.json();
  const projectNames = (pagesJson.result || []).map((p) => p.name);
  console.log("Pages projects found:", projectNames);

  console.log("4. Checking DNS zones in account...");
  const zonesRes = await fetch(`https://api.cloudflare.com/client/v4/zones`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const zonesJson = await zonesRes.json();
  const zones = (zonesJson.result || []).map((z) => ({ id: z.id, name: z.name, status: z.status }));
  console.log("DNS Zones found:", zones);

  const projectName = "nara-v4-console-preview";
  if (!projectNames.includes(projectName)) {
    console.log(`Pages project '${projectName}' not found in project list.`);
  } else {
    console.log(`5. Checking custom domains attached to '${projectName}'...`);
    const domainsRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account.id}/pages/projects/${projectName}/domains`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const domainsJson = await domainsRes.json();
    console.log("Existing custom domains:", (domainsJson.result || []).map((d) => d.name));
  }
}

run().catch((err) => console.error("Execution error:", err.message));
