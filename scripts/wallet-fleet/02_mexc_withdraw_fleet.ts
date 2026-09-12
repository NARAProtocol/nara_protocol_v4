import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FLEET_FILE = path.join(__dirname, ".fleet-wallets.json");
const WITHDRAW_LOG_FILE = path.join(__dirname, "mexc_withdraw_log.json");

const MEXC_API_KEY = process.env.MEXC_API_KEY?.trim() || "";
const MEXC_API_SECRET = process.env.MEXC_API_SECRET?.trim() || "";
const MEXC_BASE_URL = "https://api.mexc.com";

// Configuration via environment or defaults
const WITHDRAW_COIN = process.env.MEXC_WITHDRAW_COIN?.trim() || "USDC";
const WITHDRAW_NETWORK = process.env.MEXC_WITHDRAW_NETWORK?.trim() || "Base";
const AMOUNT_PER_WALLET = process.env.MEXC_WITHDRAW_AMOUNT?.trim() || "10";
const DELAY_BETWEEN_REQUESTS_MS = Number(process.env.MEXC_REQUEST_DELAY_MS || "3000");

function sign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function requestMexc(endpoint: string, params: Record<string, string>): Promise<any> {
  const timestamp = Date.now().toString();
  const allParams = { ...params, timestamp, recvWindow: "10000" };
  const queryString = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const signature = sign(queryString, MEXC_API_SECRET);
  const fullUrl = `${MEXC_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "X-MEXC-APIKEY": MEXC_API_KEY,
      "Content-Type": "application/json",
    },
  });

  const body = await response.json();
  if (!response.ok || body.code !== undefined && body.code !== 200 && body.code !== 0) {
    throw new Error(`MEXC API Error (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

export async function main() {
  const isExecute = process.argv.includes("--execute");

  if (!fs.existsSync(FLEET_FILE)) {
    throw new Error(`Fleet keystore ${FLEET_FILE} not found. Run '01_generate_fleet.ts' first.`);
  }

  const fleetData = JSON.parse(fs.readFileSync(FLEET_FILE, "utf8"));
  const wallets = fleetData.wallets as Array<{ index: number; address: string }>;

  console.log("================================================================================");
  console.log("?? MEXC FLEET BATCH WITHDRAWAL ENGINE");
  console.log("================================================================================");
  console.log(`Asset:            ${WITHDRAW_COIN}`);
  console.log(`Network:          ${WITHDRAW_NETWORK}`);
  console.log(`Amount / Wallet:  ${AMOUNT_PER_WALLET} ${WITHDRAW_COIN}`);
  console.log(`Total Wallets:    ${wallets.length}`);
  console.log(`Total Dispersal:  ${Number(AMOUNT_PER_WALLET) * wallets.length} ${WITHDRAW_COIN}`);
  console.log(`Mode:             ${isExecute ? "?? LIVE EXECUTION" : "?? DRY RUN (Pass --execute to submit)"}`);
  console.log("================================================================================\n");

  if (!isExecute) {
    console.log("Dry run completed. Verify your parameters above and run with --execute to broadcast.");
    return;
  }

  if (!MEXC_API_KEY || !MEXC_API_SECRET) {
    throw new Error("Missing MEXC_API_KEY or MEXC_API_SECRET in environment variables");
  }

  const logs: Array<{ index: number; address: string; amount: string; id?: string; error?: string; timestamp: string }> = [];

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    console.log(`[${i + 1}/${wallets.length}] Submitting withdrawal of ${AMOUNT_PER_WALLET} ${WITHDRAW_COIN} to ${w.address}...`);

    try {
      const res = await requestMexc("/api/v3/capital/withdraw/apply", {
        coin: WITHDRAW_COIN,
        netWork: WITHDRAW_NETWORK,
        address: w.address,
        amount: AMOUNT_PER_WALLET,
      });

      const withdrawId = res.id || res.data?.id || "submitted";
      console.log(`  ? Success! MEXC Withdrawal ID: ${withdrawId}`);
      logs.push({ index: w.index, address: w.address, amount: AMOUNT_PER_WALLET, id: withdrawId, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error(`  ? Failed: ${err.message}`);
      logs.push({ index: w.index, address: w.address, amount: AMOUNT_PER_WALLET, error: err.message, timestamp: new Date().toISOString() });
    }

    fs.writeFileSync(WITHDRAW_LOG_FILE, JSON.stringify(logs, null, 2));

    if (i < wallets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
    }
  }

  console.log(`\n?? All withdrawal requests processed. Detailed log saved to: ${WITHDRAW_LOG_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
